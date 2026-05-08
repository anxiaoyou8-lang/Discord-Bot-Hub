import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type Client,
  type GuildTextBasedChannel,
  type TextChannel,
} from "discord.js";
import { db } from "@workspace/db";
import {
  artworksTable,
  artworkAccessLogsTable,
  artworkWatermarksTable,
  threadSubscriptionsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import {
  ARTWORK_GET_MODAL_PREFIX,
  ARTWORK_PASSWORD_INPUT,
  ARTWORK_GET_CUSTOM_ID,
  ARTWORK_SUBSCRIBE_PREFIX,
  ARTWORK_NOTIFY_BTN_PREFIX,
  ARTWORK_NOTIFY_MODAL_PREFIX,
  ARTWORK_NOTIFY_TEXT_INPUT,
} from "../constants.js";
import { getConfig, CONFIG_KEY_LOG_CHANNEL } from "../config.js";
import { encodeFileInfo, buildRenamedFilename } from "../filenameCodec.js";
import { generateTraceId, applyWatermark } from "../watermark.js";
import { saveFileToStorage, loadFileFromStorage, isStorageKey } from "../botStorage.js";

export function buildArtworkPanel() {
  const embed = new EmbedBuilder()
    .setTitle("作品展示区")
    .setDescription(
      [
        "欢迎来到作品展示区！",
        "",
        "**作者上传作品：**",
        "• 使用 `/upload_artwork` 指令上传你的作品（最多10个文件）",
        "• 上传时需设置作品名称、密码（可选备注）",
        "",
        "**获取作品：**",
        "• 在作品贴中点击 **获取作品** 按钮",
        "• 输入作者告知的密码",
        "• 并先对该频道第一条消息添加任意表情反应",
        "• 满足条件后即可收到仅你可见的作品原文件",
      ].join("\n")
    )
    .setColor(0x5865f2);

  return { embeds: [embed] };
}

function buildArtworkRow(messageId: string, channelId: string) {
  const getBtn = new ButtonBuilder()
    .setCustomId(`${ARTWORK_GET_CUSTOM_ID}${messageId}`)
    .setLabel("获取作品")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🎨");

  const subscribeBtn = new ButtonBuilder()
    .setCustomId(`${ARTWORK_SUBSCRIBE_PREFIX}${channelId}`)
    .setLabel("订阅此帖")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🔔");

  return new ActionRowBuilder<ButtonBuilder>().addComponents(getBtn, subscribeBtn);
}

export async function handleArtworkUpload(
  interaction: ChatInputCommandInteraction,
  _client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const title = interaction.options.getString("title", true);
  const password = interaction.options.getString("password", true);
  const description = interaction.options.getString("description");
  const guild = interaction.guild;

  if (!guild) {
    await interaction.editReply("此指令只能在服务器中使用。");
    return;
  }

  const attachments: Array<{ url: string; name: string }> = [];
  for (let i = 1; i <= 10; i++) {
    const att = interaction.options.getAttachment(i === 1 ? "file1" : `file${i}`);
    if (att) attachments.push({ url: att.url, name: att.name });
  }

  if (attachments.length === 0) {
    await interaction.editReply("请至少上传一个文件。");
    return;
  }

  try {
    const channel = interaction.channel as GuildTextBasedChannel | null;
    if (!channel) {
      await interaction.editReply("无法在此频道发布作品。");
      return;
    }

    await interaction.editReply(`正在保存文件（0/${attachments.length}）……`);

    const storageKeys: string[] = [];
    const fileNames: string[] = [];
    for (const att of attachments) {
      const res = await fetch(att.url);
      if (!res.ok) throw new Error(`无法下载文件 ${att.name}：HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const key = await saveFileToStorage(buf, att.name);
      storageKeys.push(key);
      fileNames.push(att.name);
      await interaction.editReply(`正在保存文件（${storageKeys.length}/${attachments.length}）……`);
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        [
          `**作者：** <@${interaction.user.id}>`,
          `**上传时间：** <t:${Math.floor(Date.now() / 1000)}:F>`,
          description ? `**备注：** ${description}` : null,
          `**文件数量：** ${storageKeys.length} 个`,
          "",
          "想获取原文件？点击下方按钮，输入密码并对频道第一条消息添加表情后即可获取。",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .setColor(0x5865f2)
      .setFooter({ text: "作品系统 · 请向作者询问密码" })
      .setTimestamp();

    const placeholderRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ARTWORK_GET_CUSTOM_ID}PLACEHOLDER`)
        .setLabel("获取作品")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎨"),
      new ButtonBuilder()
        .setCustomId(`${ARTWORK_SUBSCRIBE_PREFIX}${channel.id}`)
        .setLabel("订阅此帖")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🔔")
    );

    const msg = await channel.send({ embeds: [embed], components: [placeholderRow] });
    await msg.edit({ components: [buildArtworkRow(msg.id, channel.id)] });

    await db.insert(artworksTable).values({
      messageId: msg.id,
      channelId: channel.id,
      guildId: guild.id,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      title,
      description,
      password,
      fileUrls: storageKeys,
      fileNames,
    });

    await interaction.editReply(
      `作品《${title}》已成功发布！共 ${storageKeys.length} 个文件。`
    );

    // 检查此帖是否已有订阅者（说明是第二次以上上传），询问是否通知
    const subscribers = await db
      .select()
      .from(threadSubscriptionsTable)
      .where(eq(threadSubscriptionsTable.channelId, channel.id));

    if (subscribers.length > 0) {
      const notifyBtn = new ButtonBuilder()
        .setCustomId(`${ARTWORK_NOTIFY_BTN_PREFIX}${channel.id}`)
        .setLabel(`通知 ${subscribers.length} 位订阅者`)
        .setStyle(ButtonStyle.Success)
        .setEmoji("📢");

      const notifyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(notifyBtn);

      await interaction.followUp({
        content: `此帖有 **${subscribers.length}** 位订阅者，是否要发布更新通知？`,
        components: [notifyRow],
        flags: 64,
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to upload artwork");
    await interaction.editReply("上传失败，请稍后再试。");
  }
}

export async function handleArtworkSubscribe(
  interaction: ButtonInteraction,
  channelId: string
) {
  await interaction.deferReply({ flags: 64 });

  const userId = interaction.user.id;
  const guildId = interaction.guildId ?? "";

  try {
    const existing = await db
      .select()
      .from(threadSubscriptionsTable)
      .where(
        and(
          eq(threadSubscriptionsTable.channelId, channelId),
          eq(threadSubscriptionsTable.userId, userId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(threadSubscriptionsTable)
        .where(
          and(
            eq(threadSubscriptionsTable.channelId, channelId),
            eq(threadSubscriptionsTable.userId, userId)
          )
        );
      await interaction.editReply("🔕 已取消订阅，不再接收此帖更新通知。");
    } else {
      await db.insert(threadSubscriptionsTable).values({ channelId, userId, guildId });
      await interaction.editReply("🔔 订阅成功！作者发布新内容并选择通知时，你会在此帖收到 @ 提醒。");
    }
  } catch (err) {
    logger.error({ err }, "Failed to toggle subscription");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

export async function handleArtworkNotifyBtn(
  interaction: ButtonInteraction,
  channelId: string
) {
  const modal = new ModalBuilder()
    .setCustomId(`${ARTWORK_NOTIFY_MODAL_PREFIX}${channelId}`)
    .setTitle("通知订阅者");

  const textInput = new TextInputBuilder()
    .setCustomId(ARTWORK_NOTIFY_TEXT_INPUT)
    .setLabel("通知内容")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("例如：新的作品已上传，欢迎获取！")
    .setMaxLength(500)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));
  await interaction.showModal(modal);
}

export async function handleArtworkNotifyModal(
  interaction: ModalSubmitInteraction,
  channelId: string,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const content = interaction.fields.getTextInputValue(ARTWORK_NOTIFY_TEXT_INPUT);
  const guild = interaction.guild;

  if (!guild) {
    await interaction.editReply("此操作只能在服务器中使用。");
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      await interaction.editReply("找不到频道，请联系管理员。");
      return;
    }

    logger.info(
      { channelId, channelType: channel.type, isThread: channel.isThread() },
      "Notify modal: channel info"
    );

    const notifyEmbed = new EmbedBuilder()
      .setTitle("📢 帖子更新通知")
      .setDescription(
        [
          content,
          "",
          `**发布者：** <@${interaction.user.id}>`,
        ].join("\n")
      )
      .setColor(0xfaa61a)
      .setTimestamp();

    await (channel as GuildTextBasedChannel).send({
      content: "@everyone",
      embeds: [notifyEmbed],
    });

    await interaction.editReply("✅ 已通知所有人。");
    logger.info(
      { channelId, authorId: interaction.user.id },
      "Artwork update notification sent (@everyone)"
    );
  } catch (err) {
    logger.error({ err }, "Failed to send artwork notification");
    await interaction.editReply("通知发送失败，请稍后再试。");
  }
}

export async function handleArtworkGetButton(
  interaction: ButtonInteraction,
  messageId: string
) {
  const modal = new ModalBuilder()
    .setCustomId(`${ARTWORK_GET_MODAL_PREFIX}${messageId}`)
    .setTitle("获取作品");

  const passwordInput = new TextInputBuilder()
    .setCustomId(ARTWORK_PASSWORD_INPUT)
    .setLabel("请输入作品密码")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("向作者询问密码")
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(passwordInput)
  );

  await interaction.showModal(modal);
}

async function getFirstMessageInChannel(
  channel: GuildTextBasedChannel
): Promise<{ id: string } | null> {
  try {
    const messages = await (channel as TextChannel).messages.fetch({
      limit: 1,
      after: "0",
    });
    return messages.first() ?? null;
  } catch {
    return null;
  }
}

async function hasUserReactedToMessage(
  channel: GuildTextBasedChannel,
  messageId: string,
  userId: string
): Promise<boolean> {
  try {
    const message = await (channel as TextChannel).messages.fetch(messageId);
    if (!message) return false;
    for (const reaction of message.reactions.cache.values()) {
      const users = await reaction.users.fetch();
      if (users.has(userId)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function handleArtworkGetModal(
  interaction: ModalSubmitInteraction,
  messageId: string,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const password = interaction.fields.getTextInputValue(ARTWORK_PASSWORD_INPUT);
  const guild = interaction.guild;

  if (!guild) {
    await interaction.editReply("此操作只能在服务器中使用。");
    return;
  }

  const artworks = await db
    .select()
    .from(artworksTable)
    .where(eq(artworksTable.messageId, messageId))
    .limit(1);

  if (artworks.length === 0) {
    await interaction.editReply("找不到该作品信息，请联系管理员。");
    return;
  }

  const artwork = artworks[0]!;

  if (password !== artwork.password) {
    await interaction.editReply("密码错误，请向作者确认密码后再试。");
    return;
  }

  try {
    const artChannel = await client.channels.fetch(artwork.channelId).catch(() => null);
    if (!artChannel || !artChannel.isTextBased()) {
      await interaction.editReply("找不到作品所在频道，请联系管理员。");
      return;
    }

    const guildTextChannel = artChannel as GuildTextBasedChannel;

    const firstMsg = await getFirstMessageInChannel(guildTextChannel);
    if (!firstMsg) {
      await interaction.editReply("找不到频道首条消息，请联系管理员。");
      return;
    }

    const hasReacted = await hasUserReactedToMessage(
      guildTextChannel,
      firstMsg.id,
      interaction.user.id
    );

    if (!hasReacted) {
      const firstMsgLink = `https://discord.com/channels/${guild.id}/${artwork.channelId}/${firstMsg.id}`;
      await interaction.editReply(
        `密码正确！✅\n\n但你还需要先对 [频道第一条消息](${firstMsgLink}) 添加任意表情反应，完成后再次点击「获取作品」按钮即可。`
      );
      return;
    }

    const encoded = encodeFileInfo(interaction.user.id);

    const preparedFiles: AttachmentBuilder[] = [];
    const watermarkRecords: Array<{
      traceId: string;
      filename: string;
      method: string;
    }> = [];

    for (let i = 0; i < artwork.fileUrls.length; i++) {
      const fileRef = artwork.fileUrls[i]!;
      const originalName = artwork.fileNames[i] ?? `file_${i + 1}`;
      const renamedFilename = buildRenamedFilename(originalName, encoded);
      const traceId = generateTraceId();

      try {
        let buf: Buffer;
        if (isStorageKey(fileRef)) {
          buf = await loadFileFromStorage(fileRef);
        } else {
          const res = await fetch(fileRef);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          buf = Buffer.from(await res.arrayBuffer());
        }

        const result = applyWatermark(buf, originalName, traceId);
        preparedFiles.push(new AttachmentBuilder(result.buffer, { name: renamedFilename }));
        watermarkRecords.push({
          traceId,
          filename: renamedFilename,
          method: result.method,
        });
        if (!result.ok) {
          logger.info(
            { originalName, reason: result.reason },
            "Watermark skipped for file"
          );
        }
      } catch (err) {
        logger.error({ err, originalName }, "Failed to process file for delivery");
        watermarkRecords.push({ traceId, filename: renamedFilename, method: "error" });
      }
    }

    const artworkLink = `https://discord.com/channels/${guild.id}/${artwork.channelId}/${artwork.messageId}`;

    await interaction.editReply({
      content: `✅ 这是作品《${artwork.title}》的原文件（共 ${preparedFiles.length} 个），仅你可见：`,
      files: preparedFiles,
    });

    // 私信附件 + 作品链接给获取者
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle(`🎨 ${artwork.title}`)
        .setDescription(
          [
            `你已成功获取作品《**${artwork.title}**》的原文件。`,
            "",
            `**作者：** <@${artwork.authorId}>`,
            `**作品贴：** [点击跳转](${artworkLink})`,
          ].join("\n")
        )
        .setColor(0x5865f2)
        .setTimestamp();

      await interaction.user.send({
        embeds: [dmEmbed],
        files: preparedFiles,
      });

      logger.info(
        { userId: interaction.user.id, artworkId: artwork.messageId },
        "DM with artwork files sent to user"
      );
    } catch (dmErr) {
      logger.warn(
        { dmErr, userId: interaction.user.id },
        "Failed to send DM to user (DMs may be disabled)"
      );
    }

    await db.insert(artworkAccessLogsTable).values({
      artworkId: artwork.messageId,
      artworkTitle: artwork.title,
      accessorId: interaction.user.id,
      accessorTag: interaction.user.tag,
    });

    for (const rec of watermarkRecords) {
      await db.insert(artworkWatermarksTable).values({
        traceId: rec.traceId,
        artworkId: artwork.messageId,
        artworkTitle: artwork.title,
        accessorId: interaction.user.id,
        accessorTag: interaction.user.tag,
        filename: rec.filename,
        watermarkMethod: rec.method,
      }).onConflictDoNothing();
    }

    const logChannelId = getConfig(guild.id, CONFIG_KEY_LOG_CHANNEL);
    if (logChannelId) {
      try {
        const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
          const logTextChannel = logChannel as GuildTextBasedChannel;
          const logEmbed = new EmbedBuilder()
            .setTitle("📥 作品获取记录")
            .setDescription(
              [
                `**作品：** ${artwork.title}`,
                `**作者：** <@${artwork.authorId}>`,
                `**获取者：** <@${interaction.user.id}> (${interaction.user.tag})`,
                `**获取时间：** <t:${Math.floor(Date.now() / 1000)}:F>`,
                `**作品贴：** [点击查看](https://discord.com/channels/${guild.id}/${artwork.channelId}/${artwork.messageId})`,
              ].join("\n")
            )
            .setColor(0x5865f2)
            .setTimestamp();

          await logTextChannel.send({ embeds: [logEmbed] });
          logger.info(
            { logChannelId, artworkId: artwork.messageId, accessorId: interaction.user.id },
            "Access log sent to log channel"
          );
        } else {
          logger.warn({ logChannelId }, "Log channel not found or not text based");
        }
      } catch (err) {
        logger.error({ err, logChannelId }, "Failed to send access log to log channel");
      }
    } else {
      logger.info({ guildId: guild.id }, "No log channel configured for this guild");
    }
  } catch (err) {
    logger.error({ err }, "Failed to deliver artwork");
    await interaction.editReply("获取作品失败，请稍后再试。");
  }
}

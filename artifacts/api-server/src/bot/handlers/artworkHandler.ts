import {
  ActionRowBuilder,
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
} from "discord.js";
import { db } from "@workspace/db";
import { artworksTable, artworkAccessLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import {
  ARTWORK_GET_MODAL_PREFIX,
  ARTWORK_PASSWORD_INPUT,
  ARTWORK_GET_CUSTOM_ID,
} from "../constants.js";
import { getConfig, CONFIG_KEY_LOG_CHANNEL } from "../config.js";

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
        "• 并先对帖子首楼添加任意表情反应",
        "• 满足条件后即可收到仅你可见的作品原文件",
      ].join("\n")
    )
    .setColor(0x5865f2);

  return { embeds: [embed] };
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

  const fileUrls: string[] = [];
  const fileNames: string[] = [];

  for (let i = 1; i <= 10; i++) {
    const optName = i === 1 ? "file1" : `file${i}`;
    const att = interaction.options.getAttachment(optName);
    if (att) {
      fileUrls.push(att.url);
      fileNames.push(att.name);
    }
  }

  if (fileUrls.length === 0) {
    await interaction.editReply("请至少上传一个文件。");
    return;
  }

  try {
    const channel = interaction.channel as GuildTextBasedChannel | null;
    if (!channel) {
      await interaction.editReply("无法在此频道发布作品。");
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(
        [
          `**作者：** <@${interaction.user.id}>`,
          `**上传时间：** <t:${Math.floor(Date.now() / 1000)}:F>`,
          description ? `**备注：** ${description}` : null,
          `**文件数量：** ${fileUrls.length} 个`,
          "",
          "想获取原文件？点击下方按钮，输入密码并对此帖首楼添加反应后即可获取。",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .setColor(0x5865f2)
      .setFooter({ text: "作品系统 · 请向作者询问密码" })
      .setTimestamp();

    const placeholderBtn = new ButtonBuilder()
      .setCustomId(`${ARTWORK_GET_CUSTOM_ID}PLACEHOLDER`)
      .setLabel("获取作品")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎨");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(placeholderBtn);

    const msg = await channel.send({ embeds: [embed], components: [row] });

    const realGetBtn = new ButtonBuilder()
      .setCustomId(`${ARTWORK_GET_CUSTOM_ID}${msg.id}`)
      .setLabel("获取作品")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎨");

    const realRow = new ActionRowBuilder<ButtonBuilder>().addComponents(realGetBtn);
    await msg.edit({ components: [realRow] });

    await db.insert(artworksTable).values({
      messageId: msg.id,
      channelId: channel.id,
      guildId: guild.id,
      authorId: interaction.user.id,
      authorTag: interaction.user.tag,
      title,
      description,
      password,
      fileUrls,
      fileNames,
    });

    await interaction.editReply(
      `作品《${title}》已成功发布！共 ${fileUrls.length} 个文件。`
    );
  } catch (err) {
    logger.error({ err }, "Failed to upload artwork");
    await interaction.editReply("上传失败，请稍后再试。");
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
    const artMessage = await guildTextChannel.messages
      .fetch(artwork.messageId)
      .catch(() => null);

    if (!artMessage) {
      await interaction.editReply("找不到作品贴，请联系管理员。");
      return;
    }

    let hasReacted = false;
    const userReactions = artMessage.reactions.cache;
    if (userReactions.size > 0) {
      for (const reaction of userReactions.values()) {
        const users = await reaction.users.fetch();
        if (users.has(interaction.user.id)) {
          hasReacted = true;
          break;
        }
      }
    }

    if (!hasReacted) {
      const artLink = `https://discord.com/channels/${guild.id}/${artwork.channelId}/${artwork.messageId}`;
      await interaction.editReply(
        `密码正确！✅\n\n但你还需要先对 [作品帖首楼](${artLink}) 添加任意表情反应，完成后再次点击「获取作品」按钮即可。`
      );
      return;
    }

    const files = artwork.fileUrls.map((url, i) => ({
      attachment: url,
      name: artwork.fileNames[i] ?? `file_${i + 1}`,
    }));

    await interaction.editReply({
      content: `这是作品《${artwork.title}》的原文件（共 ${files.length} 个），仅你可见：`,
      files,
    });

    await db.insert(artworkAccessLogsTable).values({
      artworkId: artwork.messageId,
      artworkTitle: artwork.title,
      accessorId: interaction.user.id,
      accessorTag: interaction.user.tag,
    });

    const logChannelId = getConfig(guild.id, CONFIG_KEY_LOG_CHANNEL);
    if (logChannelId) {
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

        await logTextChannel.send({ embeds: [logEmbed] }).catch((err: unknown) => {
          logger.error({ err }, "Failed to send access log");
        });
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to deliver artwork");
    await interaction.editReply("获取作品失败，请稍后再试。");
  }
}

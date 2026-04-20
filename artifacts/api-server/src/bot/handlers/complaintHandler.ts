import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type ButtonInteraction,
  type Client,
  type GuildTextBasedChannel,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { db, complaintTicketsTable } from "@workspace/db";
import { logger } from "../../lib/logger.js";
import {
  COMPLAINT_PANEL_CUSTOM_ID,
  COMPLAINT_THREAD_SUBMIT_ID,
  COMPLAINT_THREAD_CANCEL_ID,
} from "../constants.js";
import { getConfig, CONFIG_KEY_COMPLAINT_CHANNEL } from "../config.js";

export function buildComplaintPanel() {
  const embed = new EmbedBuilder()
    .setTitle("📢 匿名投诉")
    .setDescription(
      [
        "如果你有任何想要反映的问题，可以点击下方按钮进行**匿名投诉**。",
        "",
        "• 你的身份信息**不会**出现在投诉工单中",
        "• 支持上传图片、文件等**证据附件**",
        "• 投诉内容将由管理员在内部频道查看",
        "• 请如实描述问题，切勿滥用",
      ].join("\n")
    )
    .setColor(0xffa500)
    .setFooter({ text: "投诉完全匿名，管理员无法得知投诉者身份" });

  const button = new ButtonBuilder()
    .setCustomId(COMPLAINT_PANEL_CUSTOM_ID)
    .setLabel("提交投诉")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("📢");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return { embeds: [embed], components: [row] };
}

export async function handleComplaintButton(interaction: ButtonInteraction) {
  const channel = interaction.channel as GuildTextBasedChannel | null;

  if (!channel || channel.isDMBased() || !("threads" in channel)) {
    await interaction.reply({ content: "❌ 此频道不支持创建私密投诉子区，请联系管理员。", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const thread = await (channel as TextChannel).threads.create({
      name: `投诉子区-${Date.now().toString(36)}`,
      type: ChannelType.PrivateThread,
      invitable: false,
    });

    await thread.members.add(interaction.user.id);

    const submitBtn = new ButtonBuilder()
      .setCustomId(COMPLAINT_THREAD_SUBMIT_ID)
      .setLabel("确认提交投诉")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("📢");

    const cancelBtn = new ButtonBuilder()
      .setCustomId(COMPLAINT_THREAD_CANCEL_ID)
      .setLabel("取消")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(submitBtn, cancelBtn);

    await thread.send({
      content: [
        `你好 <@${interaction.user.id}>！这是你的**匿名投诉专属子区**，只有你和 Bot 可见。`,
        "",
        "**📝 使用方法：**",
        "1. 在此子区发送投诉内容（支持多条消息）",
        "2. 如需附上证据，直接将图片或文件发送到此子区",
        "3. 准备好后，点击下方「确认提交投诉」按钮",
        "",
        "⚠️ 提交后**你的身份不会出现**在工单中，管理员只会看到投诉内容和附件。",
        "此子区将在提交或取消后自动关闭。",
      ].join("\n"),
      components: [row],
    });

    await interaction.editReply({
      content: `✅ 已为你创建专属投诉子区，请前往 <#${thread.id}> 填写投诉内容和上传附件后提交。`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to create complaint private thread");
    await interaction.editReply("❌ 创建投诉子区失败（此服务器可能不支持私密子区），请联系管理员。");
  }
}

export async function handleComplaintThreadSubmit(
  interaction: ButtonInteraction,
  client: Client
) {
  const thread = interaction.channel as ThreadChannel | null;
  if (!thread || !thread.isThread()) {
    await interaction.reply({ content: "❌ 无法识别投诉子区。", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const messages = await thread.messages.fetch({ limit: 100 });
    const userMessages = [...messages.values()]
      .filter((m) => !m.author.bot)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const textContent = userMessages
      .map((m) => m.content)
      .filter((c) => c.length > 0)
      .join("\n");

    const attachments = userMessages.flatMap((m) => [...m.attachments.values()]);

    if (!textContent && attachments.length === 0) {
      await interaction.editReply("❌ 请先发送投诉内容或附上证据文件后再提交。");
      return;
    }

    const guildId = interaction.guildId!;
    const attachmentUrls = attachments.map((a) => a.url);

    const result = await db
      .insert(complaintTicketsTable)
      .values({
        guildId,
        content: textContent || "（无文字内容）",
        attachmentUrls: attachmentUrls.length > 0 ? JSON.stringify(attachmentUrls) : null,
      })
      .returning({ id: complaintTicketsTable.id });

    const ticketId = result[0]?.id ?? 0;

    const complaintChannelId = getConfig(guildId, CONFIG_KEY_COMPLAINT_CHANNEL);
    if (complaintChannelId) {
      const complaintChannel = await client.channels.fetch(complaintChannelId).catch(() => null);
      if (complaintChannel && complaintChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`📢 匿名投诉工单 #${ticketId}`)
          .setColor(0xffa500)
          .setFooter({ text: "此投诉完全匿名，系统未记录投诉者身份" })
          .setTimestamp();

        if (textContent) {
          embed.setDescription(textContent);
        }

        const payload = {
          embeds: [embed],
        };

        if (attachments.length > 0) {
          const lines = attachments.map((a, i) => `[附件 ${i + 1}：${a.name}](${a.url})`);
          embed.addFields({ name: `📎 证据附件（${attachments.length} 个）`, value: lines.join("\n") });

          const imageAttachments = attachments.filter((a) =>
            ["png", "jpg", "jpeg", "gif", "webp"].some((ext) => a.name.toLowerCase().endsWith(ext))
          );
          if (imageAttachments.length > 0) {
            embed.setImage(imageAttachments[0]!.url);
          }
        }

        await (complaintChannel as GuildTextBasedChannel).send(payload);
        logger.info({ ticketId, guildId, attachmentCount: attachments.length }, "Complaint sent to log channel");
      }
    }

    await interaction.editReply(`✅ 投诉工单 #${ticketId} 已匿名提交！感谢你的反馈，管理员将会查阅。`);

    setTimeout(async () => {
      await thread.delete("投诉提交完成，自动关闭").catch(() => {});
    }, 3000);
  } catch (err) {
    logger.error({ err }, "Failed to submit complaint thread");
    await interaction.editReply("❌ 提交投诉时出错，请稍后再试或联系管理员。");
  }
}

export async function handleComplaintThreadCancel(interaction: ButtonInteraction) {
  await interaction.reply({ content: "已取消投诉。此子区将在 3 秒后自动关闭。", flags: 64 });
  const thread = interaction.channel as ThreadChannel | null;
  if (thread?.isThread()) {
    setTimeout(async () => {
      await thread.delete("用户取消投诉，自动关闭").catch(() => {});
    }, 3000);
  }
}

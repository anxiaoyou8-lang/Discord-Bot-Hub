import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import { DELETE_THREAD_CONFIRM_ID, DELETE_THREAD_CANCEL_ID } from "../constants.js";

export async function handleGoTop(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel as GuildTextBasedChannel | null;
  if (!channel) {
    await interaction.reply({ content: "无法在此处使用该指令。", flags: 64 });
    return;
  }

  try {
    let firstMessageId: string | null = null;

    if (channel.isThread()) {
      const thread = channel as ThreadChannel;
      const messages = await thread.messages.fetch({ limit: 1, after: "0" });
      firstMessageId = messages.first()?.id ?? thread.id;
    } else {
      const textChannel = channel as TextChannel;
      const messages = await textChannel.messages.fetch({ limit: 1, after: "0" });
      firstMessageId = messages.first()?.id ?? null;
    }

    if (!firstMessageId) {
      await interaction.reply({ content: "找不到首楼消息。", flags: 64 });
      return;
    }

    const guildId = interaction.guildId!;
    const link = `https://discord.com/channels/${guildId}/${channel.id}/${firstMessageId}`;
    await interaction.reply({ content: `⬆️ [点击跳转到首楼](${link})`, flags: 64 });
  } catch (err) {
    logger.error({ err }, "Failed to handle 回顶");
    await interaction.reply({ content: "操作失败，请稍后再试。", flags: 64 });
  }
}

export async function handleDeleteThread(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel as GuildTextBasedChannel | null;
  if (!channel) {
    await interaction.reply({ content: "无法在此处使用该指令。", flags: 64 });
    return;
  }

  if (!channel.isThread()) {
    await interaction.reply({ content: "❌ 该指令只能在帖子（子区）中使用。", flags: 64 });
    return;
  }

  const hasPermission =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads) ?? false;
  if (!hasPermission) {
    await interaction.reply({ content: "❌ 你没有「管理帖子」权限，无法使用此指令。", flags: 64 });
    return;
  }

  const confirmBtn = new ButtonBuilder()
    .setCustomId(DELETE_THREAD_CONFIRM_ID)
    .setLabel("确认删除")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("🗑️");

  const cancelBtn = new ButtonBuilder()
    .setCustomId(DELETE_THREAD_CANCEL_ID)
    .setLabel("取消")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn);

  await interaction.reply({
    content:
      "⚠️ **警告：此操作不可逆！**\n即将删除当前帖子及其中所有内容，确认要继续吗？",
    components: [row],
    flags: 64,
  });
}

export async function handleDeleteThreadConfirm(interaction: ButtonInteraction) {
  const channel = interaction.channel as GuildTextBasedChannel | null;
  if (!channel || !channel.isThread()) {
    await interaction.update({ content: "❌ 找不到目标帖子。", components: [] });
    return;
  }

  const thread = channel as ThreadChannel;
  const threadName = thread.name;

  try {
    await interaction.update({ content: "🗑️ 正在删除帖子……", components: [] });
    await thread.delete("管理员通过 /删除帖子 指令删除");
    logger.info({ threadId: thread.id, threadName }, "Thread deleted");
  } catch (err) {
    logger.error({ err }, "Failed to delete thread");
    try {
      await interaction.editReply({ content: "❌ 删除帖子失败，请确认 Bot 拥有「管理帖子」权限。", components: [] });
    } catch {}
  }
}

export async function handleDeleteThreadCancel(interaction: ButtonInteraction) {
  await interaction.update({ content: "✅ 已取消，帖子不会被删除。", components: [] });
}

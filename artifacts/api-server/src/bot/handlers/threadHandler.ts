import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildTextBasedChannel,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { logger } from "../../lib/logger.js";

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
    logger.error({ err }, "Failed to handle go_top");
    await interaction.reply({ content: "操作失败，请稍后再试。", flags: 64 });
  }
}

export async function handleClearMessages(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel as GuildTextBasedChannel | null;
  if (!channel) {
    await interaction.reply({ content: "无法在此处使用该指令。", flags: 64 });
    return;
  }

  const member = interaction.member;
  const hasPermission =
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ?? false;
  if (!hasPermission) {
    await interaction.reply({ content: "你没有「管理消息」权限，无法使用此指令。", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    let totalDeleted = 0;

    if (channel.isThread()) {
      const thread = channel as ThreadChannel;
      let fetching = true;
      while (fetching) {
        const messages = await thread.messages.fetch({ limit: 100 });
        if (messages.size === 0) { fetching = false; break; }

        const now = Date.now();
        const recent = messages.filter((m) => now - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        const old = messages.filter((m) => now - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);

        if (recent.size > 0) {
          await thread.bulkDelete(recent).catch(() => {});
          totalDeleted += recent.size;
        }
        for (const [, msg] of old) {
          await msg.delete().catch(() => {});
          totalDeleted++;
        }

        if (messages.size < 100) fetching = false;
      }
    } else {
      const textChannel = channel as TextChannel;
      let fetching = true;
      while (fetching) {
        const messages = await textChannel.messages.fetch({ limit: 100 });
        if (messages.size === 0) { fetching = false; break; }

        const now = Date.now();
        const recent = messages.filter((m) => now - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        const old = messages.filter((m) => now - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);

        if (recent.size > 1) {
          await textChannel.bulkDelete(recent).catch(() => {});
          totalDeleted += recent.size;
        }
        for (const [, msg] of old) {
          await msg.delete().catch(() => {});
          totalDeleted++;
        }

        if (messages.size < 100) fetching = false;
      }
    }

    await interaction.editReply(`✅ 已删除 ${totalDeleted} 条消息。`);
    logger.info({ channelId: channel.id, totalDeleted }, "Messages cleared");
  } catch (err) {
    logger.error({ err }, "Failed to clear messages");
    await interaction.editReply("删除消息时出错，请确认 Bot 拥有「管理消息」权限。");
  }
}

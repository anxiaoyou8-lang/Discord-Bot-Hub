import {
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
  type GuildTextBasedChannel,
} from "discord.js";
import { logger } from "../../lib/logger.js";

export async function handleSearchUser(interaction: ChatInputCommandInteraction) {
  const query = interaction.options.getString("名称", true).trim();
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "此指令只能在服务器中使用。", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const members = await guild.members.search({ query, limit: 15 });

    if (members.size === 0) {
      await interaction.editReply(`未找到用户名或昵称包含「${query}」的成员。`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`🔍 用户搜索：「${query}」`)
      .setColor(0x5865f2)
      .setFooter({ text: `共找到 ${members.size} 个匹配成员` });

    const lines = [...members.values()].map((member: GuildMember) => {
      const joinedAt = member.joinedAt
        ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>加入`
        : "";
      const topRoles = member.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .first(3)
        .map((r) => `<@&${r.id}>`)
        .join(" ");
      const nick = member.nickname ? `（${member.nickname}）` : "";
      return `<@${member.id}> **${member.user.username}**${nick}\n${joinedAt} ${topRoles}`.trim();
    });

    embed.setDescription(lines.join("\n\n"));
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Search user failed");
    await interaction.editReply("搜索失败，请稍后再试。");
  }
}

export async function handleSearchMessages(interaction: ChatInputCommandInteraction) {
  const keyword = interaction.options.getString("关键词", true).trim();
  const maxScan = interaction.options.getInteger("范围") ?? 500;
  const channel = interaction.channel as GuildTextBasedChannel | null;

  if (!channel || !channel.isTextBased()) {
    await interaction.reply({ content: "无法在此处使用该指令。", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const results: Message[] = [];
    let lastId: string | undefined;
    let scanned = 0;
    const keywordLower = keyword.toLowerCase();

    while (scanned < maxScan) {
      const batch = await channel.messages.fetch({
        limit: 100,
        ...(lastId ? { before: lastId } : {}),
      });

      if (batch.size === 0) break;

      for (const [, msg] of batch) {
        if (msg.content.toLowerCase().includes(keywordLower)) {
          results.push(msg);
        }
        lastId = msg.id;
      }

      scanned += batch.size;
      if (results.length >= 10 || batch.size < 100) break;
    }

    if (results.length === 0) {
      await interaction.editReply(
        `在当前频道最近 ${scanned} 条消息中，未找到包含「${keyword}」的内容。`
      );
      return;
    }

    const shown = results.slice(0, 10);
    const embed = new EmbedBuilder()
      .setTitle(`🔍 消息搜索：「${keyword}」`)
      .setColor(0x5865f2)
      .setFooter({
        text: `已扫描最近 ${scanned} 条消息，显示前 ${shown.length} 条匹配结果`,
      });

    const lines = shown.map((msg) => {
      const time = `<t:${Math.floor(msg.createdTimestamp / 1000)}:R>`;
      const preview = msg.content.length > 100
        ? msg.content.slice(0, 100) + "…"
        : msg.content;
      const link = `https://discord.com/channels/${interaction.guildId}/${channel.id}/${msg.id}`;
      return `${time} **${msg.author.username}**\n[${preview || "（无文字，含附件）"}](${link})`;
    });

    embed.setDescription(lines.join("\n\n"));
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Search messages failed");
    await interaction.editReply("搜索失败，请稍后再试。");
  }
}

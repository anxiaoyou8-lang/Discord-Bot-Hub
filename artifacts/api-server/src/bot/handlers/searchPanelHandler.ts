import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type GuildTextBasedChannel,
  type Message,
  type ModalSubmitInteraction,
} from "discord.js";
import { db, artworksTable } from "@workspace/db";
import { like, or, eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import {
  SEARCH_CHANNEL_SELECT_ID,
  SEARCH_KEYWORD_BTN_ID,
  SEARCH_NICKNAME_BTN_ID,
  SEARCH_KEYWORD_MODAL_ID,
  SEARCH_NICKNAME_MODAL_ID,
  SEARCH_KEYWORD_INPUT,
  SEARCH_NICKNAME_INPUT,
} from "../constants.js";

const userChannelMap = new Map<string, string>();

export function buildSearchPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🔍 搜索面板")
    .setDescription(
      "**使用方法：**\n" +
      "1. 在下方选择要搜索的频道\n" +
      "2. 点击「关键词搜索」在所选频道按关键词查找消息\n" +
      "3. 点击「作者搜索」按作者昵称查找其发布的所有作品"
    )
    .setColor(0x5865f2);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(SEARCH_CHANNEL_SELECT_ID)
    .setPlaceholder("请选择要搜索的频道")
    .setChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread);

  const keywordBtn = new ButtonBuilder()
    .setCustomId(SEARCH_KEYWORD_BTN_ID)
    .setLabel("关键词搜索")
    .setEmoji("💬")
    .setStyle(ButtonStyle.Primary);

  const nicknameBtn = new ButtonBuilder()
    .setCustomId(SEARCH_NICKNAME_BTN_ID)
    .setLabel("作者搜索")
    .setEmoji("🎨")
    .setStyle(ButtonStyle.Secondary);

  const selectRow = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(channelSelect);
  const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(keywordBtn, nicknameBtn);

  return { embeds: [embed], components: [selectRow, btnRow] };
}

export async function handleSearchChannelSelect(interaction: ChannelSelectMenuInteraction) {
  const channelId = interaction.values[0];
  if (!channelId) {
    await interaction.reply({ content: "未选择有效频道。", flags: 64 });
    return;
  }
  userChannelMap.set(interaction.user.id, channelId);
  await interaction.reply({
    content: `✅ 已选择频道 <#${channelId}>，现在可以点击下方按钮进行搜索。`,
    flags: 64,
  });
}

export async function handleSearchKeywordBtn(interaction: ButtonInteraction) {
  const channelId = userChannelMap.get(interaction.user.id);
  if (!channelId) {
    await interaction.reply({
      content: "❌ 请先在面板中选择一个频道，再点击搜索按钮。",
      flags: 64,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(SEARCH_KEYWORD_MODAL_ID)
    .setTitle("关键词搜索消息");

  const input = new TextInputBuilder()
    .setCustomId(SEARCH_KEYWORD_INPUT)
    .setLabel("关键词")
    .setPlaceholder("请输入要搜索的关键词")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleSearchNicknameBtn(interaction: ButtonInteraction) {
  const channelId = userChannelMap.get(interaction.user.id);
  if (!channelId) {
    await interaction.reply({
      content: "❌ 请先在面板中选择一个频道，再点击搜索按钮。",
      flags: 64,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(SEARCH_NICKNAME_MODAL_ID)
    .setTitle("按作者搜索作品");

  const input = new TextInputBuilder()
    .setCustomId(SEARCH_NICKNAME_INPUT)
    .setLabel("作者用户名 / 昵称")
    .setPlaceholder("请输入作者的用户名或 Discord 标签")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

export async function handleSearchKeywordModal(interaction: ModalSubmitInteraction) {
  const keyword = interaction.fields.getTextInputValue(SEARCH_KEYWORD_INPUT).trim();
  const channelId = userChannelMap.get(interaction.user.id);

  if (!channelId) {
    await interaction.reply({
      content: "❌ 频道信息已过期，请重新在面板选择频道后再搜索。",
      flags: 64,
    });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply("此功能只能在服务器中使用。");
      return;
    }

    const channel = (await guild.channels.fetch(channelId)) as GuildTextBasedChannel | null;
    if (!channel || !channel.isTextBased()) {
      await interaction.editReply("❌ 无法访问所选频道，请重新选择。");
      return;
    }

    const results: Message[] = [];
    let lastId: string | undefined;
    let scanned = 0;
    const keywordLower = keyword.toLowerCase();
    const maxScan = 500;

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
        `在 <#${channelId}> 最近 ${scanned} 条消息中，未找到包含「${keyword}」的内容。`
      );
      return;
    }

    const shown = results.slice(0, 10);
    const embed = new EmbedBuilder()
      .setTitle(`🔍 关键词搜索：「${keyword}」`)
      .setColor(0x5865f2)
      .setFooter({
        text: `频道 #${channel.name} · 已扫描 ${scanned} 条消息，显示前 ${shown.length} 条`,
      });

    const lines = shown.map((msg) => {
      const time = `<t:${Math.floor(msg.createdTimestamp / 1000)}:R>`;
      const preview =
        msg.content.length > 100 ? msg.content.slice(0, 100) + "…" : msg.content;
      const link = `https://discord.com/channels/${interaction.guildId}/${channelId}/${msg.id}`;
      return `${time} **${msg.author.username}**\n[${preview || "（无文字，含附件）"}](${link})`;
    });

    embed.setDescription(lines.join("\n\n"));
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Search panel keyword modal failed");
    await interaction.editReply("搜索失败，请稍后再试。");
  }
}

export async function handleSearchNicknameModal(interaction: ModalSubmitInteraction) {
  const query = interaction.fields.getTextInputValue(SEARCH_NICKNAME_INPUT).trim();

  await interaction.deferReply({ flags: 64 });

  try {
    const guildId = interaction.guildId;
    if (!guildId) {
      await interaction.editReply("此功能只能在服务器中使用。");
      return;
    }

    const queryLower = `%${query.toLowerCase()}%`;

    const rows = await db
      .select()
      .from(artworksTable)
      .where(
        or(
          like(artworksTable.authorTag, queryLower),
          eq(artworksTable.authorId, query)
        )
      )
      .limit(20);

    if (rows.length === 0) {
      await interaction.editReply(
        `未找到作者名或标签包含「${query}」的作品记录。`
      );
      return;
    }

    const byAuthor = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.authorId}|${row.authorTag}`;
      const arr = byAuthor.get(key) ?? [];
      arr.push(row);
      byAuthor.set(key, arr);
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎨 作者搜索：「${query}」`)
      .setColor(0x5865f2)
      .setFooter({ text: `共找到 ${rows.length} 件作品` });

    const sections: string[] = [];
    for (const [key, artworks] of byAuthor) {
      const [authorId, authorTag] = key.split("|");
      const header = `**<@${authorId}> (${authorTag})**`;
      const items = artworks.map((aw) => {
        const link = `https://discord.com/channels/${aw.guildId}/${aw.channelId}/${aw.messageId}`;
        const time = `<t:${Math.floor(aw.createdAt.getTime() / 1000)}:d>`;
        return `• [${aw.title}](${link}) — ${time}`;
      });
      sections.push([header, ...items].join("\n"));
    }

    const description = sections.join("\n\n");
    embed.setDescription(
      description.length > 4096 ? description.slice(0, 4090) + "…" : description
    );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Search panel nickname modal failed");
    await interaction.editReply("搜索失败，请稍后再试。");
  }
}

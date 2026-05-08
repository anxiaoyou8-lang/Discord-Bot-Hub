import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
} from "discord.js";
import { db, suggestionTicketsTable, suggestionVotesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import {
  SUGGESTION_PANEL_CUSTOM_ID,
  SUGGESTION_MODAL_ID,
  SUGGESTION_TEXT_INPUT,
  SUGGESTION_CATEGORY_INPUT,
  SUGGESTION_DOWNVOTE_MODAL_PREFIX,
  SUGGESTION_DOWNVOTE_REASON_INPUT,
  SUGGESTION_REJECT_MODAL_PREFIX,
  SUGGESTION_REJECT_REASON_INPUT,
} from "../constants.js";
import { getConfig, CONFIG_KEY_SUGGESTION_CHANNEL, CONFIG_KEY_ADMIN_ROLE } from "../config.js";

const STATUS_LABELS: Record<string, string> = {
  pending: "⏳ 等待中",
  accepted: "✅ 已采纳",
  rejected: "❌ 不采纳",
};
const STATUS_COLORS: Record<string, number> = {
  pending: 0xfee75c,
  accepted: 0x57f287,
  rejected: 0xed4245,
};

function isAdmin(guildId: string, member: GuildMember | null): boolean {
  const adminRoleId = getConfig(guildId, CONFIG_KEY_ADMIN_ROLE);
  const isDiscordAdmin = member?.permissions
    ? typeof member.permissions === "string"
      ? !!(BigInt(member.permissions) & BigInt(PermissionFlagsBits.Administrator))
      : member.permissions.has(PermissionFlagsBits.Administrator)
    : false;
  const hasAdminRole = adminRoleId
    ? member?.roles instanceof Object && "cache" in member.roles
      ? member.roles.cache.has(adminRoleId)
      : false
    : false;
  return isDiscordAdmin || hasAdminRole;
}

async function buildSuggestionEmbed(
  id: number,
  content: string,
  category: string | null | undefined,
  status: string,
  upvotes: number,
  downvotes: number,
  rejectReason?: string | null
) {
  const statusLabel = STATUS_LABELS[status] ?? STATUS_LABELS.pending!;
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.pending!;
  const total = upvotes + downvotes;
  const pct = total > 0 ? Math.round((upvotes / total) * 100) : 0;

  const embed = new EmbedBuilder()
    .setTitle(`💡 意见 #${id}${category ? ` · ${category}` : ""}`)
    .setDescription(content)
    .setColor(color)
    .addFields(
      { name: "状态", value: statusLabel, inline: true },
      { name: "👍 支持", value: `${upvotes}`, inline: true },
      { name: "👎 反对", value: `${downvotes}`, inline: true },
      ...(total > 0
        ? [{ name: "支持率", value: `${pct}%（共 ${total} 票）`, inline: true }]
        : [])
    )
    .setFooter({ text: "民众议会 · 匿名 · 公开投票" })
    .setTimestamp();

  if (status === "rejected" && rejectReason) {
    embed.addFields({ name: "📝 不采纳理由", value: rejectReason });
  }

  const downvoteReasons = await db
    .select({ reason: suggestionVotesTable.reason })
    .from(suggestionVotesTable)
    .where(
      and(
        eq(suggestionVotesTable.suggestionId, id),
        eq(suggestionVotesTable.voteType, "down")
      )
    );

  const reasons = downvoteReasons
    .map((r) => r.reason)
    .filter((r): r is string => !!r && r.trim().length > 0);

  if (reasons.length > 0) {
    const reasonText = reasons.map((r, i) => `${i + 1}. ${r}`).join("\n");
    embed.addFields({ name: `💬 反对原因（${reasons.length} 条）`, value: reasonText.slice(0, 1024) });
  }

  return embed;
}

function buildSuggestionComponents(suggestionId: number) {
  const upvoteBtn = new ButtonBuilder()
    .setCustomId(`suggestion_up_${suggestionId}`)
    .setLabel("支持")
    .setEmoji("👍")
    .setStyle(ButtonStyle.Primary);

  const downvoteBtn = new ButtonBuilder()
    .setCustomId(`suggestion_down_${suggestionId}`)
    .setLabel("反对")
    .setEmoji("👎")
    .setStyle(ButtonStyle.Secondary);

  const acceptBtn = new ButtonBuilder()
    .setCustomId(`suggestion_accept_${suggestionId}`)
    .setLabel("标记采纳")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const rejectBtn = new ButtonBuilder()
    .setCustomId(`suggestion_reject_${suggestionId}`)
    .setLabel("标记不采纳")
    .setEmoji("❌")
    .setStyle(ButtonStyle.Danger);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(upvoteBtn, downvoteBtn),
    new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, rejectBtn),
  ];
}

export function buildSuggestionPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🏛️ 民众议会")
    .setDescription(
      [
        "有任何建议、想法或意见？在这里匿名提交，让大家一起看到并投票！",
        "",
        "• **完全匿名**，任何人无法得知提交者身份",
        "• 所有人可见，支持 👍/👎 公开投票",
        "• 👎 反对时可选填原因，匿名展示",
        "• 管理员可标记采纳状态，并留下说明",
      ].join("\n")
    )
    .setColor(0x5865f2)
    .setFooter({ text: "民众议会 · 匿名 · 公开投票" });

  const button = new ButtonBuilder()
    .setCustomId(SUGGESTION_PANEL_CUSTOM_ID)
    .setLabel("📮 提交意见")
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

export async function handleSuggestionButton(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(SUGGESTION_MODAL_ID)
    .setTitle("提交匿名意见");

  const categoryInput = new TextInputBuilder()
    .setCustomId(SUGGESTION_CATEGORY_INPUT)
    .setLabel("分类（选填）")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("建议 / 问题 / 吐槽 / 表扬 / 其他")
    .setMaxLength(20)
    .setRequired(false);

  const contentInput = new TextInputBuilder()
    .setCustomId(SUGGESTION_TEXT_INPUT)
    .setLabel("意见内容（必填）")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("写下你的想法，可以是建议、反馈或任何意见……")
    .setMinLength(5)
    .setMaxLength(1000)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(categoryInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput)
  );
  await interaction.showModal(modal);
}

export async function handleSuggestionModal(
  interaction: ModalSubmitInteraction,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const content = interaction.fields.getTextInputValue(SUGGESTION_TEXT_INPUT).trim();
  const rawCategory = interaction.fields.getTextInputValue(SUGGESTION_CATEGORY_INPUT).trim();
  const category = rawCategory || null;
  const guildId = interaction.guildId ?? "";

  try {
    const result = await db
      .insert(suggestionTicketsTable)
      .values({ guildId, content, category })
      .returning({ id: suggestionTicketsTable.id });

    const suggestionId = result[0]?.id ?? 0;
    const embed = await buildSuggestionEmbed(suggestionId, content, category, "pending", 0, 0);
    const components = buildSuggestionComponents(suggestionId);

    const suggestionChannelId = getConfig(guildId, CONFIG_KEY_SUGGESTION_CHANNEL);
    if (!suggestionChannelId) {
      await interaction.editReply("✅ 意见已记录！（管理员尚未设置公开展示频道）");
      return;
    }

    const ch = await client.channels.fetch(suggestionChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) {
      await interaction.editReply("✅ 意见已记录！（无法发送到展示频道，请联系管理员）");
      return;
    }

    const posted = await (ch as GuildTextBasedChannel).send({ embeds: [embed], components });

    await db
      .update(suggestionTicketsTable)
      .set({ messageId: posted.id, channelId: suggestionChannelId })
      .where(eq(suggestionTicketsTable.id, suggestionId));

    await interaction.editReply(`✅ 意见 #${suggestionId} 已匿名发布！大家可以前往频道投票。`);
    logger.info({ suggestionId, guildId }, "Suggestion posted publicly");
  } catch (err) {
    logger.error({ err }, "Failed to submit suggestion");
    await interaction.editReply("❌ 提交时出错，请稍后再试。");
  }
}

async function refreshSuggestionMessage(client: Client, suggestionId: number) {
  const rows = await db
    .select()
    .from(suggestionTicketsTable)
    .where(eq(suggestionTicketsTable.id, suggestionId))
    .limit(1);

  const s = rows[0];
  if (!s || !s.messageId || !s.channelId) return;

  const ch = await client.channels.fetch(s.channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const msg = await (ch as GuildTextBasedChannel).messages.fetch(s.messageId).catch(() => null);
  if (!msg) return;

  const embed = await buildSuggestionEmbed(
    s.id, s.content, s.category, s.status, s.upvotes, s.downvotes, s.rejectReason
  );
  const components = buildSuggestionComponents(suggestionId);
  await msg.edit({ embeds: [embed], components }).catch((e) => {
    logger.warn({ e }, "Failed to refresh suggestion message");
  });
}

export async function handleSuggestionVote(
  interaction: ButtonInteraction,
  suggestionId: number,
  client: Client
) {
  // 👍 直接投票，无需 Modal
  await interaction.deferReply({ flags: 64 });
  const userId = interaction.user.id;

  try {
    const existing = await db
      .select()
      .from(suggestionVotesTable)
      .where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)))
      .limit(1);

    const suggestion = await db
      .select()
      .from(suggestionTicketsTable)
      .where(eq(suggestionTicketsTable.id, suggestionId))
      .limit(1)
      .then((r) => r[0]);

    if (!suggestion) { await interaction.editReply("❌ 找不到该意见。"); return; }

    let newUp = suggestion.upvotes;
    let newDown = suggestion.downvotes;
    let replyMsg = "";

    if (existing.length > 0) {
      const prev = existing[0]!.voteType;
      if (prev === "up") {
        // 取消
        await db.delete(suggestionVotesTable).where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)));
        newUp = Math.max(0, newUp - 1);
        replyMsg = "已取消 👍 支持。";
      } else {
        // 从 down 切到 up，保留原 down reason（清空 reason 因为换方向）
        await db.update(suggestionVotesTable).set({ voteType: "up", reason: null }).where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)));
        newUp += 1;
        newDown = Math.max(0, newDown - 1);
        replyMsg = "已改为 👍 支持。";
      }
    } else {
      await db.insert(suggestionVotesTable).values({ suggestionId, userId, voteType: "up" });
      newUp += 1;
      replyMsg = "已投 👍 支持！";
    }

    await db.update(suggestionTicketsTable).set({ upvotes: newUp, downvotes: newDown }).where(eq(suggestionTicketsTable.id, suggestionId));
    await refreshSuggestionMessage(client, suggestionId);
    await interaction.editReply(replyMsg);
  } catch (err) {
    logger.error({ err }, "Failed to handle upvote");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

export async function handleSuggestionDownvoteBtn(
  interaction: ButtonInteraction,
  suggestionId: number
) {
  // 👎 弹 Modal 填选填原因
  const modal = new ModalBuilder()
    .setCustomId(`${SUGGESTION_DOWNVOTE_MODAL_PREFIX}${suggestionId}`)
    .setTitle("反对意见（选填原因）");

  const reasonInput = new TextInputBuilder()
    .setCustomId(SUGGESTION_DOWNVOTE_REASON_INPUT)
    .setLabel("反对原因（选填，匿名展示）")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("简单说明为什么反对……")
    .setMaxLength(200)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  await interaction.showModal(modal);
}

export async function handleSuggestionDownvoteModal(
  interaction: ModalSubmitInteraction,
  suggestionId: number,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });
  const userId = interaction.user.id;
  const reason = interaction.fields.getTextInputValue(SUGGESTION_DOWNVOTE_REASON_INPUT).trim() || null;

  try {
    const existing = await db
      .select()
      .from(suggestionVotesTable)
      .where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)))
      .limit(1);

    const suggestion = await db
      .select()
      .from(suggestionTicketsTable)
      .where(eq(suggestionTicketsTable.id, suggestionId))
      .limit(1)
      .then((r) => r[0]);

    if (!suggestion) { await interaction.editReply("❌ 找不到该意见。"); return; }

    let newUp = suggestion.upvotes;
    let newDown = suggestion.downvotes;
    let replyMsg = "";

    if (existing.length > 0) {
      const prev = existing[0]!.voteType;
      if (prev === "down") {
        if (reason !== null) {
          // 更新原因
          await db.update(suggestionVotesTable).set({ reason }).where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)));
          replyMsg = "已更新反对原因。";
        } else {
          // 取消投票
          await db.delete(suggestionVotesTable).where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)));
          newDown = Math.max(0, newDown - 1);
          replyMsg = "已取消 👎 反对。";
        }
      } else {
        // 从 up 切到 down
        await db.update(suggestionVotesTable).set({ voteType: "down", reason }).where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)));
        newDown += 1;
        newUp = Math.max(0, newUp - 1);
        replyMsg = "已改为 👎 反对。";
      }
    } else {
      await db.insert(suggestionVotesTable).values({ suggestionId, userId, voteType: "down", reason });
      newDown += 1;
      replyMsg = "已投 👎 反对！";
    }

    await db.update(suggestionTicketsTable).set({ upvotes: newUp, downvotes: newDown }).where(eq(suggestionTicketsTable.id, suggestionId));
    await refreshSuggestionMessage(client, suggestionId);
    await interaction.editReply(replyMsg);
  } catch (err) {
    logger.error({ err }, "Failed to handle downvote modal");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

export async function handleSuggestionAccept(
  interaction: ButtonInteraction,
  suggestionId: number,
  client: Client
) {
  const guildId = interaction.guildId ?? "";
  const member = interaction.member as GuildMember | null;
  if (!isAdmin(guildId, member)) {
    await interaction.reply({ content: "❌ 只有管理员可以标记采纳状态。", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });
  try {
    await db.update(suggestionTicketsTable).set({ status: "accepted", rejectReason: null }).where(eq(suggestionTicketsTable.id, suggestionId));
    await refreshSuggestionMessage(client, suggestionId);
    await interaction.editReply(`✅ 意见 #${suggestionId} 已标记为采纳。`);
    logger.info({ suggestionId, adminId: interaction.user.id }, "Suggestion accepted");
  } catch (err) {
    logger.error({ err }, "Failed to accept suggestion");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

export async function handleSuggestionRejectBtn(
  interaction: ButtonInteraction,
  suggestionId: number
) {
  const guildId = interaction.guildId ?? "";
  const member = interaction.member as GuildMember | null;
  if (!isAdmin(guildId, member)) {
    await interaction.reply({ content: "❌ 只有管理员可以标记采纳状态。", flags: 64 });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`${SUGGESTION_REJECT_MODAL_PREFIX}${suggestionId}`)
    .setTitle("标记不采纳");

  const reasonInput = new TextInputBuilder()
    .setCustomId(SUGGESTION_REJECT_REASON_INPUT)
    .setLabel("不采纳原因（选填）")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("说明为什么不采纳这条意见……（留空也可以）")
    .setMaxLength(500)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  await interaction.showModal(modal);
}

export async function handleSuggestionRejectModal(
  interaction: ModalSubmitInteraction,
  suggestionId: number,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });
  const reason = interaction.fields.getTextInputValue(SUGGESTION_REJECT_REASON_INPUT).trim() || null;

  try {
    await db
      .update(suggestionTicketsTable)
      .set({ status: "rejected", rejectReason: reason })
      .where(eq(suggestionTicketsTable.id, suggestionId));

    await refreshSuggestionMessage(client, suggestionId);
    await interaction.editReply(`❌ 意见 #${suggestionId} 已标记为不采纳${reason ? "，理由已更新到意见中" : ""}。`);
    logger.info({ suggestionId, adminId: interaction.user.id }, "Suggestion rejected");
  } catch (err) {
    logger.error({ err }, "Failed to reject suggestion");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

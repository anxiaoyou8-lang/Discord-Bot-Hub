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
  SUGGESTION_UPVOTE_MODAL_PREFIX,
  SUGGESTION_UPVOTE_REASON_INPUT,
  SUGGESTION_DOWNVOTE_MODAL_PREFIX,
  SUGGESTION_DOWNVOTE_REASON_INPUT,
  SUGGESTION_REJECT_MODAL_PREFIX,
  SUGGESTION_REJECT_REASON_INPUT,
} from "../constants.js";
import { getConfig, CONFIG_KEY_SUGGESTION_CHANNEL } from "../config.js";
import { checkIsAdmin } from "../utils/adminCheck.js";

async function buildSuggestionEmbed(
  id: number,
  content: string,
  category: string | null | undefined,
  status: string,
  upvotes: number,
  downvotes: number,
  rejectReason?: string | null
) {
  const isArchived = status === "accepted" || status === "rejected";
  const statusTag = isArchived ? "📁 旧帖" : "🟢 新帖";
  const color = status === "accepted" ? 0x57f287 : status === "rejected" ? 0xed4245 : 0x5865f2;

  const total = upvotes + downvotes;
  const pct = total > 0 ? Math.round((upvotes / total) * 100) : 0;

  const embed = new EmbedBuilder()
    .setTitle(`📋 匿名投稿 #${id}${category ? `　·　${category}` : ""}`)
    .setDescription(content)
    .setColor(color)
    .setFooter({ text: "民众议会 · 匿名投稿 · 公开投票" })
    .setTimestamp();

  const voteBar =
    total > 0
      ? `👍 赞成 **${upvotes}**　　👎 反对 **${downvotes}**　（支持率 ${pct}%，共 ${total} 票）`
      : "尚无投票";

  embed.addFields({ name: "📊 当前投票", value: voteBar });
  embed.addFields({ name: "状态", value: statusTag, inline: true });

  if (status === "accepted") {
    embed.addFields({ name: "管理决定", value: "✅ 已采纳归档", inline: true });
  } else if (status === "rejected") {
    embed.addFields({ name: "管理决定", value: "❌ 不采纳归档", inline: true });
    if (rejectReason) {
      embed.addFields({ name: "📝 不采纳理由", value: rejectReason });
    }
  }

  const allVotes = await db
    .select({ voteType: suggestionVotesTable.voteType, reason: suggestionVotesTable.reason })
    .from(suggestionVotesTable)
    .where(eq(suggestionVotesTable.suggestionId, id));

  const upReasons = allVotes
    .filter((v) => v.voteType === "up" && v.reason?.trim())
    .map((v) => v.reason as string);

  const downReasons = allVotes
    .filter((v) => v.voteType === "down" && v.reason?.trim())
    .map((v) => v.reason as string);

  if (upReasons.length > 0) {
    const text = upReasons.map((r, i) => `${i + 1}. ${r}`).join("\n");
    embed.addFields({ name: `💬 赞成意见（${upReasons.length} 条）`, value: text.slice(0, 1024) });
  }

  if (downReasons.length > 0) {
    const text = downReasons.map((r, i) => `${i + 1}. ${r}`).join("\n");
    embed.addFields({ name: `💬 反对/改进建议（${downReasons.length} 条）`, value: text.slice(0, 1024) });
  }

  return embed;
}

function buildSuggestionComponents(suggestionId: number) {
  const upvoteBtn = new ButtonBuilder()
    .setCustomId(`suggestion_up_${suggestionId}`)
    .setLabel("赞成")
    .setEmoji("👍")
    .setStyle(ButtonStyle.Primary);

  const downvoteBtn = new ButtonBuilder()
    .setCustomId(`suggestion_down_${suggestionId}`)
    .setLabel("反对")
    .setEmoji("👎")
    .setStyle(ButtonStyle.Secondary);

  const acceptBtn = new ButtonBuilder()
    .setCustomId(`suggestion_accept_${suggestionId}`)
    .setLabel("采纳（归档）")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const rejectBtn = new ButtonBuilder()
    .setCustomId(`suggestion_reject_${suggestionId}`)
    .setLabel("不采纳（归档）")
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
        "有任何建议、想法或意见？点击下方匿名投稿，让大家一起参与讨论和投票！",
        "",
        "**投稿规则**",
        "• 完全**匿名**，任何人无法得知投稿者身份",
        "• 所有人可以选择**赞成**或**反对**，并附上理由或改进建议",
        "• 管理员决定采纳或不采纳后，帖子变为**旧帖**（仍可查看，不会删除）",
      ].join("\n")
    )
    .setColor(0x5865f2)
    .setFooter({ text: "民众议会 · 匿名投稿 · 公开投票" });

  const button = new ButtonBuilder()
    .setCustomId(SUGGESTION_PANEL_CUSTOM_ID)
    .setLabel("📮 匿名投稿")
    .setStyle(ButtonStyle.Primary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  };
}

export async function handleSuggestionButton(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(SUGGESTION_MODAL_ID)
    .setTitle("匿名投稿");

  const categoryInput = new TextInputBuilder()
    .setCustomId(SUGGESTION_CATEGORY_INPUT)
    .setLabel("分类（选填）")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("建议 / 问题 / 吐槽 / 表扬 / 其他")
    .setMaxLength(20)
    .setRequired(false);

  const contentInput = new TextInputBuilder()
    .setCustomId(SUGGESTION_TEXT_INPUT)
    .setLabel("投稿内容（必填）")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("写下你的想法、建议或任何意见……")
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
      await interaction.editReply("✅ 投稿已记录！（管理员尚未设置公开展示频道）");
      return;
    }

    const ch = await client.channels.fetch(suggestionChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) {
      await interaction.editReply("✅ 投稿已记录！（无法发送到展示频道，请联系管理员）");
      return;
    }

    const posted = await (ch as GuildTextBasedChannel).send({ embeds: [embed], components });

    await db
      .update(suggestionTicketsTable)
      .set({ messageId: posted.id, channelId: suggestionChannelId })
      .where(eq(suggestionTicketsTable.id, suggestionId));

    await interaction.editReply(`✅ 投稿 #${suggestionId} 已匿名发布！欢迎大家前往频道投票。`);
    logger.info({ suggestionId, guildId }, "Suggestion posted publicly");
  } catch (err) {
    logger.error({ err }, "Failed to submit suggestion");
    await interaction.editReply("❌ 投稿时出错，请稍后再试。");
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

async function processVote(
  interaction: ModalSubmitInteraction,
  suggestionId: number,
  voteType: "up" | "down",
  reason: string | null,
  client: Client
) {
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

    if (!suggestion) { await interaction.editReply("❌ 找不到该投稿。"); return; }

    let newUp = suggestion.upvotes;
    let newDown = suggestion.downvotes;
    let replyMsg = "";
    const label = voteType === "up" ? "👍 赞成" : "👎 反对";
    const otherType = voteType === "up" ? "down" : "up";

    if (existing.length > 0) {
      const prev = existing[0]!;
      if (prev.voteType === voteType) {
        if (reason !== null && reason.trim().length > 0) {
          // 更新理由
          await db.update(suggestionVotesTable).set({ reason }).where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)));
          replyMsg = `已更新你的${label}理由。`;
        } else {
          // 取消投票
          await db.delete(suggestionVotesTable).where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)));
          if (voteType === "up") newUp = Math.max(0, newUp - 1);
          else newDown = Math.max(0, newDown - 1);
          replyMsg = `已取消你的${label}。`;
        }
      } else {
        // 从另一方改到这一方
        await db.update(suggestionVotesTable).set({ voteType, reason }).where(and(eq(suggestionVotesTable.suggestionId, suggestionId), eq(suggestionVotesTable.userId, userId)));
        if (voteType === "up") { newUp += 1; newDown = Math.max(0, newDown - 1); }
        else { newDown += 1; newUp = Math.max(0, newUp - 1); }
        replyMsg = `已从${otherType === "up" ? "👍 赞成" : "👎 反对"}改为${label}。`;
      }
    } else {
      await db.insert(suggestionVotesTable).values({ suggestionId, userId, voteType, reason });
      if (voteType === "up") newUp += 1;
      else newDown += 1;
      replyMsg = `已选择${label}！`;
    }

    await db.update(suggestionTicketsTable).set({ upvotes: newUp, downvotes: newDown }).where(eq(suggestionTicketsTable.id, suggestionId));
    await refreshSuggestionMessage(client, suggestionId);
    await interaction.editReply(replyMsg);
  } catch (err) {
    logger.error({ err }, "Failed to process vote");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

function buildVoteModal(prefix: string, suggestionId: number, isUpvote: boolean) {
  const modal = new ModalBuilder()
    .setCustomId(`${prefix}${suggestionId}`)
    .setTitle(isUpvote ? "选择赞成" : "选择反对");

  const reasonInput = new TextInputBuilder()
    .setCustomId(isUpvote ? SUGGESTION_UPVOTE_REASON_INPUT : SUGGESTION_DOWNVOTE_REASON_INPUT)
    .setLabel(isUpvote ? "赞成理由或改进建议（选填）" : "反对理由或改进建议（选填）")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(isUpvote ? "说说你为什么赞成……（留空也可以）" : "说说你为什么反对，或提出改进方向……（留空也可以）")
    .setMaxLength(200)
    .setRequired(false);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  return modal;
}

export async function handleSuggestionUpvoteBtn(
  interaction: ButtonInteraction,
  suggestionId: number
) {
  await interaction.showModal(buildVoteModal(SUGGESTION_UPVOTE_MODAL_PREFIX, suggestionId, true));
}

export async function handleSuggestionUpvoteModal(
  interaction: ModalSubmitInteraction,
  suggestionId: number,
  client: Client
) {
  const reason = interaction.fields.getTextInputValue(SUGGESTION_UPVOTE_REASON_INPUT).trim() || null;
  await processVote(interaction, suggestionId, "up", reason, client);
}

export async function handleSuggestionDownvoteBtn(
  interaction: ButtonInteraction,
  suggestionId: number
) {
  await interaction.showModal(buildVoteModal(SUGGESTION_DOWNVOTE_MODAL_PREFIX, suggestionId, false));
}

export async function handleSuggestionDownvoteModal(
  interaction: ModalSubmitInteraction,
  suggestionId: number,
  client: Client
) {
  const reason = interaction.fields.getTextInputValue(SUGGESTION_DOWNVOTE_REASON_INPUT).trim() || null;
  await processVote(interaction, suggestionId, "down", reason, client);
}

export async function handleSuggestionAccept(
  interaction: ButtonInteraction,
  suggestionId: number,
  client: Client
) {
  const guildId = interaction.guildId ?? "";
  const member = interaction.member as GuildMember | null;
  if (!checkIsAdmin(guildId, member)) {
    await interaction.reply({ content: "❌ 只有管理员可以归档投稿。", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });
  try {
    await db.update(suggestionTicketsTable).set({ status: "accepted", rejectReason: null }).where(eq(suggestionTicketsTable.id, suggestionId));
    await refreshSuggestionMessage(client, suggestionId);
    await interaction.editReply(`✅ 投稿 #${suggestionId} 已采纳并归档为旧帖。`);
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
  if (!checkIsAdmin(guildId, member)) {
    await interaction.reply({ content: "❌ 只有管理员可以归档投稿。", flags: 64 });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`${SUGGESTION_REJECT_MODAL_PREFIX}${suggestionId}`)
    .setTitle("不采纳并归档");

  const reasonInput = new TextInputBuilder()
    .setCustomId(SUGGESTION_REJECT_REASON_INPUT)
    .setLabel("不采纳理由（选填）")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("说明为什么不采纳这条投稿……（留空也可以）")
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
    await interaction.editReply(`❌ 投稿 #${suggestionId} 已不采纳并归档为旧帖${reason ? "，理由已更新在帖子中" : ""}。`);
    logger.info({ suggestionId, adminId: interaction.user.id }, "Suggestion rejected");
  } catch (err) {
    logger.error({ err }, "Failed to reject suggestion");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

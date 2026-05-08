import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
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
  SUGGESTION_UPVOTE_PREFIX,
  SUGGESTION_DOWNVOTE_PREFIX,
  SUGGESTION_ACCEPT_PREFIX,
  SUGGESTION_REJECT_PREFIX,
} from "../constants.js";
import { getConfig, CONFIG_KEY_SUGGESTION_CHANNEL, CONFIG_KEY_ADMIN_ROLE } from "../config.js";
import { PermissionFlagsBits } from "discord.js";

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

function buildSuggestionEmbed(
  id: number,
  content: string,
  category: string | null | undefined,
  status: string,
  upvotes: number,
  downvotes: number
) {
  const categoryTag = category ? `**[${category}]** ` : "";
  const statusLabel = STATUS_LABELS[status] ?? STATUS_LABELS.pending!;
  const color = STATUS_COLORS[status] ?? STATUS_COLORS.pending!;
  const total = upvotes + downvotes;
  const pct = total > 0 ? Math.round((upvotes / total) * 100) : 0;

  return new EmbedBuilder()
    .setTitle(`💡 意见 #${id}${category ? ` · ${category}` : ""}`)
    .setDescription(`${categoryTag}${content}`)
    .setColor(color)
    .addFields(
      { name: "状态", value: statusLabel, inline: true },
      { name: "👍 支持", value: `${upvotes}`, inline: true },
      { name: "👎 反对", value: `${downvotes}`, inline: true },
      ...(total > 0
        ? [{ name: "支持率", value: `${pct}%（共 ${total} 票）`, inline: true }]
        : [])
    )
    .setFooter({ text: "匿名提交 · 灰月光可标记采纳状态" })
    .setTimestamp();
}

function buildSuggestionComponents(suggestionId: number) {
  const upvoteBtn = new ButtonBuilder()
    .setCustomId(`${SUGGESTION_UPVOTE_PREFIX}${suggestionId}`)
    .setLabel("支持")
    .setEmoji("👍")
    .setStyle(ButtonStyle.Primary);

  const downvoteBtn = new ButtonBuilder()
    .setCustomId(`${SUGGESTION_DOWNVOTE_PREFIX}${suggestionId}`)
    .setLabel("反对")
    .setEmoji("👎")
    .setStyle(ButtonStyle.Secondary);

  const acceptBtn = new ButtonBuilder()
    .setCustomId(`${SUGGESTION_ACCEPT_PREFIX}${suggestionId}`)
    .setLabel("标记采纳")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const rejectBtn = new ButtonBuilder()
    .setCustomId(`${SUGGESTION_REJECT_PREFIX}${suggestionId}`)
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
        "• 管理员可标记意见的采纳状态",
        "• 建议类型：建议 / 问题 / 吐槽 / 表扬 / 其他",
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

    const embed = buildSuggestionEmbed(suggestionId, content, category, "pending", 0, 0);
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

  const suggestion = rows[0];
  if (!suggestion || !suggestion.messageId || !suggestion.channelId) return;

  const ch = await client.channels.fetch(suggestion.channelId).catch(() => null);
  if (!ch || !ch.isTextBased()) return;

  const msg = await (ch as GuildTextBasedChannel).messages
    .fetch(suggestion.messageId)
    .catch(() => null);
  if (!msg) return;

  const embed = buildSuggestionEmbed(
    suggestion.id,
    suggestion.content,
    suggestion.category,
    suggestion.status,
    suggestion.upvotes,
    suggestion.downvotes
  );
  const components = buildSuggestionComponents(suggestionId);

  await msg.edit({ embeds: [embed], components }).catch((e) => {
    logger.warn({ e }, "Failed to refresh suggestion message");
  });
}

export async function handleSuggestionVote(
  interaction: ButtonInteraction,
  suggestionId: number,
  voteType: "up" | "down",
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const userId = interaction.user.id;

  try {
    const existingVote = await db
      .select()
      .from(suggestionVotesTable)
      .where(
        and(
          eq(suggestionVotesTable.suggestionId, suggestionId),
          eq(suggestionVotesTable.userId, userId)
        )
      )
      .limit(1);

    const suggestion = await db
      .select()
      .from(suggestionTicketsTable)
      .where(eq(suggestionTicketsTable.id, suggestionId))
      .limit(1)
      .then((r) => r[0]);

    if (!suggestion) {
      await interaction.editReply("❌ 找不到该意见。");
      return;
    }

    let newUpvotes = suggestion.upvotes;
    let newDownvotes = suggestion.downvotes;
    let replyMsg = "";

    if (existingVote.length > 0) {
      const prev = existingVote[0]!.voteType;
      if (prev === voteType) {
        // 取消投票
        await db
          .delete(suggestionVotesTable)
          .where(
            and(
              eq(suggestionVotesTable.suggestionId, suggestionId),
              eq(suggestionVotesTable.userId, userId)
            )
          );
        if (voteType === "up") newUpvotes = Math.max(0, newUpvotes - 1);
        else newDownvotes = Math.max(0, newDownvotes - 1);
        replyMsg = "已取消你的投票。";
      } else {
        // 切换票
        await db
          .update(suggestionVotesTable)
          .set({ voteType })
          .where(
            and(
              eq(suggestionVotesTable.suggestionId, suggestionId),
              eq(suggestionVotesTable.userId, userId)
            )
          );
        if (voteType === "up") {
          newUpvotes += 1;
          newDownvotes = Math.max(0, newDownvotes - 1);
        } else {
          newDownvotes += 1;
          newUpvotes = Math.max(0, newUpvotes - 1);
        }
        replyMsg = voteType === "up" ? "已改为 👍 支持。" : "已改为 👎 反对。";
      }
    } else {
      // 新投票
      await db.insert(suggestionVotesTable).values({ suggestionId, userId, voteType });
      if (voteType === "up") newUpvotes += 1;
      else newDownvotes += 1;
      replyMsg = voteType === "up" ? "已投 👍 支持！" : "已投 👎 反对！";
    }

    await db
      .update(suggestionTicketsTable)
      .set({ upvotes: newUpvotes, downvotes: newDownvotes })
      .where(eq(suggestionTicketsTable.id, suggestionId));

    await refreshSuggestionMessage(client, suggestionId);
    await interaction.editReply(replyMsg);
  } catch (err) {
    logger.error({ err }, "Failed to handle suggestion vote");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

export async function handleSuggestionStatus(
  interaction: ButtonInteraction,
  suggestionId: number,
  status: "accepted" | "rejected",
  client: Client
) {
  // 权限检查
  const guildId = interaction.guildId ?? "";
  const adminRoleId = getConfig(guildId, CONFIG_KEY_ADMIN_ROLE);
  const member = interaction.member as GuildMember | null;
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

  if (!isDiscordAdmin && !hasAdminRole) {
    await interaction.reply({ content: "❌ 只有管理员可以标记采纳状态。", flags: 64 });
    return;
  }

  await interaction.deferReply({ flags: 64 });

  try {
    await db
      .update(suggestionTicketsTable)
      .set({ status })
      .where(eq(suggestionTicketsTable.id, suggestionId));

    await refreshSuggestionMessage(client, suggestionId);

    const label = status === "accepted" ? "✅ 已采纳" : "❌ 已标记为不采纳";
    await interaction.editReply(`${label}（意见 #${suggestionId}）`);
    logger.info({ suggestionId, status, adminId: interaction.user.id }, "Suggestion status updated");
  } catch (err) {
    logger.error({ err }, "Failed to update suggestion status");
    await interaction.editReply("更新失败，请稍后再试。");
  }
}

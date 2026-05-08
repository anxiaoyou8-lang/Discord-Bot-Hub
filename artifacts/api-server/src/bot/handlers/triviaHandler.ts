import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { db, triviaTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import {
  TRIVIA_DRAW_BTN_ID,
  TRIVIA_ADD_MODAL_ID,
  TRIVIA_ADD_TEXT_INPUT,
} from "../constants.js";

export function buildTriviaPanel() {
  const embed = new EmbedBuilder()
    .setTitle("💬 闲话时间")
    .setDescription("点击下方按钮，随机抽取一则冷知识或有趣的闲话！")
    .setColor(0x57f287);

  const drawBtn = new ButtonBuilder()
    .setCustomId(TRIVIA_DRAW_BTN_ID)
    .setLabel("抽取闲话")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🎲");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(drawBtn);
  return { embeds: [embed], components: [row] };
}

export async function handleTriviaDrawButton(interaction: ButtonInteraction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("此功能只能在服务器中使用。");
    return;
  }

  try {
    const rows = await db
      .select()
      .from(triviaTable)
      .where(eq(triviaTable.guildId, guildId));

    if (rows.length === 0) {
      await interaction.editReply("目前还没有闲话，快让管理员来添加吧！");
      return;
    }

    const picked = rows[Math.floor(Math.random() * rows.length)]!;
    const embed = new EmbedBuilder()
      .setTitle("💬 今日闲话")
      .setDescription(picked.content)
      .setColor(0x57f287)
      .setFooter({ text: `共 ${rows.length} 则闲话 · 随机抽取` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Failed to draw trivia");
    await interaction.editReply("抽取失败，请稍后再试。");
  }
}

const TRIVIA_INPUT_COUNT = 5;

export async function handleAddTrivia(interaction: ChatInputCommandInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(TRIVIA_ADD_MODAL_ID)
    .setTitle("批量添加闲话 / 冷知识（最多5条）");

  for (let i = 0; i < TRIVIA_INPUT_COUNT; i++) {
    const input = new TextInputBuilder()
      .setCustomId(`${TRIVIA_ADD_TEXT_INPUT}_${i}`)
      .setLabel(`第 ${i + 1} 条${i === 0 ? "（必填）" : "（选填）"}`)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("输入一则闲话或冷知识……")
      .setMaxLength(500)
      .setRequired(i === 0);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  await interaction.showModal(modal);
}

export async function handleAddTriviaModal(interaction: ModalSubmitInteraction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guildId ?? "";
  const entries: string[] = [];

  for (let i = 0; i < TRIVIA_INPUT_COUNT; i++) {
    const val = interaction.fields.getTextInputValue(`${TRIVIA_ADD_TEXT_INPUT}_${i}`).trim();
    if (val) entries.push(val);
  }

  if (entries.length === 0) {
    await interaction.editReply("❌ 没有填写任何内容。");
    return;
  }

  try {
    const result = await db
      .insert(triviaTable)
      .values(entries.map((content) => ({ content, authorId: interaction.user.id, guildId })))
      .returning({ id: triviaTable.id, content: triviaTable.content });

    const lines = result.map((r) => `> **[${r.id}]** ${r.content}`).join("\n");
    await interaction.editReply(`✅ 已添加 ${result.length} 条闲话：\n${lines}`);
    logger.info({ count: result.length, authorId: interaction.user.id, guildId }, "Trivia batch added");
  } catch (err) {
    logger.error({ err }, "Failed to add trivia");
    await interaction.editReply("添加失败，请稍后再试。");
  }
}

export async function handleDeleteTrivia(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const id = interaction.options.getInteger("id", true);
  const guildId = interaction.guildId ?? "";

  try {
    const deleted = await db
      .delete(triviaTable)
      .where(and(eq(triviaTable.id, id), eq(triviaTable.guildId, guildId)))
      .returning({ id: triviaTable.id, content: triviaTable.content });

    if (deleted.length === 0) {
      await interaction.editReply(`❌ 找不到 ID 为 \`${id}\` 的闲话。`);
      return;
    }

    await interaction.editReply(`✅ 已删除闲话（ID: \`${id}\`）：\n> ${deleted[0]!.content}`);
    logger.info({ id, guildId }, "Trivia deleted");
  } catch (err) {
    logger.error({ err }, "Failed to delete trivia");
    await interaction.editReply("删除失败，请稍后再试。");
  }
}

export async function handleListTrivia(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guildId ?? "";

  try {
    const rows = await db
      .select()
      .from(triviaTable)
      .where(eq(triviaTable.guildId, guildId));

    if (rows.length === 0) {
      await interaction.editReply("目前没有任何闲话，使用 `/添加闲话` 来添加！");
      return;
    }

    const list = rows.map((r) => `**[${r.id}]** ${r.content}`).join("\n");

    const embed = new EmbedBuilder()
      .setTitle(`📋 闲话列表（共 ${rows.length} 则）`)
      .setDescription(list.slice(0, 4000))
      .setColor(0x57f287);

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Failed to list trivia");
    await interaction.editReply("获取列表失败，请稍后再试。");
  }
}

export async function getRandomTrivia(guildId: string): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(triviaTable)
      .where(eq(triviaTable.guildId, guildId));

    if (rows.length === 0) return null;
    return rows[Math.floor(Math.random() * rows.length)]!.content;
  } catch {
    return null;
  }
}

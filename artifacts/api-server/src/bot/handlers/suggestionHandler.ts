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
  type GuildTextBasedChannel,
  type ModalSubmitInteraction,
} from "discord.js";
import { db, suggestionTicketsTable } from "@workspace/db";
import { logger } from "../../lib/logger.js";
import {
  SUGGESTION_PANEL_CUSTOM_ID,
  SUGGESTION_MODAL_ID,
  SUGGESTION_TEXT_INPUT,
} from "../constants.js";
import { getConfig, CONFIG_KEY_SUGGESTION_CHANNEL } from "../config.js";

export function buildSuggestionPanel() {
  const embed = new EmbedBuilder()
    .setTitle("💡 匿名意见箱")
    .setDescription(
      [
        "有任何想法、建议或意见都可以通过下方按钮匿名提交！",
        "",
        "• 你的身份信息**不会**出现在意见内容中",
        "• 意见将由管理员在内部频道查看",
        "• 欢迎如实表达，请勿滥用",
      ].join("\n")
    )
    .setColor(0x5865f2)
    .setFooter({ text: "意见完全匿名，管理员无法得知提交者身份" });

  const button = new ButtonBuilder()
    .setCustomId(SUGGESTION_PANEL_CUSTOM_ID)
    .setLabel("提交意见")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("💡");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return { embeds: [embed], components: [row] };
}

export async function handleSuggestionButton(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(SUGGESTION_MODAL_ID)
    .setTitle("匿名意见箱");

  const textInput = new TextInputBuilder()
    .setCustomId(SUGGESTION_TEXT_INPUT)
    .setLabel("你的意见或建议")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("在这里写下你的想法，可以是建议、反馈或任何意见……")
    .setMinLength(5)
    .setMaxLength(1000)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));
  await interaction.showModal(modal);
}

export async function handleSuggestionModal(
  interaction: ModalSubmitInteraction,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const content = interaction.fields.getTextInputValue(SUGGESTION_TEXT_INPUT).trim();
  const guildId = interaction.guildId ?? "";

  try {
    const result = await db
      .insert(suggestionTicketsTable)
      .values({ guildId, content })
      .returning({ id: suggestionTicketsTable.id });

    const ticketId = result[0]?.id ?? 0;

    const suggestionChannelId = getConfig(guildId, CONFIG_KEY_SUGGESTION_CHANNEL);
    if (suggestionChannelId) {
      const ch = await client.channels.fetch(suggestionChannelId).catch(() => null);
      if (ch && ch.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`💡 匿名意见 #${ticketId}`)
          .setDescription(content)
          .setColor(0x5865f2)
          .setFooter({ text: "此意见完全匿名，系统未记录提交者身份" })
          .setTimestamp();

        await (ch as GuildTextBasedChannel).send({ embeds: [embed] });
        logger.info({ ticketId, guildId }, "Suggestion sent to log channel");
      }
    }

    await interaction.editReply(
      `✅ 意见 #${ticketId} 已匿名提交！感谢你的反馈，管理员将会查阅。`
    );
  } catch (err) {
    logger.error({ err }, "Failed to submit suggestion");
    await interaction.editReply("❌ 提交时出错，请稍后再试。");
  }
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type GuildTextBasedChannel,
  type Client,
} from "discord.js";
import { db, complaintTicketsTable } from "@workspace/db";
import { logger } from "../../lib/logger.js";
import {
  COMPLAINT_PANEL_CUSTOM_ID,
  COMPLAINT_SUBMIT_MODAL_ID,
  COMPLAINT_TEXT_INPUT,
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
  const modal = new ModalBuilder()
    .setCustomId(COMPLAINT_SUBMIT_MODAL_ID)
    .setTitle("匿名投诉");

  const contentInput = new TextInputBuilder()
    .setCustomId(COMPLAINT_TEXT_INPUT)
    .setLabel("投诉内容")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("请详细描述你想反映的问题……")
    .setRequired(true)
    .setMaxLength(1500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput)
  );

  await interaction.showModal(modal);
}

export async function handleComplaintSubmitModal(
  interaction: ModalSubmitInteraction,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply("此操作只能在服务器中使用。");
    return;
  }

  const content = interaction.fields.getTextInputValue(COMPLAINT_TEXT_INPUT);

  try {
    const result = await db
      .insert(complaintTicketsTable)
      .values({ guildId: guild.id, content })
      .returning({ id: complaintTicketsTable.id });

    const ticketId = result[0]?.id ?? 0;

    const complaintChannelId = getConfig(guild.id, CONFIG_KEY_COMPLAINT_CHANNEL);
    if (complaintChannelId) {
      const complaintChannel = await client.channels.fetch(complaintChannelId).catch(() => null);
      if (complaintChannel && complaintChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`📢 匿名投诉工单 #${ticketId}`)
          .setDescription(content)
          .setColor(0xffa500)
          .setFooter({ text: "此投诉完全匿名，系统未记录投诉者身份" })
          .setTimestamp();

        await (complaintChannel as GuildTextBasedChannel).send({ embeds: [embed] });
        logger.info({ ticketId, guildId: guild.id }, "Complaint ticket sent to log channel");
      } else {
        logger.warn({ complaintChannelId }, "Complaint channel not found or not text based");
      }
    } else {
      logger.warn({ guildId: guild.id }, "No complaint channel configured");
    }

    await interaction.editReply(
      `✅ 你的投诉（工单 #${ticketId}）已匿名提交，管理员将会查阅。感谢你的反馈！`
    );
  } catch (err) {
    logger.error({ err }, "Failed to submit complaint");
    await interaction.editReply("提交投诉时出错，请稍后再试。");
  }
}

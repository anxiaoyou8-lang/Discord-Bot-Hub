import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type GuildMember,
  type TextChannel,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { db } from "@workspace/db";
import { reviewThreadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import {
  REVIEW_PANEL_CUSTOM_ID,
  REVIEW_APPROVE_PREFIX,
  REVIEW_REJECT_PREFIX,
  REVIEW_SUBMIT_MODAL,
  REVIEW_TEXT_INPUT,
} from "../constants.js";
import { getConfig, CONFIG_KEY_ADMIN_ROLE } from "../config.js";

export { REVIEW_PANEL_CUSTOM_ID, REVIEW_APPROVE_PREFIX, REVIEW_REJECT_PREFIX, REVIEW_SUBMIT_MODAL };

export function buildReviewPanel() {
  const embed = new EmbedBuilder()
    .setTitle("服务器审核")
    .setDescription(
      [
        "欢迎申请加入！请在提交前准备好以下资料：",
        "",
        "**所需资料：**",
        "• 个人介绍（文字）",
        "• 相关证明材料（图片/文件）",
        "• 加入原因",
        "",
        "点击下方按钮开始提交审核材料。",
        "系统将为你创建一个专属的私密审核子区，仅你和管理员可见。",
      ].join("\n")
    )
    .setColor(0x5865f2)
    .setFooter({ text: "请如实填写，审核结果将通过私信通知你" });

  const button = new ButtonBuilder()
    .setCustomId(REVIEW_PANEL_CUSTOM_ID)
    .setLabel("提交审核材料")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("📋");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return { embeds: [embed], components: [row] };
}

export async function handleReviewPanelButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;
  if (!guild) return;

  const existing = await db
    .select()
    .from(reviewThreadsTable)
    .where(eq(reviewThreadsTable.userId, interaction.user.id))
    .limit(1);

  if (existing.length > 0 && existing[0]!.status === "pending") {
    await interaction.reply({
      content: "你已经有一个正在处理中的审核申请，请等待管理员审核完毕。",
      flags: 64,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(REVIEW_SUBMIT_MODAL)
    .setTitle("提交审核材料");

  const textInput = new TextInputBuilder()
    .setCustomId(REVIEW_TEXT_INPUT)
    .setLabel("请填写个人介绍和加入原因")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("例如：我叫XXX，想加入是因为……")
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(textInput)
  );

  await interaction.showModal(modal);
}

export async function handleReviewModalSubmit(
  interaction: ModalSubmitInteraction
) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply({ flags: 64 });

  const textContent = interaction.fields.getTextInputValue(REVIEW_TEXT_INPUT);

  try {
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.editReply("无法创建审核子区，请联系管理员。");
      return;
    }

    const textChannel = channel as TextChannel;
    const thread = await textChannel.threads.create({
      name: `审核申请-${interaction.user.username}`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: ChannelType.PrivateThread,
      reason: `用户 ${interaction.user.tag} 的审核申请`,
      invitable: false,
    });

    await thread.members.add(interaction.user.id);

    const adminRoleId = getConfig(guild.id, CONFIG_KEY_ADMIN_ROLE);
    if (adminRoleId) {
      const adminRole = guild.roles.cache.get(adminRoleId);
      if (adminRole) {
        for (const [, guildMember] of adminRole.members) {
          await thread.members.add(guildMember.id).catch(() => {});
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`审核申请 — ${interaction.user.tag}`)
      .setDescription(
        [
          `**申请人：** <@${interaction.user.id}>`,
          `**提交时间：** <t:${Math.floor(Date.now() / 1000)}:F>`,
          "",
          "**个人介绍 / 加入原因：**",
          textContent,
          "",
          "请在下方上传证明材料（图片/文件），完成后等待管理员审核。",
        ].join("\n")
      )
      .setColor(0xffa500)
      .setThumbnail(interaction.user.displayAvatarURL());

    const approveBtn = new ButtonBuilder()
      .setCustomId(`${REVIEW_APPROVE_PREFIX}${interaction.user.id}`)
      .setLabel("通过审核")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅");

    const rejectBtn = new ButtonBuilder()
      .setCustomId(`${REVIEW_REJECT_PREFIX}${interaction.user.id}`)
      .setLabel("拒绝申请")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      approveBtn,
      rejectBtn
    );

    const panelMsg = await thread.send({
      embeds: [embed],
      components: [row],
    });

    await panelMsg.pin().catch(() => {});

    await db.insert(reviewThreadsTable).values({
      threadId: thread.id,
      userId: interaction.user.id,
      guildId: guild.id,
      status: "pending",
      locked: false,
    });

    await interaction.editReply(
      `已为你创建专属审核子区 <#${thread.id}>，请前往上传证明材料（图片/文件）。`
    );
  } catch (err) {
    logger.error({ err }, "Failed to create review thread");
    await interaction.editReply("创建审核子区时出错，请联系管理员。");
  }
}

export async function handleReviewApprove(
  interaction: ButtonInteraction,
  targetUserId: string
) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply({ flags: 64 });

  const adminRoleId = getConfig(guild.id, CONFIG_KEY_ADMIN_ROLE);
  const member = interaction.member as GuildMember;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const hasAdminRole = adminRoleId
    ? member.roles.cache.has(adminRoleId)
    : false;

  if (!isAdmin && !hasAdminRole) {
    await interaction.editReply("你没有权限执行此操作。");
    return;
  }

  try {
    const thread = interaction.channel;
    if (!thread || !thread.isThread()) {
      await interaction.editReply("无效的操作环境。");
      return;
    }

    await db
      .update(reviewThreadsTable)
      .set({
        status: "approved",
        locked: true,
        reviewedAt: new Date(),
        reviewedBy: interaction.user.id,
      })
      .where(eq(reviewThreadsTable.threadId, thread.id));

    await thread.setLocked(true);
    await thread.setArchived(true);

    const targetMember = await guild.members
      .fetch(targetUserId)
      .catch(() => null);

    if (targetMember) {
      try {
        await targetMember.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("审核结果通知")
              .setDescription(
                `恭喜！你在 **${guild.name}** 的审核申请已 **通过**！\n\n欢迎正式加入！如有疑问请联系管理员。`
              )
              .setColor(0x57f287)
              .setTimestamp(),
          ],
        });
      } catch {
        logger.warn({ targetUserId }, "Could not DM user about approval");
      }
    }

    await interaction.editReply(
      `已通过 <@${targetUserId}> 的审核，子区已锁定并归档。`
    );
  } catch (err) {
    logger.error({ err }, "Failed to approve review");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

export async function handleReviewReject(
  interaction: ButtonInteraction,
  targetUserId: string
) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply({ flags: 64 });

  const adminRoleId = getConfig(guild.id, CONFIG_KEY_ADMIN_ROLE);
  const member = interaction.member as GuildMember;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const hasAdminRole = adminRoleId
    ? member.roles.cache.has(adminRoleId)
    : false;

  if (!isAdmin && !hasAdminRole) {
    await interaction.editReply("你没有权限执行此操作。");
    return;
  }

  try {
    const thread = interaction.channel;
    if (!thread || !thread.isThread()) {
      await interaction.editReply("无效的操作环境。");
      return;
    }

    await db
      .update(reviewThreadsTable)
      .set({
        status: "rejected",
        locked: true,
        reviewedAt: new Date(),
        reviewedBy: interaction.user.id,
      })
      .where(eq(reviewThreadsTable.threadId, thread.id));

    await thread.setLocked(true);
    await thread.setArchived(true);

    const targetMember = await guild.members
      .fetch(targetUserId)
      .catch(() => null);

    if (targetMember) {
      try {
        await targetMember.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("审核结果通知")
              .setDescription(
                `很遗憾，你在 **${guild.name}** 的审核申请未能通过。\n\n如有疑问，请联系管理员。`
              )
              .setColor(0xed4245)
              .setTimestamp(),
          ],
        });
      } catch {
        logger.warn({ targetUserId }, "Could not DM user about rejection");
      }
    }

    await interaction.editReply(
      `已拒绝 <@${targetUserId}> 的审核申请，子区已锁定并归档。`
    );
  } catch (err) {
    logger.error({ err }, "Failed to reject review");
    await interaction.editReply("操作失败，请稍后再试。");
  }
}

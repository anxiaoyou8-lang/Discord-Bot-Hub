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
  type Client,
  ThreadAutoArchiveDuration,
} from "discord.js";
import { db } from "@workspace/db";
import { reviewThreadsTable } from "@workspace/db";
import { eq, and, lt } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import {
  REVIEW_PANEL_CUSTOM_ID,
  REVIEW_APPROVE_PREFIX,
  REVIEW_REJECT_PREFIX,
  REVIEW_SUBMIT_TEXT_PREFIX,
  REVIEW_SUBMIT_FILE_PREFIX,
  REVIEW_DELETE_PREFIX,
  REVIEW_TEXT_MODAL_PREFIX,
  REVIEW_TEXT_INPUT,
} from "../constants.js";
import { getConfig, CONFIG_KEY_ADMIN_ROLE, CONFIG_KEY_APPROVE_ROLE } from "../config.js";

export function buildReviewPanel() {
  const embed = new EmbedBuilder()
    .setTitle("服务器审核")
    .setDescription(
      [
        "欢迎申请加入！点击下方按钮开始提交审核材料。",
        "",
        "**审核所需提交内容：**",
        "• 年龄性别认证（图片/文件）",
        "• 加入原因（文字）",
        "",
        "系统将为你创建一个专属的私密审核子区，仅你和管理员可见。",
      ].join("\n")
    )
    .setColor(0x5865f2)
    .setFooter({ text: "审核结果将通过私信通知你" });

  const button = new ButtonBuilder()
    .setCustomId(REVIEW_PANEL_CUSTOM_ID)
    .setLabel("提交审核材料")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("📋");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return { embeds: [embed], components: [row] };
}

function isAdminMember(
  interaction: ButtonInteraction,
  adminRoleId: string | undefined
): boolean {
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  const member = interaction.member as GuildMember;
  const hasAdminRole = adminRoleId ? member.roles.cache.has(adminRoleId) : false;
  return isAdmin || hasAdminRole;
}

export async function handleReviewPanelButton(
  interaction: ButtonInteraction,
  client: Client
) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply({ flags: 64 });

  const existing = await db
    .select()
    .from(reviewThreadsTable)
    .where(
      and(
        eq(reviewThreadsTable.userId, interaction.user.id),
        eq(reviewThreadsTable.status, "pending")
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await interaction.editReply(
      `你已经有一个正在处理中的审核申请 <#${existing[0]!.threadId}>，请等待管理员审核完毕。`
    );
    return;
  }

  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.editReply("无法创建审核子区，请联系管理员。");
    return;
  }

  try {
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
      try {
        const allMembers = await guild.members.fetch();
        const adminMembers = allMembers.filter((m) =>
          m.roles.cache.has(adminRoleId)
        );
        for (const [, member] of adminMembers) {
          await thread.members.add(member.id).catch(() => {});
        }
      } catch (err) {
        logger.warn({ err }, "Could not fetch guild members to add to thread");
      }
    }

    const autoDeleteAt = Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000);

    const instructionEmbed = new EmbedBuilder()
      .setTitle(`📋 审核申请 — ${interaction.user.username}`)
      .setDescription(
        [
          `**申请人：** <@${interaction.user.id}>`,
          `**创建时间：** <t:${Math.floor(Date.now() / 1000)}:F>`,
          `**自动删除：** <t:${autoDeleteAt}:R>`,
          "",
          "**请使用下方按钮提交所需材料：**",
          "📄 **提交文字** — 填写加入原因",
          "🖼️ **提交文件** — 上传年龄性别认证（图片/文件）",
          "",
          "若需取消申请，点击「删除工单」按钮。",
        ].join("\n")
      )
      .setColor(0xffa500)
      .setThumbnail(interaction.user.displayAvatarURL());

    const deleteBtn = new ButtonBuilder()
      .setCustomId(`${REVIEW_DELETE_PREFIX}${thread.id}`)
      .setLabel("删除工单")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🗑️");

    const submitTextBtn = new ButtonBuilder()
      .setCustomId(`${REVIEW_SUBMIT_TEXT_PREFIX}${thread.id}`)
      .setLabel("提交文字")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📄");

    const submitFileBtn = new ButtonBuilder()
      .setCustomId(`${REVIEW_SUBMIT_FILE_PREFIX}${thread.id}`)
      .setLabel("提交文件")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🖼️");

    const userRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      deleteBtn,
      submitTextBtn,
      submitFileBtn
    );

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

    const adminRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      approveBtn,
      rejectBtn
    );

    const adminEmbed = new EmbedBuilder()
      .setTitle("管理员审核面板")
      .setDescription("审核材料提交完毕后，请点击下方按钮进行审核。")
      .setColor(0x57f287);

    const panelMsg = await thread.send({
      embeds: [instructionEmbed],
      components: [userRow],
    });

    await thread.send({
      embeds: [adminEmbed],
      components: [adminRow],
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
      `已为你创建专属审核子区 <#${thread.id}>，请前往提交所需材料。`
    );
  } catch (err) {
    logger.error({ err }, "Failed to create review thread");
    await interaction.editReply("创建审核子区时出错，请联系管理员。");
  }
}

export async function handleReviewSubmitTextBtn(
  interaction: ButtonInteraction,
  threadId: string
) {
  const modal = new ModalBuilder()
    .setCustomId(`${REVIEW_TEXT_MODAL_PREFIX}${threadId}`)
    .setTitle("提交加入原因");

  const textInput = new TextInputBuilder()
    .setCustomId(REVIEW_TEXT_INPUT)
    .setLabel("请填写你的加入原因")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("请如实说明你的加入原因……")
    .setRequired(true)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(textInput)
  );

  await interaction.showModal(modal);
}

export async function handleReviewTextModalSubmit(
  interaction: ModalSubmitInteraction,
  threadId: string
) {
  const textContent = interaction.fields.getTextInputValue(REVIEW_TEXT_INPUT);
  await interaction.deferReply({ flags: 64 });

  const thread = interaction.channel;
  if (!thread || !thread.isThread()) {
    await interaction.editReply("无效的操作环境。");
    return;
  }

  await thread.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("📄 加入原因")
        .setDescription(textContent)
        .setColor(0x5865f2)
        .setFooter({ text: `提交者：${interaction.user.tag}` })
        .setTimestamp(),
    ],
  });

  await interaction.editReply("文字内容已提交！");
}

export async function handleReviewSubmitFileBtn(
  interaction: ButtonInteraction
) {
  await interaction.reply({
    content:
      "请直接在此子区中发送你的年龄性别认证文件（图片/文件）作为消息附件即可，管理员将能看到你上传的内容。",
    flags: 64,
  });
}

export async function handleReviewDeleteTicket(
  interaction: ButtonInteraction,
  threadId: string
) {
  const guild = interaction.guild;
  if (!guild) return;

  const records = await db
    .select()
    .from(reviewThreadsTable)
    .where(eq(reviewThreadsTable.threadId, threadId))
    .limit(1);

  const record = records[0];
  if (!record) {
    await interaction.reply({ content: "找不到对应的工单记录。", flags: 64 });
    return;
  }

  const adminRoleId = getConfig(guild.id, CONFIG_KEY_ADMIN_ROLE);
  const isOwner = interaction.user.id === record.userId;
  const canDelete = isOwner || isAdminMember(interaction, adminRoleId);

  if (!canDelete) {
    await interaction.reply({ content: "你没有权限删除此工单。", flags: 64 });
    return;
  }

  await interaction.reply({ content: "正在删除工单……", flags: 64 });

  const thread = interaction.channel;
  if (thread && thread.isThread()) {
    await thread.delete("用户手动删除工单").catch(() => {});
  }

  await db
    .update(reviewThreadsTable)
    .set({ status: "deleted" })
    .where(eq(reviewThreadsTable.threadId, threadId));
}

export async function handleReviewApprove(
  interaction: ButtonInteraction,
  targetUserId: string
) {
  const guild = interaction.guild;
  if (!guild) return;

  await interaction.deferReply({ flags: 64 });

  const adminRoleId = getConfig(guild.id, CONFIG_KEY_ADMIN_ROLE);
  if (!isAdminMember(interaction, adminRoleId)) {
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

    const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

    if (targetMember) {
      const approveRoleId = getConfig(guild.id, CONFIG_KEY_APPROVE_ROLE);
      if (approveRoleId) {
        try {
          await targetMember.roles.add(approveRoleId, "审核通过自动赋予");
          logger.info({ targetUserId, approveRoleId }, "Assigned approve role to member");
        } catch (err) {
          logger.error({ err, targetUserId, approveRoleId }, "Failed to assign approve role");
        }
      }

      try {
        await targetMember.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("审核结果通知")
              .setDescription(
                `恭喜！你在 **${guild.name}** 的审核申请已 **通过**！\n\n你已自动获得对应身分组，欢迎正式加入！`
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
      `已通过 <@${targetUserId}> 的审核${getConfig(guild.id, CONFIG_KEY_APPROVE_ROLE) ? "，并已自动赋予身分组" : ""}，子区已锁定并归档。`
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
  if (!isAdminMember(interaction, adminRoleId)) {
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

    const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
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

export async function runAutoDeleteScheduler(client: Client) {
  const check = async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const oldThreads = await db
        .select()
        .from(reviewThreadsTable)
        .where(
          and(
            eq(reviewThreadsTable.status, "pending"),
            lt(reviewThreadsTable.createdAt, cutoff)
          )
        );

      for (const record of oldThreads) {
        const channel = await client.channels.fetch(record.threadId).catch(() => null);
        if (channel && channel.isThread()) {
          await channel.delete("24小时自动删除").catch(() => {});
        }
        await db
          .update(reviewThreadsTable)
          .set({ status: "expired" })
          .where(eq(reviewThreadsTable.threadId, record.threadId));
        logger.info({ threadId: record.threadId }, "Auto-deleted expired review thread");
      }
    } catch (err) {
      logger.error({ err }, "Auto-delete scheduler error");
    }
  };

  await check();
  setInterval(check, 10 * 60 * 1000);
}

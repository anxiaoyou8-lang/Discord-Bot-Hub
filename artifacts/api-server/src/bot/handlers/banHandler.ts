import {
  ActionRowBuilder,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
  type ModalSubmitInteraction,
  type GuildMember,
  type Client,
  type GuildTextBasedChannel,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import {
  BAN_ACTION_SELECT_ID,
  BAN_TARGET_SELECT_PREFIX,
  BAN_MODAL_PREFIX,
  BAN_REASON_INPUT,
  BAN_EVIDENCE_INPUT,
  KICK_MODAL_PREFIX,
  KICK_REASON_INPUT,
  MUTE_MODAL_PREFIX,
  MUTE_REASON_INPUT,
  BAN_ADMIN_CONTACT,
} from "../constants.js";
import { getConfig, CONFIG_KEY_BAN_CHANNEL } from "../config.js";
import { checkIsAdmin } from "../utils/adminCheck.js";

// ── Panel ────────────────────────────────────────────────────────────────────

export function buildBanPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🔨 封禁 / 踢出 / 禁言管理面板")
    .setDescription(
      [
        "**第一步：** 从下方选单选择操作类型",
        "**第二步：** 选择目标成员",
        "**第三步：** 填写原因",
        "",
        "• 🔨 **封禁** — 永久移出，私信通知 + 发布公告",
        "• 👢 **踢出** — 移出服务器，不发私信，发布公告",
        "• 🔇 **禁言** — 限制发言，不发私信，发布公告",
      ].join("\n")
    )
    .setColor(0xed4245)
    .setFooter({ text: "仅管理员可操作" });

  const actionSelect = new StringSelectMenuBuilder()
    .setCustomId(BAN_ACTION_SELECT_ID)
    .setPlaceholder("① 选择操作类型…")
    .addOptions(
      { label: "🔨 封禁", value: "ban", description: "永久移出服务器，私信通知" },
      { label: "👢 踢出服务器", value: "kick", description: "移出服务器，可重新加入" },
      { label: "🔇 禁言 3 天", value: "mute_3" },
      { label: "🔇 禁言 7 天", value: "mute_7" },
      { label: "🔇 禁言 14 天", value: "mute_14" },
      { label: "🔇 禁言 28 天", value: "mute_28" },
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionSelect),
    ],
  };
}

// ── Step 1: Action type selected → show UserSelectMenu ───────────────────────

export async function handleBanActionSelect(
  interaction: StringSelectMenuInteraction
) {
  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!checkIsAdmin(guildId, member)) {
    await interaction.reply({ content: "❌ 只有管理员可以使用此面板。", flags: 64 });
    return;
  }

  const action = interaction.values[0];
  const actionLabels: Record<string, string> = {
    ban: "🔨 封禁",
    kick: "👢 踢出服务器",
    mute_3: "🔇 禁言 3 天",
    mute_7: "🔇 禁言 7 天",
    mute_14: "🔇 禁言 14 天",
    mute_28: "🔇 禁言 28 天",
  };

  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(`${BAN_TARGET_SELECT_PREFIX}${action}`)
    .setPlaceholder("② 选择要处理的成员…")
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: `已选择操作：**${actionLabels[action] ?? action}**\n请选择要处理的成员：`,
    components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect)],
    flags: 64,
  });
}

// ── Step 2: Target user selected → show Modal directly ───────────────────────

export async function handleBanTargetSelect(
  interaction: UserSelectMenuInteraction,
  action: string
) {
  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!checkIsAdmin(guildId, member)) {
    await interaction.reply({ content: "❌ 只有管理员可以执行此操作。", flags: 64 });
    return;
  }

  const targetId = interaction.values[0];
  if (!targetId) {
    await interaction.reply({ content: "❌ 未选择成员。", flags: 64 });
    return;
  }
  if (targetId === interaction.user.id) {
    await interaction.reply({ content: "❌ 不能对自己执行此操作。", flags: 64 });
    return;
  }

  if (action === "ban") {
    const modal = new ModalBuilder()
      .setCustomId(`${BAN_MODAL_PREFIX}${targetId}`)
      .setTitle("填写封禁信息");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(BAN_REASON_INPUT)
          .setLabel("封禁原因（必填）")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("请详细说明封禁原因…")
          .setMinLength(5)
          .setMaxLength(500)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(BAN_EVIDENCE_INPUT)
          .setLabel("证据链接或说明（选填）")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("可粘贴图片链接、截图链接等…")
          .setMaxLength(500)
          .setRequired(false)
      )
    );
    await interaction.showModal(modal);

  } else if (action === "kick") {
    const modal = new ModalBuilder()
      .setCustomId(`${KICK_MODAL_PREFIX}${targetId}`)
      .setTitle("填写踢出原因");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(KICK_REASON_INPUT)
          .setLabel("踢出原因（必填）")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("请说明踢出原因…")
          .setMinLength(2)
          .setMaxLength(500)
          .setRequired(true)
      )
    );
    await interaction.showModal(modal);

  } else if (action.startsWith("mute_")) {
    const days = action.split("_")[1];
    const modal = new ModalBuilder()
      .setCustomId(`${MUTE_MODAL_PREFIX}${days}_${targetId}`)
      .setTitle(`填写禁言原因（${days} 天）`);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(MUTE_REASON_INPUT)
          .setLabel("禁言原因（必填）")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("请说明禁言原因…")
          .setMinLength(2)
          .setMaxLength(500)
          .setRequired(true)
      )
    );
    await interaction.showModal(modal);

  } else {
    await interaction.reply({ content: "❌ 未知操作类型。", flags: 64 });
  }
}

// ── Ban Modal Submit ──────────────────────────────────────────────────────────

export async function handleBanModal(
  interaction: ModalSubmitInteraction,
  targetId: string,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!checkIsAdmin(guildId, member)) {
    await interaction.editReply("❌ 只有管理员可以执行封禁。");
    return;
  }

  const guild = interaction.guild;
  if (!guild) { await interaction.editReply("❌ 此操作只能在服务器中使用。"); return; }

  const reason = interaction.fields.getTextInputValue(BAN_REASON_INPUT).trim();
  const rawEvidence = interaction.fields.getTextInputValue(BAN_EVIDENCE_INPUT).trim();
  const evidence = rawEvidence || null;

  try {
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) { await interaction.editReply("❌ 找不到该用户。"); return; }

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (targetMember) {
      const executorMember = interaction.member as GuildMember;
      if (
        targetMember.roles.highest.position >= executorMember.roles.highest.position
        && guild.ownerId !== interaction.user.id
      ) {
        await interaction.editReply("❌ 无法封禁权限等级高于或等于你的成员。");
        return;
      }
    }

    // 先发私信（封禁后无法 DM）
    const dmEmbed = new EmbedBuilder()
      .setTitle("📋 封禁通知")
      .setDescription(
        [
          `你已被服务器 **${guild.name}** 封禁。`,
          "",
          `**封禁原因：**\n${reason}`,
          ...(evidence ? [`\n**证据：**\n${evidence}`] : []),
          "",
          `如有误判可私聊管理：**${BAN_ADMIN_CONTACT}**`,
        ].join("\n")
      )
      .setColor(0xed4245)
      .setTimestamp();

    await targetUser.send({ embeds: [dmEmbed] }).catch((err) => {
      logger.warn({ err, targetId }, "Could not DM banned user");
    });

    await guild.bans.create(targetId, {
      reason: `${reason}${evidence ? `；证据：${evidence}` : ""} — 执行人：${interaction.user.tag}`,
    });

    logger.info({ targetId, executorId: interaction.user.id, reason }, "Member banned");

    const banChannelId = getConfig(guildId, CONFIG_KEY_BAN_CHANNEL);
    if (banChannelId) {
      const ch = await client.channels.fetch(banChannelId).catch(() => null);
      if (ch?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🔨 封禁公告")
          .setColor(0xed4245)
          .addFields(
            { name: "被封禁成员", value: `<@${targetId}>（${targetUser.tag} | ID: ${targetId}）` },
            { name: "封禁原因", value: reason },
            ...(evidence ? [{ name: "📎 证据", value: evidence }] : []),
            { name: "执行人", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp();
        await (ch as GuildTextBasedChannel).send({ content: `<@${targetId}>`, embeds: [embed] });
      }
    }

    await interaction.editReply(`✅ 已成功封禁 **${targetUser.tag}**${banChannelId ? "，公告已发送" : ""}。`);
  } catch (err: unknown) {
    logger.error({ err }, "Failed to execute ban");
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(
      msg.includes("Missing Permissions")
        ? "❌ Bot 权限不足，请确保 Bot 拥有「封禁成员」权限且等级高于目标成员。"
        : `❌ 封禁失败：${msg}`
    );
  }
}

// ── Kick Modal Submit ─────────────────────────────────────────────────────────

export async function handleKickModal(
  interaction: ModalSubmitInteraction,
  targetId: string,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!checkIsAdmin(guildId, member)) {
    await interaction.editReply("❌ 只有管理员可以执行踢出。");
    return;
  }

  const guild = interaction.guild;
  if (!guild) { await interaction.editReply("❌ 此操作只能在服务器中使用。"); return; }

  const reason = interaction.fields.getTextInputValue(KICK_REASON_INPUT).trim();

  try {
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) { await interaction.editReply("❌ 找不到该用户。"); return; }

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) { await interaction.editReply("❌ 该成员已不在服务器中。"); return; }

    const executorMember = interaction.member as GuildMember;
    if (
      targetMember.roles.highest.position >= executorMember.roles.highest.position
      && guild.ownerId !== interaction.user.id
    ) {
      await interaction.editReply("❌ 无法踢出权限等级高于或等于你的成员。");
      return;
    }

    await targetMember.kick(`${reason} — 执行人：${interaction.user.tag}`);

    logger.info({ targetId, executorId: interaction.user.id, reason }, "Member kicked");

    const banChannelId = getConfig(guildId, CONFIG_KEY_BAN_CHANNEL);
    if (banChannelId) {
      const ch = await client.channels.fetch(banChannelId).catch(() => null);
      if (ch?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("👢 踢出公告")
          .setColor(0xffa500)
          .addFields(
            { name: "被踢出成员", value: `${targetUser.tag}（ID: ${targetId}）` },
            { name: "踢出原因", value: reason },
            { name: "执行人", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp();
        await (ch as GuildTextBasedChannel).send({ embeds: [embed] });
      }
    }

    await interaction.editReply(`✅ 已踢出 **${targetUser.tag}**${banChannelId ? "，公告已发送" : ""}。`);
  } catch (err: unknown) {
    logger.error({ err }, "Failed to execute kick");
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(
      msg.includes("Missing Permissions")
        ? "❌ Bot 权限不足，请确保 Bot 拥有「踢出成员」权限且等级高于目标成员。"
        : `❌ 踢出失败：${msg}`
    );
  }
}

// ── Mute Modal Submit ─────────────────────────────────────────────────────────

export async function handleMuteModal(
  interaction: ModalSubmitInteraction,
  days: number,
  targetId: string,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!checkIsAdmin(guildId, member)) {
    await interaction.editReply("❌ 只有管理员可以执行禁言。");
    return;
  }

  const guild = interaction.guild;
  if (!guild) { await interaction.editReply("❌ 此操作只能在服务器中使用。"); return; }

  const reason = interaction.fields.getTextInputValue(MUTE_REASON_INPUT).trim();

  try {
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) { await interaction.editReply("❌ 找不到该用户。"); return; }

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) { await interaction.editReply("❌ 该成员已不在服务器中，无法禁言。"); return; }

    const executorMember = interaction.member as GuildMember;
    if (
      targetMember.roles.highest.position >= executorMember.roles.highest.position
      && guild.ownerId !== interaction.user.id
    ) {
      await interaction.editReply("❌ 无法禁言权限等级高于或等于你的成员。");
      return;
    }

    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await targetMember.disableCommunicationUntil(
      until,
      `${reason} — 执行人：${interaction.user.tag}`
    );

    logger.info({ targetId, executorId: interaction.user.id, days, reason }, "Member muted");

    const banChannelId = getConfig(guildId, CONFIG_KEY_BAN_CHANNEL);
    if (banChannelId) {
      const ch = await client.channels.fetch(banChannelId).catch(() => null);
      if (ch?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🔇 禁言公告")
          .setColor(0xfaa61a)
          .addFields(
            { name: "被禁言成员", value: `<@${targetId}>（${targetUser.tag}）` },
            { name: "禁言时长", value: `${days} 天（至 ${until.toISOString().slice(0, 10)}）` },
            { name: "禁言原因", value: reason },
            { name: "执行人", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setFooter({ text: "如有误判可私聊管理" })
          .setTimestamp();
        await (ch as GuildTextBasedChannel).send({ embeds: [embed] });
      }
    }

    await interaction.editReply(`✅ 已对 **${targetUser.tag}** 禁言 ${days} 天${banChannelId ? "，公告已发送" : ""}。`);
  } catch (err: unknown) {
    logger.error({ err }, "Failed to execute mute");
    const msg = err instanceof Error ? err.message : String(err);
    await interaction.editReply(
      msg.includes("Missing Permissions")
        ? "❌ Bot 权限不足，请确保 Bot 拥有「禁言成员」权限且等级高于目标成员。"
        : `❌ 禁言失败：${msg}`
    );
  }
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  PermissionFlagsBits,
  type ButtonInteraction,
  type UserSelectMenuInteraction,
  type ModalSubmitInteraction,
  type GuildMember,
  type Client,
  type GuildTextBasedChannel,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import {
  BAN_SELECT_ID,
  BAN_ACTION_PREFIX,
  BAN_MODAL_PREFIX,
  BAN_REASON_INPUT,
  BAN_EVIDENCE_INPUT,
  MUTE_MODAL_PREFIX,
  MUTE_REASON_INPUT,
  BAN_ADMIN_CONTACT,
} from "../constants.js";
import {
  getConfig,
  CONFIG_KEY_BAN_CHANNEL,
  CONFIG_KEY_ADMIN_ROLE,
} from "../config.js";

const MUTE_OPTIONS = [
  { label: "禁言 3 天",  days: 3  },
  { label: "禁言 7 天",  days: 7  },
  { label: "禁言 14 天", days: 14 },
  { label: "禁言 28 天", days: 28 },
];

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

export function buildBanPanel() {
  const embed = new EmbedBuilder()
    .setTitle("🔨 封禁 / 禁言管理面板")
    .setDescription(
      [
        "从下方选单选择要处理的成员。",
        "",
        "选定后将弹出操作按钮，可选择：",
        "• 🔨 **封禁** — 永久移出服务器，自动私信通知并发布公告",
        "• 🔇 **禁言** — 限制发言一段时间，直接执行并发布公告（不发私信）",
      ].join("\n")
    )
    .setColor(0xed4245)
    .setFooter({ text: "仅管理员可操作" });

  const select = new UserSelectMenuBuilder()
    .setCustomId(BAN_SELECT_ID)
    .setPlaceholder("选择要处理的成员…")
    .setMinValues(1)
    .setMaxValues(1);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)],
  };
}

export async function handleBanMemberSelect(
  interaction: UserSelectMenuInteraction
) {
  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!isAdmin(guildId, member)) {
    await interaction.reply({ content: "❌ 只有管理员可以使用此面板。", flags: 64 });
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

  const banBtn = new ButtonBuilder()
    .setCustomId(`${BAN_ACTION_PREFIX}ban_${targetId}`)
    .setLabel("🔨 封禁")
    .setStyle(ButtonStyle.Danger);

  const muteBtns = MUTE_OPTIONS.map((opt) =>
    new ButtonBuilder()
      .setCustomId(`${BAN_ACTION_PREFIX}mute_${opt.days}_${targetId}`)
      .setLabel(`🔇 ${opt.label}`)
      .setStyle(ButtonStyle.Secondary)
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(banBtn, muteBtns[0], muteBtns[1]);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(muteBtns[2], muteBtns[3]);

  await interaction.reply({
    content: `已选择 <@${targetId}>，请选择操作：`,
    components: [row1, row2],
    flags: 64,
  });
}

export async function handleBanActionButton(
  interaction: ButtonInteraction,
  actionPart: string
) {
  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!isAdmin(guildId, member)) {
    await interaction.reply({ content: "❌ 只有管理员可以执行此操作。", flags: 64 });
    return;
  }

  if (actionPart.startsWith("ban_")) {
    const targetId = actionPart.slice("ban_".length);

    const modal = new ModalBuilder()
      .setCustomId(`${BAN_MODAL_PREFIX}${targetId}`)
      .setTitle("填写封禁信息");

    const reasonInput = new TextInputBuilder()
      .setCustomId(BAN_REASON_INPUT)
      .setLabel("封禁原因（必填）")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("请详细说明封禁原因…")
      .setMinLength(5)
      .setMaxLength(500)
      .setRequired(true);

    const evidenceInput = new TextInputBuilder()
      .setCustomId(BAN_EVIDENCE_INPUT)
      .setLabel("证据链接或说明（选填）")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("可粘贴图片链接、截图链接等…")
      .setMaxLength(500)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(evidenceInput)
    );

    await interaction.showModal(modal);

  } else if (actionPart.startsWith("mute_")) {
    const rest = actionPart.slice("mute_".length);
    const underscoreIdx = rest.indexOf("_");
    const days = Number(rest.slice(0, underscoreIdx));
    const targetId = rest.slice(underscoreIdx + 1);

    const modal = new ModalBuilder()
      .setCustomId(`${MUTE_MODAL_PREFIX}${days}_${targetId}`)
      .setTitle(`填写禁言原因（${days} 天）`);

    const reasonInput = new TextInputBuilder()
      .setCustomId(MUTE_REASON_INPUT)
      .setLabel("禁言原因（必填）")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("请说明禁言原因…")
      .setMinLength(2)
      .setMaxLength(500)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
    );

    await interaction.showModal(modal);

  } else {
    await interaction.reply({ content: "❌ 未知操作。", flags: 64 });
  }
}

export async function handleBanModal(
  interaction: ModalSubmitInteraction,
  targetId: string,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!isAdmin(guildId, member)) {
    await interaction.editReply("❌ 只有管理员可以执行封禁。");
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply("❌ 此操作只能在服务器中使用。");
    return;
  }

  const reason = interaction.fields.getTextInputValue(BAN_REASON_INPUT).trim();
  const rawEvidence = interaction.fields.getTextInputValue(BAN_EVIDENCE_INPUT).trim();
  const evidence = rawEvidence || null;

  try {
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      await interaction.editReply("❌ 找不到该用户，请确认 ID 是否正确。");
      return;
    }

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
      logger.warn({ err, targetId }, "Could not DM banned user (DMs may be disabled)");
    });

    await guild.bans.create(targetId, {
      reason: `封禁原因：${reason}${evidence ? `；证据：${evidence}` : ""} — 执行人：${interaction.user.tag}`,
    });

    logger.info({ targetId, executorId: interaction.user.id, reason }, "Member banned");

    const banChannelId = getConfig(guildId, CONFIG_KEY_BAN_CHANNEL);
    if (banChannelId) {
      const banChannel = await client.channels.fetch(banChannelId).catch(() => null);
      if (banChannel && banChannel.isTextBased()) {
        const announcementEmbed = new EmbedBuilder()
          .setTitle("🔨 封禁公告")
          .setColor(0xed4245)
          .addFields(
            { name: "被封禁成员", value: `<@${targetId}>（${targetUser.tag} | ID: ${targetId}）` },
            { name: "封禁原因", value: reason },
            ...(evidence ? [{ name: "📎 证据", value: evidence }] : []),
            { name: "执行人", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp();

        await (banChannel as GuildTextBasedChannel).send({
          content: `<@${targetId}>`,
          embeds: [announcementEmbed],
        });
      }
    }

    await interaction.editReply(
      `✅ 已成功封禁 **${targetUser.tag}**${banChannelId ? "，封禁公告已发送至公告频道" : "（提示：尚未设置封禁公告频道，请使用 /set_ban_channel 指定）"}。`
    );
  } catch (err: unknown) {
    logger.error({ err }, "Failed to execute ban");
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Missing Permissions")) {
      await interaction.editReply("❌ Bot 权限不足，请确保 Bot 拥有「封禁成员」权限，且权限等级高于目标成员。");
    } else {
      await interaction.editReply(`❌ 封禁失败：${msg}`);
    }
  }
}

export async function handleMuteModal(
  interaction: ModalSubmitInteraction,
  days: number,
  targetId: string,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member as GuildMember | null;
  const guildId = interaction.guildId ?? "";

  if (!isAdmin(guildId, member)) {
    await interaction.editReply("❌ 只有管理员可以执行禁言。");
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply("❌ 此操作只能在服务器中使用。");
    return;
  }

  const reason = interaction.fields.getTextInputValue(MUTE_REASON_INPUT).trim();

  try {
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      await interaction.editReply("❌ 找不到该用户，请确认 ID 是否正确。");
      return;
    }

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    if (!targetMember) {
      await interaction.editReply("❌ 该成员已不在服务器中，无法禁言。");
      return;
    }

    const executorMember = interaction.member as GuildMember;
    if (
      targetMember.roles.highest.position >= executorMember.roles.highest.position
      && guild.ownerId !== interaction.user.id
    ) {
      await interaction.editReply("❌ 无法禁言权限等级高于或等于你的成员。");
      return;
    }

    const durationMs = days * 24 * 60 * 60 * 1000;
    const until = new Date(Date.now() + durationMs);

    await targetMember.disableCommunicationUntil(
      until,
      `禁言原因：${reason} — 执行人：${interaction.user.tag}`
    );

    logger.info({ targetId, executorId: interaction.user.id, days, reason }, "Member muted");

    const banChannelId = getConfig(guildId, CONFIG_KEY_BAN_CHANNEL);
    if (banChannelId) {
      const banChannel = await client.channels.fetch(banChannelId).catch(() => null);
      if (banChannel && banChannel.isTextBased()) {
        const announcementEmbed = new EmbedBuilder()
          .setTitle("🔇 禁言公告")
          .setColor(0xfaa61a)
          .addFields(
            { name: "被禁言成员", value: `<@${targetId}>（${targetUser.tag}）` },
            { name: "禁言时长", value: `${days} 天（至 ${until.toISOString().slice(0, 10)}）` },
            { name: "禁言原因", value: reason },
            { name: "执行人", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setFooter({ text: `如有误判可私聊管理：${BAN_ADMIN_CONTACT}` })
          .setTimestamp();

        await (banChannel as GuildTextBasedChannel).send({
          embeds: [announcementEmbed],
        });
      }
    }

    await interaction.editReply(
      `✅ 已对 **${targetUser.tag}** 禁言 ${days} 天${banChannelId ? "，公告已发送" : ""}。`
    );
  } catch (err: unknown) {
    logger.error({ err }, "Failed to execute mute");
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Missing Permissions")) {
      await interaction.editReply("❌ Bot 权限不足，请确保 Bot 拥有「禁言成员」权限，且权限等级高于目标成员。");
    } else {
      await interaction.editReply(`❌ 禁言失败：${msg}`);
    }
  }
}

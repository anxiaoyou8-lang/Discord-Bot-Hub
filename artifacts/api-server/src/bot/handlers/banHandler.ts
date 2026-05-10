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
  type UserSelectMenuInteraction,
  type ModalSubmitInteraction,
  type GuildMember,
  type Client,
  type GuildTextBasedChannel,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import {
  BAN_SELECT_ID,
  BAN_MODAL_PREFIX,
  BAN_REASON_INPUT,
  BAN_EVIDENCE_INPUT,
  BAN_ADMIN_CONTACT,
} from "../constants.js";
import {
  getConfig,
  CONFIG_KEY_BAN_CHANNEL,
  CONFIG_KEY_ADMIN_ROLE,
} from "../config.js";

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
    .setTitle("🔨 封禁管理面板")
    .setDescription(
      [
        "从下方选单选择要封禁的成员。",
        "",
        "选定后将弹出表单，填写封禁原因及证据链接（选填）。",
        "Bot 将自动完成以下操作：",
        "• 私信通知被封禁成员，附上原因、证据及申诉方式",
        "• 执行 Discord 封禁",
        "• 在公告频道发布正式封禁公告",
      ].join("\n")
    )
    .setColor(0xed4245)
    .setFooter({ text: "仅管理员可操作" });

  const select = new UserSelectMenuBuilder()
    .setCustomId(BAN_SELECT_ID)
    .setPlaceholder("选择要封禁的成员…")
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
    await interaction.reply({ content: "❌ 只有管理员可以使用封禁面板。", flags: 64 });
    return;
  }

  const targetId = interaction.values[0];
  if (!targetId) {
    await interaction.reply({ content: "❌ 未选择成员。", flags: 64 });
    return;
  }

  // 阻止封禁自己
  if (targetId === interaction.user.id) {
    await interaction.reply({ content: "❌ 不能封禁自己。", flags: 64 });
    return;
  }

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
    // 获取被封禁成员信息（可能已经不在服务器）
    const targetUser = await client.users.fetch(targetId).catch(() => null);
    if (!targetUser) {
      await interaction.editReply("❌ 找不到该用户，请确认 ID 是否正确。");
      return;
    }

    const targetMember = await guild.members.fetch(targetId).catch(() => null);

    // 检查权限层级
    if (targetMember) {
      const executorMember = interaction.member as GuildMember;
      if (
        targetMember.roles.highest.position >= executorMember.roles.highest.position
        && !guild.ownerId !== interaction.user.id
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
          "如对此决定有异议，请联系管理员：",
          `**${BAN_ADMIN_CONTACT}**`,
        ].join("\n")
      )
      .setColor(0xed4245)
      .setTimestamp();

    await targetUser.send({ embeds: [dmEmbed] }).catch((err) => {
      logger.warn({ err, targetId }, "Could not DM banned user (DMs may be disabled)");
    });

    // 执行封禁
    await guild.bans.create(targetId, {
      reason: `封禁原因：${reason}${evidence ? `；证据：${evidence}` : ""} — 执行人：${interaction.user.tag}`,
    });

    logger.info({ targetId, executorId: interaction.user.id, reason }, "Member banned");

    // 在公告频道发送封禁公告
    const banChannelId = getConfig(guildId, CONFIG_KEY_BAN_CHANNEL);
    if (banChannelId) {
      const banChannel = await client.channels.fetch(banChannelId).catch(() => null);
      if (banChannel && banChannel.isTextBased()) {
        const announcementEmbed = new EmbedBuilder()
          .setTitle("🔨 封禁公告")
          .setColor(0xed4245)
          .addFields(
            {
              name: "被封禁成员",
              value: `<@${targetId}>（${targetUser.tag} | ID: ${targetId}）`,
            },
            { name: "封禁原因", value: reason },
            ...(evidence ? [{ name: "📎 证据", value: evidence }] : []),
            {
              name: "执行人",
              value: `<@${interaction.user.id}>`,
              inline: true,
            },
          )
          .setFooter({
            text: `如有异议请联系管理员：${BAN_ADMIN_CONTACT}`,
          })
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

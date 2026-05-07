import {
  ChannelType,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
  type Guild,
  type VoiceChannel,
} from "discord.js";
import { logger } from "../../lib/logger.js";
import {
  getConfig,
  setConfig,
  CONFIG_KEY_APPROVE_ROLE,
  CONFIG_KEY_STATS_TOTAL_CHANNEL,
  CONFIG_KEY_STATS_ROLE_CHANNEL,
  CONFIG_KEY_STATS_NO_ROLE_CHANNEL,
} from "../config.js";

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function getStats(guild: Guild) {
  await guild.members.fetch();
  const approveRoleId = getConfig(guild.id, CONFIG_KEY_APPROVE_ROLE);
  const humans = guild.members.cache.filter((m) => !m.user.bot);
  const total = humans.size;
  const withRole = approveRoleId
    ? humans.filter((m) => m.roles.cache.has(approveRoleId)).size
    : 0;
  const noRole = total - withRole;
  return { total, withRole, noRole };
}

export async function updateStatsChannels(guild: Guild) {
  const totalChannelId = getConfig(guild.id, CONFIG_KEY_STATS_TOTAL_CHANNEL);
  const roleChannelId = getConfig(guild.id, CONFIG_KEY_STATS_ROLE_CHANNEL);
  const noRoleChannelId = getConfig(guild.id, CONFIG_KEY_STATS_NO_ROLE_CHANNEL);

  if (!totalChannelId && !roleChannelId && !noRoleChannelId) return;

  try {
    const { total, withRole, noRole } = await getStats(guild);

    const rename = async (channelId: string, name: string) => {
      const ch = (guild.channels.cache.get(channelId) ??
        await guild.channels.fetch(channelId).catch(() => null)) as VoiceChannel | null;
      if (ch) await ch.setName(name).catch((err) =>
        logger.warn({ err, channelId }, "Failed to rename stats channel")
      );
    };

    const tasks: Promise<void>[] = [];
    if (totalChannelId) tasks.push(rename(totalChannelId, `✦ 梦旅者：${total} 人`));
    if (roleChannelId)  tasks.push(rename(roleChannelId,  `✦ 梦中身：${withRole} 人`));
    if (noRoleChannelId) tasks.push(rename(noRoleChannelId, `✦ 失眠者：${noRole} 人`));

    await Promise.all(tasks);
    logger.info({ guildId: guild.id, total, withRole, noRole }, "Stats channels updated");
  } catch (err) {
    logger.error({ err }, "Failed to update stats channels");
  }
}

export function scheduleStatsUpdate(guild: Guild, delayMs = 3000) {
  const existing = debounceTimers.get(guild.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    debounceTimers.delete(guild.id);
    updateStatsChannels(guild).catch(() => {});
  }, delayMs);
  debounceTimers.set(guild.id, timer);
}

export function startStatsScheduler(client: Client) {
  setInterval(async () => {
    for (const [, guild] of client.guilds.cache) {
      await updateStatsChannels(guild);
    }
  }, 15 * 60 * 1000);
}

export async function handleSetupStats(
  interaction: ChatInputCommandInteraction,
  client: Client
) {
  await interaction.deferReply({ flags: 64 });

  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply("此指令只能在服务器中使用。");
    return;
  }

  const categoryOption = interaction.options.getChannel("category", false);

  try {
    const everyone = guild.roles.everyone;

    const channelOptions = {
      type: ChannelType.GuildVoice as const,
      ...(categoryOption ? { parent: categoryOption.id } : {}),
      permissionOverwrites: [
        {
          id: everyone.id,
          deny: [PermissionFlagsBits.Connect],
          allow: [PermissionFlagsBits.ViewChannel],
        },
      ],
    };

    const [totalCh, roleCh, noRoleCh] = await Promise.all([
      guild.channels.create({ name: "✦ 梦旅者：- 人", ...channelOptions }),
      guild.channels.create({ name: "✦ 梦中身：- 人", ...channelOptions }),
      guild.channels.create({ name: "✦ 失眠者：- 人", ...channelOptions }),
    ]);

    await Promise.all([
      setConfig(guild.id, CONFIG_KEY_STATS_TOTAL_CHANNEL, totalCh.id),
      setConfig(guild.id, CONFIG_KEY_STATS_ROLE_CHANNEL, roleCh.id),
      setConfig(guild.id, CONFIG_KEY_STATS_NO_ROLE_CHANNEL, noRoleCh.id),
    ]);

    await updateStatsChannels(guild);

    await interaction.editReply(
      [
        "✅ **统计频道已创建并开始运行！**",
        `• <#${totalCh.id}> — 所有成员总数（梦旅者）`,
        `• <#${roleCh.id}> — 已通过验证的成员（梦中身）`,
        `• <#${noRoleCh.id}> — 尚未通过验证的成员（失眠者）`,
        "",
        "数据每 15 分钟自动刷新，成员加入/离开/通过审核时也会即时更新。",
      ].join("\n")
    );
  } catch (err) {
    logger.error({ err }, "Failed to setup stats channels");
    await interaction.editReply("❌ 创建统计频道失败，请检查机器人是否有「管理频道」权限。");
  }
}

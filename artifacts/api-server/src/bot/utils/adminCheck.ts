import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { getConfig, CONFIG_KEY_ADMIN_ROLE } from "../config.js";

/**
 * Checks if a member is an admin (Discord Administrator permission OR configured admin role).
 * Handles both GuildMember (roles.cache) and APIInteractionGuildMember (roles as string[]).
 */
export function checkIsAdmin(
  guildId: string | null,
  member: GuildMember | { permissions?: unknown; roles?: unknown } | null
): boolean {
  if (!member) return false;

  const adminRoleId = guildId ? getConfig(guildId, CONFIG_KEY_ADMIN_ROLE) : undefined;

  // --- Permission check (handles both PermissionsBitField and raw string) ---
  const perms = (member as GuildMember).permissions;
  const isDiscordAdmin = perms
    ? typeof perms === "string"
      ? !!(BigInt(perms) & BigInt(PermissionFlagsBits.Administrator))
      : (perms as { has(flag: bigint): boolean }).has(PermissionFlagsBits.Administrator)
    : false;

  if (isDiscordAdmin) return true;

  // --- Role check (handles GuildMember.roles.cache and APIInteractionGuildMember.roles[]) ---
  if (!adminRoleId) return false;

  const roles = (member as GuildMember).roles;
  if (!roles) return false;

  // GuildMember: roles is a RoleManager with .cache
  if (typeof roles === "object" && "cache" in roles) {
    return (roles as { cache: { has(id: string): boolean } }).cache.has(adminRoleId);
  }

  // APIInteractionGuildMember: roles is a string[]
  if (Array.isArray(roles)) {
    return (roles as string[]).includes(adminRoleId);
  }

  return false;
}

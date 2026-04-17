import { db } from "@workspace/db";
import { guildConfigsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const CONFIG_KEY_LOG_CHANNEL = "log_channel";
export const CONFIG_KEY_ADMIN_ROLE = "admin_role";
export const CONFIG_KEY_APPROVE_ROLE = "approve_role";

const configCache = new Map<string, string>();

function cacheKey(guildId: string, key: string) {
  return `${guildId}:${key}`;
}

export function getConfig(guildId: string, key: string): string | undefined {
  return configCache.get(cacheKey(guildId, key));
}

export async function setConfig(guildId: string, key: string, value: string) {
  configCache.set(cacheKey(guildId, key), value);
  try {
    await db
      .insert(guildConfigsTable)
      .values({ guildId, configKey: key, configValue: value })
      .onConflictDoUpdate({
        target: [guildConfigsTable.guildId, guildConfigsTable.configKey],
        set: { configValue: value, updatedAt: new Date() },
      });
  } catch (err) {
    logger.error({ err }, "Failed to persist config to DB");
  }
}

export async function loadAllConfigs() {
  try {
    const rows = await db.select().from(guildConfigsTable);
    for (const row of rows) {
      configCache.set(cacheKey(row.guildId, row.configKey), row.configValue);
    }
    logger.info({ count: rows.length }, "Loaded guild configs from DB");
  } catch (err) {
    logger.error({ err }, "Failed to load configs from DB");
  }
}

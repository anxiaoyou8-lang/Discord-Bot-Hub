import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";
import { logger } from "../lib/logger.js";

export async function registerCommands(
  token: string,
  clientId: string,
  guildIds: string[]
) {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    if (guildIds.length > 0) {
      logger.info({ guildCount: guildIds.length }, "Registering slash commands per guild (instant)...");
      await Promise.all(
        guildIds.map((guildId) =>
          rest.put(Routes.applicationGuildCommands(clientId, guildId), {
            body: commands,
          })
        )
      );
      logger.info("Guild slash commands registered successfully.");
    } else {
      logger.info("No guilds found, falling back to global registration...");
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      logger.info("Global slash commands registered successfully.");
    }
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }
}

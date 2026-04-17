import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";
import { logger } from "../lib/logger.js";

export async function registerCommands(token: string, clientId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    logger.info("Registering slash commands globally...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info("Slash commands registered successfully.");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }
}

import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startBot } from "./bot/client.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const discordToken = process.env["DISCORD_BOT_TOKEN"];
if (!discordToken) {
  logger.error("DISCORD_BOT_TOKEN is not set, bot will not start");
} else {
  startBot(discordToken).catch((err) => {
    logger.error({ err }, "Failed to start Discord bot");
    process.exit(1);
  });
}

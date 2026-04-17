import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  type Interaction,
  type GuildTextBasedChannel,
} from "discord.js";
import { logger } from "../lib/logger.js";
import { registerCommands } from "./registerCommands.js";
import {
  buildReviewPanel,
  handleReviewPanelButton,
  handleReviewModalSubmit,
  handleReviewApprove,
  handleReviewReject,
} from "./handlers/reviewHandler.js";
import {
  buildArtworkPanel,
  handleArtworkUpload,
  handleArtworkGetButton,
  handleArtworkGetModal,
} from "./handlers/artworkHandler.js";
import { setConfig, CONFIG_KEY_LOG_CHANNEL, CONFIG_KEY_ADMIN_ROLE } from "./config.js";
import {
  REVIEW_PANEL_CUSTOM_ID,
  REVIEW_APPROVE_PREFIX,
  REVIEW_REJECT_PREFIX,
  REVIEW_SUBMIT_MODAL,
  ARTWORK_UPLOAD_CMD,
  ARTWORK_GET_CUSTOM_ID,
  ARTWORK_GET_MODAL_PREFIX,
  REVIEW_PANEL_CMD,
  ARTWORK_PANEL_CMD,
  SET_LOG_CHANNEL_CMD,
  SET_ADMIN_ROLE_CMD,
} from "./constants.js";

export async function startBot(token: string) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info(`Discord bot logged in as ${c.user.tag}`);
    await registerCommands(token, c.user.id);
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === REVIEW_PANEL_CMD) {
          const panel = buildReviewPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "审核面板已发送！", flags: 64 });

        } else if (commandName === ARTWORK_PANEL_CMD) {
          const panel = buildArtworkPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "作品面板已发送！", flags: 64 });

        } else if (commandName === ARTWORK_UPLOAD_CMD) {
          await handleArtworkUpload(interaction, client);

        } else if (commandName === SET_LOG_CHANNEL_CMD) {
          const channel = interaction.options.getChannel("channel", true);
          if (!interaction.guildId) return;
          setConfig(interaction.guildId, CONFIG_KEY_LOG_CHANNEL, channel.id);
          await interaction.reply({
            content: `已将记录频道设置为 <#${channel.id}>`,
            flags: 64,
          });

        } else if (commandName === SET_ADMIN_ROLE_CMD) {
          const role = interaction.options.getRole("role", true);
          if (!interaction.guildId) return;
          setConfig(interaction.guildId, CONFIG_KEY_ADMIN_ROLE, role.id);
          await interaction.reply({
            content: `已将管理员身分组设置为 <@&${role.id}>`,
            flags: 64,
          });
        }

      } else if (interaction.isButton()) {
        const { customId } = interaction;

        if (customId === REVIEW_PANEL_CUSTOM_ID) {
          await handleReviewPanelButton(interaction);

        } else if (customId.startsWith(REVIEW_APPROVE_PREFIX)) {
          const targetUserId = customId.slice(REVIEW_APPROVE_PREFIX.length);
          await handleReviewApprove(interaction, targetUserId);

        } else if (customId.startsWith(REVIEW_REJECT_PREFIX)) {
          const targetUserId = customId.slice(REVIEW_REJECT_PREFIX.length);
          await handleReviewReject(interaction, targetUserId);

        } else if (customId.startsWith(ARTWORK_GET_CUSTOM_ID)) {
          const messageId = customId.slice(ARTWORK_GET_CUSTOM_ID.length);
          await handleArtworkGetButton(interaction, messageId);
        }

      } else if (interaction.isModalSubmit()) {
        const { customId } = interaction;

        if (customId === REVIEW_SUBMIT_MODAL) {
          await handleReviewModalSubmit(interaction);

        } else if (customId.startsWith(ARTWORK_GET_MODAL_PREFIX)) {
          const messageId = customId.slice(ARTWORK_GET_MODAL_PREFIX.length);
          await handleArtworkGetModal(interaction, messageId, client);
        }
      }
    } catch (err) {
      logger.error({ err }, "Unhandled interaction error");
    }
  });

  client.on(Events.Error, (err) => {
    logger.error({ err }, "Discord client error");
  });

  try {
    await client.login(token);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("disallowed intents") || message.includes("Disallowed")) {
      logger.error(
        "Bot startup failed: Privileged Gateway Intents are not enabled.\n" +
        "Please go to https://discord.com/developers/applications and enable:\n" +
        "  - SERVER MEMBERS INTENT\n" +
        "  - MESSAGE CONTENT INTENT\n" +
        "under your application's Bot settings page."
      );
    } else {
      logger.error({ err }, "Failed to login to Discord");
    }
    throw err;
  }

  return client;
}

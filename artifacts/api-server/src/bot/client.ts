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
  handleReviewSubmitModal,
  handleReviewDoneButton,
  handleReviewDeleteTicket,
  handleReviewApprove,
  handleReviewReject,
  runAutoDeleteScheduler,
} from "./handlers/reviewHandler.js";
import {
  buildArtworkPanel,
  handleArtworkUpload,
  handleArtworkGetButton,
  handleArtworkGetModal,
} from "./handlers/artworkHandler.js";
import { handleGoTop, handleClearMessages } from "./handlers/threadHandler.js";
import {
  buildComplaintPanel,
  handleComplaintButton,
  handleComplaintSubmitModal,
} from "./handlers/complaintHandler.js";
import {
  setConfig,
  loadAllConfigs,
  CONFIG_KEY_LOG_CHANNEL,
  CONFIG_KEY_ADMIN_ROLE,
  CONFIG_KEY_APPROVE_ROLE,
  CONFIG_KEY_COMPLAINT_CHANNEL,
} from "./config.js";
import {
  REVIEW_PANEL_CUSTOM_ID,
  REVIEW_APPROVE_PREFIX,
  REVIEW_REJECT_PREFIX,
  REVIEW_DELETE_PREFIX,
  REVIEW_SUBMIT_MODAL_ID,
  REVIEW_DONE_PREFIX,
  ARTWORK_UPLOAD_CMD,
  ARTWORK_GET_CUSTOM_ID,
  ARTWORK_GET_MODAL_PREFIX,
  REVIEW_PANEL_CMD,
  ARTWORK_PANEL_CMD,
  SET_LOG_CHANNEL_CMD,
  SET_ADMIN_ROLE_CMD,
  SET_APPROVE_ROLE_CMD,
  DECODE_FILENAME_CMD,
  LOOKUP_TRACE_CMD,
  GO_TOP_CMD,
  CLEAR_MESSAGES_CMD,
  COMPLAINT_PANEL_CMD,
  SET_COMPLAINT_CHANNEL_CMD,
  COMPLAINT_PANEL_CUSTOM_ID,
  COMPLAINT_SUBMIT_MODAL_ID,
} from "./constants.js";
import { decodeFileInfo } from "./filenameCodec.js";
import { db, artworkWatermarksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  extractPngWatermark,
  extractJsonWatermark,
  extractTextWatermark,
} from "./watermark.js";

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
    await loadAllConfigs();
    const guildIds = c.guilds.cache.map((g) => g.id);
    await registerCommands(token, c.user.id, guildIds);
    await runAutoDeleteScheduler(client);
  });

  client.on(Events.GuildCreate, async (guild) => {
    const guildIds = [guild.id];
    await registerCommands(token, client.user!.id, guildIds);
    logger.info({ guildId: guild.id }, "Registered commands for new guild");
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
          await setConfig(interaction.guildId, CONFIG_KEY_LOG_CHANNEL, channel.id);
          await interaction.reply({
            content: `已将获取记录频道设置为 <#${channel.id}>`,
            flags: 64,
          });

        } else if (commandName === SET_ADMIN_ROLE_CMD) {
          const role = interaction.options.getRole("role", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_ADMIN_ROLE, role.id);
          await interaction.reply({
            content: `已将管理员身分组设置为 <@&${role.id}>`,
            flags: 64,
          });

        } else if (commandName === SET_APPROVE_ROLE_CMD) {
          const role = interaction.options.getRole("role", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_APPROVE_ROLE, role.id);
          await interaction.reply({
            content: `审核通过后将自动赋予身分组 <@&${role.id}>`,
            flags: 64,
          });

        } else if (commandName === DECODE_FILENAME_CMD) {
          const code = interaction.options.getString("code", true).trim();
          const info = decodeFileInfo(code);
          if (!info) {
            await interaction.reply({
              content: "❌ 无法解码，请确认输入的是文件名中去掉扩展名后的完整编码部分。",
              flags: 64,
            });
            return;
          }
          const unixSec = Math.floor(info.timestamp / 1000);
          await interaction.reply({
            content: [
              "**📂 文件名解码结果**",
              `**获取时间：** <t:${unixSec}:F>（<t:${unixSec}:R>）`,
              `**获取者 Discord ID：** \`${info.userId}\``,
              `**获取者：** <@${info.userId}>`,
            ].join("\n"),
            flags: 64,
          });

        } else if (commandName === GO_TOP_CMD) {
          await handleGoTop(interaction);

        } else if (commandName === CLEAR_MESSAGES_CMD) {
          await handleClearMessages(interaction);

        } else if (commandName === COMPLAINT_PANEL_CMD) {
          const panel = buildComplaintPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "投诉面板已发送！", flags: 64 });

        } else if (commandName === SET_COMPLAINT_CHANNEL_CMD) {
          const channel = interaction.options.getChannel("channel", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_COMPLAINT_CHANNEL, channel.id);
          await interaction.reply({
            content: `已将投诉工单接收频道设置为 <#${channel.id}>`,
            flags: 64,
          });

        } else if (commandName === LOOKUP_TRACE_CMD) {
          await interaction.deferReply({ flags: 64 });

          const attachment = interaction.options.getAttachment("file", true);
          const lower = attachment.name.toLowerCase();
          const dotIdx = lower.lastIndexOf(".");
          const ext = dotIdx !== -1 ? lower.slice(dotIdx) : "";

          const res = await fetch(attachment.url);
          if (!res.ok) {
            await interaction.editReply("❌ 无法下载该文件，请重试。");
            return;
          }
          const buf = Buffer.from(await res.arrayBuffer());

          const TEXT_EXTS = new Set([".txt", ".md", ".csv"]);

          let traceId: string | null = null;
          let methodUsed = "";

          if (ext === ".png") {
            traceId = extractPngWatermark(buf);
            methodUsed = "PNG tEXt 元数据";
          } else if (ext === ".json") {
            traceId = extractJsonWatermark(buf.toString("utf-8"));
            methodUsed = "JSON 末尾空白";
          } else if (TEXT_EXTS.has(ext)) {
            traceId = extractTextWatermark(buf.toString("utf-8"));
            methodUsed = "零宽字符隐写";
          }

          if (!traceId) {
            await interaction.editReply(
              [
                "❌ 未能从该文件中提取到溯源ID。",
                ext === ".png" || ext === ".json" || TEXT_EXTS.has(ext)
                  ? "可能是文件在传播过程中被压缩或重新编码（如截图、重新保存等），导致水印丢失。"
                  : `不支持此文件格式（${ext || "无扩展名"}），目前支持：PNG、JSON、TXT、MD、CSV 等文本类文件。`,
              ].join("\n")
            );
            return;
          }

          const rows = await db
            .select()
            .from(artworkWatermarksTable)
            .where(eq(artworkWatermarksTable.traceId, traceId))
            .limit(1);

          if (rows.length === 0) {
            await interaction.editReply(
              `❌ 成功提取到溯源ID \`${traceId}\`，但数据库中没有对应记录。可能是较旧版本的文件（水印系统上线前发出的）。`
            );
            return;
          }

          const row = rows[0]!;
          const unixSec = Math.floor(row.accessedAt.getTime() / 1000);
          await interaction.editReply(
            [
              "**🔍 溯源查询成功**",
              `**溯源ID：** \`${row.traceId}\``,
              `**提取方式：** ${methodUsed}`,
              `**作品：** ${row.artworkTitle}`,
              `**获取者：** <@${row.accessorId}> (${row.accessorTag})`,
              `**获取时间：** <t:${unixSec}:F>（<t:${unixSec}:R>）`,
              `**原始文件名：** \`${row.filename}\``,
            ].join("\n")
          );
        }

      } else if (interaction.isButton()) {
        const { customId } = interaction;

        if (customId === REVIEW_PANEL_CUSTOM_ID) {
          await handleReviewPanelButton(interaction, client);

        } else if (customId.startsWith(REVIEW_DONE_PREFIX)) {
          const threadId = customId.slice(REVIEW_DONE_PREFIX.length);
          await handleReviewDoneButton(interaction, threadId, client);

        } else if (customId.startsWith(REVIEW_DELETE_PREFIX)) {
          const threadId = customId.slice(REVIEW_DELETE_PREFIX.length);
          await handleReviewDeleteTicket(interaction, threadId);

        } else if (customId.startsWith(REVIEW_APPROVE_PREFIX)) {
          const targetUserId = customId.slice(REVIEW_APPROVE_PREFIX.length);
          await handleReviewApprove(interaction, targetUserId);

        } else if (customId.startsWith(REVIEW_REJECT_PREFIX)) {
          const targetUserId = customId.slice(REVIEW_REJECT_PREFIX.length);
          await handleReviewReject(interaction, targetUserId);

        } else if (customId.startsWith(ARTWORK_GET_CUSTOM_ID)) {
          const messageId = customId.slice(ARTWORK_GET_CUSTOM_ID.length);
          await handleArtworkGetButton(interaction, messageId);

        } else if (customId === COMPLAINT_PANEL_CUSTOM_ID) {
          await handleComplaintButton(interaction);
        }

      } else if (interaction.isModalSubmit()) {
        const { customId } = interaction;

        if (customId === REVIEW_SUBMIT_MODAL_ID) {
          await handleReviewSubmitModal(interaction, client);

        } else if (customId.startsWith(ARTWORK_GET_MODAL_PREFIX)) {
          const messageId = customId.slice(ARTWORK_GET_MODAL_PREFIX.length);
          await handleArtworkGetModal(interaction, messageId, client);

        } else if (customId === COMPLAINT_SUBMIT_MODAL_ID) {
          await handleComplaintSubmitModal(interaction, client);
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
        "Bot startup failed: Privileged Gateway Intents not enabled.\n" +
        "Please enable SERVER MEMBERS INTENT and MESSAGE CONTENT INTENT\n" +
        "in your Discord Developer Portal > Bot settings."
      );
    } else {
      logger.error({ err }, "Failed to login to Discord");
    }
    throw err;
  }

  return client;
}

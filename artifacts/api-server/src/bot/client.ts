import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  type Interaction,
  type GuildMember,
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
  handleArtworkSubscribe,
  handleArtworkNotifyBtn,
  handleArtworkNotifyModal,
  handleNotifySubscribersCmd,
} from "./handlers/artworkHandler.js";
import {
  handleGoTop,
  handleDeleteThread,
  handleDeleteThreadConfirm,
  handleDeleteThreadCancel,
} from "./handlers/threadHandler.js";
import {
  buildSearchPanel,
  handleSearchChannelSelect,
  handleSearchKeywordBtn,
  handleSearchNicknameBtn,
  handleSearchKeywordModal,
  handleSearchNicknameModal,
} from "./handlers/searchPanelHandler.js";
import {
  buildComplaintPanel,
  handleComplaintButton,
  handleComplaintThreadSubmit,
  handleComplaintThreadCancel,
} from "./handlers/complaintHandler.js";
import {
  handleSetupStats,
  startStatsScheduler,
  scheduleStatsUpdate,
} from "./handlers/statsHandler.js";
import {
  buildTriviaPanel,
  handleTriviaDrawButton,
  handleAddTrivia,
  handleAddTriviaModal,
  handleDeleteTrivia,
  handleListTrivia,
} from "./handlers/triviaHandler.js";
import {
  buildBanPanel,
  handleBanActionSelect,
  handleBanTargetSelect,
  handleBanModal,
  handleKickModal,
  handleMuteModal,
} from "./handlers/banHandler.js";
import {
  buildSuggestionPanel,
  handleSuggestionButton,
  handleSuggestionModal,
  handleSuggestionUpvoteBtn,
  handleSuggestionUpvoteModal,
  handleSuggestionDownvoteBtn,
  handleSuggestionDownvoteModal,
  handleSuggestionAccept,
  handleSuggestionRejectBtn,
  handleSuggestionRejectModal,
} from "./handlers/suggestionHandler.js";
import { checkIsAdmin } from "./utils/adminCheck.js";
import {
  getConfig,
  setConfig,
  loadAllConfigs,
  CONFIG_KEY_LOG_CHANNEL,
  CONFIG_KEY_ADMIN_ROLE,
  CONFIG_KEY_APPROVE_ROLE,
  CONFIG_KEY_COMPLAINT_CHANNEL,
  CONFIG_KEY_SUGGESTION_CHANNEL,
  CONFIG_KEY_BAN_CHANNEL,
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
  DELETE_THREAD_CMD,
  SEARCH_PANEL_CMD,
  SEARCH_CHANNEL_SELECT_ID,
  SEARCH_KEYWORD_BTN_ID,
  SEARCH_NICKNAME_BTN_ID,
  SEARCH_KEYWORD_MODAL_ID,
  SEARCH_NICKNAME_MODAL_ID,
  COMPLAINT_PANEL_CMD,
  SET_COMPLAINT_CHANNEL_CMD,
  COMPLAINT_PANEL_CUSTOM_ID,
  COMPLAINT_THREAD_SUBMIT_ID,
  COMPLAINT_THREAD_CANCEL_ID,
  DELETE_THREAD_CONFIRM_ID,
  DELETE_THREAD_CANCEL_ID,
  SETUP_STATS_CMD,
  ARTWORK_SUBSCRIBE_PREFIX,
  ARTWORK_NOTIFY_BTN_PREFIX,
  ARTWORK_NOTIFY_MODAL_PREFIX,
  BOT_SAY_CMD,
  BOT_SAY_MODAL_PREFIX,
  BOT_SAY_TEXT_INPUT,
  BOT_EDIT_CMD,
  BOT_EDIT_MODAL_PREFIX,
  BOT_EDIT_TEXT_INPUT,
  SETUP_TRIVIA_PANEL_CMD,
  ADD_TRIVIA_CMD,
  DELETE_TRIVIA_CMD,
  LIST_TRIVIA_CMD,
  TRIVIA_DRAW_BTN_ID,
  TRIVIA_ADD_MODAL_ID,
  NOTIFY_SUBSCRIBERS_CMD,
  BAN_PANEL_CMD,
  SET_BAN_CHANNEL_CMD,
  BAN_ACTION_SELECT_ID,
  BAN_TARGET_SELECT_PREFIX,
  BAN_MODAL_PREFIX,
  KICK_MODAL_PREFIX,
  MUTE_MODAL_PREFIX,
  SUGGESTION_PANEL_CMD,
  SET_SUGGESTION_CHANNEL_CMD,
  SUGGESTION_PANEL_CUSTOM_ID,
  SUGGESTION_MODAL_ID,
  SUGGESTION_UPVOTE_PREFIX,
  SUGGESTION_DOWNVOTE_PREFIX,
  SUGGESTION_ACCEPT_PREFIX,
  SUGGESTION_REJECT_PREFIX,
  SUGGESTION_UPVOTE_MODAL_PREFIX,
  SUGGESTION_DOWNVOTE_MODAL_PREFIX,
  SUGGESTION_REJECT_MODAL_PREFIX,
} from "./constants.js";
import { decodeFileInfo } from "./filenameCodec.js";
import { db, artworkWatermarksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  extractPngWatermark,
  extractJsonWatermark,
  extractTextWatermark,
} from "./watermark.js";

interface BotSaySession {
  channelId: string;
  replyTo: string | null;
  files: Array<{ url: string; name: string }>;
}
const botSaySessions = new Map<string, BotSaySession>();

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
    startStatsScheduler(client);
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

        const member = interaction.member as GuildMember | null;
        const isAdmin = checkIsAdmin(interaction.guildId, member);

        if (commandName === REVIEW_PANEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const panel = buildReviewPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "审核面板已发送！", flags: 64 });

        } else if (commandName === ARTWORK_PANEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const panel = buildArtworkPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "作品面板已发送！", flags: 64 });

        } else if (commandName === NOTIFY_SUBSCRIBERS_CMD) {
          await handleNotifySubscribersCmd(interaction, client);

        } else if (commandName === ARTWORK_UPLOAD_CMD) {
          await handleArtworkUpload(interaction, client);

        } else if (commandName === SET_LOG_CHANNEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const channel = interaction.options.getChannel("channel", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_LOG_CHANNEL, channel.id);
          await interaction.reply({
            content: `已将获取记录频道设置为 <#${channel.id}>`,
            flags: 64,
          });

        } else if (commandName === SET_ADMIN_ROLE_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const role = interaction.options.getRole("role", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_ADMIN_ROLE, role.id);
          await interaction.reply({
            content: `已将管理员身份组设置为 <@&${role.id}>`,
            flags: 64,
          });

        } else if (commandName === SET_APPROVE_ROLE_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const role = interaction.options.getRole("role", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_APPROVE_ROLE, role.id);
          await interaction.reply({
            content: `审核通过后将自动赋予身份组 <@&${role.id}>`,
            flags: 64,
          });

        } else if (commandName === DECODE_FILENAME_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
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

        } else if (commandName === DELETE_THREAD_CMD) {
          await handleDeleteThread(interaction);

        } else if (commandName === COMPLAINT_PANEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const panel = buildComplaintPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "投诉面板已发送！", flags: 64 });

        } else if (commandName === SET_COMPLAINT_CHANNEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const channel = interaction.options.getChannel("channel", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_COMPLAINT_CHANNEL, channel.id);
          await interaction.reply({
            content: `已将投诉工单接收频道设置为 <#${channel.id}>`,
            flags: 64,
          });

        } else if (commandName === SEARCH_PANEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const panel = buildSearchPanel();
          let guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (!guildChannel && interaction.channelId) {
            guildChannel = (await client.channels.fetch(interaction.channelId)) as GuildTextBasedChannel | null;
          }
          if (!guildChannel) {
            await interaction.reply({ content: "❌ 无法获取当前频道，请确认机器人有权限访问此频道。", flags: 64 });
            return;
          }
          await guildChannel.send(panel);
          await interaction.reply({ content: "搜索面板已发送！", flags: 64 });

        } else if (commandName === SETUP_STATS_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          logger.info({ guildId: interaction.guildId }, "setup_stats interaction received");
          await handleSetupStats(interaction, client);

        } else if (commandName === BOT_SAY_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }

          const targetChannel = interaction.options.getChannel("channel");
          const channelId = targetChannel?.id ?? interaction.channelId;
          const replyTo = interaction.options.getString("reply_to") ?? null;

          const files: Array<{ url: string; name: string }> = [];
          for (let i = 1; i <= 5; i++) {
            const att = interaction.options.getAttachment(i === 1 ? "file1" : `file${i}`);
            if (att) files.push({ url: att.url, name: att.name });
          }

          botSaySessions.set(interaction.user.id, { channelId, replyTo, files });

          const titleParts: string[] = [];
          if (files.length > 0) titleParts.push(`📎 ${files.length} 个附件`);
          if (replyTo) titleParts.push("↩️ 回复模式");

          const modal = new ModalBuilder()
            .setCustomId(`${BOT_SAY_MODAL_PREFIX}${channelId}`)
            .setTitle(titleParts.length ? `发送消息（${titleParts.join("・")}）` : "以 Bot 身份发送消息");

          const textInput = new TextInputBuilder()
            .setCustomId(BOT_SAY_TEXT_INPUT)
            .setLabel("消息内容（支持换行、Markdown、表情、艾特）")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder(
              "😀 表情：直接粘贴 Unicode 表情符号\n" +
              "<:名字:ID> 自定义表情\n" +
              "<@用户ID> 艾特成员　<@&身份组ID> 艾特身份组"
            )
            .setMaxLength(2000)
            .setRequired(files.length === 0);

          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));
          await interaction.showModal(modal);

        } else if (commandName === BOT_EDIT_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }

          const messageId = interaction.options.getString("message_id", true);
          const targetChannel = interaction.options.getChannel("channel");
          const channelId = targetChannel?.id ?? interaction.channelId;

          // 取出原消息内容用于预填
          const ch = await client.channels.fetch(channelId).catch(() => null);
          if (!ch || !ch.isTextBased()) {
            await interaction.reply({ content: "❌ 找不到目标频道。", flags: 64 });
            return;
          }
          const originalMsg = await (ch as GuildTextBasedChannel).messages
            .fetch(messageId)
            .catch(() => null);
          if (!originalMsg) {
            await interaction.reply({ content: "❌ 找不到该消息，请确认消息 ID 和频道是否正确。", flags: 64 });
            return;
          }
          if (originalMsg.author.id !== client.user?.id) {
            await interaction.reply({ content: "❌ 该消息不是 Bot 发送的，无法编辑。", flags: 64 });
            return;
          }

          const modal = new ModalBuilder()
            .setCustomId(`${BOT_EDIT_MODAL_PREFIX}${channelId}:${messageId}`)
            .setTitle("编辑 Bot 消息");

          const textInput = new TextInputBuilder()
            .setCustomId(BOT_EDIT_TEXT_INPUT)
            .setLabel("消息内容（支持 Enter 换行）")
            .setStyle(TextInputStyle.Paragraph)
            .setValue(originalMsg.content)
            .setMaxLength(2000)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(textInput));
          await interaction.showModal(modal);

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

        } else if (commandName === SUGGESTION_PANEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const panel = buildSuggestionPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "意见箱面板已发送！", flags: 64 });

        } else if (commandName === SET_SUGGESTION_CHANNEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const channel = interaction.options.getChannel("channel", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_SUGGESTION_CHANNEL, channel.id);
          await interaction.reply({ content: `已将意见箱工单接收频道设置为 <#${channel.id}>`, flags: 64 });

        } else if (commandName === BAN_PANEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const panel = buildBanPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "封禁管理面板已发送！", flags: 64 });

        } else if (commandName === SET_BAN_CHANNEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const channel = interaction.options.getChannel("channel", true);
          if (!interaction.guildId) return;
          await setConfig(interaction.guildId, CONFIG_KEY_BAN_CHANNEL, channel.id);
          await interaction.reply({ content: `已将封禁公告频道设置为 <#${channel.id}>`, flags: 64 });

        } else if (commandName === SETUP_TRIVIA_PANEL_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          const panel = buildTriviaPanel();
          const guildChannel = interaction.channel as GuildTextBasedChannel | null;
          if (guildChannel) await guildChannel.send(panel);
          await interaction.reply({ content: "闲话面板已发送！", flags: 64 });

        } else if (commandName === ADD_TRIVIA_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          await handleAddTrivia(interaction);

        } else if (commandName === DELETE_TRIVIA_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          await handleDeleteTrivia(interaction);

        } else if (commandName === LIST_TRIVIA_CMD) {
          if (!isAdmin) { await interaction.reply({ content: "❌ 你没有权限使用此指令。", flags: 64 }); return; }
          await handleListTrivia(interaction);
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

        } else if (customId === COMPLAINT_THREAD_SUBMIT_ID) {
          await handleComplaintThreadSubmit(interaction, client);

        } else if (customId === COMPLAINT_THREAD_CANCEL_ID) {
          await handleComplaintThreadCancel(interaction);

        } else if (customId === DELETE_THREAD_CONFIRM_ID) {
          await handleDeleteThreadConfirm(interaction);

        } else if (customId === DELETE_THREAD_CANCEL_ID) {
          await handleDeleteThreadCancel(interaction);

        } else if (customId === SEARCH_KEYWORD_BTN_ID) {
          await handleSearchKeywordBtn(interaction);

        } else if (customId === SEARCH_NICKNAME_BTN_ID) {
          await handleSearchNicknameBtn(interaction);

        } else if (customId.startsWith(ARTWORK_SUBSCRIBE_PREFIX)) {
          const channelId = customId.slice(ARTWORK_SUBSCRIBE_PREFIX.length);
          await handleArtworkSubscribe(interaction, channelId);

        } else if (customId.startsWith(ARTWORK_NOTIFY_BTN_PREFIX)) {
          const channelId = customId.slice(ARTWORK_NOTIFY_BTN_PREFIX.length);
          await handleArtworkNotifyBtn(interaction, channelId);

        } else if (customId === TRIVIA_DRAW_BTN_ID) {
          await handleTriviaDrawButton(interaction);

        } else if (customId === SUGGESTION_PANEL_CUSTOM_ID) {
          await handleSuggestionButton(interaction);

        } else if (customId.startsWith(SUGGESTION_UPVOTE_PREFIX)) {
          const id = parseInt(customId.slice(SUGGESTION_UPVOTE_PREFIX.length), 10);
          await handleSuggestionUpvoteBtn(interaction, id);

        } else if (customId.startsWith(SUGGESTION_DOWNVOTE_PREFIX)) {
          const id = parseInt(customId.slice(SUGGESTION_DOWNVOTE_PREFIX.length), 10);
          await handleSuggestionDownvoteBtn(interaction, id);

        } else if (customId.startsWith(SUGGESTION_ACCEPT_PREFIX)) {
          const id = parseInt(customId.slice(SUGGESTION_ACCEPT_PREFIX.length), 10);
          await handleSuggestionAccept(interaction, id, client);

        } else if (customId.startsWith(SUGGESTION_REJECT_PREFIX)) {
          const id = parseInt(customId.slice(SUGGESTION_REJECT_PREFIX.length), 10);
          await handleSuggestionRejectBtn(interaction, id);

        }

      } else if (interaction.isStringSelectMenu()) {
        const { customId } = interaction;

        if (customId === BAN_ACTION_SELECT_ID) {
          await handleBanActionSelect(interaction);
        }

      } else if (interaction.isUserSelectMenu()) {
        const { customId } = interaction;

        if (customId.startsWith(BAN_TARGET_SELECT_PREFIX)) {
          const action = customId.slice(BAN_TARGET_SELECT_PREFIX.length);
          await handleBanTargetSelect(interaction, action);
        }

      } else if (interaction.isChannelSelectMenu()) {
        const { customId } = interaction;

        if (customId === SEARCH_CHANNEL_SELECT_ID) {
          await handleSearchChannelSelect(interaction);
        }

      } else if (interaction.isModalSubmit()) {
        const { customId } = interaction;

        if (customId === REVIEW_SUBMIT_MODAL_ID) {
          await handleReviewSubmitModal(interaction, client);

        } else if (customId.startsWith(ARTWORK_GET_MODAL_PREFIX)) {
          const messageId = customId.slice(ARTWORK_GET_MODAL_PREFIX.length);
          await handleArtworkGetModal(interaction, messageId, client);

        } else if (customId === SEARCH_KEYWORD_MODAL_ID) {
          await handleSearchKeywordModal(interaction);

        } else if (customId === SEARCH_NICKNAME_MODAL_ID) {
          await handleSearchNicknameModal(interaction);

        } else if (customId.startsWith(KICK_MODAL_PREFIX)) {
          const targetId = customId.slice(KICK_MODAL_PREFIX.length);
          await handleKickModal(interaction, targetId, client);

        } else if (customId.startsWith(MUTE_MODAL_PREFIX)) {
          const rest = customId.slice(MUTE_MODAL_PREFIX.length);
          const underscoreIdx = rest.indexOf("_");
          const days = Number(rest.slice(0, underscoreIdx));
          const targetId = rest.slice(underscoreIdx + 1);
          await handleMuteModal(interaction, days, targetId, client);

        } else if (customId.startsWith(BAN_MODAL_PREFIX)) {
          const targetId = customId.slice(BAN_MODAL_PREFIX.length);
          await handleBanModal(interaction, targetId, client);

        } else if (customId.startsWith(ARTWORK_NOTIFY_MODAL_PREFIX)) {
          const channelId = customId.slice(ARTWORK_NOTIFY_MODAL_PREFIX.length);
          await handleArtworkNotifyModal(interaction, channelId, client);

        } else if (customId.startsWith(BOT_SAY_MODAL_PREFIX)) {
          const channelId = customId.slice(BOT_SAY_MODAL_PREFIX.length);
          const content = interaction.fields.getTextInputValue(BOT_SAY_TEXT_INPUT).trim();

          const session = botSaySessions.get(interaction.user.id);
          botSaySessions.delete(interaction.user.id);

          const effectiveChannelId = session?.channelId ?? channelId;
          const replyTo = session?.replyTo ?? null;
          const sessionFiles = session?.files ?? [];

          const ch = await client.channels.fetch(effectiveChannelId).catch(() => null);
          if (!ch || !ch.isTextBased()) {
            await interaction.reply({ content: "❌ 找不到目标频道。", flags: 64 });
            return;
          }

          const attachments = sessionFiles.map((f) => new AttachmentBuilder(f.url, { name: f.name }));

          const sendOptions: Parameters<GuildTextBasedChannel["send"]>[0] = {
            ...(content ? { content } : {}),
            ...(attachments.length ? { files: attachments } : {}),
            ...(replyTo ? { reply: { messageReference: replyTo } } : {}),
          };

          await (ch as GuildTextBasedChannel).send(sendOptions);
          await interaction.reply({ content: `✅ 消息已发送至 <#${effectiveChannelId}>`, flags: 64 });
          logger.info({ adminId: interaction.user.id, channelId: effectiveChannelId, replyTo, fileCount: sessionFiles.length }, "Admin sent message via bot");

        } else if (customId.startsWith(BOT_EDIT_MODAL_PREFIX)) {
          const rest = customId.slice(BOT_EDIT_MODAL_PREFIX.length);
          const colonIdx = rest.indexOf(":");
          const channelId = rest.slice(0, colonIdx);
          const messageId = rest.slice(colonIdx + 1);
          const newContent = interaction.fields.getTextInputValue(BOT_EDIT_TEXT_INPUT);

          const ch = await client.channels.fetch(channelId).catch(() => null);
          if (!ch || !ch.isTextBased()) {
            await interaction.reply({ content: "❌ 找不到目标频道。", flags: 64 });
            return;
          }

          const msg = await (ch as GuildTextBasedChannel).messages
            .fetch(messageId)
            .catch(() => null);
          if (!msg) {
            await interaction.reply({ content: "❌ 找不到该消息。", flags: 64 });
            return;
          }

          await msg.edit({ content: newContent });
          await interaction.reply({ content: "✅ 消息已更新。", flags: 64 });
          logger.info({ adminId: interaction.user.id, channelId, messageId }, "Admin edited bot message");

        } else if (customId === TRIVIA_ADD_MODAL_ID) {
          await handleAddTriviaModal(interaction);

        } else if (customId === SUGGESTION_MODAL_ID) {
          await handleSuggestionModal(interaction, client);

        } else if (customId.startsWith(SUGGESTION_UPVOTE_MODAL_PREFIX)) {
          const id = parseInt(customId.slice(SUGGESTION_UPVOTE_MODAL_PREFIX.length), 10);
          await handleSuggestionUpvoteModal(interaction, id, client);

        } else if (customId.startsWith(SUGGESTION_DOWNVOTE_MODAL_PREFIX)) {
          const id = parseInt(customId.slice(SUGGESTION_DOWNVOTE_MODAL_PREFIX.length), 10);
          await handleSuggestionDownvoteModal(interaction, id, client);

        } else if (customId.startsWith(SUGGESTION_REJECT_MODAL_PREFIX)) {
          const id = parseInt(customId.slice(SUGGESTION_REJECT_MODAL_PREFIX.length), 10);
          await handleSuggestionRejectModal(interaction, id, client);
        }
      }
    } catch (err) {
      logger.error({ err }, "Unhandled interaction error");
    }
  });

  // 成员加入/离开/角色变更时即时更新统计（防抖 3 秒，避免批量操作刷爆 API）
  client.on(Events.GuildMemberAdd, (member) => {
    scheduleStatsUpdate(member.guild);
  });

  client.on(Events.GuildMemberRemove, (member) => {
    if (member.guild) scheduleStatsUpdate(member.guild);
  });

  client.on(Events.GuildMemberUpdate, (_oldMember: GuildMember, newMember: GuildMember) => {
    scheduleStatsUpdate(newMember.guild);
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

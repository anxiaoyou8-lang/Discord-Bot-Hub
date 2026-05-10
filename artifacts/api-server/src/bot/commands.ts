import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";

import {
  REVIEW_PANEL_CMD,
  ARTWORK_PANEL_CMD,
  ARTWORK_UPLOAD_CMD,
  SET_LOG_CHANNEL_CMD,
  SET_ADMIN_ROLE_CMD,
  SET_APPROVE_ROLE_CMD,
  DECODE_FILENAME_CMD,
  LOOKUP_TRACE_CMD,
  GO_TOP_CMD,
  DELETE_THREAD_CMD,
  SEARCH_PANEL_CMD,
  COMPLAINT_PANEL_CMD,
  SET_COMPLAINT_CHANNEL_CMD,
  SETUP_STATS_CMD,
  BOT_SAY_CMD,
  BOT_EDIT_CMD,
  SETUP_TRIVIA_PANEL_CMD,
  ADD_TRIVIA_CMD,
  DELETE_TRIVIA_CMD,
  LIST_TRIVIA_CMD,
  SUGGESTION_PANEL_CMD,
  SET_SUGGESTION_CHANNEL_CMD,
  NOTIFY_SUBSCRIBERS_CMD,
  BAN_PANEL_CMD,
  SET_BAN_CHANNEL_CMD,
} from "./constants.js";

const uploadArtworkCmd = new SlashCommandBuilder()
  .setName(ARTWORK_UPLOAD_CMD)
  .setDescription("上传你的作品（最多10个文件）")
  .addStringOption((opt) =>
    opt.setName("title").setDescription("作品名称").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("password").setDescription("获取作品所需密码").setRequired(true)
  )
  .addAttachmentOption((opt) =>
    opt.setName("file1").setDescription("作品文件1（必填）").setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("description").setDescription("作品备注说明").setRequired(false)
  );

for (let i = 2; i <= 10; i++) {
  uploadArtworkCmd.addAttachmentOption((opt) =>
    opt.setName(`file${i}`).setDescription(`作品文件${i}`).setRequired(false)
  );
}

export const commands = [
  new SlashCommandBuilder()
    .setName(REVIEW_PANEL_CMD)
    .setDescription("在当前频道发送审核交互面板"),

  new SlashCommandBuilder()
    .setName(ARTWORK_PANEL_CMD)
    .setDescription("在当前频道发送作品交互面板说明"),

  new SlashCommandBuilder()
    .setName(SET_LOG_CHANNEL_CMD)
    .setDescription("设置作品获取记录发送的私密频道")
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("目标频道").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(SET_ADMIN_ROLE_CMD)
    .setDescription("设置拥有审核权限的管理员身份组")
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("管理员身份组").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(SET_APPROVE_ROLE_CMD)
    .setDescription("设置审核通过后自动赋予的身份组")
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("审核通过身份组").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(DECODE_FILENAME_CMD)
    .setDescription("解码作品文件名，还原获取时间与获取者信息")
    .addStringOption((opt) =>
      opt
        .setName("code")
        .setDescription("文件名中的编码部分（去掉扩展名的部分）")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(LOOKUP_TRACE_CMD)
    .setDescription("上传泄露的作品文件，自动提取溯源ID并查找获取者")
    .addAttachmentOption((opt) =>
      opt
        .setName("file")
        .setDescription("上传疑似泄露的原始文件（支持 PNG / JSON / 文本类文件）")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(GO_TOP_CMD)
    .setDescription("发送跳转到本帖首楼的链接"),

  new SlashCommandBuilder()
    .setName(DELETE_THREAD_CMD)
    .setDescription("删除当前帖子（此操作不可逆）")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

  new SlashCommandBuilder()
    .setName(COMPLAINT_PANEL_CMD)
    .setDescription("在当前频道发送匿名投诉交互面板"),

  new SlashCommandBuilder()
    .setName(SET_COMPLAINT_CHANNEL_CMD)
    .setDescription("设置接收投诉工单的频道")
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("投诉工单接收频道").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(SEARCH_PANEL_CMD)
    .setDescription("在当前频道发送搜索交互面板"),

  new SlashCommandBuilder()
    .setName(SETUP_STATS_CMD)
    .setDescription("创建三个统计语音频道，实时显示梦旅者/梦中身/失眠者人数")
    .addChannelOption((opt) =>
      opt
        .setName("category")
        .setDescription("将统计频道放在哪个分类下（可选）")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  new SlashCommandBuilder()
    .setName(BOT_SAY_CMD)
    .setDescription("以 Bot 身份发送消息，支持附件、回复、表情、艾特（仅管理员可用）")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("目标频道（不填则发送到当前频道）")
        .setRequired(false)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.GuildForum
        )
    )
    .addStringOption((opt) =>
      opt
        .setName("reply_to")
        .setDescription("回复某条消息的 ID（右键消息 → 复制消息 ID）")
        .setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName("file1").setDescription("附件 1").setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName("file2").setDescription("附件 2").setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName("file3").setDescription("附件 3").setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName("file4").setDescription("附件 4").setRequired(false)
    )
    .addAttachmentOption((opt) =>
      opt.setName("file5").setDescription("附件 5").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName(BOT_EDIT_CMD)
    .setDescription("编辑 Bot 发送过的一条消息（仅管理员可用）")
    .addStringOption((opt) =>
      opt
        .setName("message_id")
        .setDescription("要编辑的消息 ID（右键消息 → 复制消息 ID）")
        .setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("消息所在频道（不填则默认当前频道）")
        .setRequired(false)
        .addChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.GuildForum
        )
    ),

  new SlashCommandBuilder()
    .setName(SETUP_TRIVIA_PANEL_CMD)
    .setDescription("在当前频道发送闲话随机抽取面板（仅管理员可用）"),

  new SlashCommandBuilder()
    .setName(ADD_TRIVIA_CMD)
    .setDescription("添加一则闲话 / 冷知识（仅管理员可用）"),

  new SlashCommandBuilder()
    .setName(DELETE_TRIVIA_CMD)
    .setDescription("删除一则闲话（仅管理员可用）")
    .addIntegerOption((opt) =>
      opt
        .setName("id")
        .setDescription("要删除的闲话 ID（可在 /列出闲话 中查看）")
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName(LIST_TRIVIA_CMD)
    .setDescription("列出所有闲话及其 ID（仅管理员可用）"),

  new SlashCommandBuilder()
    .setName(SUGGESTION_PANEL_CMD)
    .setDescription("在当前频道发送匿名意见箱面板（仅管理员可用）"),

  new SlashCommandBuilder()
    .setName(SET_SUGGESTION_CHANNEL_CMD)
    .setDescription("设置接收意见箱工单的频道（仅管理员可用）")
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("意见箱工单接收频道").setRequired(true)
    ),

  uploadArtworkCmd,

  new SlashCommandBuilder()
    .setName(NOTIFY_SUBSCRIBERS_CMD)
    .setDescription("向当前作品帖的订阅者发送更新通知（仅作品作者可用）"),

  new SlashCommandBuilder()
    .setName(BAN_PANEL_CMD)
    .setDescription("在当前频道发送封禁管理面板（仅管理员可用）"),

  new SlashCommandBuilder()
    .setName(SET_BAN_CHANNEL_CMD)
    .setDescription("设置封禁公告发送的频道（仅管理员可用）")
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("封禁公告频道").setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

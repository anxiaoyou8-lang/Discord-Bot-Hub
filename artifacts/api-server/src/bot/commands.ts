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
    .setDescription("在当前频道发送审核交互面板")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName(ARTWORK_PANEL_CMD)
    .setDescription("在当前频道发送作品交互面板说明")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName(SET_LOG_CHANNEL_CMD)
    .setDescription("设置作品获取记录发送的私密频道")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("目标频道").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(SET_ADMIN_ROLE_CMD)
    .setDescription("设置拥有审核权限的管理员身份组")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("管理员身份组").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(SET_APPROVE_ROLE_CMD)
    .setDescription("设置审核通过后自动赋予的身份组")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("审核通过身份组").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(DECODE_FILENAME_CMD)
    .setDescription("解码作品文件名，还原获取时间与获取者信息")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("code")
        .setDescription("文件名中的编码部分（去掉扩展名的部分）")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(LOOKUP_TRACE_CMD)
    .setDescription("上传泄露的作品文件，自动提取溯源ID并查找获取者")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
    .setDescription("在当前频道发送匿名投诉交互面板")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName(SET_COMPLAINT_CHANNEL_CMD)
    .setDescription("设置接收投诉工单的频道")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt.setName("channel").setDescription("投诉工单接收频道").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(SEARCH_PANEL_CMD)
    .setDescription("在当前频道发送搜索交互面板")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName(SETUP_STATS_CMD)
    .setDescription("创建三个统计语音频道，实时显示梦旅者/梦中身/失眠者人数")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((opt) =>
      opt
        .setName("category")
        .setDescription("将统计频道放在哪个分类下（可选）")
        .setRequired(false)
        .addChannelTypes(ChannelType.GuildCategory)
    ),

  new SlashCommandBuilder()
    .setName(BOT_SAY_CMD)
    .setDescription("以 Bot 身份在指定频道发送一条文字消息（仅管理员可用）")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("content")
        .setDescription("要发送的消息内容")
        .setRequired(true)
        .setMaxLength(2000)
    )
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
    ),

  uploadArtworkCmd,
].map((cmd) => cmd.toJSON());

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
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
  COMPLAINT_PANEL_CMD,
  SET_COMPLAINT_CHANNEL_CMD,
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
    .setDescription("设置拥有审核权限的管理员身分组")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("管理员身分组").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName(SET_APPROVE_ROLE_CMD)
    .setDescription("设置审核通过后自动赋予的身分组")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((opt) =>
      opt.setName("role").setDescription("审核通过身分组").setRequired(true)
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

  uploadArtworkCmd,
].map((cmd) => cmd.toJSON());

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
    .setDescription("通过文件溯源ID查找获取者信息")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt
        .setName("trace_id")
        .setDescription("文件中嵌入的12位十六进制溯源ID")
        .setRequired(true)
    ),

  uploadArtworkCmd,
].map((cmd) => cmd.toJSON());

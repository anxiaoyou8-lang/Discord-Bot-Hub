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
} from "./constants.js";

export const commands = [
  new SlashCommandBuilder()
    .setName(REVIEW_PANEL_CMD)
    .setDescription("在当前频道发送审核交互面板")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName(ARTWORK_PANEL_CMD)
    .setDescription("在当前频道发送作品交互面板")
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
    .setName(ARTWORK_UPLOAD_CMD)
    .setDescription("上传你的作品")
    .addStringOption((opt) =>
      opt.setName("title").setDescription("作品名称").setRequired(true)
    )
    .addAttachmentOption((opt) =>
      opt.setName("file").setDescription("作品文件").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("password").setDescription("获取作品所需密码").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("description").setDescription("作品备注说明").setRequired(false)
    ),
].map((cmd) => cmd.toJSON());

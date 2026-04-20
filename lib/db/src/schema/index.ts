import { pgTable, text, serial, timestamp, boolean, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guildConfigsTable = pgTable(
  "guild_configs",
  {
    id: serial("id").primaryKey(),
    guildId: text("guild_id").notNull(),
    configKey: text("config_key").notNull(),
    configValue: text("config_value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique("uniq_guild_key").on(table.guildId, table.configKey)]
);

export const artworksTable = pgTable("artworks", {
  id: serial("id").primaryKey(),
  messageId: text("message_id").notNull().unique(),
  channelId: text("channel_id").notNull(),
  guildId: text("guild_id").notNull(),
  authorId: text("author_id").notNull(),
  authorTag: text("author_tag").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  password: text("password").notNull(),
  fileUrls: text("file_urls").array().notNull(),
  fileNames: text("file_names").array().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const artworkAccessLogsTable = pgTable("artwork_access_logs", {
  id: serial("id").primaryKey(),
  artworkId: text("artwork_id").notNull(),
  artworkTitle: text("artwork_title").notNull(),
  accessorId: text("accessor_id").notNull(),
  accessorTag: text("accessor_tag").notNull(),
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
});

export const reviewThreadsTable = pgTable("review_threads", {
  id: serial("id").primaryKey(),
  threadId: text("thread_id").notNull().unique(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  status: text("status").notNull().default("pending"),
  locked: boolean("locked").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"),
});

export const artworkWatermarksTable = pgTable("artwork_watermarks", {
  id: serial("id").primaryKey(),
  traceId: text("trace_id").notNull().unique(),
  artworkId: text("artwork_id").notNull(),
  artworkTitle: text("artwork_title").notNull(),
  accessorId: text("accessor_id").notNull(),
  accessorTag: text("accessor_tag").notNull(),
  filename: text("filename").notNull(),
  watermarkMethod: text("watermark_method").notNull(),
  accessedAt: timestamp("accessed_at").defaultNow().notNull(),
});

export const complaintTicketsTable = pgTable("complaint_tickets", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  content: text("content").notNull(),
  attachmentUrls: text("attachment_urls"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertArtworkSchema = createInsertSchema(artworksTable).omit({ id: true, createdAt: true });
export type InsertArtwork = z.infer<typeof insertArtworkSchema>;
export type Artwork = typeof artworksTable.$inferSelect;
export type ArtworkAccessLog = typeof artworkAccessLogsTable.$inferSelect;
export type ReviewThread = typeof reviewThreadsTable.$inferSelect;
export type GuildConfig = typeof guildConfigsTable.$inferSelect;
export type ArtworkWatermark = typeof artworkWatermarksTable.$inferSelect;

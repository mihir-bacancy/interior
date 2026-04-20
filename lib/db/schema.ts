import { sql } from "drizzle-orm";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// --------------------------------------------------------------------------
// videos — one row per Pinterest pin we've ingested
// --------------------------------------------------------------------------
export const videos = pgTable(
  "videos",
  {
    id: serial("id").primaryKey(),
    pinId: text("pin_id").notNull(),
    keyword: text("keyword").notNull(),
    title: text("title"),
    // Canonical public URL served from Cloudinary; Outstand uses this for posting.
    cloudinaryUrl: text("cloudinary_url").notNull(),
    cloudinaryPublicId: text("cloudinary_public_id").notNull(),
    // Optional: where the file sits locally on the downloader machine.
    localPath: text("local_path"),
    sourceUrl: text("source_url"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    usedForPost: integer("used_for_post").default(0).notNull(),
  },
  (t) => [unique("videos_pin_id_unique").on(t.pinId)]
);

// --------------------------------------------------------------------------
// captions — history of captions per video (latest wins)
// --------------------------------------------------------------------------
export const captions = pgTable("captions", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  model: text("model"),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// --------------------------------------------------------------------------
// posts — scheduling + publishing queue
// --------------------------------------------------------------------------
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  videoId: integer("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "restrict" }),
  captionId: integer("caption_id").references(() => captions.id, {
    onDelete: "set null",
  }),
  outstandAccountId: text("outstand_account_id").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  // scheduled | publishing | posted | failed
  status: text("status").default("scheduled").notNull(),
  outstandPostId: text("outstand_post_id"),
  outstandMediaId: text("outstand_media_id"),
  errorMessage: text("error_message"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// --------------------------------------------------------------------------
// accounts — cached Instagram accounts (refreshed from Outstand)
// --------------------------------------------------------------------------
export const accounts = pgTable("accounts", {
  outstandAccountId: text("outstand_account_id").primaryKey(),
  username: text("username"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  isDefault: integer("is_default").default(0).notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// --------------------------------------------------------------------------
// config — misc key/value settings
// --------------------------------------------------------------------------
export const config = pgTable("config", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type Caption = typeof captions.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Account = typeof accounts.$inferSelect;

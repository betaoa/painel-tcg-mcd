// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campaignPhotos = sqliteTable("campaign_photos", {
  id: text("id").primaryKey(),
  store: text("store").notNull(),
  promoter: text("promoter").notNull(),
  campaign: text("campaign").notNull(),
  month: text("month").notNull(),
  objectKey: text("object_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  source: text("source").notNull().default("manual"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const publishedAssets = sqliteTable("published_assets", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  publishedBy: text("published_by").notNull(),
  objectKey: text("object_key").notNull(),
  parts: integer("parts").notNull().default(1),
  complete: integer("complete", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

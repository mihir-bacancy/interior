CREATE TABLE "accounts" (
	"outstand_account_id" text PRIMARY KEY NOT NULL,
	"username" text,
	"display_name" text,
	"avatar_url" text,
	"is_default" integer DEFAULT 0 NOT NULL,
	"connected_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "captions" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer NOT NULL,
	"text" text NOT NULL,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" integer NOT NULL,
	"caption_id" integer,
	"outstand_account_id" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"outstand_post_id" text,
	"outstand_media_id" text,
	"error_message" text,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" serial PRIMARY KEY NOT NULL,
	"pin_id" text NOT NULL,
	"keyword" text NOT NULL,
	"title" text,
	"cloudinary_url" text NOT NULL,
	"cloudinary_public_id" text NOT NULL,
	"local_path" text,
	"source_url" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"downloaded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"used_for_post" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "videos_pin_id_unique" UNIQUE("pin_id")
);
--> statement-breakpoint
ALTER TABLE "captions" ADD CONSTRAINT "captions_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_caption_id_captions_id_fk" FOREIGN KEY ("caption_id") REFERENCES "public"."captions"("id") ON DELETE set null ON UPDATE no action;
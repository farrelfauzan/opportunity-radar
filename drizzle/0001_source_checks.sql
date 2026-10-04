ALTER TABLE "articles" ADD COLUMN "published_at_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_modified" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_status" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "last_success_at" timestamp with time zone;
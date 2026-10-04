CREATE TABLE "articles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "articles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source_id" integer NOT NULL,
	"canonical_url" text NOT NULL,
	"link" text NOT NULL,
	"region" text NOT NULL,
	"category" text NOT NULL,
	"headline" text NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "articles_canonical_url_unique" UNIQUE("canonical_url"),
	CONSTRAINT "articles_region_check" CHECK ("articles"."region" in ('indonesia', 'global')),
	CONSTRAINT "articles_headline_check" CHECK ("articles"."headline" <> ''),
	CONSTRAINT "articles_snippet_check" CHECK (char_length("articles"."snippet") <= 500),
	CONSTRAINT "articles_link_check" CHECK ("articles"."link" ~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"counts" jsonb,
	"error" text,
	CONSTRAINT "job_runs_status_check" CHECK ("job_runs"."status" in ('running', 'ok', 'partial', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sources_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"feed_url" text NOT NULL,
	"region" text NOT NULL,
	"category" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sources_region_check" CHECK ("sources"."region" in ('indonesia', 'global'))
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_published_idx" ON "articles" USING btree ("published_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_runs_job_finished_idx" ON "job_runs" USING btree ("job","finished_at" DESC NULLS LAST);
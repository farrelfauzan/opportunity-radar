CREATE TABLE "venture_articles" (
	"venture_id" integer NOT NULL,
	"article_id" bigint NOT NULL,
	"relevance" integer NOT NULL,
	"matched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venture_articles_venture_id_article_id_pk" PRIMARY KEY("venture_id","article_id"),
	CONSTRAINT "venture_articles_relevance_check" CHECK ("venture_articles"."relevance" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "venture_market" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "venture_market_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"venture_id" integer NOT NULL,
	"day" date NOT NULL,
	"region" text NOT NULL,
	"score" integer,
	"factors" jsonb,
	"related_articles" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venture_market_venture_day_region_unique" UNIQUE("venture_id","day","region"),
	CONSTRAINT "venture_market_region_check" CHECK ("venture_market"."region" in ('indonesia', 'global')),
	CONSTRAINT "venture_market_score_check" CHECK ("venture_market"."score" between 0 and 100),
	CONSTRAINT "venture_market_score_factors_check" CHECK (("venture_market"."score" is null) = ("venture_market"."factors" is null))
);
--> statement-breakpoint
CREATE TABLE "venture_progress" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "venture_progress_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"venture_id" integer NOT NULL,
	"day" date NOT NULL,
	"percent" integer NOT NULL,
	"sprint_delivered" integer,
	"sprint_next" integer,
	"tickets_in_qa" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venture_progress_venture_day_unique" UNIQUE("venture_id","day"),
	CONSTRAINT "venture_progress_percent_check" CHECK ("venture_progress"."percent" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "venture_winds" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "venture_winds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"venture_id" integer NOT NULL,
	"day" date NOT NULL,
	"tailwind_en" text,
	"tailwind_id" text,
	"tailwind_article_ids" bigint[] DEFAULT '{}' NOT NULL,
	"headwind_en" text,
	"headwind_id" text,
	"headwind_article_ids" bigint[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venture_winds_venture_day_unique" UNIQUE("venture_id","day"),
	CONSTRAINT "venture_winds_tailwind_check" CHECK (("venture_winds"."tailwind_en" is null and "venture_winds"."tailwind_id" is null) or ("venture_winds"."tailwind_en" is not null and "venture_winds"."tailwind_id" is not null and "venture_winds"."tailwind_en" <> '' and "venture_winds"."tailwind_id" <> '' and cardinality("venture_winds"."tailwind_article_ids") > 0)),
	CONSTRAINT "venture_winds_headwind_check" CHECK (("venture_winds"."headwind_en" is null and "venture_winds"."headwind_id" is null) or ("venture_winds"."headwind_en" is not null and "venture_winds"."headwind_id" is not null and "venture_winds"."headwind_en" <> '' and "venture_winds"."headwind_id" <> '' and cardinality("venture_winds"."headwind_article_ids") > 0))
);
--> statement-breakpoint
CREATE TABLE "ventures" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ventures_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description_en" text NOT NULL,
	"description_id" text NOT NULL,
	"sectors" text[] NOT NULL,
	"keywords" text[] NOT NULL,
	"progress_goal" text NOT NULL,
	"progress_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ventures_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ventures_descriptions_check" CHECK ("ventures"."description_en" <> '' and "ventures"."description_id" <> ''),
	CONSTRAINT "ventures_sectors_check" CHECK (cardinality("ventures"."sectors") between 1 and 3 and "ventures"."sectors" <@ array['agri_food', 'fisheries_maritime', 'energy_mining', 'renewables_climate', 'manufacturing', 'logistics', 'retail_ecommerce', 'fintech_finance', 'health_biotech', 'education', 'property_construction', 'tourism_hospitality', 'media_creative', 'telecom_infra', 'ai_software', 'hardware_electronics', 'govtech_public', 'consumer_services']::text[]),
	CONSTRAINT "ventures_progress_goal_check" CHECK ("ventures"."progress_goal" in ('mvp', 'release')),
	CONSTRAINT "ventures_progress_source_check" CHECK ("ventures"."progress_source" is null or "ventures"."progress_source" = 'notion')
);
--> statement-breakpoint
ALTER TABLE "venture_articles" ADD CONSTRAINT "venture_articles_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_articles" ADD CONSTRAINT "venture_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_market" ADD CONSTRAINT "venture_market_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_progress" ADD CONSTRAINT "venture_progress_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venture_winds" ADD CONSTRAINT "venture_winds_venture_id_ventures_id_fk" FOREIGN KEY ("venture_id") REFERENCES "public"."ventures"("id") ON DELETE no action ON UPDATE no action;
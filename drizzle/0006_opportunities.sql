CREATE TABLE "opportunities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "opportunities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title_en" text NOT NULL,
	"title_id" text NOT NULL,
	"thesis_en" text NOT NULL,
	"thesis_id" text NOT NULL,
	"region" text NOT NULL,
	"theme" text NOT NULL,
	"sectors" text[] NOT NULL,
	"horizon" text NOT NULL,
	"capital_level" text NOT NULL,
	"capital_reason_en" text NOT NULL,
	"capital_reason_id" text NOT NULL,
	"buyer_en" text NOT NULL,
	"buyer_id" text NOT NULL,
	"model_en" text NOT NULL,
	"model_id" text NOT NULL,
	"risks_en" text[] NOT NULL,
	"risks_id" text[] NOT NULL,
	"first_steps_en" text[] NOT NULL,
	"first_steps_id" text[] NOT NULL,
	"related_exposure_en" text,
	"related_exposure_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"current_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "opportunities_title_check" CHECK (btrim("opportunities"."title_en") <> '' and char_length("opportunities"."title_en") <= 90 and btrim("opportunities"."title_id") <> '' and char_length("opportunities"."title_id") <= 90),
	CONSTRAINT "opportunities_thesis_check" CHECK (btrim("opportunities"."thesis_en") <> '' and char_length("opportunities"."thesis_en") <= 400 and btrim("opportunities"."thesis_id") <> '' and char_length("opportunities"."thesis_id") <= 400),
	CONSTRAINT "opportunities_region_check" CHECK ("opportunities"."region" in ('indonesia', 'global')),
	CONSTRAINT "opportunities_theme_check" CHECK ("opportunities"."theme" ~ '^[a-z_]+$'),
	CONSTRAINT "opportunities_sectors_check" CHECK (cardinality("opportunities"."sectors") between 1 and 3 and "opportunities"."sectors" <@ array['agri_food', 'fisheries_maritime', 'energy_mining', 'renewables_climate', 'manufacturing', 'logistics', 'retail_ecommerce', 'fintech_finance', 'health_biotech', 'education', 'property_construction', 'tourism_hospitality', 'media_creative', 'telecom_infra', 'ai_software', 'hardware_electronics', 'govtech_public', 'consumer_services']::text[]),
	CONSTRAINT "opportunities_horizon_check" CHECK ("opportunities"."horizon" in ('0-6m', '6-12m', '1-3y')),
	CONSTRAINT "opportunities_capital_level_check" CHECK ("opportunities"."capital_level" in ('low', 'medium', 'high')),
	CONSTRAINT "opportunities_capital_reason_check" CHECK (btrim("opportunities"."capital_reason_en") <> '' and char_length("opportunities"."capital_reason_en") <= 120 and btrim("opportunities"."capital_reason_id") <> '' and char_length("opportunities"."capital_reason_id") <= 120),
	CONSTRAINT "opportunities_buyer_check" CHECK (btrim("opportunities"."buyer_en") <> '' and char_length("opportunities"."buyer_en") <= 120 and btrim("opportunities"."buyer_id") <> '' and char_length("opportunities"."buyer_id") <= 120),
	CONSTRAINT "opportunities_model_check" CHECK (btrim("opportunities"."model_en") <> '' and char_length("opportunities"."model_en") <= 120 and btrim("opportunities"."model_id") <> '' and char_length("opportunities"."model_id") <= 120),
	CONSTRAINT "opportunities_risks_check" CHECK (cardinality("opportunities"."risks_en") between 2 and 5 and cardinality("opportunities"."risks_en") = cardinality("opportunities"."risks_id")),
	CONSTRAINT "opportunities_first_steps_check" CHECK (cardinality("opportunities"."first_steps_en") between 1 and 5 and cardinality("opportunities"."first_steps_en") = cardinality("opportunities"."first_steps_id")),
	CONSTRAINT "opportunities_exposure_check" CHECK (("opportunities"."related_exposure_en" is null) = ("opportunities"."related_exposure_id" is null)),
	CONSTRAINT "opportunities_status_check" CHECK ("opportunities"."status" in ('open', 'closed')),
	CONSTRAINT "opportunities_current_score_check" CHECK ("opportunities"."current_score" between 0 and 100),
	CONSTRAINT "opportunities_closed_check" CHECK (("opportunities"."status" = 'closed') = ("opportunities"."closed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "opportunity_articles" (
	"opportunity_id" integer NOT NULL,
	"article_id" bigint NOT NULL,
	CONSTRAINT "opportunity_articles_opportunity_id_article_id_pk" PRIMARY KEY("opportunity_id","article_id")
);
--> statement-breakpoint
CREATE TABLE "opportunity_scores" (
	"opportunity_id" integer NOT NULL,
	"day" date NOT NULL,
	"overall" integer NOT NULL,
	"demand" integer NOT NULL,
	"timing" integer NOT NULL,
	"competition" integer NOT NULL,
	"capital" integer NOT NULL,
	"regulatory" integer NOT NULL,
	CONSTRAINT "opportunity_scores_opportunity_id_day_pk" PRIMARY KEY("opportunity_id","day"),
	CONSTRAINT "opportunity_scores_overall_check" CHECK ("opportunity_scores"."overall" between 0 and 100),
	CONSTRAINT "opportunity_scores_demand_check" CHECK ("opportunity_scores"."demand" between 0 and 100),
	CONSTRAINT "opportunity_scores_timing_check" CHECK ("opportunity_scores"."timing" between 0 and 100),
	CONSTRAINT "opportunity_scores_competition_check" CHECK ("opportunity_scores"."competition" between 0 and 100),
	CONSTRAINT "opportunity_scores_capital_check" CHECK ("opportunity_scores"."capital" between 0 and 100),
	CONSTRAINT "opportunity_scores_regulatory_check" CHECK ("opportunity_scores"."regulatory" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "opportunity_articles" ADD CONSTRAINT "opportunity_articles_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_articles" ADD CONSTRAINT "opportunity_articles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_scores" ADD CONSTRAINT "opportunity_scores_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunities_list_idx" ON "opportunities" USING btree ("status","current_score" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "opportunity_articles_article_idx" ON "opportunity_articles" USING btree ("article_id");
CREATE TABLE "article_triage" (
	"article_id" bigint PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"category" text,
	"region" text,
	"relevance" integer,
	"impact" text,
	"why_en" text,
	"why_id" text,
	"themes" text[] DEFAULT '{}' NOT NULL,
	"error" text,
	"triaged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_triage_status_check" CHECK ("article_triage"."status" in ('ok', 'failed')),
	CONSTRAINT "article_triage_ok_check" CHECK ("article_triage"."status" <> 'ok' or ("article_triage"."category" is not null and "article_triage"."region" is not null and "article_triage"."relevance" is not null
        and "article_triage"."impact" is not null and "article_triage"."why_en" is not null and "article_triage"."why_id" is not null
        and "article_triage"."why_en" <> '' and "article_triage"."why_id" <> '' and cardinality("article_triage"."themes") between 1 and 3)),
	CONSTRAINT "article_triage_category_check" CHECK ("article_triage"."category" is null or "article_triage"."category" in ('business', 'politics', 'tech-ai', 'markets', 'commodities')),
	CONSTRAINT "article_triage_region_check" CHECK ("article_triage"."region" is null or "article_triage"."region" in ('indonesia', 'global')),
	CONSTRAINT "article_triage_relevance_check" CHECK ("article_triage"."relevance" between 0 and 100),
	CONSTRAINT "article_triage_impact_check" CHECK ("article_triage"."impact" in ('opportunity', 'risk', 'context')),
	CONSTRAINT "article_triage_themes_check" CHECK ("article_triage"."themes" <@ array['ai_adoption', 'ai_regulation', 'data_centers', 'semiconductors', 'cybersecurity', 'digital_payments', 'digital_banking_lending', 'interest_rates', 'inflation_cost_living', 'rupiah_fx', 'trade_tariffs', 'geopolitics_conflict', 'indonesia_policy', 'indonesia_budget_subsidy', 'downstreaming_minerals', 'ev_batteries', 'renewable_energy', 'oil_gas_coal', 'food_security', 'healthcare_access', 'pharma_biotech', 'ecommerce_social', 'consumer_spending', 'logistics_supply_chain', 'infrastructure_construction', 'property_housing', 'tourism_travel', 'education_skills', 'startup_funding', 'ipo_capital_markets', 'halal_islamic_finance', 'crypto_assets', 'gold_commodities', 'labour_wages_layoffs', 'climate_disasters', 'smes_msme', 'other']::text[])
);
--> statement-breakpoint
ALTER TABLE "article_triage" ADD CONSTRAINT "article_triage_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
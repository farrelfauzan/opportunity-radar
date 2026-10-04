CREATE TABLE "signal_reports" (
	"asset_id" integer NOT NULL,
	"term" text NOT NULL,
	"verdict" text NOT NULL,
	"explanation_en" text NOT NULL,
	"explanation_id" text NOT NULL,
	"risks_en" jsonb NOT NULL,
	"risks_id" jsonb NOT NULL,
	"news_supportive" integer[] NOT NULL,
	"news_against" integer[] NOT NULL,
	"news_total" integer NOT NULL,
	"rules_version" text NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_reports_asset_id_term_pk" PRIMARY KEY("asset_id","term"),
	CONSTRAINT "signal_reports_term_check" CHECK ("signal_reports"."term" in ('short', 'long')),
	CONSTRAINT "signal_reports_verdict_check" CHECK ("signal_reports"."verdict" in ('BUY', 'HOLD', 'SELL')),
	CONSTRAINT "signal_reports_text_check" CHECK (length(trim("signal_reports"."explanation_en")) > 0 and length(trim("signal_reports"."explanation_id")) > 0),
	CONSTRAINT "signal_reports_news_check" CHECK ("signal_reports"."news_total" >= 0 and cardinality("signal_reports"."news_supportive") + cardinality("signal_reports"."news_against") <= "signal_reports"."news_total")
);
--> statement-breakpoint
ALTER TABLE "signal_reports" ADD CONSTRAINT "signal_reports_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
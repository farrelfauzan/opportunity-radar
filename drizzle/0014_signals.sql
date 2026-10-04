CREATE TABLE "signal_history" (
	"asset_id" integer NOT NULL,
	"term" text NOT NULL,
	"day" date NOT NULL,
	"from_verdict" text,
	"to_verdict" text NOT NULL,
	"trigger" text NOT NULL,
	"close" double precision NOT NULL,
	"close_day" date NOT NULL,
	"initial" boolean DEFAULT false NOT NULL,
	"rules_version" text NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	CONSTRAINT "signal_history_asset_id_term_day_pk" PRIMARY KEY("asset_id","term","day"),
	CONSTRAINT "signal_history_term_check" CHECK ("signal_history"."term" in ('short', 'long')),
	CONSTRAINT "signal_history_to_check" CHECK ("signal_history"."to_verdict" in ('BUY', 'HOLD', 'SELL')),
	CONSTRAINT "signal_history_from_check" CHECK (("signal_history"."initial" and "signal_history"."from_verdict" is null) or (not "signal_history"."initial" and "signal_history"."from_verdict" in ('BUY', 'HOLD', 'SELL') and "signal_history"."from_verdict" <> "signal_history"."to_verdict")),
	CONSTRAINT "signal_history_trigger_check" CHECK ("signal_history"."trigger" ~ '^signal\.trigger\.[a-zA-Z0-9.]+$'),
	CONSTRAINT "signal_history_close_check" CHECK ("signal_history"."close" > 0)
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"asset_id" integer NOT NULL,
	"term" text NOT NULL,
	"state" text NOT NULL,
	"verdict" text,
	"since" date,
	"as_of_day" date,
	"indicators" jsonb,
	"checks" jsonb NOT NULL,
	"agree" jsonb,
	"reversals" jsonb NOT NULL,
	"currency" jsonb,
	"rules_version" text NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signals_asset_id_term_pk" PRIMARY KEY("asset_id","term"),
	CONSTRAINT "signals_term_check" CHECK ("signals"."term" in ('short', 'long')),
	CONSTRAINT "signals_state_check" CHECK ("signals"."state" in ('BUY', 'HOLD', 'SELL', 'INSUFFICIENT', 'STALE', 'INVALID_DATA')),
	CONSTRAINT "signals_verdict_check" CHECK ("signals"."verdict" in ('BUY', 'HOLD', 'SELL')),
	CONSTRAINT "signals_state_verdict_check" CHECK ("signals"."state" not in ('BUY', 'HOLD', 'SELL') or "signals"."state" = "signals"."verdict")
);
--> statement-breakpoint
ALTER TABLE "signal_history" ADD CONSTRAINT "signal_history_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"symbol" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"exchange" text,
	"currency" text NOT NULL,
	"source" text NOT NULL,
	"on_watchlist" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_slug_unique" UNIQUE("slug"),
	CONSTRAINT "assets_kind_check" CHECK ("assets"."kind" in ('index', 'stock', 'metal', 'crypto', 'fx')),
	CONSTRAINT "assets_slug_check" CHECK ("assets"."slug" ~ '^[a-z0-9-]+$'),
	CONSTRAINT "assets_currency_check" CHECK ("assets"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"asset_id" integer NOT NULL,
	"day" date NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" bigint,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candles_asset_id_day_pk" PRIMARY KEY("asset_id","day"),
	CONSTRAINT "candles_prices_check" CHECK ("candles"."low" > 0 and "candles"."low" <= "candles"."open" and "candles"."low" <= "candles"."close" and "candles"."high" >= "candles"."open" and "candles"."high" >= "candles"."close"),
	CONSTRAINT "candles_volume_check" CHECK ("candles"."volume" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"asset_id" integer PRIMARY KEY NOT NULL,
	"price" double precision NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_price_check" CHECK ("quotes"."price" > 0)
);
--> statement-breakpoint
ALTER TABLE "candles" ADD CONSTRAINT "candles_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;
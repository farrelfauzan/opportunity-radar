CREATE TABLE "llm_usage" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "llm_usage_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"role" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"usage_estimated" boolean DEFAULT false NOT NULL,
	"cost_usd" double precision,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_usage_role_check" CHECK ("llm_usage"."role" in ('triage', 'report')),
	CONSTRAINT "llm_usage_provider_check" CHECK ("llm_usage"."provider" in ('mock', 'live')),
	CONSTRAINT "llm_usage_status_check" CHECK ("llm_usage"."status" in ('ok', 'invalid_output', 'error', 'budget_exhausted')),
	CONSTRAINT "llm_usage_tokens_check" CHECK ("llm_usage"."input_tokens" >= 0 and "llm_usage"."output_tokens" >= 0 and "llm_usage"."cost_usd" >= 0)
);
--> statement-breakpoint
CREATE INDEX "llm_usage_provider_created_idx" ON "llm_usage" USING btree ("provider","created_at");
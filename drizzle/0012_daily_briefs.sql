CREATE TABLE "daily_briefs" (
	"day" date PRIMARY KEY NOT NULL,
	"lines" jsonb NOT NULL,
	"article_count" integer NOT NULL,
	"source_count" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_briefs_lines_check" CHECK (jsonb_typeof("daily_briefs"."lines") = 'array' and jsonb_array_length("daily_briefs"."lines") between 3 and 5),
	CONSTRAINT "daily_briefs_counts_check" CHECK ("daily_briefs"."article_count" >= 10 and "daily_briefs"."source_count" >= 1 and "daily_briefs"."source_count" <= "daily_briefs"."article_count")
);

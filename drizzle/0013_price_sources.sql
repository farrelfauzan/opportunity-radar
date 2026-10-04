ALTER TABLE "candles" DROP CONSTRAINT "candles_source_check";--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT "quotes_source_check";--> statement-breakpoint
ALTER TABLE "candles" ADD CONSTRAINT "candles_source_check" CHECK ("candles"."source" in ('yahoo', 'synthetic', 'frankfurter', 'yahoo-futures', 'gold-api', 'binance', 'indodax'));--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_source_check" CHECK ("quotes"."source" in ('yahoo', 'synthetic', 'frankfurter', 'yahoo-futures', 'gold-api', 'binance', 'indodax'));
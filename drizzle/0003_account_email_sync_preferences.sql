ALTER TABLE `accounts` ADD `email_sync_interval_minutes` integer DEFAULT 15 NOT NULL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `email_sync_lookback_months` integer DEFAULT 1;

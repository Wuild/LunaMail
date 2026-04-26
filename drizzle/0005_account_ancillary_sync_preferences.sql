ALTER TABLE `accounts` ADD `contacts_sync_interval_minutes` integer DEFAULT 15 NOT NULL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `calendar_sync_interval_minutes` integer DEFAULT 15 NOT NULL;

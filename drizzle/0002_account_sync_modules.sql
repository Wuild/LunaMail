ALTER TABLE `accounts` ADD `sync_emails` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `sync_contacts` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `sync_calendar` integer DEFAULT 1 NOT NULL;

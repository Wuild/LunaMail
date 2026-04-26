ALTER TABLE `accounts` ADD `carddav_user` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `caldav_user` text DEFAULT '' NOT NULL;

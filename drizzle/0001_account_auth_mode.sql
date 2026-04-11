ALTER TABLE accounts ADD COLUMN auth_method TEXT DEFAULT 'password' NOT NULL;
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN oauth_provider TEXT;

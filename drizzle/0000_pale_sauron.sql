CREATE TABLE `campaign_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`store` text NOT NULL,
	`promoter` text NOT NULL,
	`campaign` text NOT NULL,
	`month` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL
);

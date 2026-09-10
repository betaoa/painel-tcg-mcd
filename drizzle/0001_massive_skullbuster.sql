CREATE TABLE `published_assets` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`published_by` text NOT NULL,
	`object_key` text NOT NULL,
	`parts` integer DEFAULT 1 NOT NULL,
	`complete` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);

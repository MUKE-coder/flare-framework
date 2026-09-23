CREATE TABLE `saved_view` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resource` text NOT NULL,
	`name` text NOT NULL,
	`query` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saved_view_user_idx` ON `saved_view` (`user_id`,`resource`);
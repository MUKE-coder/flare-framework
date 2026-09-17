CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_label_unique` ON `tags` (`label`);
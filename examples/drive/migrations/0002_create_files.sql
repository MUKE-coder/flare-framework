CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`folder_id` text,
	`content` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `files_folder_id_idx` ON `files` (`folder_id`);--> statement-breakpoint
CREATE INDEX `files_created_at_idx` ON `files` (`created_at`);
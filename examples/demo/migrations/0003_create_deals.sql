CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`amount` real,
	`company_id` text NOT NULL,
	`owner_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `deals_company_id_idx` ON `deals` (`company_id`);--> statement-breakpoint
CREATE INDEX `deals_owner_id_idx` ON `deals` (`owner_id`);
CREATE TABLE `vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`website` text,
	`domain` text,
	`country` text,
	`brand_color` text,
	`handle` text,
	`tier` text NOT NULL,
	`services` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "vendors_tier_check" CHECK("vendors"."tier" in ('bronze', 'silver', 'gold'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_handle_unique` ON `vendors` (`handle`);
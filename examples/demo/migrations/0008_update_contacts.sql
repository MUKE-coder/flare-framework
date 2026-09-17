PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`status` text,
	`vip` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "contacts_status_check" CHECK("__new_contacts"."status" in ('lead', 'pending', 'customer', 'churned'))
);
--> statement-breakpoint
INSERT INTO `__new_contacts`("id", "name", "email", "phone", "created_at", "updated_at") SELECT "id", "name", "email", "phone", "created_at", "updated_at" FROM `contacts`;--> statement-breakpoint
DROP TABLE `contacts`;--> statement-breakpoint
ALTER TABLE `__new_contacts` RENAME TO `contacts`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;
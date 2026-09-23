CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`resource` text NOT NULL,
	`record_id` text,
	`record_label` text,
	`user_id` text,
	`user_email` text,
	`changes` text,
	`ip` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_at_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_log_resource_idx` ON `audit_log` (`resource`);--> statement-breakpoint
CREATE INDEX `companies_created_at_idx` ON `companies` (`created_at`);--> statement-breakpoint
CREATE INDEX `contacts_status_idx` ON `contacts` (`status`);--> statement-breakpoint
CREATE INDEX `contacts_created_at_idx` ON `contacts` (`created_at`);--> statement-breakpoint
CREATE INDEX `customers_subscription_status_idx` ON `customers` (`subscription_status`);--> statement-breakpoint
CREATE INDEX `customers_created_at_idx` ON `customers` (`created_at`);--> statement-breakpoint
CREATE INDEX `deals_created_at_idx` ON `deals` (`created_at`);--> statement-breakpoint
CREATE INDEX `plans_interval_idx` ON `plans` (`interval`);--> statement-breakpoint
CREATE INDEX `plans_created_at_idx` ON `plans` (`created_at`);--> statement-breakpoint
CREATE INDEX `purchases_status_idx` ON `purchases` (`status`);--> statement-breakpoint
CREATE INDEX `purchases_created_at_idx` ON `purchases` (`created_at`);--> statement-breakpoint
CREATE INDEX `security_events_severity_idx` ON `security_events` (`severity`);--> statement-breakpoint
CREATE INDEX `security_events_created_at_idx` ON `security_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `vendors_tier_idx` ON `vendors` (`tier`);--> statement-breakpoint
CREATE INDEX `vendors_created_at_idx` ON `vendors` (`created_at`);
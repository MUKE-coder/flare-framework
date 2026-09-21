CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`subscription_status` text,
	`subscription_ends_at` text,
	`cancel_at_period_end` integer,
	`plan_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "customers_subscription_status_check" CHECK("customers"."subscription_status" in ('none', 'incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_user_id_unique` ON `customers` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_stripe_customer_id_unique` ON `customers` (`stripe_customer_id`);--> statement-breakpoint
CREATE INDEX `customers_plan_id_idx` ON `customers` (`plan_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`stripe_product_id` text,
	`stripe_price_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`interval` text,
	`active` integer,
	`sort` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "plans_interval_check" CHECK("plans"."interval" in ('month', 'year'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_slug_unique` ON `plans` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `plans_stripe_price_id_unique` ON `plans` (`stripe_price_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`plan_id` text,
	`stripe_checkout_session_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "purchases_status_check" CHECK("purchases"."status" in ('pending', 'paid', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_stripe_checkout_session_id_unique` ON `purchases` (`stripe_checkout_session_id`);--> statement-breakpoint
CREATE INDEX `purchases_customer_id_idx` ON `purchases` (`customer_id`);--> statement-breakpoint
CREATE INDEX `purchases_plan_id_idx` ON `purchases` (`plan_id`);
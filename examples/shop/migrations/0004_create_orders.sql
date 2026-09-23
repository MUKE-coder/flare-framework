CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`reference` text NOT NULL,
	`customer_id` text,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`total` real NOT NULL,
	`paid_with` text,
	`note` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "orders_channel_check" CHECK("orders"."channel" in ('online', 'pos')),
	CONSTRAINT "orders_status_check" CHECK("orders"."status" in ('pending', 'paid', 'fulfilled', 'refunded')),
	CONSTRAINT "orders_paid_with_check" CHECK("orders"."paid_with" in ('cash', 'card', 'mobile'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_reference_unique` ON `orders` (`reference`);--> statement-breakpoint
CREATE INDEX `orders_customer_id_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_channel_idx` ON `orders` (`channel`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `orders` (`status`);--> statement-breakpoint
CREATE INDEX `orders_paid_with_idx` ON `orders` (`paid_with`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);
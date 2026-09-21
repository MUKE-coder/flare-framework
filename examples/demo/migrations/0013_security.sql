CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`ip` text NOT NULL,
	`path` text NOT NULL,
	`user_agent` text,
	`count` integer NOT NULL,
	`banned` integer,
	`detail` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "security_events_severity_check" CHECK("security_events"."severity" in ('low', 'medium', 'high'))
);

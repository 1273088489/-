CREATE TABLE `repository_submission` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`archive_name` text DEFAULT '' NOT NULL,
	`archive_kind` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'parsed' NOT NULL,
	`snapshot` text DEFAULT '{}' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `project_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);

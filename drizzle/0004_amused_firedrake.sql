CREATE TABLE `test_case` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`framework` text DEFAULT 'node:test' NOT NULL,
	`files` text DEFAULT '{}' NOT NULL,
	`command` text DEFAULT '[]' NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `stage_project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `test_case_project_key_unique` ON `test_case` (`project_id`,`key`);--> statement-breakpoint
CREATE TABLE `test_run` (
	`id` text PRIMARY KEY NOT NULL,
	`sandbox_run_id` text NOT NULL,
	`test_case_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`status` text DEFAULT 'passed' NOT NULL,
	`passed` integer DEFAULT false NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`stdout` text DEFAULT '' NOT NULL,
	`stderr` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`sandbox_run_id`) REFERENCES `sandbox_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`test_case_id`) REFERENCES `test_case`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `project_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `sandbox_run` ADD `kind` text DEFAULT 'main' NOT NULL;
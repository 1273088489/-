CREATE TABLE `sandbox_run` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`repository_submission_id` text NOT NULL,
	`runtime` text DEFAULT 'node' NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`error_code` text DEFAULT '' NOT NULL,
	`exit_code` integer,
	`stdout` text DEFAULT '' NOT NULL,
	`stderr` text DEFAULT '' NOT NULL,
	`phases` text DEFAULT '[]' NOT NULL,
	`started_at` text DEFAULT '' NOT NULL,
	`finished_at` text DEFAULT '' NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`timed_out` integer DEFAULT false NOT NULL,
	`oom_killed` integer DEFAULT false NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `project_attempt`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`repository_submission_id`) REFERENCES `repository_submission`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `stage_project` ADD `sandbox_config` text DEFAULT '{}' NOT NULL;
CREATE TABLE `choice_lab` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`user_id` text NOT NULL,
	`selected_option` text DEFAULT '' NOT NULL,
	`rationale` text DEFAULT '' NOT NULL,
	`ai_feedback` text DEFAULT '' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `course` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_slug_unique` ON `course` (`slug`);--> statement-breakpoint
CREATE TABLE `exercise` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`slug` text NOT NULL,
	`prompt` text NOT NULL,
	`hints` text DEFAULT '[]' NOT NULL,
	`solution` text DEFAULT '' NOT NULL,
	`rubric` text DEFAULT '[]' NOT NULL,
	`answer_type` text DEFAULT 'text' NOT NULL,
	`choices` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lesson`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `learning_record` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content_id` text NOT NULL,
	`content_type` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`mastery` integer DEFAULT 0 NOT NULL,
	`error_history` text DEFAULT '[]' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lesson` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`content_markdown` text DEFAULT '' NOT NULL,
	`requires_pass` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`submitted_at` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `stage_project`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `review_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`provider` text DEFAULT 'mock' NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`checklist` text DEFAULT '[]' NOT NULL,
	`suggestions` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `project_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `stage_project` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`tasks` text DEFAULT '[]' NOT NULL,
	`acceptance_criteria` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stage_project_slug_unique` ON `stage_project` (`slug`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
CREATE TABLE `evidence_fact` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`source_type` text NOT NULL,
	`label` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`ref` text DEFAULT '' NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `project_attempt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `review_feedback` ADD `rubric_results` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_feedback` ADD `acceptance_results` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_feedback` ADD `evidence_facts` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `review_feedback` ADD `capability_note` text DEFAULT '' NOT NULL;
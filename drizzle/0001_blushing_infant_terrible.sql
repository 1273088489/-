ALTER TABLE `stage_project` ADD `guide_markdown` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `stage_project` ADD `deliverables` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `stage_project` ADD `rubric` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `stage_project` ADD `reflection_questions` text DEFAULT '[]' NOT NULL;
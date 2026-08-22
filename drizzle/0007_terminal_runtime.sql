CREATE TABLE `terminal_runtime` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `course_slug` text NOT NULL,
  `volume_name` text NOT NULL,
  `container_name` text NOT NULL,
  `network_name` text NOT NULL,
  `container_id` text DEFAULT '' NOT NULL,
  `container_address` text DEFAULT '' NOT NULL,
  `last_active_at` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terminal_runtime_user_course_unique` ON `terminal_runtime` (`user_id`,`course_slug`);

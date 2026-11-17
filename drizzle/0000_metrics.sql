CREATE TABLE `site_users` (
  `user_hash` text PRIMARY KEY NOT NULL,
  `first_seen` text NOT NULL,
  `last_seen` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `site_users_last_seen_idx` ON `site_users` (`last_seen`);
--> statement-breakpoint
CREATE TABLE `sale_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_hash` text NOT NULL,
  `lot_id` integer NOT NULL,
  `name` text NOT NULL,
  `category` text NOT NULL,
  `category_label` text NOT NULL,
  `region` text NOT NULL,
  `amount` integer NOT NULL,
  `sold_at` text NOT NULL,
  `participant_count` integer,
  `bid_count` integer,
  `method` text DEFAULT 'unknown' NOT NULL,
  `source` text DEFAULT 'demo' NOT NULL,
  `recorded_at` text NOT NULL,
  CONSTRAINT `sale_events_amount_positive` CHECK (`amount` > 0),
  CONSTRAINT `sale_events_source_demo` CHECK (`source` = 'demo'),
  CONSTRAINT `sale_events_method_known` CHECK (`method` IN ('auction', 'buy-now', 'unknown'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sale_events_user_lot_date_unique` ON `sale_events` (`user_hash`, `lot_id`, `sold_at`);
--> statement-breakpoint
CREATE INDEX `sale_events_user_date_idx` ON `sale_events` (`user_hash`, `sold_at`);
--> statement-breakpoint
CREATE INDEX `sale_events_date_idx` ON `sale_events` (`sold_at`);

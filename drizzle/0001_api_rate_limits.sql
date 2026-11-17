CREATE TABLE `api_rate_limits` (
  `user_hash` text NOT NULL,
  `scope` text NOT NULL,
  `bucket_start` integer NOT NULL,
  `request_count` integer NOT NULL,
  PRIMARY KEY (`user_hash`, `scope`),
  CONSTRAINT `api_rate_scope_known` CHECK (`scope` IN ('metrics', 'sales-read', 'sales-write')),
  CONSTRAINT `api_rate_count_positive` CHECK (`request_count` > 0),
  CONSTRAINT `api_rate_user_hashed` CHECK (length(`user_hash`) = 64)
) WITHOUT ROWID;

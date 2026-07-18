CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '💰' NOT NULL,
	`color` text DEFAULT '#4f6df5' NOT NULL,
	`starting_balance_minor` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);

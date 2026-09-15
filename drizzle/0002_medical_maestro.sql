CREATE TABLE `instruments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`category` varchar(100) NOT NULL,
	`icon` varchar(50),
	`color` varchar(20),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `instruments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`scheduledAt` timestamp NOT NULL,
	`duration` int NOT NULL DEFAULT 60,
	`status` enum('agendada','realizada','cancelada','falta') NOT NULL DEFAULT 'agendada',
	`notes` text,
	`rating` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lessons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
DROP TABLE `courses`;--> statement-breakpoint
DROP TABLE `enrollments`;--> statement-breakpoint
ALTER TABLE `students` MODIFY COLUMN `status` enum('ativo','inativo','pausado') NOT NULL DEFAULT 'ativo';--> statement-breakpoint
ALTER TABLE `monthly_stats` ADD `lessonsGiven` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monthly_stats` ADD `lessonsCancelled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `instrumentId` int;--> statement-breakpoint
ALTER TABLE `students` ADD `level` enum('iniciante','intermediario','avancado') DEFAULT 'iniciante' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `monthlyFee` decimal(10,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `startDate` date;--> statement-breakpoint
ALTER TABLE `students` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `monthly_stats` DROP COLUMN `completions`;
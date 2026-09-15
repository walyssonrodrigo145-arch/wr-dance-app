CREATE TABLE `reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`type` enum('aula','pagamento','tarefa','outro') NOT NULL DEFAULT 'outro',
	`priority` enum('baixa','media','alta') NOT NULL DEFAULT 'media',
	`dueAt` timestamp NOT NULL,
	`done` int NOT NULL DEFAULT 0,
	`studentId` int,
	`lessonId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reminders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phone` varchar(30),
	`bio` text,
	`schoolName` varchar(255),
	`schoolAddress` text,
	`schoolCity` varchar(100),
	`schoolPhone` varchar(30),
	`schoolWebsite` varchar(255),
	`schoolDescription` text,
	`notifyLessonReminder` int NOT NULL DEFAULT 1,
	`notifyPaymentDue` int NOT NULL DEFAULT 1,
	`notifyStudentAbsence` int NOT NULL DEFAULT 1,
	`notifyNewStudent` int NOT NULL DEFAULT 1,
	`notifyWeeklyReport` int NOT NULL DEFAULT 0,
	`theme` varchar(20) DEFAULT 'light',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `settings_userId_unique` UNIQUE(`userId`)
);

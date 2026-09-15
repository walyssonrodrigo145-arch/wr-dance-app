CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`instructor` varchar(255) NOT NULL,
	`category` varchar(100) NOT NULL,
	`level` enum('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
	`price` decimal(10,2) NOT NULL DEFAULT '0.00',
	`duration` int NOT NULL DEFAULT 0,
	`thumbnail` text,
	`rating` float NOT NULL DEFAULT 0,
	`totalRatings` int NOT NULL DEFAULT 0,
	`status` enum('active','draft','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`courseId` int NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`status` enum('active','completed','dropped') NOT NULL DEFAULT 'active',
	`enrolledAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`lastAccessAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `enrollments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `monthly_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`newStudents` int NOT NULL DEFAULT 0,
	`activeStudents` int NOT NULL DEFAULT 0,
	`completions` int NOT NULL DEFAULT 0,
	`revenue` decimal(12,2) NOT NULL DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monthly_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`avatar` text,
	`phone` varchar(30),
	`status` enum('active','inactive','suspended') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_email_unique` UNIQUE(`email`)
);

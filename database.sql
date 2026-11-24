-- =====================================================================
-- DBMS LABORATORY PROJECT: Movie Theater Seat Booking & Showtime Manager
-- Implementation Script: database.sql
-- Database Engine: MySQL 8.0+ (InnoDB / utf8mb4)
-- Scope: 9 Core Relational Tables with Constraints, Indexes & Seed Data
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CREATE AND USE DATABASE
-- ---------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `movie_theater_db`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `movie_theater_db`;

-- Configure environment flags for clean table creation
SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;
SET @OLD_SQL_MODE = @@SQL_MODE;
SET SQL_MODE = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- Drop all 9 tables in reverse dependency order
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `booking_seats`;
DROP TABLE IF EXISTS `bookings`;
DROP TABLE IF EXISTS `showtimes`;
DROP TABLE IF EXISTS `seats`;
DROP TABLE IF EXISTS `screens`;
DROP TABLE IF EXISTS `theaters`;
DROP TABLE IF EXISTS `movies`;
DROP TABLE IF EXISTS `users`;

-- ---------------------------------------------------------------------
-- 2. CREATE TABLE STATEMENTS (9 TABLES)
-- ---------------------------------------------------------------------

-- Table 1: users
-- Single unified table for customer and administrative accounts
CREATE TABLE `users` (
    `user_id`       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `full_name`     VARCHAR(100) NOT NULL,
    `email`         VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `phone`         VARCHAR(20)  NULL,
    `role`          ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
    `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `uq_users_email` UNIQUE (`email`),
    INDEX `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 2: theaters
-- Physical theater venues
CREATE TABLE `theaters` (
    `theater_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`       VARCHAR(150) NOT NULL,
    `city`       VARCHAR(100) NOT NULL,
    `address`    VARCHAR(255) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_theaters_name_city` UNIQUE (`name`, `city`),
    INDEX `idx_theaters_city` (`city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 3: screens
-- Auditoriums belonging to a theater (1:N from theaters)
CREATE TABLE `screens` (
    `screen_id`      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `theater_id`     INT UNSIGNED NOT NULL,
    `screen_name`    VARCHAR(50)  NOT NULL,
    `total_capacity` SMALLINT UNSIGNED NOT NULL,
    `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_screens_theaters` 
        FOREIGN KEY (`theater_id`) REFERENCES `theaters` (`theater_id`) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uq_screens_theater_name` UNIQUE (`theater_id`, `screen_name`),
    CONSTRAINT `chk_screen_capacity` CHECK (`total_capacity` > 0),
    INDEX `idx_screens_theater` (`theater_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 4: seats
-- Physical seat positions inside each screen (1:N from screens)
CREATE TABLE `seats` (
    `seat_id`     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `screen_id`   INT UNSIGNED NOT NULL,
    `row_label`   VARCHAR(5)   NOT NULL,
    `seat_number` SMALLINT UNSIGNED NOT NULL,
    `seat_type`   ENUM('STANDARD', 'PREMIUM', 'VIP') NOT NULL DEFAULT 'STANDARD',
    CONSTRAINT `fk_seats_screens` 
        FOREIGN KEY (`screen_id`) REFERENCES `screens` (`screen_id`) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `uq_seats_position` UNIQUE (`screen_id`, `row_label`, `seat_number`),
    CONSTRAINT `chk_seat_number` CHECK (`seat_number` > 0),
    INDEX `idx_seats_screen` (`screen_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 5: movies
-- Catalog of movies scheduled for screening
CREATE TABLE `movies` (
    `movie_id`     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `title`        VARCHAR(200) NOT NULL,
    `description`  TEXT         NULL,
    `duration_min` SMALLINT UNSIGNED NOT NULL,
    `genre`        VARCHAR(100) NOT NULL,
    `language`     VARCHAR(50)  NOT NULL,
    `release_date` DATE         NOT NULL,
    `poster_url`   VARCHAR(300) NULL,
    `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `chk_movie_duration` CHECK (`duration_min` > 0),
    INDEX `idx_movies_title` (`title`),
    INDEX `idx_movies_release_date` (`release_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 6: showtimes
-- Screening sessions linking movie, screen, date, and time
CREATE TABLE `showtimes` (
    `showtime_id`  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `movie_id`     INT UNSIGNED NOT NULL,
    `screen_id`    INT UNSIGNED NOT NULL,
    `show_date`    DATE         NOT NULL,
    `start_time`   TIME         NOT NULL,
    `end_time`     TIME         NOT NULL,
    `ticket_price` DECIMAL(10,2) NOT NULL,
    `status`       ENUM('SCHEDULED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'SCHEDULED',
    `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_showtimes_movies` 
        FOREIGN KEY (`movie_id`) REFERENCES `movies` (`movie_id`) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_showtimes_screens` 
        FOREIGN KEY (`screen_id`) REFERENCES `screens` (`screen_id`) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `chk_showtime_duration` CHECK (`end_time` > `start_time`),
    CONSTRAINT `chk_ticket_price` CHECK (`ticket_price` >= 0.00),
    INDEX `idx_showtimes_movie` (`movie_id`),
    INDEX `idx_showtimes_screen` (`screen_id`),
    INDEX `idx_showtimes_schedule` (`show_date`, `start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 7: bookings
-- Reservation orders placed by users
CREATE TABLE `bookings` (
    `booking_id`     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `booking_ref`    VARCHAR(20)  NOT NULL,
    `user_id`        INT UNSIGNED NOT NULL,
    `showtime_id`    INT UNSIGNED NOT NULL,
    `total_amount`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `booking_status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `booking_date`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `uq_bookings_ref` UNIQUE (`booking_ref`),
    CONSTRAINT `fk_bookings_users` 
        FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `fk_bookings_showtimes` 
        FOREIGN KEY (`showtime_id`) REFERENCES `showtimes` (`showtime_id`) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `chk_booking_total` CHECK (`total_amount` >= 0.00),
    INDEX `idx_bookings_user` (`user_id`),
    INDEX `idx_bookings_showtime` (`showtime_id`),
    INDEX `idx_bookings_status` (`booking_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 8: booking_seats
-- Specific seats reserved for a booking (1:N from bookings)
CREATE TABLE `booking_seats` (
    `booking_seat_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `booking_id`      INT UNSIGNED NOT NULL,
    `seat_id`         INT UNSIGNED NOT NULL,
    `price`           DECIMAL(10,2) NOT NULL,
    CONSTRAINT `fk_bs_bookings` 
        FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_bs_seats` 
        FOREIGN KEY (`seat_id`) REFERENCES `seats` (`seat_id`) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `uq_bs_booking_seat` UNIQUE (`booking_id`, `seat_id`),
    CONSTRAINT `chk_bs_price` CHECK (`price` >= 0.00),
    INDEX `idx_bs_booking` (`booking_id`),
    INDEX `idx_bs_seat` (`seat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 9: payments
-- Payment transactions tied to bookings (1:N allows retry)
CREATE TABLE `payments` (
    `payment_id`      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `booking_id`      INT UNSIGNED NOT NULL,
    `transaction_ref` VARCHAR(50)  NOT NULL,
    `payment_method`  ENUM('CARD', 'UPI', 'NETBANKING', 'CASH') NOT NULL,
    `amount`          DECIMAL(10,2) NOT NULL,
    `payment_status`  ENUM('PENDING', 'SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `payment_date`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_payments_txn` UNIQUE (`transaction_ref`),
    CONSTRAINT `fk_payments_bookings` 
        FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) 
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `chk_payment_amount` CHECK (`amount` > 0.00),
    INDEX `idx_payments_booking` (`booking_id`),
    INDEX `idx_payments_status` (`payment_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- 3. REALISTIC SAMPLE DATA INSERTION
-- ---------------------------------------------------------------------

-- 3.1 Insert 3 Users (1 Admin, 2 Customers with bcrypt password hashes)
-- Admin password:    admin123
-- Customer password: password123
INSERT INTO `users` (`user_id`, `full_name`, `email`, `password_hash`, `phone`, `role`) VALUES
(1, 'System Administrator', 'admin@cinemanager.com',  '$2b$10$7zVZq/dOLqB.CMQAM.Gcv.cfU7o9kwunMhrVqaBsPShwOGVDrJ8lC', '+91 98765 00001', 'admin'),
(2, 'Aarav Sharma',         'aarav.sharma@example.com', '$2b$10$78sYRKBvQRuLzh7ynI2xx.9.9T2XGiAbyBxO94E4RzBcm.zu91VVq', '+91 98765 00002', 'customer'),
(3, 'Priya Patel',          'priya.patel@example.com',  '$2b$10$78sYRKBvQRuLzh7ynI2xx.9.9T2XGiAbyBxO94E4RzBcm.zu91VVq', '+91 98765 00003', 'customer');

-- 3.2 Insert 3 Theaters
INSERT INTO `theaters` (`theater_id`, `name`, `city`, `address`) VALUES
(1, 'CineGrand Premiere', 'Mumbai',    'Phoenix Palladium, 462 Senapati Bapat Marg, Lower Parel'),
(2, 'Starplex Cinemas',   'Bangalore', 'Nexus Mall, Koramangala, 5th Block'),
(3, 'PVR Heritage',       'Delhi',     'Odeon Building, Connaught Place, Central Delhi');

-- 3.3 Insert 2 Screens per Theater (Total = 6 Screens)
INSERT INTO `screens` (`screen_id`, `theater_id`, `screen_name`, `total_capacity`) VALUES
(1, 1, 'Audi A', 20),
(2, 1, 'Audi B', 20),
(3, 2, 'Audi 1', 20),
(4, 2, 'Audi 2', 20),
(5, 3, 'Audi 1', 20),
(6, 3, 'Audi 2', 20);

-- 3.4 Insert Seats (20 Seats per Screen across 6 screens = 120 Seats)
-- Row A: Seats 1-10 (STANDARD)
-- Row B: Seats 1-10 (PREMIUM)
INSERT INTO `seats` (`screen_id`, `row_label`, `seat_number`, `seat_type`)
SELECT s.screen_id, r.row_label, n.seat_number, r.seat_type
FROM screens s
CROSS JOIN (
    SELECT 'A' AS row_label, 'STANDARD' AS seat_type
    UNION ALL 
    SELECT 'B' AS row_label, 'PREMIUM' AS seat_type
) r
CROSS JOIN (
    SELECT 1 AS seat_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
    UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
) n
ORDER BY s.screen_id, r.row_label, n.seat_number;

-- 3.5 Insert 10 Indian Movies with Online Posters
INSERT INTO `movies` (`movie_id`, `title`, `description`, `duration_min`, `genre`, `language`, `release_date`, `poster_url`) VALUES
(1, 'RRR',
    'A fearless revolutionary and an officer in the British force, who once shared a deep bond, decide to join forces and fight for their nation freedom in 1920s India.',
    187, 'Action, Drama, History', 'Telugu', '2022-03-25', 'https://upload.wikimedia.org/wikipedia/en/d/d7/RRR_Poster.jpg'),

(2, 'Dangal',
    'Former wrestler Mahavir Singh Phogat and his two wrestler daughters struggle towards glory at the Commonwealth Games in the face of societal oppression.',
    161, 'Biography, Drama, Sport', 'Hindi', '2016-12-23', 'https://upload.wikimedia.org/wikipedia/en/9/99/Dangal_Poster.jpg'),

(3, 'K.G.F: Chapter 2',
    'In the blood-soaked Kolar Gold Fields, Rocky name strikes fear into his foes while the government and underworld titans see him as a threat to their dominance.',
    168, 'Action, Crime, Drama', 'Kannada', '2022-04-14', 'https://upload.wikimedia.org/wikipedia/en/d/d0/K.G.F_Chapter_2.jpg'),

(4, 'Baahubali 2: The Conclusion',
    'When Shiva, the son of Bahubali, learns about his royal heritage, he embarks on an epic quest to avenge his father and restore justice in Mahishmati Kingdom.',
    167, 'Action, Drama, Fantasy', 'Telugu', '2017-04-28', 'https://upload.wikimedia.org/wikipedia/en/9/93/Baahubali_2_The_Conclusion_poster.jpg'),

(5, '3 Idiots',
    'Two friends embark on a nostalgic journey across India searching for their long-lost college roommate who inspired them to follow their passions rather than conventions.',
    170, 'Comedy, Drama', 'Hindi', '2009-12-25', 'https://upload.wikimedia.org/wikipedia/en/d/df/3_idiots_poster.jpg'),

(6, 'Jawan',
    'A driven prison warden recruits daring women inmates to execute Robin Hood-style heists that expose systemic corruption and fight for downtrodden citizens.',
    169, 'Action, Thriller', 'Hindi', '2023-09-07', 'https://upload.wikimedia.org/wikipedia/en/3/39/Jawan_film_poster.jpg'),

(7, 'Kantara',
    'In a coastal Karnataka hamlet, human greed clashes with divine traditions when a hot-headed tribal rebel must embrace ancestral spirits to defend his people.',
    148, 'Action, Adventure, Drama', 'Kannada', '2022-09-30', 'https://upload.wikimedia.org/wikipedia/en/8/84/Kantara_poster.jpeg'),

(8, 'Vikram',
    'A covert operative leads a black-ops squad on the trail of a masked vigilante group while unraveling a ruthless narcotics cartel operating across South India.',
    175, 'Action, Crime, Thriller', 'Tamil', '2022-06-03', 'https://upload.wikimedia.org/wikipedia/en/9/93/Vikram_2022_poster.jpg'),

(9, 'Drishyam',
    'A quick-witted cable operator goes to extraordinary lengths to protect his family from the law after an accidental crime threatens their peaceful existence.',
    163, 'Crime, Drama, Mystery', 'Hindi', '2015-07-31', '/images/posters/drishyam.jpg'),

(10, 'Kalki 2898 AD',
    'In a post-apocalyptic dystopian future, a group of rebels battles tyrannical rulers in a mytho-futuristic struggle inspired by ancient Indian prophecy.',
    181, 'Action, Sci-Fi, Fantasy', 'Telugu', '2024-06-27', 'https://upload.wikimedia.org/wikipedia/en/4/4c/Kalki_2898_AD.jpg');

-- 3.6 Insert 13 Showtimes (10+ Showtimes across today and future dates)
INSERT INTO `showtimes` (`showtime_id`, `movie_id`, `screen_id`, `show_date`, `start_time`, `end_time`, `ticket_price`, `status`) VALUES
-- Today's Screenings across Theaters
(1, 1, 1, CURDATE(), '10:00:00', '13:15:00', 300.00, 'SCHEDULED'),
(2, 2, 1, CURDATE(), '14:30:00', '17:20:00', 250.00, 'SCHEDULED'),
(3, 3, 1, CURDATE(), '18:30:00', '21:25:00', 350.00, 'SCHEDULED'),

(4, 4, 2, CURDATE(), '11:00:00', '13:55:00', 280.00, 'SCHEDULED'),
(5, 5, 2, CURDATE(), '15:00:00', '18:00:00', 220.00, 'SCHEDULED'),
(6, 6, 2, CURDATE(), '19:00:00', '22:00:00', 320.00, 'SCHEDULED'),

(7, 7, 3, CURDATE(), '10:30:00', '13:10:00', 260.00, 'SCHEDULED'),
(8, 8, 3, CURDATE(), '14:00:00', '17:05:00', 290.00, 'SCHEDULED'),
(9, 9, 4, CURDATE(), '17:30:00', '20:20:00', 240.00, 'SCHEDULED'),
(10, 10, 5, CURDATE(), '19:30:00', '22:40:00', 350.00, 'SCHEDULED'),

-- Tomorrow's Screenings
(11, 1, 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00', '13:15:00', 300.00, 'SCHEDULED'),
(12, 6, 2, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '14:00:00', '17:00:00', 320.00, 'SCHEDULED'),
(13, 10, 3, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '18:00:00', '21:10:00', 350.00, 'SCHEDULED');

-- 3.7 Insert Sample Bookings
INSERT INTO `bookings` (`booking_id`, `booking_ref`, `user_id`, `showtime_id`, `total_amount`, `booking_status`, `booking_date`) VALUES
(1, 'BK-20261124-001', 2, 1, 600.00, 'CONFIRMED', NOW() - INTERVAL 2 HOUR),
(2, 'BK-20261124-002', 3, 1, 300.00, 'CONFIRMED', NOW() - INTERVAL 1 HOUR),
(3, 'BK-20261124-003', 2, 3, 700.00, 'PENDING',   NOW() - INTERVAL 10 MINUTE);

-- 3.8 Insert Corresponding Booking Seats
INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `seat_id`, `price`) VALUES
(1, 1, 1, 300.00),
(2, 1, 2, 300.00),
(3, 2, 3, 300.00),
(4, 3, 11, 350.00),
(5, 3, 12, 350.00);

-- 3.9 Insert Corresponding Payments
INSERT INTO `payments` (`payment_id`, `booking_id`, `transaction_ref`, `payment_method`, `amount`, `payment_status`, `payment_date`) VALUES
(1, 1, 'TXN-9847192834-SUCCESS', 'UPI',  600.00, 'SUCCESS', NOW() - INTERVAL 2 HOUR),
(2, 2, 'TXN-5612849102-SUCCESS', 'CARD', 300.00, 'SUCCESS', NOW() - INTERVAL 1 HOUR),
(3, 3, 'TXN-1192837465-PENDING', 'UPI',  700.00, 'PENDING', NOW() - INTERVAL 10 MINUTE);

-- Restore original settings
SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
SET SQL_MODE = @OLD_SQL_MODE;

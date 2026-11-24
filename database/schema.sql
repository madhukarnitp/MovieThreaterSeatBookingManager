-- =====================================================================
-- Movie Theater Seat Booking & Showtime Manager
-- DBMS Laboratory Project Schema (MySQL 8.0+ / InnoDB / utf8mb4)
-- 9 Core Relational Tables
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `movie_theater_db`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `movie_theater_db`;

-- Strict SQL Mode & disable foreign key checks for clean recreation
SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;
SET @OLD_SQL_MODE = @@SQL_MODE;
SET SQL_MODE = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- Drop all old and existing tables in correct dependency order
DROP TABLE IF EXISTS `tickets`;
DROP TABLE IF EXISTS `refunds`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `booking_seats`;
DROP TABLE IF EXISTS `showtime_seats`;
DROP TABLE IF EXISTS `bookings`;
DROP TABLE IF EXISTS `showtimes`;
DROP TABLE IF EXISTS `seats`;
DROP TABLE IF EXISTS `seat_types`;
DROP TABLE IF EXISTS `screens`;
DROP TABLE IF EXISTS `theaters`;
DROP TABLE IF EXISTS `movie_genres`;
DROP TABLE IF EXISTS `genres`;
DROP TABLE IF EXISTS `movies`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `admins`;
DROP TABLE IF EXISTS `customers`;
DROP TABLE IF EXISTS `users`;

-- ---------------------------------------------------------------------
-- 1. Table: users
-- Single unified table for customers and admins
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
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

-- ---------------------------------------------------------------------
-- 2. Table: theaters
-- Physical theater locations
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `theaters`;
CREATE TABLE `theaters` (
    `theater_id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`       VARCHAR(150) NOT NULL,
    `city`       VARCHAR(100) NOT NULL,
    `address`    VARCHAR(255) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_theaters_name_city` UNIQUE (`name`, `city`),
    INDEX `idx_theaters_city` (`city`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. Table: screens
-- Auditoriums / screens belonging to theaters
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `screens`;
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

-- ---------------------------------------------------------------------
-- 4. Table: seats
-- Physical seat layout mapped to each screen
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `seats`;
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

-- ---------------------------------------------------------------------
-- 5. Table: movies
-- Film catalog
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `movies`;
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

-- ---------------------------------------------------------------------
-- 6. Table: showtimes
-- Scheduled screenings linking movie, screen, and schedule
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `showtimes`;
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

-- ---------------------------------------------------------------------
-- 7. Table: bookings
-- Master booking transaction records
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `bookings`;
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

-- ---------------------------------------------------------------------
-- 8. Table: booking_seats
-- Reserved individual seats in a booking (1:N from bookings)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `booking_seats`;
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

-- ---------------------------------------------------------------------
-- 9. Table: payments
-- Payment attempts for bookings (1:N allows retry)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `payments`;
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

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
SET SQL_MODE = @OLD_SQL_MODE;

-- =====================================================================
-- Movie Theater Seat Booking & Showtime Manager
-- Complete Database Schema (MySQL 8.0+ / InnoDB / utf8mb4)
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

-- ---------------------------------------------------------------------
-- 1. Table: customers
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `customers`;
CREATE TABLE `customers` (
    `customer_id`     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `full_name`       VARCHAR(100) NOT NULL,
    `email`           VARCHAR(150) NOT NULL,
    `phone`           VARCHAR(20)  NULL,
    `password_hash`   VARCHAR(255) NOT NULL,
    `status`          ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `uq_customers_email` UNIQUE (`email`),
    INDEX `idx_customers_status` (`status`),
    INDEX `idx_customers_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. Table: admins
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `admins`;
CREATE TABLE `admins` (
    `admin_id`        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `full_name`       VARCHAR(100) NOT NULL,
    `email`           VARCHAR(150) NOT NULL,
    `password_hash`   VARCHAR(255) NOT NULL,
    `role`            ENUM('super_admin','admin','manager') NOT NULL DEFAULT 'admin',
    `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `uq_admins_email` UNIQUE (`email`),
    INDEX `idx_admins_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. Table: theaters
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `theaters`;
CREATE TABLE `theaters` (
    `theater_id`      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`            VARCHAR(150) NOT NULL,
    `address`         VARCHAR(300) NOT NULL,
    `city`            VARCHAR(100) NOT NULL,
    `state`           VARCHAR(100) NOT NULL,
    `pincode`         VARCHAR(10)  NULL,
    `phone`           VARCHAR(20)  NULL,
    `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `uq_theaters_name_city` UNIQUE (`name`, `city`),
    INDEX `idx_theaters_city` (`city`),
    INDEX `idx_theaters_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. Table: screens
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `screens`;
CREATE TABLE `screens` (
    `screen_id`       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `theater_id`      BIGINT UNSIGNED NOT NULL,
    `name`            VARCHAR(50)  NOT NULL COMMENT 'Screen name e.g. Screen 1, Screen 2 (IMAX)',
    `total_capacity`  SMALLINT UNSIGNED NOT NULL,
    `screen_type`     ENUM('2D','3D','IMAX','4DX') NOT NULL DEFAULT '2D',
    `is_active`       TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_screens_theater` FOREIGN KEY (`theater_id`) REFERENCES `theaters` (`theater_id`) ON DELETE RESTRICT,
    CONSTRAINT `uq_screens_theater_name` UNIQUE (`theater_id`, `name`),
    CONSTRAINT `chk_screen_capacity` CHECK (`total_capacity` > 0),
    INDEX `idx_screens_theater` (`theater_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. Table: seat_types
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `seat_types`;
CREATE TABLE `seat_types` (
    `seat_type_id`    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`            VARCHAR(50)  NOT NULL COMMENT 'Standard, Premium, Recliner',
    `description`     VARCHAR(200) NULL,
    `color_code`      VARCHAR(7)   NOT NULL DEFAULT '#6c757d' COMMENT 'Hex color e.g. #3b82f6',
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_seat_types_name` UNIQUE (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. Table: seats (Physical Seats per Screen)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `seats`;
CREATE TABLE `seats` (
    `seat_id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `screen_id`       BIGINT UNSIGNED NOT NULL,
    `seat_type_id`    BIGINT UNSIGNED NOT NULL,
    `row_label`       VARCHAR(3)   NOT NULL COMMENT 'Row designation e.g. A, B, C',
    `seat_number`     SMALLINT UNSIGNED NOT NULL,
    `is_active`       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '0 = physically removed or permanently blocked',
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_seats_screen`   FOREIGN KEY (`screen_id`)    REFERENCES `screens` (`screen_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_seats_type`     FOREIGN KEY (`seat_type_id`) REFERENCES `seat_types` (`seat_type_id`) ON DELETE RESTRICT,
    CONSTRAINT `uq_seats_position` UNIQUE (`screen_id`, `row_label`, `seat_number`),
    CONSTRAINT `chk_seat_number`   CHECK (`seat_number` BETWEEN 1 AND 999),
    INDEX `idx_seats_screen` (`screen_id`),
    INDEX `idx_seats_type` (`seat_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. Table: movies
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `movies`;
CREATE TABLE `movies` (
    `movie_id`        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `title`           VARCHAR(200) NOT NULL,
    `slug`            VARCHAR(220) NOT NULL,
    `description`     TEXT         NULL,
    `duration_min`    SMALLINT UNSIGNED NOT NULL COMMENT 'Runtime in minutes',
    `language`        VARCHAR(50)  NOT NULL,
    `certification`   ENUM('U','UA','A','S','Unrated') NOT NULL DEFAULT 'UA',
    `release_date`    DATE         NOT NULL,
    `poster_path`     VARCHAR(300) NULL,
    `trailer_url`     VARCHAR(500) NULL,
    `status`          ENUM('upcoming','now_showing','ended') NOT NULL DEFAULT 'now_showing',
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `uq_movies_slug` UNIQUE (`slug`),
    CONSTRAINT `chk_movie_duration` CHECK (`duration_min` BETWEEN 1 AND 600),
    INDEX `idx_movies_status` (`status`),
    INDEX `idx_movies_title` (`title`),
    INDEX `idx_movies_release_date` (`release_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. Table: genres
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `genres`;
CREATE TABLE `genres` (
    `genre_id`        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `name`            VARCHAR(80)  NOT NULL,
    `slug`            VARCHAR(80)  NOT NULL,
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_genres_name` UNIQUE (`name`),
    CONSTRAINT `uq_genres_slug` UNIQUE (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. Table: movie_genres (Many-to-Many Relationship)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `movie_genres`;
CREATE TABLE `movie_genres` (
    `movie_id`        BIGINT UNSIGNED NOT NULL,
    `genre_id`        BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (`movie_id`, `genre_id`),
    CONSTRAINT `fk_mg_movie` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`movie_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mg_genre` FOREIGN KEY (`genre_id`) REFERENCES `genres` (`genre_id`) ON DELETE CASCADE,
    INDEX `idx_mg_genre` (`genre_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. Table: showtimes
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `showtimes`;
CREATE TABLE `showtimes` (
    `showtime_id`     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `movie_id`        BIGINT UNSIGNED NOT NULL,
    `screen_id`       BIGINT UNSIGNED NOT NULL,
    `start_time`      DATETIME     NOT NULL,
    `end_time`        DATETIME     NOT NULL,
    `base_price`      DECIMAL(10,2) NOT NULL COMMENT 'Base standard seat price',
    `language`        VARCHAR(50)  NOT NULL,
    `format`          ENUM('2D','3D','IMAX','4DX') NOT NULL DEFAULT '2D',
    `status`          ENUM('scheduled','cancelled','completed') NOT NULL DEFAULT 'scheduled',
    `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fk_showtimes_movie`  FOREIGN KEY (`movie_id`)  REFERENCES `movies` (`movie_id`)   ON DELETE RESTRICT,
    CONSTRAINT `fk_showtimes_screen` FOREIGN KEY (`screen_id`) REFERENCES `screens` (`screen_id`) ON DELETE RESTRICT,
    CONSTRAINT `chk_showtime_times`  CHECK (`end_time` > `start_time`),
    CONSTRAINT `chk_base_price`      CHECK (`base_price` >= 0.00),
    INDEX `idx_showtimes_movie` (`movie_id`),
    INDEX `idx_showtimes_screen` (`screen_id`),
    INDEX `idx_showtimes_start_time` (`start_time`),
    INDEX `idx_showtimes_screen_window` (`screen_id`, `start_time`, `end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. Table: showtime_seats (Seat Inventory per Showtime)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `showtime_seats`;
CREATE TABLE `showtime_seats` (
    `showtime_seat_id` BIGINT UNSIGNED AUTO_INCREMENT UNIQUE KEY,
    `showtime_id`      BIGINT UNSIGNED NOT NULL,
    `seat_id`          BIGINT UNSIGNED NOT NULL,
    `price`            DECIMAL(10,2)   NOT NULL COMMENT 'Calculated seat price for this showtime',
    `status`           ENUM('available','held','booked','blocked') NOT NULL DEFAULT 'available',
    `held_by`          BIGINT UNSIGNED NULL COMMENT 'customer_id currently holding the seat',
    `held_until`       DATETIME        NULL COMMENT 'Timestamp when temporary hold expires',
    `booking_id`       BIGINT UNSIGNED NULL COMMENT 'Assigned upon confirmed booking',
    `hold_booking_id`  BIGINT UNSIGNED NULL COMMENT 'Pending booking that holds this seat',
    PRIMARY KEY (`showtime_id`, `seat_id`),
    CONSTRAINT `fk_ss_showtime` FOREIGN KEY (`showtime_id`) REFERENCES `showtimes` (`showtime_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ss_seat`     FOREIGN KEY (`seat_id`)     REFERENCES `seats` (`seat_id`)         ON DELETE CASCADE,
    CONSTRAINT `fk_ss_held_by`  FOREIGN KEY (`held_by`)     REFERENCES `customers` (`customer_id`) ON DELETE SET NULL,
    CONSTRAINT `chk_ss_price`   CHECK (`price` >= 0.00),
    INDEX `idx_ss_status` (`showtime_id`, `status`),
    INDEX `idx_ss_seat` (`seat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12. Table: bookings
-- Preserves booking history (ON DELETE RESTRICT on customer & showtime)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `bookings`;
CREATE TABLE `bookings` (
    `booking_id`      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `booking_ref`     VARCHAR(20)   NOT NULL COMMENT 'Unique reference e.g. BK20261123-0001',
    `customer_id`     BIGINT UNSIGNED NOT NULL,
    `showtime_id`     BIGINT UNSIGNED NOT NULL,
    `total_amount`    DECIMAL(10,2) NOT NULL,
    `status`          ENUM('pending','confirmed','cancelled','refunded','expired') NOT NULL DEFAULT 'pending',
    `cancel_reason`   VARCHAR(300)  NULL,
    `booked_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `confirmed_at`    DATETIME      NULL,
    `cancelled_at`    DATETIME      NULL,
    `updated_at`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `uq_bookings_ref`      UNIQUE (`booking_ref`),
    CONSTRAINT `fk_bookings_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_bookings_showtime` FOREIGN KEY (`showtime_id`) REFERENCES `showtimes` (`showtime_id`) ON DELETE RESTRICT,
    CONSTRAINT `chk_booking_total`    CHECK (`total_amount` >= 0.00),
    INDEX `idx_bookings_customer` (`customer_id`),
    INDEX `idx_bookings_showtime` (`showtime_id`),
    INDEX `idx_bookings_status` (`status`),
    INDEX `idx_bookings_booked_at` (`booked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Link deferred foreign key from showtime_seats to bookings
ALTER TABLE `showtime_seats`
    ADD CONSTRAINT `fk_ss_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE SET NULL,
    ADD CONSTRAINT `fk_ss_hold_booking` FOREIGN KEY (`hold_booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 13. Table: booking_seats
-- Prevents duplicate seats in the same showtime booking
-- Preserves historical price paid at the time of purchase
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `booking_seats`;
CREATE TABLE `booking_seats` (
    `booking_seat_id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `booking_id`      BIGINT UNSIGNED NOT NULL,
    `showtime_id`     BIGINT UNSIGNED NOT NULL,
    `seat_id`         BIGINT UNSIGNED NOT NULL,
    `price_paid`      DECIMAL(10,2)   NOT NULL COMMENT 'Locked historical seat price at purchase time',
    `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `fk_bs_booking`       FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_bs_showtime_seat` FOREIGN KEY (`showtime_id`, `seat_id`)
                                     REFERENCES `showtime_seats` (`showtime_id`, `seat_id`) ON DELETE RESTRICT,
    CONSTRAINT `uq_bs_showtime_seat` UNIQUE (`showtime_id`, `seat_id`),
    CONSTRAINT `chk_bs_price_paid`   CHECK (`price_paid` >= 0.00),
    INDEX `idx_bs_booking` (`booking_id`),
    INDEX `idx_bs_seat` (`seat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 14. Table: payments
-- Supports multiple payment attempts per booking
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `payments`;
CREATE TABLE `payments` (
    `payment_id`        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `booking_id`        BIGINT UNSIGNED NOT NULL,
    `transaction_ref`   VARCHAR(60)   NOT NULL COMMENT 'Unique payment gateway transaction reference',
    `payment_method`    ENUM('card','upi','netbanking','cash','wallet') NOT NULL,
    `amount`            DECIMAL(10,2) NOT NULL,
    `currency`          CHAR(3)       NOT NULL DEFAULT 'INR',
    `status`            ENUM('pending','success','failed','refunded') NOT NULL DEFAULT 'pending',
    `gateway_response`  JSON          NULL COMMENT 'Gateway payload / response body',
    `paid_at`           DATETIME      NULL,
    `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_payments_txn_ref` UNIQUE (`transaction_ref`),
    CONSTRAINT `fk_payments_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE RESTRICT,
    CONSTRAINT `chk_payment_amount`  CHECK (`amount` > 0.00),
    INDEX `idx_payments_booking` (`booking_id`),
    INDEX `idx_payments_status` (`status`),
    INDEX `idx_payments_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 15. Table: refunds
-- Supports partial refunds per booking / payment
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `refunds`;
CREATE TABLE `refunds` (
    `refund_id`       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `payment_id`      BIGINT UNSIGNED NOT NULL,
    `booking_id`      BIGINT UNSIGNED NOT NULL,
    `refund_ref`      VARCHAR(60)   NOT NULL,
    `amount`          DECIMAL(10,2) NOT NULL,
    `status`          ENUM('pending','processed','failed') NOT NULL DEFAULT 'pending',
    `reason`          VARCHAR(300)  NULL,
    `initiated_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `processed_at`    DATETIME      NULL,
    CONSTRAINT `uq_refunds_ref`     UNIQUE (`refund_ref`),
    CONSTRAINT `fk_refunds_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`payment_id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_refunds_booking` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`booking_id`) ON DELETE RESTRICT,
    CONSTRAINT `chk_refund_amount`  CHECK (`amount` > 0.00),
    INDEX `idx_refunds_payment` (`payment_id`),
    INDEX `idx_refunds_booking` (`booking_id`),
    INDEX `idx_refunds_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 16. Table: tickets
-- Each booking seat can generate at most one ticket (uq_tickets_booking_seat)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `tickets`;
CREATE TABLE `tickets` (
    `ticket_id`       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `booking_seat_id` BIGINT UNSIGNED NOT NULL,
    `booking_id`      BIGINT UNSIGNED NOT NULL,
    `ticket_number`   VARCHAR(35)   NOT NULL COMMENT 'Unique printable code e.g. TKT-20261123-0001-A1',
    `qr_code_path`    TEXT          NULL COMMENT 'QR code data URL or asset string',
    `status`          ENUM('valid','used','cancelled') NOT NULL DEFAULT 'valid',
    `issued_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `uq_tickets_number`       UNIQUE (`ticket_number`),
    CONSTRAINT `uq_tickets_booking_seat` UNIQUE (`booking_seat_id`),
    CONSTRAINT `fk_tickets_booking_seat` FOREIGN KEY (`booking_seat_id`) REFERENCES `booking_seats` (`booking_seat_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_tickets_booking`      FOREIGN KEY (`booking_id`)      REFERENCES `bookings` (`booking_id`)           ON DELETE RESTRICT,
    INDEX `idx_tickets_booking` (`booking_id`),
    INDEX `idx_tickets_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- DATABASE TRIGGERS FOR BUSINESS RULES ENFORCEMENT
-- =====================================================================

DELIMITER $$

-- Rule 2 Trigger: Validate that seats belong to the screen used by the selected showtime
DROP TRIGGER IF EXISTS `trg_validate_showtime_seat_screen`$$
CREATE TRIGGER `trg_validate_showtime_seat_screen`
BEFORE INSERT ON `showtime_seats`
FOR EACH ROW
BEGIN
    DECLARE v_showtime_screen_id BIGINT UNSIGNED;
    DECLARE v_seat_screen_id BIGINT UNSIGNED;

    SELECT `screen_id` INTO v_showtime_screen_id FROM `showtimes` WHERE `showtime_id` = NEW.`showtime_id`;
    SELECT `screen_id` INTO v_seat_screen_id FROM `seats` WHERE `seat_id` = NEW.`seat_id`;

    IF v_showtime_screen_id IS NULL OR v_seat_screen_id IS NULL OR v_showtime_screen_id != v_seat_screen_id THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Seat Validation Error: Seat does not belong to the screen assigned to this showtime.';
    END IF;
END$$

-- Rule 3 Trigger: Prevent overlapping showtimes on the same screen (INSERT)
DROP TRIGGER IF EXISTS `trg_prevent_showtime_overlap_insert`$$
CREATE TRIGGER `trg_prevent_showtime_overlap_insert`
BEFORE INSERT ON `showtimes`
FOR EACH ROW
BEGIN
    IF EXISTS (
        SELECT 1 FROM `showtimes`
        WHERE `screen_id` = NEW.`screen_id`
          AND `status` != 'cancelled'
          AND ((NEW.`start_time` < `end_time`) AND (NEW.`end_time` > `start_time`))
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Schedule Conflict Error: An overlapping showtime exists on this screen during the requested time window.';
    END IF;
END$$

-- Rule 3 Trigger: Prevent overlapping showtimes on the same screen (UPDATE)
DROP TRIGGER IF EXISTS `trg_prevent_showtime_overlap_update`$$
CREATE TRIGGER `trg_prevent_showtime_overlap_update`
BEFORE UPDATE ON `showtimes`
FOR EACH ROW
BEGIN
    IF EXISTS (
        SELECT 1 FROM `showtimes`
        WHERE `screen_id` = NEW.`screen_id`
          AND `showtime_id` != NEW.`showtime_id`
          AND `status` != 'cancelled'
          AND ((NEW.`start_time` < `end_time`) AND (NEW.`end_time` > `start_time`))
    ) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Schedule Conflict Error: An overlapping showtime exists on this screen during the requested time window.';
    END IF;
END$$

-- Helper Stored Procedure: Generate seat inventory for a showtime with tiered pricing
DROP PROCEDURE IF EXISTS `sp_generate_showtime_seats`$$
CREATE PROCEDURE `sp_generate_showtime_seats`(
    IN p_showtime_id BIGINT UNSIGNED
)
BEGIN
    DECLARE v_screen_id BIGINT UNSIGNED;
    DECLARE v_base_price DECIMAL(10,2);
    DECLARE v_count INT DEFAULT 0;

    SELECT `screen_id`, `base_price`
    INTO v_screen_id, v_base_price
    FROM `showtimes`
    WHERE `showtime_id` = p_showtime_id;

    IF v_screen_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Showtime not found.';
    END IF;

    SELECT COUNT(*) INTO v_count
    FROM `showtime_seats`
    WHERE `showtime_id` = p_showtime_id;

    IF v_count > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Seat inventory already generated for this showtime.';
    END IF;

    INSERT INTO `showtime_seats` (`showtime_id`, `seat_id`, `price`, `status`)
    SELECT
        p_showtime_id,
        s.`seat_id`,
        CASE
            WHEN LOWER(st.`name`) = 'premium' THEN ROUND(v_base_price * 1.35, 2)
            WHEN LOWER(st.`name`) = 'recliner' THEN ROUND(v_base_price * 1.80, 2)
            ELSE v_base_price
        END AS `calculated_price`,
        'available'
    FROM `seats` s
    JOIN `seat_types` st ON s.`seat_type_id` = st.`seat_type_id`
    WHERE s.`screen_id` = v_screen_id AND s.`is_active` = 1;
END$$

DELIMITER ;

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
SET SQL_MODE = @OLD_SQL_MODE;

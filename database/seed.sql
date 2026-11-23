-- =====================================================================
-- Movie Theater Seat Booking & Showtime Manager
-- Database Seed Data (Realistic Sample Records)
-- =====================================================================

USE `movie_theater_db`;

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. Admins
-- Passwords:
--   superadmin@cinema.com -> Super@123
--   admin@cinema.com      -> Admin@123
--   manager@cinema.com    -> Admin@123
-- ---------------------------------------------------------------------
TRUNCATE TABLE `admins`;
INSERT INTO `admins` (`admin_id`, `full_name`, `email`, `password_hash`, `role`, `is_active`, `created_at`) VALUES
(1, 'Super Administrator', 'superadmin@cinema.com', '$2b$10$02WF2GM0xdetPXx3tka6Dev07J3KxrzVcmFsRiAs7NqM9oGwMfF7i', 'super_admin', 1, NOW()),
(2, 'Theater Ops Manager',  'admin@cinema.com',      '$2b$10$02WF2GM0xdetPXx3tka6De2REgy1sSMV9ACiCYd/MWETDGRp7vdyq', 'admin',       1, NOW()),
(3, 'Booking Floor Manager','manager@cinema.com',    '$2b$10$02WF2GM0xdetPXx3tka6De2REgy1sSMV9ACiCYd/MWETDGRp7vdyq', 'manager',     1, NOW());

-- ---------------------------------------------------------------------
-- 2. Customers
-- Passwords: Password@123 for all seeded customers
-- ---------------------------------------------------------------------
TRUNCATE TABLE `customers`;
INSERT INTO `customers` (`customer_id`, `full_name`, `email`, `phone`, `password_hash`, `status`, `created_at`) VALUES
(1, 'John Doe',        'john.doe@example.com',     '+91 9876543210', '$2b$10$02WF2GM0xdetPXx3tka6De2oQvFIqtVkuWkA7Op5V2griXRxO6hsu', 'active',   NOW()),
(2, 'Jane Smith',      'jane.smith@example.com',   '+91 9812345678', '$2b$10$02WF2GM0xdetPXx3tka6De2oQvFIqtVkuWkA7Op5V2griXRxO6hsu', 'active',   NOW()),
(3, 'Rahul Sharma',    'rahul.sharma@example.com', '+91 9723456789', '$2b$10$02WF2GM0xdetPXx3tka6De2oQvFIqtVkuWkA7Op5V2griXRxO6hsu', 'active',   NOW()),
(4, 'Priya Patel',     'priya.patel@example.com',  '+91 9934567890', '$2b$10$02WF2GM0xdetPXx3tka6De2oQvFIqtVkuWkA7Op5V2griXRxO6hsu', 'active',   NOW()),
(5, 'Amit Verma',      'amit.verma@example.com',   '+91 9845123456', '$2b$10$02WF2GM0xdetPXx3tka6De2oQvFIqtVkuWkA7Op5V2griXRxO6hsu', 'active',   NOW()),
(6, 'Alex Turner',     'alex.turner@example.com',  '+91 9645678901', '$2b$10$02WF2GM0xdetPXx3tka6De2oQvFIqtVkuWkA7Op5V2griXRxO6hsu', 'blocked',  NOW());

-- ---------------------------------------------------------------------
-- 3. Theaters (3 Theaters across major cities)
-- ---------------------------------------------------------------------
TRUNCATE TABLE `theaters`;
INSERT INTO `theaters` (`theater_id`, `name`, `address`, `city`, `state`, `pincode`, `phone`, `is_active`, `created_at`) VALUES
(1, 'CineGrand Premiere',      'Hill Road, Bandra West',          'Mumbai',    'Maharashtra', '400050', '+91 22 2640 1234', 1, NOW()),
(2, 'Starlight IMAX Cinema',   'Forum Mall, Koramangala',         'Bengaluru', 'Karnataka',   '560095', '+91 80 4112 5678', 1, NOW()),
(3, 'Regal Heritage Multiplex', 'Connaught Place, Central Delhi',  'New Delhi', 'Delhi',       '110001', '+91 11 2341 9012', 1, NOW());

-- ---------------------------------------------------------------------
-- 4. Screens (6 Screens across 3 Theaters)
-- ---------------------------------------------------------------------
TRUNCATE TABLE `screens`;
INSERT INTO `screens` (`screen_id`, `theater_id`, `name`, `total_capacity`, `screen_type`, `is_active`, `created_at`) VALUES
(1, 1, 'Screen 1 (IMAX)',       68, 'IMAX', 1, NOW()),
(2, 1, 'Screen 2 (Gold 2D)',    48, '2D',   1, NOW()),
(3, 2, 'Screen 1 (Laser 4DX)',  68, '4DX',  1, NOW()),
(4, 2, 'Screen 2 (Dolby Atmos)',48, '3D',   1, NOW()),
(5, 3, 'Audi 1 (Grand IMAX)',   68, 'IMAX', 1, NOW()),
(6, 3, 'Audi 2 (Classic 2D)',   48, '2D',   1, NOW());

-- ---------------------------------------------------------------------
-- 5. Seat Types
-- ---------------------------------------------------------------------
TRUNCATE TABLE `seat_types`;
INSERT INTO `seat_types` (`seat_type_id`, `name`, `description`, `color_code`) VALUES
(1, 'Standard', 'Ergonomic high-back seats with prime sightlines.',     '#3b82f6'),
(2, 'Premium',  'Plush cushioned seats in prime sweet spot zone.',      '#f59e0b'),
(3, 'Recliner', 'Motorized leatherette loungers with personal food tray','#8b5cf6');

-- ---------------------------------------------------------------------
-- 6. Seats (Generate >= 30 physical seats per screen: 68 or 48 per screen)
-- Total 348 seats generated
-- ---------------------------------------------------------------------
TRUNCATE TABLE `seats`;

DELIMITER $$
DROP PROCEDURE IF EXISTS `temp_seed_physical_seats`$$
CREATE PROCEDURE `temp_seed_physical_seats`()
BEGIN
    DECLARE s INT DEFAULT 1;
    DECLARE r INT;
    DECLARE c INT;
    DECLARE row_name CHAR(1);
    DECLARE type_id BIGINT;

    WHILE s <= 6 DO
        IF s IN (1, 3, 5) THEN
            -- 68 seats: Rows A-C (Standard 30), D-E (Premium 20), F-G (Recliner 18)
            SET r = 1;
            WHILE r <= 7 DO
                SET row_name = CHAR(64 + r); -- A=1, B=2, C=3, D=4, E=5, F=6, G=7
                IF r <= 3 THEN
                    SET type_id = 1; -- Standard
                    SET c = 1;
                    WHILE c <= 10 DO
                        INSERT INTO `seats` (`screen_id`, `seat_type_id`, `row_label`, `seat_number`, `is_active`)
                        VALUES (s, type_id, row_name, c, 1);
                        SET c = c + 1;
                    END WHILE;
                ELSEIF r <= 5 THEN
                    SET type_id = 2; -- Premium
                    SET c = 1;
                    WHILE c <= 10 DO
                        INSERT INTO `seats` (`screen_id`, `seat_type_id`, `row_label`, `seat_number`, `is_active`)
                        VALUES (s, type_id, row_name, c, 1);
                        SET c = c + 1;
                    END WHILE;
                ELSE
                    SET type_id = 3; -- Recliner
                    SET c = 1;
                    WHILE c <= 9 DO
                        INSERT INTO `seats` (`screen_id`, `seat_type_id`, `row_label`, `seat_number`, `is_active`)
                        VALUES (s, type_id, row_name, c, 1);
                        SET c = c + 1;
                    END WHILE;
                END IF;
                SET r = r + 1;
            END WHILE;
        ELSE
            -- 48 seats: Rows A-B (Standard 20), C-D (Premium 20), E (Recliner 8)
            SET r = 1;
            WHILE r <= 5 DO
                SET row_name = CHAR(64 + r);
                IF r <= 2 THEN
                    SET type_id = 1; -- Standard
                    SET c = 1;
                    WHILE c <= 10 DO
                        INSERT INTO `seats` (`screen_id`, `seat_type_id`, `row_label`, `seat_number`, `is_active`)
                        VALUES (s, type_id, row_name, c, 1);
                        SET c = c + 1;
                    END WHILE;
                ELSEIF r <= 4 THEN
                    SET type_id = 2; -- Premium
                    SET c = 1;
                    WHILE c <= 10 DO
                        INSERT INTO `seats` (`screen_id`, `seat_type_id`, `row_label`, `seat_number`, `is_active`)
                        VALUES (s, type_id, row_name, c, 1);
                        SET c = c + 1;
                    END WHILE;
                ELSE
                    SET type_id = 3; -- Recliner
                    SET c = 1;
                    WHILE c <= 8 DO
                        INSERT INTO `seats` (`screen_id`, `seat_type_id`, `row_label`, `seat_number`, `is_active`)
                        VALUES (s, type_id, row_name, c, 1);
                        SET c = c + 1;
                    END WHILE;
                END IF;
                SET r = r + 1;
            END WHILE;
        END IF;
        SET s = s + 1;
    END WHILE;
END$$
DELIMITER ;

CALL temp_seed_physical_seats();
DROP PROCEDURE IF EXISTS `temp_seed_physical_seats`;

-- ---------------------------------------------------------------------
-- 7. Genres (12 Genres)
-- ---------------------------------------------------------------------
TRUNCATE TABLE `genres`;
INSERT INTO `genres` (`genre_id`, `name`, `slug`) VALUES
(1,  'Action',      'action'),
(2,  'Adventure',   'adventure'),
(3,  'Comedy',      'comedy'),
(4,  'Drama',       'drama'),
(5,  'Sci-Fi',      'sci-fi'),
(6,  'Thriller',    'thriller'),
(7,  'Horror',      'horror'),
(8,  'Romance',     'romance'),
(9,  'Animation',   'animation'),
(10, 'Crime',       'crime'),
(11, 'Fantasy',     'fantasy'),
(12, 'Mystery',     'mystery');

-- ---------------------------------------------------------------------
-- 8. Movies (10 Movies)
-- ---------------------------------------------------------------------
TRUNCATE TABLE `movies`;
INSERT INTO `movies` (`movie_id`, `title`, `slug`, `description`, `duration_min`, `language`, `certification`, `release_date`, `poster_path`, `trailer_url`, `status`, `created_at`) VALUES
(1, 'Inception', 'inception',
 'A skilled thief extracts secrets from within dreams, but is tasked with planting an idea into a CEO\'s mind.',
 148, 'English', 'UA', '2010-07-16', '/images/posters/inception.jpg', 'https://www.youtube.com/watch?v=YoHD9XEInc0', 'now_showing', NOW()),

(2, 'Interstellar', 'interstellar',
 'A team of explorers travels through a wormhole in space in an attempt to ensure humanity\'s survival.',
 169, 'English', 'UA', '2014-11-07', '/images/posters/interstellar.jpg', 'https://www.youtube.com/watch?v=zSWdZVtXT7E', 'now_showing', NOW()),

(3, 'The Dark Knight', 'the-dark-knight',
 'Batman must accept one of the greatest psychological and physical tests to fight the menace known as the Joker.',
 152, 'English', 'A', '2008-07-18', '/images/posters/dark-knight.jpg', 'https://www.youtube.com/watch?v=EXeTwQWrcwY', 'now_showing', NOW()),

(4, 'Oppenheimer', 'oppenheimer',
 'The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.',
 180, 'English', 'A', '2023-07-21', '/images/posters/oppenheimer.jpg', 'https://www.youtube.com/watch?v=uYPbbksJxIg', 'now_showing', NOW()),

(5, 'Dune: Part Two', 'dune-part-two',
 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
 166, 'English', 'UA', '2024-03-01', '/images/posters/dune-2.jpg', 'https://www.youtube.com/watch?v=Way9Dexny3w', 'now_showing', NOW()),

(6, 'Gladiator II', 'gladiator-ii',
 'Years after Maximus\' death, Lucius enters the Colosseum after his home is conquered by tyrannical Emperors.',
 148, 'English', 'A', '2024-11-22', '/images/posters/gladiator-2.jpg', 'https://www.youtube.com/watch?v=4rgYUipGJNo', 'now_showing', NOW()),

(7, 'Avatar: Fire and Ash', 'avatar-fire-and-ash',
 'The continued journey of Jake Sully and Neytiri on Pandora encountering the aggressive volcanic clan of Na\'vi.',
 192, 'English', 'UA', '2025-12-19', '/images/posters/avatar-3.jpg', 'https://www.youtube.com/watch?v=d9MyW72ELq0', 'upcoming', NOW()),

(8, 'Spider-Man: Beyond the Spider-Verse', 'spider-man-beyond-the-spider-verse',
 'Miles Morales embarks on a multiverse adventure across parallel dimensions to save the multiverse from total collapse.',
 140, 'English', 'U', '2025-06-27', '/images/posters/spider-verse.jpg', 'https://www.youtube.com/watch?v=cqGjhVJWtEg', 'upcoming', NOW()),

(9, 'Titanic', 'titanic',
 'A seventeen-year-old aristocrat falls in love with a kind but poor artist aboard the luxurious, ill-fated R.M.S. Titanic.',
 195, 'English', 'UA', '1997-12-19', '/images/posters/titanic.jpg', 'https://www.youtube.com/watch?v=2e-eXJ6HgkQ', 'ended', NOW()),

(10, 'Avengers: Endgame', 'avengers-endgame',
 'After the devastating events of Infinity War, the remaining Avengers assemble once more to reverse Thanos\' actions.',
 181, 'English', 'UA', '2019-04-26', '/images/posters/avengers-endgame.jpg', 'https://www.youtube.com/watch?v=TcMBFSGVi1c', 'ended', NOW());

-- ---------------------------------------------------------------------
-- 9. Movie Genres Mapping
-- ---------------------------------------------------------------------
TRUNCATE TABLE `movie_genres`;
INSERT INTO `movie_genres` (`movie_id`, `genre_id`) VALUES
(1, 5), (1, 6), (1, 1),  -- Inception: Sci-Fi, Thriller, Action
(2, 5), (2, 4), (2, 2),  -- Interstellar: Sci-Fi, Drama, Adventure
(3, 1), (3, 10), (3, 4), -- Dark Knight: Action, Crime, Drama
(4, 4), (4, 12),         -- Oppenheimer: Drama, Mystery
(5, 5), (5, 2), (5, 1),  -- Dune 2: Sci-Fi, Adventure, Action
(6, 1), (6, 4), (6, 2),  -- Gladiator 2: Action, Drama, Adventure
(7, 5), (7, 2), (7, 1),  -- Avatar 3: Sci-Fi, Adventure, Action
(8, 9), (8, 1), (8, 5),  -- Spider-Verse: Animation, Action, Sci-Fi
(9, 8), (9, 4),          -- Titanic: Romance, Drama
(10, 1), (10, 5), (10, 2); -- Endgame: Action, Sci-Fi, Adventure

-- ---------------------------------------------------------------------
-- 10. Showtimes (12 Showtimes with dynamic CURRENT_DATE anchors)
-- ---------------------------------------------------------------------
TRUNCATE TABLE `showtimes`;
INSERT INTO `showtimes` (`showtime_id`, `movie_id`, `screen_id`, `start_time`, `end_time`, `base_price`, `language`, `format`, `status`, `created_at`) VALUES
-- Today: Mumbai Screen 1 (IMAX) & Screen 2 (Gold 2D)
(1, 1, 1, DATE_ADD(CURRENT_DATE, INTERVAL '10:00:00' HOUR_SECOND), DATE_ADD(CURRENT_DATE, INTERVAL '12:45:00' HOUR_SECOND), 350.00, 'English', 'IMAX', 'scheduled', NOW()),
(2, 1, 1, DATE_ADD(CURRENT_DATE, INTERVAL '14:00:00' HOUR_SECOND), DATE_ADD(CURRENT_DATE, INTERVAL '16:45:00' HOUR_SECOND), 400.00, 'English', 'IMAX', 'scheduled', NOW()),
(3, 1, 1, DATE_ADD(CURRENT_DATE, INTERVAL '18:00:00' HOUR_SECOND), DATE_ADD(CURRENT_DATE, INTERVAL '20:45:00' HOUR_SECOND), 450.00, 'English', 'IMAX', 'scheduled', NOW()),
(4, 2, 2, DATE_ADD(CURRENT_DATE, INTERVAL '11:00:00' HOUR_SECOND), DATE_ADD(CURRENT_DATE, INTERVAL '14:00:00' HOUR_SECOND), 250.00, 'English', '2D',   'scheduled', NOW()),
(5, 2, 2, DATE_ADD(CURRENT_DATE, INTERVAL '15:00:00' HOUR_SECOND), DATE_ADD(CURRENT_DATE, INTERVAL '18:00:00' HOUR_SECOND), 280.00, 'English', '2D',   'scheduled', NOW()),

-- Tomorrow: Bengaluru Screen 3 (4DX) & Screen 4 (3D)
(6, 4, 3, DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL '11:30:00' HOUR_SECOND), DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL '14:45:00' HOUR_SECOND), 420.00, 'English', '4DX',  'scheduled', NOW()),
(7, 4, 3, DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL '16:00:00' HOUR_SECOND), DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL '19:15:00' HOUR_SECOND), 480.00, 'English', '4DX',  'scheduled', NOW()),
(8, 5, 4, DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL '13:00:00' HOUR_SECOND), DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL '15:55:00' HOUR_SECOND), 300.00, 'English', '3D',   'scheduled', NOW()),
(9, 5, 4, DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL '17:30:00' HOUR_SECOND), DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY), INTERVAL '20:25:00' HOUR_SECOND), 350.00, 'English', '3D',   'scheduled', NOW()),

-- Day After Tomorrow: New Delhi Screen 5 (IMAX) & Screen 6 (Classic)
(10, 3, 5, DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), INTERVAL '12:00:00' HOUR_SECOND), DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), INTERVAL '14:45:00' HOUR_SECOND), 380.00, 'English', 'IMAX', 'scheduled', NOW()),
(11, 3, 5, DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), INTERVAL '16:30:00' HOUR_SECOND), DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), INTERVAL '19:15:00' HOUR_SECOND), 450.00, 'English', 'IMAX', 'scheduled', NOW()),
(12, 6, 6, DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), INTERVAL '14:00:00' HOUR_SECOND), DATE_ADD(DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY), INTERVAL '16:40:00' HOUR_SECOND), 260.00, 'English', '2D',   'scheduled', NOW());

-- ---------------------------------------------------------------------
-- 11. Showtime Seats Inventory (Generated via sp_generate_showtime_seats)
-- ---------------------------------------------------------------------
TRUNCATE TABLE `showtime_seats`;

CALL sp_generate_showtime_seats(1);
CALL sp_generate_showtime_seats(2);
CALL sp_generate_showtime_seats(3);
CALL sp_generate_showtime_seats(4);
CALL sp_generate_showtime_seats(5);
CALL sp_generate_showtime_seats(6);
CALL sp_generate_showtime_seats(7);
CALL sp_generate_showtime_seats(8);
CALL sp_generate_showtime_seats(9);
CALL sp_generate_showtime_seats(10);
CALL sp_generate_showtime_seats(11);
CALL sp_generate_showtime_seats(12);

-- ---------------------------------------------------------------------
-- 12. Bookings, Booking Seats, Payments, Refunds, Tickets
-- ---------------------------------------------------------------------
TRUNCATE TABLE `bookings`;
TRUNCATE TABLE `booking_seats`;
TRUNCATE TABLE `payments`;
TRUNCATE TABLE `refunds`;
TRUNCATE TABLE `tickets`;

-- BOOKING 1: Customer 1 books 2 Standard seats (A1, A2) in Showtime 1 (Confirmed)
INSERT INTO `bookings` (`booking_id`, `booking_ref`, `customer_id`, `showtime_id`, `total_amount`, `status`, `booked_at`, `confirmed_at`)
VALUES (1, 'BK20261123-0001', 1, 1, 700.00, 'confirmed', NOW(), NOW());

INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `showtime_id`, `seat_id`, `price_paid`)
VALUES 
(1, 1, 1, 1, 350.00), -- Seat A1
(2, 1, 1, 2, 350.00); -- Seat A2

UPDATE `showtime_seats` SET `status` = 'booked', `booking_id` = 1 WHERE `showtime_id` = 1 AND `seat_id` IN (1, 2);

INSERT INTO `payments` (`payment_id`, `booking_id`, `transaction_ref`, `payment_method`, `amount`, `status`, `paid_at`, `created_at`)
VALUES (1, 1, 'TXN-PAY-20261123-001', 'card', 700.00, 'success', NOW(), NOW());

INSERT INTO `tickets` (`ticket_id`, `booking_seat_id`, `booking_id`, `ticket_number`, `qr_code_path`, `status`, `issued_at`)
VALUES 
(1, 1, 1, 'TKT-20261123-0001-A1', '/uploads/qrcodes/tkt-1.png', 'valid', NOW()),
(2, 2, 1, 'TKT-20261123-0001-A2', '/uploads/qrcodes/tkt-2.png', 'valid', NOW());


-- BOOKING 2: Customer 2 books 2 Recliner seats in Showtime 2 (Multi-payment attempt demo)
-- Demonstrates multiple payment attempts for one booking: 1 failed attempt, 1 successful attempt
INSERT INTO `bookings` (`booking_id`, `booking_ref`, `customer_id`, `showtime_id`, `total_amount`, `status`, `booked_at`, `confirmed_at`)
VALUES (2, 'BK20261123-0002', 2, 2, 1440.00, 'confirmed', NOW(), NOW());

INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `showtime_id`, `seat_id`, `price_paid`)
VALUES 
(3, 2, 2, 51, 720.00), -- Recliner F1
(4, 2, 2, 52, 720.00); -- Recliner F2

UPDATE `showtime_seats` SET `status` = 'booked', `booking_id` = 2 WHERE `showtime_id` = 2 AND `seat_id` IN (51, 52);

-- Attempt 1: Failed card transaction
INSERT INTO `payments` (`payment_id`, `booking_id`, `transaction_ref`, `payment_method`, `amount`, `status`, `gateway_response`, `created_at`)
VALUES (2, 2, 'TXN-FAIL-20261123-002', 'card', 1440.00, 'failed', '{"error": "Insufficient funds or card declined"}', DATE_SUB(NOW(), INTERVAL 5 MINUTE));

-- Attempt 2: Successful UPI transaction
INSERT INTO `payments` (`payment_id`, `booking_id`, `transaction_ref`, `payment_method`, `amount`, `status`, `gateway_response`, `paid_at`, `created_at`)
VALUES (3, 2, 'TXN-PAY-20261123-003', 'upi', 1440.00, 'success', '{"auth_code": "UPI-APPROVED-9981"}', NOW(), NOW());

INSERT INTO `tickets` (`ticket_id`, `booking_seat_id`, `booking_id`, `ticket_number`, `qr_code_path`, `status`, `issued_at`)
VALUES 
(3, 3, 2, 'TKT-20261123-0002-F1', '/uploads/qrcodes/tkt-3.png', 'valid', NOW()),
(4, 4, 2, 'TKT-20261123-0002-F2', '/uploads/qrcodes/tkt-4.png', 'valid', NOW());


-- BOOKING 3: Customer 3 booked and cancelled with refund
INSERT INTO `bookings` (`booking_id`, `booking_ref`, `customer_id`, `showtime_id`, `total_amount`, `status`, `cancel_reason`, `booked_at`, `confirmed_at`, `cancelled_at`)
VALUES (3, 'BK20261123-0003', 3, 1, 350.00, 'cancelled', 'User itinerary change', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), NOW());

INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `showtime_id`, `seat_id`, `price_paid`)
VALUES (5, 3, 1, 5, 350.00);

INSERT INTO `payments` (`payment_id`, `booking_id`, `transaction_ref`, `payment_method`, `amount`, `status`, `paid_at`, `created_at`)
VALUES (4, 3, 'TXN-PAY-20261123-004', 'netbanking', 350.00, 'refunded', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO `refunds` (`refund_id`, `payment_id`, `booking_id`, `refund_ref`, `amount`, `status`, `reason`, `initiated_at`, `processed_at`)
VALUES (1, 4, 3, 'RFND-20261123-0001', 350.00, 'processed', 'Full booking cancellation refund', NOW(), NOW());

INSERT INTO `tickets` (`ticket_id`, `booking_seat_id`, `booking_id`, `ticket_number`, `qr_code_path`, `status`, `issued_at`)
VALUES (5, 5, 3, 'TKT-20261123-0003-A5', '/uploads/qrcodes/tkt-5.png', 'cancelled', DATE_SUB(NOW(), INTERVAL 2 HOUR));

-- Mark seat A5 back to available
UPDATE `showtime_seats` SET `status` = 'available', `booking_id` = NULL WHERE `showtime_id` = 1 AND `seat_id` = 5;


-- BOOKING 4: Customer 4 books 3 Standard seats in Showtime 4 (Bengaluru Screen 2)
INSERT INTO `bookings` (`booking_id`, `booking_ref`, `customer_id`, `showtime_id`, `total_amount`, `status`, `booked_at`, `confirmed_at`)
VALUES (4, 'BK20261123-0004', 4, 4, 750.00, 'confirmed', NOW(), NOW());

-- Screen 2 seats start after screen 1 (Screen 1 has 68 seats: seat_id 1 to 68; Screen 2 has 48 seats: seat_id 69 to 116)
INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `showtime_id`, `seat_id`, `price_paid`)
VALUES 
(6, 4, 4, 69, 250.00), -- Screen 2 Seat A1
(7, 4, 4, 70, 250.00), -- Screen 2 Seat A2
(8, 4, 4, 71, 250.00); -- Screen 2 Seat A3

UPDATE `showtime_seats` SET `status` = 'booked', `booking_id` = 4 WHERE `showtime_id` = 4 AND `seat_id` IN (69, 70, 71);

INSERT INTO `payments` (`payment_id`, `booking_id`, `transaction_ref`, `payment_method`, `amount`, `status`, `paid_at`, `created_at`)
VALUES (5, 4, 'TXN-PAY-20261123-005', 'card', 750.00, 'success', NOW(), NOW());

INSERT INTO `tickets` (`ticket_id`, `booking_seat_id`, `booking_id`, `ticket_number`, `qr_code_path`, `status`, `issued_at`)
VALUES 
(6, 6, 4, 'TKT-20261123-0004-A1', '/uploads/qrcodes/tkt-6.png', 'valid', NOW()),
(7, 7, 4, 'TKT-20261123-0004-A2', '/uploads/qrcodes/tkt-7.png', 'valid', NOW()),
(8, 8, 4, 'TKT-20261123-0004-A3', '/uploads/qrcodes/tkt-8.png', 'valid', NOW());


-- BOOKING 5: Customer 5 books 2 Premium seats in Showtime 6 (Bengaluru 4DX) with Partial Refund Demo
-- Total ₹1134.00 paid, then ₹567.00 partial refund processed for 1 seat adjustment
INSERT INTO `bookings` (`booking_id`, `booking_ref`, `customer_id`, `showtime_id`, `total_amount`, `status`, `booked_at`, `confirmed_at`)
VALUES (5, 'BK20261123-0005', 5, 6, 1134.00, 'confirmed', NOW(), NOW());

-- Screen 3 seats: seat_id 117 to 184 (Rows D & E Premium are seat_id 147 to 166)
INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `showtime_id`, `seat_id`, `price_paid`)
VALUES 
(9,  5, 6, 147, 567.00), -- Row D Seat 1 Premium
(10, 5, 6, 148, 567.00); -- Row D Seat 2 Premium

UPDATE `showtime_seats` SET `status` = 'booked', `booking_id` = 5 WHERE `showtime_id` = 6 AND `seat_id` IN (147, 148);

INSERT INTO `payments` (`payment_id`, `booking_id`, `transaction_ref`, `payment_method`, `amount`, `status`, `paid_at`, `created_at`)
VALUES (6, 5, 'TXN-PAY-20261123-006', 'upi', 1134.00, 'success', NOW(), NOW());

-- Partial refund: 1 seat refunded (amount 567.00 out of 1134.00)
INSERT INTO `refunds` (`refund_id`, `payment_id`, `booking_id`, `refund_ref`, `amount`, `status`, `reason`, `initiated_at`, `processed_at`)
VALUES (2, 6, 5, 'RFND-20261123-0002', 567.00, 'processed', 'Customer downscaled party size by 1 seat', NOW(), NOW());

INSERT INTO `tickets` (`ticket_id`, `booking_seat_id`, `booking_id`, `ticket_number`, `qr_code_path`, `status`, `issued_at`)
VALUES 
(9,  9,  5, 'TKT-20261123-0005-D1', '/uploads/qrcodes/tkt-9.png',  'valid',     NOW()),
(10, 10, 5, 'TKT-20261123-0005-D2', '/uploads/qrcodes/tkt-10.png', 'cancelled', NOW());

-- Seat 148 released back to available
UPDATE `showtime_seats` SET `status` = 'available', `booking_id` = NULL WHERE `showtime_id` = 6 AND `seat_id` = 148;

-- Temporary Hold Simulation: Customer 1 holds seat 31 in Showtime 3
UPDATE `showtime_seats` 
SET `status` = 'held', 
    `held_by` = 1, 
    `held_until` = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
WHERE `showtime_id` = 3 AND `seat_id` = 31;

SET FOREIGN_KEY_CHECKS = 1;

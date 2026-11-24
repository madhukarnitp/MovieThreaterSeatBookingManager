-- =====================================================================
-- Movie Theater Seat Booking & Showtime Manager
-- Seed Data Script (9 Core Tables - 10 Indian Movies with Online Posters)
-- =====================================================================

USE `movie_theater_db`;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `payments`;
TRUNCATE TABLE `booking_seats`;
TRUNCATE TABLE `bookings`;
TRUNCATE TABLE `showtimes`;
TRUNCATE TABLE `seats`;
TRUNCATE TABLE `screens`;
TRUNCATE TABLE `theaters`;
TRUNCATE TABLE `movies`;
TRUNCATE TABLE `users`;

-- ---------------------------------------------------------------------
-- 1. Users (1 Admin + 2 Customers)
-- Admin password:    admin123
-- Customer password: password123
-- ---------------------------------------------------------------------
INSERT INTO `users` (`user_id`, `full_name`, `email`, `password_hash`, `phone`, `role`) VALUES
(1, 'System Administrator', 'admin@cinemanager.com', '$2b$10$7zVZq/dOLqB.CMQAM.Gcv.cfU7o9kwunMhrVqaBsPShwOGVDrJ8lC', '+91 98765 00001', 'admin'),
(2, 'Aarav Sharma',         'aarav.sharma@example.com', '$2b$10$78sYRKBvQRuLzh7ynI2xx.9.9T2XGiAbyBxO94E4RzBcm.zu91VVq', '+91 98765 00002', 'customer'),
(3, 'Priya Patel',          'priya.patel@example.com',  '$2b$10$78sYRKBvQRuLzh7ynI2xx.9.9T2XGiAbyBxO94E4RzBcm.zu91VVq', '+91 98765 00003', 'customer');

-- ---------------------------------------------------------------------
-- 2. Theaters
-- ---------------------------------------------------------------------
INSERT INTO `theaters` (`theater_id`, `name`, `city`, `address`) VALUES
(1, 'CineGrand Premiere', 'Mumbai',    'Phoenix Palladium, 462 Senapati Bapat Marg, Lower Parel'),
(2, 'Starplex Cinemas',   'Bangalore', 'Nexus Mall, Koramangala, 5th Block'),
(3, 'PVR Heritage',       'Delhi',     'Odeon Building, Connaught Place, Central Delhi');

-- ---------------------------------------------------------------------
-- 3. Screens
-- ---------------------------------------------------------------------
INSERT INTO `screens` (`screen_id`, `theater_id`, `screen_name`, `total_capacity`) VALUES
(1, 1, 'Screen 1 (Audi A)', 30),
(2, 1, 'Screen 2 (Audi B)', 30),
(3, 2, 'Screen 1',          30),
(4, 2, 'Screen 2',          30),
(5, 3, 'Screen 1',          30),
(6, 3, 'Screen 2',          30);

-- ---------------------------------------------------------------------
-- 4. Seats (30 seats per screen: Row A = Standard, Row B = Premium, Row C = VIP)
-- ---------------------------------------------------------------------
INSERT INTO `seats` (`screen_id`, `row_label`, `seat_number`, `seat_type`)
SELECT s.screen_id, r.row_label, n.seat_number, r.seat_type
FROM screens s
CROSS JOIN (
    SELECT 'A' AS row_label, 'STANDARD' AS seat_type
    UNION ALL SELECT 'B', 'PREMIUM'
    UNION ALL SELECT 'C', 'VIP'
) r
CROSS JOIN (
    SELECT 1 AS seat_number UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
    UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
) n
ORDER BY s.screen_id, r.row_label, n.seat_number;

-- ---------------------------------------------------------------------
-- 5. Movies (10 Acclaimed Indian Movies with Online Posters)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6. Showtimes
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 7. Bookings
-- ---------------------------------------------------------------------
INSERT INTO `bookings` (`booking_id`, `booking_ref`, `user_id`, `showtime_id`, `total_amount`, `booking_status`, `booking_date`) VALUES
(1, 'BK-20261124-001', 2, 1, 600.00, 'CONFIRMED', NOW() - INTERVAL 2 HOUR),
(2, 'BK-20261124-002', 3, 1, 300.00, 'CONFIRMED', NOW() - INTERVAL 1 HOUR),
(3, 'BK-20261124-003', 2, 3, 700.00, 'PENDING',   NOW() - INTERVAL 10 MINUTE);

-- ---------------------------------------------------------------------
-- 8. Booking Seats
-- ---------------------------------------------------------------------
-- Booking 1 (Aarav Sharma - Seats 1 & 2 in Screen 1)
INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `seat_id`, `price`) VALUES
(1, 1, 1, 300.00),
(2, 1, 2, 300.00);

-- Booking 2 (Priya Patel - Seat 3 in Screen 1)
INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `seat_id`, `price`) VALUES
(3, 2, 3, 300.00);

-- Booking 3 (Aarav Sharma - Seats 11 & 12 in Screen 1 for Showtime 3)
INSERT INTO `booking_seats` (`booking_seat_id`, `booking_id`, `seat_id`, `price`) VALUES
(4, 3, 11, 350.00),
(5, 3, 12, 350.00);

-- ---------------------------------------------------------------------
-- 9. Payments
-- ---------------------------------------------------------------------
INSERT INTO `payments` (`payment_id`, `booking_id`, `transaction_ref`, `payment_method`, `amount`, `payment_status`, `payment_date`) VALUES
(1, 1, 'TXN-9847192834-SUCCESS', 'UPI',  600.00, 'SUCCESS', NOW() - INTERVAL 2 HOUR),
(2, 2, 'TXN-5612849102-SUCCESS', 'CARD', 300.00, 'SUCCESS', NOW() - INTERVAL 1 HOUR),
(3, 3, 'TXN-1192837465-PENDING', 'UPI',  700.00, 'PENDING', NOW() - INTERVAL 10 MINUTE);

SET FOREIGN_KEY_CHECKS = 1;

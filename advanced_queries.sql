-- =====================================================================
-- Movie Theater Seat Booking & Showtime Manager
-- Advanced DBMS Demonstration Script: advanced_queries.sql
--
-- Target Audience: 2nd-Year B.Tech Computer Science / IT DBMS Laboratory
-- Database Management System: MySQL 8.0 (InnoDB Engine)
--
-- Core Concepts Demonstrated:
--   1. JOINS (INNER JOIN, LEFT JOIN, Multi-Table JOIN)
--   2. AGGREGATE FUNCTIONS (COUNT, SUM, AVG, MAX, MIN)
--   3. GROUPING & FILTERING (GROUP BY, HAVING, ORDER BY)
--   4. SUBQUERIES (Scalar, In-Clause, Correlated EXISTS, NOT IN)
--   5. VIEWS (Showtime Catalog, Customer Booking, Revenue Summary)
--   6. INDEXES & QUERY OPTIMIZATION (B-Tree Indexes, EXPLAIN analysis)
--   7. STORED PROCEDURE (Parameterized procedure for Booking Details)
--   8. TRIGGER (Audit logging on Booking Status changes)
--   9. TRANSACTIONS (ACID demonstration with COMMIT & ROLLBACK)
-- =====================================================================

USE `movie_theater_db`;

-- =====================================================================
-- SECTION 1: JOINS
-- =====================================================================

-- 1.1 INNER JOIN: Match bookings with registered customer accounts
-- Purpose: Returns only the rows where there is a matching user_id in both tables.
-- Expected Result: Lists all bookings along with customer name, email, and booking status.
SELECT 
    b.booking_id,
    b.booking_ref,
    u.full_name AS customer_name,
    u.email AS customer_email,
    b.total_amount,
    b.booking_status,
    b.booking_date
FROM bookings b
INNER JOIN users u ON b.user_id = u.user_id
ORDER BY b.booking_id ASC;


-- 1.2 LEFT JOIN: Movies with their scheduled showtimes
-- Purpose: Retrieves ALL movies from the left table (`movies`), even if no
--          showtime is currently scheduled (returns NULL for right table columns).
-- Expected Result: Lists all 10 movies with showtimes where available; preserves
--                  movies without active screenings.
SELECT 
    m.movie_id,
    m.title AS movie_title,
    m.language,
    m.duration_min,
    s.showtime_id,
    s.show_date,
    s.start_time,
    s.ticket_price,
    COALESCE(s.status, 'NO SHOWTIMES') AS showtime_status
FROM movies m
LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'SCHEDULED'
ORDER BY m.movie_id ASC, s.show_date ASC, s.start_time ASC;


-- 1.3 Multiple-table JOIN: Complete Ticket Details (6 Relational Tables)
-- Purpose: Combines `bookings`, `users`, `showtimes`, `movies`, `screens`, and `theaters`
--          to demonstrate cross-table data normalization and navigation.
-- Expected Result: Comprehensive cinema ticket breakdown for each booking.
SELECT 
    b.booking_ref,
    u.full_name AS customer_name,
    u.phone AS customer_phone,
    m.title AS movie_title,
    m.language,
    t.name AS theater_name,
    t.city AS theater_city,
    sc.screen_name,
    s.show_date,
    s.start_time,
    b.total_amount,
    b.booking_status
FROM bookings b
INNER JOIN users u ON b.user_id = u.user_id
INNER JOIN showtimes s ON b.showtime_id = s.showtime_id
INNER JOIN movies m ON s.movie_id = m.movie_id
INNER JOIN screens sc ON s.screen_id = sc.screen_id
INNER JOIN theaters t ON sc.theater_id = t.theater_id
ORDER BY b.booking_id ASC;


-- =====================================================================
-- SECTION 2: AGGREGATE FUNCTIONS
-- =====================================================================

-- 2.1 Individual Aggregate Function Demonstrations:
--   COUNT : Counts total number of bookings and distinct customers
--   SUM   : Computes total gross revenue collected from completed payments
--   AVG   : Calculates the average ticket price across all screenings
--   MAX   : Finds the highest ticket price in the theater chain
--   MIN   : Finds the lowest ticket price in the theater chain
SELECT 
    COUNT(*) AS total_screenings_scheduled,
    ROUND(AVG(ticket_price), 2) AS average_ticket_price,
    MAX(ticket_price) AS max_ticket_price,
    MIN(ticket_price) AS min_ticket_price
FROM showtimes
WHERE status = 'SCHEDULED';

-- 2.2 Revenue & Customer Volume Summary (COUNT + SUM + COALESCE)
-- Purpose: Aggregates total bookings, unique paying customers, and verified revenue.
SELECT 
    COUNT(b.booking_id) AS total_bookings_recorded,
    COUNT(DISTINCT b.user_id) AS active_customer_count,
    COALESCE(SUM(CASE WHEN p.payment_status = 'SUCCESS' THEN p.amount ELSE 0.00 END), 0.00) AS total_verified_revenue,
    ROUND(AVG(b.total_amount), 2) AS average_booking_value
FROM bookings b
LEFT JOIN payments p ON b.booking_id = p.booking_id;


-- =====================================================================
-- SECTION 3: GROUPING & FILTERING (GROUP BY, HAVING, ORDER BY)
-- =====================================================================

-- 3.1 GROUP BY & ORDER BY: Sales and Seat Volume by Movie
-- Purpose: Groups individual booking records by movie title and aggregates metrics.
-- Expected Result: A report showing total bookings and revenue per movie, ordered
--                  by highest revenue first.
SELECT 
    m.movie_id,
    m.title AS movie_title,
    m.language,
    COUNT(DISTINCT b.booking_id) AS total_confirmed_bookings,
    COUNT(bs.booking_seat_id) AS total_seats_sold,
    COALESCE(SUM(bs.price), 0.00) AS total_revenue
FROM movies m
LEFT JOIN showtimes s ON m.movie_id = s.movie_id
LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.booking_status = 'CONFIRMED'
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
GROUP BY m.movie_id, m.title, m.language
ORDER BY total_revenue DESC, total_seats_sold DESC;


-- 3.2 GROUP BY with HAVING: High-Yield Screenings
-- Purpose: Demonstrates using HAVING to filter aggregated results.
--          (WHERE filters individual rows before aggregation; HAVING filters groups).
-- Expected Result: Returns showtimes that have generated at least Rs 300.00 in sales.
SELECT 
    s.showtime_id,
    m.title AS movie_title,
    t.name AS theater_name,
    s.show_date,
    s.start_time,
    COUNT(b.booking_id) AS confirmed_bookings_count,
    COALESCE(SUM(b.total_amount), 0.00) AS total_showtime_sales
FROM showtimes s
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.booking_status = 'CONFIRMED'
GROUP BY s.showtime_id, m.title, t.name, s.show_date, s.start_time
HAVING total_showtime_sales >= 300.00
ORDER BY total_showtime_sales DESC;


-- 3.3 Screen Capacity and Category Breakdown (Multi-level GROUP BY)
-- Purpose: Counts physical seats by category (VIP, PREMIUM, STANDARD) for each screen.
SELECT 
    t.name AS theater_name,
    sc.screen_name,
    COUNT(st.seat_id) AS total_seats,
    SUM(CASE WHEN st.seat_type = 'VIP' THEN 1 ELSE 0 END) AS vip_seat_count,
    SUM(CASE WHEN st.seat_type = 'PREMIUM' THEN 1 ELSE 0 END) AS premium_seat_count,
    SUM(CASE WHEN st.seat_type = 'STANDARD' THEN 1 ELSE 0 END) AS standard_seat_count
FROM theaters t
JOIN screens sc ON t.theater_id = sc.theater_id
JOIN seats st ON sc.screen_id = st.screen_id
GROUP BY t.theater_id, t.name, sc.screen_id, sc.screen_name
ORDER BY t.name ASC, sc.screen_name ASC;


-- =====================================================================
-- SECTION 4: SUBQUERIES
-- =====================================================================

-- 4.1 Subquery with Aggregation: Movies with more bookings than average
-- Purpose: Evaluates a scalar subquery in the HAVING clause that computes the
--          average number of bookings across all movies.
-- Expected Result: Returns only movies whose booking count exceeds the platform average.
SELECT 
    m.movie_id,
    m.title AS movie_title,
    COUNT(b.booking_id) AS movie_booking_count
FROM movies m
JOIN showtimes s ON m.movie_id = s.movie_id
JOIN bookings b ON s.showtime_id = b.showtime_id
GROUP BY m.movie_id, m.title
HAVING COUNT(b.booking_id) > (
    -- Nested subquery: calculates the average bookings per movie
    SELECT AVG(booking_count) 
    FROM (
        SELECT COUNT(b2.booking_id) AS booking_count
        FROM movies m2
        JOIN showtimes s2 ON m2.movie_id = s2.movie_id
        LEFT JOIN bookings b2 ON s2.showtime_id = b2.showtime_id
        GROUP BY m2.movie_id
    ) AS sub_averages
)
ORDER BY movie_booking_count DESC;


-- 4.2 Subquery with IN & EXISTS: Customers who have made bookings
-- Demonstration A: Using IN with an independent subquery
SELECT 
    user_id,
    full_name,
    email,
    phone
FROM users
WHERE user_id IN (
    SELECT DISTINCT user_id 
    FROM bookings
)
ORDER BY user_id ASC;

-- Demonstration B: Using correlated EXISTS subquery
-- Purpose: Proves equivalence between IN and EXISTS for semi-join operations.
SELECT 
    u.user_id,
    u.full_name,
    u.email,
    u.phone
FROM users u
WHERE EXISTS (
    SELECT 1 
    FROM bookings b 
    WHERE b.user_id = u.user_id
)
ORDER BY u.user_id ASC;


-- 4.3 Subquery with NOT IN & NOT EXISTS: Showtimes with no bookings
-- Demonstration A: Using NOT IN
-- Purpose: Identifies scheduled screenings that currently have 0 active reservations.
SELECT 
    s.showtime_id,
    m.title AS movie_title,
    t.name AS theater_name,
    sc.screen_name,
    s.show_date,
    s.start_time,
    s.ticket_price
FROM showtimes s
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
WHERE s.showtime_id NOT IN (
    SELECT DISTINCT showtime_id 
    FROM bookings 
    WHERE booking_status IN ('PENDING', 'CONFIRMED')
)
ORDER BY s.show_date ASC, s.start_time ASC;

-- Demonstration B: Using correlated NOT EXISTS
SELECT 
    s.showtime_id,
    m.title AS movie_title,
    s.show_date,
    s.start_time,
    s.ticket_price
FROM showtimes s
JOIN movies m ON s.movie_id = m.movie_id
WHERE NOT EXISTS (
    SELECT 1 
    FROM bookings b 
    WHERE b.showtime_id = s.showtime_id 
      AND b.booking_status IN ('PENDING', 'CONFIRMED')
)
ORDER BY s.show_date ASC, s.start_time ASC;


-- =====================================================================
-- SECTION 5: VIEWS
-- =====================================================================

-- 5.1 View 1: Movie Showtime Details (vw_movie_showtime_details)
-- Purpose: Encapsulates complex joins across movies, screens, theaters, and showtimes
--          into a virtual table for frontend schedule browsing.
CREATE OR REPLACE VIEW `vw_movie_showtime_details` AS
SELECT 
    s.showtime_id,
    m.movie_id,
    m.title AS movie_title,
    m.language,
    m.genre,
    m.duration_min,
    t.theater_id,
    t.name AS theater_name,
    t.city AS theater_city,
    sc.screen_id,
    sc.screen_name,
    sc.total_capacity,
    s.show_date,
    s.start_time,
    s.end_time,
    s.ticket_price,
    s.status AS showtime_status
FROM showtimes s
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id;

-- Querying View 1:
SELECT showtime_id, movie_title, theater_name, show_date, start_time, ticket_price
FROM vw_movie_showtime_details
WHERE show_date >= CURDATE() AND showtime_status = 'SCHEDULED'
ORDER BY show_date, start_time;


-- 5.2 View 2: Customer Booking Details (vw_customer_booking_details)
-- Purpose: Combines booking master records, customer details, seat list, and payments.
CREATE OR REPLACE VIEW `vw_customer_booking_details` AS
SELECT 
    b.booking_id,
    b.booking_ref,
    b.booking_date,
    b.booking_status,
    u.user_id,
    u.full_name AS customer_name,
    u.email AS customer_email,
    u.phone AS customer_phone,
    m.title AS movie_title,
    t.name AS theater_name,
    sc.screen_name,
    s.show_date,
    s.start_time,
    GROUP_CONCAT(CONCAT(st.row_label, st.seat_number) ORDER BY st.row_label, st.seat_number SEPARATOR ', ') AS reserved_seats,
    COUNT(bs.booking_seat_id) AS seats_count,
    b.total_amount,
    p.payment_id,
    p.transaction_ref,
    p.payment_method,
    p.payment_status
FROM bookings b
JOIN users u ON b.user_id = u.user_id
JOIN showtimes s ON b.showtime_id = s.showtime_id
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
LEFT JOIN seats st ON bs.seat_id = st.seat_id
LEFT JOIN payments p ON b.booking_id = p.booking_id
GROUP BY 
    b.booking_id, b.booking_ref, b.booking_date, b.booking_status,
    u.user_id, u.full_name, u.email, u.phone,
    m.title, t.name, sc.screen_name, s.show_date, s.start_time,
    b.total_amount, p.payment_id, p.transaction_ref, p.payment_method, p.payment_status;

-- Querying View 2:
SELECT booking_ref, customer_name, movie_title, theater_name, reserved_seats, total_amount, booking_status
FROM vw_customer_booking_details
ORDER BY booking_id ASC;


-- 5.3 View 3: Revenue Summary (vw_revenue_summary)
-- Purpose: Analytics view for management summarizing commercial metrics by film.
CREATE OR REPLACE VIEW `vw_revenue_summary` AS
SELECT 
    m.movie_id,
    m.title AS movie_title,
    m.language,
    COUNT(DISTINCT s.showtime_id) AS total_scheduled_shows,
    COUNT(DISTINCT b.booking_id) AS total_bookings,
    COUNT(bs.booking_seat_id) AS total_seats_sold,
    COALESCE(SUM(CASE WHEN p.payment_status = 'SUCCESS' THEN p.amount ELSE 0.00 END), 0.00) AS total_realized_revenue
FROM movies m
LEFT JOIN showtimes s ON m.movie_id = s.movie_id
LEFT JOIN bookings b ON s.showtime_id = b.showtime_id
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
LEFT JOIN payments p ON b.booking_id = p.booking_id
GROUP BY m.movie_id, m.title, m.language;

-- Querying View 3:
SELECT * FROM vw_revenue_summary ORDER BY total_realized_revenue DESC;


-- =====================================================================
-- SECTION 6: INDEXES & QUERY OPTIMIZATION
-- =====================================================================

-- Principles of Non-Redundant Indexing:
-- 1. Primary keys (`user_id`, `movie_id`, `booking_id`) automatically create clustered B-Tree indexes.
-- 2. UNIQUE constraints (`email`, `booking_ref`, `transaction_ref`) automatically create unique B-Tree indexes.
-- 3. We explicitly add non-clustered secondary indexes on frequently queried search filters:
--    - `movies(title)`: speeds up movie catalog text search.
--    - `showtimes(start_time)`: speeds up filtering screenings by time slots.
--    - `bookings(user_id)`: speeds up customer booking history lookup.
--    - `bookings(showtime_id)`: speeds up checking seat availability in transactions.

-- Safe procedure to create secondary index only if it does not already exist:
DROP PROCEDURE IF EXISTS `sp_add_index_if_not_exists`;

DELIMITER //

CREATE PROCEDURE `sp_add_index_if_not_exists`(
    IN p_table VARCHAR(64),
    IN p_index VARCHAR(64),
    IN p_column VARCHAR(64)
)
BEGIN
    DECLARE index_count INT;
    SELECT COUNT(1) INTO index_count 
    FROM INFORMATION_SCHEMA.STATISTICS 
    WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = p_table 
      AND INDEX_NAME = p_index;

    IF index_count = 0 THEN
        SET @sql = CONCAT('CREATE INDEX `', p_index, '` ON `', p_table, '` (`', p_column, '`)');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

DELIMITER ;

-- Create frequently searched secondary indexes:
CALL sp_add_index_if_not_exists('movies', 'idx_movies_title', 'title');
CALL sp_add_index_if_not_exists('showtimes', 'idx_showtimes_start_time', 'start_time');
CALL sp_add_index_if_not_exists('bookings', 'idx_bookings_user_id', 'user_id');
CALL sp_add_index_if_not_exists('bookings', 'idx_bookings_showtime_id', 'showtime_id');

DROP PROCEDURE IF EXISTS `sp_add_index_if_not_exists`;

-- Display all active indexes on `movies` and `bookings`:
SHOW INDEX FROM `movies`;
SHOW INDEX FROM `bookings`;

-- EXPLAIN Query Execution Plan: Demonstrates index usage on title search
EXPLAIN SELECT * FROM movies WHERE title = 'RRR';

-- EXPLAIN Query Execution Plan: Demonstrates index usage on customer booking lookup
EXPLAIN SELECT * FROM bookings WHERE user_id = 2;


-- =====================================================================
-- SECTION 7: STORED PROCEDURE
-- =====================================================================

-- Stored Procedure: sp_get_booking_details
-- Purpose: Encapsulates business logic on the database server to fetch full
--          booking information for a customer ticket receipt.
-- Parameters: IN p_booking_id INT UNSIGNED
DROP PROCEDURE IF EXISTS `sp_get_booking_details`;

DELIMITER //

CREATE PROCEDURE `sp_get_booking_details`(
    IN p_booking_id INT UNSIGNED
)
BEGIN
    -- Validate input parameter
    IF p_booking_id IS NULL OR p_booking_id <= 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Invalid Booking ID provided.';
    ELSE
        SELECT 
            b.booking_id,
            b.booking_ref,
            b.booking_date,
            b.booking_status,
            u.full_name AS customer_name,
            u.email AS customer_email,
            u.phone AS customer_phone,
            m.title AS movie_title,
            m.language AS movie_language,
            t.name AS theater_name,
            t.city AS theater_city,
            sc.screen_name,
            s.show_date,
            s.start_time,
            s.end_time,
            b.total_amount,
            GROUP_CONCAT(CONCAT(st.row_label, st.seat_number) ORDER BY st.row_label, st.seat_number SEPARATOR ', ') AS booked_seats,
            p.transaction_ref,
            p.payment_method,
            p.payment_status
        FROM bookings b
        JOIN users u ON b.user_id = u.user_id
        JOIN showtimes s ON b.showtime_id = s.showtime_id
        JOIN movies m ON s.movie_id = m.movie_id
        JOIN screens sc ON s.screen_id = sc.screen_id
        JOIN theaters t ON sc.theater_id = t.theater_id
        LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
        LEFT JOIN seats st ON bs.seat_id = st.seat_id
        LEFT JOIN payments p ON b.booking_id = p.booking_id
        WHERE b.booking_id = p_booking_id
        GROUP BY 
            b.booking_id, b.booking_ref, b.booking_date, b.booking_status,
            u.full_name, u.email, u.phone,
            m.title, m.language, t.name, t.city, sc.screen_name,
            s.show_date, s.start_time, s.end_time, b.total_amount,
            p.transaction_ref, p.payment_method, p.payment_status;
    END IF;
END //

DELIMITER ;

-- Calling the Stored Procedure for Booking ID 1 (John Doe's confirmed booking):
CALL sp_get_booking_details(1);


-- =====================================================================
-- SECTION 8: TRIGGER (DATABASE-SIDE AUDIT LOGGING)
-- =====================================================================

-- 8.1 Create Audit Table for Tracking Booking Status Transitions
CREATE TABLE IF NOT EXISTS `booking_status_audit` (
    `audit_id`       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `booking_id`     INT UNSIGNED NOT NULL,
    `old_status`     VARCHAR(20)  NOT NULL,
    `new_status`     VARCHAR(20)  NOT NULL,
    `changed_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `changed_by`     VARCHAR(50)  NOT NULL DEFAULT 'DATABASE_TRIGGER'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8.2 Create Trigger: trg_after_booking_status_update
-- Purpose: Automatically logs any status modification (e.g. PENDING -> CONFIRMED
--          or CONFIRMED -> CANCELLED) for auditability and compliance.
DROP TRIGGER IF EXISTS `trg_after_booking_status_update`;

DELIMITER //

CREATE TRIGGER `trg_after_booking_status_update`
AFTER UPDATE ON `bookings`
FOR EACH ROW
BEGIN
    IF OLD.booking_status <> NEW.booking_status THEN
        INSERT INTO `booking_status_audit` (`booking_id`, `old_status`, `new_status`, `changed_at`, `changed_by`)
        VALUES (NEW.booking_id, OLD.booking_status, NEW.booking_status, NOW(), USER());
    END IF;
END //

DELIMITER ;

-- 8.3 Demonstrating the Trigger:
-- Update booking 3 from 'PENDING' to 'CONFIRMED'
UPDATE `bookings` 
SET `booking_status` = 'CONFIRMED' 
WHERE `booking_id` = 3;

-- Inspect the audit log table to verify trigger captured the event:
SELECT * FROM `booking_status_audit`;

-- Reset booking 3 back to 'PENDING' (and observe second audit log row):
UPDATE `bookings` 
SET `booking_status` = 'PENDING' 
WHERE `booking_id` = 3;

SELECT * FROM `booking_status_audit`;


-- =====================================================================
-- SECTION 9: TRANSACTIONS (ACID PROPERTIES)
-- =====================================================================

-- 9.1 Transaction Demonstration A: Successful Booking Flow (COMMIT)
-- Atomicity: Either all inserts (booking, seats, payment) succeed or none do.
-- Consistency: Foreign key and check constraints are respected throughout.
-- Isolation: Row locking via SELECT ... FOR UPDATE prevents race conditions.
-- Durability: Once COMMIT is issued, data is permanently written to disk.

START TRANSACTION;

-- Step 1: Lock candidate seats to prevent concurrent booking race condition
SELECT seat_id, screen_id, row_label, seat_number, seat_type
FROM seats
WHERE screen_id = 1 AND seat_id IN (4, 5)
FOR UPDATE;

-- Step 2: Insert the master booking record
INSERT INTO bookings (booking_id, booking_ref, user_id, showtime_id, total_amount, booking_status, booking_date)
VALUES (101, 'BK-TXN-DEMO-001', 2, 1, 600.00, 'CONFIRMED', NOW());

-- Step 3: Insert the reserved seats
INSERT INTO booking_seats (booking_id, seat_id, price)
VALUES 
(101, 4, 300.00),
(101, 5, 300.00);

-- Step 4: Insert the successful payment record
INSERT INTO payments (booking_id, transaction_ref, payment_method, amount, payment_status, payment_date)
VALUES (101, 'TXN-DEMO-SUCCESS-999', 'UPI', 600.00, 'SUCCESS', NOW());

-- Step 5: Commit the entire unit of work
COMMIT;

-- Verify successful committed booking:
SELECT b.booking_id, b.booking_ref, b.booking_status, b.total_amount, p.transaction_ref, p.payment_status
FROM bookings b
JOIN payments p ON b.booking_id = p.booking_id
WHERE b.booking_id = 101;


-- 9.2 Transaction Demonstration B: Failed Booking Flow (ROLLBACK)
-- Purpose: Demonstrates how ROLLBACK cleanly restores the database to its
--          original state if any step encounters a failure (e.g. simulated payment decline).

START TRANSACTION;

-- Step 1: Insert an experimental booking
INSERT INTO bookings (booking_id, booking_ref, user_id, showtime_id, total_amount, booking_status, booking_date)
VALUES (102, 'BK-TXN-DEMO-FAIL', 3, 2, 500.00, 'PENDING', NOW());

-- Step 2: Reserve seat 6
INSERT INTO booking_seats (booking_id, seat_id, price)
VALUES (102, 6, 250.00);

-- Step 3: Simulate payment failure or seat conflict condition
-- In application logic, detecting payment decline or validation error triggers ROLLBACK:
ROLLBACK;

-- Verify that neither booking 102 nor its booking_seats exist (Atomicity preserved):
SELECT * FROM bookings WHERE booking_id = 102;
SELECT * FROM booking_seats WHERE booking_id = 102;

-- Cleanup demo booking 101 to keep original seed data clean:
DELETE FROM payments WHERE booking_id = 101;
DELETE FROM booking_seats WHERE booking_id = 101;
DELETE FROM bookings WHERE booking_id = 101;

-- Final state check:
SELECT 'Advanced DBMS demonstration completed successfully.' AS status_message;

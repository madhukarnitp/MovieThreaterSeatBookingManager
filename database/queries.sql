-- =====================================================================
-- Movie Theater Seat Booking & Showtime Manager
-- Demonstration SQL Queries for DBMS Laboratory Examination
-- 9 Core Relational Tables
-- =====================================================================

USE `movie_theater_db`;

-- ---------------------------------------------------------------------
-- Query 1: Movie Catalog with Showtime Counts (JOIN + GROUP BY)
-- Lists all movies with the count of scheduled screenings
-- ---------------------------------------------------------------------
SELECT 
    m.movie_id,
    m.title,
    m.genre,
    m.language,
    m.duration_min,
    m.release_date,
    COUNT(s.showtime_id) AS scheduled_showtimes_count
FROM movies m
LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'SCHEDULED'
GROUP BY m.movie_id, m.title, m.genre, m.language, m.duration_min, m.release_date
ORDER BY m.release_date DESC;

-- ---------------------------------------------------------------------
-- Query 2: Showtimes by Theater and Screen (Multi-table INNER JOIN)
-- Displays movie schedules with theater name, screen name, and ticket price
-- ---------------------------------------------------------------------
SELECT 
    t.name AS theater_name,
    t.city,
    sc.screen_name,
    m.title AS movie_title,
    s.show_date,
    s.start_time,
    s.end_time,
    s.ticket_price,
    s.status
FROM showtimes s
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
WHERE s.show_date >= CURDATE() AND s.status = 'SCHEDULED'
ORDER BY s.show_date ASC, s.start_time ASC;

-- ---------------------------------------------------------------------
-- Query 3: Real-Time Seat Availability for a Showtime (LEFT JOIN + Filter)
-- Finds seats in the screen and indicates if they are available or booked
-- (Demonstrated for showtime_id = 1)
-- ---------------------------------------------------------------------
SELECT 
    st.seat_id,
    st.row_label,
    st.seat_number,
    st.seat_type,
    sh.ticket_price,
    CASE 
        WHEN b.booking_id IS NOT NULL AND b.booking_status IN ('PENDING', 'CONFIRMED') THEN 'BOOKED'
        ELSE 'AVAILABLE'
    END AS seat_status
FROM showtimes sh
JOIN screens sc ON sh.screen_id = sc.screen_id
JOIN seats st ON sc.screen_id = st.screen_id
LEFT JOIN booking_seats bs ON st.seat_id = bs.seat_id
LEFT JOIN bookings b ON bs.booking_id = b.booking_id AND b.showtime_id = sh.showtime_id AND b.booking_status IN ('PENDING', 'CONFIRMED')
WHERE sh.showtime_id = 1
ORDER BY st.row_label ASC, st.seat_number ASC;

-- ---------------------------------------------------------------------
-- Query 4: Customer Booking Summary with Seats & Payment (Multiple JOINs)
-- Retrieves comprehensive booking details for customer profile
-- (Demonstrated for user_id = 2, John Doe)
-- ---------------------------------------------------------------------
SELECT 
    b.booking_ref,
    b.booking_date,
    b.booking_status,
    m.title AS movie_title,
    t.name AS theater_name,
    sc.screen_name,
    s.show_date,
    s.start_time,
    GROUP_CONCAT(CONCAT(st.row_label, st.seat_number) ORDER BY st.row_label, st.seat_number SEPARATOR ', ') AS reserved_seats,
    b.total_amount,
    p.payment_status,
    p.payment_method
FROM bookings b
JOIN users u ON b.user_id = u.user_id
JOIN showtimes s ON b.showtime_id = s.showtime_id
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
LEFT JOIN seats st ON bs.seat_id = st.seat_id
LEFT JOIN payments p ON b.booking_id = p.booking_id
WHERE u.user_id = 2
GROUP BY b.booking_id, b.booking_ref, b.booking_date, b.booking_status, m.title, t.name, sc.screen_name, s.show_date, s.start_time, b.total_amount, p.payment_status, p.payment_method;

-- ---------------------------------------------------------------------
-- Query 5: Revenue and Occupancy Report by Movie (Aggregation & HAVING)
-- Useful for Administrator Dashboard analytics
-- ---------------------------------------------------------------------
SELECT 
    m.title AS movie_title,
    COUNT(DISTINCT b.booking_id) AS total_confirmed_bookings,
    COUNT(bs.booking_seat_id) AS total_tickets_sold,
    COALESCE(SUM(p.amount), 0.00) AS total_revenue
FROM movies m
LEFT JOIN showtimes s ON m.movie_id = s.movie_id
LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.booking_status = 'CONFIRMED'
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.payment_status = 'SUCCESS'
GROUP BY m.movie_id, m.title
ORDER BY total_revenue DESC;

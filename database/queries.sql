-- =====================================================================
-- Movie Theater Seat Booking & Showtime Manager
-- Demonstration & Operational Queries (database/queries.sql)
-- =====================================================================

USE `movie_theater_db`;

-- ---------------------------------------------------------------------
-- 1. Movie Listing Query
-- Returns currently showing movies with genre tags, release date, runtime and show count
-- ---------------------------------------------------------------------
SELECT 
    m.movie_id,
    m.title,
    m.slug,
    m.certification,
    m.language,
    m.duration_min,
    m.release_date,
    m.status,
    COALESCE(GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', '), 'Uncategorized') AS genres,
    COUNT(DISTINCT s.showtime_id) AS active_showtimes_count
FROM movies m
LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
LEFT JOIN genres g ON mg.genre_id = g.genre_id
LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'scheduled'
WHERE m.status = 'now_showing'
GROUP BY m.movie_id, m.title, m.slug, m.certification, m.language, m.duration_min, m.release_date, m.status
ORDER BY m.release_date DESC;

-- ---------------------------------------------------------------------
-- 2. Movie Details Query
-- Returns single movie in-depth details including genre list and available formats
-- (Demonstrated for movie_id = 1, Inception)
-- ---------------------------------------------------------------------
SELECT 
    m.movie_id,
    m.title,
    m.slug,
    m.description,
    m.duration_min,
    m.language,
    m.certification,
    m.release_date,
    m.poster_path,
    m.trailer_url,
    m.status,
    GROUP_CONCAT(DISTINCT g.name ORDER BY g.name SEPARATOR ', ') AS genres,
    GROUP_CONCAT(DISTINCT s.format ORDER BY s.format SEPARATOR ', ') AS available_formats,
    MIN(s.base_price) AS min_ticket_price,
    MAX(s.base_price) AS max_ticket_price,
    COUNT(DISTINCT s.showtime_id) AS total_scheduled_shows
FROM movies m
LEFT JOIN movie_genres mg ON m.movie_id = mg.movie_id
LEFT JOIN genres g ON mg.genre_id = g.genre_id
LEFT JOIN showtimes s ON m.movie_id = s.movie_id AND s.status = 'scheduled'
WHERE m.movie_id = 1
GROUP BY m.movie_id;

-- ---------------------------------------------------------------------
-- 3. Showtimes by Theater Query
-- Returns scheduled showtimes grouped by theater, screen and movie
-- (Demonstrated for theater_id = 1, CineGrand Premiere)
-- ---------------------------------------------------------------------
SELECT 
    t.theater_id,
    t.name AS theater_name,
    t.city,
    sc.screen_id,
    sc.name AS screen_name,
    sc.screen_type,
    m.movie_id,
    m.title AS movie_title,
    m.certification,
    s.showtime_id,
    s.format,
    s.language,
    s.start_time,
    s.end_time,
    s.base_price,
    (SELECT COUNT(*) FROM showtime_seats ss WHERE ss.showtime_id = s.showtime_id AND ss.status = 'available') AS available_seats_count,
    sc.total_capacity
FROM showtimes s
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
JOIN movies m ON s.movie_id = m.movie_id
WHERE t.theater_id = 1 
  AND s.status = 'scheduled'
ORDER BY sc.name ASC, s.start_time ASC;

-- ---------------------------------------------------------------------
-- 4. Available Seats Query
-- Returns seat availability status and pricing for a specific showtime
-- (Demonstrated for showtime_id = 1)
-- ---------------------------------------------------------------------
SELECT 
    s.seat_id,
    s.row_label,
    s.seat_number,
    CONCAT(s.row_label, s.seat_number) AS seat_code,
    st.name AS seat_type,
    st.color_code,
    ss.price,
    ss.status AS availability_status,
    ss.held_until
FROM showtime_seats ss
JOIN seats s ON ss.seat_id = s.seat_id
JOIN seat_types st ON s.seat_type_id = st.seat_type_id
WHERE ss.showtime_id = 1
ORDER BY s.row_label ASC, s.seat_number ASC;

-- Summary matrix breakdown of seat availability for showtime_id = 1
SELECT 
    st.name AS seat_category,
    ss.price,
    COUNT(CASE WHEN ss.status = 'available' THEN 1 END) AS available_seats,
    COUNT(CASE WHEN ss.status = 'booked'    THEN 1 END) AS booked_seats,
    COUNT(CASE WHEN ss.status = 'held'      THEN 1 END) AS held_seats,
    COUNT(*) AS total_category_seats
FROM showtime_seats ss
JOIN seats s ON ss.seat_id = s.seat_id
JOIN seat_types st ON s.seat_type_id = st.seat_type_id
WHERE ss.showtime_id = 1
GROUP BY st.name, ss.price
ORDER BY ss.price ASC;

-- ---------------------------------------------------------------------
-- 5. Customer Booking History Query
-- Returns all bookings, tickets, seats and payment status for a customer
-- (Demonstrated for customer_id = 1, John Doe)
-- ---------------------------------------------------------------------
SELECT 
    b.booking_id,
    b.booking_ref,
    b.status AS booking_status,
    b.booked_at,
    m.title AS movie_title,
    m.certification,
    t.name AS theater_name,
    t.city,
    sc.name AS screen_name,
    sh.start_time,
    sh.format,
    GROUP_CONCAT(DISTINCT CONCAT(s.row_label, s.seat_number) ORDER BY s.row_label, s.seat_number SEPARATOR ', ') AS reserved_seats,
    COUNT(DISTINCT bs.booking_seat_id) AS seats_booked,
    b.total_amount,
    p.payment_method,
    p.transaction_ref,
    p.status AS payment_status
FROM bookings b
JOIN showtimes sh ON b.showtime_id = sh.showtime_id
JOIN movies m ON sh.movie_id = m.movie_id
JOIN screens sc ON sh.screen_id = sc.screen_id
JOIN theaters t ON sc.theater_id = t.theater_id
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
LEFT JOIN seats s ON bs.seat_id = s.seat_id
LEFT JOIN payments p ON b.booking_id = p.booking_id AND p.status = 'success'
WHERE b.customer_id = 1
GROUP BY b.booking_id, b.booking_ref, b.status, b.booked_at, m.title, m.certification,
         t.name, t.city, sc.name, sh.start_time, sh.format, b.total_amount,
         p.payment_method, p.transaction_ref, p.status
ORDER BY b.booked_at DESC;

-- ---------------------------------------------------------------------
-- 6. Total Theater Revenue Query
-- Calculates gross receipts, refunds, and net revenue grouped by theater and screen
-- ---------------------------------------------------------------------
SELECT 
    t.theater_id,
    t.name AS theater_name,
    t.city,
    sc.screen_id,
    sc.name AS screen_name,
    COUNT(DISTINCT b.booking_id) AS total_bookings,
    COUNT(DISTINCT bs.booking_seat_id) AS tickets_sold,
    COALESCE(SUM(DISTINCT CASE WHEN p.status = 'success' THEN p.amount ELSE 0 END), 0.00) AS gross_revenue,
    COALESCE(SUM(DISTINCT CASE WHEN r.status = 'processed' THEN r.amount ELSE 0 END), 0.00) AS total_refunded,
    COALESCE(SUM(DISTINCT CASE WHEN p.status = 'success' THEN p.amount ELSE 0 END), 0.00) -
    COALESCE(SUM(DISTINCT CASE WHEN r.status = 'processed' THEN r.amount ELSE 0 END), 0.00) AS net_revenue
FROM theaters t
JOIN screens sc ON t.theater_id = sc.theater_id
LEFT JOIN showtimes s ON sc.screen_id = s.screen_id
LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.status IN ('confirmed', 'cancelled', 'refunded')
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
LEFT JOIN payments p ON b.booking_id = p.booking_id
LEFT JOIN refunds r ON b.booking_id = r.booking_id
GROUP BY t.theater_id, t.name, t.city, sc.screen_id, sc.name
ORDER BY t.theater_id, sc.screen_id;

-- ---------------------------------------------------------------------
-- 7. Most Popular Movies Query
-- Ranks movies by tickets sold, confirmed booking count and gross ticket sales
-- ---------------------------------------------------------------------
SELECT 
    m.movie_id,
    m.title,
    m.language,
    m.certification,
    COUNT(DISTINCT b.booking_id) AS total_confirmed_bookings,
    COUNT(DISTINCT bs.booking_seat_id) AS total_tickets_sold,
    COALESCE(SUM(bs.price_paid), 0.00) AS total_box_office_gross
FROM movies m
LEFT JOIN showtimes s ON m.movie_id = s.movie_id
LEFT JOIN bookings b ON s.showtime_id = b.showtime_id AND b.status = 'confirmed'
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
GROUP BY m.movie_id, m.title, m.language, m.certification
ORDER BY total_tickets_sold DESC, total_box_office_gross DESC;

-- ---------------------------------------------------------------------
-- 8. Daily Booking Statistics Query
-- Aggregates daily booking volume, confirmed/cancelled counts, gross revenue and ticket count
-- ---------------------------------------------------------------------
SELECT 
    DATE(b.booked_at) AS booking_date,
    COUNT(b.booking_id) AS total_bookings_initiated,
    COUNT(CASE WHEN b.status = 'confirmed' THEN 1 END) AS confirmed_bookings,
    COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS cancelled_bookings,
    COUNT(DISTINCT bs.booking_seat_id) AS total_seats_selected,
    COALESCE(SUM(CASE WHEN b.status = 'confirmed' THEN b.total_amount ELSE 0.00 END), 0.00) AS confirmed_sales_amount,
    ROUND(
        (COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) / COUNT(b.booking_id)) * 100, 2
    ) AS cancellation_rate_percentage
FROM bookings b
LEFT JOIN booking_seats bs ON b.booking_id = bs.booking_id
GROUP BY DATE(b.booked_at)
ORDER BY booking_date DESC;

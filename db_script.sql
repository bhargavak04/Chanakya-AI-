-- ===========================
-- DROP IF EXISTS (clean slate)
-- ===========================

DROP TABLE IF EXISTS refunds CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS membership_payments CASCADE;
DROP TABLE IF EXISTS membership_plans CASCADE;
DROP TABLE IF EXISTS tournament_registrations CASCADE;
DROP TABLE IF EXISTS tournaments CASCADE;
DROP TABLE IF EXISTS members CASCADE;
DROP TABLE IF EXISTS venues CASCADE;

-- ===========================
-- CREATE TABLES
-- ===========================

CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    city TEXT,
    sport_type TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES venues(id),
    name TEXT,
    phone TEXT,
    email TEXT,
    join_date TIMESTAMP,
    status TEXT
);

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES venues(id),
    member_id UUID REFERENCES members(id),
    court_name TEXT,
    booking_date TIMESTAMP,
    amount NUMERIC,
    status TEXT
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id),
    amount NUMERIC,
    payment_mode TEXT,
    status TEXT,
    paid_at TIMESTAMP
);

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id),
    refund_amount NUMERIC,
    refund_date TIMESTAMP
);

CREATE TABLE membership_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES venues(id),
    name TEXT,
    price NUMERIC,
    duration_months INT
);

CREATE TABLE membership_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES members(id),
    plan_id UUID REFERENCES membership_plans(id),
    amount NUMERIC,
    status TEXT,
    due_date TIMESTAMP,
    paid_at TIMESTAMP
);

CREATE TABLE tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID REFERENCES venues(id),
    name TEXT,
    sport_type TEXT,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    entry_fee NUMERIC
);

CREATE TABLE tournament_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID REFERENCES tournaments(id),
    member_id UUID REFERENCES members(id),
    payment_status TEXT
);

-- ===========================
-- INSERT VENUES
-- ===========================

INSERT INTO venues (name, city, sport_type)
SELECT
    'Venue ' || gs,
    (ARRAY['Bangalore','Mumbai','Hyderabad','Delhi','Chennai'])[floor(random()*5+1)],
    (ARRAY['Badminton','Football','Tennis','Cricket'])[floor(random()*4+1)]
FROM generate_series(1,5) gs;

-- ===========================
-- INSERT MEMBERS
-- ===========================

INSERT INTO members (venue_id, name, phone, email, join_date, status)
SELECT
    (SELECT id FROM venues ORDER BY random() LIMIT 1),
    'Member ' || gs,
    '9' || floor(random()*1000000000)::text,
    'member' || gs || '@email.com',
    NOW() - (random()*365 || ' days')::interval,
    (ARRAY['active','inactive'])[floor(random()*2+1)]
FROM generate_series(1,500) gs;

-- ===========================
-- INSERT MEMBERSHIP PLANS
-- ===========================

INSERT INTO membership_plans (venue_id, name, price, duration_months)
SELECT
    id,
    'Gold Plan',
    floor(random()*5000 + 3000),
    (ARRAY[3,6,12])[floor(random()*3+1)]
FROM venues;

-- ===========================
-- INSERT BOOKINGS
-- ===========================

INSERT INTO bookings (venue_id, member_id, court_name, booking_date, amount, status)
SELECT
    m.venue_id,
    m.id,
    'Court ' || floor(random()*5+1),
    NOW() - (random()*60 || ' days')::interval,
    floor(random()*3000 + 500),
    (ARRAY['complete','cancelled','partially_paid'])[floor(random()*3+1)]
FROM members m
ORDER BY random()
LIMIT 1500;

-- ===========================
-- INSERT PAYMENTS
-- ===========================

INSERT INTO payments (booking_id, amount, payment_mode, status, paid_at)
SELECT
    b.id,
    b.amount * (CASE WHEN b.status='partially_paid' THEN 0.5 ELSE 1 END),
    (ARRAY['online','offline'])[floor(random()*2+1)],
    'success',
    b.booking_date + interval '1 hour'
FROM bookings b
WHERE b.status IN ('complete','partially_paid')
LIMIT 1200;

-- ===========================
-- INSERT REFUNDS
-- ===========================

INSERT INTO refunds (booking_id, refund_amount, refund_date)
SELECT
    b.id,
    b.amount,
    NOW() - interval '1 day'
FROM bookings b
WHERE b.status='cancelled'
LIMIT 100;

-- ===========================
-- INSERT MEMBERSHIP PAYMENTS
-- ===========================

INSERT INTO membership_payments (member_id, plan_id, amount, status, due_date, paid_at)
SELECT
    m.id,
    (SELECT id FROM membership_plans ORDER BY random() LIMIT 1),
    floor(random()*8000 + 3000),
    (ARRAY['paid','pending','overdue'])[floor(random()*3+1)],
    NOW() - (random()*90 || ' days')::interval,
    CASE WHEN random()>0.3 THEN NOW() - (random()*60 || ' days')::interval ELSE NULL END
FROM members m
LIMIT 400;

-- ===========================
-- INSERT TOURNAMENTS
-- ===========================

INSERT INTO tournaments (venue_id, name, sport_type, start_date, end_date, entry_fee)
SELECT
    id,
    'Tournament ' || row_number() OVER(),
    sport_type,
    NOW() - (random()*120 || ' days')::interval,
    NOW() - (random()*110 || ' days')::interval,
    floor(random()*3000 + 500)
FROM venues
CROSS JOIN generate_series(1,10);

-- ===========================
-- INSERT TOURNAMENT REGISTRATIONS
-- ===========================

INSERT INTO tournament_registrations (tournament_id, member_id, payment_status)
SELECT
    (SELECT id FROM tournaments ORDER BY random() LIMIT 1),
    (SELECT id FROM members ORDER BY random() LIMIT 1),
    (ARRAY['paid','pending'])[floor(random()*2+1)]
FROM generate_series(1,600);
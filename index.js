const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(helmet());
app.use(express.json());
app.use(cors());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Initialize DB table
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      customer_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      license_plate VARCHAR(20) NOT NULL,
      car_brand VARCHAR(50),
      service_type VARCHAR(100) NOT NULL,
      problem_description TEXT,
      booking_date DATE NOT NULL,
      booking_time VARCHAR(10) NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Database initialized');
}

// ─── Routes ───────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Get all bookings (admin)
app.get('/api/bookings', async (req, res) => {
  try {
    const { date } = req.query;
    let query = 'SELECT * FROM bookings ORDER BY booking_date, booking_time';
    let params = [];
    if (date) {
      query = 'SELECT * FROM bookings WHERE booking_date = $1 ORDER BY booking_time';
      params = [date];
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available time slots for a date
app.get('/api/slots', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'date required' });

    const allSlots = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];
    const booked = await pool.query(
      "SELECT booking_time FROM bookings WHERE booking_date = $1 AND status != 'cancelled'",
      [date]
    );
    const bookedTimes = booked.rows.map(r => r.booking_time);
    const available = allSlots.map(t => ({ time: t, available: !bookedTimes.includes(t) }));
    res.json(available);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create booking
app.post('/api/bookings', async (req, res) => {
  try {
    const { customer_name, phone, license_plate, car_brand, service_type, problem_description, booking_date, booking_time } = req.body;

    // Check slot availability
    const exists = await pool.query(
      "SELECT id FROM bookings WHERE booking_date=$1 AND booking_time=$2 AND status != 'cancelled'",
      [booking_date, booking_time]
    );
    if (exists.rows.length > 0) return res.status(409).json({ error: 'เวลานี้ถูกจองแล้ว กรุณาเลือกเวลาอื่น' });

    const result = await pool.query(
      `INSERT INTO bookings (customer_name, phone, license_plate, car_brand, service_type, problem_description, booking_date, booking_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [customer_name, phone, license_plate, car_brand, service_type, problem_description, booking_date, booking_time]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update booking status
app.patch('/api/bookings/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const result = await pool.query(
      'UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start
initDB().then(() => {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
});

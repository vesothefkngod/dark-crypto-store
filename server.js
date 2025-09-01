// server.js
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// OxaPay API
const OXAPAY_API_KEY = process.env.OXAPAY_API_KEY || 'FGUKRJ-99OGIU-GJUEAB-SO5IM7';
const OXAPAY_API_URL = 'https://api.oxapay.com/merchant/invoice';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Database setup
const db = new sqlite3.Database('store.sqlite');
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// 🔐 Регистрация на потребител (примерен маршрут)
app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  db.run(
    `INSERT INTO users (username, password, email) VALUES (?, ?, ?)`,
    [username, hashedPassword, email],
    function (err) {
      if (err) return res.status(500).json({ error: 'Грешка при регистрация' });
      res.json({ success: true, user_id: this.lastID });
    }
  );
});

// 💸 Създаване на OxaPay фактура
app.post('/pay', async (req, res) => {
  const { amount, currency, order_id } = req.body;

  try {
    const response = await axios.post(OXAPAY_API_URL, {
      amount,
      currency,
      order_id,
      callback_url: 'https://dark-crypto-store.onrender.com/callback',
      success_url: 'https://dark-crypto-store.onrender.com/success',
      cancel_url: 'https://dark-crypto-store.onrender.com/cancel'
    }, {
      headers: {
        Authorization: `Bearer ${OXAPAY_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ payment_url: response.data.payment_url });
  } catch (error) {
    console.error('OxaPay error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Неуспешно създаване на плащане' });
  }
});

// 🔄 Callback от OxaPay
app.post('/callback', (req, res) => {
  const { order_id, status, txid } = req.body;

  console.log(`Поръчка ${order_id} има статус: ${status}, TXID: ${txid}`);
  // Тук можеш да добавиш логика за обновяване на база данни

  res.sendStatus(200);
});

// 🏁 Старт на сървъра
app.listen(port, () => {
  console.log(`Сървърът работи на http://localhost:${port}`);
});

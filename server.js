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

// Платежна конфигурация само за WolvPay
const CRYPTO_CONFIG = {
  wolvpay: {
    merchantKey: 'wlov_live_70b44b3fb1bc51c5f3c2f4757904e7e3',
    webhookSecret: 'd3787bd178d9c2e0f65ba61d4a1b28c6339142e2cd480552919bca40c32ae5ec',
    apiUrl: 'https://api.wolvpay.com'
  }
};

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Инициализация на базата данни
const db = new sqlite3.Database('store.sqlite');
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image TEXT,
      stock INTEGER DEFAULT 100
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      product_id INTEGER,
      quantity INTEGER DEFAULT 1,
      total_amount REAL NOT NULL,
      payment_provider TEXT DEFAULT 'wolvpay',
      payment_status TEXT DEFAULT 'pending',
      payment_id TEXT,
      crypto_address TEXT,
      crypto_amount TEXT,
      tx_hash TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);
});

// Сесии за потребители и плащания
const sessions = {};
const paymentSessions = new Map();

function requireAuth(req, res, next) {
  const sid = req.cookies.sessionId;
  if (sid && sessions[sid]) {
    req.user = sessions[sid];
    return next();
  }
  res.redirect('/login');
}

// Маркиране на плащането като създадено
function logPaymentEvent(orderId, eventType, data) {
  db.run(
    `INSERT INTO payment_logs (order_id, provider, event_type, data)
     VALUES (?, 'wolvpay', ?, ?)`,
    [orderId, eventType, JSON.stringify(data)],
    err => { if (err) console.error('Log error:', err); }
  );
}

// РЕНДЕР Публични страници
app.get('/', (req, res) => {
  db.all(`SELECT * FROM products WHERE stock > 0`, [], (err, products) => {
    res.render('index', { products, user: sessions[req.cookies.sessionId] });
  });
});

// Регистрация и вход
app.get('/register', (req, res) => res.render('register', { error: null }));
app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password || password.length < 6) {
    return res.render('register', { error: 'Невалидни данни' });
  }
  const hash = await bcrypt.hash(password, 10);
  db.run(
    `INSERT INTO users (username, password, email) VALUES (?, ?, ?)`,
    [username, hash, email],
    err => {
      if (err) return res.render('register', { error: 'Потребителят съществува' });
      res.redirect('/login');
    }
  );
});

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.render('login', { error: 'Грешни данни' });
    }
    const sessionId = crypto.randomBytes(16).toString('hex');
    sessions[sessionId] = user;
    res.cookie('sessionId', sessionId, { httpOnly: true });
    res.redirect('/');
  });
});

// Buy маршрут с WolvPay
app.post('/buy/:productId', requireAuth, (req, res) => {
  const userId = req.user.id;
  const productId = parseInt(req.params.productId);
  const quantity = parseInt(req.body.quantity) || 1;

  db.get(
    `SELECT * FROM products WHERE id = ? AND stock >= ?`,
    [productId, quantity],
    async (err, product) => {
      if (err || !product) {
        return res.status(400).json({ error: 'Продуктът не е наличен' });
      }

      const total = product.price * quantity;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      // Създаване на поръчка
      db.run(
        `INSERT INTO orders
         (user_id, product_id, quantity, total_amount, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, productId, quantity, total, expiresAt.toISOString()],
        async function (err) {
          if (err) return res.status(500).json({ error: 'Неуспешна поръчка' });

          const orderId = this.lastID;
          try {
            // Създай фактура в WolvPay
            const invoice = await createWolvPayPayment(
              orderId,
              total,
              'USD',
              product.name,
              req
            );

            // Обнови поръчката и наличности
            db.run(
              `UPDATE orders
               SET payment_id = ?, crypto_address = ?, crypto_amount = ?
               WHERE id = ?`,
              [invoice.paymentId, invoice.address, invoice.cryptoAmount, orderId]
            );
            db.run(
              `UPDATE products SET stock = stock - ? WHERE id = ?`,
              [quantity, productId]
            );

            paymentSessions.set(invoice.paymentId, { orderId, expiresAt });
            logPaymentEvent(orderId, 'created', invoice);

            res.json({
              success: true,
              paymentId: invoice.paymentId,
              paymentUrl: invoice.paymentUrl,
              address: invoice.address,
              cryptoAmount: invoice.cryptoAmount,
              qrCode: invoice.qrCode,
              expiresAt: expiresAt.toISOString()
            });
          } catch (e) {
            return res.status(500).json({ error: e.message });
          }
        }
      );
    }
  );
});

// Функция за създаване на фактура в WolvPay
async function createWolvPayPayment(orderId, amount, currency, productName, req) {
  const data = {
    merchant: CRYPTO_CONFIG.wolvpay.merchantKey,
    invoiceValue: amount,
    currency,
    description: `Order #${orderId} - ${productName}`,
    callbackUrl: `${req.protocol}://${req.get('host')}/webhook/wolvpay`,
    returnUrl: `${req.protocol}://${req.get('host')}/payment-success?order=${orderId}`,
    lifetime: 30
  };

  const resp = await axios.post(
    `${CRYPTO_CONFIG.wolvpay.apiUrl}/invoice`,
    data
  );

  // Примерно поле, настрой според документацията
  const inv = resp.data;
  return {
    paymentId: inv.invoiceId,
    paymentUrl: inv.paymentUrl,
    address: inv.address,
    cryptoAmount: inv.cryptoAmount,
    qrCode: inv.qrCode
  };
}

// Webhook за WolvPay
app.post('/webhook/wolvpay', (req, res) => {
  const sig = req.headers['x-wolvpay-signature'];
  const expected = crypto
    .createHmac('sha256', CRYPTO_CONFIG.wolvpay.webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (sig !== expected) {
    return res.status(401).send('Invalid signature');
  }

  const { invoice_id, status, txID } = req.body;

  if (status.toLowerCase() === 'completed') {
    db.run(
      `UPDATE orders
       SET payment_status = 'completed',
           tx_hash = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE payment_id = ?`,
      [txID, invoice_id]
    );
    logPaymentEvent(invoice_id, 'completed', req.body);
  }

  res.json({ success: true });
});

// Страница след успешно плащане
app.get('/payment-success', (req, res) => {
  const orderId = req.query.order;
  db.get(
    `SELECT o.*, p.name AS product_name, u.username
     FROM orders o
     JOIN products p ON o.product_id = p.id
     JOIN users u ON o.user_id = u.id
     WHERE o.id = ?`,
    [orderId],
    (err, order) => {
      res.render('success', { order });
    }
  );
});

// Стартиране на сървъра
app.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`);

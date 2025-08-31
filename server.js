// server.js

const express      = require('express');
const sqlite3      = require('sqlite3').verbose();
const path         = require('path');
const crypto       = require('crypto');
const axios        = require('axios');
const bcrypt       = require('bcrypt');
const cookieParser = require('cookie-parser');
const cors         = require('cors');

const app  = express();
const port = process.env.PORT || 3000;

// Сесии в памет
const sessions = {};

// Конфигурации за WolvPay (от ENV)
const CRYPTO_CONFIG = {
  wolvpay: {
    apiUrl        : process.env.WOLVPAY_API_URL,
    merchantKey   : process.env.WOLVPAY_MERCHANT_KEY,
    webhookSecret : process.env.WOLVPAY_WEBHOOK_SECRET
  }
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Инициализация на SQLite база
const db = new sqlite3.Database(path.join(__dirname, 'store.sqlite'));
db.serialize(() => {
  // Потребители
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      username          TEXT    UNIQUE NOT NULL,
      password_hash     TEXT    NOT NULL,
      telegram_username TEXT
    )
  `);

  // Продукти
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      price       REAL    NOT NULL,
      image       TEXT,
      stock       INTEGER DEFAULT 0
    )
  `);

  // Поръчки
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER,
      product_id       INTEGER,
      quantity         INTEGER DEFAULT 1,
      total_amount     REAL    NOT NULL,
      payment_provider TEXT    DEFAULT 'wolvpay',
      payment_status   TEXT    DEFAULT 'pending',
      payment_id       TEXT,
      crypto_address   TEXT,
      crypto_amount    TEXT,
      tx_hash          TEXT,
      expires_at       DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id)    REFERENCES users(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

  // Логове на плащания
  db.run(`
    CREATE TABLE IF NOT EXISTS payment_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER,
      provider   TEXT,
      event_type TEXT,
      data       TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Проверка за логнат потребител
function requireAuth(req, res, next) {
  const sid = req.cookies.sessionId;
  if (sid && sessions[sid]) {
    req.user = sessions[sid];
    return next();
  }
  res.redirect('/login');
}

// Лог на webhook събития
function logPaymentEvent(orderId, eventType, data) {
  db.run(
    `INSERT INTO payment_logs (order_id, provider, event_type, data)
     VALUES (?, 'wolvpay', ?, ?)`,
    [orderId, eventType, JSON.stringify(data)],
    err => { if (err) console.error('Log error:', err); }
  );
}

// Създаване на фактура в WolvPay
async function createWolvPayInvoice(orderId, amount, currency, description, req) {
  const payload = {
    merchant:     CRYPTO_CONFIG.wolvpay.merchantKey,
    invoiceValue: amount,
    currency,
    description,
    callbackUrl:  `${req.protocol}://${req.get('host')}/webhook/wolvpay`,
    returnUrl:    `${req.protocol}://${req.get('host')}/payment-success?order=${orderId}`,
    lifetime:     30
  };

  const resp = await axios.post(
    `${CRYPTO_CONFIG.wolvpay.apiUrl}/invoice`,
    payload
  );
  const inv = resp.data;

  return {
    paymentId:    inv.invoiceId,
    paymentUrl:   inv.paymentUrl,
    address:      inv.address,
    cryptoAmount: inv.cryptoAmount,
    qrCode:       inv.qrCode
  };
}

// — Routes —

// Главна страница (списък продукти)
app.get('/', (req, res) => {
  db.all(`SELECT * FROM products WHERE stock > 0`, [], (err, products) => {
    if (err) {
      console.error('DB Error:', err);
      return res.status(500).send('Database error');
    }
    res.render('index', {
      products,
      user: sessions[req.cookies.sessionId] || null
    });
  });
});

// Регистрация — форма
app.get('/register', (req, res) => {
  res.render('register', {
    error   : null,
    success : false,
    values  : {}
  });
});

// Регистрация — submit
app.post('/register', async (req, res) => {
  const { username, telegram, password, repeatPassword } = req.body;
  let error = null;

  if (!username || !password || !repeatPassword) {
    error = 'Всички полета освен Telegram са задължителни';
  } else if (password !== repeatPassword) {
    error = 'Паролите не съвпадат';
  }

  if (error) {
    return res.status(400).render('register', {
      error,
      success: false,
      values : { username, telegram }
    });
  }

  // Проверка за съществуващ потребител
  db.get(
    `SELECT id FROM users WHERE username = ?`,
    [username],
    async (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Server error');
      }
      if (row) {
        return res.status(400).render('register', {
          error  : 'Потребителското име вече съществува',
          success: false,
          values : { username, telegram }
        });
      }

      // Хешираме паролата и записваме
      const hash = await bcrypt.hash(password, 10);
      db.run(
        `INSERT INTO users (username, password_hash, telegram_username)
         VALUES (?, ?, ?)`,
        [username, hash, telegram || null],
        err => {
          if (err) {
            console.error(err);
            return res.status(500).send('Server error');
          }
          res.redirect('/login?registered=1');
        }
      );
    }
  );
});

// Вход — форма
app.get('/login', (req, res) => {
  res.render('login', {
    error  : null,
    success: req.query.registered === '1'
  });
});

// Вход — submit
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).render('login', {
      error  : 'Потребителско име и парола са задължителни',
      success: false
    });
  }

  db.get(
    `SELECT id, password_hash FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Server error');
      }
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(400).render('login', {
          error  : 'Невалидни данни',
          success: false
        });
      }
      // Успешен login
      const sessionId = crypto.randomBytes(16).toString('hex');
      sessions[sessionId] = { id: user.id, username };
      res.cookie('sessionId', sessionId, { httpOnly: true });
      res.redirect('/');
    }
  );
});

// Изход
app.get('/logout', (req, res) => {
  const sid = req.cookies.sessionId;
  if (sid) {
    delete sessions[sid];
    res.clearCookie('sessionId');
  }
  res.redirect('/');
});

// Buy — създава поръчка и пренасочва към WolvPay
app.post('/buy/:productId', requireAuth, async (req, res) => {
  const userId    = req.user.id;
  const productId = parseInt(req.params.productId, 10);
  const quantity  = Math.max(1, parseInt(req.body.quantity, 10) || 1);

  db.get(
    `SELECT * FROM products WHERE id = ? AND stock >= ?`,
    [productId, quantity],
    async (err, product) => {
      if (err || !product) {
        return res.status(400).send('Продуктът не е наличен');
      }

      const total     = product.price * quantity;
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      // Записваме поръчката
      db.run(
        `INSERT INTO orders
           (user_id, product_id, quantity, total_amount, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, productId, quantity, total, expiresAt],
        async function (err) {
          if (err) {
            console.error(err);
            return res.status(500).send('Неуспешна поръчка');
          }
          const orderId = this.lastID;

          try {
            const invoice = await createWolvPayInvoice(
              orderId,
              total,
              'USD',
              `Поръчка #${orderId} – ${product.name}`,
              req
            );

            // Обновяваме поръчката с детайли
            db.run(
              `UPDATE orders
                 SET payment_id    = ?,
                     crypto_address = ?,
                     crypto_amount  = ?
               WHERE id = ?`,
              [
                invoice.paymentId,
                invoice.address,
                invoice.cryptoAmount,
                orderId
              ]
            );

            // Намаляваме наличност
            db.run(
              `UPDATE products SET stock = stock - ? WHERE id = ?`,
              [quantity, productId]
            );

            logPaymentEvent(orderId, 'created', invoice);

            // Пренасочване към paymentUrl
            res.redirect(invoice.paymentUrl);
          } catch (e) {
            console.error('WolvPay error:', e);
            res.status(500).send('Грешка при създаване на фактура');
          }
        }
      );
    }
  );
});

// Webhook от WolvPay
app.post('/webhook/wolvpay', express.json(), (req, res) => {
  const sig      = req.headers['x-wolvpay-signature'] || '';
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
             tx_hash        = ?,
             updated_at     = CURRENT_TIMESTAMP
       WHERE payment_id = ?`,
      [txID, invoice_id]
    );
    logPaymentEvent(invoice_id, 'completed', req.body);
  }
  res.json({ success: true });
});

// Страница след успешно плащане
app.get('/payment-success', requireAuth, (req, res) => {
  const orderId = parseInt(req.query.order, 10);
  db.get(
    `SELECT o.*, p.name AS product_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
      WHERE o.id = ? AND o.user_id = ?`,
    [orderId, req.user.id],
    (err, order) => {
      if (err || !order) {
        return res.status(404).send('Поръчката не е намерена');
      }
      res.render('success', { order });
    }
  );
});

// 404 & Error handlers
app.use((req, res) => res.status(404).render('404', { url: req.originalUrl }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Server error');
});

// Стартиране на сървъра
app.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`);
});

// server.js

// 0. Зареждаме .env променливите
require('dotenv').config()

// 1. Импорти
const express       = require('express')
const sqlite3       = require('sqlite3').verbose()
const path          = require('path')
const crypto        = require('crypto')
const axios         = require('axios')
const bcrypt        = require('bcrypt')
const cookieParser  = require('cookie-parser')
const cors          = require('cors')

const app  = express()
const port = process.env.PORT || 3000

// 2. Конфигурация на крипто плащания (WolvPay)
const CRYPTO_CONFIG = {
  wolvpay: {
    apiUrl        : process.env.WOLVPAY_API_URL,
    merchantKey   : process.env.WOLVPAY_MERCHANT_KEY,
    webhookSecret : process.env.WOLVPAY_WEBHOOK_SECRET,
  },
}

// 3. Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))
app.set('view engine', 'ejs')

// 4. SQLite & схеми
const db = new sqlite3.Database(path.join(__dirname, 'store.sqlite'))
db.serialize(() => {
  // users: махаме email, добавяме telegram_username
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      username          TEXT    UNIQUE NOT NULL,
      password          TEXT    NOT NULL,
      telegram_username TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      price       REAL    NOT NULL,
      image       TEXT,
      stock       INTEGER DEFAULT 0
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER,
      product_id     INTEGER,
      quantity       INTEGER DEFAULT 1,
      total_amount   REAL    NOT NULL,
      payment_provider TEXT  DEFAULT 'wolvpay',
      payment_status   TEXT  DEFAULT 'pending',
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
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS payment_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER,
      provider   TEXT,
      event_type TEXT,
      data       TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
})

// 5. Всяка сесия идва от тук
const sessions = {}
function requireAuth(req, res, next) {
  const sid = req.cookies.sessionId
  if (sid && sessions[sid]) {
    req.user = sessions[sid]
    return next()
  }
  res.redirect('/login')
}

// 6. Helpers за плащане
function logPaymentEvent(orderId, eventType, data) {
  db.run(
    `INSERT INTO payment_logs (order_id, provider, event_type, data)
     VALUES (?, 'wolvpay', ?, ?)`,
    [orderId, eventType, JSON.stringify(data)],
    err => { if (err) console.error('Log error:', err) }
  )
}

async function createWolvPayInvoice(orderId, amount, currency, description, req) {
  const payload = {
    merchant    : CRYPTO_CONFIG.wolvpay.merchantKey,
    invoiceValue: amount,
    currency,
    description,
    callbackUrl : `${req.protocol}://${req.get('host')}/webhook/wolvpay`,
    returnUrl   : `${req.protocol}://${req.get('host')}/payment-success?order=${orderId}`,
    lifetime    : 30
  }

  const resp = await axios.post(
    `${CRYPTO_CONFIG.wolvpay.apiUrl}/invoice`,
    payload
  )
  const inv = resp.data
  return {
    paymentId   : inv.invoiceId,
    paymentUrl  : inv.paymentUrl,
    address     : inv.address,
    cryptoAmount: inv.cryptoAmount,
    qrCode      : inv.qrCode
  }
}

// 7. Рути

// 7.1. Списък продукти
app.get('/', (req, res) => {
  db.all(`SELECT * FROM products WHERE stock > 0`, [], (err, products) => {
    if (err) {
      console.error('DB Error:', err)
      return res.status(500).send('Database error')
    }
    res.render('index', {
      products,
      user: sessions[req.cookies.sessionId] || null
    })
  })
})

// 7.2. Регистрация
app.get('/register', (req, res) => {
  res.render('register', {
    error           : null,
    values          : {},
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
  })
})

app.post('/register', async (req, res) => {
  const {
    username,
    telegram,            // optional
    password,
    repeatPassword,
    'g-recaptcha-response': captcha
  } = req.body

  // валидация полета
  if (!username || !password || !repeatPassword) {
    return res.render('register', {
      error           : 'Всички полета (без Telegram) са задължителни',
      values          : { username, telegram },
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
    })
  }
  if (password !== repeatPassword) {
    return res.render('register', {
      error           : 'Паролите не съвпадат',
      values          : { username, telegram },
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
    })
  }
  if (!captcha) {
    return res.render('register', {
      error           : 'Маркирай "Не съм робот"',
      values          : { username, telegram },
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
    })
  }

  // reCAPTCHA валидация
  try {
    const resp = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret   : process.env.RECAPTCHA_SECRET,
          response : captcha,
          remoteip : req.ip
        }
      }
    )
    if (!resp.data.success) throw new Error('reCAPTCHA failed')
  } catch {
    return res.render('register', {
      error           : 'Грешка при валидация на reCAPTCHA',
      values          : { username, telegram },
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
    })
  }

  // запис в базата
  try {
    const hash = await bcrypt.hash(password, 10)
    db.run(
      `INSERT INTO users (username, password, telegram_username)
       VALUES (?, ?, ?)`,
      [username, hash, telegram || null],
      err => {
        if (err) {
          return res.render('register', {
            error           : 'Потребителското име вече съществува',
            values          : { username, telegram },
            recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
          })
        }
        res.redirect('/login?registered=1')
      }
    )
  } catch {
    res.render('register', {
      error           : 'Вътрешна грешка при регистрация',
      values          : { username, telegram },
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
    })
  }
})

// 7.3. Вход (Login)
app.get('/login', (req, res) => {
  res.render('login', {
    error           : null,
    success         : req.query.registered === '1',
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
  })
})

app.post('/login', async (req, res) => {
  const { username, password, 'g-recaptcha-response': captcha } = req.body

  if (!username || !password) {
    return res.render('login', {
      error           : 'Всички полета са задължителни',
      success         : false,
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
    })
  }
  if (!captcha) {
    return res.render('login', {
      error           : 'Маркирай "Не съм робот"',
      success         : false,
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
    })
  }

  // reCAPTCHA валидация
  try {
    const resp = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret   : process.env.RECAPTCHA_SECRET,
          response : captcha,
          remoteip : req.ip
        }
      }
    )
    if (!resp.data.success) throw new Error('reCAPTCHA failed')
  } catch {
    return res.render('login', {
      error           : 'Грешка при валидация на reCAPTCHA',
      success         : false,
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
    })
  }

  // влизане
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err || !user || !(await bcrypt.compare(password, user.password))) {
        return res.render('login', {
          error           : 'Грешни потребителско име или парола',
          success         : false,
          recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
        })
      }
      const sessionId = crypto.randomBytes(16).toString('hex')
      sessions[sessionId] = user
      res.cookie('sessionId', sessionId, { httpOnly: true })
      res.redirect('/')
    }
  )
})

// 7.4. Пазаруване (за completeness)
app.post('/buy/:productId', requireAuth, async (req, res) => {
  const userId    = req.user.id
  const productId = parseInt(req.params.productId, 10)
  const quantity  = Math.max(1, parseInt(req.body.quantity, 10) || 1)

  db.get(
    `SELECT * FROM products WHERE id = ? AND stock >= ?`,
    [productId, quantity],
    async (err, product) => {
      if (err || !product) {
        return res.status(400).json({ error: 'Product unavailable' })
      }
      const total     = product.price * quantity
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

      db.run(
        `INSERT INTO orders (user_id, product_id, quantity, total_amount, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, productId, quantity, total, expiresAt],
        async function (err) {
          if (err) {
            return res.status(500).json({ error: 'Order failed' })
          }
          const orderId = this.lastID

          try {
            const invoice = await createWolvPayInvoice(
              orderId, total, 'USD',
              `Order #${orderId} - ${product.name}`,
              req
            )

            db.run(
              `UPDATE orders
               SET payment_id   = ?,
                   crypto_address = ?,
                   crypto_amount  = ?
               WHERE id = ?`,
              [invoice.paymentId, invoice.address, invoice.cryptoAmount, orderId]
            )
            db.run(
              `UPDATE products
                 SET stock = stock - ?
               WHERE id = ?`,
              [quantity, productId]
            )

            logPaymentEvent(orderId, 'created', invoice)

            res.json({
              success     : true,
              paymentUrl  : invoice.paymentUrl,
              address     : invoice.address,
              cryptoAmount: invoice.cryptoAmount,
              qrCode      : invoice.qrCode,
              expiresAt
            })
          } catch (e) {
            console.error('WolvPay error:', e)
            res.status(500).json({ error: 'Invoice creation failed' })
          }
        }
      )
    }
  )
})

// 7.5. Webhook WolvPay
app.post('/webhook/wolvpay', express.json(), (req, res) => {
  const signature = req.headers['x-wolvpay-signature'] || ''
  const expected  = crypto
    .createHmac('sha256', CRYPTO_CONFIG.wolvpay.webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex')

  if (signature !== expected) {
    return res.status(401).send('Invalid signature')
  }

  const { invoice_id, status, txID } = req.body
  if (status.toLowerCase() === 'completed') {
    db.run(
      `UPDATE orders
         SET payment_status = 'completed',
             tx_hash       = ?,
             updated_at    = CURRENT_TIMESTAMP
       WHERE payment_id = ?`,
      [txID, invoice_id]
    )
    logPaymentEvent(invoice_id, 'completed', req.body)
  }
  res.json({ success: true })
})

// 7.6. Страница за успех
app.get('/payment-success', requireAuth, (req, res) => {
  const orderId = parseInt(req.query.order, 10)
  db.get(
    `SELECT o.*, p.name AS product_name
       FROM orders o
       JOIN products p ON o.product_id = p.id
      WHERE o.id = ? AND o.user_id = ?`,
    [orderId, req.user.id],
    (err, order) => {
      if (err || !order) {
        return res.status(404).send('Order not found')
      }
      res.render('success', { order })
    }
  )
})

// 8. 404 & Error handlers
app.use((req, res) => {
  res.status(404).render('404', { url: req.originalUrl })
})

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Server error')
})

// 9. Стартиране
app.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`)
})

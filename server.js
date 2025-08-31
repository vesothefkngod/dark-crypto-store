// 1. Импорти и основни конфигурации
const express      = require('express')
const sqlite3      = require('sqlite3').verbose()
const path         = require('path')
const crypto       = require('crypto')
const axios        = require('axios')
const bcrypt       = require('bcrypt')
const cookieParser = require('cookie-parser')
const cors         = require('cors')

const app  = express()
const port = process.env.PORT || 3000

// 2. Конфигурация за WolvPay (крипто плащания)
const CRYPTO_CONFIG = {
  wolvpay: {
    apiUrl:        process.env.WOLVPAY_API_URL,
    merchantKey:   process.env.WOLVPAY_MERCHANT_KEY,
    webhookSecret: process.env.WOLVPAY_WEBHOOK_SECRET
  }
}

// 3. Middleware
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))
app.set('view engine', 'ejs')

// 4. SQLite база данни и схеми
const db = new sqlite3.Database(path.join(__dirname, 'store.sqlite'))
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT    UNIQUE NOT NULL,
      password TEXT    NOT NULL,
      email    TEXT
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

// 5. Прости сесии в паметта
const sessions = {}
function requireAuth(req, res, next) {
  const sid = req.cookies.sessionId
  if (sid && sessions[sid]) {
    req.user = sessions[sid]
    return next()
  }
  res.redirect('/login')
}

// 6. Помощни функции

// 6.1. Запис на събитие от платежния webhook
function logPaymentEvent(orderId, eventType, data) {
  db.run(
    `INSERT INTO payment_logs (order_id, provider, event_type, data)
     VALUES (?, 'wolvpay', ?, ?)`,
    [orderId, eventType, JSON.stringify(data)],
    err => { if (err) console.error('Log error:', err) }
  )
}

// 6.2. Създаване на фактура в WolvPay
async function createWolvPayInvoice(orderId, amount, currency, description, req) {
  const payload = {
    merchant:     CRYPTO_CONFIG.wolvpay.merchantKey,
    invoiceValue: amount,
    currency,
    description,
    callbackUrl:  `${req.protocol}://${req.get('host')}/webhook/wolvpay`,
    returnUrl:    `${req.protocol}://${req.get('host')}/payment-success?order=${orderId}`,
    lifetime:     30 // минути
  }

  const resp = await axios.post(
    `${CRYPTO_CONFIG.wolvpay.apiUrl}/invoice`,
    payload
  )
  const inv = resp.data

  return {
    paymentId:    inv.invoiceId,
    paymentUrl:   inv.paymentUrl,
    address:      inv.address,
    cryptoAmount: inv.cryptoAmount,
    qrCode:       inv.qrCode
  }
}

// 7. Маршрути

// 7.1. Списък с продукти (публична страница)
app.get('/', (req, res) => {
  db.all(`SELECT * FROM products WHERE stock > 0`, [], (err, products) => {
    if (err) {
      console.error('DB Error:', err)
      return res.status(500).send('Грешка в базата данни')
    }
    const user = sessions[req.cookies.sessionId] || null
    res.render('index', { products, user })
  })
})

// 7.2. Регистрация
app.get('/register', (req, res) => {
  res.render('register', { error: null })
})
app.post('/register', async (req, res) => {
  const { username, password, email } = req.body
  if (!username || !password || password.length < 6) {
    return res.render('register', { error: 'Невалидни данни' })
  }
  const hash = await bcrypt.hash(password, 10)
  db.run(
    `INSERT INTO users (username, password, email) VALUES (?, ?, ?)`,
    [username, hash, email],
    err => {
      if (err) {
        return res.render('register', { error: 'Потребителят вече съществува' })
      }
      res.redirect('/login')
    }
  )
})

// 7.3. Вход
app.get('/login', (req, res) => {
  res.render('login', { error: null })
})
app.post('/login', (req, res) => {
  const { username, password } = req.body
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err || !user || !(await bcrypt.compare(password, user.password))) {
        return res.render('login', { error: 'Грешни данни' })
      }
      const sessionId = crypto.randomBytes(16).toString('hex')
      sessions[sessionId] = user
      res.cookie('sessionId', sessionId, { httpOnly: true })
      res.redirect('/')
    }
  )
})

// 7.4. Купуване на продукт (създаване на поръчка + фактура)
app.post('/buy/:productId', requireAuth, async (req, res) => {
  const userId    = req.user.id
  const productId = parseInt(req.params.productId, 10)
  const quantity  = Math.max(1, parseInt(req.body.quantity, 10) || 1)

  db.get(
    `SELECT * FROM products WHERE id = ? AND stock >= ?`,
    [productId, quantity],
    async (err, product) => {
      if (err || !product) {
        return res.status(400).json({ error: 'Продуктът не е наличен' })
      }

      const total     = product.price * quantity
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

      db.run(
        `INSERT INTO orders
           (user_id, product_id, quantity, total_amount, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, productId, quantity, total, expiresAt],
        async function (err) {
          if (err) {
            return res.status(500).json({ error: 'Неуспешна поръчка' })
          }

          const orderId = this.lastID

          try {
            const invoice = await createWolvPayInvoice(
              orderId,
              total,
              'USD',
              `Поръчка #${orderId} – ${product.name}`,
              req
            )

            db.run(
              `UPDATE orders
                 SET payment_id = ?, crypto_address = ?, crypto_amount = ?
               WHERE id = ?`,
              [invoice.paymentId, invoice.address, invoice.cryptoAmount, orderId]
            )
            db.run(
              `UPDATE products SET stock = stock - ? WHERE id = ?`,
              [quantity, productId]
            )

            logPaymentEvent(orderId, 'created', invoice)

            return res.json({
              success:      true,
              paymentUrl:   invoice.paymentUrl,
              address:      invoice.address,
              cryptoAmount: invoice.cryptoAmount,
              qrCode:       invoice.qrCode,
              expiresAt
            })
          } catch (e) {
            console.error('WolvPay error:', e)
            return res.status(500).json({ error: 'Грешка при създаване на фактура' })
          }
        }
      )
    }
  )
})

// 7.5. Webhook за WolvPay събития
app.post(
  '/webhook/wolvpay',
  express.json(),
  (req, res) => {
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
  }
)

// 7.6. Успешна страница след плащане
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
        return res.status(404).send('Поръчката не е намерена')
      }
      res.render('success', { order })
    }
  )
})

// 8. Грешки 404 и 500
app.use((req, res) => {
  res.status(404).render('404', { url: req.originalUrl })
})
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Сървърна грешка')
})

// 9. Стартиране на сървъра
app.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`)
})
```

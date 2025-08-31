// server.js

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

// —————————————————————————————
// Configuration
// —————————————————————————————

// Secret for signing form timestamps
const FORM_SECRET = process.env.FORM_SECRET
if (!FORM_SECRET) {
  console.error('❌ Missing FORM_SECRET environment variable')
  process.exit(1)
}

// Session cookie secret
const SESSION_SECRET = process.env.SESSION_SECRET || 'fallback-session-secret'

// WolvePay API & webhook secrets
const CRYPTO_CONFIG = {
  wolvpay: {
    apiKey        : process.env.WOLVPAY_API_KEY || '',
    secret        : process.env.WOLVPAY_SECRET || '',
    webhookSecret : process.env.WOLVPAY_WEBHOOK_SECRET || ''
  }
}

// —————————————————————————————
// Database
// —————————————————————————————

const DB_FILE = process.env.DB_FILE || 'database.sqlite'
const db = new sqlite3.Database(DB_FILE, err => {
  if (err) console.error('DB error:', err)
  else console.log(`✅ SQLite connected: ${DB_FILE}`)
})

// —————————————————————————————
// App middleware
// —————————————————————————————

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))

app.use(express.static(path.join(__dirname, 'public')))
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser(SESSION_SECRET))

// —————————————————————————————
// Helper: require authentication
// —————————————————————————————

function requireAuth(req, res, next) {
  const sessionToken = req.signedCookies.session
  if (!sessionToken) {
    return res.redirect('/login')
  }

  db.get(
    'SELECT user_id FROM sessions WHERE token = ?',
    [sessionToken],
    (err, row) => {
      if (err || !row) {
        res.clearCookie('session')
        return res.redirect('/login')
      }
      db.get(
        'SELECT id, username FROM users WHERE id = ?',
        [row.user_id],
        (err, user) => {
          if (err || !user) {
            res.clearCookie('session')
            return res.redirect('/login')
          }
          req.user = user
          next()
        }
      )
    }
  )
}

// —————————————————————————————
// Anti-bot: honeypot + timing + HMAC
// —————————————————————————————

function attachAntiBotParams(req, res, next) {
  const startTime = Date.now().toString()
  const formSig   = crypto
    .createHmac('sha256', FORM_SECRET)
    .update(startTime)
    .digest('hex')

  res.locals.bot = { startTime, formSig }
  next()
}

function validateFormBotProtection(body) {
  const now = Date.now()

  // 1) Honeypot: поле "website" трябва да е празно
  if (body.website && body.website.trim() !== '') {
    throw new Error('Bot detected (honeypot)')
  }

  // 2) Проверка на подписа на startTime
  const startTime   = parseInt(body.startTime, 10)
  const expectedSig = crypto
    .createHmac('sha256', FORM_SECRET)
    .update(body.startTime)
    .digest('hex')
  if (body.formSig !== expectedSig) {
    throw new Error('Invalid form signature')
  }

  // 3) Минимално време за попълване: 3 секунди
  if (now - startTime < 3000) {
    throw new Error('Form submitted too fast')
  }
}

// —————————————————————————————
// Routes: Public
// —————————————————————————————

// GET /register – покажи формата с анти-бот параметри
app.get('/register', attachAntiBotParams, (req, res) => {
  res.render('register', { error: null, values: {}, bot: res.locals.bot })
})

// POST /register – регистрирай нов потребител
app.post('/register', async (req, res) => {
  try {
    validateFormBotProtection(req.body)
  } catch (botErr) {
    return res
      .status(400)
      .render('register', {
        error : botErr.message,
        values: { username: req.body.username, telegram: req.body.telegram },
        bot   : res.locals.bot
      })
  }

  const { username, password, repeatPassword, telegram } = req.body

  if (!username || username.length < 3) {
    return res.render('register', { error: 'Потребителското име е твърде кратко', values:{ username, telegram }, bot: res.locals.bot })
  }
  if (password !== repeatPassword) {
    return res.render('register', { error: 'Паролите не съвпадат', values:{ username, telegram }, bot: res.locals.bot })
  }

  // Проверка дали има такъв потребител
  db.get(
    'SELECT id FROM users WHERE username = ?',
    [username],
    async (err, row) => {
      if (err) return res.status(500).send('Server error')
      if (row) {
        return res.render('register', { error: 'Потребителят вече съществува', values:{ username, telegram }, bot: res.locals.bot })
      }

      const hash = await bcrypt.hash(password, 10)
      db.run(
        'INSERT INTO users (username, password_hash, telegram) VALUES (?, ?, ?)',
        [username, hash, telegram],
        err => {
          if (err) return res.status(500).send('Server error')
          res.redirect('/login?registered=1')
        }
      )
    }
  )
})

// GET /login – форма за вход
app.get('/login', attachAntiBotParams, (req, res) => {
  res.render('login', {
    error  : null,
    success: req.query.registered === '1',
    bot    : res.locals.bot
  })
})

// POST /login – влизане в системата
app.post('/login', (req, res) => {
  try {
    validateFormBotProtection(req.body)
  } catch (botErr) {
    return res
      .status(400)
      .render('login', { error: botErr.message, success: false, bot: res.locals.bot })
  }

  const { username, password } = req.body
  db.get(
    'SELECT id, password_hash FROM users WHERE username = ?',
    [username],
    async (err, user) => {
      if (err) return res.status(500).send('Server error')
      if (!user) {
        return res.render('login', { error: 'Невалидни данни', success: false, bot: res.locals.bot })
      }

      const match = await bcrypt.compare(password, user.password_hash)
      if (!match) {
        return res.render('login', { error: 'Невалидни данни', success: false, bot: res.locals.bot })
      }

      // Генерираме сесия
      const token = crypto.randomBytes(16).toString('hex')
      db.run('INSERT INTO sessions (user_id, token) VALUES (?, ?)', [user.id, token], err => {
        if (err) return res.status(500).send('Server error')
        res.cookie('session', token, { signed: true, httpOnly: true })
        res.redirect('/products')
      })
    }
  )
})

// GET /logout – затвори сесията
app.get('/logout', (req, res) => {
  const sessionToken = req.signedCookies.session
  if (sessionToken) {
    db.run('DELETE FROM sessions WHERE token = ?', [sessionToken])
    res.clearCookie('session')
  }
  res.redirect('/login')
})

// —————————————————————————————
// Routes: Protected
// —————————————————————————————

// GET /products – списък продукти
app.get('/products', requireAuth, (req, res) => {
  db.all('SELECT * FROM products', (err, products) => {
    if (err) return res.status(500).send('Server error')
    res.render('products', { products, user: req.user })
  })
})

// GET /buy – започни плащане
app.get('/buy', requireAuth, async (req, res) => {
  const id = parseInt(req.query.id, 10)
  db.get('SELECT * FROM products WHERE id = ?', [id], async (err, product) => {
    if (err || !product) {
      return res.status(404).send('Product not found')
    }

    // Създаване на инвойс в WolvPay
    try {
      const resp = await axios.post(
        'https://api.wolvpay.com/v1/invoice',
        {
          amount     : product.price,
          currency   : product.currency,
          description: product.name,
          order_id   : crypto.randomBytes(8).toString('hex'),
          callback_url: `${req.protocol}://${req.get('host')}/webhook/wolvpay`
        },
        { headers: { 'Authorization': `Bearer ${CRYPTO_CONFIG.wolvpay.apiKey}` } }
      )

      const { invoice_id, payment_url } = resp.data
      // Записваме поръчката
      db.run(
        `INSERT INTO orders
           (user_id, product_id, payment_id, payment_status, created_at)
         VALUES (?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
        [req.user.id, product.id, invoice_id],
        () => {
          res.redirect(payment_url)
        }
      )
    } catch (e) {
      console.error(e)
      res.status(500).send('Payment initialization failed')
    }
  })
})

// —————————————————————————————
// Webhook & Success
// —————————————————————————————

// WolvPay webhook
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
    console.log(`✅ Payment completed for invoice ${invoice_id}`)
  }
  res.json({ success: true })
})

// Страница за успех
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

// —————————————————————————————
// 404 & Error handlers
// —————————————————————————————

app.use((req, res) => {
  res.status(404).render('404', { url: req.originalUrl })
})
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).send('Server error')
})

// —————————————————————————————
// Стартиране на сървъра
// —————————————————————————————

app.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`)
})

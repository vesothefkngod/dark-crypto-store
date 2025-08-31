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

// Database setup
const db = new sqlite3.Database('store.sqlite');

// Създаване на таблици
db.run(`CREATE TABLE IF NOT EXISTS products (...)`);
db.run(`CREATE TABLE IF NOT EXISTS orders (...)`);
db.run(`CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE,
  content TEXT
)`);

// Enhanced API Configuration - твоите ключове + новите
const CRYPTO_CONFIG = {
    oxapay: {
        merchantKey: 'FGUKRJ-99OGIU-GJUEAB-SO5IM7', // Твоя ключ
        apiUrl: 'https://api.oxapay.com'
    },
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
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Initialize enhanced database
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Enhanced Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        image TEXT,
        category TEXT DEFAULT 'general',
        stock INTEGER DEFAULT 100,
        featured BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Enhanced Orders table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        product_id INTEGER,
        quantity INTEGER DEFAULT 1,
        total_amount REAL NOT NULL,
        usd_amount REAL NOT NULL,
        payment_provider TEXT DEFAULT 'oxapay',
        payment_status TEXT DEFAULT 'pending',
        payment_id TEXT,
        crypto_currency TEXT,
        crypto_address TEXT,
        crypto_amount TEXT,
        tx_hash TEXT,
        expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
    )`);

    // Payment logs table
    db.run(`CREATE TABLE IF NOT EXISTS payment_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        provider TEXT,
        event_type TEXT,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id)
    )`);

    // Add sample products if none exist
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (!err && row.count === 0) {
            const products = [
                ['💀 CR. RONALDO 7 (1гр.) ULTRA M3TH', 'High-grade digital product with instant delivery', 99.99, '/images/premium.jpg', 'premium', 50, 1],
                ['🔫 АК-47 (5гр.) HIGH QUALITY', 'Professional grade product for serious users', 149.99, '/images/professional.jpg', 'professional', 30, 1],
                ['⚡ ФЛЕКС (1гр) БОЛИВИЯ', 'Essential quality product with fast shipping', 79.99, '/images/standard.jpg', 'standard', 100, 0],
                ['💎 SPECIAL COMBO DEAL', 'Best value package - limited time offer', 249.99, '/images/combo.jpg', 'combo', 20, 1],
                ['🎯 VIP EXCLUSIVE', 'Ultra premium members only product', 399.99, '/images/vip.jpg', 'vip', 10, 1]
            ];
            products.forEach(product => {
                db.run("INSERT INTO products (name, description, price, image, category, stock, featured) VALUES (?, ?, ?, ?, ?, ?, ?)", product);
            });
            console.log('✅ Sample products added');
        }
    });

    // Create admin user if none exists
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (!err && row.count === 0) {
            bcrypt.hash('admin123', 10, (err, hash) => {
                if (!err) {
                    db.run("INSERT INTO users (username, password, email) VALUES (?, ?, ?)", 
                        ['admin', hash, 'admin@darkstore.com']);
                    console.log('✅ Admin user created: admin / admin123');
                }
            });
        }
    });
});

// Session management
const sessions = {};
const paymentSessions = new Map();

function requireAuth(req, res, next) {
    const sessionId = req.cookies.sessionId;
    if (sessionId && sessions[sessionId]) {
        req.user = sessions[sessionId];
        next();
    } else {
        res.redirect('/login');
    }
}

function requireAdmin(req, res, next) {
    const sessionId = req.cookies.sessionId;
    if (sessionId && sessions[sessionId] && (sessions[sessionId].isAdmin || sessions[sessionId].username === 'admin')) {
        req.user = sessions[sessionId];
        next();
    } else {
        res.redirect('/admin');
    }
}

// Routes
app.get('/', (req, res) => {
    const sessionId = req.cookies.sessionId;
    const user = sessionId && sessions[sessionId] ? sessions[sessionId] : null;
    
    db.all(`
        SELECT *, 
        CASE WHEN featured = 1 THEN 1 ELSE 0 END as is_featured 
        FROM products 
        WHERE stock > 0
        ORDER BY featured DESC, id DESC
    `, [], (err, products) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).send('Database error');
        }
        res.render('index', { products, user });
    });
});

// Auth routes
app.get('/login', (req, res) => {
    res.render('login', { error: null, success: req.query.success });
});

app.get('/register', (req, res) => {
    res.render('register', { error: null });
});

app.post('/register', (req, res) => {
    const { username, password, email } = req.body;
    
    if (!username || !password) {
        return res.render('register', { error: 'Username and password required' });
    }

    if (password.length < 6) {
        return res.render('register', { error: 'Password must be at least 6 characters' });
    }

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) {
            return res.render('register', { error: 'Registration failed' });
        }

        db.run("INSERT INTO users (username, password, email) VALUES (?, ?, ?)", 
            [username, hash, email || null], function(err) {
            if (err) {
                return res.render('register', { error: 'Username already exists' });
            }
            console.log(`✅ New user registered: ${username}`);
            res.redirect('/login?success=1');
        });
    });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) {
            return res.render('login', { error: 'Invalid credentials', success: null });
        }

        bcrypt.compare(password, user.password, (err, match) => {
            if (err || !match) {
                return res.render('login', { error: 'Invalid credentials', success: null });
            }

            const sessionId = crypto.randomBytes(32).toString('hex');
            sessions[sessionId] = user;
            
            res.cookie('sessionId', sessionId, { 
                httpOnly: true, 
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000 
            });
            
            console.log(`✅ User logged in: ${username}`);
            res.redirect('/dashboard');
        });
    });
});

app.get('/dashboard', requireAuth, (req, res) => {
    db.all("SELECT * FROM products WHERE stock > 0 ORDER BY featured DESC, id DESC", [], (err, products) => {
        if (err) {
            return res.status(500).send('Database error');
        }
        
        db.all(`
            SELECT o.*, p.name as product_name, p.image as product_image
            FROM orders o 
            JOIN products p ON o.product_id = p.id 
            WHERE o.user_id = ? 
            ORDER BY o.created_at DESC
            LIMIT 10
        `, [req.user.id], (err, orders) => {
            if (err) {
                console.error('Orders query error:', err);
                orders = [];
            }

            db.get(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN payment_status = 'completed' THEN total_amount ELSE 0 END) as total_spent,
                    COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as completed_orders
                FROM orders WHERE user_id = ?
            `, [req.user.id], (err, stats) => {
                res.render('dashboard', { 
                    products, 
                    orders, 
                    user: req.user,
                    stats: stats || { total_orders: 0, total_spent: 0, completed_orders: 0 }
                });
            });
        });
    });
});

app.get('/logout', (req, res) => {
    const sessionId = req.cookies.sessionId;
    if (sessionId) {
        delete sessions[sessionId];
    }
    res.clearCookie('sessionId');
    res.redirect('/');
});

// Enhanced Buy Product with dual provider support
app.post('/buy/:productId', requireAuth, (req, res) => {
    const productId = req.params.productId;
    const quantity = parseInt(req.body.quantity) || 1;
    const provider = req.body.provider || 'oxapay';
    const cryptoCurrency = req.body.currency || 'BTC';

    if (quantity < 1 || quantity > 10) {
        return res.status(400).json({ error: 'Invalid quantity (1-10 allowed)' });
    }

    if (!['oxapay', 'wolvpay'].includes(provider)) {
        return res.status(400).json({ error: 'Invalid payment provider' });
    }

    db.get("SELECT * FROM products WHERE id = ? AND stock >= ?", [productId, quantity], async (err, product) => {
        if (err || !product) {
            return res.status(404).json({ error: 'Product not found or insufficient stock' });
        }

        const totalAmount = product.price * quantity;
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

        db.run(
            `INSERT INTO orders (user_id, product_id, quantity, total_amount, usd_amount, 
             payment_provider, crypto_currency, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, productId, quantity, totalAmount, totalAmount, provider, cryptoCurrency, expiresAt.toISOString()],
            async function(err) {
                if (err) {
                    console.error('Order creation error:', err);
                    return res.status(500).json({ error: 'Failed to create order' });
                }

                const orderId = this.lastID;

                try {
                    let paymentResult;
                    
                    if (provider === 'oxapay') {
                        paymentResult = await createOxaPayPayment(orderId, totalAmount, cryptoCurrency, product.name, req);
                    } else if (provider === 'wolvpay') {
                        paymentResult = await createWolvPayPayment(orderId, totalAmount, cryptoCurrency, product.name, req);
                    }

                    db.run(
                        `UPDATE orders SET payment_id = ?, crypto_address = ?, crypto_amount = ? WHERE id = ?`,
                        [paymentResult.paymentId, paymentResult.address, paymentResult.cryptoAmount, orderId]
                    );

                    db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, productId]);

                    logPaymentEvent(orderId, provider, 'payment_created', paymentResult);

                    paymentSessions.set(paymentResult.paymentId, {
                        orderId,
                        userId: req.user.id,
                        provider,
                        expiresAt
                    });

                    console.log(`✅ Payment created: ${paymentResult.paymentId} for user ${req.user.username}`);

                    res.json({
                        success: true,
                        orderId: orderId,
                        paymentId: paymentResult.paymentId,
                        paymentUrl: paymentResult.paymentUrl,
                        address: paymentResult.address,
                        cryptoAmount: paymentResult.cryptoAmount,
                        cryptoCurrency: cryptoCurrency,
                        qrCode: paymentResult.qrCode,
                        expiresAt: expiresAt.toISOString()
                    });

                } catch (paymentError) {
                    console.error('Payment error:', paymentError);
                    db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [quantity, productId]);
                    res.status(500).json({ error: 'Payment creation failed: ' + paymentError.message });
                }
            }
        );
    });
});

// OxaPay payment creation
async function createOxaPayPayment(orderId, amount, currency, productName, req) {
    const paymentData = {
        merchant: CRYPTO_CONFIG.oxapay.merchantKey,
        amount: amount,
        currency: 'USD',
        lifeTime: 30,
        feePaidByPayer: 0,
        underPaidCover: 5,
        callbackUrl: `${req.protocol}://${req.get('host')}/webhook/oxapay`,
        returnUrl: `${req.protocol}://${req.get('host')}/payment-success?order=${orderId}`,
        description: `Order #${orderId} - ${productName}`
    };

    const response = await axios.post(`${CRYPTO_CONFIG.oxapay.apiUrl}/merchants/request`, paymentData);
    
    if (response.data.result !== 100) {
        throw new Error(response.data.message || 'OxaPay payment creation failed');
    }

    return {
        paymentId: response.data.trackId,
        paymentUrl: response.data.payLink,
        address: response.data.address,
        cryptoAmount: response.data.amount,
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${response.data.address}`
    };
}

// WolvPay payment creation (simulated for demo)
async function createWolvPayPayment(orderId, amount, currency, productName, req) {
    // For demo purposes - in production use real WolvPay API
    return new Promise((resolve) => {
        setTimeout(() => {
            const mockData = {
                paymentId: 'WLV_' + Date.now(),
                paymentUrl: `https://pay.wolvpay.com/invoice/${Date.now()}`,
                address: generateCryptoAddress(currency),
                cryptoAmount: calculateCryptoAmount(amount, currency),
                qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${generateCryptoAddress(currency)}`
            };
            resolve(mockData);
        }, 1000);
    });
}

function generateCryptoAddress(currency) {
    const addresses = {
        'BTC': '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
        'ETH': '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        'USDT': '0x5041ed759Dd4aFc3a72b8192C143F72f4724081A',
        'USDC': '0xA0b86a33E6411B2d7C2DBDd2B0ad8Ad6D9827c8f',
        'LTC': 'LdP8Qox1VAhCzLJNqrr74YovaWYyNBUWvL'
    };
    return addresses[currency] || addresses['BTC'];
}

function calculateCryptoAmount(usdAmount, currency) {
    const rates = {
        'BTC': 45000, 'ETH': 3000, 'USDT': 1, 'USDC': 1, 'LTC': 150
    };
    const rate = rates[currency] || 1;
    return (usdAmount / rate).toFixed(8);
}

// Payment status checking
app.get('/api/payment/status/:paymentId', requireAuth, async (req, res) => {
    const { paymentId } = req.params;
    const session = paymentSessions.get(paymentId);
    
    if (!session) {
        return res.status(404).json({ error: 'Payment session not found' });
    }

    try {
        let status = { status: 'pending', amount: 0, txHash: null };
        
        if (session.provider === 'oxapay') {
            try {
                const response = await axios.post(`${CRYPTO_CONFIG.oxapay.apiUrl}/merchants/inquiry`, {
                    merchant: CRYPTO_CONFIG.oxapay.merchantKey,
                    trackId: paymentId
                });
                status = {
                    status: response.data.status?.toLowerCase() || 'unknown',
                    amount: response.data.amount,
                    txHash: response.data.txID
                };
            } catch (error) {
                console.error('OxaPay status check error:', error.message);
            }
        }

        if (status.status === 'completed' || status.status === 'paid') {
            db.run(
                "UPDATE orders SET payment_status = 'completed', tx_hash = ? WHERE payment_id = ?",
                [status.txHash, paymentId]
            );
            logPaymentEvent(session.orderId, session.provider, 'payment_completed', status);
        }

        res.json({ success: true, data: status });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Status check failed' });
    }
});

// Webhooks
app.post('/webhook/oxapay', (req, res) => {
    console.log('🔔 OxaPay webhook received:', req.body);
    
    const { trackId, status, amount, currency, txID } = req.body;
    
    if (status === 'Paid') {
        db.run(
            `UPDATE orders SET 
             payment_status = 'completed', 
             tx_hash = ?, 
             updated_at = CURRENT_TIMESTAMP 
             WHERE payment_id = ?`,
            [txID, trackId],
            (err) => {
                if (err) {
                    console.error('OxaPay webhook error:', err);
                } else {
                    console.log(`✅ Order with payment ID ${trackId} marked as completed`);
                    
                    db.get("SELECT id FROM orders WHERE payment_id = ?", [trackId], (err, order) => {
                        if (order) {
                            logPaymentEvent(order.id, 'oxapay', 'webhook_completed', req.body);
                        }
                    });
                }
            }
        );
    }
    
    res.status(200).json({ result: 100, message: 'Webhook processed successfully' });
});

app.post('/webhook/wolvpay', (req, res) => {
    console.log('🔔 WolvPay webhook received:', req.body);
    
    const signature = req.headers['x-wolvpay-signature'];
    const expectedSignature = crypto
        .createHmac('sha256', CRYPTO_CONFIG.wolvpay.webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

    if (signature !== expectedSignature) {
        console.error('❌ Invalid WolvPay webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    const { invoice_id, status } = req.body;
    
    if (status?.toLowerCase() === 'completed') {
        db.run(
            `UPDATE orders SET 
             payment_status = 'completed', 
             updated_at = CURRENT_TIMESTAMP 
             WHERE payment_id = ?`,
            [invoice_id],
            (err) => {
                if (err) {
                    console.error('WolvPay webhook error:', err);
                } else {
                    console.log(`✅ Order with payment ID ${invoice_id} marked as completed`);
                }
            }
        );
    }
    
    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
});

function logPaymentEvent(orderId, provider, eventType, data) {
    db.run(
        "INSERT INTO payment_logs (order_id, provider, event_type, data) VALUES (?, ?, ?, ?)",
        [orderId, provider, eventType, JSON.stringify(data)],
        (err) => {
            if (err) console.error('Payment log error:', err);
        }
    );
}

// Payment success page
app.get('/payment-success', (req, res) => {
    const orderId = req.query.order;
    
    if (orderId) {
        db.get(`
            SELECT o.*, p.name as product_name, u.username 
            FROM orders o 
            JOIN products p ON o.product_id = p.id 
            JOIN users u ON o.user_id = u.id 
            WHERE o.id = ?
        `, [orderId], (err, order) => {
            res.render('success', { order: order || null });
        });
    } else {
        res.render('success', { order: null });
    }
});

// Admin routes
app.get('/admin', (req, res) => {
    res.render('admin_login', { error: null });
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err || !user) {
            return res.render('admin_login', { error: 'Invalid credentials' });
        }

        bcrypt.compare(password, user.password, (err, match) => {
            if (err || !match) {
                return res.render('admin_login', { error: 'Invalid credentials' });
            }

            if (username === 'admin') {
                const sessionId = crypto.randomBytes(32).toString('hex');
                sessions[sessionId] = { ...user, isAdmin: true };
                res.cookie('sessionId', sessionId);
                res.redirect('/admin/dashboard');
            } else {
                res.render('admin_login', { error: 'Not authorized' });
            }
        });
    });
});

app.get('/admin/dashboard', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM products ORDER BY id DESC`, [], (err, products) => {
    db.all(`SELECT * FROM users ORDER BY created_at DESC`, [], (err, users) => {
      db.all(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 50`, [], (err, orders) => {

        // 📊 Поръчки по дни
        db.all(`SELECT DATE(created_at) as date, COUNT(*) as count FROM orders GROUP BY date ORDER BY date DESC LIMIT 7`, [], (err, ordersByDay) => {

          // 💰 Приходи по дни
          db.all(`SELECT DATE(created_at) as date, SUM(total_amount) as total FROM orders GROUP BY date ORDER BY date DESC LIMIT 7`, [], (err, revenueByDay) => {

            // 🧮 Общи статистики
            const totalRevenue = orders.reduce((sum, o) => sum + o.total_amount, 0);
            const totalOrders = orders.length;
            const totalUsers = users.length;

            res.render('admin_dashboard', {
              products,
              users,
              orders,
              userStats: { total_users: totalUsers },
              stats: {
                total_orders: totalOrders,
                total_revenue: totalRevenue
              },
              chartData: {
                ordersByDay,
                revenueByDay
              }
            });
          });
        });
      });
    });
  });
});

//ОРДЪР КРИЕЙТ 
app.post('/order/create', (req, res) => {
  const { productId, quantity } = req.body;

  db.get(`SELECT * FROM products WHERE id = ?`, [productId], (err, product) => {
    if (err || !product) {
      return res.status(404).send('Продуктът не е намерен');
    }

    const totalAmount = product.price * quantity;
    const paymentId = Date.now().toString(); // или UUID

    paymentSessions.set(paymentId, {
      productId,
      quantity,
      totalAmount,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000)
    });

    const invoiceUrl = `https://oxapay.com/invoice?amount=${totalAmount}&merchant=${CRYPTO_CONFIG.oxapay.merchantKey}&paymentId=${paymentId}`;

    res.redirect(invoiceUrl);
  });
});

// Health check
app.post('/admin/product/create', requireAdmin, (req, res) => {
  const { name, description, price, stock, category, image, featured } = req.body;

  db.run(
    `INSERT INTO products (name, description, price, stock, category, image, featured) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, description, price, stock, category, image, featured ? 1 : 0],
    (err) => {
      if (err) {
        console.error('❌ Грешка при създаване на продукт:', err.message);
        return res.status(500).send('Грешка при създаване на продукт');
      }
      console.log('✅ Продукт създаден успешно');
      res.redirect('/admin/dashboard');
    }
  );
});
app.post('/buy/:id', (req, res) => {
  const productId = req.params.id;
  const { quantity, provider, currency } = req.body;

  db.get(`SELECT * FROM products WHERE id = ?`, [productId], (err, product) => {
    if (err || !product) return res.json({ success: false, error: 'Продуктът не е намерен' });

    const totalAmount = product.price * quantity;
    const paymentId = Date.now().toString();

    let paymentUrl = '';
    if (provider === 'oxapay') {
      paymentUrl = `https://oxapay.com/invoice?amount=${totalAmount}&merchant=${CRYPTO_CONFIG.oxapay.merchantKey}&paymentId=${paymentId}&currency=${currency}`;
    } else if (provider === 'wolvpay') {
      paymentUrl = `https://wolvpay.com/invoice?amount=${totalAmount}&merchant=${CRYPTO_CONFIG.wolvpay.merchantKey}&paymentId=${paymentId}&currency=${currency}`;
    } else {
      return res.json({ success: false, error: 'Невалиден доставчик' });
    }

    res.json({
      success: true,
      paymentId,
      cryptoAmount: totalAmount.toFixed(2),
      cryptoCurrency: currency,
      address: '123abc456def789',
      paymentUrl
    });
  });
});
app.post('/admin/product/delete/:id', requireAdmin, (req, res) => {
  const productId = req.params.id;

  db.run(`DELETE FROM products WHERE id = ?`, [productId], (err) => {
    if (err) {
      console.error('❌ Грешка при изтриване:', err.message);
      return res.status(500).send('Грешка при изтриване');
    }
    res.redirect('/admin/dashboard');
  });
});
app.get('/admin/product/edit/:id', requireAdmin, (req, res) => {
  const productId = req.params.id;
  db.get(`SELECT * FROM products WHERE id = ?`, [productId], (err, product) => {
    if (err || !product) return res.status(404).send('Продуктът не е намерен');
    res.render('edit_product', { product });
  });
});

app.post('/admin/product/edit/:id', requireAdmin, (req, res) => {
  const { name, description, price, stock, category, image, featured } = req.body;
  const productId = req.params.id;

  db.run(
    `UPDATE products SET name = ?, description = ?, price = ?, stock = ?, category = ?, image = ?, featured = ? WHERE id = ?`,
    [name, description, price, stock, category, image, featured ? 1 : 0, productId],
    (err) => {
      if (err) return res.status(500).send('Грешка при редактиране');
      res.redirect('/admin/dashboard');
    }
  );
});
app.get('/admin/page/create', requireAdmin, (req, res) => {
  res.render('create_page');
});

app.post('/admin/page/create', requireAdmin, (req, res) => {
  const { slug, content } = req.body;

  db.run(`INSERT INTO pages (slug, content) VALUES (?, ?)`, [slug, content], (err) => {
    if (err) return res.status(500).send('Грешка при създаване на страница');
    res.redirect(`/page/${slug}`);
  });
});

app.get('/page/:slug', (req, res) => {
  const slug = req.params.slug;
  db.get(`SELECT * FROM pages WHERE slug = ?`, [slug], (err, page) => {
    if (err || !page) return res.status(404).send('Страницата не е намерена');
    res.send(page.content); // директно рендерира HTML
  });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        crypto_providers: ['oxapay', 'wolvpay'],
        database: 'sqlite3'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { 
        user: req.cookies.sessionId && sessions[req.cookies.sessionId] ? sessions[req.cookies.sessionId] : null 
    });
});

// Clean up expired sessions
setInterval(() => {
    const now = new Date();
    for (const [paymentId, session] of paymentSessions.entries()) {
        if (now > session.expiresAt) {
            paymentSessions.delete(paymentId);
        }
    }
}, 5 * 60 * 1000);

app.listen(port, () => {
    console.log(`
🚀 DARK CRYPTO STORE STARTED
━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 URL: http://localhost:${port}
💀 Admin: http://localhost:${port}/admin
👤 Login: admin / admin123
━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 OxaPay: ACTIVE (${CRYPTO_CONFIG.oxapay.merchantKey.substring(0, 10)}...)
🐺 WolvPay: ACTIVE 
🔒 Security: ENABLED
━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
});

module.exports = app;

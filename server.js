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

// OxaPay API - САМО ТВОЯ КЛЮЧ
const OXAPAY_API_KEY = 'FGUKRJ-99OGIU-GJUEAB-SO5IM7';
const OXAPAY_API_URL = 'https://api.oxapay.com';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Initialize database
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Products table
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

    // Orders table
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        product_id INTEGER,
        quantity INTEGER DEFAULT 1,
        total_amount REAL NOT NULL,
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
        event_type TEXT,
        data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id)
    )`);

    // Add sample products
    db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
        if (!err && row.count === 0) {
            const products = [
                ['💎 CR7 (1гр.) ULTRA M3TH', 'ВИСОКА ЧИСТОТА ,НАЙ-ДОБРОТО НА ПАЗАРА CR7METH', 99.99, '/images/premium.jpg', 'premium', 50, 1],
                ['☘️ АК-47 (5гр.) HQUALITY', 'ВИСОКО КАЧЕСТВЕНА ТРЕВА - СОРТ :: АК-47', 89.99, '/images/professional.jpg', 'professional', 30, 1],
                ['❄️ FLEX (1гр) BOLIVIA', 'ВИСОКА ЧИСТОТА ,НАЙ-ДОБРОТО НА ПАЗАРА - ВНОС :: БОЛИВИЯ', 129.99, '/images/standard.jpg', 'standard', 100, 0],
            ];
            products.forEach(product => {
                db.run("INSERT INTO products (name, description, price, image, category, stock, featured) VALUES (?, ?, ?, ?, ?, ?, ?)", product);
            });
            console.log('✅ Sample products added');
        }
    });

    // Create admin user
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

// Buy Product - САМО OXAPAY
app.post('/buy/:productId', requireAuth, (req, res) => {
    const productId = req.params.productId;
    const quantity = parseInt(req.body.quantity) || 1;
    const cryptoCurrency = req.body.currency || 'BTC';

    if (quantity < 1 || quantity > 10) {
        return res.status(400).json({ error: 'Invalid quantity (1-10 allowed)' });
    }

    db.get("SELECT * FROM products WHERE id = ? AND stock >= ?", [productId, quantity], async (err, product) => {
        if (err || !product) {
            return res.status(404).json({ error: 'Product not found or insufficient stock' });
        }

        const totalAmount = product.price * quantity;
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

        db.run(
            `INSERT INTO orders (user_id, product_id, quantity, total_amount, crypto_currency, expires_at) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [req.user.id, productId, quantity, totalAmount, cryptoCurrency, expiresAt.toISOString()],
            async function(err) {
                if (err) {
                    console.error('Order creation error:', err);
                    return res.status(500).json({ error: 'Failed to create order' });
                }

                const orderId = this.lastID;

                try {
                    // Create OxaPay payment
                    const paymentData = {
                        merchant: OXAPAY_API_KEY,
                        amount: totalAmount,
                        currency: 'USD',
                        lifeTime: 30,
                        feePaidByPayer: 0,
                        underPaidCover: 5,
                        callbackUrl: `${req.protocol}://${req.get('host')}/webhook/oxapay`,
                        returnUrl: `${req.protocol}://${req.get('host')}/payment-success?order=${orderId}`,
                        description: `Order #${orderId} - ${product.name}`
                    };

                    const response = await axios.post(`${OXAPAY_API_URL}/merchants/request`, paymentData);
                    
                    if (response.data.result !== 100) {
                        throw new Error(response.data.message || 'OxaPay payment creation failed');
                    }

                    // Update order with payment details
                    db.run(
                        `UPDATE orders SET payment_id = ?, crypto_address = ?, crypto_amount = ? WHERE id = ?`,
                        [response.data.trackId, response.data.address, response.data.amount, orderId]
                    );

                    // Reduce stock
                    db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, productId]);

                    // Log payment
                    logPaymentEvent(orderId, 'payment_created', response.data);

                    // Store for tracking
                    paymentSessions.set(response.data.trackId, {
                        orderId,
                        userId: req.user.id,
                        expiresAt
                    });

                    console.log(`✅ Payment created: ${response.data.trackId} for user ${req.user.username}`);

                    res.json({
                        success: true,
                        orderId: orderId,
                        paymentId: response.data.trackId,
                        paymentUrl: response.data.payLink,
                        address: response.data.address,
                        cryptoAmount: response.data.amount,
                        cryptoCurrency: cryptoCurrency,
                        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${response.data.address}`,
                        expiresAt: expiresAt.toISOString()
                    });

                } catch (paymentError) {
                    console.error('Payment error:', paymentError);
                    // Restore stock on error
                    db.run("UPDATE products SET stock = stock + ? WHERE id = ?", [quantity, productId]);
                    res.status(500).json({ error: 'Payment creation failed: ' + paymentError.message });
                }
            }
        );
    });
});

// Payment status checking
app.get('/api/payment/status/:paymentId', requireAuth, async (req, res) => {
    const { paymentId } = req.params;
    const session = paymentSessions.get(paymentId);
    
    if (!session) {
        return res.status(404).json({ error: 'Payment session not found' });
    }

    try {
        const response = await axios.post(`${OXAPAY_API_URL}/merchants/inquiry`, {
            merchant: OXAPAY_API_KEY,
            trackId: paymentId
        });

        const status = {
            status: response.data.status?.toLowerCase() || 'unknown',
            amount: response.data.amount,
            txHash: response.data.txID
        };

        if (status.status === 'completed' || status.status === 'paid') {
            db.run(
                "UPDATE orders SET payment_status = 'completed', tx_hash = ? WHERE payment_id = ?",
                [status.txHash, paymentId]
            );
            logPaymentEvent(session.orderId, 'payment_completed', status);
        }

        res.json({ success: true, data: status });

    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Status check failed' });
    }
});

// OxaPay Webhook
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
                            logPaymentEvent(order.id, 'webhook_completed', req.body);
                        }
                    });
                }
            }
        );
    }
    
    res.status(200).json({ result: 100, message: 'Webhook processed successfully' });
});

function logPaymentEvent(orderId, eventType, data) {
    db.run(
        "INSERT INTO payment_logs (order_id, event_type, data) VALUES (?, ?, ?)",
        [orderId, eventType, JSON.stringify(data)],
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
    db.all(`
        SELECT 
            o.*, 
            u.username, 
            p.name as product_name,
            p.price as product_price
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        LEFT JOIN products p ON o.product_id = p.id 
        ORDER BY o.created_at DESC 
        LIMIT 50
    `, [], (err, orders) => {
        if (err) {
            console.error(err);
            orders = [];
        }

        db.all("SELECT * FROM products ORDER BY featured DESC, id DESC", [], (err, products) => {
            if (err) {
                console.error(err);
                products = [];
            }

            db.get(`
                SELECT 
                    COUNT(*) as total_orders,
                    SUM(total_amount) as total_revenue,
                    COUNT(CASE WHEN payment_status = 'completed' THEN 1 END) as completed_orders,
                    COUNT(CASE WHEN payment_status = 'pending' THEN 1 END) as pending_orders
                FROM orders
            `, [], (err, stats) => {
                
                db.get("SELECT COUNT(*) as total_users FROM users", [], (err, userStats) => {
                    res.render('admin_dashboard', { 
                        orders, 
                        products,
                        stats: stats || { total_orders: 0, total_revenue: 0, completed_orders: 0, pending_orders: 0 },
                        userStats: userStats || { total_users: 0 }
                    });
                });
            });
        });
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        payment_provider: 'oxapay_only',
        database: 'sqlite3'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { 
        user: req.cookies.sessionId && sessions[req.cookies.sessionId] ? sessions[req.cookies.sessionId] : null 
    });
});

// Cleanup expired sessions
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
💀 DARK CRYPTO STORE - OXAPAY ONLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 URL: http://localhost:${port}
💀 Admin: http://localhost:${port}/admin
👤 Login: admin / admin123
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💎 OxaPay: ACTIVE (${OXAPAY_API_KEY})
🔒 Security: ENABLED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
});

module.exports = app;

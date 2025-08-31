<!DOCTYPE html>

<html lang="bg">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📝 Регистрация - CryptoStore</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📝</text></svg>">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

```
    body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
    }

    .register-container {
        background: rgba(255,255,255,0.05);
        backdrop-filter: blur(15px);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 25px;
        padding: 3rem;
        width: 100%;
        max-width: 500px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.3);
    }

    .logo {
        text-align: center;
        font-size: 3rem;
        font-weight: 800;
        background: linear-gradient(135deg, #ff6b35, #f7931e);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        margin-bottom: 2rem;
    }

    .register-title {
        text-align: center;
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        color: #fff;
    }

    .register-subtitle {
        text-align: center;
        color: rgba(255,255,255,0.7);
        margin-bottom: 2rem;
    }

    .form-group {
        margin-bottom: 1.5rem;
    }

    .form-group label {
        display: block;
        font-weight: 600;
        margin-bottom: 0.5rem;
        color: rgba(255,255,255,0.9);
    }

    .form-group input {
        width: 100%;
        padding: 1rem;
        border: 2px solid rgba(255,255,255,0.2);
        border-radius: 15px;
        background: rgba(255,255,255,0.1);
        color: #fff;
        font-size: 1rem;
        transition: all 0.3s ease;
    }

    .form-group input:focus {
        outline: none;
        border-color: #ff6b35;
        box-shadow: 0 0 0 3px rgba(255,107,53,0.2);
        transform: translateY(-2px);
    }

    .form-group input::placeholder {
        color: rgba(255,255,255,0.5);
    }

    .password-strength {
        margin-top: 0.5rem;
        font-size: 0.9rem;
    }

    .strength-weak { color: #dc3545; }
    .strength-medium { color: #ffc107; }
    .strength-strong { color: #28a745; }

    .register-btn {
        width: 100%;
        background: linear-gradient(135deg, #ff6b35, #f7931e);
        color: white;
        padding: 1rem;
        border: none;
        border-radius: 15px;
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.3s ease;
        margin-bottom: 1.5rem;
    }

    .register-btn:hover {
        transform: translateY(-3px);
        box-shadow: 0 15px 35px rgba(255,107,53,0.4);
    }

    .register-btn:disabled {
        background: #6c757d;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }

    .divider {
        text-align: center;
        margin: 2rem 0;
        position: relative;
        color: rgba(255,255,255,0.5);
    }

    .divider::before {
        content: '';
        position: absolute;
        top: 50%;
        left: 0;
        right: 0;
        height: 1px;
        background: rgba(255,255,255,0.2);
    }

    .divider span {
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        padding: 0 1rem;
    }

    .login-link {
        text-align: center;
    }

    .login-link a {
        color: #ff6b35;
        text-decoration: none;
        font-weight: 600;
        transition: all 0.3s ease;
    }

    .login-link a:hover {
        color: #f7931e;
        text-shadow: 0 0 10px rgba(255,107,53,0.5);
    }

    .back-home {
        position: absolute;
        top: 2rem;
        left: 2rem;
        color: rgba(255,255,255,0.7);
        text-decoration: none;
        font-weight: 600;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .back-home:hover {
        color: #ff6b35;
        transform: translateX(-5px);
    }

    .alert {
        padding: 1rem;
        border-radius: 10px;
        margin-bottom: 1.5rem;
        text-align: center;
        font-weight: 600;
    }

    .alert-error {
        background: rgba(220,53,69,0.2);
        color: #dc3545;
        border: 1px solid rgba(220,53,69,0.3);
    }

    .terms {
        font-size: 0.9rem;
        color: rgba(255,255,255,0.6);
        text-align: center;
        margin-top: 1rem;
        line-height: 1.5;
    }

    .benefits {
        margin-top: 2rem;
        padding-top: 2rem;
        border-top: 1px solid rgba(255,255,255,0.1);
    }

    .benefit-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        margin-top: 1rem;
    }

    .benefit-item {
        background: rgba(255,255,255,0.03);
        padding: 1rem;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.1);
        text-align: center;
        transition: all 0.3s ease;
    }

    .benefit-item:hover {
        background: rgba(255,107,53,0.1);
        border-color: rgba(255,107,53,0.3);
        transform: translateY(-2px);
    }

    .benefit-icon {
        font-size: 2rem;
        margin-bottom: 0.5rem;
    }

    .benefit-title {
        font-weight: 700;
        margin-bottom: 0.5rem;
        color: #fff;
    }

    .benefit-desc {
        font-size: 0.8rem;
        color: rgba(255,255,255,0.7);
    }

    .loading {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255,255,255,0.3);
        border-radius: 50%;
        border-top-color: #ff6b35;
        animation: spin 1s ease-in-out infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @media (max-width: 768px) {
        .register-container {
            margin: 1rem;
            padding: 2rem;
        }
        
        .back-home {
            position: relative;
            top: auto;
            left: auto;
            margin-bottom: 2rem;
            justify-content: center;
        }
        
        body {
            align-items: flex-start;
            padding-top: 2rem;
        }
        
        .benefit-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
```

</head>
<body>
    <a href="/" class="back-home">
        ← Назад към магазина
    </a>

```
<div class="register-container">
    <div class="logo">📝 CryptoStore</div>
    
    <h1 class="register-title">Създайте профил</h1>
    <p class="register-subtitle">Присъединете се към нашата общност</p>

    <% if (error) { %>
        <div class="alert alert-error">
            ❌ <%= error %>
        </div>
    <% } %>

    <form action="/register" method="POST" id="registerForm">
        <div class="form-group">
            <label for="username">👤 Потребителско име</label>
            <input type="text" id="username" name="username" placeholder="Изберете уникално потребителско име" required>
        </div>

        <div class="form-group">
            <label for="email">📧 Email (по избор)</label>
            <input type="email" id="email" name="email" placeholder="your@email.com">
        </div>

        <div class="form-group">
            <label for="password">🔒 Парола</label>
            <input type="password" id="password" name="password" placeholder="Поне 6 символа" required>
            <div class="password-strength" id="passwordStrength"></div>
        </div>

        <div class="form-group">
            <label for="confirmPassword">🔒 Потвърдете паролата</label>
            <input type="password" id="confirmPassword" name="confirmPassword" placeholder="Въведете паролата отново" required>
        </div>

        <button type="submit" class="register-btn" id="registerBtn">
            🚀 Създай профил
        </button>
    </form>

    <div class="terms">
        Като създавате профил, се съгласявате с нашите условия за ползване и политика за поверителност.
    </div>

    <div class="divider">
        <span>или</span>
    </div>

    <div class="login-link">
        Вече имате профил? <a href="/login">Влезте тук</a>
    </div>

    <div class="benefits">
        <h3 style="text-align: center; color: rgba(255,255,255,0.9); margin-bottom: 1rem;">
            🎁 Какво получавате с профил?
        </h3>
        <div class="benefit-grid">
            <div class="benefit-item">
                <div class="benefit-icon">🔒</div>
                <div class="benefit-title">Сигурност</div>
                <div class="benefit-desc">Защитени криптовалутни плащания</div>
            </div>
            <div class="benefit-item">
                <div class="benefit-icon">📦</div>
                <div class="benefit-title">История</div>
                <div class="benefit-desc">Проследяване на поръчки</div>
            </div>
            <div class="benefit-item">
                <div class="benefit-icon">⚡</div>
                <div class="benefit-title">Скорост</div>
                <div class="benefit-desc">Бързо и лесно пазаруване</div>
            </div>
            <div class="benefit-item">
                <div class="benefit-icon">🎯</div>
                <div class="benefit-title">Ексклузивно</div>
                <div class="benefit-desc">Достъп до премиум продукти</div>
            </div>
        </div>
    </div>
</div>

<script>
    function checkPasswordStrength(password) {
        const strengthDiv = document.getElementById('passwordStrength');
        let strength = 0;
        let feedback = '';

        if (password.length >= 6) strength++;
        if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
        if (password.match(/\d/)) strength++;
        if (password.match(/[^a-zA-Z\d]/)) strength++;

        if (password.length === 0) {
            strengthDiv.innerHTML = '';
            return;
        }

        if (strength === 1) {
            feedback = '<span class="strength-weak">❌ Слаба парола</span>';
        } else if (strength === 2 || strength === 3) {
            feedback = '<span class="strength-medium">⚠️ Средна парола</span>';
        } else if (strength >= 4) {
            feedback = '<span class="strength-strong">✅ Силна парола</span>';
        }

        strengthDiv.innerHTML = feedback;
    }

    document.getElementById('password').addEventListener('input', function() {
        checkPasswordStrength(this.value);
    });

    document.getElementById('registerForm').addEventListener('submit', function(e) {
        const registerBtn = document.getElementById('registerBtn');
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validation
        if (!username || !password) {
            e.preventDefault();
            alert('Моля попълнете задължителните полета!');
            return;
        }

        if (username.length < 3) {
            e.preventDefault();
            alert('Потребителското име трябва да е поне 3 символа!');
            return;
        }

        if (password.length < 6) {
            e.preventDefault();
            alert('Паролата трябва да е поне 6 символа!');
            return;
        }

        if (password !== confirmPassword) {
            e.preventDefault();
            alert('Паролите не съвпадат!');
            return;
        }

        // Show loading state
        registerBtn.disabled = true;
        registerBtn.innerHTML = '<span class="loading"></span> Създаване на профил...';
    });

    // Password confirmation matching
    document.getElementById('confirmPassword').addEventListener('input', function() {
        const password = document.getElementById('password').value;
        const confirmPassword = this.value;
        
        if (confirmPassword && password !== confirmPassword) {
            this.style.borderColor = '#dc3545';
        } else if (confirmPassword && password === confirmPassword) {
            this.style.borderColor = '#28a745';
        } else {
            this.style.borderColor = 'rgba(255,255,255,0.2)';
        }
    });

    // Auto-focus on username field
    document.addEventListener('DOMContentLoaded', function() {
        document.getElementById('username').focus();
    });

    // Enter key navigation between fields
    document.getElementById('username').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('email').focus();
        }
    });

    document.getElementById('email').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('password').focus();
        }
    });

    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('confirmPassword').focus();
        }
    });

    document.getElementById('confirmPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            document.getElementById('registerForm').submit();
        }
    });
</script>
```

</body>
</html>

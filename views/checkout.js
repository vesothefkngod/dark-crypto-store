<!DOCTYPE html>
<html lang="bg">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Checkout - TumnaMreja Market</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .checkout-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .checkout-header {
            background: linear-gradient(45deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .checkout-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            padding: 30px;
        }
        
        .order-summary {
            background: #f8f9fa;
            padding: 25px;
            border-radius: 10px;
            border: 2px solid #e9ecef;
        }
        
        .order-item {
            display: flex;
            justify-content: between;
            padding: 15px 0;
            border-bottom: 1px solid #dee2e6;
        }
        
        .order-item:last-child {
            border-bottom: none;
            font-weight: bold;
            font-size: 1.2em;
            color: #28a745;
        }
        
        .payment-form {
            background: #fff;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #495057;
        }
        
        input[type="email"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input[type="email"]:focus {
            outline: none;
            border-color: #667eea;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        
        .payment-methods {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 25px;
        }
        
        .payment-method {
            position: relative;
            border: 2px solid #dee2e6;
            border-radius: 10px;
            padding: 20px;
            cursor: pointer;
            transition: all 0.3s;
            text-align: center;
        }
        
        .payment-method:hover {
            border-color: #667eea;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .payment-method.selected {
            border-color: #28a745;
            background: #d4edda;
        }
        
        .payment-method input {
            position: absolute;
            opacity: 0;
            cursor: pointer;
        }
        
        .payment-logo {
            width: 60px;
            height: 60px;
            background: linear-gradient(45deg, #ff6b6b, #feca57);
            border-radius: 50%;
            margin: 0 auto 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
            font-weight: bold;
        }
        
        .wolvpay-logo {
            background: linear-gradient(45deg, #ff6b6b, #ee5a24);
        }
        
        .oxapay-logo {
            background: linear-gradient(45deg, #0066cc, #004499);
        }
        
        .payment-name {
            font-weight: 600;
            color: #495057;
            margin-bottom: 5px;
        }
        
        .payment-desc {
            font-size: 0.9em;
            color: #6c757d;
        }
        
        .checkout-btn {
            width: 100%;
            background: linear-gradient(45deg, #28a745, #20c997);
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .checkout-btn:hover:not(:disabled) {
            background: linear-gradient(45deg, #218838, #1e7e34);
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }
        
        .checkout-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }
        
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }
        
        .payment-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.8);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        
        .modal-content {
            background: white;
            padding: 30px;
            border-radius: 15px;
            max-width: 500px;
            width: 90%;
            text-align: center;
        }
        
        .qr-code {
            margin: 20px 0;
        }
        
        .crypto-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            text-align: left;
        }
        
        .copy-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
            margin-left: 10px;
        }
        
        @media (max-width: 768px) {
            .checkout-content {
                grid-template-columns: 1fr;
            }
            
            .payment-methods {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="checkout-container">
        <div class="checkout-header">
            <h1>💎 Crypto Checkout</h1>
            <p>Secure payments with cryptocurrency</p>
        </div>
        
        <div class="checkout-content">
            <div class="order-summary">
                <h3>📦 Order Summary</h3>
                <% if (cartItems && cartItems.length > 0) { %>
                    <% cartItems.forEach(item => { %>
                        <div class="order-item">
                            <div>
                                <strong><%= item.name %></strong><br>
                                <small>Qty: <%= item.quantity %> × $<%= item.price.toFixed(2) %></small>
                            </div>
                            <div>$<%= item.itemTotal.toFixed(2) %></div>
                        </div>
                    <% }) %>
                    <div class="order-item">
                        <div><strong>Total:</strong></div>
                        <div><strong>$<%= total %></strong></div>
                    </div>
                <% } else { %>
                    <p>Your cart is empty</p>
                <% } %>
            </div>
            
            <div class="payment-form">
                <form id="checkoutForm">
                    <div class="form-group">
                        <label for="email">📧 Email Address:</label>
                        <input type="email" id="email" name="email" required 
                               placeholder="your@email.com">
                    </div>
                    
                    <div class="form-group">
                        <label>💰 Choose Payment Method:</label>
                        <div class="payment-methods">
                            <div class="payment-method" onclick="selectPayment('wolvpay')">
                                <input type="radio" name="paymentMethod" value="wolvpay" id="wolvpay">
                                <div class="payment-logo wolvpay-logo">W</div>
                                <div class="payment-name">WolvPay</div>
                                <div class="payment-desc">Fast & Secure</div>
                            </div>
                            
                            <div class="payment-method" onclick="selectPayment('oxapay')">
                                <input type="radio" name="paymentMethod" value="oxapay" id="oxapay">
                                <div class="payment-logo oxapay-logo">O</div>
                                <div class="payment-name">OxaPay</div>
                                <div class="payment-desc">Multi-Crypto</div>
                            </div>
                        </div>
                    </div>
                    
                    <button type="submit" class="checkout-btn" id="checkoutBtn">
                        🚀 Process Payment - $<%= total %>
                    </button>
                    
                    <input type="hidden" name="cartItems" value='<%= JSON.stringify(cartItems) %>'>
                    <input type="hidden" name="total" value="<%= total %>">
                </form>
                
                <div class="loading" id="loading">
                    <div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 50px; height: 50px; animation: spin 2s linear infinite; margin: 0 auto;"></div>
                    <p style="margin-top: 15px;">Creating payment...</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Payment Modal -->
    <div class="payment-modal" id="paymentModal">
        <div class="modal-content">
            <h3 id="modalTitle">💎 Complete Your Payment</h3>
            <div id="modalContent"></div>
            <button onclick="closeModal()" style="margin-top: 20px; padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">Close</button>
        </div>
    </div>
    
    <script>
        function selectPayment(method) {
            // Remove selected class from all methods
            document.querySelectorAll('.payment-method').forEach(el => {
                el.classList.remove('selected');
            });
            
            // Add selected class to chosen method
            const selectedMethod = document.querySelector(`.payment-method input[value="${method}"]`).closest('.payment-method');
            selectedMethod.classList.add('selected');
            
            // Check the radio button
            document.getElementById(method).checked = true;
        }
        
        function showLoading() {
            document.getElementById('checkoutForm').style.display = 'none';
            document.getElementById('loading').style.display = 'block';
            document.getElementById('checkoutBtn').disabled = true;
        }
        
        function hideLoading() {
            document.getElementById('checkoutForm').style.display = 'block';
            document.getElementById('loading').style.display = 'none';
            document.getElementById('checkoutBtn').disabled = false;
        }
        
        function showPaymentModal(paymentData) {
            const modal = document.getElementById('paymentModal');
            const content = document.getElementById('modalContent');
            
            if (paymentData.paymentUrl) {
                // For cases where we have a direct payment URL
                content.innerHTML = `
                    <p>Click the button below to complete your payment:</p>
                    <a href="${paymentData.paymentUrl}" target="_blank" 
                       style="display: inline-block; background: #28a745; color: white; 
                              padding: 15px 30px; text-decoration: none; border-radius: 8px; 
                              margin: 20px; font-weight: bold;">
                        💳 Pay Now
                    </a>
                    <p><small>Payment will open in a new window</small></p>
                `;
            } else if (paymentData.paymentDetails) {
                // For cases where we show crypto details
                const details = paymentData.paymentDetails;
                content.innerHTML = `
                    <div class="crypto-details">
                        ${details.address ? `
                            <div style="margin-bottom: 15px;">
                                <strong>Address:</strong><br>
                                <code style="background: #e9ecef; padding: 5px; border-radius: 3px; word-break: break-all;">
                                    ${details.address}
                                </code>
                                <button class="copy-btn" onclick="copyToClipboard('${details.address}')">Copy</button>
                            </div>
                        ` : ''}
                        
                        ${details.amount ? `
                            <div style="margin-bottom: 15px;">
                                <strong>Amount:</strong> ${details.amount} ${details.currency || 'BTC'}
                                <button class="copy-btn" onclick="copyToClipboard('${details.amount}')">Copy</button>
                            </div>
                        ` : ''}
                        
                        ${details.qr_code ? `
                            <div class="qr-code">
                                <img src="${details.qr_code}" alt="QR Code" style="max-width: 200px;">
                            </div>
                        ` : ''}
                    </div>
                    <p style="color: #28a745; font-weight: bold;">
                        ✅ Payment will be confirmed automatically
                    </p>
                `;
            }
            
            modal.style.display = 'flex';
        }
        
        function closeModal() {
            document.getElementById('paymentModal').style.display = 'none';
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
                alert('Copied to clipboard!');
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                alert('Copied to clipboard!');
            });
        }
        
        document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const email = formData.get('email');
            const paymentMethod = formData.get('paymentMethod');
            const cartItems = formData.get('cartItems');
            const total = formData.get('total');
            
            if (!paymentMethod) {
                alert('Please select a payment method');
                return;
            }
            
            showLoading();
            
                            try {
                const response = await fetch('/process-payment', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email,
                        paymentMethod,
                        cartItems,
                        total
                    })
                });
                
                const result = await response.json();
                
                hideLoading();
                
                if (result.success) {
                    showPaymentModal(result);
                } else {
                    alert('Payment creation failed: ' + (result.error || 'Unknown error'));
                }
                
            } catch (error) {
                hideLoading();
                console.error('Payment error:', error);
                alert('Payment processing failed. Please try again.');
            }
        });
        
        // Add spinning animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    </script>
</body>
</html>

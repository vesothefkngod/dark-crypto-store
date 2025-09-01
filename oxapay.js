// oxapay.js
require('dotenv').config();
const axios = require('axios');

const OXAPAY_API_URL = 'https://api.oxapay.com/merchant/invoice';
const API_KEY = process.env.OXAPAY_API_KEY;

async function createInvoice({ amount, currency, order_id }) {
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
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('OxaPay error:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = { createInvoice };

require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class Coinbase {
  constructor() {
    this.apiKey = process.env.COINBASE_API_KEY;
    this.privateKey = process.env.COINBASE_API_SECRET.replace(/\\n/g, '\n').trim();
    this.baseURL = 'https://api.coinbase.com/api/v3/brokerage';
  }

  generateJWT(method, path) {
    // CRITICAL: Generate fresh JWT for EVERY request
    // URI must exactly match: "METHOD api.coinbase.com/path" (no https://, no query params)
    // Remove query string if present
    const cleanPath = path.split('?')[0];
    const uri = `${method.toUpperCase()} api.coinbase.com${cleanPath}`;

    // Fresh timestamps for every request - CRITICAL: regenerate for every call
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      exp: now + 120, // 2 minute expiry
      iss: 'cdp', // Coinbase Developer Platform (NOT 'coinbase-cloud')
      nbf: now, // Not before - CRITICAL: must be fresh
      sub: this.apiKey,
      uri: uri // Must exactly match: "METHOD api.coinbase.com/path"
    };

    // ES256 algorithm (EC P-256 ECDSA) - CRITICAL: must be ES256
    return jwt.sign(payload, this.privateKey, {
      algorithm: 'ES256',
      noTimestamp: true, // Don't auto-add 'iat' - match Python SDK exactly
      header: {
        alg: 'ES256',
        kid: this.apiKey,
        nonce: crypto.randomBytes(16).toString('hex')
      }
    });
  }

  async request(method, path) {
    // Path should be relative to baseURL (which already includes /api/v3/brokerage)
    // For JWT, we need the full path: /api/v3/brokerage/accounts
    // For URL, we use baseURL + relative path: /accounts
    const jwtPath = path.startsWith('/api/v3/brokerage') ? path : `/api/v3/brokerage${path}`;
    const urlPath = path.startsWith('/api/v3/brokerage') ? path.replace('/api/v3/brokerage', '') : path;

    // Generate fresh JWT for every request
    const token = this.generateJWT(method, jwtPath);

    const response = await axios({
      method,
      url: `${this.baseURL}${urlPath}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }

  async getProducts() {
    return this.request('GET', '/products');
  }

  async getBook(productId) {
    return this.request('GET', `/products/${productId}/book`);
  }
}

// Test it
async function test() {
  const cb = new Coinbase();
  try {
    // Test accounts endpoint (like Python example)
    console.log('Testing accounts endpoint...');
    const accounts = await cb.request('GET', '/accounts');
    console.log('✅ Success! Accounts:', accounts.accounts?.length || 0);

    console.log('\nTesting products...');
    const products = await cb.getProducts();
    console.log('✅ Success! Products:', products.products?.length || 0);
  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.log('\n⚠️  401 Unauthorized - API key configuration issue');
      console.log('Check: IP whitelist, permissions, key is active');
    }
  }
}

test();


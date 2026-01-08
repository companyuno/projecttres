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

  async getAccounts() {
    return this.request('GET', '/accounts');
  }

  async getFuturesBalanceSummary() {
    return this.request('GET', '/cfm/balance_summary');
  }

  async listPerpsPositions(portfolioUuid) {
    return this.request('GET', `/cfm/positions?portfolio_uuid=${portfolioUuid}`);
  }

  async getPerpsPosition(portfolioUuid, symbol) {
    return this.request('GET', `/cfm/positions/${symbol}?portfolio_uuid=${portfolioUuid}`);
  }

  /**
   * Get historical candles for a product
   * @param {string} productId - e.g., "BTC-USD"
   * @param {string} start - ISO 8601 timestamp (e.g., "2024-01-01T00:00:00Z")
   * @param {string} end - ISO 8601 timestamp
   * @param {string} granularity - ONE_MINUTE, FIVE_MINUTE, FIFTEEN_MINUTE, THIRTY_MINUTE, ONE_HOUR, TWO_HOUR, SIX_HOUR, ONE_DAY
   * @returns {Promise} Array of candles: [{start, low, high, open, close, volume}]
   */
  async getCandles(productId, start, end, granularity = 'FIVE_MINUTE') {
    // Note: JWT uri must NOT include query params, but axios URL can
    const path = `/products/${productId}/candles`;
    const queryParams = `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&granularity=${granularity}`;

    // For JWT: path only (no query)
    // For axios: path + query
    const jwtPath = `/api/v3/brokerage${path}`;
    const urlPath = `${path}${queryParams}`;

    const token = this.generateJWT('GET', jwtPath);

    const response = await axios({
      method: 'GET',
      url: `${this.baseURL}${urlPath}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  }
}

module.exports = Coinbase;


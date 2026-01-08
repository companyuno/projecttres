require('dotenv').config();
const WebSocket = require('ws');
const EventEmitter = require('events');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Coinbase WebSocket Client for candles channel
 * Streams real-time 5-minute candle data for VWAP calculation
 */
class CoinbaseWebSocket extends EventEmitter {
  constructor(productId) {
    super();
    this.productId = productId;
    this.ws = null;
    this.url = 'wss://advanced-trade-ws.coinbase.com';
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.isConnecting = false;
    this.isConnected = false;

    // API credentials for JWT auth (required for candles channel)
    this.apiKey = process.env.COINBASE_API_KEY;
    this.privateKey = process.env.COINBASE_API_SECRET.replace(/\\n/g, '\n').trim();
  }

  /**
   * Generate JWT for WebSocket authentication
   */
  generateJWT() {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      exp: now + 120,
      iss: 'cdp',
      nbf: now,
      sub: this.apiKey
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'ES256',
      noTimestamp: true,
      header: {
        alg: 'ES256',
        kid: this.apiKey,
        nonce: crypto.randomBytes(16).toString('hex')
      }
    });
  }

  /**
   * Connect to WebSocket and subscribe to candles channel
   */
  connect() {
    if (this.isConnecting || this.isConnected) {
      return;
    }

    this.isConnecting = true;
    console.log(`🔌 Connecting to Coinbase WebSocket for ${this.productId}...`);

    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log('✅ WebSocket connected');
      this.isConnecting = false;
      this.isConnected = true;
      this.reconnectDelay = 1000;
      this.subscribe();
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('⚠️ WebSocket disconnected');
      this.isConnected = false;
      this.emit('disconnected');
      this.reconnect();
    });
  }

  /**
   * Subscribe to candles channel (requires JWT auth) and ticker channel
   */
  subscribe() {
    const token = this.generateJWT();

    // Subscribe to ticker channel (no auth needed) for real-time price updates
    const subscribeTicker = {
      type: 'subscribe',
      product_ids: [this.productId],
      channel: 'ticker'
    };

    console.log(`📡 Subscribing to ticker channel for ${this.productId}...`);
    this.ws.send(JSON.stringify(subscribeTicker));

    // Subscribe to candles channel (requires JWT) for VWAP calculation
    setTimeout(() => {
      const subscribeCandles = {
        type: 'subscribe',
        product_ids: [this.productId],
        channel: 'candles',
        jwt: token
      };

      console.log(`📡 Subscribing to candles channel for ${this.productId}...`);
      this.ws.send(JSON.stringify(subscribeCandles));
    }, 500); // Small delay to ensure ticker subscription goes first
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(message) {
    // Handle subscription confirmation
    if (message.channel === 'subscriptions') {
      console.log('✅ Subscription confirmed');
      this.emit('subscribed');
      return;
    }

    // Handle errors
    if (message.type === 'error') {
      console.error('❌ WebSocket error:', message.message);
      this.emit('error', new Error(message.message));
      return;
    }

    // Handle ticker updates (for real-time price)
    if (message.channel === 'ticker' && message.events) {
      message.events.forEach(event => {
        if (event.type === 'update' && event.tickers) {
          event.tickers.forEach(ticker => {
            // Emit ticker data for real-time price updates
            this.emit('ticker', {
              product_id: ticker.product_id,
              price: parseFloat(ticker.price),
              time: ticker.time || new Date().toISOString()
            });
          });
        }
      });
    }

    // Handle candle updates (for VWAP calculation)
    if (message.channel === 'candles' && message.events) {
      message.events.forEach(event => {
        if (event.type === 'update' && event.candles) {
          event.candles.forEach(candle => {
            // Emit candle data for VWAP calculation
            this.emit('candle', {
              product_id: candle.product_id,
              start: parseInt(candle.start),
              open: parseFloat(candle.open),
              high: parseFloat(candle.high),
              low: parseFloat(candle.low),
              close: parseFloat(candle.close),
              volume: parseFloat(candle.volume)
            });
          });
        }
      });
    }
  }

  /**
   * Reconnect with exponential backoff
   */
  reconnect() {
    if (this.isConnecting) {
      return;
    }

    console.log(`🔄 Reconnecting in ${this.reconnectDelay}ms...`);

    setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  /**
   * Disconnect WebSocket
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
  }
}

module.exports = CoinbaseWebSocket;

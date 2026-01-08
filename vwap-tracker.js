require('dotenv').config();
const EventEmitter = require('events');
const RollingVWAP = require('./rolling-vwap');
const CoinbaseWebSocket = require('./coinbase-websocket');
const Coinbase = require('./coinbase');

/**
 * VWAP Tracker - Orchestrates VWAP calculation
 * 1. Fetches 24h historical candles via REST API
 * 2. Initializes VWAP from historical data
 * 3. Switches to WebSocket for real-time candle updates
 */
class VWAPTracker extends EventEmitter {
  constructor(productId, windowHours = 12) {
    super();
    this.productId = productId;
    this.windowHours = windowHours;

    // Initialize components
    // VWAP uses 12h window, deviation history uses 72h window
    this.rollingVWAP = new RollingVWAP(productId, windowHours, 72);
    this.ws = new CoinbaseWebSocket(productId);
    this.coinbase = new Coinbase();

    // Setup WebSocket event handlers
    this.setupWebSocketHandlers();

    // Periodic cleanup of old candles
    this.cleanupInterval = setInterval(() => {
      this.rollingVWAP.removeOldCandles();
      this.rollingVWAP.updateStats();
      this.emitUpdate();
    }, 60000); // Every minute
  }

  /**
   * Setup WebSocket event handlers
   */
  setupWebSocketHandlers() {
    // Handle ticker updates (real-time price)
    this.ws.on('ticker', (ticker) => {
      if (ticker.product_id === this.productId) {
        // Update price immediately from ticker (doesn't affect VWAP)
        this.rollingVWAP.updatePrice(ticker.price);
        this.emitUpdate();
      }
    });

    // Handle candle updates (for VWAP calculation)
    this.ws.on('candle', (candle) => {
      if (candle.product_id === this.productId) {
        this.rollingVWAP.updateCandle(candle);
        this.emitUpdate();
      }
    });

    this.ws.on('connected', () => {
      console.log('✅ WebSocket connected, receiving real-time updates');
      this.emit('status', { connected: true });
    });

    this.ws.on('subscribed', () => {
      console.log('✅ Subscribed to ticker and candles channels');
    });

    this.ws.on('disconnected', () => {
      console.log('⚠️ WebSocket disconnected, VWAP tracking paused');
      this.emit('status', { connected: false });
    });

    this.ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Emit update event with current VWAP stats
   */
  emitUpdate() {
    const stats = this.rollingVWAP.getStats();
    this.emit('update', stats);
  }

  /**
   * Fetch historical candles from REST API
   * For 72-hour deviation history initialization, we need 144 hours of candles
   * Coinbase limit is 350 candles per request, so we may need multiple calls
   * @param {number} hours - Number of hours to fetch
   * @returns {Promise<Array>} Array of candle objects
   */
  async fetchHistoricalCandles(hours = this.windowHours) {
    console.log(`📊 Fetching ${hours}h historical candles for ${this.productId}...`);

    const COINBASE_CANDLE_LIMIT = 350;
    const candlesPerHour = 12; // 5-minute candles = 12 per hour
    const totalCandlesNeeded = hours * candlesPerHour;
    const end = Math.floor(Date.now() / 1000);
    const start = end - (hours * 60 * 60);

    // Check if we need multiple API calls
    if (totalCandlesNeeded <= COINBASE_CANDLE_LIMIT) {
      // Single call is sufficient
      try {
        const response = await this.coinbase.getCandles(
          this.productId,
          start.toString(),
          end.toString(),
          'FIVE_MINUTE'
        );

        const candles = response.candles || [];
        console.log(`✅ Fetched ${candles.length} historical candles in 1 call`);
        return candles;
      } catch (error) {
        console.error('❌ Failed to fetch historical candles:', error.message);
        return [];
      }
    } else {
      // Need multiple calls due to 350 candle limit
      const allCandles = [];
      let currentStart = start;
      let callNumber = 1;

      while (currentStart < end) {
        // Calculate how many candles we can fetch in this call
        const hoursForThisCall = Math.floor(COINBASE_CANDLE_LIMIT / candlesPerHour);
        const currentEnd = Math.min(
          currentStart + (hoursForThisCall * 60 * 60),
          end
        );

        try {
          console.log(`📡 Fetching batch ${callNumber} (${new Date(currentStart * 1000).toISOString()} to ${new Date(currentEnd * 1000).toISOString()})...`);

          const response = await this.coinbase.getCandles(
            this.productId,
            currentStart.toString(),
            currentEnd.toString(),
            'FIVE_MINUTE'
          );

          const candles = response.candles || [];
          allCandles.push(...candles);
          console.log(`✅ Batch ${callNumber}: Fetched ${candles.length} candles`);

          // Move to next batch
          currentStart = currentEnd;
          callNumber++;

          // Small delay to avoid rate limiting
          if (currentStart < end) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`❌ Failed to fetch batch ${callNumber}:`, error.message);
          break; // Stop on error
        }
      }

      console.log(`✅ Fetched ${allCandles.length} total historical candles in ${callNumber - 1} call(s)`);
      return allCandles;
    }
  }

  /**
   * Start tracking VWAP
   * Fetches historical data first, then connects WebSocket
   */
  async start() {
    console.log(`🚀 Starting VWAP tracker for ${this.productId}...`);

    // Step 1: Fetch 144 hours of historical candles for 72-hour deviation history initialization
    // (Need 72h * 2 = 144h to calculate VWAP at each point in the 72h window)
    const allHistoricalCandles = await this.fetchHistoricalCandles(144);

    if (allHistoricalCandles.length > 0) {
      // Step 2: Initialize deviation history from all 48 hours of data
      this.rollingVWAP.initializeDeviationHistory(allHistoricalCandles);

      // Step 3: Initialize VWAP with the most recent 12 hours of candles
      const now = Math.floor(Date.now() / 1000);
      const vwapStartTime = now - (this.windowHours * 60 * 60);

      const recentCandles = allHistoricalCandles.filter(candle => {
        const start = typeof candle.start === 'string' ? parseInt(candle.start) : candle.start;
        return start >= vwapStartTime;
      });

      if (recentCandles.length > 0) {
        this.rollingVWAP.initialize(recentCandles);
        this.emitUpdate();
      } else {
        console.log('⚠️ No recent candles for VWAP initialization');
      }
    } else {
      console.log('⚠️ No historical data available, starting with empty window');
    }

    // Step 4: Connect WebSocket for real-time updates
    console.log('🔌 Connecting WebSocket for real-time updates...');
    this.ws.connect();
  }

  /**
   * Stop tracking
   */
  stop() {
    console.log('🛑 Stopping VWAP tracker...');
    this.ws.disconnect();
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Get current VWAP stats
   */
  getStats() {
    return this.rollingVWAP.getStats();
  }

  /**
   * Get connection status
   */
  isConnected() {
    return this.ws.isConnected;
  }
}

module.exports = VWAPTracker;

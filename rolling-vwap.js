/**
 * RollingVWAP - Continuous VWAP calculator using rolling window (default 12 hours)
 * Uses 5-minute candles for accurate volume-weighted calculation
 */

class RollingVWAP {
  constructor(productId, windowHours = 12, deviationHistoryWindowHours = 72) {
    this.productId = productId;
    this.windowHours = windowHours; // VWAP window (12h)
    this.deviationHistoryWindowHours = deviationHistoryWindowHours; // Deviation history window (72h)
    this.candleIntervalSeconds = 300; // 5-minute candles
    this.maxCandles = (windowHours * 60 * 60) / this.candleIntervalSeconds; // 144 for 12h

    // Store candles in rolling window (keyed by start timestamp)
    this.candles = new Map();

    // Running totals for O(1) updates
    this.totalPriceVolume = 0;
    this.totalVolume = 0;

    // Current stats
    this.currentVWAP = null;
    this.currentPrice = null;
    this.lastUpdate = null;

    // Track current in-progress candle
    this.currentCandleStart = null;

    // Deviation history (rolling 72-hour window)
    this.deviationHistory = [];
  }

  /**
   * Initialize with historical candles from REST API
   * @param {Array} candles - Array of candle objects from REST API
   */
  initialize(candles) {
    console.log(`📊 Initializing VWAP with ${candles.length} historical candles...`);

    // Clear existing data
    this.candles.clear();
    this.totalPriceVolume = 0;
    this.totalVolume = 0;

    // Sort by start time (oldest first)
    const sortedCandles = candles.sort((a, b) => {
      const startA = typeof a.start === 'string' ? parseInt(a.start) : a.start;
      const startB = typeof b.start === 'string' ? parseInt(b.start) : b.start;
      return startA - startB;
    });

    // Add each candle
    sortedCandles.forEach(candle => {
      const start = typeof candle.start === 'string' ? parseInt(candle.start) : candle.start;
      const high = parseFloat(candle.high);
      const low = parseFloat(candle.low);
      const close = parseFloat(candle.close);
      const volume = parseFloat(candle.volume);

      // Typical price for VWAP
      const typicalPrice = (high + low + close) / 3;

      this.candles.set(start, {
        start,
        high,
        low,
        close,
        volume,
        typicalPrice,
        priceVolume: typicalPrice * volume
      });

      this.totalPriceVolume += typicalPrice * volume;
      this.totalVolume += volume;
    });

    // Set current price from latest candle
    if (sortedCandles.length > 0) {
      const latestCandle = sortedCandles[sortedCandles.length - 1];
      this.currentPrice = parseFloat(latestCandle.close);
      this.currentCandleStart = typeof latestCandle.start === 'string'
        ? parseInt(latestCandle.start)
        : latestCandle.start;
      this.lastUpdate = Date.now();
    }

    this.updateStats();
    console.log(`✅ VWAP initialized: $${this.currentVWAP?.toFixed(2)} from ${this.candles.size} candles`);
  }

  /**
   * Initialize deviation history from historical candles
   * Builds deviation history for the last 72 hours by calculating VWAP at each point
   * @param {Array} allCandles - Array of all historical candles (144 hours worth for 72h history)
   */
  initializeDeviationHistory(allCandles) {
    console.log(`📊 Initializing deviation history from ${allCandles.length} historical candles...`);

    // Clear existing history
    this.deviationHistory = [];

    // Sort by start time (oldest first)
    const sortedCandles = allCandles.sort((a, b) => {
      const startA = typeof a.start === 'string' ? parseInt(a.start) : a.start;
      const startB = typeof b.start === 'string' ? parseInt(b.start) : b.start;
      return startA - startB;
    });

    const now = Math.floor(Date.now() / 1000);
    const historyStartTime = now - (this.deviationHistoryWindowHours * 60 * 60); // 72 hours ago

    // Process candles chronologically
    // For each candle in the last 24 hours, calculate VWAP at that moment
    for (let i = 0; i < sortedCandles.length; i++) {
      const candle = sortedCandles[i];
      const candleStart = typeof candle.start === 'string' ? parseInt(candle.start) : candle.start;
      const candleClose = parseFloat(candle.close);

      // Only record deviations for candles in the last 72 hours
      if (candleStart < historyStartTime) {
        continue; // Skip candles older than 72 hours
      }

      // Calculate VWAP at this moment using the VWAP window (12h) ending at this candle
      const windowStart = candleStart - (this.windowHours * 60 * 60);

      // Find all candles within the VWAP window ending at this candle
      let windowPriceVolume = 0;
      let windowVolume = 0;

      for (let j = 0; j <= i; j++) {
        const windowCandle = sortedCandles[j];
        const windowCandleStart = typeof windowCandle.start === 'string'
          ? parseInt(windowCandle.start)
          : windowCandle.start;

        // Include candles within the 24-hour window
        if (windowCandleStart >= windowStart && windowCandleStart <= candleStart) {
          const high = parseFloat(windowCandle.high);
          const low = parseFloat(windowCandle.low);
          const close = parseFloat(windowCandle.close);
          const volume = parseFloat(windowCandle.volume);
          const typicalPrice = (high + low + close) / 3;

          windowPriceVolume += typicalPrice * volume;
          windowVolume += volume;
        }
      }

      // Calculate VWAP at this moment
      const vwapAtMoment = windowVolume > 0 ? windowPriceVolume / windowVolume : null;

      if (vwapAtMoment !== null) {
        const deviation = candleClose - vwapAtMoment;
        const deviationPercent = (deviation / vwapAtMoment) * 100;

        // Record deviation snapshot
        this.deviationHistory.push({
          timestamp: candleStart,
          price: candleClose,
          vwap: vwapAtMoment,
          deviation: deviation,
          deviationPercent: deviationPercent
        });
      }
    }

    // Sort by timestamp (oldest first)
    this.deviationHistory.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`✅ Deviation history initialized with ${this.deviationHistory.length} snapshots`);
  }

  /**
   * Record a deviation snapshot (called when candle updates)
   * Uses the candle's start timestamp to ensure one deviation per candle
   */
  recordDeviation() {
    if (!this.currentVWAP || !this.currentPrice || !this.currentCandleStart) {
      return;
    }

    const deviation = this.currentPrice - this.currentVWAP;
    const deviationPercent = (deviation / this.currentVWAP) * 100;
    const candleTimestamp = this.currentCandleStart; // Use candle's start timestamp, not current time

    // Check if we already have a deviation for this candle timestamp
    const existingIndex = this.deviationHistory.findIndex(
      d => d.timestamp === candleTimestamp
    );

    const snapshot = {
      timestamp: candleTimestamp,
      price: this.currentPrice,
      vwap: this.currentVWAP,
      deviation: deviation,
      deviationPercent: deviationPercent
    };

    if (existingIndex >= 0) {
      // Update existing entry for this candle (candle updated in real-time)
      this.deviationHistory[existingIndex] = snapshot;
    } else {
      // Add new snapshot for this candle
      this.deviationHistory.push(snapshot);
      // Keep sorted by timestamp (oldest first)
      this.deviationHistory.sort((a, b) => a.timestamp - b.timestamp);
    }

    // Prune old entries (older than 72 hours)
    const now = Math.floor(Date.now() / 1000);
    const cutoffTime = now - (this.deviationHistoryWindowHours * 60 * 60);
    this.deviationHistory = this.deviationHistory.filter(
      entry => entry.timestamp >= cutoffTime
    );
  }

  /**
   * Update with a new candle from WebSocket
   * @param {Object} candle - Candle object from WebSocket
   */
  updateCandle(candle) {
    const start = typeof candle.start === 'string' ? parseInt(candle.start) : candle.start;
    const high = parseFloat(candle.high);
    const low = parseFloat(candle.low);
    const close = parseFloat(candle.close);
    const volume = parseFloat(candle.volume);

    // Typical price for VWAP
    const typicalPrice = (high + low + close) / 3;
    const priceVolume = typicalPrice * volume;

    // Check if this candle already exists (update in progress)
    if (this.candles.has(start)) {
      // Remove old values from running totals
      const oldCandle = this.candles.get(start);
      this.totalPriceVolume -= oldCandle.priceVolume;
      this.totalVolume -= oldCandle.volume;
    } else {
      // New candle - remove oldest if we exceed max
      this.removeOldCandles();
    }

    // Add/update the candle
    this.candles.set(start, {
      start,
      high,
      low,
      close,
      volume,
      typicalPrice,
      priceVolume
    });

    // Update running totals
    this.totalPriceVolume += priceVolume;
    this.totalVolume += volume;

    // Update current price and timestamp
    this.currentPrice = close;
    this.currentCandleStart = start;
    this.lastUpdate = Date.now();

    // Recalculate VWAP
    this.updateStats();

    // Record deviation snapshot
    this.recordDeviation();
  }

  /**
   * Remove candles older than the rolling window
   */
  removeOldCandles() {
    const now = Math.floor(Date.now() / 1000);
    const cutoffTime = now - (this.windowHours * 60 * 60);

    // Remove candles older than cutoff
    for (const [start, candle] of this.candles) {
      if (start < cutoffTime) {
        this.totalPriceVolume -= candle.priceVolume;
        this.totalVolume -= candle.volume;
        this.candles.delete(start);
      }
    }

    // Also enforce max candles limit
    while (this.candles.size > this.maxCandles) {
      const oldestStart = Math.min(...this.candles.keys());
      const oldCandle = this.candles.get(oldestStart);
      this.totalPriceVolume -= oldCandle.priceVolume;
      this.totalVolume -= oldCandle.volume;
      this.candles.delete(oldestStart);
    }

    // Prune old deviation history entries (using 72-hour window)
    const deviationCutoffTime = now - (this.deviationHistoryWindowHours * 60 * 60);
    this.deviationHistory = this.deviationHistory.filter(
      entry => entry.timestamp >= deviationCutoffTime
    );
  }

  /**
   * Update current VWAP and stats
   */
  updateStats() {
    if (this.totalVolume > 0) {
      this.currentVWAP = this.totalPriceVolume / this.totalVolume;
    } else {
      this.currentVWAP = null;
    }
  }

  /**
   * Get current VWAP value
   */
  getVWAP() {
    return this.currentVWAP;
  }

  /**
   * Update current price from ticker (doesn't affect VWAP)
   * @param {number} price - New price from ticker
   */
  updatePrice(price) {
    this.currentPrice = parseFloat(price);
    this.lastUpdate = Date.now();
  }

  /**
   * Get current price (latest from ticker or candle)
   */
  getCurrentPrice() {
    return this.currentPrice;
  }

  /**
   * Get price deviation from VWAP
   */
  getDeviation() {
    if (!this.currentVWAP || !this.currentPrice) {
      return null;
    }
    return this.currentPrice - this.currentVWAP;
  }

  /**
   * Get price deviation as percentage
   */
  getDeviationPercent() {
    if (!this.currentVWAP || !this.currentPrice) {
      return null;
    }
    return ((this.currentPrice - this.currentVWAP) / this.currentVWAP) * 100;
  }

  /**
   * Get status (above/below VWAP)
   */
  getStatus() {
    const deviation = this.getDeviation();
    if (deviation === null) return null;
    return deviation > 0 ? 'above' : 'below';
  }

  /**
   * Get deviation statistics from history
   */
  getDeviationStats() {
    if (this.deviationHistory.length === 0) {
      return null;
    }

    const deviations = this.deviationHistory.map(d => d.deviation);
    const deviationPercents = this.deviationHistory.map(d => d.deviationPercent);

    // Calculate percentiles
    const sortedDeviations = [...deviations].sort((a, b) => a - b);
    const sortedPercentDeviations = [...deviationPercents].sort((a, b) => a - b);

    const percentile = (arr, p) => {
      if (arr.length === 0) return null;
      const index = Math.floor((p / 100) * arr.length);
      return arr[Math.min(index, arr.length - 1)];
    };

    // Current deviation percentile rank
    const currentDeviation = this.getDeviation();
    const currentPercentile = currentDeviation !== null
      ? (sortedDeviations.filter(d => d <= currentDeviation).length / sortedDeviations.length) * 100
      : null;

    return {
      count: this.deviationHistory.length,
      min: Math.min(...deviations),
      max: Math.max(...deviations),
      minPercent: Math.min(...deviationPercents),
      maxPercent: Math.max(...deviationPercents),
      average: deviations.reduce((a, b) => a + b, 0) / deviations.length,
      averagePercent: deviationPercents.reduce((a, b) => a + b, 0) / deviationPercents.length,
      percentile1: percentile(sortedDeviations, 1),
      percentile5: percentile(sortedDeviations, 5),
      percentile10: percentile(sortedDeviations, 10),
      percentile90: percentile(sortedDeviations, 90),
      percentile95: percentile(sortedDeviations, 95),
      percentile99: percentile(sortedDeviations, 99),
      percentile1Percent: percentile(sortedPercentDeviations, 1),
      percentile5Percent: percentile(sortedPercentDeviations, 5),
      percentile10Percent: percentile(sortedPercentDeviations, 10),
      percentile90Percent: percentile(sortedPercentDeviations, 90),
      percentile95Percent: percentile(sortedPercentDeviations, 95),
      percentile99Percent: percentile(sortedPercentDeviations, 99),
      currentPercentile: currentPercentile
    };
  }

  /**
   * Get all stats in one object
   */
  getStats() {
    const deviationStats = this.getDeviationStats();

    return {
      productId: this.productId,
      vwap: this.currentVWAP,
      currentPrice: this.currentPrice,
      deviation: this.getDeviation(),
      deviationPercent: this.getDeviationPercent(),
      status: this.getStatus(),
      totalCandles: this.candles.size,
      totalVolume: this.totalVolume,
      lastUpdate: this.lastUpdate,
      windowHours: this.windowHours,
      deviationHistory: {
        count: this.deviationHistory.length,
        stats: deviationStats,
        data: this.deviationHistory // Include full history for charting
      }
    };
  }
}

module.exports = RollingVWAP;

/**
 * Trading Strategy - VWAP Deviation Based Strategy
 *
 * Entry Rules:
 * - Short 1: d(t) >= max(p90(t), 0.6%)
 * - Short 2: d(t) >= max(p95(t), 0.75%)
 * - Long 1: d(t) <= min(p10(t), -0.75%)
 * - Long 2: d(t) <= min(p5(t), -0.9%)
 *
 * Exit Rules:
 * - Take Profit: |d(t)| < 0.1%
 * - Stop Loss (Short): d(t) >= +2.25% (absolute only)
 * - Stop Loss (Long): d(t) <= -2.4% (absolute only)
 *
 * Reentry Rules (after stop loss):
 * - After stop loss, wait until deviation enters neutral range: -0.75% <= d(t) <= +0.6%
 * - Only absolute stop loss triggers reentry wait (take profit does not)
 */

class Strategy {
  constructor() {
    // Strategy parameters
    this.SHORT1_THRESHOLD_PERCENT = 0.6;
    this.SHORT2_THRESHOLD_PERCENT = 0.75;
    this.LONG1_THRESHOLD_PERCENT = -0.75;
    this.LONG2_THRESHOLD_PERCENT = -0.9;
    this.TAKE_PROFIT_THRESHOLD = 0.1;
    this.SHORT_STOP_LOSS_ABSOLUTE = 2.25;
    this.LONG_STOP_LOSS_ABSOLUTE = -2.4;

    // Reentry logic - neutral range (absolute thresholds)
    this.NEUTRAL_MIN = -0.75; // -0.75%
    this.NEUTRAL_MAX = 0.6;   // +0.6%

    // Reentry state: null (no wait), 'short' (waiting after short stop), 'long' (waiting after long stop)
    this.waitingForNeutralReentry = null;
  }

  /**
   * Evaluate entry conditions
   * @param {Object} stats - VWAP stats including deviation and percentiles
   * @param {Object} currentPosition - Current position (null if none)
   * @returns {Object} Entry signal: { action: 'enter' | 'add' | 'none', type: 'long' | 'short', level: 'Long1' | 'Long2' | 'Short1' | 'Short2', reason: string }
   */
  evaluateEntry(stats, currentPosition) {
    const deviation = stats.deviationPercent;
    const percentiles = stats.deviationHistory?.stats;

    // Reentry check: If we're waiting for neutral range, check if we can clear the flag
    if (this.waitingForNeutralReentry) {
      // Check if deviation is in neutral range (absolute thresholds)
      if (deviation >= this.NEUTRAL_MIN && deviation <= this.NEUTRAL_MAX) {
        // Clear flag, allow entry evaluation to proceed
        const clearedFrom = this.waitingForNeutralReentry;
        this.waitingForNeutralReentry = null;
        console.log(`✅ Reentry flag cleared: Deviation ${deviation.toFixed(2)}% entered neutral range (${this.NEUTRAL_MIN}% to ${this.NEUTRAL_MAX}%) after ${clearedFrom} stop`);
      } else {
        // Still waiting for neutral range - block all entries
        return {
          action: 'none',
          reason: `Waiting for neutral reentry zone (${this.NEUTRAL_MIN}% to ${this.NEUTRAL_MAX}%). Current deviation: ${deviation.toFixed(2)}%. Last stop: ${this.waitingForNeutralReentry}`
        };
      }
    }

    if (!percentiles) {
      return { action: null, reason: 'Insufficient deviation history' };
    }

    // Get percentile values
    const p90 = percentiles.percentile90Percent || 0;
    const p95 = percentiles.percentile95Percent || 0;
    const p10 = percentiles.percentile10Percent || 0;
    const p5 = percentiles.percentile5Percent || 0;

    // If no position exists, check all entry conditions
    if (!currentPosition) {
      // Check Short 1 entry
      const short1Threshold = Math.max(p90, this.SHORT1_THRESHOLD_PERCENT);
      if (deviation >= short1Threshold) {
        return {
          action: 'enter',
          type: 'short',
          level: 'Short1',
          reason: `Deviation ${deviation.toFixed(2)}% >= max(p90=${p90.toFixed(2)}%, ${this.SHORT1_THRESHOLD_PERCENT}%)`
        };
      }

      // Check Long 1 entry
      const long1Threshold = Math.min(p10, this.LONG1_THRESHOLD_PERCENT);
      if (deviation <= long1Threshold) {
        return {
          action: 'enter',
          type: 'long',
          level: 'Long1',
          reason: `Deviation ${deviation.toFixed(2)}% <= min(p10=${p10.toFixed(2)}%, ${this.LONG1_THRESHOLD_PERCENT}%)`
        };
      }

      return { action: null, reason: 'No entry conditions met' };
    }

    // If position exists, check add conditions (same direction only)
    if (currentPosition.type === 'short') {
      // Can only add Short 2 if Short 1 exists and we don't have Short 2 yet
      if (currentPosition.totalContractCount === 1 && currentPosition.entryLevels.includes('Short1')) {
        // Short 2 requires: deviation >= max(p95, 0.75%)
        // This means: deviation >= p95 AND deviation >= 0.75%
        const short2Threshold = Math.max(p95, this.SHORT2_THRESHOLD_PERCENT);
        if (deviation >= short2Threshold) {
          return {
            action: 'add',
            type: 'short',
            level: 'Short2',
            reason: `Deviation ${deviation.toFixed(2)}% >= max(p95=${p95.toFixed(2)}%, ${this.SHORT2_THRESHOLD_PERCENT}%)`
          };
        }
      }
    } else if (currentPosition.type === 'long') {
      // Can only add Long 2 if Long 1 exists and we don't have Long 2 yet
      if (currentPosition.totalContractCount === 1 && currentPosition.entryLevels.includes('Long1')) {
        // Long 2 requires: deviation <= min(p5, -0.9%)
        // This means: deviation <= p5 AND deviation <= -0.9%
        const long2Threshold = Math.min(p5, this.LONG2_THRESHOLD_PERCENT);
        if (deviation <= long2Threshold) {
          return {
            action: 'add',
            type: 'long',
            level: 'Long2',
            reason: `Deviation ${deviation.toFixed(2)}% <= min(p5=${p5.toFixed(2)}%, ${this.LONG2_THRESHOLD_PERCENT}%)`
          };
        }
      }
    }

    return { action: null, reason: 'No add conditions met' };
  }

  /**
   * Evaluate exit conditions (stop loss and take profit)
   * @param {Object} stats - VWAP stats including deviation and percentiles
   * @param {Object} currentPosition - Current position
   * @returns {Object} Exit signal: { action: 'close' | null, reason: string, exitType: 'stop_loss' | 'take_profit' }
   */
  evaluateExit(stats, currentPosition) {
    if (!currentPosition) {
      return { action: null, reason: 'No position to exit' };
    }

    const deviation = stats.deviationPercent;
    const percentiles = stats.deviationHistory?.stats;

    if (!percentiles) {
      return { action: null, reason: 'Insufficient deviation history' };
    }

    // Check take profit (applies to both long and short)
    if (Math.abs(deviation) < this.TAKE_PROFIT_THRESHOLD) {
      return {
        action: 'close',
        reason: `Take profit: |deviation| = ${Math.abs(deviation).toFixed(2)}% < ${this.TAKE_PROFIT_THRESHOLD}%`,
        exitType: 'take_profit'
      };
    }

    // Check stop loss based on position type (absolute only - no percentile)
    if (currentPosition.type === 'short') {
      const absoluteStop = deviation >= this.SHORT_STOP_LOSS_ABSOLUTE;

      if (absoluteStop) {
        // Set reentry flag: wait for neutral range before allowing entries again
        this.waitingForNeutralReentry = 'short';
        console.log(`🛑 Short stop loss triggered at ${deviation.toFixed(2)}%. Setting reentry flag. Waiting for neutral range (${this.NEUTRAL_MIN}% to ${this.NEUTRAL_MAX}%)`);
        return {
          action: 'close',
          reason: `Stop loss (absolute): deviation ${deviation.toFixed(2)}% >= ${this.SHORT_STOP_LOSS_ABSOLUTE}%`,
          exitType: 'stop_loss'
        };
      }
    } else if (currentPosition.type === 'long') {
      const absoluteStop = deviation <= this.LONG_STOP_LOSS_ABSOLUTE;

      if (absoluteStop) {
        // Set reentry flag: wait for neutral range before allowing entries again
        this.waitingForNeutralReentry = 'long';
        console.log(`🛑 Long stop loss triggered at ${deviation.toFixed(2)}%. Setting reentry flag. Waiting for neutral range (${this.NEUTRAL_MIN}% to ${this.NEUTRAL_MAX}%)`);
        return {
          action: 'close',
          reason: `Stop loss (absolute): deviation ${deviation.toFixed(2)}% <= ${this.LONG_STOP_LOSS_ABSOLUTE}%`,
          exitType: 'stop_loss'
        };
      }
    }

    return { action: null, reason: 'No exit conditions met' };
  }

  /**
   * Get stop loss levels for display (absolute only - no percentile)
   * @param {Object} stats - VWAP stats
   * @param {Object} currentPosition - Current position (null if none)
   * @returns {Object} Stop loss levels: { absolute: number, current: number, waitingForReentry: boolean, reentryNeutralRange: { min: number, max: number } }
   */
  getStopLossLevels(stats, currentPosition) {
    if (!currentPosition) {
      return {
        absolute: null,
        current: stats.deviationPercent || null,
        waitingForReentry: this.waitingForNeutralReentry !== null,
        reentryNeutralRange: {
          min: this.NEUTRAL_MIN,
          max: this.NEUTRAL_MAX
        },
        lastStopType: this.waitingForNeutralReentry
      };
    }

    if (currentPosition.type === 'short') {
      return {
        absolute: this.SHORT_STOP_LOSS_ABSOLUTE,
        current: stats.deviationPercent,
        waitingForReentry: false, // Can't be waiting if position is open
        reentryNeutralRange: null,
        lastStopType: null
      };
    } else {
      return {
        absolute: this.LONG_STOP_LOSS_ABSOLUTE,
        current: stats.deviationPercent,
        waitingForReentry: false, // Can't be waiting if position is open
        reentryNeutralRange: null,
        lastStopType: null
      };
    }
  }

  /**
   * Get reentry status (for display when no position)
   * @returns {Object} Reentry status: { waiting: boolean, lastStopType: string | null, neutralRange: { min: number, max: number } }
   */
  getReentryStatus() {
    return {
      waiting: this.waitingForNeutralReentry !== null,
      lastStopType: this.waitingForNeutralReentry,
      neutralRange: {
        min: this.NEUTRAL_MIN,
        max: this.NEUTRAL_MAX
      }
    };
  }

  /**
   * Calculate strategy entry/exit price levels
   * @param {Object} stats - VWAP stats including vwap, deviationPercent, and deviationHistory
   * @param {number} currentPrice - Current market price
   * @returns {Object} Strategy levels with prices and deviations
   */
  calculateStrategyLevels(stats, currentPrice) {
    const vwap = stats.vwap;
    const percentiles = stats.deviationHistory?.stats;

    if (!vwap || !percentiles) {
      return null;
    }

    // Get percentile values
    const p90 = percentiles.percentile90Percent || 0;
    const p95 = percentiles.percentile95Percent || 0;
    const p10 = percentiles.percentile10Percent || 0;
    const p5 = percentiles.percentile5Percent || 0;

    // Calculate entry thresholds (same logic as evaluateEntry)
    const short1Threshold = Math.max(p90, this.SHORT1_THRESHOLD_PERCENT);
    const short2Threshold = Math.max(p95, this.SHORT2_THRESHOLD_PERCENT);
    const long1Threshold = Math.min(p10, this.LONG1_THRESHOLD_PERCENT);
    const long2Threshold = Math.min(p5, this.LONG2_THRESHOLD_PERCENT);

    // Calculate entry prices: price = VWAP × (1 + deviation/100)
    const short1Price = vwap * (1 + short1Threshold / 100);
    const short2Price = vwap * (1 + short2Threshold / 100);
    const long1Price = vwap * (1 + long1Threshold / 100);
    const long2Price = vwap * (1 + long2Threshold / 100);

    // Calculate stop loss prices
    const shortStopPrice = vwap * (1 + this.SHORT_STOP_LOSS_ABSOLUTE / 100);
    const longStopPrice = vwap * (1 + this.LONG_STOP_LOSS_ABSOLUTE / 100);

    // Calculate take profit prices (bidirectional)
    const takeProfitAbovePrice = vwap * (1 + this.TAKE_PROFIT_THRESHOLD / 100);
    const takeProfitBelowPrice = vwap * (1 - this.TAKE_PROFIT_THRESHOLD / 100);

    // Calculate distances from current price (in percentage)
    const calculateDistance = (targetPrice) => {
      if (!currentPrice || currentPrice === 0) return null;
      return ((targetPrice - currentPrice) / currentPrice) * 100;
    };

    return {
      vwap: vwap,
      currentPrice: currentPrice,
      entries: {
        short1: {
          price: short1Price,
          deviation: short1Threshold,
          thresholdComponents: { p90: p90, absolute: this.SHORT1_THRESHOLD_PERCENT },
          distanceFromCurrent: calculateDistance(short1Price)
        },
        short2: {
          price: short2Price,
          deviation: short2Threshold,
          thresholdComponents: { p95: p95, absolute: this.SHORT2_THRESHOLD_PERCENT },
          distanceFromCurrent: calculateDistance(short2Price)
        },
        long1: {
          price: long1Price,
          deviation: long1Threshold,
          thresholdComponents: { p10: p10, absolute: this.LONG1_THRESHOLD_PERCENT },
          distanceFromCurrent: calculateDistance(long1Price)
        },
        long2: {
          price: long2Price,
          deviation: long2Threshold,
          thresholdComponents: { p5: p5, absolute: this.LONG2_THRESHOLD_PERCENT },
          distanceFromCurrent: calculateDistance(long2Price)
        }
      },
      exits: {
        shortStop: {
          price: shortStopPrice,
          deviation: this.SHORT_STOP_LOSS_ABSOLUTE,
          distanceFromCurrent: calculateDistance(shortStopPrice)
        },
        longStop: {
          price: longStopPrice,
          deviation: this.LONG_STOP_LOSS_ABSOLUTE,
          distanceFromCurrent: calculateDistance(longStopPrice)
        },
        takeProfit: {
          priceAbove: takeProfitAbovePrice,
          priceBelow: takeProfitBelowPrice,
          deviation: this.TAKE_PROFIT_THRESHOLD,
          distanceFromCurrentAbove: calculateDistance(takeProfitAbovePrice),
          distanceFromCurrentBelow: calculateDistance(takeProfitBelowPrice)
        }
      }
    };
  }
}

module.exports = Strategy;


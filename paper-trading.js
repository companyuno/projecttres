/**
 * Paper Trading Engine - Simulates trading without real money
 *
 * Features:
 * - Position tracking
 * - Order execution simulation
 * - P&L calculation
 * - Trade history logging
 */

const EventEmitter = require('events');

class PaperTrading extends EventEmitter {
  constructor(initialBalance = 10000) {
    super();
    this.initialBalance = initialBalance;
    this.cashBalance = initialBalance;
    this.currentPosition = null;
    this.tradeHistory = [];
    this.totalRealizedPnL = 0;

    // Trading parameters
    this.CONTRACT_SIZE = 0.01; // 1 contract = 0.01 BTC
    this.TRADING_FEE = 0.00065; // 0.065% per trade
    this.SLIPPAGE = 0.0005; // 0.05% slippage (placeholder for future)
  }

  /**
   * Execute entry order
   * @param {Object} signal - Entry signal from strategy
   * @param {number} currentPrice - Current market price
   * @param {number} currentDeviation - Current deviation percentage
   * @returns {Object} Order result
   */
  enterPosition(signal, currentPrice, currentDeviation) {
    const contractCount = 1; // 1 contract = 0.01 BTC
    const sizeInBTC = contractCount * this.CONTRACT_SIZE; // 1 * 0.01 = 0.01 BTC

    // Calculate execution price with slippage (for future use)
    const slippageMultiplier = signal.type === 'long' ? (1 + this.SLIPPAGE) : (1 - this.SLIPPAGE);
    const executionPrice = currentPrice * slippageMultiplier;

    // Calculate order cost (using BTC size)
    const orderValue = sizeInBTC * executionPrice;
    const fee = orderValue * this.TRADING_FEE;
    const totalCost = orderValue + fee;

    // Check if we have enough cash (for longs)
    if (signal.type === 'long' && this.cashBalance < totalCost) {
      return {
        success: false,
        error: 'Insufficient funds',
        required: totalCost,
        available: this.cashBalance
      };
    }

    // Create entry record (store contract count, not BTC amount)
    const entry = {
      level: signal.level,
      contractCount: contractCount,
      sizeInBTC: sizeInBTC,
      entryPrice: executionPrice,
      entryDeviation: currentDeviation,
      entryTime: Date.now(),
      fee: fee
    };

    // Update position
    if (!this.currentPosition) {
      // New position
      this.currentPosition = {
        type: signal.type,
        totalContractCount: contractCount,
        totalSizeInBTC: sizeInBTC,
        entryLevels: [signal.level],
        entries: [entry],
        avgEntryPrice: executionPrice,
        totalEntryFees: fee,
        openedAt: Date.now()
      };

      // Update cash balance
      if (signal.type === 'long') {
        this.cashBalance -= totalCost;
      } else {
        // For shorts, we receive cash (simplified - in reality, margin required)
        // For paper trading, we'll track unrealized P&L separately
        this.cashBalance -= fee; // Only pay fee
      }
    } else {
      // Adding to existing position (same direction)
      this.currentPosition.entryLevels.push(signal.level);
      this.currentPosition.entries.push(entry);
      this.currentPosition.totalContractCount += contractCount;
      this.currentPosition.totalSizeInBTC += sizeInBTC;

      // Recalculate average entry price (weighted by BTC size)
      const totalValue = this.currentPosition.entries.reduce((sum, e) => sum + (e.entryPrice * e.sizeInBTC), 0);
      this.currentPosition.avgEntryPrice = totalValue / this.currentPosition.totalSizeInBTC;
      this.currentPosition.totalEntryFees += fee;

      // Update cash balance
      if (signal.type === 'long') {
        this.cashBalance -= totalCost;
      } else {
        this.cashBalance -= fee;
      }
    }

    // Log trade
    const tradeLog = {
      action: 'enter',
      signal: signal,
      entry: entry,
      position: { ...this.currentPosition },
      timestamp: Date.now()
    };
    this.tradeHistory.push(tradeLog);
    this.emit('trade', tradeLog);

    return {
      success: true,
      position: this.currentPosition,
      entry: entry
    };
  }

  /**
   * Close position
   * @param {Object} exitSignal - Exit signal from strategy
   * @param {number} currentPrice - Current market price
   * @param {number} currentDeviation - Current deviation percentage
   * @returns {Object} Exit result
   */
  closePosition(exitSignal, currentPrice, currentDeviation) {
    if (!this.currentPosition) {
      return {
        success: false,
        error: 'No position to close'
      };
    }

    const position = this.currentPosition;
    const sizeInBTC = position.totalSizeInBTC; // BTC amount

    // Calculate execution price with slippage
    const slippageMultiplier = position.type === 'long' ? (1 - this.SLIPPAGE) : (1 + this.SLIPPAGE);
    const executionPrice = currentPrice * slippageMultiplier;

    // Calculate P&L (using BTC size)
    let grossPnL;
    if (position.type === 'long') {
      grossPnL = (executionPrice - position.avgEntryPrice) * sizeInBTC;
    } else {
      grossPnL = (position.avgEntryPrice - executionPrice) * sizeInBTC;
    }

    // Calculate exit fee
    const exitValue = sizeInBTC * executionPrice;
    const exitFee = exitValue * this.TRADING_FEE;

    // Net P&L
    const netPnL = grossPnL - position.totalEntryFees - exitFee;

    // Update cash balance
    if (position.type === 'long') {
      this.cashBalance += exitValue - exitFee;
    } else {
      // For shorts, we return the position value minus fees
      this.cashBalance += (position.avgEntryPrice * sizeInBTC) - exitFee;
    }

    this.totalRealizedPnL += netPnL;

    // Create exit record
    const exit = {
      exitPrice: executionPrice,
      exitDeviation: currentDeviation,
      exitTime: Date.now(),
      exitFee: exitFee,
      grossPnL: grossPnL,
      netPnL: netPnL,
      entryLevels: position.entryLevels,
      avgEntryPrice: position.avgEntryPrice,
      contractCount: position.totalContractCount,
      sizeInBTC: sizeInBTC
    };

    // Log trade
    const tradeLog = {
      action: 'exit',
      exitSignal: exitSignal,
      exit: exit,
      position: { ...position },
      timestamp: Date.now()
    };
    this.tradeHistory.push(tradeLog);
    this.emit('trade', tradeLog);

    // Clear position
    const closedPosition = { ...this.currentPosition, ...exit };
    this.currentPosition = null;

    return {
      success: true,
      closedPosition: closedPosition,
      exit: exit,
      realizedPnL: netPnL
    };
  }

  /**
   * Update position with current market data
   * @param {number} currentPrice - Current market price
   * @param {number} currentDeviation - Current deviation percentage
   * @returns {Object} Position state with unrealized P&L
   */
  updatePosition(currentPrice, currentDeviation) {
    if (!this.currentPosition) {
      return {
        position: null,
        unrealizedPnLBeforeFees: 0,
        unrealizedPnLAfterFees: 0,
        entryFees: 0,
        estimatedExitFees: 0,
        totalFees: 0,
        totalEquity: this.cashBalance
      };
    }

    const position = this.currentPosition;
    const sizeInBTC = position.totalSizeInBTC; // BTC amount

    // Calculate unrealized P&L BEFORE fees (pure price movement)
    let unrealizedPnLBeforeFees;
    if (position.type === 'long') {
      unrealizedPnLBeforeFees = (currentPrice - position.avgEntryPrice) * sizeInBTC;
    } else {
      unrealizedPnLBeforeFees = (position.avgEntryPrice - currentPrice) * sizeInBTC;
    }

    // Entry fees already paid
    const entryFees = position.totalEntryFees;

    // Estimated exit fees (if closed at current price)
    const exitValue = sizeInBTC * currentPrice;
    const estimatedExitFees = exitValue * this.TRADING_FEE;

    // Total fees (entry + estimated exit)
    const totalFees = entryFees + estimatedExitFees;

    // Unrealized P&L AFTER fees
    const unrealizedPnLAfterFees = unrealizedPnLBeforeFees - totalFees;

    // Total equity = cash + position value
    let positionValue;
    if (position.type === 'long') {
      positionValue = currentPrice * sizeInBTC;
    } else {
      // For shorts, value is the difference
      positionValue = (position.avgEntryPrice - currentPrice) * sizeInBTC;
    }

    const totalEquity = this.cashBalance + (position.type === 'long' ? positionValue : this.initialBalance + unrealizedPnLAfterFees);

    return {
      position: {
        ...position,
        currentPrice: currentPrice,
        currentDeviation: currentDeviation
      },
      unrealizedPnLBeforeFees: unrealizedPnLBeforeFees,
      unrealizedPnLAfterFees: unrealizedPnLAfterFees,
      entryFees: entryFees,
      estimatedExitFees: estimatedExitFees,
      totalFees: totalFees,
      totalEquity: totalEquity,
      cashBalance: this.cashBalance
    };
  }

  /**
   * Get current position
   */
  getPosition() {
    return this.currentPosition;
  }

  /**
   * Get trade history
   */
  getTradeHistory() {
    return this.tradeHistory;
  }

  /**
   * Get performance summary
   */
  getPerformance() {
    const closedTrades = this.tradeHistory.filter(t => t.action === 'exit');
    const winningTrades = closedTrades.filter(t => t.exit.netPnL > 0);
    const losingTrades = closedTrades.filter(t => t.exit.netPnL <= 0);

    return {
      totalTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0,
      totalRealizedPnL: this.totalRealizedPnL,
      totalReturn: ((this.totalRealizedPnL / this.initialBalance) * 100),
      currentCashBalance: this.cashBalance
    };
  }

  /**
   * Reset paper trading account
   */
  reset() {
    this.cashBalance = this.initialBalance;
    this.currentPosition = null;
    this.tradeHistory = [];
    this.totalRealizedPnL = 0;
  }
}

module.exports = PaperTrading;


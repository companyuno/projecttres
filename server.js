require('dotenv').config();
const express = require('express');
const path = require('path');
const VWAPTracker = require('./vwap-tracker');
const Strategy = require('./strategy');
const PaperTrading = require('./paper-trading');

const app = express();
const PORT = process.env.PORT || 3000;

// Product ID for BTC Perpetual futures
const PRODUCT_ID = 'BIP-20DEC30-CDE';

// Create VWAP tracker instance
const vwapTracker = new VWAPTracker(PRODUCT_ID, 12);

// Create strategy and paper trading instances
const strategy = new Strategy();
const paperTrading = new PaperTrading(10000); // $10,000 initial balance

// Algorithm state
let algorithmRunning = false; // Default: stopped (no trading)

// Store SSE clients
const clients = [];

// Serve static files (dashboard.html)
app.use(express.static(__dirname));

// Root route - serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// SSE endpoint for real-time updates
app.get('/events', (req, res) => {
  console.log('📡 New SSE client connected');

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Add client to list
  clients.push(res);

  // Send initial stats with position and performance data
  const initialStats = vwapTracker.getStats();
  const positionState = paperTrading.updatePosition(initialStats.currentPrice, initialStats.deviationPercent);
  const stopLossLevels = strategy.getStopLossLevels(initialStats, paperTrading.getPosition());
  const reentryStatus = strategy.getReentryStatus();
  const strategyLevels = strategy.calculateStrategyLevels(initialStats, initialStats.currentPrice);
  const performance = paperTrading.getPerformance();

  const initialData = {
    ...initialStats,
    position: positionState,
    stopLossLevels: stopLossLevels,
    reentryStatus: reentryStatus,
    strategyLevels: strategyLevels,
    performance: performance,
    algorithmRunning: algorithmRunning
  };
  res.write(`data: ${JSON.stringify(initialData)}\n\n`);

  // Remove client on disconnect
  req.on('close', () => {
    console.log('📡 SSE client disconnected');
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
    res.end();
  });
});

// REST endpoint for current stats (optional)
app.get('/api/stats', (req, res) => {
  const stats = vwapTracker.getStats();
  const positionState = paperTrading.updatePosition(stats.currentPrice, stats.deviationPercent);
  const stopLossLevels = strategy.getStopLossLevels(stats, paperTrading.getPosition());
  const reentryStatus = strategy.getReentryStatus();
  const strategyLevels = strategy.calculateStrategyLevels(stats, stats.currentPrice);
  const performance = paperTrading.getPerformance();

  res.json({
    ...stats,
    position: positionState,
    stopLossLevels: stopLossLevels,
    reentryStatus: reentryStatus,
    strategyLevels: strategyLevels,
    performance: performance,
    algorithmRunning: algorithmRunning
  });
});

// REST endpoint for trade history
app.get('/api/trades', (req, res) => {
  const trades = paperTrading.getTradeHistory();
  res.json(trades);
});

// REST endpoint for performance
app.get('/api/performance', (req, res) => {
  const performance = paperTrading.getPerformance();
  res.json(performance);
});

// REST endpoint for algorithm start
app.post('/api/algorithm/start', (req, res) => {
  console.log('▶️ Starting algorithm...');
  algorithmRunning = true;
  res.json({ success: true, message: 'Algorithm started', algorithmRunning: true });
});

// REST endpoint for algorithm stop (kill switch - closes all positions)
app.post('/api/algorithm/stop', (req, res) => {
  console.log('⏹️ Stopping algorithm (kill switch)...');

  // Kill switch: Close all open positions
  const currentPosition = paperTrading.getPosition();
  if (currentPosition) {
    const stats = vwapTracker.getStats();
    const exitSignal = {
      action: 'close',
      reason: 'Algorithm stopped (kill switch)',
      exitType: 'manual'
    };
    const exitResult = paperTrading.closePosition(exitSignal, stats.currentPrice, stats.deviationPercent);
    console.log(`🛑 Position closed via kill switch. P&L: $${exitResult.realizedPnL?.toFixed(2)}`);
  }

  algorithmRunning = false;
  res.json({ success: true, message: 'Algorithm stopped, all positions closed', algorithmRunning: false });
});

// REST endpoint for algorithm status
app.get('/api/algorithm/status', (req, res) => {
  res.json({ algorithmRunning: algorithmRunning });
});

// REST endpoint for restart (debug/recovery tool)
app.post('/api/restart', async (req, res) => {
  console.log('🔄 Restart requested via API');
  try {
    // Stop algorithm first
    algorithmRunning = false;

    // Close any open positions
    const currentPosition = paperTrading.getPosition();
    if (currentPosition) {
      const stats = vwapTracker.getStats();
      const exitSignal = {
        action: 'close',
        reason: 'Tracker restart',
        exitType: 'manual'
      };
      paperTrading.closePosition(exitSignal, stats.currentPrice, stats.deviationPercent);
    }

    // Stop current tracker
    vwapTracker.stop();

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Restart tracker
    await vwapTracker.start();

    res.json({ success: true, message: 'VWAP tracker restarted successfully', algorithmRunning: false });
  } catch (error) {
    console.error('❌ Error restarting tracker:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const stats = vwapTracker.getStats();
  const isConnected = vwapTracker.isConnected();
  res.json({
    status: 'ok',
    connected: isConnected,
    hasData: stats.vwap !== null && stats.vwap !== undefined,
    timestamp: Date.now()
  });
});

// Broadcast VWAP updates and evaluate strategy (only if algorithm is running)
vwapTracker.on('update', (stats) => {
  // Always update position P&L for display (even when algorithm stopped)
  const positionState = paperTrading.updatePosition(stats.currentPrice, stats.deviationPercent);
  const currentPosition = paperTrading.getPosition();

  // Only evaluate strategy and trade if algorithm is running
  if (algorithmRunning) {
    // Evaluate strategy
    // First check exit conditions (stop loss and take profit)
    if (currentPosition) {
      const exitSignal = strategy.evaluateExit(stats, currentPosition);
      if (exitSignal.action === 'close') {
        const exitResult = paperTrading.closePosition(exitSignal, stats.currentPrice, stats.deviationPercent);
        console.log(`📊 Position closed: ${exitSignal.reason}`);
        console.log(`💰 Realized P&L: $${exitResult.realizedPnL?.toFixed(2)}`);
      }
    }

    // Then check entry conditions (only if no position or can add)
    const currentPos = paperTrading.getPosition();
    const entrySignal = strategy.evaluateEntry(stats, currentPos);
    if (entrySignal.action === 'enter') {
      const enterResult = paperTrading.enterPosition(entrySignal, stats.currentPrice, stats.deviationPercent);
      if (enterResult.success) {
        console.log(`📊 Position entered: ${entrySignal.level} - ${entrySignal.reason}`);
      } else {
        console.log(`❌ Entry failed: ${enterResult.error}`);
      }
    } else if (entrySignal.action === 'add') {
      const addResult = paperTrading.enterPosition(entrySignal, stats.currentPrice, stats.deviationPercent);
      if (addResult.success) {
        console.log(`📊 Position added: ${entrySignal.level} - ${entrySignal.reason}`);
      }
    }
  }

  // Get stop loss levels for dashboard
  const stopLossLevels = strategy.getStopLossLevels(stats, paperTrading.getPosition());
  const reentryStatus = strategy.getReentryStatus();
  const strategyLevels = strategy.calculateStrategyLevels(stats, stats.currentPrice);
  const performance = paperTrading.getPerformance();

  // Prepare combined data for clients
  const combinedData = {
    ...stats,
    position: positionState,
    stopLossLevels: stopLossLevels,
    reentryStatus: reentryStatus,
    strategyLevels: strategyLevels,
    performance: performance,
    algorithmRunning: algorithmRunning
  };

  const data = `data: ${JSON.stringify(combinedData)}\n\n`;
  clients.forEach(client => {
    try {
      client.write(data);
    } catch (error) {
      // Client disconnected, will be removed on next close event
    }
  });
});

// Broadcast connection status
vwapTracker.on('status', (status) => {
  const data = `data: ${JSON.stringify({ type: 'status', ...status })}\n\n`;
  clients.forEach(client => {
    try {
      client.write(data);
    } catch (error) {
      // Client disconnected
    }
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 VWAP Dashboard server running on http://localhost:${PORT}`);
  console.log(`📊 Tracking VWAP for ${PRODUCT_ID}`);

  // Start VWAP tracker
  await vwapTracker.start();
});

// Handle PM2 shutdown signals
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down (SIGINT)...');
  vwapTracker.stop();
  clients.forEach(client => client.end());
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down (SIGTERM)...');
  vwapTracker.stop();
  clients.forEach(client => client.end());
  process.exit(0);
});


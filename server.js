require('dotenv').config();
const express = require('express');
const path = require('path');
const VWAPTracker = require('./vwap-tracker');

const app = express();
const PORT = process.env.PORT || 3000;

// Product ID for BTC Perpetual futures
const PRODUCT_ID = 'BIP-20DEC30-CDE';

// Create VWAP tracker instance
const vwapTracker = new VWAPTracker(PRODUCT_ID, 12);

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

  // Send initial stats
  const initialStats = vwapTracker.getStats();
  res.write(`data: ${JSON.stringify(initialStats)}\n\n`);

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
  res.json(stats);
});

// Broadcast VWAP updates to all connected clients
vwapTracker.on('update', (stats) => {
  const data = `data: ${JSON.stringify(stats)}\n\n`;
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  vwapTracker.stop();
  clients.forEach(client => client.end());
  process.exit(0);
});


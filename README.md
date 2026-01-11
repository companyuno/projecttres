# VWAP Tracker

Real-time VWAP (Volume Weighted Average Price) tracker for Coinbase Advanced Trade with deviation history analysis.

## Features

- **12-hour rolling VWAP** calculation using 5-minute candles
- **72-hour deviation history** with percentile analysis
- **Real-time updates** via WebSocket (candles + ticker channels)
- **Interactive dashboard** with deviation history chart
- **Percentile bands**: 1/99, 5/95, and 10/90 percentiles
- **Restart functionality** via dashboard button
- **Health monitoring** and connection status

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file:

```env
COINBASE_API_KEY=organizations/.../apiKeys/...
COINBASE_API_SECRET=-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----\n
PORT=3000
```

### 3. Start Server

**Option A: Standard Node.js (for development)**
```bash
npm start
```

**Option B: PM2 (recommended for production)**
```bash
# Install PM2 globally (one-time)
npm install -g pm2

# Start with PM2
npm run pm2:start

# Or use PM2 commands directly
pm2 start ecosystem.config.js
```

See [PM2_SETUP.md](./PM2_SETUP.md) for detailed PM2 instructions.

### 4. Access Dashboard

Open your browser to: `http://localhost:3000`

## Dashboard Features

- **Real-time VWAP and price display**
- **Deviation from VWAP** (both $ and %)
- **72-hour deviation history chart** with percentile bands
- **Restart button** to restart the tracker without stopping the server
- **Connection status indicator**

## API Endpoints

- `GET /` - Dashboard
- `GET /events` - Server-Sent Events stream for real-time updates
- `GET /api/stats` - Current VWAP statistics
- `GET /api/health` - Health check endpoint
- `POST /api/restart` - Restart the VWAP tracker

## PM2 Commands

```bash
# Start
npm run pm2:start

# Stop
npm run pm2:stop

# Restart
npm run pm2:restart

# View logs
npm run pm2:logs

# Delete from PM2
npm run pm2:delete

# Save process list
npm run pm2:save
```

## Configuration

Default product: `BIP-20DEC30-CDE` (BTC Perpetual futures)

To change, edit `server.js`:
```javascript
const PRODUCT_ID = 'YOUR-PRODUCT-ID';
```

## Architecture

- **`server.js`** - Express server with SSE endpoints
- **`vwap-tracker.js`** - Orchestrates VWAP calculation
- **`rolling-vwap.js`** - Rolling VWAP and deviation history calculator
- **`coinbase-websocket.js`** - WebSocket client for real-time data
- **`coinbase.js`** - REST API client with JWT authentication
- **`dashboard.html`** - Frontend dashboard with Chart.js

## Notes

- Server runs on port 3000 by default (configurable via `PORT` env var)
- VWAP uses a 12-hour rolling window
- Deviation history maintains a 72-hour rolling window
- WebSocket reconnects automatically on disconnection
- PM2 keeps the server running in the background even after closing terminal

## Future Plans

- Deploy to cloud platform (Railway, Render, etc.) for 24/7 operation
- Add multiple product support
- Implement trading strategy logic based on deviation percentiles
- Add backtesting capabilities

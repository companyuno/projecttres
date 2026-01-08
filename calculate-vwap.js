require('dotenv').config();
const Coinbase = require('./coinbase');

/**
 * Calculate VWAP from candles
 * VWAP = Sum(Price × Volume) / Sum(Volume)
 * Uses typical price: (high + low + close) / 3
 */
function calculateVWAP(candles) {
  if (!candles || candles.length === 0) {
    return null;
  }

  let totalPriceVolume = 0;
  let totalVolume = 0;

  candles.forEach(candle => {
    // Coinbase candles format: { start, low, high, open, close, volume }
    const low = parseFloat(candle.low);
    const high = parseFloat(candle.high);
    const close = parseFloat(candle.close);
    const volume = parseFloat(candle.volume);

    // Typical price (standard for VWAP)
    const typicalPrice = (high + low + close) / 3;

    totalPriceVolume += typicalPrice * volume;
    totalVolume += volume;
  });

  if (totalVolume === 0) {
    return null;
  }

  return totalPriceVolume / totalVolume;
}

async function calculateVWAPs(productId = 'BTC-USD') {
  const cb = new Coinbase();

  try {
    console.log(`📊 Calculating 24-hour VWAP for ${productId}...`);

    const end = Math.floor(Date.now() / 1000);

    // Calculate 24-hour VWAP
    console.log(`\n📅 Fetching 24-hour candles...`);
    const start24h = end - (24 * 60 * 60);
    const response24h = await cb.getCandles(productId, start24h.toString(), end.toString(), 'FIVE_MINUTE');
    const candles24h = response24h.candles || [];

    if (candles24h.length === 0) {
      console.log('❌ No 24-hour candles returned');
      return;
    }

    console.log(`✅ Fetched ${candles24h.length} candles for 24-hour period`);

    // Get current price from the most recent candle BEFORE reversing (newest is first in Coinbase response)
    const latestCandle = candles24h[0];
    const currentPrice = parseFloat(latestCandle.close);

    // Reverse to chronological order for VWAP calculation
    const chronological24h = candles24h.reverse();
    const vwap24h = calculateVWAP(chronological24h);

    if (vwap24h === null) {
      console.log('❌ Could not calculate VWAP (no volume data)');
      return;
    }

    // Calculate differences
    const diff24h = currentPrice - vwap24h;
    const diff24hPercent = (diff24h / vwap24h) * 100;

    console.log('\n================================================================================');
    console.log('24-HOUR VWAP ANALYSIS');
    console.log('================================================================================');
    console.log(`Product: ${productId}`);
    console.log(`Candle Granularity: 5 minutes`);
    console.log(`Total Candles: ${candles24h.length}`);
    console.log(`\n📈 VWAP: $${vwap24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`💰 Current Price: $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`\n📊 Price vs VWAP:`);
    console.log(`   Difference: $${diff24h.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${diff24hPercent >= 0 ? '+' : ''}${diff24hPercent.toFixed(2)}%)`);
    if (currentPrice > vwap24h) {
      console.log(`   Status: 🔴 Above VWAP (potentially overbought)`);
    } else {
      console.log(`   Status: 🟢 Below VWAP (potentially oversold)`);
    }
    console.log('================================================================================\n');

    return { vwap24h, currentPrice };

  } catch (error) {
    console.error('❌ Error calculating VWAP:', error.response?.status, error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run if called directly
if (require.main === module) {
  // Default to BTC-USD, but allow command line argument
  const productId = process.argv[2] || 'BTC-USD';
  calculateVWAPs(productId);
}

module.exports = { calculateVWAP, calculateVWAPs };


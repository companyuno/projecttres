require('dotenv').config();
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const PRODUCT_ID = 'BIP-20DEC30-CDE';

const apiKey = process.env.COINBASE_API_KEY;
const privateKey = process.env.COINBASE_API_SECRET.replace(/\\n/g, '\n').trim();

function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    exp: now + 120,
    iss: 'cdp',
    nbf: now,
    sub: apiKey
  };

  return jwt.sign(payload, privateKey, {
    algorithm: 'ES256',
    noTimestamp: true,
    header: {
      alg: 'ES256',
      kid: apiKey,
      nonce: crypto.randomBytes(16).toString('hex')
    }
  });
}

console.log(`🔍 Testing candles channel for ${PRODUCT_ID}...\n`);

const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');

ws.on('open', () => {
  console.log('✅ WebSocket connected\n');

  const token = generateJWT();

  // Subscribe to candles channel with JWT
  // According to docs, candles channel requires JWT and provides 5-minute candles
  const subscribeCandles = {
    type: 'subscribe',
    product_ids: [PRODUCT_ID],
    channel: 'candles',
    jwt: token
  };

  console.log('📡 Subscribing to candles channel with JWT...');
  console.log('Subscription message:', JSON.stringify(subscribeCandles, null, 2));
  ws.send(JSON.stringify(subscribeCandles));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    // Log subscription confirmations
    if (message.type === 'subscriptions' || message.channel === 'subscriptions') {
      console.log('\n✅ Subscription confirmed:');
      console.log(JSON.stringify(message, null, 2));
      return;
    }

    // Check for errors
    if (message.type === 'error') {
      console.log('\n❌ Error:');
      console.log(JSON.stringify(message, null, 2));
      return;
    }

    // Check candles messages
    if (message.channel === 'candles' && message.events) {
      message.events.forEach(event => {
        if (event.type === 'update' && event.candles) {
          event.candles.forEach(candle => {
            console.log('\n🕯️ CANDLE MESSAGE:');
            console.log('Full candle object:', JSON.stringify(candle, null, 2));
            console.log('\n🔍 Candle data:');
            console.log('  start:', candle.start);
            console.log('  open:', candle.open);
            console.log('  high:', candle.high);
            console.log('  low:', candle.low);
            console.log('  close:', candle.close);
            console.log('  volume:', candle.volume);
            console.log('  product_id:', candle.product_id);
            console.log('  All keys:', Object.keys(candle));
          });
        }
      });
    }

    // Log any other messages
    if (message.channel !== 'candles' && message.type !== 'subscriptions') {
      console.log('\n📨 Other message:');
      console.log(JSON.stringify(message, null, 2));
    }

  } catch (error) {
    console.error('❌ Error parsing message:', error);
    console.log('Raw message:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`\n⚠️ WebSocket closed: Code ${code}, Reason: ${reason}`);
  process.exit(0);
});

// Exit after 60 seconds (to catch a candle close)
setTimeout(() => {
  console.log('\n⏱️ 60 seconds elapsed, closing...');
  ws.close();
}, 60000);


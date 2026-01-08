require('dotenv').config();
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const PRODUCT_ID = 'BIP-20DEC30-CDE';

// Get API credentials
const apiKey = process.env.COINBASE_API_KEY;
const privateKey = process.env.COINBASE_API_SECRET.replace(/\\n/g, '\n').trim();

if (!apiKey || !privateKey) {
  console.error('❌ Missing COINBASE_API_KEY or COINBASE_API_SECRET in .env');
  process.exit(1);
}

/**
 * Generate JWT for WebSocket authentication
 * Coinbase WebSocket may require JWT in the connection URL or initial message
 */
function generateJWT() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    exp: now + 120,
    iss: 'cdp',
    nbf: now,
    sub: apiKey,
    // WebSocket may not need URI, or may need different format
    // Try without URI first
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

console.log(`🔍 Testing matches channel for ${PRODUCT_ID} with authentication...\n`);

// Try connecting with JWT in URL (if supported)
const token = generateJWT();
const wsUrl = `wss://advanced-trade-ws.coinbase.com?jwt=${token}`;

console.log('🔌 Attempting WebSocket connection with JWT...');
const ws = new WebSocket(wsUrl);

ws.on('open', () => {
  console.log('✅ WebSocket connected\n');

  // Try subscribing to matches channel
  const subscribeMatches = {
    type: 'subscribe',
    product_ids: [PRODUCT_ID],
    channel: 'matches'
  };

  console.log('📡 Subscribing to matches channel...');
  console.log('Subscription message:', JSON.stringify(subscribeMatches, null, 2));
  ws.send(JSON.stringify(subscribeMatches));

  // Also try with authentication in message
  setTimeout(() => {
    const subscribeWithAuth = {
      type: 'subscribe',
      product_ids: [PRODUCT_ID],
      channel: 'matches',
      jwt: token
    };
    console.log('\n📡 Trying subscription with JWT in message...');
    ws.send(JSON.stringify(subscribeWithAuth));
  }, 2000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    // Log subscription confirmations
    if (message.type === 'subscriptions' || message.channel === 'subscriptions') {
      console.log('\n✅ Subscription response:');
      console.log(JSON.stringify(message, null, 2));
      return;
    }

    // Check for errors
    if (message.type === 'error') {
      console.log('\n❌ Error message:');
      console.log(JSON.stringify(message, null, 2));
      return;
    }

    // Check matches messages
    if (message.channel === 'matches' && message.events) {
      message.events.forEach(event => {
        if (event.type === 'match' && event.matches) {
          event.matches.forEach(match => {
            console.log('\n💰 MATCH MESSAGE:');
            console.log('Full match object:', JSON.stringify(match, null, 2));
            console.log('\n🔍 Checking for size fields:');
            console.log('  last_size:', match.last_size);
            console.log('  size:', match.size);
            console.log('  volume:', match.volume);
            console.log('  All keys:', Object.keys(match));
          });
        }
      });
    }

    // Log any other message types
    console.log('\n📨 Message received:');
    console.log(JSON.stringify(message, null, 2));

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

// Exit after 30 seconds
setTimeout(() => {
  console.log('\n⏱️ 30 seconds elapsed, closing...');
  ws.close();
}, 30000);


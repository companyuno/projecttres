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

console.log(`🔍 Testing matches channel authentication methods...\n`);

// Try method 1: Connect without auth, then send auth message
const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');

ws.on('open', () => {
  console.log('✅ WebSocket connected\n');

  const token = generateJWT();

  // Method 1: Try sending authentication message first
  console.log('📡 Method 1: Sending authentication message...');
  const authMessage = {
    type: 'authenticate',
    jwt: token
  };
  console.log('Auth message:', JSON.stringify(authMessage, null, 2));
  ws.send(JSON.stringify(authMessage));

  // Wait a bit, then try subscribing
  setTimeout(() => {
    console.log('\n📡 Attempting to subscribe to matches channel...');
    const subscribeMatches = {
      type: 'subscribe',
      product_ids: [PRODUCT_ID],
      channel: 'matches'
    };
    ws.send(JSON.stringify(subscribeMatches));
  }, 1000);

  // Method 2: Try with JWT in subscribe message
  setTimeout(() => {
    console.log('\n📡 Method 2: Subscribe with JWT in message...');
    const subscribeWithJWT = {
      type: 'subscribe',
      product_ids: [PRODUCT_ID],
      channel: 'matches',
      jwt: token
    };
    ws.send(JSON.stringify(subscribeWithJWT));
  }, 3000);

  // Method 3: Try with bearer token format
  setTimeout(() => {
    console.log('\n📡 Method 3: Subscribe with bearer token...');
    const subscribeWithBearer = {
      type: 'subscribe',
      product_ids: [PRODUCT_ID],
      channel: 'matches',
      bearer: token
    };
    ws.send(JSON.stringify(subscribeWithBearer));
  }, 5000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    console.log('\n📨 Received message:');
    console.log(JSON.stringify(message, null, 2));

    // Check for matches
    if (message.channel === 'matches' && message.events) {
      message.events.forEach(event => {
        if (event.type === 'match' && event.matches) {
          event.matches.forEach(match => {
            console.log('\n💰 MATCH FOUND!');
            console.log('Full match:', JSON.stringify(match, null, 2));
            console.log('Size fields:', {
              last_size: match.last_size,
              size: match.size,
              volume: match.volume
            });
          });
        }
      });
    }

  } catch (error) {
    console.error('❌ Parse error:', error);
    console.log('Raw:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n⚠️ WebSocket closed');
  process.exit(0);
});

setTimeout(() => {
  console.log('\n⏱️ 30 seconds elapsed');
  ws.close();
}, 30000);


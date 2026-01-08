require('dotenv').config();
const WebSocket = require('ws');

const PRODUCT_ID = 'BIP-20DEC30-CDE';
const ws = new WebSocket('wss://advanced-trade-ws.coinbase.com');

console.log(`🔍 Checking WebSocket messages for ${PRODUCT_ID}...`);
console.log('Looking for "last_size" field in incoming messages\n');

ws.on('open', () => {
  console.log('✅ Connected to WebSocket\n');

  // Subscribe to ticker channel
  const subscribeTicker = {
    type: 'subscribe',
    product_ids: [PRODUCT_ID],
    channel: 'ticker'
  };

  console.log('📡 Subscribing to ticker channel...');
  ws.send(JSON.stringify(subscribeTicker));

  // Also subscribe to matches channel
  setTimeout(() => {
    const subscribeMatches = {
      type: 'subscribe',
      product_ids: [PRODUCT_ID],
      channel: 'matches'
    };
    console.log('📡 Subscribing to matches channel...\n');
    ws.send(JSON.stringify(subscribeMatches));
  }, 1000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());

    // Log subscription confirmations
    if (message.type === 'subscriptions') {
      console.log('✅ Subscription confirmed:', JSON.stringify(message, null, 2));
      return;
    }

    // Check ticker messages
    if (message.channel === 'ticker' && message.events) {
      message.events.forEach(event => {
        if (event.type === 'update' && event.tickers) {
          event.tickers.forEach(ticker => {
            console.log('\n📊 TICKER MESSAGE:');
            console.log('Full ticker object:', JSON.stringify(ticker, null, 2));
            console.log('\n🔍 Checking for size fields:');
            console.log('  last_size:', ticker.last_size);
            console.log('  size:', ticker.size);
            console.log('  volume:', ticker.volume);
            console.log('  volume_24h:', ticker.volume_24h);
            console.log('  All keys:', Object.keys(ticker));
          });
        }
      });
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
    if (message.channel !== 'ticker' && message.channel !== 'matches') {
      console.log('\n📨 Other message:', JSON.stringify(message, null, 2));
    }

  } catch (error) {
    console.error('❌ Error parsing message:', error);
    console.log('Raw message:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
  console.log('\n⚠️ WebSocket closed');
  process.exit(0);
});

// Exit after 30 seconds
setTimeout(() => {
  console.log('\n⏱️ 30 seconds elapsed, closing...');
  ws.close();
}, 30000);


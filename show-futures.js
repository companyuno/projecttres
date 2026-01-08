require('dotenv').config();
const Coinbase = require('./coinbase');

async function showFutures() {
  const cb = new Coinbase();

  try {
    console.log('🔌 Connecting to Coinbase...\n');

    // Get balance summary
    console.log('📊 Getting futures balance summary...');
    const balanceSummary = await cb.getFuturesBalanceSummary();
    const balance = balanceSummary.balance_summary;

    console.log('✅ Futures Account Summary:');
    console.log('=' .repeat(80));
    console.log(`Total USD Balance: $${parseFloat(balance.total_usd_balance.value).toLocaleString()}`);
    console.log(`Futures Buying Power: $${parseFloat(balance.futures_buying_power.value).toLocaleString()}`);
    console.log(`Unrealized P&L: $${parseFloat(balance.unrealized_pnl.value).toLocaleString()}`);
    console.log(`Initial Margin: $${parseFloat(balance.initial_margin.value).toLocaleString()}`);
    console.log(`Available Margin: $${parseFloat(balance.available_margin.value).toLocaleString()}`);
    console.log();

    // Get accounts to find portfolio UUID
    console.log('📋 Getting portfolio UUID...');
    const accounts = await cb.getAccounts();
    if (!accounts.accounts || accounts.accounts.length === 0) {
      console.log('❌ No accounts found');
      return;
    }

    const portfolioUuid = accounts.accounts[0].retail_portfolio_id;
    console.log(`✅ Portfolio UUID: ${portfolioUuid}\n`);

    // Get positions
    console.log('📈 Getting perpetual futures positions...');
    const positions = await cb.listPerpsPositions(portfolioUuid);

    if (positions.positions && positions.positions.length > 0) {
      console.log(`✅ Found ${positions.positions.length} position(s):\n`);
      console.log('=' .repeat(80));

      positions.positions.forEach((pos, index) => {
        const contracts = parseFloat(pos.number_of_contracts || '0');
        const entryPrice = parseFloat(pos.avg_entry_price || '0');
        const currentPrice = parseFloat(pos.current_price || '0');
        const unrealizedPnl = parseFloat(pos.unrealized_pnl || '0');
        const dailyPnl = parseFloat(pos.daily_realized_pnl || '0');
        const expiration = pos.expiration_time ? new Date(pos.expiration_time).toLocaleDateString() : 'N/A';

        console.log(`${index + 1}. ${pos.product_id || 'Unknown'}`);
        console.log(`   Contracts: ${contracts.toLocaleString()}`);
        console.log(`   Side: ${pos.side || 'N/A'}`);
        console.log(`   Entry Price: $${entryPrice.toLocaleString()}`);
        console.log(`   Current Price: $${currentPrice.toLocaleString()}`);
        console.log(`   Unrealized P&L: $${unrealizedPnl.toLocaleString()}`);
        if (dailyPnl !== 0) {
          console.log(`   Daily Realized P&L: $${dailyPnl.toLocaleString()}`);
        }
        if (pos.expiration_time) {
          console.log(`   Expiration: ${expiration}`);
        }
        console.log();
      });
    } else {
      console.log('No open positions found');
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

showFutures();


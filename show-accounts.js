require('dotenv').config();
const Coinbase = require('./coinbase');

async function showAccounts() {
  const cb = new Coinbase();

  try {
    console.log('🔌 Connecting to Coinbase...\n');
    const response = await cb.getAccounts();
    const accounts = response.accounts || [];

    console.log(`✅ Connected! Found ${accounts.length} accounts\n`);
    console.log('=' .repeat(80));
    console.log('ACCOUNT BALANCES');
    console.log('=' .repeat(80));
    console.log();

    // Sort by currency
    accounts.sort((a, b) => a.currency.localeCompare(b.currency));

    let totalUSD = 0;

    accounts.forEach((account, index) => {
      const available = parseFloat(account.available_balance?.value || '0');
      const hold = parseFloat(account.hold?.value || '0');
      const total = available + hold;

      console.log(`${index + 1}. ${account.name || account.currency} Wallet`);
      console.log(`   Currency: ${account.currency}`);
      console.log(`   Available: ${available.toLocaleString()} ${account.currency}`);
      if (hold > 0) {
        console.log(`   On Hold: ${hold.toLocaleString()} ${account.currency}`);
      }
      console.log(`   Total: ${total.toLocaleString()} ${account.currency}`);
      console.log(`   Type: ${account.type}`);
      console.log(`   Active: ${account.active ? '✅' : '❌'}`);
      console.log();
    });

    console.log('=' .repeat(80));
    console.log(`Total Accounts: ${accounts.length}`);
    console.log(`Active Accounts: ${accounts.filter(a => a.active).length}`);

  } catch (error) {
    console.error('❌ Error:', error.response?.status, error.response?.data || error.message);
    process.exit(1);
  }
}

showAccounts();


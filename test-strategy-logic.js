/**
 * Strategy Logic Test Suite
 *
 * Tests all strategy entry/exit logic, paper trading calculations,
 * and dashboard data accuracy.
 *
 * Run with: node test-strategy-logic.js
 */

const Strategy = require('./strategy');
const PaperTrading = require('./paper-trading');

let testsPassed = 0;
let testsFailed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`✓ ${message}`);
  } else {
    testsFailed++;
    failures.push(message);
    console.log(`✗ ${message}`);
  }
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// ============================================================================
// STRATEGY ENTRY TESTS
// ============================================================================

function testShort1Entry_PercentileWins() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: 0.75, // Must be >= max(0.70, 0.60) = 0.70
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const result = strategy.evaluateEntry(stats, null);

  assert(
    result.action === 'enter' &&
    result.type === 'short' &&
    result.level === 'Short1',
    'Short 1 Entry (p90 wins: 0.70% > 0.60%)'
  );
}

function testShort1Entry_AbsoluteWins() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: 0.65,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.55, // Less than 0.60%
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const result = strategy.evaluateEntry(stats, null);

  assert(
    result.action === 'enter' &&
    result.type === 'short' &&
    result.level === 'Short1',
    'Short 1 Entry (absolute wins: p90=0.55% < 0.60%)'
  );
}

function testShort2Entry() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: 0.85, // Must be >= max(0.85, 0.75) = 0.85
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  // Simulate existing Short 1 position
  const currentPosition = {
    type: 'short',
    totalContractCount: 1,
    entryLevels: ['Short1']
  };
  const result = strategy.evaluateEntry(stats, currentPosition);

  assert(
    result.action === 'add' &&
    result.type === 'short' &&
    result.level === 'Short2',
    'Short 2 Entry (add to Short 1)'
  );
}

function testLong1Entry_PercentileWins() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: -0.80,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.80, // More negative than -0.75%
        percentile5Percent: -0.90
      }
    }
  };
  const result = strategy.evaluateEntry(stats, null);

  assert(
    result.action === 'enter' &&
    result.type === 'long' &&
    result.level === 'Long1',
    'Long 1 Entry (p10 wins: -0.80% < -0.75%)'
  );
}

function testLong1Entry_AbsoluteWins() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: -0.80,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.70, // Less negative than -0.75%
        percentile5Percent: -0.90
      }
    }
  };
  const result = strategy.evaluateEntry(stats, null);

  assert(
    result.action === 'enter' &&
    result.type === 'long' &&
    result.level === 'Long1',
    'Long 1 Entry (absolute wins: p10=-0.70% > -0.75%)'
  );
}

function testLong2Entry() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: -0.95,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.95
      }
    }
  };
  // Simulate existing Long 1 position
  const currentPosition = {
    type: 'long',
    totalContractCount: 1,
    entryLevels: ['Long1']
  };
  const result = strategy.evaluateEntry(stats, currentPosition);

  assert(
    result.action === 'add' &&
    result.type === 'long' &&
    result.level === 'Long2',
    'Long 2 Entry (add to Long 1)'
  );
}

// ============================================================================
// STRATEGY EXIT TESTS
// ============================================================================

function testStopLossShort() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: 2.25,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const currentPosition = {
    type: 'short',
    totalContractCount: 1,
    entryLevels: ['Short1']
  };
  const result = strategy.evaluateExit(stats, currentPosition);

  assert(
    result.action === 'close' &&
    result.exitType === 'stop_loss',
    'Stop Loss Short (deviation = +2.25%)'
  );
}

function testStopLossLong() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: -2.4,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const currentPosition = {
    type: 'long',
    totalContractCount: 1,
    entryLevels: ['Long1']
  };
  const result = strategy.evaluateExit(stats, currentPosition);

  assert(
    result.action === 'close' &&
    result.exitType === 'stop_loss',
    'Stop Loss Long (deviation = -2.4%)'
  );
}

function testTakeProfit() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: 0.05, // Within 0.1% threshold
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const currentPosition = {
    type: 'short',
    totalContractCount: 1,
    entryLevels: ['Short1']
  };
  const result = strategy.evaluateExit(stats, currentPosition);

  assert(
    result.action === 'close' &&
    result.exitType === 'take_profit',
    'Take Profit (|deviation| = 0.05% < 0.1%)'
  );
}

function testTakeProfitNegative() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: -0.08, // Within 0.1% threshold
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const currentPosition = {
    type: 'long',
    totalContractCount: 1,
    entryLevels: ['Long1']
  };
  const result = strategy.evaluateExit(stats, currentPosition);

  assert(
    result.action === 'close' &&
    result.exitType === 'take_profit',
    'Take Profit Negative (|deviation| = 0.08% < 0.1%)'
  );
}

// ============================================================================
// REENTRY LOGIC TESTS
// ============================================================================

function testReentryBlockedAfterShortStop() {
  const strategy = new Strategy();

  // Simulate stop loss triggering
  const stopStats = {
    deviationPercent: 2.25,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const position = { type: 'short', totalContractCount: 1, entryLevels: ['Short1'] };
  strategy.evaluateExit(stopStats, position); // This should set reentry flag

  // Try to enter while waiting for neutral range
  const entryStats = {
    deviationPercent: 1.5, // Not in neutral range
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const result = strategy.evaluateEntry(entryStats, null);

  assert(
    result.action === 'none',
    'Reentry Blocked After Short Stop (deviation = +1.5%, not in neutral range)'
  );
}

function testReentryAllowedAfterNeutralRange() {
  const strategy = new Strategy();

  // Simulate stop loss triggering
  const stopStats = {
    deviationPercent: 2.25,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const position = { type: 'short', totalContractCount: 1, entryLevels: ['Short1'] };
  strategy.evaluateExit(stopStats, position); // Sets reentry flag

  // Enter neutral range
  const neutralStats = {
    deviationPercent: 0.3, // In neutral range (-0.75% to +0.6%)
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  strategy.evaluateEntry(neutralStats, null); // Should clear flag

  // Now try to enter again (must be >= max(0.70, 0.60) = 0.70)
  const entryStats = {
    deviationPercent: 0.75, // Should trigger Short 1 (>= 0.70)
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const result = strategy.evaluateEntry(entryStats, null);

  assert(
    result.action === 'enter' && result.type === 'short',
    'Reentry Allowed After Neutral Range (flag cleared, entry works)'
  );
}

function testReentryBlockedAfterLongStop() {
  const strategy = new Strategy();

  // Simulate long stop loss triggering
  const stopStats = {
    deviationPercent: -2.4,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const position = { type: 'long', totalContractCount: 1, entryLevels: ['Long1'] };
  strategy.evaluateExit(stopStats, position); // Sets reentry flag

  // Try to enter while waiting for neutral range
  const entryStats = {
    deviationPercent: -1.5, // Not in neutral range
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const result = strategy.evaluateEntry(entryStats, null);

  assert(
    result.action === 'none',
    'Reentry Blocked After Long Stop (deviation = -1.5%, not in neutral range)'
  );
}

// ============================================================================
// PAPER TRADING TESTS
// ============================================================================

function testPositionSizing() {
  const paperTrading = new PaperTrading(10000);
  const signal = {
    action: 'enter',
    type: 'short',
    level: 'Short1'
  };
  const result = paperTrading.enterPosition(signal, 90000, 0.65);

  assert(
    result.success === true &&
    result.position.totalContractCount === 1 &&
    result.position.totalSizeInBTC === 0.01,
    'Position Sizing (1 contract = 0.01 BTC)'
  );
}

function testShort2PositionSizing() {
  const paperTrading = new PaperTrading(10000);

  // Enter Short 1
  const signal1 = { action: 'enter', type: 'short', level: 'Short1' };
  paperTrading.enterPosition(signal1, 90000, 0.65);

  // Add Short 2
  const signal2 = { action: 'add', type: 'short', level: 'Short2' };
  const result = paperTrading.enterPosition(signal2, 91000, 0.80);

  assert(
    result.success === true &&
    result.position.totalContractCount === 2 &&
    result.position.totalSizeInBTC === 0.02,
    'Short 2 Position Sizing (2 contracts = 0.02 BTC)'
  );
}

function testLongPnLCalculation() {
  const paperTrading = new PaperTrading(10000);

  // Enter long at $90,000 (with slippage: 90000 * 1.0005 = 90045)
  const signal = { action: 'enter', type: 'long', level: 'Long1' };
  paperTrading.enterPosition(signal, 90000, -0.80);
  const entryPrice = paperTrading.getPosition().avgEntryPrice;

  // Update position at $91,000
  const positionState = paperTrading.updatePosition(91000, -0.10);

  // P&L should be: 0.01 BTC * (91000 - entryPrice)
  const expectedPnL = 0.01 * (91000 - entryPrice);
  const tolerance = 0.10; // Allow for rounding

  assert(
    Math.abs(positionState.unrealizedPnLBeforeFees - expectedPnL) < tolerance,
    `Long P&L Calculation (expected ~$${expectedPnL.toFixed(2)}, got $${positionState.unrealizedPnLBeforeFees.toFixed(2)})`
  );
}

function testShortPnLCalculation() {
  const paperTrading = new PaperTrading(10000);

  // Enter short at $90,000 (with slippage: 90000 * 0.9995 = 89955)
  const signal = { action: 'enter', type: 'short', level: 'Short1' };
  paperTrading.enterPosition(signal, 90000, 0.65);
  const entryPrice = paperTrading.getPosition().avgEntryPrice;

  // Update position at $89,000
  const positionState = paperTrading.updatePosition(89000, -0.10);

  // P&L should be: 0.01 BTC * (entryPrice - 89000)
  const expectedPnL = 0.01 * (entryPrice - 89000);
  const tolerance = 0.10; // Allow for rounding

  assert(
    Math.abs(positionState.unrealizedPnLBeforeFees - expectedPnL) < tolerance,
    `Short P&L Calculation (expected ~$${expectedPnL.toFixed(2)}, got $${positionState.unrealizedPnLBeforeFees.toFixed(2)})`
  );
}

function testFeeCalculation() {
  const paperTrading = new PaperTrading(10000);

  // Enter long at $90,000 (with slippage: 90000 * 1.0005 = 90045)
  const signal = { action: 'enter', type: 'long', level: 'Long1' };
  paperTrading.enterPosition(signal, 90000, -0.80);
  const position = paperTrading.getPosition();

  // Fee should be: 0.01 BTC * entryPrice * 0.00065
  const entryPrice = position.avgEntryPrice;
  const expectedFee = 0.01 * entryPrice * 0.00065;
  const tolerance = 0.01;

  assert(
    Math.abs(position.totalEntryFees - expectedFee) < tolerance,
    `Fee Calculation (expected ~$${expectedFee.toFixed(2)}, got $${position.totalEntryFees.toFixed(2)})`
  );
}

function testRealizedPnLOnExit() {
  const paperTrading = new PaperTrading(10000);

  // Enter long at $90,000 (with slippage: 90000 * 1.0005 = 90045)
  const signal = { action: 'enter', type: 'long', level: 'Long1' };
  paperTrading.enterPosition(signal, 90000, -0.80);
  const entryPrice = paperTrading.getPosition().avgEntryPrice;
  const entryFee = paperTrading.getPosition().totalEntryFees;

  // Close at $91,000 (with slippage: 91000 * 0.9995 = 90954.5)
  const exitSignal = { action: 'close', reason: 'Take profit', exitType: 'take_profit' };
  const exitResult = paperTrading.closePosition(exitSignal, 91000, 0.05);

  // Calculate expected P&L with actual slippage
  // Gross P&L: 0.01 * (exitPrice - entryPrice)
  // Exit price with slippage: 91000 * 0.9995 = 90954.5
  const exitPriceWithSlippage = 91000 * 0.9995; // For long exit, slippage reduces price
  const grossPnL = 0.01 * (exitPriceWithSlippage - entryPrice);
  const exitFee = 0.01 * exitPriceWithSlippage * 0.00065;
  const expectedRealizedPnL = grossPnL - entryFee - exitFee;
  const tolerance = 0.20; // Allow for rounding and slippage calculations

  assert(
    Math.abs(exitResult.realizedPnL - expectedRealizedPnL) < tolerance,
    `Realized P&L on Exit (expected ~$${expectedRealizedPnL.toFixed(2)}, got $${exitResult.realizedPnL.toFixed(2)})`
  );
}

// ============================================================================
// DASHBOARD DATA ACCURACY TESTS
// ============================================================================

function testStrategyLevelsCalculation() {
  const strategy = new Strategy();
  const stats = {
    vwap: 90000,
    currentPrice: 90500,
    deviationPercent: 0.56,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };

  const levels = strategy.calculateStrategyLevels(stats, 90500);

  assert(
    levels !== null &&
    levels.entries.short1.price > 0 &&
    levels.entries.long1.price > 0 &&
    levels.exits.shortStop.price > 0 &&
    levels.exits.longStop.price > 0,
    'Strategy Levels Calculation (all levels calculated)'
  );

  // Verify Short 1 price calculation
  // Short 1 threshold = max(0.70, 0.60) = 0.70%
  // Price = 90000 * (1 + 0.007) = 90630
  const expectedShort1Price = 90000 * (1 + 0.007);
  const tolerance = 1; // Allow $1 difference

  assert(
    Math.abs(levels.entries.short1.price - expectedShort1Price) < tolerance,
    `Short 1 Entry Price (expected ~$${expectedShort1Price.toFixed(2)}, got $${levels.entries.short1.price.toFixed(2)})`
  );
}

function testStopLossLevels() {
  const strategy = new Strategy();
  const stats = {
    deviationPercent: 0.5,
    deviationHistory: {
      stats: {
        percentile90Percent: 0.70,
        percentile95Percent: 0.85,
        percentile10Percent: -0.75,
        percentile5Percent: -0.90
      }
    }
  };
  const position = { type: 'short', totalContractCount: 1, entryLevels: ['Short1'] };

  const stopLossLevels = strategy.getStopLossLevels(stats, position);

  assert(
    stopLossLevels.absolute === 2.25,
    'Stop Loss Levels (short absolute = +2.25%)'
  );
}

// ============================================================================
// RUN ALL TESTS
// ============================================================================

console.log('='.repeat(60));
console.log('STRATEGY LOGIC TEST SUITE');
console.log('='.repeat(60));
console.log('');

// Entry Tests
console.log('ENTRY TESTS:');
console.log('-'.repeat(60));
testShort1Entry_PercentileWins();
testShort1Entry_AbsoluteWins();
testShort2Entry();
testLong1Entry_PercentileWins();
testLong1Entry_AbsoluteWins();
testLong2Entry();
console.log('');

// Exit Tests
console.log('EXIT TESTS:');
console.log('-'.repeat(60));
testStopLossShort();
testStopLossLong();
testTakeProfit();
testTakeProfitNegative();
console.log('');

// Reentry Tests
console.log('REENTRY LOGIC TESTS:');
console.log('-'.repeat(60));
testReentryBlockedAfterShortStop();
testReentryAllowedAfterNeutralRange();
testReentryBlockedAfterLongStop();
console.log('');

// Paper Trading Tests
console.log('PAPER TRADING TESTS:');
console.log('-'.repeat(60));
testPositionSizing();
testShort2PositionSizing();
testLongPnLCalculation();
testShortPnLCalculation();
testFeeCalculation();
testRealizedPnLOnExit();
console.log('');

// Dashboard Data Tests
console.log('DASHBOARD DATA TESTS:');
console.log('-'.repeat(60));
testStrategyLevelsCalculation();
testStopLossLevels();
console.log('');

// Summary
console.log('='.repeat(60));
console.log('TEST SUMMARY');
console.log('='.repeat(60));
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`Passed: ${testsPassed} ✓`);
console.log(`Failed: ${testsFailed} ${testsFailed > 0 ? '✗' : ''}`);
console.log('');

if (testsFailed > 0) {
  console.log('FAILURES:');
  failures.forEach(failure => console.log(`  - ${failure}`));
  console.log('');
  process.exit(1);
} else {
  console.log('All tests passed! ✅');
  console.log('');
  process.exit(0);
}


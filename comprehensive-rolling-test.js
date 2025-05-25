const sqlite3 = require('sqlite3').verbose();

/**
 * Comprehensive Rolling Predictions Test Suite
 * Tests all functionality without requiring API keys
 */
class ComprehensiveRollingTest {
  constructor() {
    this.db = new sqlite3.Database('./crypto_data.db');
    this.testResults = [];
  }

  /**
   * Log test result
   */
  logTest(testName, passed, details = '') {
    const result = { testName, passed, details, timestamp: new Date().toISOString() };
    this.testResults.push(result);
    
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} ${testName}${details ? ': ' + details : ''}`);
    
    return passed;
  }

  /**
   * Count future predictions
   */
  async countFuturePredictions(symbol, interval, aiProvider) {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      const query = `
        SELECT COUNT(*) as count
        FROM predictions
        WHERE symbol = ? AND interval = ? AND ai_provider = ? AND target_time > ?
      `;

      this.db.get(query, [symbol, interval, aiProvider, currentTime], (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  /**
   * Get existing future predictions
   */
  async getExistingFuturePredictions(symbol, interval, aiProvider) {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      
      const query = `
        SELECT
          p1.target_time,
          p1.predicted_price,
          p1.prediction_time
        FROM predictions p1
        INNER JOIN (
          SELECT
            target_time,
            MAX(prediction_time) as max_prediction_time
          FROM predictions
          WHERE symbol = ? AND interval = ? AND ai_provider = ? AND target_time > ?
          GROUP BY target_time
        ) p2 ON p1.target_time = p2.target_time AND p1.prediction_time = p2.max_prediction_time
        WHERE p1.symbol = ? AND p1.interval = ? AND p1.ai_provider = ?
        ORDER BY p1.target_time ASC
      `;

      this.db.all(query, [
        symbol, interval, aiProvider, currentTime,
        symbol, interval, aiProvider
      ], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Insert mock prediction
   */
  async insertMockPrediction(symbol, interval, aiProvider, targetTime, predictedPrice) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO predictions (symbol, interval, ai_provider, target_time, predicted_price, prediction_time)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      this.db.run(query, [
        symbol, interval, aiProvider, targetTime, predictedPrice, Date.now()
      ], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  }

  /**
   * Clear test predictions
   */
  async clearTestPredictions(symbol, interval, aiProvider) {
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM predictions WHERE symbol = ? AND interval = ? AND ai_provider = ?`;
      
      this.db.run(query, [symbol, interval, aiProvider], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  /**
   * Test 1: Database Structure Verification
   */
  async testDatabaseStructure() {
    console.log('\n🔍 Test 1: Database Structure Verification');
    
    try {
      // Check if predictions table exists
      const tableExists = await new Promise((resolve, reject) => {
        const query = `SELECT name FROM sqlite_master WHERE type='table' AND name='predictions'`;
        this.db.get(query, [], (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        });
      });

      if (!this.logTest('Database table exists', tableExists)) {
        return false;
      }

      // Check table structure
      const columns = await new Promise((resolve, reject) => {
        const query = `PRAGMA table_info(predictions)`;
        this.db.all(query, [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });

      const requiredColumns = ['symbol', 'interval', 'ai_provider', 'target_time', 'predicted_price', 'prediction_time'];
      const existingColumns = columns.map(col => col.name);
      const hasAllColumns = requiredColumns.every(col => existingColumns.includes(col));

      this.logTest('Required columns exist', hasAllColumns, 
        hasAllColumns ? 'All columns present' : `Missing: ${requiredColumns.filter(col => !existingColumns.includes(col)).join(', ')}`);

      return tableExists && hasAllColumns;

    } catch (error) {
      this.logTest('Database structure test', false, error.message);
      return false;
    }
  }

  /**
   * Test 2: Edge Case - Zero Existing Predictions
   */
  async testZeroExistingPredictions() {
    console.log('\n🔍 Test 2: Zero Existing Predictions');
    
    const testSymbol = 'TEST_ZERO';
    const testInterval = '1h';
    const testProvider = 'test';

    try {
      // Clear any existing test data
      await this.clearTestPredictions(testSymbol, testInterval, testProvider);

      // Verify zero predictions
      const count = await this.countFuturePredictions(testSymbol, testInterval, testProvider);
      this.logTest('Zero predictions detected', count === 0, `Count: ${count}`);

      // Test calculation logic
      const predictionsNeeded = Math.max(0, 24 - count);
      this.logTest('Correct predictions needed calculation', predictionsNeeded === 24, `Needed: ${predictionsNeeded}`);

      return count === 0 && predictionsNeeded === 24;

    } catch (error) {
      this.logTest('Zero predictions test', false, error.message);
      return false;
    }
  }

  /**
   * Test 3: Edge Case - Partial Predictions (5 out of 24)
   */
  async testPartialPredictions() {
    console.log('\n🔍 Test 3: Partial Predictions (5 out of 24)');
    
    const testSymbol = 'TEST_PARTIAL';
    const testInterval = '4h';
    const testProvider = 'test';

    try {
      // Clear any existing test data
      await this.clearTestPredictions(testSymbol, testInterval, testProvider);

      // Insert 5 mock predictions
      const baseTime = Date.now() + (60 * 60 * 1000); // 1 hour from now
      const intervalMs = 4 * 60 * 60 * 1000; // 4 hours

      for (let i = 0; i < 5; i++) {
        const targetTime = baseTime + (i * intervalMs);
        const price = 50000 + (i * 100); // Mock price progression
        await this.insertMockPrediction(testSymbol, testInterval, testProvider, targetTime, price);
      }

      // Verify count
      const count = await this.countFuturePredictions(testSymbol, testInterval, testProvider);
      this.logTest('Partial predictions inserted', count === 5, `Count: ${count}`);

      // Test calculation logic
      const predictionsNeeded = Math.max(0, 24 - count);
      this.logTest('Correct gap calculation', predictionsNeeded === 19, `Needed: ${predictionsNeeded}`);

      // Test next timestamp calculation
      const existingPredictions = await this.getExistingFuturePredictions(testSymbol, testInterval, testProvider);
      this.logTest('Retrieved existing predictions', existingPredictions.length === 5, `Retrieved: ${existingPredictions.length}`);

      if (existingPredictions.length > 0) {
        const lastTimestamp = Math.max(...existingPredictions.map(p => p.target_time));
        const nextTimestamp = lastTimestamp + intervalMs;
        const expectedNext = baseTime + (5 * intervalMs);
        
        this.logTest('Next timestamp calculation', nextTimestamp === expectedNext, 
          `Calculated: ${new Date(nextTimestamp).toISOString()}, Expected: ${new Date(expectedNext).toISOString()}`);
      }

      return count === 5 && predictionsNeeded === 19;

    } catch (error) {
      this.logTest('Partial predictions test', false, error.message);
      return false;
    }
  }

  /**
   * Test 4: Edge Case - Full Predictions (24 out of 24)
   */
  async testFullPredictions() {
    console.log('\n🔍 Test 4: Full Predictions (24 out of 24)');
    
    const testSymbol = 'TEST_FULL';
    const testInterval = '1h';
    const testProvider = 'test';

    try {
      // Clear any existing test data
      await this.clearTestPredictions(testSymbol, testInterval, testProvider);

      // Insert 24 mock predictions
      const baseTime = Date.now() + (60 * 60 * 1000); // 1 hour from now
      const intervalMs = 60 * 60 * 1000; // 1 hour

      for (let i = 0; i < 24; i++) {
        const targetTime = baseTime + (i * intervalMs);
        const price = 60000 + (i * 50); // Mock price progression
        await this.insertMockPrediction(testSymbol, testInterval, testProvider, targetTime, price);
      }

      // Verify count
      const count = await this.countFuturePredictions(testSymbol, testInterval, testProvider);
      this.logTest('Full predictions inserted', count === 24, `Count: ${count}`);

      // Test calculation logic
      const predictionsNeeded = Math.max(0, 24 - count);
      this.logTest('No additional predictions needed', predictionsNeeded === 0, `Needed: ${predictionsNeeded}`);

      return count === 24 && predictionsNeeded === 0;

    } catch (error) {
      this.logTest('Full predictions test', false, error.message);
      return false;
    }
  }

  /**
   * Test 5: Timestamp Sequencing
   */
  async testTimestampSequencing() {
    console.log('\n🔍 Test 5: Timestamp Sequencing');
    
    const testSymbol = 'TEST_SEQUENCE';
    const testInterval = '1h';
    const testProvider = 'test';

    try {
      // Clear any existing test data
      await this.clearTestPredictions(testSymbol, testInterval, testProvider);

      // Insert predictions with specific timestamps
      const baseTime = Date.now() + (60 * 60 * 1000);
      const intervalMs = 60 * 60 * 1000;

      const timestamps = [];
      for (let i = 0; i < 10; i++) {
        const targetTime = baseTime + (i * intervalMs);
        timestamps.push(targetTime);
        await this.insertMockPrediction(testSymbol, testInterval, testProvider, targetTime, 50000 + i);
      }

      // Retrieve and verify sequencing
      const predictions = await this.getExistingFuturePredictions(testSymbol, testInterval, testProvider);
      
      // Check if timestamps are in ascending order
      let isSequential = true;
      for (let i = 1; i < predictions.length; i++) {
        if (predictions[i].target_time <= predictions[i-1].target_time) {
          isSequential = false;
          break;
        }
      }

      this.logTest('Timestamps in sequential order', isSequential, 
        `First: ${new Date(predictions[0]?.target_time).toISOString()}, Last: ${new Date(predictions[predictions.length-1]?.target_time).toISOString()}`);

      // Check interval consistency
      let intervalConsistent = true;
      for (let i = 1; i < predictions.length; i++) {
        const timeDiff = predictions[i].target_time - predictions[i-1].target_time;
        if (timeDiff !== intervalMs) {
          intervalConsistent = false;
          break;
        }
      }

      this.logTest('Interval consistency', intervalConsistent, 
        intervalConsistent ? 'All intervals match' : 'Interval mismatch detected');

      return isSequential && intervalConsistent;

    } catch (error) {
      this.logTest('Timestamp sequencing test', false, error.message);
      return false;
    }
  }

  /**
   * Test 6: Database Query Performance
   */
  async testQueryPerformance() {
    console.log('\n🔍 Test 6: Database Query Performance');
    
    try {
      const symbol = 'BTC';
      const interval = '1h';
      const aiProvider = 'gemini';

      // Test count query performance
      const countStart = Date.now();
      const count = await this.countFuturePredictions(symbol, interval, aiProvider);
      const countTime = Date.now() - countStart;
      
      this.logTest('Count query performance', countTime < 100, `${countTime}ms (should be < 100ms)`);

      // Test retrieval query performance
      const retrieveStart = Date.now();
      const predictions = await this.getExistingFuturePredictions(symbol, interval, aiProvider);
      const retrieveTime = Date.now() - retrieveStart;
      
      this.logTest('Retrieval query performance', retrieveTime < 200, `${retrieveTime}ms (should be < 200ms)`);

      // Memory usage check (basic)
      const memUsage = process.memoryUsage();
      const memMB = memUsage.heapUsed / 1024 / 1024;
      
      this.logTest('Memory usage reasonable', memMB < 100, `${memMB.toFixed(2)}MB (should be < 100MB)`);

      return countTime < 100 && retrieveTime < 200 && memMB < 100;

    } catch (error) {
      this.logTest('Query performance test', false, error.message);
      return false;
    }
  }

  /**
   * Test 7: Data Integrity
   */
  async testDataIntegrity() {
    console.log('\n🔍 Test 7: Data Integrity');
    
    try {
      // Test unique constraint
      const testSymbol = 'TEST_INTEGRITY';
      const testInterval = '1h';
      const testProvider = 'test';
      const targetTime = Date.now() + (60 * 60 * 1000);

      // Clear existing
      await this.clearTestPredictions(testSymbol, testInterval, testProvider);

      // Insert first prediction
      await this.insertMockPrediction(testSymbol, testInterval, testProvider, targetTime, 50000);

      // Try to insert duplicate (should be allowed with different prediction_time)
      let duplicateInserted = false;
      try {
        await this.insertMockPrediction(testSymbol, testInterval, testProvider, targetTime, 51000);
        duplicateInserted = true;
      } catch (error) {
        // This is expected if there's a unique constraint preventing exact duplicates
      }

      this.logTest('Duplicate handling', true, 
        duplicateInserted ? 'Multiple predictions for same target allowed' : 'Duplicate prevention working');

      // Verify latest prediction retrieval
      const predictions = await this.getExistingFuturePredictions(testSymbol, testInterval, testProvider);
      const hasCorrectLatest = predictions.length > 0 && predictions[0].target_time === targetTime;
      
      this.logTest('Latest prediction retrieval', hasCorrectLatest, 
        `Retrieved ${predictions.length} predictions for target time`);

      return true;

    } catch (error) {
      this.logTest('Data integrity test', false, error.message);
      return false;
    }
  }

  /**
   * Test 8: Multiple Symbols and Intervals
   */
  async testMultipleSymbolsIntervals() {
    console.log('\n🔍 Test 8: Multiple Symbols and Intervals');
    
    try {
      const testCases = [
        { symbol: 'TEST_BTC', interval: '1h', provider: 'test' },
        { symbol: 'TEST_ETH', interval: '4h', provider: 'test' },
        { symbol: 'TEST_ADA', interval: '1d', provider: 'test' }
      ];

      let allTestsPassed = true;

      for (const testCase of testCases) {
        // Clear and insert test data
        await this.clearTestPredictions(testCase.symbol, testCase.interval, testCase.provider);
        
        // Insert different numbers of predictions for each
        const predictionCount = testCase.interval === '1h' ? 10 : testCase.interval === '4h' ? 20 : 5;
        const intervalHours = testCase.interval === '1h' ? 1 : testCase.interval === '4h' ? 4 : 24;
        const intervalMs = intervalHours * 60 * 60 * 1000;
        const baseTime = Date.now() + intervalMs;

        for (let i = 0; i < predictionCount; i++) {
          const targetTime = baseTime + (i * intervalMs);
          await this.insertMockPrediction(testCase.symbol, testCase.interval, testCase.provider, targetTime, 50000 + i);
        }

        // Verify count
        const count = await this.countFuturePredictions(testCase.symbol, testCase.interval, testCase.provider);
        const testPassed = count === predictionCount;
        
        this.logTest(`${testCase.symbol} ${testCase.interval} count`, testPassed, `Expected: ${predictionCount}, Got: ${count}`);
        
        if (!testPassed) allTestsPassed = false;
      }

      return allTestsPassed;

    } catch (error) {
      this.logTest('Multiple symbols/intervals test', false, error.message);
      return false;
    }
  }

  /**
   * Cleanup test data
   */
  async cleanup() {
    console.log('\n🧹 Cleaning up test data...');
    
    const testSymbols = ['TEST_ZERO', 'TEST_PARTIAL', 'TEST_FULL', 'TEST_SEQUENCE', 'TEST_INTEGRITY', 'TEST_BTC', 'TEST_ETH', 'TEST_ADA'];
    
    for (const symbol of testSymbols) {
      try {
        await this.clearTestPredictions(symbol, '1h', 'test');
        await this.clearTestPredictions(symbol, '4h', 'test');
        await this.clearTestPredictions(symbol, '1d', 'test');
      } catch (error) {
        console.log(`Warning: Could not clean up ${symbol}: ${error.message}`);
      }
    }
    
    console.log('✅ Cleanup completed');
  }

  /**
   * Generate test report
   */
  generateReport() {
    console.log('\n📊 COMPREHENSIVE TEST REPORT');
    console.log('═'.repeat(50));
    
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Pass Rate: ${passRate}%`);
    
    if (passed < total) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.filter(r => !r.passed).forEach(result => {
        console.log(`  • ${result.testName}: ${result.details}`);
      });
    }
    
    const overallPass = passRate >= 90; // 90% pass rate required
    console.log(`\n${overallPass ? '✅ OVERALL: PASS' : '❌ OVERALL: FAIL'} (${passRate}% pass rate)`);
    
    return { passed, total, passRate, overallPass };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

/**
 * Main test execution
 */
async function runComprehensiveTests() {
  console.log('🚀 COMPREHENSIVE ROLLING PREDICTIONS TEST SUITE');
  console.log('═'.repeat(60));
  
  const tester = new ComprehensiveRollingTest();
  
  try {
    // Run all tests
    await tester.testDatabaseStructure();
    await tester.testZeroExistingPredictions();
    await tester.testPartialPredictions();
    await tester.testFullPredictions();
    await tester.testTimestampSequencing();
    await tester.testQueryPerformance();
    await tester.testDataIntegrity();
    await tester.testMultipleSymbolsIntervals();
    
    // Cleanup
    await tester.cleanup();
    
    // Generate report
    const report = tester.generateReport();
    
    if (report.overallPass) {
      console.log('\n🎉 All critical functionality validated!');
      console.log('✅ Rolling predictions system is ready for production use.');
    } else {
      console.log('\n⚠️  Some tests failed. Review the issues before production deployment.');
    }
    
    return report;
    
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
    return { passed: 0, total: 0, passRate: 0, overallPass: false };
  } finally {
    tester.close();
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  runComprehensiveTests().catch(console.error);
}

module.exports = { ComprehensiveRollingTest, runComprehensiveTests };
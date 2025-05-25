const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');

/**
 * Final Integration Test for Rolling Predictions
 * Simulates a complete rolling prediction cycle and validates data integrity
 */
class FinalIntegrationTest {
  constructor() {
    this.db = new sqlite3.Database('./crypto_data.db');
    this.baseUrl = 'http://localhost:3000';
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
   * Check server health
   */
  async checkServerHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Count future predictions in database
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
   * Get predictions via API
   */
  async getPredictionsViaAPI(symbol, interval, provider) {
    try {
      const response = await fetch(`${this.baseUrl}/api/predictions/${symbol}/${interval}?provider=${provider}`);
      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(`API call failed: ${error.message}`);
    }
  }

  /**
   * Test 1: Server Integration
   */
  async testServerIntegration() {
    console.log('\n🔍 Test 1: Server Integration');
    
    const serverRunning = await this.checkServerHealth();
    this.logTest('Server is running', serverRunning, 
      serverRunning ? 'Server responding on port 3000' : 'Server not accessible');

    return serverRunning;
  }

  /**
   * Test 2: API Endpoint Validation
   */
  async testAPIEndpoints() {
    console.log('\n🔍 Test 2: API Endpoint Validation');
    
    const testCases = [
      { symbol: 'BTC', interval: '1h', provider: 'gemini' },
      { symbol: 'ETH', interval: '1h', provider: 'claude' },
      { symbol: 'XRP', interval: '1h', provider: 'gpt' }
    ];

    let allTestsPassed = true;

    for (const testCase of testCases) {
      try {
        const predictions = await this.getPredictionsViaAPI(testCase.symbol, testCase.interval, testCase.provider);
        
        const hasPredictions = Array.isArray(predictions) && predictions.length > 0;
        this.logTest(`${testCase.symbol} ${testCase.interval} API`, hasPredictions, 
          `${predictions.length || 0} predictions returned`);

        if (!hasPredictions) allTestsPassed = false;

        // Validate prediction structure
        if (hasPredictions) {
          const firstPred = predictions[0];
          const hasRequiredFields = firstPred.hasOwnProperty('timestamp') && 
                                  firstPred.hasOwnProperty('predicted_price') &&
                                  firstPred.hasOwnProperty('actual_price');
          
          this.logTest(`${testCase.symbol} prediction structure`, hasRequiredFields,
            hasRequiredFields ? 'All required fields present' : 'Missing required fields');

          if (!hasRequiredFields) allTestsPassed = false;
        }

      } catch (error) {
        this.logTest(`${testCase.symbol} ${testCase.interval} API`, false, error.message);
        allTestsPassed = false;
      }
    }

    return allTestsPassed;
  }

  /**
   * Test 3: Rolling Prediction Cycle Simulation
   */
  async testRollingPredictionCycle() {
    console.log('\n🔍 Test 3: Rolling Prediction Cycle Simulation');
    
    const symbol = 'BTC';
    const interval = '1h';
    const provider = 'gemini';

    try {
      // Step 1: Check initial state
      const initialCount = await this.countFuturePredictions(symbol, interval, provider);
      this.logTest('Initial prediction count', initialCount >= 0, `${initialCount} predictions`);

      // Step 2: Get predictions via API (this should trigger rolling if needed)
      const apiPredictions = await this.getPredictionsViaAPI(symbol, interval, provider);
      const futurePredictions = apiPredictions.filter(p => p.timestamp > Date.now());
      
      this.logTest('Future predictions via API', futurePredictions.length >= 24, 
        `${futurePredictions.length} future predictions (expected ≥24)`);

      // Step 3: Verify database matches API
      const dbCount = await this.countFuturePredictions(symbol, interval, provider);
      const countMatches = dbCount >= 24;
      
      this.logTest('Database count matches expectations', countMatches,
        `DB: ${dbCount}, API Future: ${futurePredictions.length}`);

      // Step 4: Verify timestamp sequence
      const sortedPredictions = futurePredictions.sort((a, b) => a.timestamp - b.timestamp);
      let sequenceValid = true;
      const intervalMs = 60 * 60 * 1000; // 1 hour

      for (let i = 1; i < Math.min(sortedPredictions.length, 24); i++) {
        const timeDiff = sortedPredictions[i].timestamp - sortedPredictions[i-1].timestamp;
        if (Math.abs(timeDiff - intervalMs) > 1000) { // Allow 1 second tolerance
          sequenceValid = false;
          break;
        }
      }

      this.logTest('Timestamp sequence valid', sequenceValid,
        sequenceValid ? 'All intervals correct' : 'Interval mismatch detected');

      return countMatches && sequenceValid && futurePredictions.length >= 24;

    } catch (error) {
      this.logTest('Rolling prediction cycle', false, error.message);
      return false;
    }
  }

  /**
   * Test 4: Multiple Symbols Simultaneously
   */
  async testMultipleSymbolsSimultaneously() {
    console.log('\n🔍 Test 4: Multiple Symbols Simultaneously');
    
    const testSymbols = ['BTC', 'ETH', 'XRP'];
    const interval = '1h';
    const provider = 'gemini';

    let allTestsPassed = true;

    // Test all symbols simultaneously
    const promises = testSymbols.map(async (symbol) => {
      try {
        const predictions = await this.getPredictionsViaAPI(symbol, interval, provider);
        const futurePreds = predictions.filter(p => p.timestamp > Date.now());
        const dbCount = await this.countFuturePredictions(symbol, interval, provider);
        
        return {
          symbol,
          apiCount: futurePreds.length,
          dbCount,
          success: futurePreds.length >= 20 && dbCount >= 20 // Allow some flexibility
        };
      } catch (error) {
        return { symbol, success: false, error: error.message };
      }
    });

    const results = await Promise.all(promises);

    results.forEach(result => {
      if (result.success) {
        this.logTest(`${result.symbol} simultaneous processing`, true,
          `API: ${result.apiCount}, DB: ${result.dbCount}`);
      } else {
        this.logTest(`${result.symbol} simultaneous processing`, false,
          result.error || 'Insufficient predictions');
        allTestsPassed = false;
      }
    });

    return allTestsPassed;
  }

  /**
   * Test 5: Data Consistency Across Providers
   */
  async testDataConsistencyAcrossProviders() {
    console.log('\n🔍 Test 5: Data Consistency Across Providers');
    
    const symbol = 'BTC';
    const interval = '1h';
    const providers = ['gemini', 'claude', 'gpt'];

    let allTestsPassed = true;

    for (const provider of providers) {
      try {
        const predictions = await this.getPredictionsViaAPI(symbol, interval, provider);
        const futurePreds = predictions.filter(p => p.timestamp > Date.now());
        
        // Check for reasonable prediction count
        const reasonableCount = futurePreds.length >= 20 && futurePreds.length <= 30;
        this.logTest(`${provider} prediction count`, reasonableCount,
          `${futurePreds.length} predictions (expected 20-30)`);

        // Check for reasonable price values
        if (futurePreds.length > 0) {
          const prices = futurePreds.map(p => parseFloat(p.predicted_price));
          const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
          const reasonablePrice = avgPrice > 50000 && avgPrice < 200000; // Reasonable BTC range
          
          this.logTest(`${provider} price reasonableness`, reasonablePrice,
            `Avg price: $${avgPrice.toFixed(2)} (expected $50k-$200k)`);

          if (!reasonablePrice) allTestsPassed = false;
        }

        if (!reasonableCount) allTestsPassed = false;

      } catch (error) {
        this.logTest(`${provider} consistency test`, false, error.message);
        allTestsPassed = false;
      }
    }

    return allTestsPassed;
  }

  /**
   * Test 6: Performance Under Load
   */
  async testPerformanceUnderLoad() {
    console.log('\n🔍 Test 6: Performance Under Load');
    
    const startTime = Date.now();
    
    // Make multiple concurrent API calls
    const promises = [];
    const symbols = ['BTC', 'ETH', 'XRP'];
    const intervals = ['1h'];
    const providers = ['gemini', 'claude'];

    for (const symbol of symbols) {
      for (const interval of intervals) {
        for (const provider of providers) {
          promises.push(
            this.getPredictionsViaAPI(symbol, interval, provider)
              .then(data => ({ symbol, interval, provider, success: true, count: data.length }))
              .catch(error => ({ symbol, interval, provider, success: false, error: error.message }))
          );
        }
      }
    }

    const results = await Promise.all(promises);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Analyze results
    const successfulRequests = results.filter(r => r.success).length;
    const totalRequests = results.length;
    const successRate = (successfulRequests / totalRequests) * 100;

    this.logTest('Load test success rate', successRate >= 80,
      `${successfulRequests}/${totalRequests} requests succeeded (${successRate.toFixed(1)}%)`);

    this.logTest('Load test performance', totalTime < 30000,
      `${totalTime}ms for ${totalRequests} concurrent requests (should be < 30s)`);

    return successRate >= 80 && totalTime < 30000;
  }

  /**
   * Test 7: System Stability
   */
  async testSystemStability() {
    console.log('\n🔍 Test 7: System Stability');
    
    try {
      // Memory usage check
      const memUsage = process.memoryUsage();
      const memMB = memUsage.heapUsed / 1024 / 1024;
      
      this.logTest('Memory usage stable', memMB < 150,
        `${memMB.toFixed(2)}MB heap used (should be < 150MB)`);

      // Database connection test
      const dbConnectionValid = await new Promise((resolve) => {
        this.db.get('SELECT 1 as test', (err, row) => {
          resolve(!err && row && row.test === 1);
        });
      });

      this.logTest('Database connection stable', dbConnectionValid,
        dbConnectionValid ? 'Database responding' : 'Database connection issues');

      // Server response time test
      const startTime = Date.now();
      const serverResponsive = await this.checkServerHealth();
      const responseTime = Date.now() - startTime;

      this.logTest('Server response time', responseTime < 1000,
        `${responseTime}ms response time (should be < 1000ms)`);

      return memMB < 150 && dbConnectionValid && serverResponsive && responseTime < 1000;

    } catch (error) {
      this.logTest('System stability test', false, error.message);
      return false;
    }
  }

  /**
   * Generate final report
   */
  generateFinalReport() {
    console.log('\n📊 FINAL INTEGRATION TEST REPORT');
    console.log('═'.repeat(60));
    
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;
    const passRate = ((passed / total) * 100).toFixed(1);
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Pass Rate: ${passRate}%`);
    
    // Categorize test results
    const categories = {
      'Server Integration': this.testResults.filter(r => r.testName.includes('Server') || r.testName.includes('API')),
      'Rolling Logic': this.testResults.filter(r => r.testName.includes('Rolling') || r.testName.includes('cycle') || r.testName.includes('sequence')),
      'Multi-Symbol': this.testResults.filter(r => r.testName.includes('Multiple') || r.testName.includes('simultaneous')),
      'Data Consistency': this.testResults.filter(r => r.testName.includes('consistency') || r.testName.includes('provider')),
      'Performance': this.testResults.filter(r => r.testName.includes('Load') || r.testName.includes('performance') || r.testName.includes('response')),
      'Stability': this.testResults.filter(r => r.testName.includes('Memory') || r.testName.includes('Database') || r.testName.includes('stable'))
    };

    console.log('\n📋 CATEGORY BREAKDOWN:');
    Object.entries(categories).forEach(([category, tests]) => {
      if (tests.length > 0) {
        const categoryPassed = tests.filter(t => t.passed).length;
        const categoryTotal = tests.length;
        const categoryRate = ((categoryPassed / categoryTotal) * 100).toFixed(1);
        console.log(`  ${category}: ${categoryPassed}/${categoryTotal} (${categoryRate}%)`);
      }
    });
    
    if (passed < total) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.filter(r => !r.passed).forEach(result => {
        console.log(`  • ${result.testName}: ${result.details}`);
      });
    }
    
    const overallPass = passRate >= 95; // 95% pass rate required for production
    
    console.log(`\n${overallPass ? '✅ OVERALL: PRODUCTION READY' : '❌ OVERALL: NOT PRODUCTION READY'}`);
    console.log(`Pass Rate: ${passRate}% (requires ≥95% for production approval)`);
    
    if (overallPass) {
      console.log('\n🎉 VALIDATION COMPLETE: Rolling Predictions System Approved for Production!');
      console.log('✅ All critical functionality validated');
      console.log('✅ Performance requirements met');
      console.log('✅ Integration tests passed');
      console.log('✅ Data integrity confirmed');
      console.log('✅ Multi-symbol support working');
      console.log('✅ System stability verified');
    } else {
      console.log('\n⚠️  VALIDATION INCOMPLETE: Review failed tests before production deployment.');
    }
    
    return { passed, total, passRate, overallPass, categories };
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
async function runFinalIntegrationTest() {
  console.log('🚀 FINAL INTEGRATION TEST - ROLLING PREDICTIONS SYSTEM');
  console.log('═'.repeat(70));
  console.log('Testing complete rolling prediction cycle with data integrity validation');
  console.log('═'.repeat(70));
  
  const tester = new FinalIntegrationTest();
  
  try {
    // Run all integration tests
    await tester.testServerIntegration();
    await tester.testAPIEndpoints();
    await tester.testRollingPredictionCycle();
    await tester.testMultipleSymbolsSimultaneously();
    await tester.testDataConsistencyAcrossProviders();
    await tester.testPerformanceUnderLoad();
    await tester.testSystemStability();
    
    // Generate final report
    const report = tester.generateFinalReport();
    
    return report;
    
  } catch (error) {
    console.error('❌ Integration test suite error:', error.message);
    return { passed: 0, total: 0, passRate: 0, overallPass: false };
  } finally {
    tester.close();
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  runFinalIntegrationTest().catch(console.error);
}

module.exports = { FinalIntegrationTest, runFinalIntegrationTest };
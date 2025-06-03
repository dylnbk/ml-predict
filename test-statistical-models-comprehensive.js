const PredictionService = require('./services/predictionService');
const StatisticalModels = require('./utils/statisticalModels');

/**
 * Comprehensive Test Script for Statistical Models (ARIMA & Holt-Winters)
 * Verifies that statistical models work identically to AI providers in terms of:
 * - Scheduling and timing
 * - Database storage format
 * - Frontend display compatibility
 * - Rolling predictions functionality
 * - Accuracy tracking compatibility
 */

class StatisticalModelsTestSuite {
  constructor() {
    this.predictionService = new PredictionService();
    this.statisticalModels = new StatisticalModels();
    this.testResults = {
      passed: 0,
      failed: 0,
      details: []
    };
  }

  /**
   * Log test result
   */
  logResult(testName, passed, details = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${testName}`);
    if (details) console.log(`   ${details}`);
    
    this.testResults.details.push({
      test: testName,
      passed,
      details
    });
    
    if (passed) {
      this.testResults.passed++;
    } else {
      this.testResults.failed++;
    }
  }

  /**
   * Test 1: Verify statistical models generate exactly 24 predictions for each interval
   */
  async testPredictionCount() {
    console.log('\n🧪 Test 1: Prediction Count Verification');
    console.log('=' .repeat(50));

    const symbols = ['BTC', 'ETH'];
    const intervals = ['1h', '4h', '1d'];
    const models = ['arima', 'holt_winters'];

    for (const symbol of symbols) {
      for (const interval of intervals) {
        for (const model of models) {
          try {
            console.log(`\n📊 Testing ${model.toUpperCase()} for ${symbol} ${interval}...`);
            
            const result = await this.predictionService.generatePredictions(
              symbol, interval, model, 3, 24
            );

            if (result.success) {
              const count = result.predictions.length;
              const passed = count === 24;
              this.logResult(
                `${model.toUpperCase()} ${symbol} ${interval} count`,
                passed,
                `Generated ${count}/24 predictions`
              );

              // Verify prediction format
              const validFormat = result.predictions.every(pred =>
                pred.hasOwnProperty('timestamp') &&
                pred.hasOwnProperty('price') &&
                typeof pred.timestamp === 'number' &&
                typeof pred.price === 'number' &&
                pred.price > 0
              );
              
              this.logResult(
                `${model.toUpperCase()} ${symbol} ${interval} format`,
                validFormat,
                validFormat ? 'All predictions have correct format' : 'Invalid prediction format detected'
              );

            } else {
              this.logResult(
                `${model.toUpperCase()} ${symbol} ${interval} generation`,
                false,
                `Failed: ${result.error}`
              );
            }

          } catch (error) {
            this.logResult(
              `${model.toUpperCase()} ${symbol} ${interval} generation`,
              false,
              `Error: ${error.message}`
            );
          }
        }
      }
    }
  }

  /**
   * Test 2: Verify database storage format matches AI predictions exactly
   */
  async testDatabaseStorage() {
    console.log('\n🧪 Test 2: Database Storage Format Verification');
    console.log('=' .repeat(50));

    const symbol = 'BTC';
    const interval = '1h';

    try {
      // Generate predictions with different providers
      console.log('\n📊 Generating predictions with different providers...');
      
      const arimaResult = await this.predictionService.generatePredictions(symbol, interval, 'arima', 3, 5);
      const hwResult = await this.predictionService.generatePredictions(symbol, interval, 'holt_winters', 3, 5);

      if (arimaResult.success && hwResult.success) {
        // Fetch stored predictions from database
        const arimaPredictions = await this.predictionService.getPredictions(symbol, interval, 'arima');
        const hwPredictions = await this.predictionService.getPredictions(symbol, interval, 'holt_winters');

        // Verify database structure
        const arimaDbStructure = arimaPredictions.length > 0 ? Object.keys(arimaPredictions[0]) : [];
        const hwDbStructure = hwPredictions.length > 0 ? Object.keys(hwPredictions[0]) : [];

        const expectedFields = ['timestamp', 'predicted_price', 'actual_price'];
        const arimaHasFields = expectedFields.every(field => arimaDbStructure.includes(field));
        const hwHasFields = expectedFields.every(field => hwDbStructure.includes(field));

        this.logResult(
          'ARIMA database structure',
          arimaHasFields,
          `Fields: ${arimaDbStructure.join(', ')}`
        );

        this.logResult(
          'Holt-Winters database structure',
          hwHasFields,
          `Fields: ${hwDbStructure.join(', ')}`
        );

        // Compare with AI prediction structure (if available)
        try {
          const geminiPredictions = await this.predictionService.getPredictions(symbol, interval, 'gemini');
          if (geminiPredictions.length > 0) {
            const geminiStructure = Object.keys(geminiPredictions[0]);
            const structureMatch = JSON.stringify(arimaDbStructure.sort()) === JSON.stringify(geminiStructure.sort());
            
            this.logResult(
              'Statistical vs AI structure match',
              structureMatch,
              `ARIMA: ${arimaDbStructure.join(', ')} | Gemini: ${geminiStructure.join(', ')}`
            );
          }
        } catch (error) {
          console.log('   Note: No Gemini predictions available for comparison');
        }

      } else {
        this.logResult(
          'Database storage test setup',
          false,
          'Failed to generate test predictions'
        );
      }

    } catch (error) {
      this.logResult(
        'Database storage test',
        false,
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Test 3: Verify rolling predictions work correctly
   */
  async testRollingPredictions() {
    console.log('\n🧪 Test 3: Rolling Predictions Functionality');
    console.log('=' .repeat(50));

    const symbol = 'ETH';
    const interval = '4h';
    const models = ['arima', 'holt_winters'];

    for (const model of models) {
      try {
        console.log(`\n📊 Testing rolling predictions for ${model.toUpperCase()}...`);

        // Check initial count
        const initialCount = await this.predictionService.countFuturePredictions(symbol, interval, model);
        console.log(`   Initial future predictions: ${initialCount}`);

        // Run rolling predictions
        const rollingResult = await this.predictionService.generateRollingPredictions(symbol, interval, model);

        if (rollingResult.success) {
          const finalCount = await this.predictionService.countFuturePredictions(symbol, interval, model);
          const expectedFinalCount = Math.min(24, initialCount + rollingResult.generated);
          
          this.logResult(
            `${model.toUpperCase()} rolling predictions`,
            finalCount >= expectedFinalCount,
            `Initial: ${initialCount}, Generated: ${rollingResult.generated}, Final: ${finalCount}`
          );

          // Test that rolling doesn't generate when already at 24
          if (finalCount >= 24) {
            const secondRolling = await this.predictionService.generateRollingPredictions(symbol, interval, model);
            const noNewGenerated = secondRolling.predictionsNeeded === 0;
            
            this.logResult(
              `${model.toUpperCase()} rolling when full`,
              noNewGenerated,
              `Predictions needed when full: ${secondRolling.predictionsNeeded}`
            );
          }

        } else {
          this.logResult(
            `${model.toUpperCase()} rolling predictions`,
            false,
            `Failed: ${rollingResult.error}`
          );
        }

      } catch (error) {
        this.logResult(
          `${model.toUpperCase()} rolling predictions`,
          false,
          `Error: ${error.message}`
        );
      }
    }
  }

  /**
   * Test 4: Verify timestamp calculations are correct for each interval
   */
  async testTimestampCalculations() {
    console.log('\n🧪 Test 4: Timestamp Calculation Verification');
    console.log('=' .repeat(50));

    const symbol = 'BTC';
    const intervals = ['1h', '4h', '1d'];
    const model = 'arima';

    const intervalMs = {
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000
    };

    for (const interval of intervals) {
      try {
        console.log(`\n📊 Testing timestamp calculations for ${interval}...`);

        const result = await this.predictionService.generatePredictions(symbol, interval, model, 3, 3);

        if (result.success && result.predictions.length >= 2) {
          const predictions = result.predictions;
          const timeDiffs = [];
          
          for (let i = 1; i < predictions.length; i++) {
            const diff = predictions[i].timestamp - predictions[i-1].timestamp;
            timeDiffs.push(diff);
          }

          const expectedInterval = intervalMs[interval];
          const correctIntervals = timeDiffs.every(diff => diff === expectedInterval);

          this.logResult(
            `${interval} timestamp intervals`,
            correctIntervals,
            `Expected: ${expectedInterval}ms, Got: ${timeDiffs.join(', ')}ms`
          );

          // Verify timestamps are in the future
          const currentTime = Date.now();
          const allFuture = predictions.every(pred => pred.timestamp > currentTime);

          this.logResult(
            `${interval} future timestamps`,
            allFuture,
            allFuture ? 'All timestamps are in the future' : 'Some timestamps are in the past'
          );

        } else {
          this.logResult(
            `${interval} timestamp test setup`,
            false,
            'Failed to generate test predictions'
          );
        }

      } catch (error) {
        this.logResult(
          `${interval} timestamp calculations`,
          false,
          `Error: ${error.message}`
        );
      }
    }
  }

  /**
   * Test 5: Verify error handling and edge cases
   */
  async testErrorHandling() {
    console.log('\n🧪 Test 5: Error Handling and Edge Cases');
    console.log('=' .repeat(50));

    try {
      // Test with insufficient historical data
      console.log('\n📊 Testing error handling...');

      // Test ARIMA with insufficient data (should handle gracefully)
      const mockKlineData = [
        { timestamp: Date.now() - 3600000, close: 50000 },
        { timestamp: Date.now() - 7200000, close: 50100 }
      ]; // Only 2 data points

      try {
        const arimaResult = this.statisticalModels.generateARIMAPredictions(mockKlineData, '1h', 24);
        this.logResult(
          'ARIMA insufficient data handling',
          false,
          'Should have thrown error for insufficient data'
        );
      } catch (error) {
        this.logResult(
          'ARIMA insufficient data handling',
          true,
          `Correctly threw error: ${error.message}`
        );
      }

      // Test Holt-Winters with insufficient data
      try {
        const hwResult = this.statisticalModels.generateHoltWintersPredictions(mockKlineData, '1h', 24);
        this.logResult(
          'Holt-Winters insufficient data handling',
          false,
          'Should have thrown error for insufficient data'
        );
      } catch (error) {
        this.logResult(
          'Holt-Winters insufficient data handling',
          true,
          `Correctly threw error: ${error.message}`
        );
      }

      // Test validation function
      const validPredictions = [
        { timestamp: Date.now() + 3600000, price: 50000 },
        { timestamp: Date.now() + 7200000, price: 50100 }
      ];

      const invalidPredictions = [
        { timestamp: Date.now() + 3600000, price: -100 }, // Negative price
        { timestamp: 'invalid', price: 50100 } // Invalid timestamp
      ];

      const validResult = this.statisticalModels.validatePredictions(validPredictions);
      const invalidResult = this.statisticalModels.validatePredictions(invalidPredictions);

      this.logResult(
        'Prediction validation (valid)',
        validResult,
        'Valid predictions should pass validation'
      );

      this.logResult(
        'Prediction validation (invalid)',
        !invalidResult,
        'Invalid predictions should fail validation'
      );

    } catch (error) {
      this.logResult(
        'Error handling test',
        false,
        `Unexpected error: ${error.message}`
      );
    }
  }

  /**
   * Test 6: Compare output format with existing AI predictions
   */
  async testOutputFormatCompatibility() {
    console.log('\n🧪 Test 6: Output Format Compatibility');
    console.log('=' .repeat(50));

    const symbol = 'BTC';
    const interval = '1h';

    try {
      console.log('\n📊 Comparing output formats...');

      // Generate statistical predictions
      const arimaResult = await this.predictionService.generatePredictions(symbol, interval, 'arima', 3, 5);
      const hwResult = await this.predictionService.generatePredictions(symbol, interval, 'holt_winters', 3, 5);

      if (arimaResult.success && hwResult.success) {
        // Check result structure
        const expectedResultFields = ['success', 'symbol', 'interval', 'aiProvider', 'predictionTime', 'predictions'];
        
        const arimaHasFields = expectedResultFields.every(field => arimaResult.hasOwnProperty(field));
        const hwHasFields = expectedResultFields.every(field => hwResult.hasOwnProperty(field));

        this.logResult(
          'ARIMA result structure',
          arimaHasFields,
          `Fields: ${Object.keys(arimaResult).join(', ')}`
        );

        this.logResult(
          'Holt-Winters result structure',
          hwHasFields,
          `Fields: ${Object.keys(hwResult).join(', ')}`
        );

        // Check prediction array structure
        const arimaPredFormat = arimaResult.predictions.every(pred =>
          pred.hasOwnProperty('timestamp') && pred.hasOwnProperty('price')
        );

        const hwPredFormat = hwResult.predictions.every(pred =>
          pred.hasOwnProperty('timestamp') && pred.hasOwnProperty('price')
        );

        this.logResult(
          'ARIMA prediction format',
          arimaPredFormat,
          'Predictions have timestamp and price fields'
        );

        this.logResult(
          'Holt-Winters prediction format',
          hwPredFormat,
          'Predictions have timestamp and price fields'
        );

        // Verify aiProvider field is correctly set
        this.logResult(
          'ARIMA provider field',
          arimaResult.aiProvider === 'arima',
          `Provider: ${arimaResult.aiProvider}`
        );

        this.logResult(
          'Holt-Winters provider field',
          hwResult.aiProvider === 'holt_winters',
          `Provider: ${hwResult.aiProvider}`
        );

      } else {
        this.logResult(
          'Output format test setup',
          false,
          'Failed to generate test predictions'
        );
      }

    } catch (error) {
      this.logResult(
        'Output format compatibility test',
        false,
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Test 7: Verify frontend display compatibility
   */
  async testFrontendCompatibility() {
    console.log('\n🧪 Test 7: Frontend Display Compatibility');
    console.log('=' .repeat(50));

    const symbol = 'ETH';
    const interval = '1h';

    try {
      console.log('\n📊 Testing frontend data retrieval...');

      // Test data retrieval as frontend would do it
      const arimaPredictions = await this.predictionService.getPredictions(symbol, interval, 'arima');
      const hwPredictions = await this.predictionService.getPredictions(symbol, interval, 'holt_winters');

      // Verify data structure matches what frontend expects
      if (arimaPredictions.length > 0) {
        const prediction = arimaPredictions[0];
        const hasRequiredFields = prediction.hasOwnProperty('timestamp') && 
                                 prediction.hasOwnProperty('predicted_price');

        this.logResult(
          'ARIMA frontend data structure',
          hasRequiredFields,
          `Available fields: ${Object.keys(prediction).join(', ')}`
        );

        // Test timestamp format (should be number for JavaScript Date)
        const validTimestamp = typeof prediction.timestamp === 'number' && prediction.timestamp > 0;
        this.logResult(
          'ARIMA timestamp format',
          validTimestamp,
          `Timestamp type: ${typeof prediction.timestamp}, value: ${prediction.timestamp}`
        );
      }

      if (hwPredictions.length > 0) {
        const prediction = hwPredictions[0];
        const hasRequiredFields = prediction.hasOwnProperty('timestamp') && 
                                 prediction.hasOwnProperty('predicted_price');

        this.logResult(
          'Holt-Winters frontend data structure',
          hasRequiredFields,
          `Available fields: ${Object.keys(prediction).join(', ')}`
        );

        // Test timestamp format
        const validTimestamp = typeof prediction.timestamp === 'number' && prediction.timestamp > 0;
        this.logResult(
          'Holt-Winters timestamp format',
          validTimestamp,
          `Timestamp type: ${typeof prediction.timestamp}, value: ${prediction.timestamp}`
        );
      }

      // Test that predictions can be sorted by timestamp (as frontend does)
      if (arimaPredictions.length > 1) {
        const sortedPredictions = [...arimaPredictions].sort((a, b) => a.timestamp - b.timestamp);
        const isSortable = JSON.stringify(sortedPredictions) === JSON.stringify(arimaPredictions) ||
                          JSON.stringify(sortedPredictions.reverse()) === JSON.stringify(arimaPredictions);

        this.logResult(
          'ARIMA predictions sortable',
          isSortable,
          'Predictions can be sorted by timestamp'
        );
      }

    } catch (error) {
      this.logResult(
        'Frontend compatibility test',
        false,
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Statistical Models Test Suite');
    console.log('=' .repeat(60));
    console.log('Testing ARIMA and Holt-Winters models for compatibility with AI providers');
    console.log('=' .repeat(60));

    try {
      await this.testPredictionCount();
      await this.testDatabaseStorage();
      await this.testRollingPredictions();
      await this.testTimestampCalculations();
      await this.testErrorHandling();
      await this.testOutputFormatCompatibility();
      await this.testFrontendCompatibility();

      // Print summary
      console.log('\n' + '=' .repeat(60));
      console.log('📊 TEST SUMMARY');
      console.log('=' .repeat(60));
      console.log(`✅ Passed: ${this.testResults.passed}`);
      console.log(`❌ Failed: ${this.testResults.failed}`);
      console.log(`📈 Success Rate: ${((this.testResults.passed / (this.testResults.passed + this.testResults.failed)) * 100).toFixed(1)}%`);

      if (this.testResults.failed > 0) {
        console.log('\n❌ Failed Tests:');
        this.testResults.details
          .filter(result => !result.passed)
          .forEach(result => {
            console.log(`   • ${result.test}: ${result.details}`);
          });
      }

      console.log('\n🎯 VERIFICATION COMPLETE');
      console.log('Statistical models (ARIMA & Holt-Winters) have been tested for:');
      console.log('✓ Identical prediction count (24 predictions per interval)');
      console.log('✓ Compatible database storage format');
      console.log('✓ Working rolling predictions functionality');
      console.log('✓ Correct timestamp calculations');
      console.log('✓ Proper error handling');
      console.log('✓ Compatible output format with AI providers');
      console.log('✓ Frontend display compatibility');

      const allPassed = this.testResults.failed === 0;
      if (allPassed) {
        console.log('\n🎉 ALL TESTS PASSED! Statistical models work identically to AI providers.');
      } else {
        console.log('\n⚠️  Some tests failed. Please review the issues above.');
      }

      return allPassed;

    } catch (error) {
      console.error('\n❌ Test suite error:', error.message);
      console.error(error.stack);
      return false;
    } finally {
      this.predictionService.close();
    }
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  const testSuite = new StatisticalModelsTestSuite();
  testSuite.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = StatisticalModelsTestSuite;
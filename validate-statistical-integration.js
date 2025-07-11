const PredictionService = require('./services/predictionService');

/**
 * Validation Script: Statistical Models Integration
 * Validates all requirements from the task specification
 */

class StatisticalIntegrationValidator {
  constructor() {
    this.predictionService = new PredictionService();
    this.validationResults = [];
  }

  /**
   * Log validation result
   */
  logValidation(requirement, passed, details = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    const result = {
      requirement,
      passed,
      details,
      timestamp: new Date().toISOString()
    };
    
    this.validationResults.push(result);
    console.log(`${status}: ${requirement}`);
    if (details) console.log(`   ${details}`);
  }

  /**
   * REQUIREMENT 1: Both statistical models generate exactly 24 predictions for each interval
   */
  async validatePredictionCounts() {
    console.log('\n📋 REQUIREMENT 1: Exact 24 Predictions Per Interval');
    console.log('─'.repeat(60));

    const symbols = ['BTC', 'ETH'];
    const intervals = ['1h', '4h', '1d'];
    const models = ['arima', 'holt_winters'];

    let allPassed = true;

    for (const symbol of symbols) {
      for (const interval of intervals) {
        for (const model of models) {
          try {
            console.log(`\n🔍 Testing ${model.toUpperCase()} ${symbol} ${interval}...`);
            
            const result = await this.predictionService.generatePredictions(
              symbol, interval, model, 3, 24
            );

            if (result.success) {
              const count = result.predictions.length;
              const passed = count === 24;
              
              this.logValidation(
                `${model.toUpperCase()} ${symbol} ${interval} generates 24 predictions`,
                passed,
                `Generated ${count}/24 predictions`
              );
              
              if (!passed) allPassed = false;
            } else {
              this.logValidation(
                `${model.toUpperCase()} ${symbol} ${interval} generation`,
                false,
                `Failed: ${result.error}`
              );
              allPassed = false;
            }

          } catch (error) {
            this.logValidation(
              `${model.toUpperCase()} ${symbol} ${interval} generation`,
              false,
              `Error: ${error.message}`
            );
            allPassed = false;
          }
        }
      }
    }

    return allPassed;
  }

  /**
   * REQUIREMENT 2: Predictions stored with same structure as AI predictions
   */
  async validateDatabaseStructure() {
    console.log('\n📋 REQUIREMENT 2: Database Storage Structure Match');
    console.log('─'.repeat(60));

    const symbol = 'BTC';
    const interval = '1h';
    let allPassed = true;

    try {
      // Generate predictions with statistical models
      console.log('\n🔍 Generating test predictions...');
      await this.predictionService.generatePredictions(symbol, interval, 'arima', 3, 5);
      await this.predictionService.generatePredictions(symbol, interval, 'holt_winters', 3, 5);

      // Fetch stored predictions
      const arimaPreds = await this.predictionService.getPredictions(symbol, interval, 'arima');
      const hwPreds = await this.predictionService.getPredictions(symbol, interval, 'holt_winters');

      // Check required fields
      const requiredFields = ['timestamp', 'predicted_price', 'actual_price'];
      
      if (arimaPreds.length > 0) {
        const arimaFields = Object.keys(arimaPreds[0]);
        const hasAllFields = requiredFields.every(field => arimaFields.includes(field));
        
        this.logValidation(
          'ARIMA database structure matches AI format',
          hasAllFields,
          `Fields: ${arimaFields.join(', ')}`
        );
        
        if (!hasAllFields) allPassed = false;
      }

      if (hwPreds.length > 0) {
        const hwFields = Object.keys(hwPreds[0]);
        const hasAllFields = requiredFields.every(field => hwFields.includes(field));
        
        this.logValidation(
          'Holt-Winters database structure matches AI format',
          hasAllFields,
          `Fields: ${hwFields.join(', ')}`
        );
        
        if (!hasAllFields) allPassed = false;
      }

      // Compare with AI predictions if available
      try {
        const geminiPreds = await this.predictionService.getPredictions(symbol, interval, 'gemini');
        if (geminiPreds.length > 0 && arimaPreds.length > 0) {
          const geminiFields = Object.keys(geminiPreds[0]).sort();
          const arimaFields = Object.keys(arimaPreds[0]).sort();
          const structureMatch = JSON.stringify(geminiFields) === JSON.stringify(arimaFields);
          
          this.logValidation(
            'Statistical vs AI database structure identical',
            structureMatch,
            `Gemini: ${geminiFields.join(', ')} | ARIMA: ${arimaFields.join(', ')}`
          );
          
          if (!structureMatch) allPassed = false;
        }
      } catch (error) {
        console.log('   Note: No AI predictions available for comparison');
      }

    } catch (error) {
      this.logValidation(
        'Database structure validation',
        false,
        `Error: ${error.message}`
      );
      allPassed = false;
    }

    return allPassed;
  }

  /**
   * REQUIREMENT 3: Rolling predictions work correctly
   */
  async validateRollingPredictions() {
    console.log('\n📋 REQUIREMENT 3: Rolling Predictions Functionality');
    console.log('─'.repeat(60));

    const symbol = 'ETH';
    const interval = '4h';
    const models = ['arima', 'holt_winters'];
    let allPassed = true;

    for (const model of models) {
      try {
        console.log(`\n🔍 Testing ${model.toUpperCase()} rolling predictions...`);

        // Get initial count
        const initialCount = await this.predictionService.countFuturePredictions(symbol, interval, model);
        
        // Run rolling predictions
        const rollingResult = await this.predictionService.generateRollingPredictions(symbol, interval, model);
        
        if (rollingResult.success) {
          const finalCount = await this.predictionService.countFuturePredictions(symbol, interval, model);
          const expectedCount = Math.min(24, initialCount + rollingResult.generated);
          
          const passed = finalCount >= expectedCount;
          this.logValidation(
            `${model.toUpperCase()} rolling predictions work correctly`,
            passed,
            `Initial: ${initialCount}, Generated: ${rollingResult.generated}, Final: ${finalCount}`
          );
          
          if (!passed) allPassed = false;

          // Test that rolling stops at 24
          if (finalCount >= 24) {
            const secondRolling = await this.predictionService.generateRollingPredictions(symbol, interval, model);
            const noNewGenerated = secondRolling.predictionsNeeded === 0;
            
            this.logValidation(
              `${model.toUpperCase()} rolling stops when full (24 predictions)`,
              noNewGenerated,
              `Predictions needed when full: ${secondRolling.predictionsNeeded}`
            );
            
            if (!noNewGenerated) allPassed = false;
          }

        } else {
          this.logValidation(
            `${model.toUpperCase()} rolling predictions`,
            false,
            `Failed: ${rollingResult.error}`
          );
          allPassed = false;
        }

      } catch (error) {
        this.logValidation(
          `${model.toUpperCase()} rolling predictions`,
          false,
          `Error: ${error.message}`
        );
        allPassed = false;
      }
    }

    return allPassed;
  }

  /**
   * REQUIREMENT 4: Accuracy tracking compatibility
   */
  async validateAccuracyTracking() {
    console.log('\n📋 REQUIREMENT 4: Accuracy Tracking Compatibility');
    console.log('─'.repeat(60));

    const symbol = 'BTC';
    const interval = '1h';
    let allPassed = true;

    try {
      console.log('\n🔍 Testing accuracy tracking compatibility...');

      // Generate predictions with statistical models
      await this.predictionService.generatePredictions(symbol, interval, 'arima', 3, 5);
      await this.predictionService.generatePredictions(symbol, interval, 'holt_winters', 3, 5);

      // Fetch predictions to check accuracy fields
      const arimaPreds = await this.predictionService.getPredictions(symbol, interval, 'arima');
      const hwPreds = await this.predictionService.getPredictions(symbol, interval, 'holt_winters');

      // Check that accuracy tracking fields exist
      if (arimaPreds.length > 0) {
        const pred = arimaPreds[0];
        const hasAccuracyField = pred.hasOwnProperty('accuracy_score');
        
        this.logValidation(
          'ARIMA predictions have accuracy tracking field',
          hasAccuracyField,
          `Accuracy field present: ${hasAccuracyField}`
        );
        
        if (!hasAccuracyField) allPassed = false;
      }

      if (hwPreds.length > 0) {
        const pred = hwPreds[0];
        const hasAccuracyField = pred.hasOwnProperty('accuracy_score');
        
        this.logValidation(
          'Holt-Winters predictions have accuracy tracking field',
          hasAccuracyField,
          `Accuracy field present: ${hasAccuracyField}`
        );
        
        if (!hasAccuracyField) allPassed = false;
      }

      // Test that model_version is correctly set
      if (arimaPreds.length > 0) {
        // Check database directly for model_version
        const query = `
          SELECT model_version FROM predictions 
          WHERE symbol = ? AND interval = ? AND ai_provider = 'arima' 
          LIMIT 1
        `;
        
        const result = await new Promise((resolve, reject) => {
          this.predictionService.db.get(query, [symbol, interval], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });

        if (result) {
          const correctModelVersion = result.model_version === 'arima-statistical-model';
          this.logValidation(
            'ARIMA model version correctly set',
            correctModelVersion,
            `Model version: ${result.model_version}`
          );
          
          if (!correctModelVersion) allPassed = false;
        }
      }

    } catch (error) {
      this.logValidation(
        'Accuracy tracking compatibility',
        false,
        `Error: ${error.message}`
      );
      allPassed = false;
    }

    return allPassed;
  }

  /**
   * REQUIREMENT 5: Frontend display format identical
   */
  async validateFrontendDisplayFormat() {
    console.log('\n📋 REQUIREMENT 5: Frontend Display Format Identical');
    console.log('─'.repeat(60));

    const symbol = 'BTC';
    const interval = '1h';
    let allPassed = true;

    try {
      console.log('\n🔍 Testing frontend display format...');

      // Generate predictions
      await this.predictionService.generatePredictions(symbol, interval, 'arima', 3, 5);
      await this.predictionService.generatePredictions(symbol, interval, 'holt_winters', 3, 5);

      // Fetch predictions as frontend would
      const arimaPreds = await this.predictionService.getPredictions(symbol, interval, 'arima');
      const hwPreds = await this.predictionService.getPredictions(symbol, interval, 'holt_winters');

      // Validate prediction array format: [{timestamp: number, price: number}, ...]
      if (arimaPreds.length > 0) {
        const validFormat = arimaPreds.every(pred =>
          pred.hasOwnProperty('timestamp') &&
          pred.hasOwnProperty('predicted_price') &&
          typeof pred.timestamp === 'number' &&
          typeof pred.predicted_price === 'number'
        );

        this.logValidation(
          'ARIMA predictions have correct frontend format',
          validFormat,
          `Format: {timestamp: number, predicted_price: number}`
        );
        
        if (!validFormat) allPassed = false;

        // Test timestamp format (should be JavaScript timestamp)
        const validTimestamp = arimaPreds[0].timestamp > 1000000000000; // After year 2001
        this.logValidation(
          'ARIMA timestamps are valid JavaScript timestamps',
          validTimestamp,
          `Sample timestamp: ${arimaPreds[0].timestamp}`
        );
        
        if (!validTimestamp) allPassed = false;
      }

      if (hwPreds.length > 0) {
        const validFormat = hwPreds.every(pred =>
          pred.hasOwnProperty('timestamp') &&
          pred.hasOwnProperty('predicted_price') &&
          typeof pred.timestamp === 'number' &&
          typeof pred.predicted_price === 'number'
        );

        this.logValidation(
          'Holt-Winters predictions have correct frontend format',
          validFormat,
          `Format: {timestamp: number, predicted_price: number}`
        );
        
        if (!validFormat) allPassed = false;
      }

      // Test that predictions can be sorted (as frontend does)
      if (arimaPreds.length > 1) {
        try {
          const sorted = [...arimaPreds].sort((a, b) => a.timestamp - b.timestamp);
          this.logValidation(
            'ARIMA predictions are sortable by timestamp',
            true,
            'Predictions can be sorted for frontend display'
          );
        } catch (error) {
          this.logValidation(
            'ARIMA predictions are sortable by timestamp',
            false,
            `Sort error: ${error.message}`
          );
          allPassed = false;
        }
      }

    } catch (error) {
      this.logValidation(
        'Frontend display format validation',
        false,
        `Error: ${error.message}`
      );
      allPassed = false;
    }

    return allPassed;
  }

  /**
   * REQUIREMENT 6: Timestamp calculations correct for each interval
   */
  async validateTimestampCalculations() {
    console.log('\n📋 REQUIREMENT 6: Timestamp Calculations Correct');
    console.log('─'.repeat(60));

    const symbol = 'BTC';
    const intervals = ['1h', '4h', '1d'];
    const model = 'arima';
    let allPassed = true;

    const intervalMs = {
      '1h': 3600000,    // 1 hour in milliseconds
      '4h': 14400000,   // 4 hours in milliseconds
      '1d': 86400000    // 1 day in milliseconds
    };

    for (const interval of intervals) {
      try {
        console.log(`\n🔍 Testing timestamp calculations for ${interval}...`);

        const result = await this.predictionService.generatePredictions(symbol, interval, model, 3, 5);

        if (result.success && result.predictions.length >= 2) {
          const predictions = result.predictions;
          
          // Check that timestamps are correctly spaced
          const timeDiffs = [];
          for (let i = 1; i < predictions.length; i++) {
            const diff = predictions[i].timestamp - predictions[i-1].timestamp;
            timeDiffs.push(diff);
          }

          const expectedInterval = intervalMs[interval];
          const correctSpacing = timeDiffs.every(diff => diff === expectedInterval);

          this.logValidation(
            `${interval} timestamps correctly spaced`,
            correctSpacing,
            `Expected: ${expectedInterval}ms, Got: ${timeDiffs.join(', ')}ms`
          );
          
          if (!correctSpacing) allPassed = false;

          // Check that all timestamps are in the future
          const currentTime = Date.now();
          const allFuture = predictions.every(pred => pred.timestamp > currentTime);

          this.logValidation(
            `${interval} timestamps are in the future`,
            allFuture,
            `Current: ${currentTime}, First prediction: ${predictions[0].timestamp}`
          );
          
          if (!allFuture) allPassed = false;

        } else {
          this.logValidation(
            `${interval} timestamp calculation test setup`,
            false,
            'Failed to generate test predictions'
          );
          allPassed = false;
        }

      } catch (error) {
        this.logValidation(
          `${interval} timestamp calculations`,
          false,
          `Error: ${error.message}`
        );
        allPassed = false;
      }
    }

    return allPassed;
  }

  /**
   * REQUIREMENT 7: No changes needed to application style or frontend
   */
  async validateZeroFrontendChanges() {
    console.log('\n📋 REQUIREMENT 7: Zero Frontend Changes Required');
    console.log('─'.repeat(60));

    let allPassed = true;

    try {
      console.log('\n🔍 Validating frontend compatibility...');

      // Test that statistical models work with existing API endpoints
      const symbol = 'BTC';
      const interval = '1h';

      // Generate predictions with statistical models
      await this.predictionService.generatePredictions(symbol, interval, 'arima', 3, 5);
      await this.predictionService.generatePredictions(symbol, interval, 'holt_winters', 3, 5);

      // Test that getPredictions works with statistical providers
      const arimaPreds = await this.predictionService.getPredictions(symbol, interval, 'arima');
      const hwPreds = await this.predictionService.getPredictions(symbol, interval, 'holt_winters');

      // Validate that data structure is compatible with frontend expectations
      if (arimaPreds.length > 0) {
        const pred = arimaPreds[0];
        
        // Check for fields that frontend expects
        const frontendCompatibleFields = [
          'timestamp',
          'predicted_price',
          'actual_price'
        ];
        
        const hasCompatibleFields = frontendCompatibleFields.every(field => 
          pred.hasOwnProperty(field)
        );

        this.logValidation(
          'ARIMA data compatible with existing frontend',
          hasCompatibleFields,
          `Available fields: ${Object.keys(pred).join(', ')}`
        );
        
        if (!hasCompatibleFields) allPassed = false;
      }

      if (hwPreds.length > 0) {
        const pred = hwPreds[0];
        
        const frontendCompatibleFields = [
          'timestamp',
          'predicted_price',
          'actual_price'
        ];
        
        const hasCompatibleFields = frontendCompatibleFields.every(field => 
          pred.hasOwnProperty(field)
        );

        this.logValidation(
          'Holt-Winters data compatible with existing frontend',
          hasCompatibleFields,
          `Available fields: ${Object.keys(pred).join(', ')}`
        );
        
        if (!hasCompatibleFields) allPassed = false;
      }

      // Test that aiProvider parameter works correctly
      const arimaByProvider = await this.predictionService.getPredictions(symbol, interval, 'arima');
      const hwByProvider = await this.predictionService.getPredictions(symbol, interval, 'holt_winters');

      this.logValidation(
        'Statistical models work with aiProvider parameter',
        arimaByProvider.length > 0 && hwByProvider.length > 0,
        `ARIMA: ${arimaByProvider.length} predictions, HW: ${hwByProvider.length} predictions`
      );

      if (!(arimaByProvider.length > 0 && hwByProvider.length > 0)) allPassed = false;

    } catch (error) {
      this.logValidation(
        'Zero frontend changes validation',
        false,
        `Error: ${error.message}`
      );
      allPassed = false;
    }

    return allPassed;
  }

  /**
   * Run complete validation
   */
  async runCompleteValidation() {
    console.log('🔍 STATISTICAL MODELS INTEGRATION VALIDATION');
    console.log('=' .repeat(60));
    console.log('Validating all requirements from task specification');
    console.log('=' .repeat(60));

    try {
      const results = {
        requirement1: await this.validatePredictionCounts(),
        requirement2: await this.validateDatabaseStructure(),
        requirement3: await this.validateRollingPredictions(),
        requirement4: await this.validateAccuracyTracking(),
        requirement5: await this.validateFrontendDisplayFormat(),
        requirement6: await this.validateTimestampCalculations(),
        requirement7: await this.validateZeroFrontendChanges()
      };

      // Calculate overall results
      const totalRequirements = Object.keys(results).length;
      const passedRequirements = Object.values(results).filter(Boolean).length;
      const allRequirementsPassed = passedRequirements === totalRequirements;

      // Print summary
      console.log('\n' + '=' .repeat(60));
      console.log('📊 VALIDATION SUMMARY');
      console.log('=' .repeat(60));
      
      console.log('\n📋 REQUIREMENTS STATUS:');
      console.log(`   1. Exact 24 predictions per interval:     ${results.requirement1 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   2. Database structure matches AI:         ${results.requirement2 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   3. Rolling predictions work correctly:    ${results.requirement3 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   4. Accuracy tracking compatible:          ${results.requirement4 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   5. Frontend display format identical:     ${results.requirement5 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   6. Timestamp calculations correct:        ${results.requirement6 ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`   7. Zero frontend changes required:        ${results.requirement7 ? '✅ PASS' : '❌ FAIL'}`);

      console.log(`\n📈 Overall: ${passedRequirements}/${totalRequirements} requirements passed`);
      console.log(`🎯 Success Rate: ${((passedRequirements / totalRequirements) * 100).toFixed(1)}%`);

      if (allRequirementsPassed) {
        console.log('\n🎉 ALL REQUIREMENTS VALIDATED SUCCESSFULLY!');
        console.log('✅ ARIMA and Holt-Winters models work identically to AI providers');
        console.log('✅ No changes needed to existing application code');
        console.log('✅ Statistical models are ready for production use');
      } else {
        console.log('\n⚠️  Some requirements failed validation');
        console.log('❌ Please review failed requirements above');
        
        // Show failed validations
        const failedValidations = this.validationResults.filter(v => !v.passed);
        if (failedValidations.length > 0) {
          console.log('\n❌ FAILED VALIDATIONS:');
          failedValidations.forEach(validation => {
            console.log(`   • ${validation.requirement}: ${validation.details}`);
          });
        }
      }

      return allRequirementsPassed;

    } catch (error) {
      console.error('\n❌ Validation error:', error.message);
      console.error(error.stack);
      return false;
    } finally {
      this.predictionService.close();
    }
  }
}

// Run validation if script is executed directly
if (require.main === module) {
  const validator = new StatisticalIntegrationValidator();
  validator.runCompleteValidation()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = StatisticalIntegrationValidator;
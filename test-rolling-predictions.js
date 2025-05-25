const PredictionService = require('./services/predictionService');

/**
 * Test script for rolling predictions functionality
 */
async function testRollingPredictions() {
  const predictionService = new PredictionService();

  try {
    console.log('🧪 Testing Rolling Predictions Logic\n');

    const symbol = 'BTC';
    const interval = '1h';
    const aiProvider = 'gemini';

    // Test 1: Check gap detection
    console.log('📊 Test 1: Checking existing future predictions...');
    const existingCount = await predictionService.countFuturePredictions(symbol, interval, aiProvider);
    console.log(`Found ${existingCount} existing future predictions`);

    // Test 2: Get existing predictions for context
    console.log('\n📊 Test 2: Getting existing predictions for context...');
    const existingPredictions = await predictionService.getExistingFuturePredictions(symbol, interval, aiProvider);
    console.log(`Retrieved ${existingPredictions.length} existing predictions`);
    if (existingPredictions.length > 0) {
      console.log('First prediction:', {
        timestamp: new Date(existingPredictions[0].target_time).toISOString(),
        price: existingPredictions[0].predicted_price
      });
      console.log('Last prediction:', {
        timestamp: new Date(existingPredictions[existingPredictions.length - 1].target_time).toISOString(),
        price: existingPredictions[existingPredictions.length - 1].predicted_price
      });
    }

    // Test 3: Calculate next timestamp
    console.log('\n📊 Test 3: Calculating next timestamp...');
    const klineData = await predictionService.fetchKlineData(symbol, interval, 10);
    if (klineData && klineData.length > 0) {
      const nextTimestamp = predictionService.calculateNextTimestamp(interval, existingPredictions, klineData);
      console.log('Next prediction timestamp:', new Date(nextTimestamp).toISOString());
    }

    // Test 4: Test rolling predictions
    console.log('\n📊 Test 4: Testing rolling predictions generation...');
    const rollingResult = await predictionService.generateRollingPredictions(symbol, interval, aiProvider);
    console.log('Rolling predictions result:', {
      success: rollingResult.success,
      predictionsNeeded: rollingResult.predictionsNeeded,
      generated: rollingResult.generated,
      message: rollingResult.message || rollingResult.error
    });

    // Test 5: Verify total predictions after rolling
    console.log('\n📊 Test 5: Verifying total predictions after rolling...');
    const finalCount = await predictionService.countFuturePredictions(symbol, interval, aiProvider);
    console.log(`Final count of future predictions: ${finalCount}`);

    // Test 6: Test with different symbol/interval
    console.log('\n📊 Test 6: Testing with ETH 4h...');
    const ethResult = await predictionService.generateRollingPredictions('ETH', '4h', aiProvider);
    console.log('ETH rolling result:', {
      success: ethResult.success,
      predictionsNeeded: ethResult.predictionsNeeded,
      generated: ethResult.generated,
      message: ethResult.message || ethResult.error
    });

    console.log('\n✅ Rolling predictions tests completed');

  } catch (error) {
    console.error('❌ Error in rolling predictions test:', error.message);
    console.error(error.stack);
  } finally {
    predictionService.close();
  }
}

/**
 * Test predictions with manual count
 */
async function testCustomPredictionCount() {
  const predictionService = new PredictionService();

  try {
    console.log('\n🧪 Testing Custom Prediction Count\n');

    const symbol = 'BTC';
    const interval = '1h';
    const aiProvider = 'gemini';

    // Test generating only 5 predictions
    console.log('📊 Testing generation of 5 predictions...');
    const result = await predictionService.generatePredictions(symbol, interval, aiProvider, 3, 5);
    
    if (result.success) {
      console.log(`✅ Successfully generated ${result.predictions.length} predictions`);
      console.log('First prediction:', {
        timestamp: new Date(result.predictions[0].timestamp).toISOString(),
        price: result.predictions[0].price
      });
      console.log('Last prediction:', {
        timestamp: new Date(result.predictions[result.predictions.length - 1].timestamp).toISOString(),
        price: result.predictions[result.predictions.length - 1].price
      });
    } else {
      console.log('❌ Failed to generate custom predictions:', result.error);
    }

  } catch (error) {
    console.error('❌ Error in custom prediction count test:', error.message);
  } finally {
    predictionService.close();
  }
}

/**
 * Test edge cases
 */
async function testEdgeCases() {
  const predictionService = new PredictionService();

  try {
    console.log('\n🧪 Testing Edge Cases\n');

    // Test with no existing predictions
    console.log('📊 Test: No existing predictions scenario...');
    const newSymbol = 'ADA';  // Assuming this might not have predictions
    const result = await predictionService.generateRollingPredictions(newSymbol, '1h', 'gemini');
    console.log('New symbol result:', {
      success: result.success,
      predictionsNeeded: result.predictionsNeeded,
      generated: result.generated
    });

    // Test when already have 24 predictions
    console.log('\n📊 Test: Already have full predictions scenario...');
    // First ensure we have 24 predictions
    await predictionService.generatePredictions('BTC', '1h', 'gemini', 3, 24);
    
    // Then test rolling should return 0 needed
    const fullResult = await predictionService.generateRollingPredictions('BTC', '1h', 'gemini');
    console.log('Full predictions result:', {
      success: fullResult.success,
      predictionsNeeded: fullResult.predictionsNeeded,
      generated: fullResult.generated,
      message: fullResult.message
    });

  } catch (error) {
    console.error('❌ Error in edge cases test:', error.message);
  } finally {
    predictionService.close();
  }
}

// Run all tests
async function runAllTests() {
  console.log('🚀 Starting Rolling Predictions Test Suite\n');
  
  await testRollingPredictions();
  await testCustomPredictionCount();
  await testEdgeCases();
  
  console.log('\n🎉 All tests completed!');
}

// Run tests if script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testRollingPredictions,
  testCustomPredictionCount,
  testEdgeCases,
  runAllTests
};
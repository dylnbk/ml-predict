const PredictionService = require('./services/predictionService');

/**
 * Demo script showing rolling predictions in action
 */
async function demoRollingPredictions() {
  const predictionService = new PredictionService();
  
  try {
    console.log('🎯 Rolling Predictions Demo\n');
    
    const symbol = 'BTC';
    const interval = '1h';
    const aiProvider = 'gemini';
    
    console.log(`📊 Checking predictions for ${symbol} (${interval}) using ${aiProvider}...`);
    
    // Step 1: Check current state
    const currentCount = await predictionService.countFuturePredictions(symbol, interval, aiProvider);
    console.log(`Current future predictions: ${currentCount}/24`);
    
    // Step 2: Run rolling predictions
    console.log('\n🔄 Running rolling predictions...');
    const result = await predictionService.generateRollingPredictions(symbol, interval, aiProvider);
    
    if (result.success) {
      console.log(`✅ Success! Generated ${result.generated} new predictions`);
      console.log(`📈 Predictions needed: ${result.predictionsNeeded}`);
      
      if (result.generated > 0) {
        // Step 3: Verify the results
        const newCount = await predictionService.countFuturePredictions(symbol, interval, aiProvider);
        console.log(`📊 New total future predictions: ${newCount}/24`);
        
        // Get some sample predictions to show
        const predictions = await predictionService.getPredictions(symbol, interval, aiProvider);
        const futurePredictions = predictions.filter(p => p.timestamp > Date.now());
        
        if (futurePredictions.length > 0) {
          console.log('\n📋 Sample future predictions:');
          futurePredictions.slice(0, 3).forEach((pred, index) => {
            console.log(`  ${index + 1}. ${new Date(pred.timestamp).toISOString()} - $${pred.predicted_price}`);
          });
          
          if (futurePredictions.length > 3) {
            console.log(`  ... and ${futurePredictions.length - 3} more`);
          }
        }
      }
    } else {
      console.log(`❌ Failed: ${result.error}`);
    }
    
    // Step 4: Demo running it again (should show no new predictions needed)
    console.log('\n🔄 Running rolling predictions again (should show no new predictions needed)...');
    const secondResult = await predictionService.generateRollingPredictions(symbol, interval, aiProvider);
    
    if (secondResult.success) {
      console.log(`✅ ${secondResult.message}`);
      console.log(`📈 Predictions needed: ${secondResult.predictionsNeeded}`);
      console.log(`📊 Generated: ${secondResult.generated}`);
    }
    
  } catch (error) {
    console.error('❌ Demo error:', error.message);
  } finally {
    predictionService.close();
    console.log('\n🎯 Demo completed');
  }
}

/**
 * Demo showing rolling predictions for multiple symbols
 */
async function demoMultipleSymbols() {
  const predictionService = new PredictionService();
  
  try {
    console.log('\n🎯 Multi-Symbol Rolling Predictions Demo\n');
    
    const symbols = ['BTC', 'ETH', 'ADA'];
    const interval = '4h';
    const aiProvider = 'gemini';
    
    for (const symbol of symbols) {
      console.log(`\n📊 Processing ${symbol}...`);
      
      const result = await predictionService.generateRollingPredictions(symbol, interval, aiProvider);
      
      if (result.success) {
        console.log(`  ✅ ${symbol}: Generated ${result.generated} predictions (${result.predictionsNeeded} needed)`);
      } else {
        console.log(`  ❌ ${symbol}: ${result.error}`);
      }
      
      // Small delay between symbols to avoid hitting API limits
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
  } catch (error) {
    console.error('❌ Multi-symbol demo error:', error.message);
  } finally {
    predictionService.close();
    console.log('\n🎯 Multi-symbol demo completed');
  }
}

// Main execution
if (require.main === module) {
  (async () => {
    await demoRollingPredictions();
    await demoMultipleSymbols();
  })().catch(console.error);
}

module.exports = {
  demoRollingPredictions,
  demoMultipleSymbols
};
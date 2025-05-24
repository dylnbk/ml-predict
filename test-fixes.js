require('dotenv').config();
const PredictionService = require('./services/predictionService');

async function testFixes() {
  const predictionService = new PredictionService();
  
  console.log('🧪 Testing prediction system fixes...\n');
  
  // Test 1: Generate predictions with all 3 providers
  console.log('📊 Test 1: Generating predictions with all 3 AI providers...');
  
  const providers = ['gemini', 'gpt', 'claude'];
  const symbol = 'BTC';
  const interval = '1h';
  
  for (const provider of providers) {
    console.log(`\n🤖 Testing ${provider.toUpperCase()}...`);
    
    try {
      const result = await predictionService.generatePredictions(symbol, interval, provider);
      
      if (result.success) {
        console.log(`✅ ${provider}: Successfully generated ${result.predictions.length} predictions`);
      } else {
        console.log(`❌ ${provider}: Failed - ${result.error}`);
      }
    } catch (error) {
      console.log(`❌ ${provider}: Error - ${error.message}`);
    }
  }
  
  // Test 2: Verify all predictions are stored separately
  console.log('\n\n📊 Test 2: Verifying predictions are stored separately by provider...');
  
  // Wait a moment for database writes to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Get predictions for each provider
  for (const provider of providers) {
    try {
      const predictions = await predictionService.getPredictions(symbol, interval, provider);
      console.log(`\n${provider.toUpperCase()}: ${predictions.length} predictions retrieved`);
      
      if (predictions.length > 0) {
        // Show first 3 timestamps
        const timestamps = predictions.slice(0, 3).map(p => 
          new Date(p.timestamp).toLocaleString()
        );
        console.log(`  Sample timestamps: ${timestamps.join(', ')}`);
      }
    } catch (error) {
      console.log(`Error retrieving ${provider} predictions:`, error.message);
    }
  }
  
  // Test 3: Check database for unique constraint
  console.log('\n\n📊 Test 3: Checking database structure...');
  
  const db = predictionService.db;
  
  await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        symbol,
        interval,
        ai_provider,
        COUNT(*) as total_predictions,
        COUNT(DISTINCT target_time) as unique_timestamps,
        MIN(datetime(target_time/1000, 'unixepoch')) as earliest_prediction,
        MAX(datetime(target_time/1000, 'unixepoch')) as latest_prediction
      FROM predictions
      WHERE symbol = ? 
        AND interval = ?
        AND prediction_time > ?
      GROUP BY symbol, interval, ai_provider
      ORDER BY ai_provider
    `, [symbol, interval, Date.now() - 3600000], (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        reject(err);
      } else {
        console.log('\nRecent predictions by provider:');
        rows.forEach(row => {
          console.log(`\n${row.ai_provider.toUpperCase()}:`);
          console.log(`  Total predictions: ${row.total_predictions}`);
          console.log(`  Unique timestamps: ${row.unique_timestamps}`);
          console.log(`  Time range: ${row.earliest_prediction} to ${row.latest_prediction}`);
        });
        resolve();
      }
    });
  });
  
  // Test 4: Test Gemini retry logic
  console.log('\n\n📊 Test 4: Testing Gemini retry logic...');
  console.log('(This will intentionally trigger retries to test error handling)');
  
  // Temporarily break the prompt to test retry logic
  const originalFormatPrompt = require('./utils/predictionPrompt').formatPredictionPrompt;
  require('./utils/predictionPrompt').formatPredictionPrompt = () => 'Generate invalid response without JSON';
  
  try {
    const result = await predictionService.generatePredictions(symbol, interval, 'gemini');
    if (!result.success) {
      console.log(`✅ Retry logic working: ${result.error}`);
    }
  } catch (error) {
    console.log(`✅ Error handling working: ${error.message}`);
  }
  
  // Restore original function
  require('./utils/predictionPrompt').formatPredictionPrompt = originalFormatPrompt;
  
  console.log('\n\n✅ All tests completed!');
  process.exit(0);
}

// Run tests
testFixes().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
require('dotenv').config();
const fetch = require('node-fetch');

async function testAPIPredictions() {
  console.log('🧪 Testing API prediction endpoints...\n');
  
  const baseUrl = 'http://localhost:3000';
  const symbol = 'BTC';
  const interval = '1h';
  const providers = ['gemini', 'gpt', 'claude'];
  
  for (const provider of providers) {
    console.log(`\n📊 Testing ${symbol} ${interval} predictions for ${provider}:`);
    
    try {
      const response = await fetch(`${baseUrl}/api/predictions/${symbol}/${interval}?provider=${provider}`);
      
      if (!response.ok) {
        console.log(`  ❌ API returned error: ${response.status} ${response.statusText}`);
        const error = await response.json();
        console.log(`  Error details:`, error);
        continue;
      }
      
      const predictions = await response.json();
      console.log(`  Total predictions returned: ${predictions.length}`);
      
      if (predictions.length > 0) {
        // Check for duplicates
        const timestamps = predictions.map(p => p.timestamp);
        const uniqueTimestamps = new Set(timestamps);
        console.log(`  Unique timestamps: ${uniqueTimestamps.size}`);
        
        if (timestamps.length === uniqueTimestamps.size) {
          console.log(`  ✅ No duplicate timestamps!`);
        } else {
          console.log(`  ⚠️ WARNING: Duplicate timestamps detected!`);
          
          // Find duplicates
          const seen = {};
          const duplicates = [];
          timestamps.forEach(ts => {
            if (seen[ts]) {
              duplicates.push(new Date(ts).toLocaleString());
            }
            seen[ts] = true;
          });
          console.log(`  Duplicate timestamps:`, duplicates.slice(0, 5));
        }
        
        // Show first and last prediction
        const firstPred = predictions[0];
        const lastPred = predictions[predictions.length - 1];
        
        console.log(`  First prediction: ${new Date(firstPred.timestamp).toLocaleString()} - $${firstPred.predicted_price.toFixed(2)}`);
        console.log(`  Last prediction: ${new Date(lastPred.timestamp).toLocaleString()} - $${lastPred.predicted_price.toFixed(2)}`);
        
        // Check time span
        const timeSpanHours = (lastPred.timestamp - firstPred.timestamp) / (1000 * 60 * 60);
        console.log(`  Time span: ${timeSpanHours.toFixed(1)} hours`);
        
        // Count future predictions
        const now = Date.now();
        const futurePredictions = predictions.filter(p => p.timestamp > now);
        console.log(`  Future predictions: ${futurePredictions.length}`);
        
        if (futurePredictions.length >= 24) {
          console.log(`  ✅ All 24 future predictions present`);
        } else if (futurePredictions.length >= 20) {
          console.log(`  ⚠️ Only ${futurePredictions.length} future predictions (expected 24)`);
        } else {
          console.log(`  ❌ Only ${futurePredictions.length} future predictions (expected 24)`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Error calling API:`, error.message);
    }
  }
  
  console.log('\n\n✅ API prediction test complete!');
}

// Run test
testAPIPredictions().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
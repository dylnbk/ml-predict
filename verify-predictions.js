require('dotenv').config();
const PredictionService = require('./services/predictionService');
const sqlite3 = require('sqlite3').verbose();

async function verifyPredictions() {
  const db = new sqlite3.Database('./crypto_data.db');
  const predictionService = new PredictionService();
  
  console.log('🔍 Verifying predictions in the database...\n');
  
  // Check current predictions count
  await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        symbol,
        interval,
        ai_provider,
        COUNT(*) as count,
        COUNT(DISTINCT target_time) as unique_timestamps,
        MIN(datetime(target_time/1000, 'unixepoch')) as earliest,
        MAX(datetime(target_time/1000, 'unixepoch')) as latest,
        MAX(prediction_time) as last_generated
      FROM predictions
      WHERE target_time > ?
      GROUP BY symbol, interval, ai_provider
      ORDER BY symbol, interval, ai_provider
    `, [Date.now()], async (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        reject(err);
        return;
      }
      
      console.log('📊 Current future predictions by provider:\n');
      
      const missingPredictions = [];
      const symbols = ['BTC', 'ETH', 'XRP', 'SOL'];
      const intervals = ['1h', '4h', '1d'];
      const providers = ['gemini', 'gpt', 'claude'];
      
      // Create a map of existing predictions
      const existingMap = {};
      rows.forEach(row => {
        const key = `${row.symbol}-${row.interval}-${row.ai_provider}`;
        existingMap[key] = row;
      });
      
      // Check for missing combinations
      for (const symbol of symbols) {
        for (const interval of intervals) {
          for (const provider of providers) {
            const key = `${symbol}-${interval}-${provider}`;
            const existing = existingMap[key];
            
            if (!existing || existing.count < 20) {
              missingPredictions.push({ symbol, interval, provider });
              console.log(`❌ ${symbol} ${interval} (${provider}): ${existing ? existing.count : 0} predictions - NEEDS GENERATION`);
            } else {
              const lastGenerated = new Date(existing.last_generated);
              const hoursAgo = (Date.now() - lastGenerated) / (1000 * 60 * 60);
              console.log(`✅ ${symbol} ${interval} (${provider}): ${existing.count} predictions (generated ${hoursAgo.toFixed(1)}h ago)`);
            }
          }
        }
      }
      
      // Generate missing predictions
      if (missingPredictions.length > 0) {
        console.log(`\n🔧 Found ${missingPredictions.length} missing prediction sets. Generating...\n`);
        
        for (const { symbol, interval, provider } of missingPredictions) {
          console.log(`\n🔮 Generating ${symbol} ${interval} predictions with ${provider}...`);
          
          try {
            // Use the service with retry logic (max 5 retries for missing predictions)
            const result = await predictionService.generatePredictions(symbol, interval, provider, 5);
            
            if (result.success) {
              console.log(`✅ Successfully generated ${result.predictions.length} predictions`);
            } else {
              console.log(`❌ Failed after retries: ${result.error}`);
            }
          } catch (error) {
            console.log(`❌ Error: ${error.message}`);
          }
          
          // Delay between generations
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      resolve();
    });
  });
  
  // Check predictions with actual prices
  console.log('\n\n📊 Checking predictions with actual prices:\n');
  
  await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        symbol,
        interval,
        ai_provider,
        COUNT(*) as total_predictions,
        COUNT(actual_price) as predictions_with_actual,
        AVG(CASE WHEN actual_price IS NOT NULL THEN accuracy_score END) as avg_accuracy,
        MIN(CASE WHEN actual_price IS NOT NULL THEN accuracy_score END) as min_accuracy,
        MAX(CASE WHEN actual_price IS NOT NULL THEN accuracy_score END) as max_accuracy
      FROM predictions
      WHERE prediction_time > ?
      GROUP BY symbol, interval, ai_provider
      HAVING predictions_with_actual > 0
      ORDER BY symbol, interval, ai_provider
    `, [Date.now() - 7 * 24 * 60 * 60 * 1000], (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        reject(err);
        return;
      }
      
      rows.forEach(row => {
        console.log(`${row.symbol} ${row.interval} (${row.ai_provider}):`);
        console.log(`  Total predictions: ${row.total_predictions}`);
        console.log(`  With actual prices: ${row.predictions_with_actual}`);
        if (row.avg_accuracy) {
          console.log(`  Average accuracy: ${row.avg_accuracy.toFixed(2)}%`);
          console.log(`  Accuracy range: ${row.min_accuracy.toFixed(2)}% - ${row.max_accuracy.toFixed(2)}%`);
        }
        console.log('');
      });
      
      resolve();
    });
  });
  
  db.close();
  console.log('\n✅ Verification complete!');
}

// Run verification
verifyPredictions().catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});
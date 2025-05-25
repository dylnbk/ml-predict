const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'crypto_data.db');
const db = new sqlite3.Database(dbPath);

async function checkDataIntegrity() {
  console.log('🔍 Checking data integrity for historical predictions...\n');

  // 1. Check for duplicate predictions (same unique key)
  console.log('1. Checking for duplicate predictions with same unique key...');
  const duplicateQuery = `
    SELECT symbol, interval, prediction_time, target_time, ai_provider, COUNT(*) as count
    FROM predictions
    GROUP BY symbol, interval, prediction_time, target_time, ai_provider
    HAVING COUNT(*) > 1
  `;
  
  db.all(duplicateQuery, [], (err, rows) => {
    if (err) {
      console.error('Error checking duplicates:', err);
      return;
    }
    
    if (rows.length > 0) {
      console.log('❌ Found duplicate predictions:');
      rows.forEach(row => {
        console.log(`   - ${row.symbol} ${row.interval}: ${row.count} duplicates`);
      });
    } else {
      console.log('✅ No duplicate predictions found\n');
    }
  });

  // 2. Check if created_at timestamps have been modified
  console.log('2. Checking for modified created_at timestamps...');
  const modifiedTimestampQuery = `
    SELECT id, symbol, interval, created_at, 
           datetime(created_at) as created_datetime,
           prediction_time,
           datetime(prediction_time/1000, 'unixepoch') as prediction_datetime
    FROM predictions
    WHERE datetime(created_at) > datetime(prediction_time/1000, 'unixepoch', '+5 minutes')
    LIMIT 10
  `;
  
  db.all(modifiedTimestampQuery, [], (err, rows) => {
    if (err) {
      console.error('Error checking timestamps:', err);
      return;
    }
    
    if (rows.length > 0) {
      console.log('⚠️  Found predictions with suspicious timestamps:');
      rows.forEach(row => {
        console.log(`   - ID ${row.id}: ${row.symbol} ${row.interval}`);
        console.log(`     Created: ${row.created_datetime}`);
        console.log(`     Prediction: ${row.prediction_datetime}`);
      });
    } else {
      console.log('✅ All created_at timestamps look normal\n');
    }
  });

  // 3. Check for predictions that have been updated multiple times
  console.log('3. Analyzing prediction update patterns...');
  const updatePatternQuery = `
    SELECT 
      symbol, 
      interval,
      ai_provider,
      COUNT(*) as total_predictions,
      COUNT(actual_price) as predictions_with_actual,
      COUNT(CASE WHEN actual_price IS NOT NULL AND predicted_price = actual_price THEN 1 END) as exact_matches,
      AVG(CASE WHEN actual_price IS NOT NULL THEN ABS(predicted_price - actual_price) / actual_price * 100 END) as avg_error_pct
    FROM predictions
    WHERE created_at > datetime('now', '-7 days')
    GROUP BY symbol, interval, ai_provider
    ORDER BY symbol, interval, ai_provider
  `;
  
  db.all(updatePatternQuery, [], (err, rows) => {
    if (err) {
      console.error('Error checking update patterns:', err);
      return;
    }
    
    console.log('\nPrediction statistics (last 7 days):');
    rows.forEach(row => {
      console.log(`\n${row.symbol} ${row.interval} (${row.ai_provider}):`);
      console.log(`   Total predictions: ${row.total_predictions}`);
      console.log(`   With actual prices: ${row.predictions_with_actual}`);
      console.log(`   Exact matches: ${row.exact_matches}`);
      console.log(`   Average error: ${row.avg_error_pct ? row.avg_error_pct.toFixed(2) : 'N/A'}%`);
    });
  });

  // 4. Check for any predictions where predicted_price has changed
  console.log('\n4. Checking if any predicted_price values have been modified...');
  
  // First, let's see a sample of predictions
  const sampleQuery = `
    SELECT 
      id,
      symbol,
      interval,
      prediction_time,
      target_time,
      predicted_price,
      actual_price,
      created_at,
      ai_provider
    FROM predictions
    WHERE actual_price IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5
  `;
  
  db.all(sampleQuery, [], (err, rows) => {
    if (err) {
      console.error('Error getting sample predictions:', err);
      return;
    }
    
    console.log('\nSample of recent predictions with actual prices:');
    rows.forEach(row => {
      console.log(`\nID: ${row.id}`);
      console.log(`   ${row.symbol} ${row.interval} (${row.ai_provider})`);
      console.log(`   Predicted: $${row.predicted_price.toFixed(2)}`);
      console.log(`   Actual: $${row.actual_price.toFixed(2)}`);
      console.log(`   Created: ${row.created_at}`);
    });
  });

  // 5. Test INSERT OR REPLACE behavior
  console.log('\n5. Testing INSERT OR REPLACE behavior...');
  
  // Get a recent prediction to test with
  const testQuery = `
    SELECT * FROM predictions 
    WHERE actual_price IS NULL 
    ORDER BY created_at DESC 
    LIMIT 1
  `;
  
  db.get(testQuery, [], (err, row) => {
    if (err || !row) {
      console.log('Could not find a test prediction');
      return;
    }
    
    console.log(`\nTest prediction found:`);
    console.log(`   ID: ${row.id}`);
    console.log(`   ${row.symbol} ${row.interval} (${row.ai_provider})`);
    console.log(`   Predicted price: $${row.predicted_price}`);
    console.log(`   Created at: ${row.created_at}`);
    
    // Simulate what would happen with INSERT OR REPLACE
    console.log(`\n⚠️  WARNING: INSERT OR REPLACE with the same unique key would:`);
    console.log(`   1. DELETE the existing row (ID: ${row.id})`);
    console.log(`   2. INSERT a new row with a new ID and new created_at timestamp`);
    console.log(`   3. This would LOSE the original prediction data and timestamp!`);
    
    db.close();
  });
}

// Run the integrity check
checkDataIntegrity();
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();

async function debugPredictions() {
  const db = new sqlite3.Database('./crypto_data.db');
  
  console.log('🔍 Debugging prediction duplicates...\n');
  
  // Check for duplicate target_times
  await new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        symbol,
        interval,
        ai_provider,
        target_time,
        COUNT(*) as count,
        GROUP_CONCAT(prediction_time) as prediction_times,
        GROUP_CONCAT(predicted_price) as prices
      FROM predictions
      WHERE symbol = 'BTC'
        AND interval = '1h'
        AND ai_provider = 'gemini'
        AND target_time > ?
      GROUP BY symbol, interval, ai_provider, target_time
      HAVING count > 1
      ORDER BY target_time
      LIMIT 10
    `, [Date.now()], (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        reject(err);
        return;
      }
      
      console.log(`Found ${rows.length} duplicate target_times for BTC 1h gemini:\n`);
      
      rows.forEach(row => {
        const targetDate = new Date(row.target_time).toLocaleString();
        const predTimes = row.prediction_times.split(',').map(t => new Date(parseInt(t)).toLocaleString());
        const prices = row.prices.split(',');
        
        console.log(`Target time: ${targetDate}`);
        console.log(`  Count: ${row.count} predictions`);
        console.log(`  Prediction times: ${predTimes.join(' | ')}`);
        console.log(`  Prices: ${prices.join(' | ')}`);
        console.log('');
      });
      
      resolve();
    });
  });
  
  // Test the fixed query
  console.log('\n📊 Testing fixed query for BTC 1h gemini:\n');
  
  const currentTime = Date.now();
  await new Promise((resolve, reject) => {
    db.all(`
      SELECT
        p1.target_time as timestamp,
        p1.predicted_price,
        p1.actual_price,
        p1.prediction_time
      FROM predictions p1
      INNER JOIN (
        SELECT 
          target_time,
          MAX(prediction_time) as max_prediction_time
        FROM predictions
        WHERE symbol = 'BTC'
          AND interval = '1h'
          AND ai_provider = 'gemini'
          AND (target_time > ? OR (target_time > ? - 86400000 AND actual_price IS NOT NULL))
        GROUP BY target_time
      ) p2 ON p1.target_time = p2.target_time 
          AND p1.prediction_time = p2.max_prediction_time
      WHERE p1.symbol = 'BTC'
        AND p1.interval = '1h'
        AND p1.ai_provider = 'gemini'
      ORDER BY p1.target_time ASC
      LIMIT 50
    `, [currentTime, currentTime], (err, rows) => {
      if (err) {
        console.error('Query error:', err);
        reject(err);
        return;
      }
      
      console.log(`Query returned ${rows.length} rows`);
      
      // Check for duplicates
      const timestamps = rows.map(r => r.timestamp);
      const uniqueTimestamps = new Set(timestamps);
      console.log(`Unique timestamps: ${uniqueTimestamps.size}`);
      
      if (timestamps.length === uniqueTimestamps.size) {
        console.log('✅ No duplicates in query result!');
      } else {
        console.log('❌ Still have duplicates in query result');
        
        // Find duplicates
        const seen = {};
        timestamps.forEach((ts, idx) => {
          if (seen[ts] !== undefined) {
            console.log(`  Duplicate at index ${idx}: ${new Date(ts).toLocaleString()}`);
          } else {
            seen[ts] = idx;
          }
        });
      }
      
      resolve();
    });
  });
  
  db.close();
  console.log('\n✅ Debug complete!');
}

// Run debug
debugPredictions().catch(error => {
  console.error('Debug failed:', error);
  process.exit(1);
});
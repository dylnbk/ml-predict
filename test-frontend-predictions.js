require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();

async function testFrontendPredictions() {
  const db = new sqlite3.Database('./crypto_data.db');
  
  console.log('🧪 Testing frontend prediction display...\n');
  
  // Test case: Check BTC 1h predictions for each provider
  const symbol = 'BTC';
  const interval = '1h';
  const providers = ['gemini', 'gpt', 'claude'];
  
  for (const provider of providers) {
    console.log(`\n📊 Checking ${symbol} ${interval} predictions for ${provider}:`);
    
    await new Promise((resolve, reject) => {
      // This query mimics what the frontend receives
      db.all(`
        SELECT
          target_time as timestamp,
          predicted_price,
          actual_price
        FROM predictions
        WHERE symbol = ?
          AND interval = ?
          AND ai_provider = ?
          AND target_time > ?
        ORDER BY target_time ASC
        LIMIT 50
      `, [symbol, interval, provider, Date.now()], (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          reject(err);
          return;
        }
        
        console.log(`  Total future predictions: ${rows.length}`);
        
        if (rows.length > 0) {
          // Check for duplicates
          const timestamps = rows.map(r => r.timestamp);
          const uniqueTimestamps = new Set(timestamps);
          console.log(`  Unique timestamps: ${uniqueTimestamps.size}`);
          
          if (timestamps.length !== uniqueTimestamps.size) {
            console.log(`  ⚠️ WARNING: Duplicate timestamps detected!`);
          }
          
          // Show first and last prediction
          const firstPred = rows[0];
          const lastPred = rows[rows.length - 1];
          
          console.log(`  First prediction: ${new Date(firstPred.timestamp).toLocaleString()} - $${firstPred.predicted_price.toFixed(2)}`);
          console.log(`  Last prediction: ${new Date(lastPred.timestamp).toLocaleString()} - $${lastPred.predicted_price.toFixed(2)}`);
          
          // Check time span
          const timeSpanHours = (lastPred.timestamp - firstPred.timestamp) / (1000 * 60 * 60);
          console.log(`  Time span: ${timeSpanHours.toFixed(1)} hours`);
          
          if (rows.length >= 24) {
            console.log(`  ✅ All 24 predictions present`);
          } else {
            console.log(`  ⚠️ Only ${rows.length} predictions (expected 24)`);
          }
        }
        
        resolve();
      });
    });
  }
  
  // Check combined view (what happens when frontend doesn't filter properly)
  console.log('\n\n📊 Checking combined view (all providers):');
  
  await new Promise((resolve, reject) => {
    db.all(`
      SELECT
        target_time as timestamp,
        predicted_price,
        actual_price,
        ai_provider
      FROM predictions
      WHERE symbol = ?
        AND interval = ?
        AND target_time > ?
      ORDER BY target_time ASC, ai_provider ASC
      LIMIT 150
    `, [symbol, interval, Date.now()], (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        reject(err);
        return;
      }
      
      console.log(`  Total predictions (all providers): ${rows.length}`);
      
      // Group by timestamp
      const byTimestamp = {};
      rows.forEach(row => {
        if (!byTimestamp[row.timestamp]) {
          byTimestamp[row.timestamp] = [];
        }
        byTimestamp[row.timestamp].push(row.ai_provider);
      });
      
      const timestamps = Object.keys(byTimestamp);
      console.log(`  Unique timestamps: ${timestamps.length}`);
      
      // Check first few timestamps
      console.log('\n  First 5 timestamps with providers:');
      timestamps.slice(0, 5).forEach(ts => {
        const providers = byTimestamp[ts];
        console.log(`    ${new Date(parseInt(ts)).toLocaleString()}: ${providers.join(', ')}`);
      });
      
      resolve();
    });
  });
  
  db.close();
  console.log('\n\n✅ Frontend prediction test complete!');
}

// Run test
testFrontendPredictions().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
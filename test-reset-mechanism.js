const PredictionService = require('./services/predictionService');
const sqlite3 = require('sqlite3').verbose();

async function testResetMechanism() {
  console.log('🧪 Testing Prediction Reset Mechanism...\n');
  
  const predictionService = new PredictionService();
  const db = new sqlite3.Database('./crypto_data.db');
  
  // Ensure prediction_resets table exists
  await new Promise((resolve, reject) => {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS prediction_resets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          interval TEXT NOT NULL,
          ai_provider TEXT NOT NULL,
          reset_time INTEGER NOT NULL,
          reason TEXT NOT NULL,
          threshold_percentage REAL NOT NULL,
          actual_deviation REAL NOT NULL,
          predicted_price REAL NOT NULL,
          actual_price REAL NOT NULL,
          target_time INTEGER NOT NULL,
          predictions_cleared INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_prediction_resets_lookup
      ON prediction_resets(symbol, interval, ai_provider, reset_time DESC);
    `;
    
    db.exec(createTableSQL, (err) => {
      if (err) {
        console.error('Failed to create reset table:', err);
        reject(err);
      } else {
        console.log('✅ Ensured prediction_resets table exists');
        resolve();
      }
    });
  });
  
  const testSymbol = 'BTC';
  const testInterval = '1h';
  const testProvider = 'gemini';
  
  try {
    // Test 1: Check initial reset condition
    console.log('1️⃣ Testing reset condition check...');
    const initialResetCheck = await predictionService.checkResetCondition(testSymbol, testInterval, testProvider);
    console.log('Initial reset check:', initialResetCheck);
    
    // Test 2: Clear existing predictions and create a mock prediction that would trigger reset
    console.log('\n2️⃣ Clearing existing predictions and creating mock prediction with large deviation...');
    
    // First clear existing predictions for this test
    await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM predictions
        WHERE symbol = ? AND interval = ? AND ai_provider = ?
      `, [testSymbol, testInterval, testProvider], function(err) {
        if (err) reject(err);
        else {
          console.log(`✅ Cleared ${this.changes} existing predictions for clean test`);
          resolve();
        }
      });
    });
    
    const currentTime = Date.now();
    const targetTime = currentTime - 3600000; // 1 hour ago
    const predictedPrice = 50000;
    const actualPrice = 40000; // 20% lower than predicted (20% deviation)
    
    await new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO predictions
        (symbol, interval, prediction_time, target_time, predicted_price, actual_price, accuracy_score, ai_provider)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        testSymbol,
        testInterval,
        currentTime - 7200000, // 2 hours ago prediction time
        targetTime,
        predictedPrice,
        actualPrice,
        0, // Low accuracy score
        testProvider,
        function(err) {
          if (err) reject(err);
          else {
            const deviation = Math.abs((predictedPrice - actualPrice) / actualPrice) * 100;
            console.log(`✅ Created mock prediction: predicted ${predictedPrice}, actual ${actualPrice}`);
            console.log(`   Expected deviation: ${deviation.toFixed(2)}% (should exceed 20%)`);
            resolve();
          }
        }
      );
      stmt.finalize();
    });
    
    // Test 3: Check reset condition after mock data
    console.log('\n3️⃣ Testing reset condition with large deviation...');
    const resetCheck = await predictionService.checkResetCondition(testSymbol, testInterval, testProvider);
    console.log('Reset check result:', resetCheck);
    
    if (!resetCheck.needsReset) {
      console.log('❌ Expected reset to be needed, but it was not detected');
      return;
    }
    
    // Test 4: Create some future predictions to be cleared
    console.log('\n4️⃣ Creating mock future predictions...');
    const futureTimestamps = [];
    for (let i = 1; i <= 5; i++) {
      futureTimestamps.push(currentTime + (i * 3600000)); // 1, 2, 3, 4, 5 hours from now
    }
    
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO predictions
      (symbol, interval, prediction_time, target_time, predicted_price, ai_provider)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const timestamp of futureTimestamps) {
      await new Promise((resolve, reject) => {
        stmt.run(
          testSymbol,
          testInterval,
          currentTime,
          timestamp,
          Math.random() * 10000 + 45000, // Random price around 45k-55k
          testProvider,
          function(err) {
            if (err && !err.message.includes('UNIQUE constraint')) reject(err);
            else resolve();
          }
        );
      });
    }
    stmt.finalize();
    console.log(`✅ Created ${futureTimestamps.length} mock future predictions`);
    
    // Test 5: Count future predictions before reset
    console.log('\n5️⃣ Counting future predictions before reset...');
    const beforeCount = await predictionService.countFuturePredictions(testSymbol, testInterval, testProvider);
    console.log(`Future predictions before reset: ${beforeCount}`);
    
    // Test 6: Execute reset
    console.log('\n6️⃣ Executing reset...');
    const resetResult = await predictionService.executeReset(testSymbol, testInterval, testProvider, resetCheck);
    console.log('Reset execution result:', resetResult);
    
    // Test 7: Count future predictions after reset
    console.log('\n7️⃣ Counting future predictions after reset...');
    const afterCount = await predictionService.countFuturePredictions(testSymbol, testInterval, testProvider);
    console.log(`Future predictions after reset: ${afterCount}`);
    
    if (afterCount !== 0) {
      console.log('❌ Expected 0 future predictions after reset');
      return;
    }
    
    // Test 8: Check reset history
    console.log('\n8️⃣ Testing reset history retrieval...');
    const resetHistory = await predictionService.getResetHistory(testSymbol, testInterval, testProvider);
    console.log('Reset history:', resetHistory);
    
    if (resetHistory.length === 0) {
      console.log('❌ Expected reset history to contain entries');
      return;
    }
    
    // Test 9: Test rolling predictions with reset
    console.log('\n9️⃣ Testing rolling predictions with reset mechanism...');
    const rollingResult = await predictionService.generateRollingPredictionsWithReset(testSymbol, testInterval, testProvider);
    console.log('Rolling predictions result:', rollingResult);
    
    // Test 10: Verify no reset needed after fresh predictions
    console.log('\n🔟 Verifying reset not needed after fresh predictions...');
    const finalResetCheck = await predictionService.checkResetCondition(testSymbol, testInterval, testProvider);
    console.log('Final reset check:', finalResetCheck);
    
    // Cleanup: Remove test data
    console.log('\n🧹 Cleaning up test data...');
    await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM predictions 
        WHERE symbol = ? AND interval = ? AND ai_provider = ?
      `, [testSymbol, testInterval, testProvider], function(err) {
        if (err) reject(err);
        else {
          console.log(`✅ Cleaned up ${this.changes} test predictions`);
          resolve();
        }
      });
    });
    
    await new Promise((resolve, reject) => {
      db.run(`
        DELETE FROM prediction_resets 
        WHERE symbol = ? AND interval = ? AND ai_provider = ?
      `, [testSymbol, testInterval, testProvider], function(err) {
        if (err) reject(err);
        else {
          console.log(`✅ Cleaned up ${this.changes} test resets`);
          resolve();
        }
      });
    });
    
    console.log('\n🎉 All reset mechanism tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    predictionService.close();
    db.close();
  }
}

// Test API endpoints
async function testResetAPI() {
  console.log('\n🌐 Testing Reset API Endpoints...\n');
  
  const baseUrl = 'http://localhost:3000/api';
  
  try {
    // Test reset history endpoint
    console.log('Testing GET /api/predictions/resets/BTC/1h');
    const resetHistoryResponse = await fetch(`${baseUrl}/predictions/resets/BTC/1h?aiProvider=gemini`);
    const resetHistoryData = await resetHistoryResponse.json();
    console.log('Reset history response:', resetHistoryData);
    
    // Test reset check endpoint
    console.log('\nTesting GET /api/predictions/reset-check/BTC/1h/gemini');
    const resetCheckResponse = await fetch(`${baseUrl}/predictions/reset-check/BTC/1h/gemini`);
    const resetCheckData = await resetCheckResponse.json();
    console.log('Reset check response:', resetCheckData);
    
    console.log('\n✅ API endpoint tests completed');
    
  } catch (error) {
    console.error('❌ API test failed:', error);
    console.log('Make sure the server is running: npm start');
  }
}

// Run tests
if (require.main === module) {
  testResetMechanism().then(() => {
    console.log('\n🔗 To test API endpoints, start the server and run:');
    console.log('node -e "require(\'./test-reset-mechanism.js\').testResetAPI()"');
  });
}

module.exports = { testResetMechanism, testResetAPI };
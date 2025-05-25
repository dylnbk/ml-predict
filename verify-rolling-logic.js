const sqlite3 = require('sqlite3').verbose();

/**
 * Simple verification script for rolling predictions logic
 * Tests database operations without requiring API keys
 */
class RollingVerification {
  constructor() {
    this.db = new sqlite3.Database('./crypto_data.db');
  }

  /**
   * Count existing future predictions
   */
  async countFuturePredictions(symbol, interval, aiProvider) {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      const query = `
        SELECT COUNT(*) as count
        FROM predictions
        WHERE symbol = ?
          AND interval = ?
          AND ai_provider = ?
          AND target_time > ?
      `;

      this.db.get(query, [symbol, interval, aiProvider, currentTime], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }

  /**
   * Get existing future predictions
   */
  async getExistingFuturePredictions(symbol, interval, aiProvider) {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      
      const query = `
        SELECT
          p1.target_time,
          p1.predicted_price,
          p1.prediction_time
        FROM predictions p1
        INNER JOIN (
          SELECT
            target_time,
            MAX(prediction_time) as max_prediction_time
          FROM predictions
          WHERE symbol = ?
            AND interval = ?
            AND ai_provider = ?
            AND target_time > ?
          GROUP BY target_time
        ) p2 ON p1.target_time = p2.target_time
            AND p1.prediction_time = p2.max_prediction_time
        WHERE p1.symbol = ?
          AND p1.interval = ?
          AND p1.ai_provider = ?
        ORDER BY p1.target_time ASC
      `;

      this.db.all(query, [
        symbol, interval, aiProvider, currentTime,
        symbol, interval, aiProvider
      ], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Calculate how many predictions are needed
   */
  calculatePredictionsNeeded(existingCount, targetCount = 24) {
    return Math.max(0, targetCount - existingCount);
  }

  /**
   * Calculate next timestamp
   */
  calculateNextTimestamp(interval, existingPredictions, lastHistoricalTimestamp) {
    const intervalHours = interval === '1h' ? 1 : interval === '4h' ? 4 : 24;
    const intervalMs = intervalHours * 3600 * 1000;

    if (existingPredictions.length > 0) {
      const lastTimestamp = Math.max(...existingPredictions.map(p => p.target_time));
      return lastTimestamp + intervalMs;
    } else {
      return lastHistoricalTimestamp + intervalMs;
    }
  }

  /**
   * Simulate rolling prediction logic
   */
  async simulateRollingLogic(symbol, interval, aiProvider) {
    console.log(`\n🔍 Simulating rolling logic for ${symbol} (${interval}) using ${aiProvider}...`);

    try {
      // Step 1: Count existing predictions
      const existingCount = await this.countFuturePredictions(symbol, interval, aiProvider);
      console.log(`📊 Existing future predictions: ${existingCount}`);

      // Step 2: Calculate needed predictions
      const predictionsNeeded = this.calculatePredictionsNeeded(existingCount, 24);
      console.log(`📈 Predictions needed: ${predictionsNeeded}`);

      // Step 3: Get existing predictions for context
      const existingPredictions = await this.getExistingFuturePredictions(symbol, interval, aiProvider);
      console.log(`📋 Retrieved ${existingPredictions.length} existing predictions for context`);

      if (existingPredictions.length > 0) {
        const first = existingPredictions[0];
        const last = existingPredictions[existingPredictions.length - 1];
        console.log(`   First: ${new Date(first.target_time).toISOString()} - $${first.predicted_price}`);
        console.log(`   Last:  ${new Date(last.target_time).toISOString()} - $${last.predicted_price}`);
      }

      // Step 4: Calculate next timestamp
      const mockHistoricalTimestamp = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      const nextTimestamp = this.calculateNextTimestamp(interval, existingPredictions, mockHistoricalTimestamp);
      console.log(`⏰ Next prediction timestamp: ${new Date(nextTimestamp).toISOString()}`);

      // Step 5: Determine action
      if (predictionsNeeded === 0) {
        console.log(`✅ No action needed - already have 24 predictions`);
        return { action: 'none', predictionsNeeded: 0 };
      } else {
        console.log(`🎯 Would generate ${predictionsNeeded} new predictions starting from ${new Date(nextTimestamp).toISOString()}`);
        return { action: 'generate', predictionsNeeded, nextTimestamp };
      }

    } catch (error) {
      console.error(`❌ Error in simulation:`, error.message);
      return { action: 'error', error: error.message };
    }
  }

  /**
   * Verify database structure
   */
  async verifyDatabaseStructure() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='predictions'
      `;

      this.db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  /**
   * Get sample predictions for verification
   */
  async getSamplePredictions(symbol, interval, limit = 5) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT symbol, interval, ai_provider, target_time, predicted_price, prediction_time
        FROM predictions
        WHERE symbol = ? AND interval = ?
        ORDER BY target_time DESC
        LIMIT ?
      `;

      this.db.all(query, [symbol, interval, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    this.db.close();
  }
}

/**
 * Main verification function
 */
async function runVerification() {
  console.log('🧪 Rolling Predictions Logic Verification\n');

  const verifier = new RollingVerification();

  try {
    // Check database structure
    console.log('📋 Checking database structure...');
    const hasTable = await verifier.verifyDatabaseStructure();
    if (!hasTable) {
      console.log('❌ Predictions table not found');
      return;
    }
    console.log('✅ Predictions table exists');

    // Test different scenarios
    const testCases = [
      { symbol: 'BTC', interval: '1h', aiProvider: 'gemini' },
      { symbol: 'ETH', interval: '4h', aiProvider: 'gemini' },
      { symbol: 'ADA', interval: '1d', aiProvider: 'claude' }
    ];

    for (const testCase of testCases) {
      await verifier.simulateRollingLogic(testCase.symbol, testCase.interval, testCase.aiProvider);
      
      // Show sample predictions
      const samples = await verifier.getSamplePredictions(testCase.symbol, testCase.interval, 3);
      if (samples.length > 0) {
        console.log(`📊 Sample predictions for ${testCase.symbol} (${testCase.interval}):`);
        samples.forEach((pred, index) => {
          console.log(`   ${index + 1}. ${new Date(pred.target_time).toISOString()} - $${pred.predicted_price} (${pred.ai_provider})`);
        });
      } else {
        console.log(`📊 No existing predictions for ${testCase.symbol} (${testCase.interval})`);
      }
    }

    console.log('\n✅ Verification completed successfully');

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    verifier.close();
  }
}

// Run verification if script is executed directly
if (require.main === module) {
  runVerification().catch(console.error);
}

module.exports = RollingVerification;
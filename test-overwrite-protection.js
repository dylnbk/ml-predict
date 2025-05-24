const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, 'crypto_data.db');

// Test data
const testSymbol = 'BTC';
const testInterval = '1h';
const testPredictionTime = Date.now();
const testTargetTime = testPredictionTime + 3600000; // 1 hour later
const testPredictedPrice = 50000;
const testAiProvider = 'gemini';

async function testOverwriteProtection() {
  console.log('🧪 Testing overwrite protection...\n');

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      process.exit(1);
    }
  });

  // Step 1: Insert a test prediction
  console.log('1️⃣ Inserting initial test prediction...');
  
  const insertQuery = `
    INSERT OR IGNORE INTO predictions
    (symbol, interval, prediction_time, target_time, predicted_price, model_version, ai_provider, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const initialCreatedAt = Date.now();
  
  db.run(insertQuery, [
    testSymbol,
    testInterval,
    testPredictionTime,
    testTargetTime,
    testPredictedPrice,
    'gemini-2.5-pro-preview-05-06',
    testAiProvider,
    initialCreatedAt
  ], function(err) {
    if (err) {
      console.error('Error inserting test prediction:', err);
      db.close();
      return;
    }

    const insertedId = this.lastID;
    console.log(`✅ Inserted test prediction with ID: ${insertedId}`);
    console.log(`   Created at: ${new Date(initialCreatedAt).toISOString()}`);

    // Step 2: Wait a bit and try to insert the same prediction again
    setTimeout(() => {
      console.log('\n2️⃣ Attempting to insert duplicate prediction (should be ignored)...');
      
      const duplicateCreatedAt = Date.now();
      
      db.run(insertQuery, [
        testSymbol,
        testInterval,
        testPredictionTime,
        testTargetTime,
        testPredictedPrice + 1000, // Different price to test if it overwrites
        'gemini-2.5-pro-preview-05-06',
        testAiProvider,
        duplicateCreatedAt
      ], function(err) {
        if (err) {
          console.error('Error attempting duplicate insert:', err);
          db.close();
          return;
        }

        console.log(`✅ Duplicate insert completed. Changes: ${this.changes}`);
        if (this.changes === 0) {
          console.log('   ✅ Duplicate was correctly ignored!');
        } else {
          console.log('   ❌ ERROR: Duplicate was not ignored!');
        }

        // Step 3: Verify the original data is preserved
        console.log('\n3️⃣ Verifying original data is preserved...');
        
        const verifyQuery = `
          SELECT id, symbol, interval, prediction_time, target_time, 
                 predicted_price, ai_provider, created_at,
                 datetime(created_at/1000, 'unixepoch') as created_at_formatted
          FROM predictions
          WHERE symbol = ? AND interval = ? AND prediction_time = ? AND target_time = ?
        `;

        db.get(verifyQuery, [testSymbol, testInterval, testPredictionTime, testTargetTime], (err, row) => {
          if (err) {
            console.error('Error verifying data:', err);
            db.close();
            return;
          }

          if (!row) {
            console.log('   ❌ ERROR: Test prediction not found!');
          } else {
            console.log(`   ID: ${row.id}`);
            console.log(`   Predicted Price: ${row.predicted_price}`);
            console.log(`   Created At: ${row.created_at_formatted}`);
            console.log(`   Created At (timestamp): ${row.created_at}`);
            
            if (row.predicted_price === testPredictedPrice) {
              console.log('   ✅ Original predicted price preserved!');
            } else {
              console.log('   ❌ ERROR: Predicted price was overwritten!');
            }

            if (row.created_at === initialCreatedAt) {
              console.log('   ✅ Original created_at timestamp preserved!');
            } else {
              console.log('   ❌ ERROR: created_at timestamp was overwritten!');
            }
          }

          // Step 4: Test actual price update doesn't affect other fields
          console.log('\n4️⃣ Testing actual price update...');
          
          const updateQuery = `
            UPDATE predictions
            SET actual_price = ?, accuracy_score = ?
            WHERE id = ?
          `;

          const actualPrice = 51000;
          const accuracyScore = 98.0;

          db.run(updateQuery, [actualPrice, accuracyScore, row.id], function(err) {
            if (err) {
              console.error('Error updating actual price:', err);
              db.close();
              return;
            }

            console.log(`✅ Updated actual price for prediction ${row.id}`);

            // Verify update didn't affect other fields
            db.get(verifyQuery, [testSymbol, testInterval, testPredictionTime, testTargetTime], (err, updatedRow) => {
              if (err) {
                console.error('Error verifying update:', err);
                db.close();
                return;
              }

              console.log(`   Actual Price: ${updatedRow.actual_price}`);
              console.log(`   Accuracy Score: ${updatedRow.accuracy_score}`);
              console.log(`   Created At (after update): ${updatedRow.created_at}`);

              if (updatedRow.created_at === initialCreatedAt) {
                console.log('   ✅ created_at timestamp preserved after actual price update!');
              } else {
                console.log('   ❌ ERROR: created_at was modified during actual price update!');
              }

              // Cleanup
              console.log('\n5️⃣ Cleaning up test data...');
              db.run('DELETE FROM predictions WHERE id = ?', [row.id], (err) => {
                if (err) {
                  console.error('Error cleaning up:', err);
                } else {
                  console.log('✅ Test data cleaned up');
                }

                console.log('\n✅ All tests completed!');
                db.close();
              });
            });
          });
        });
      });
    }, 1000); // Wait 1 second before attempting duplicate
  });
}

// Run the test
testOverwriteProtection();
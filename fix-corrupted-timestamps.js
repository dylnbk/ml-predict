const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, 'crypto_data.db');

// Open database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to predictions database');
});

async function fixCorruptedTimestamps() {
  console.log('🔧 Starting to fix corrupted created_at timestamps...\n');

  // First, let's identify corrupted records
  const findCorrupted = `
    SELECT id, symbol, interval, prediction_time, created_at, ai_provider
    FROM predictions
    WHERE created_at LIKE '%gemini%' 
       OR created_at LIKE '%gpt%' 
       OR created_at LIKE '%claude%'
       OR created_at NOT GLOB '[0-9]*'
    ORDER BY id
  `;

  db.all(findCorrupted, [], (err, rows) => {
    if (err) {
      console.error('Error finding corrupted records:', err);
      db.close();
      return;
    }

    console.log(`Found ${rows.length} corrupted records\n`);

    if (rows.length === 0) {
      console.log('✅ No corrupted timestamps found!');
      db.close();
      return;
    }

    // Display corrupted records
    console.log('Corrupted records:');
    rows.forEach(row => {
      console.log(`ID: ${row.id}, Symbol: ${row.symbol}, Interval: ${row.interval}, Created At: "${row.created_at}", AI Provider: ${row.ai_provider}`);
    });

    console.log('\n🔧 Fixing corrupted timestamps...\n');

    // Fix each corrupted record
    let fixed = 0;
    const updateStmt = db.prepare(`UPDATE predictions SET created_at = ? WHERE id = ?`);

    rows.forEach((row, index) => {
      // Use prediction_time as the created_at timestamp
      // This is the best approximation we have for when the prediction was created
      const newTimestamp = row.prediction_time;
      
      updateStmt.run(newTimestamp, row.id, function(err) {
        if (err) {
          console.error(`Error fixing record ${row.id}:`, err);
        } else {
          fixed++;
          console.log(`✅ Fixed record ${row.id}: created_at = ${new Date(newTimestamp).toISOString()}`);
        }

        // Check if we're done
        if (index === rows.length - 1) {
          updateStmt.finalize();
          console.log(`\n✅ Fixed ${fixed} out of ${rows.length} corrupted timestamps`);
          
          // Verify the fix
          verifyFix();
        }
      });
    });
  });
}

function verifyFix() {
  console.log('\n🔍 Verifying fix...\n');
  
  const checkQuery = `
    SELECT COUNT(*) as corrupted_count
    FROM predictions
    WHERE created_at LIKE '%gemini%' 
       OR created_at LIKE '%gpt%' 
       OR created_at LIKE '%claude%'
       OR created_at NOT GLOB '[0-9]*'
  `;

  db.get(checkQuery, [], (err, row) => {
    if (err) {
      console.error('Error verifying fix:', err);
    } else {
      if (row.corrupted_count === 0) {
        console.log('✅ All corrupted timestamps have been fixed!');
      } else {
        console.log(`⚠️ Still ${row.corrupted_count} corrupted timestamps remaining`);
      }
    }

    // Show sample of fixed records
    console.log('\n📊 Sample of fixed records:');
    const sampleQuery = `
      SELECT id, symbol, interval, 
             datetime(created_at/1000, 'unixepoch') as created_at_formatted,
             datetime(prediction_time/1000, 'unixepoch') as prediction_time_formatted,
             ai_provider
      FROM predictions
      ORDER BY id DESC
      LIMIT 10
    `;

    db.all(sampleQuery, [], (err, rows) => {
      if (err) {
        console.error('Error getting sample:', err);
      } else {
        console.table(rows);
      }
      
      db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('\n✅ Database connection closed');
        }
      });
    });
  });
}

// Run the fix
fixCorruptedTimestamps();
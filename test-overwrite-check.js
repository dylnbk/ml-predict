const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'crypto_data.db');
const db = new sqlite3.Database(dbPath);

async function checkForOverwrites() {
  console.log('🔍 Checking for evidence of overwritten predictions...\n');

  // 1. Check if there are any gaps in ID sequences that might indicate deletions
  console.log('1. Checking for gaps in prediction IDs (which would indicate deletions)...');
  const gapQuery = `
    WITH id_sequence AS (
      SELECT 
        id,
        LAG(id) OVER (ORDER BY id) as prev_id,
        id - LAG(id) OVER (ORDER BY id) as gap
      FROM predictions
    )
    SELECT * FROM id_sequence 
    WHERE gap > 1
    ORDER BY id
    LIMIT 10
  `;
  
  db.all(gapQuery, [], (err, rows) => {
    if (err) {
      console.error('Error checking ID gaps:', err);
      return;
    }
    
    if (rows.length > 0) {
      console.log('⚠️  Found gaps in ID sequence (possible deletions):');
      rows.forEach(row => {
        console.log(`   - Gap of ${row.gap - 1} IDs between ${row.prev_id} and ${row.id}`);
      });
    } else {
      console.log('✅ No gaps found in ID sequence\n');
    }
  });

  // 2. Check for predictions with mismatched created_at timestamps
  console.log('2. Checking for predictions with suspicious created_at values...');
  const createdAtQuery = `
    SELECT 
      id,
      symbol,
      interval,
      ai_provider,
      created_at,
      prediction_time,
      datetime(prediction_time/1000, 'unixepoch') as prediction_datetime,
      CASE 
        WHEN typeof(created_at) = 'text' THEN 
          (julianday(created_at) - julianday(datetime(prediction_time/1000, 'unixepoch'))) * 24 * 60
        ELSE 
          NULL
      END as minutes_diff
    FROM predictions
    WHERE typeof(created_at) != 'text' 
       OR created_at NOT LIKE '20%-%-%'
    LIMIT 20
  `;
  
  db.all(createdAtQuery, [], (err, rows) => {
    if (err) {
      console.error('Error checking created_at:', err);
      return;
    }
    
    if (rows.length > 0) {
      console.log('⚠️  Found predictions with non-standard created_at values:');
      rows.forEach(row => {
        console.log(`   - ID ${row.id}: ${row.symbol} ${row.interval} (${row.ai_provider})`);
        console.log(`     created_at: "${row.created_at}" (expected timestamp format)`);
      });
    } else {
      console.log('✅ All predictions have proper timestamp format\n');
    }
  });

  // 3. Check for duplicate predictions that might have been re-inserted
  console.log('3. Looking for predictions with identical values but different IDs...');
  const duplicateContentQuery = `
    SELECT 
      a.id as id1,
      b.id as id2,
      a.symbol,
      a.interval,
      a.prediction_time,
      a.target_time,
      a.predicted_price,
      a.ai_provider,
      a.created_at as created1,
      b.created_at as created2
    FROM predictions a
    JOIN predictions b ON 
      a.symbol = b.symbol AND
      a.interval = b.interval AND
      a.prediction_time = b.prediction_time AND
      a.target_time = b.target_time AND
      a.predicted_price = b.predicted_price AND
      a.ai_provider = b.ai_provider AND
      a.id < b.id
    LIMIT 10
  `;
  
  db.all(duplicateContentQuery, [], (err, rows) => {
    if (err) {
      console.error('Error checking duplicate content:', err);
      return;
    }
    
    if (rows.length > 0) {
      console.log('❌ Found predictions with identical content but different IDs:');
      rows.forEach(row => {
        console.log(`   - IDs ${row.id1} and ${row.id2}: ${row.symbol} ${row.interval}`);
        console.log(`     Same prediction_time, target_time, and price`);
        console.log(`     Created: ${row.created1} vs ${row.created2}`);
      });
    } else {
      console.log('✅ No duplicate predictions with different IDs found\n');
    }
  });

  // 4. Analyze the unique constraint and INSERT OR REPLACE behavior
  console.log('4. Analyzing current unique constraint...');
  const constraintQuery = `
    SELECT sql FROM sqlite_master 
    WHERE type = 'table' AND name = 'predictions'
  `;
  
  db.get(constraintQuery, [], (err, row) => {
    if (err) {
      console.error('Error getting table schema:', err);
      return;
    }
    
    console.log('\nCurrent table schema:');
    console.log(row.sql);
    
    // Extract UNIQUE constraint
    const uniqueMatch = row.sql.match(/UNIQUE\s*\(([^)]+)\)/i);
    if (uniqueMatch) {
      console.log(`\n📌 UNIQUE constraint: (${uniqueMatch[1]})`);
      console.log('\n⚠️  CRITICAL ISSUE IDENTIFIED:');
      console.log('   The INSERT OR REPLACE statement in storePredictions() will:');
      console.log('   1. DELETE any existing row with the same unique key');
      console.log('   2. INSERT a new row with a new auto-incremented ID');
      console.log('   3. This DESTROYS the original created_at timestamp!');
      console.log('\n   This means if the same prediction is generated twice');
      console.log('   (same symbol, interval, prediction_time, target_time, ai_provider),');
      console.log('   the original historical record is LOST forever!');
    }
  });

  // 5. Check for recent overwrites by looking at created_at patterns
  console.log('\n5. Checking for recent potential overwrites...');
  const overwritePatternQuery = `
    SELECT 
      symbol,
      interval,
      ai_provider,
      COUNT(*) as total_predictions,
      COUNT(DISTINCT DATE(created_at)) as unique_days,
      MIN(created_at) as first_created,
      MAX(created_at) as last_created,
      COUNT(DISTINCT prediction_time) as unique_prediction_times
    FROM predictions
    WHERE typeof(created_at) = 'text'
    GROUP BY symbol, interval, ai_provider
    HAVING unique_prediction_times < total_predictions / 2
    ORDER BY symbol, interval
  `;
  
  db.all(overwritePatternQuery, [], (err, rows) => {
    if (err) {
      console.error('Error checking overwrite patterns:', err);
      return;
    }
    
    if (rows.length > 0) {
      console.log('\n⚠️  Groups with suspicious patterns (possible overwrites):');
      rows.forEach(row => {
        console.log(`\n   ${row.symbol} ${row.interval} (${row.ai_provider}):`);
        console.log(`   - Total predictions: ${row.total_predictions}`);
        console.log(`   - Unique prediction times: ${row.unique_prediction_times}`);
        console.log(`   - First created: ${row.first_created}`);
        console.log(`   - Last created: ${row.last_created}`);
      });
    }
    
    db.close();
  });
}

// Run the check
checkForOverwrites();
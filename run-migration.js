const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
  const db = new sqlite3.Database('./crypto_data.db');
  
  try {
    console.log('🔧 Running migration to update predictions unique constraint...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', 'update_predictions_unique_constraint.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // Execute each statement
    for (const statement of statements) {
      await new Promise((resolve, reject) => {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        db.run(statement, (err) => {
          if (err) {
            console.error('Error executing statement:', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the new constraint
    console.log('\n📊 Verifying new constraint...');
    
    await new Promise((resolve, reject) => {
      db.all(`
        SELECT name, sql 
        FROM sqlite_master 
        WHERE type = 'index' 
        AND tbl_name = 'predictions'
        AND name LIKE '%unique%'
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          console.log('Unique indexes on predictions table:');
          rows.forEach(row => {
            console.log(`- ${row.name}: ${row.sql}`);
          });
          resolve();
        }
      });
    });
    
    // Check current predictions count by provider
    console.log('\n📈 Current predictions by provider:');
    
    await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          symbol,
          interval,
          ai_provider,
          COUNT(*) as count,
          COUNT(DISTINCT target_time) as unique_timestamps
        FROM predictions
        GROUP BY symbol, interval, ai_provider
        ORDER BY symbol, interval, ai_provider
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          rows.forEach(row => {
            console.log(`${row.symbol} ${row.interval} (${row.ai_provider}): ${row.count} predictions, ${row.unique_timestamps} unique timestamps`);
          });
          resolve();
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run the migration
runMigration();
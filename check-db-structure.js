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

// Check tables
db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
  if (err) {
    console.error('Error getting tables:', err);
    db.close();
    return;
  }
  
  console.log('\nTables in database:');
  tables.forEach(table => {
    console.log(`- ${table.name}`);
  });
  
  // Check if predictions table exists
  const hasPredictionsTable = tables.some(t => t.name === 'predictions');
  
  if (!hasPredictionsTable) {
    console.log('\n❌ predictions table does not exist!');
    console.log('You may need to run migrations first.');
  } else {
    console.log('\n✅ predictions table exists');
    
    // Get table schema
    db.all("PRAGMA table_info(predictions)", [], (err, columns) => {
      if (err) {
        console.error('Error getting table info:', err);
      } else {
        console.log('\nColumns in predictions table:');
        columns.forEach(col => {
          console.log(`- ${col.name} (${col.type})`);
        });
      }
      
      db.close();
    });
  }
});
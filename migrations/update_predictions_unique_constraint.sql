-- Create a new predictions table with the updated unique constraint
CREATE TABLE predictions_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    prediction_time INTEGER NOT NULL,
    target_time INTEGER NOT NULL,
    predicted_price REAL NOT NULL,
    actual_price REAL,
    accuracy_score REAL,
    model_version TEXT DEFAULT 'gemini-2.0-flash-exp',
    ai_provider TEXT DEFAULT 'gemini',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, interval, prediction_time, target_time, ai_provider)
);

-- Copy data from old table to new table
INSERT INTO predictions_new 
SELECT * FROM predictions;

-- Drop the old table
DROP TABLE predictions;

-- Rename the new table to predictions
ALTER TABLE predictions_new RENAME TO predictions;

-- Recreate indexes for better performance
CREATE INDEX idx_predictions_lookup_v2
ON predictions(symbol, interval, ai_provider, prediction_time DESC);

CREATE INDEX idx_predictions_target_v2
ON predictions(symbol, interval, ai_provider, target_time);

CREATE INDEX idx_predictions_provider 
ON predictions(symbol, interval, ai_provider);
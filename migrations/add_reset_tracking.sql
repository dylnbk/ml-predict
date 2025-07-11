-- prediction_resets table for tracking reset events
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

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_prediction_resets_lookup
ON prediction_resets(symbol, interval, ai_provider, reset_time DESC);
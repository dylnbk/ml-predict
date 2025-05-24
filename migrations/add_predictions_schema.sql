-- predictions table
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    prediction_time INTEGER NOT NULL,
    target_time INTEGER NOT NULL,
    predicted_price REAL NOT NULL,
    actual_price REAL,
    accuracy_score REAL,
    model_version TEXT DEFAULT 'gemini-2.0-flash-exp',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, interval, prediction_time, target_time)
);

-- prediction_metrics table
CREATE TABLE IF NOT EXISTS prediction_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    date DATE NOT NULL,
    mae REAL,
    rmse REAL,
    accuracy_percentage REAL,
    predictions_count INTEGER,
    UNIQUE(symbol, interval, date)
);

-- technical_indicators table
CREATE TABLE IF NOT EXISTS technical_indicators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    sma_20 REAL,
    sma_50 REAL,
    rsi_14 REAL,
    macd REAL,
    macd_signal REAL,
    macd_histogram REAL,
    UNIQUE(symbol, interval, timestamp)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_predictions_lookup
ON predictions(symbol, interval, prediction_time DESC);

CREATE INDEX IF NOT EXISTS idx_predictions_target
ON predictions(symbol, interval, target_time);

CREATE INDEX IF NOT EXISTS idx_metrics_lookup
ON prediction_metrics(symbol, interval, date DESC);

CREATE INDEX IF NOT EXISTS idx_indicators_lookup
ON technical_indicators(symbol, interval, timestamp DESC);
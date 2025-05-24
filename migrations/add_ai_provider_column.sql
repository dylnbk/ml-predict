-- Add ai_provider column to predictions table
ALTER TABLE predictions ADD COLUMN ai_provider TEXT DEFAULT 'gemini';

-- Create index for faster queries by provider
CREATE INDEX idx_predictions_provider ON predictions(symbol, interval, ai_provider);

-- Update existing predictions to have 'gemini' as provider
UPDATE predictions SET ai_provider = 'gemini' WHERE ai_provider IS NULL;
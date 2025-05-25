# Rolling Future Predictions

This document describes the rolling future predictions functionality implemented in the ML Predict system.

## Overview

The rolling predictions system ensures that the system always maintains exactly 24 future predictions for each symbol/interval/AI provider combination. Instead of replacing all predictions, it intelligently generates only the missing predictions needed to maintain the 24-prediction window.

## Key Features

### 1. Gap Detection
- **Function**: `countFuturePredictions(symbol, interval, aiProvider)`
- **Purpose**: Counts existing future predictions (where target_time > current_time)
- **Returns**: Number of existing future predictions

### 2. Smart Generation
- **Function**: `generateRollingPredictions(symbol, interval, aiProvider, maxRetries)`
- **Logic**: 
  - Calculates: `predictions_needed = 24 - existing_future_predictions`
  - Only generates predictions if `predictions_needed > 0`
  - Preserves existing predictions

### 3. Context-Aware Prompts
- **Function**: `formatPredictionPrompt()` (updated)
- **Features**:
  - Includes existing future predictions as context for AI
  - Shows both historical actual data AND existing future predictions
  - Clearly indicates how many NEW predictions to generate
  - Ensures logical continuation from existing predictions

### 4. Timestamp Sequencing
- **Function**: `calculateNextTimestamp(interval, existingPredictions, klineData)`
- **Logic**:
  - If existing predictions exist: starts from last existing timestamp + interval
  - If no existing predictions: starts from last historical data + interval
  - Ensures proper sequential timestamps

## API Changes

### Updated Methods

#### `generatePredictions(symbol, interval, aiProvider, maxRetries, predictionsCount)`
- **New Parameter**: `predictionsCount` (default: 24)
- **Behavior**: Generates only the specified number of predictions
- **Context**: Uses existing future predictions for AI context

#### `formatPredictionPrompt(symbol, interval, klineData, indicators, sentimentData, existingPredictions, predictionsCount, nextTimestamp)`
- **New Parameters**:
  - `existingPredictions`: Array of existing future predictions
  - `predictionsCount`: Number of new predictions to generate
  - `nextTimestamp`: Starting timestamp for new predictions

### New Methods

#### `generateRollingPredictions(symbol, interval, aiProvider, maxRetries)`
- **Purpose**: Main rolling predictions entry point
- **Returns**: Object with success, predictionsNeeded, generated, etc.

#### `countFuturePredictions(symbol, interval, aiProvider)`
- **Purpose**: Count existing future predictions
- **Returns**: Number of future predictions

#### `getExistingFuturePredictions(symbol, interval, aiProvider)`
- **Purpose**: Get existing future predictions for context
- **Returns**: Array of existing predictions with timestamps and prices

#### `calculateNextTimestamp(interval, existingPredictions, klineData)`
- **Purpose**: Calculate starting timestamp for new predictions
- **Returns**: Timestamp for next prediction

## Usage Examples

### Basic Rolling Predictions
```javascript
const predictionService = new PredictionService();

// Generate rolling predictions for BTC 1h
const result = await predictionService.generateRollingPredictions('BTC', '1h', 'gemini');

if (result.success) {
  console.log(`Generated ${result.generated} new predictions`);
  console.log(`Total predictions needed: ${result.predictionsNeeded}`);
} else {
  console.error(`Error: ${result.error}`);
}
```

### Custom Prediction Count
```javascript
// Generate only 5 predictions
const result = await predictionService.generatePredictions('BTC', '1h', 'gemini', 3, 5);
```

### Check Current Status
```javascript
// Count existing future predictions
const count = await predictionService.countFuturePredictions('BTC', '1h', 'gemini');
console.log(`Current future predictions: ${count}/24`);

// Get existing predictions for review
const existing = await predictionService.getExistingFuturePredictions('BTC', '1h', 'gemini');
console.log(`Existing predictions:`, existing);
```

## Benefits

1. **Efficiency**: Only generates missing predictions, not full 24 each time
2. **Continuity**: Maintains prediction history and logical flow
3. **Flexibility**: Supports custom prediction counts for testing
4. **Context**: AI gets full context of existing predictions
5. **Reliability**: Prevents overwrites and maintains data integrity

## Edge Cases Handled

1. **No Existing Predictions**: Generates full 24 predictions starting from last historical data
2. **Partial Predictions**: Generates only the missing count to reach 24
3. **Full Coverage**: Returns success with 0 generated when already have 24
4. **Timestamp Gaps**: Ensures sequential timestamps regardless of existing gaps
5. **Multiple Providers**: Each AI provider maintains separate prediction windows

## Testing

### Test Files
- `test-rolling-predictions.js`: Comprehensive test suite
- `demo-rolling-predictions.js`: Interactive demonstration

### Test Commands
```bash
# Run comprehensive tests
node test-rolling-predictions.js

# Run interactive demo
node demo-rolling-predictions.js
```

### Test Coverage
- Gap detection logic
- Rolling prediction generation
- Custom prediction counts
- Edge cases (no predictions, full coverage, etc.)
- Multiple symbols and intervals
- Timestamp sequencing
- Context preservation

## Backward Compatibility

The rolling predictions system maintains full backward compatibility:

- Existing `generatePredictions()` calls work unchanged (default to 24 predictions)
- Existing `formatPredictionPrompt()` calls work with optional parameters
- All existing overwrite protection logic is preserved
- Database schema unchanged
- API endpoints unchanged

## Performance Considerations

1. **Reduced API Calls**: Only generates missing predictions
2. **Context Efficiency**: Existing predictions provide better AI context
3. **Database Efficiency**: Uses existing unique constraints for duplicate prevention
4. **Memory Usage**: Processes only needed predictions, not full datasets

## Future Enhancements

1. **Configurable Window Size**: Make the 24-prediction window configurable
2. **Prediction Expiry**: Automatic cleanup of old predictions
3. **Batch Rolling**: Process multiple symbols in single operation
4. **Smart Refresh**: Update predictions based on accuracy metrics
5. **Real-time Rolling**: Continuous background rolling updates
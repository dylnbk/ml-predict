# Gemini Truncation Fix - Partial Prediction Extraction

## Problem
The system was encountering truncated responses from Gemini API and throwing errors like:
```
Error with gemini (attempt 2/4): Gemini response appears to be truncated. Consider increasing maxOutputTokens or reducing prediction count.
```

Instead of just failing, we needed to extract whatever predictions were available and commit them to the database.

## Solution Implemented

### 1. Enhanced Truncation Detection
- Improved detection of truncated responses with better pattern matching
- Changed from throwing errors to attempting extraction when truncation is detected

### 2. Partial Prediction Extraction
Added three new methods to `PredictionService`:

#### `extractPartialPredictions(text)`
- Main method that attempts to extract predictions from potentially truncated responses
- Tries multiple strategies in order of preference:
  1. Parse complete JSON if available
  2. Repair truncated JSON structure
  3. Extract individual prediction objects

#### `repairTruncatedJson(jsonText)`
- Attempts to fix common truncation issues in JSON
- Finds the last complete prediction object
- Adds missing closing brackets and braces
- Validates the repaired structure

#### `extractIndividualPredictions(text)`
- Last resort method to find scattered prediction objects
- Uses regex to find individual `{timestamp, price}` objects
- Validates each prediction before including it

### 3. Improved Error Handling
- Changed from hard failures to graceful degradation
- Reduced minimum acceptable predictions from 80% to 50% for partial extractions
- Better logging to show exactly how many predictions were extracted vs requested

### 4. Enhanced Response Validation
- Updated JSON parsing to attempt partial extraction on parse failures
- Added specific handling for Gemini responses
- Improved error messages with actionable information

## Key Changes Made

### In `generateWithProvider()` method:
```javascript
// Before: Threw error on truncation detection
if (isTruncated) {
  throw new Error('Gemini response appears to be truncated...');
}

// After: Attempts extraction on truncation detection
if (isTruncated) {
  console.warn(`⚠️ Detected truncated Gemini response...`);
  const partialPredictions = this.extractPartialPredictions(trimmedText);
  if (partialPredictions && partialPredictions.predictions.length > 0) {
    console.log(`✅ Successfully extracted ${partialPredictions.predictions.length} predictions`);
    return trimmedText; // Continue with normal flow
  } else {
    throw new Error(`Could not extract any valid predictions from truncated response`);
  }
}
```

### In JSON parsing section:
- Added fallback to partial extraction when JSON parsing fails
- Specific handling for Gemini responses with multiple extraction attempts
- Better error context and guidance

### In validation section:
- Reduced minimum threshold from 80% to 50% for partial extractions
- Added percentage calculations and better logging
- Enhanced return object with partial extraction metadata

## Results

### Test Results
All test cases pass successfully:
- ✅ Complete JSON responses: 3/3 predictions extracted
- ✅ Missing closing braces: 3/3 predictions extracted (repaired)
- ✅ Severely truncated: 3/3 predictions extracted (repaired)
- ✅ Scattered objects: 2/2 predictions extracted (individual extraction)

### Benefits
1. **No More Lost Predictions**: System now saves whatever predictions it can extract
2. **Better User Experience**: Instead of complete failures, users get partial results
3. **Improved Reliability**: Graceful degradation instead of hard failures
4. **Better Monitoring**: Clear logging of extraction success rates
5. **Actionable Feedback**: Users know exactly how many predictions were saved

### Example Output
```
⚠️ Detected truncated Gemini response (length: 1741 characters)
🔧 Attempting to extract partial predictions from truncated response...
✅ Successfully extracted 18/24 predictions from truncated response
✅ Extracted 18/24 predictions for BTC (1h) using GEMINI (partial due to truncation)
```

## Configuration
- Minimum acceptable predictions: 50% of requested (was 80%)
- Maximum output tokens: 60,000 (already configured)
- Retry attempts: 3 (unchanged)
- Exponential backoff: 2s, 4s, 8s (unchanged)

## Future Improvements
1. Could implement adaptive prediction count reduction based on truncation frequency
2. Could add metrics tracking for truncation rates by symbol/interval
3. Could implement prediction completion in subsequent requests
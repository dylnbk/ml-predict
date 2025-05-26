// Simple test for partial prediction extraction without requiring API keys
class MockPredictionService {
  detectResponseTruncation(text) {
    if (!text || text.length === 0) {
      return true;
    }
    
    const trimmed = text.trim();
    
    // Check for common truncation indicators
    const truncationIndicators = [
      // Ends abruptly without proper JSON closure
      /[^}\]]\s*$/,
      // Ends with incomplete JSON structure
      /[,{[][\s]*$/,
      // Ends with incomplete string
      /"[^"]*$/,
      // Ends with incomplete number
      /\d+\.?\d*$/,
      // Very short response (likely truncated)
      trimmed.length < 100
    ];
    
    // Check if response is suspiciously short for 24 predictions
    if (trimmed.length < 500) {
      console.warn(`⚠️ Response suspiciously short: ${trimmed.length} characters`);
      return true;
    }
    
    // Check for truncation patterns
    for (const indicator of truncationIndicators.slice(0, -1)) { // Exclude length check
      if (indicator.test && indicator.test(trimmed)) {
        console.warn(`⚠️ Truncation pattern detected: ${indicator}`);
        return true;
      }
    }
    
    return false;
  }

  validateJsonCompleteness(jsonText) {
    if (!jsonText || jsonText.trim().length === 0) {
      return false;
    }
    
    const trimmed = jsonText.trim();
    
    // Basic structure checks
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      console.warn(`⚠️ JSON doesn't start with { or end with }`);
      return false;
    }
    
    // Count braces to ensure they're balanced
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    
    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];
      
      if (escaped) {
        escaped = false;
        continue;
      }
      
      if (char === '\\') {
        escaped = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
        else if (char === '[') bracketCount++;
        else if (char === ']') bracketCount--;
      }
    }
    
    // Check if braces and brackets are balanced
    if (braceCount !== 0) {
      console.warn(`⚠️ Unbalanced braces: ${braceCount}`);
      return false;
    }
    
    if (bracketCount !== 0) {
      console.warn(`⚠️ Unbalanced brackets: ${bracketCount}`);
      return false;
    }
    
    // Check for expected structure for predictions
    if (!trimmed.includes('"predictions"') || !trimmed.includes('[')) {
      console.warn(`⚠️ Missing expected predictions structure`);
      return false;
    }
    
    // Try to parse to ensure it's valid JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed.predictions || !Array.isArray(parsed.predictions)) {
        console.warn(`⚠️ Invalid predictions structure in JSON`);
        return false;
      }
      
      // Check if we have a reasonable number of predictions
      if (parsed.predictions.length < 10) {
        console.warn(`⚠️ Too few predictions: ${parsed.predictions.length}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.warn(`⚠️ JSON parse error during validation: ${error.message}`);
      return false;
    }
  }

  extractPartialPredictions(text) {
    if (!text || text.trim().length === 0) {
      return null;
    }

    try {
      // First try to find a complete JSON structure
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('⚠️ No JSON structure found in response');
        return null;
      }

      let jsonText = jsonMatch[0];
      
      // Try parsing as-is first
      try {
        const parsed = JSON.parse(jsonText);
        if (parsed.predictions && Array.isArray(parsed.predictions)) {
          console.log(`✅ Successfully extracted ${parsed.predictions.length} complete predictions`);
          return parsed;
        }
      } catch (parseError) {
        console.log('📝 Initial JSON parse failed, attempting repair...');
      }

      // If parsing failed, try to repair truncated JSON
      const repairedJson = this.repairTruncatedJson(jsonText);
      if (repairedJson) {
        try {
          const parsed = JSON.parse(repairedJson);
          if (parsed.predictions && Array.isArray(parsed.predictions) && parsed.predictions.length > 0) {
            console.log(`✅ Successfully extracted ${parsed.predictions.length} predictions from repaired JSON`);
            return parsed;
          }
        } catch (repairParseError) {
          console.warn('⚠️ Failed to parse repaired JSON:', repairParseError.message);
        }
      }

      // Last resort: try to extract individual prediction objects
      const extractedPredictions = this.extractIndividualPredictions(text);
      if (extractedPredictions && extractedPredictions.length > 0) {
        console.log(`✅ Extracted ${extractedPredictions.length} individual predictions`);
        return { predictions: extractedPredictions };
      }

      return null;
    } catch (error) {
      console.error('❌ Error extracting partial predictions:', error.message);
      return null;
    }
  }

  repairTruncatedJson(jsonText) {
    try {
      let repaired = jsonText.trim();

      // Remove any trailing incomplete elements
      // Look for the last complete prediction object
      const predictionMatches = [...repaired.matchAll(/\{[^{}]*"timestamp"[^{}]*"price"[^{}]*\}/g)];
      if (predictionMatches.length === 0) {
        return null;
      }

      // Find the position after the last complete prediction
      const lastMatch = predictionMatches[predictionMatches.length - 1];
      const lastCompletePos = lastMatch.index + lastMatch[0].length;

      // Extract everything up to the last complete prediction
      let truncatedAtLastComplete = repaired.substring(0, lastCompletePos);

      // Check if we need to close the predictions array
      if (!truncatedAtLastComplete.includes(']')) {
        truncatedAtLastComplete += ']';
      }

      // Check if we need to close the main object
      if (!truncatedAtLastComplete.endsWith('}')) {
        truncatedAtLastComplete += '}';
      }

      // Validate the structure makes sense
      if (truncatedAtLastComplete.includes('"predictions"') && 
          truncatedAtLastComplete.includes('[') && 
          truncatedAtLastComplete.includes(']')) {
        return truncatedAtLastComplete;
      }

      return null;
    } catch (error) {
      console.warn('⚠️ Error repairing JSON:', error.message);
      return null;
    }
  }

  extractIndividualPredictions(text) {
    try {
      const predictions = [];
      
      // Look for individual prediction objects with timestamp and price
      const predictionRegex = /\{[^{}]*"timestamp"[^{}]*"price"[^{}]*\}/g;
      const matches = text.match(predictionRegex);
      
      if (!matches) {
        return [];
      }

      for (const match of matches) {
        try {
          const prediction = JSON.parse(match);
          if (prediction.timestamp && prediction.price && 
              typeof prediction.timestamp === 'number' && 
              typeof prediction.price === 'number' && 
              prediction.price > 0) {
            predictions.push(prediction);
          }
        } catch (parseError) {
          // Skip invalid prediction objects
          continue;
        }
      }

      return predictions;
    } catch (error) {
      console.warn('⚠️ Error extracting individual predictions:', error.message);
      return [];
    }
  }
}

// Test the partial prediction extraction functionality
async function testPartialExtraction() {
  const service = new MockPredictionService();
  
  console.log('🧪 Testing partial prediction extraction...\n');
  
  // Test case 1: Complete JSON response
  const completeResponse = `{
  "predictions": [
    {
      "timestamp": 1735228800000,
      "price": 109409.5
    },
    {
      "timestamp": 1735232400000,
      "price": 109500.2
    },
    {
      "timestamp": 1735236000000,
      "price": 109600.8
    }
  ]
}`;

  console.log('Test 1: Complete JSON response');
  const result1 = service.extractPartialPredictions(completeResponse);
  console.log('Result:', result1 ? `${result1.predictions.length} predictions extracted` : 'Failed');
  console.log('');

  // Test case 2: Truncated response (like the one in the error message)
  const truncatedResponse2 = `{
  "predictions": [
    {
      "timestamp": 1735228800000,
      "price": 109409.5
    },
    {
      "timestamp": 1735232400000,
      "price": 109500.2
    },
    {
      "timestamp": 1735955600000,
      "price": 109409.5
    }
  ]`;

  console.log('Test 2: Response missing closing brace (common truncation)');
  const result2 = service.extractPartialPredictions(truncatedResponse2);
  console.log('Result:', result2 ? `${result2.predictions.length} predictions extracted` : 'Failed');
  console.log('');

  // Test case 3: Severely truncated response
  const severelyTruncated = `{
  "predictions": [
    {
      "timestamp": 1735228800000,
      "price": 109409.5
    },
    {
      "timestamp": 1735232400000,
      "price": 109500.2
    },
    {
      "timestamp": 1735955600000,
      "price": 109409.5
    }
  ]`;

  console.log('Test 3: Severely truncated response (missing closing braces)');
  const result3 = service.extractPartialPredictions(severelyTruncated);
  console.log('Result:', result3 ? `${result3.predictions.length} predictions extracted` : 'Failed');
  console.log('');

  // Test case 4: Response with individual prediction objects scattered
  const scatteredResponse = `Some text before
  {
    "timestamp": 1735228800000,
    "price": 109409.5
  }
  More text
  {
    "timestamp": 1735232400000,
    "price": 109500.2
  }
  Even more text`;

  console.log('Test 4: Scattered individual prediction objects');
  const result4 = service.extractPartialPredictions(scatteredResponse);
  console.log('Result:', result4 ? `${result4.predictions.length} predictions extracted` : 'Failed');
  console.log('');

  // Test case 5: Real-world truncation example (from the error message)
  const realWorldTruncated = `{
  "predictions": [
    {
      "timestamp": 1735228800000,
      "price": 109409.5
    },
    {
      "timestamp": 1735232400000,
      "price": 109500.2
    },
    {
      "timestamp": 1735955600000,
      "price": 109409.5
    }
  ]
}`;

  console.log('Test 5: Real-world example (similar to error message)');
  const result5 = service.extractPartialPredictions(realWorldTruncated);
  console.log('Result:', result5 ? `${result5.predictions.length} predictions extracted` : 'Failed');
  console.log('');

  console.log('✅ Partial extraction testing complete!');
}

// Run the test
testPartialExtraction().catch(console.error);
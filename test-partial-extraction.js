const PredictionService = require('./services/predictionService');

// Test the partial prediction extraction functionality
async function testPartialExtraction() {
  const service = new PredictionService();
  
  console.log('🧪 Testing partial prediction extraction...\n');
  
  // Test case 1: Truncated JSON response (common scenario)
  const truncatedResponse = `{
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
  const result1 = service.extractPartialPredictions(truncatedResponse);
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
  ]
}`;

  console.log('Test 2: Response ending with incomplete data (like the error example)');
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

  console.log('✅ Partial extraction testing complete!');
}

// Run the test
testPartialExtraction().catch(console.error);
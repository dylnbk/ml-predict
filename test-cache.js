// Test script to verify the caching implementation
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const SYMBOLS = ['BTC', 'ETH', 'XRP', 'SOL'];

async function testCache() {
  console.log('🧪 Testing news cache implementation...\n');
  
  for (const symbol of SYMBOLS) {
    console.log(`\n📊 Testing ${symbol}:`);
    
    // First request - should fetch from OpenAI
    console.log('  1st request (should fetch fresh data)...');
    const start1 = Date.now();
    try {
      const response1 = await axios.get(`${BASE_URL}/api/sentiment/${symbol}`);
      const time1 = Date.now() - start1;
      console.log(`  ✅ Response time: ${time1}ms`);
      console.log(`  📦 Cached: ${response1.data.news.cached}`);
      console.log(`  📰 Summary: ${response1.data.news.summary.substring(0, 50)}...`);
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Second request - should use cache
    console.log('\n  2nd request (should use cached data)...');
    const start2 = Date.now();
    try {
      const response2 = await axios.get(`${BASE_URL}/api/sentiment/${symbol}`);
      const time2 = Date.now() - start2;
      console.log(`  ✅ Response time: ${time2}ms`);
      console.log(`  📦 Cached: ${response2.data.news.cached}`);
      console.log(`  📰 Summary: ${response2.data.news.summary.substring(0, 50)}...`);
      
      if (time2 < time1 / 2) {
        console.log(`  🎉 Cache working! Response ${Math.round(time1/time2)}x faster`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n\n✅ Cache test completed!');
  console.log('ℹ️  Note: The cache will expire after 4 hours.');
  console.log('ℹ️  Old cache entries are automatically cleaned every hour.');
}

// Run the test
testCache().catch(console.error);
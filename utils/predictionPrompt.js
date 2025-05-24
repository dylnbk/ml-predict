/**
 * Formats data into a structured prompt for Google Gemini AI
 * to generate cryptocurrency price predictions
 */

/**
 * Formats the prediction prompt for Gemini
 * @param {string} symbol - Cryptocurrency symbol (e.g., 'BTC', 'ETH')
 * @param {string} interval - Time interval ('1h', '4h', '1d')
 * @param {Array} klineData - Historical price data (last 100 points)
 * @param {Array} indicators - Technical indicators data
 * @param {Object} sentimentData - Market sentiment data
 * @returns {string} Formatted prompt for Gemini
 */
function formatPredictionPrompt(symbol, interval, klineData, indicators, sentimentData) {
  // Calculate interval duration for context
  const intervalHours = interval === '1h' ? 1 : interval === '4h' ? 4 : 24;
  const predictionHours = intervalHours * 24;

  // Format historical data
  const historicalPrices = klineData.map(k => ({
    timestamp: k.timestamp,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume
  }));

  // Format technical indicators
  const latestIndicators = indicators.length > 0 ? indicators[0] : null;
  
  // Extract sentiment for the specific symbol
  const symbolSentiment = sentimentData?.data?.[symbol] || null;
  const marketSentiment = sentimentData?.data?.marketSentiment || null;

  const prompt = `You are an expert cryptocurrency analyst. Analyze the following data and predict the next 24 ${interval} price points for ${symbol}.

HISTORICAL DATA (Last 100 ${interval} candles):
${JSON.stringify(historicalPrices.slice(-10), null, 2)} // Showing last 10 for brevity

TECHNICAL INDICATORS (Latest):
${latestIndicators ? JSON.stringify({
    SMA_20: latestIndicators.sma_20,
    SMA_50: latestIndicators.sma_50,
    RSI_14: latestIndicators.rsi_14,
    MACD: latestIndicators.macd,
    MACD_Signal: latestIndicators.macd_signal,
    MACD_Histogram: latestIndicators.macd_histogram
  }, null, 2) : 'No indicators available'}

MARKET SENTIMENT:
${marketSentiment ? JSON.stringify({
    fearGreedIndex: marketSentiment.value,
    classification: marketSentiment.classification
  }, null, 2) : 'No market sentiment available'}

${symbol} SPECIFIC SENTIMENT:
${symbolSentiment ? JSON.stringify({
    sentiment: symbolSentiment.sentiment,
    sentimentScore: symbolSentiment.sentimentScore,
    mentionVolume: symbolSentiment.mentionVolume
  }, null, 2) : 'No specific sentiment available'}

ANALYSIS CONTEXT:
- Current price: $${klineData[klineData.length - 1].close}
- 24h change: ${calculatePriceChange(klineData)}%
- Interval: ${interval} (${intervalHours} hour${intervalHours > 1 ? 's' : ''})
- Predictions needed: 24 ${interval} candles (next ${predictionHours} hours)

INSTRUCTIONS:
1. Analyze the historical price patterns, volume trends, and technical indicators
2. Consider the market sentiment and ${symbol}-specific sentiment
3. Identify support and resistance levels
4. Factor in momentum and trend direction
5. Generate realistic price predictions for the next 24 ${interval} periods

IMPORTANT: Return ONLY valid JSON in the following format, with no additional text or explanation:
{
  "predictions": [
    {
      "timestamp": <unix_timestamp_in_milliseconds>,
      "price": <predicted_close_price>
    }
  ]
}

The timestamps should start from ${klineData[klineData.length - 1].timestamp + (intervalHours * 3600 * 1000)} and increment by ${intervalHours * 3600 * 1000} milliseconds for each prediction.`;

  return prompt;
}

/**
 * Calculate 24h price change percentage
 * @param {Array} klineData - Historical price data
 * @returns {string} Price change percentage
 */
function calculatePriceChange(klineData) {
  if (klineData.length < 24) return '0.00';
  
  const currentPrice = klineData[klineData.length - 1].close;
  const price24hAgo = klineData[klineData.length - 24].close;
  const change = ((currentPrice - price24hAgo) / price24hAgo) * 100;
  
  return change.toFixed(2);
}

/**
 * Validates the Gemini response format
 * @param {Object} response - Response from Gemini
 * @returns {boolean} True if valid format
 */
function validatePredictionResponse(response) {
  if (!response || typeof response !== 'object') return false;
  if (!Array.isArray(response.predictions)) return false;
  if (response.predictions.length !== 24) return false;
  
  return response.predictions.every(pred => 
    pred.hasOwnProperty('timestamp') &&
    pred.hasOwnProperty('price') &&
    typeof pred.timestamp === 'number' &&
    typeof pred.price === 'number' &&
    pred.price > 0
  );
}

module.exports = {
  formatPredictionPrompt,
  validatePredictionResponse
};
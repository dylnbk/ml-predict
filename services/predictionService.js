const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');
const { formatPredictionPrompt, validatePredictionResponse } = require('../utils/predictionPrompt');
const StatisticalModels = require('../utils/statisticalModels');

class PredictionService {
  constructor() {
    this.db = new sqlite3.Database('./crypto_data.db');
    
    // Initialize AI providers (with fallback for missing API keys)
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.geminiModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-05-06' });
    }
    
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }
    
    this.sentimentDataFile = path.join(__dirname, '..', 'sentiment-data.json');
    
    // Initialize statistical models
    this.statisticalModels = new StatisticalModels();
  }

  /**
   * Get predictions for a symbol/interval/provider
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {string} aiProvider - AI provider (gemini, gpt, claude, arima, holt_winters)
   * @returns {Promise<Array>} Array of predictions
   */
  async getPredictions(symbol, interval, aiProvider = 'gemini') {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      
      // Get both future predictions and recent past predictions with actual prices
      // Group by target_time and get the most recent prediction for each
      const query = `
        SELECT
          p1.target_time as timestamp,
          p1.predicted_price,
          p1.actual_price
        FROM predictions p1
        INNER JOIN (
          SELECT
            target_time,
            MAX(prediction_time) as max_prediction_time
          FROM predictions
          WHERE symbol = ?
            AND interval = ?
            AND ai_provider = ?
            AND (target_time > ? OR (target_time > ? - 86400000 AND actual_price IS NOT NULL))
          GROUP BY target_time
        ) p2 ON p1.target_time = p2.target_time
            AND p1.prediction_time = p2.max_prediction_time
        WHERE p1.symbol = ?
          AND p1.interval = ?
          AND p1.ai_provider = ?
        ORDER BY p1.target_time ASC
        LIMIT 50
      `;

      this.db.all(query, [
        symbol, interval, aiProvider, currentTime, currentTime,
        symbol, interval, aiProvider
      ], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Generate predictions using a specific AI provider or statistical model
   * @param {string} provider - AI provider ('gemini', 'gpt', 'claude', 'arima', 'holt_winters')
   * @param {string} prompt - The formatted prompt (not used for statistical models)
   * @returns {Promise<string>} AI response text or statistical model identifier
   */
  async generateWithProvider(provider, prompt, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      switch (provider) {
        case 'arima':
          // Statistical ARIMA model - no external API call needed
          return 'statistical_model_arima';
          
        case 'holt_winters':
          // Statistical Holt-Winters model - no external API call needed
          return 'statistical_model_holt_winters';
          
        case 'gpt':
          if (!this.openai) {
            throw new Error('OpenAI API key not configured');
          }
          const openaiResponse = await this.openai.responses.create({
            model: 'o4-mini',
            reasoning: { effort: 'high' },
            input: [
              {
                role: 'system',
                content: 'You are an expert financial analyst, specializing in time series forecasting. Respond only with valid JSON containing exactly 24 predictions.'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          });
          return openaiResponse.output_text;

        case 'claude':
          if (!this.anthropic) {
            throw new Error('Anthropic API key not configured');
          }
          const claudeResponse = await this.anthropic.messages.create({
            model: 'claude-3-7-sonnet-latest',
            temperature: 0.7,
            max_tokens: 12000,
            system: 'You are an expert financial analyst, specializing in time series forecasting. Respond only with valid JSON containing exactly 24 predictions.',
            messages: [
              {
                role: 'user',
                content: prompt
              }
            ]
          });
          return claudeResponse.content[0].text;

        case 'gemini':
        default:
          if (!this.geminiModel) {
            throw new Error('Gemini API key not configured');
          }
          // Configure Gemini with generation config for more consistent output
          const generationConfig = {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 60000
          };
          
          const result = await this.geminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig,
          });
          const response = await result.response;
          const text = response.text();
          
          // Validate that Gemini returned a response
          if (!text || text.trim().length === 0) {
            throw new Error('Gemini returned empty response');
          }
          
          return text;
      }
    } catch (error) {
      console.error(`Error with ${provider} (attempt ${retryCount + 1}/${maxRetries + 1}):`, error.message);
      
      // Retry logic for transient errors
      if (retryCount < maxRetries) {
        console.log(`Retrying ${provider} after ${(retryCount + 1) * 2} seconds...`);
        await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 2000));
        return this.generateWithProvider(provider, prompt, retryCount + 1);
      }
      
      // If all retries failed, throw the error
      throw error;
    }
  }

  /**
   * Generate predictions for a cryptocurrency
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'BTC', 'ETH')
   * @param {string} interval - Time interval ('1h', '4h', '1d')
   * @param {string} aiProvider - AI provider ('gemini', 'gpt', 'claude', 'arima', 'holt_winters')
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @param {number} predictionsCount - Number of predictions to generate (default: 24)
   * @returns {Promise<Object>} Prediction results
   */
  async generatePredictions(symbol, interval, aiProvider = 'gemini', maxRetries = 3, predictionsCount = 24) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔮 Generating ${predictionsCount} predictions for ${symbol} (${interval}) using ${aiProvider.toUpperCase()}...${attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries + 1})` : ''}`);

        // Fetch latest 500 kline data points
        const klineData = await this.fetchKlineData(symbol, interval, 500);
        if (!klineData || klineData.length === 0) {
          throw new Error('No historical data available');
        }

        // Fetch existing future predictions for context
        const existingPredictions = await this.getExistingFuturePredictions(symbol, interval, aiProvider);

        // Fetch latest technical indicators
        const indicators = await this.fetchTechnicalIndicators(symbol, interval);

        // Read sentiment data from file
        const sentimentData = await this.readSentimentData();

        // Calculate the starting timestamp for new predictions
        const nextTimestamp = this.calculateNextTimestamp(interval, existingPredictions, klineData);

        let predictions;
        
        // Handle statistical models differently from AI providers
        if (aiProvider === 'arima' || aiProvider === 'holt_winters') {
          console.log(`📊 Generating predictions using ${aiProvider.toUpperCase()} statistical model...`);
          
          // Generate predictions using statistical models
          if (aiProvider === 'arima') {
            const arimaResults = this.statisticalModels.generateARIMAPredictions(klineData, interval, predictionsCount);
            predictions = { predictions: arimaResults };
          } else if (aiProvider === 'holt_winters') {
            const hwResults = this.statisticalModels.generateHoltWintersPredictions(klineData, interval, predictionsCount);
            predictions = { predictions: hwResults };
          }
          
          // Validate statistical model predictions
          if (!this.statisticalModels.validatePredictions(predictions.predictions)) {
            throw new Error(`Invalid predictions generated by ${aiProvider} statistical model`);
          }
          
          console.log(`✅ Generated ${predictions.predictions.length} predictions using ${aiProvider.toUpperCase()} model`);
        } else {
          // Handle AI providers
          // Format prompt with existing predictions context
          const prompt = formatPredictionPrompt(
            symbol,
            interval,
            klineData,
            indicators,
            sentimentData,
            existingPredictions,
            predictionsCount,
            nextTimestamp
          );

          const text = await this.generateWithProvider(aiProvider, prompt);
          
          // Parse and validate response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error(`No JSON structure found in ${aiProvider} response`);
          }
          
          predictions = JSON.parse(jsonMatch[0]);
        }

        // Validate predictions format
        if (!predictions || typeof predictions !== 'object' || !Array.isArray(predictions.predictions)) {
          throw new Error(`Invalid prediction format from ${aiProvider}`);
        }
        
        // Ensure each prediction has required fields
        const validPredictions = predictions.predictions.every(pred =>
          pred.hasOwnProperty('timestamp') &&
          pred.hasOwnProperty('price') &&
          typeof pred.timestamp === 'number' &&
          typeof pred.price === 'number' &&
          pred.price > 0
        );
        
        if (!validPredictions) {
          throw new Error(`Invalid prediction data from ${aiProvider}`);
        }

        // Store predictions in database with AI provider
        const predictionTime = Date.now();
        await this.storePredictions(symbol, interval, predictionTime, predictions.predictions, aiProvider);

        const finalCount = predictions.predictions.length;
        console.log(`✅ Generated ${finalCount} predictions for ${symbol} (${interval}) using ${aiProvider.toUpperCase()}`);
        
        return {
          success: true,
          symbol,
          interval,
          aiProvider,
          predictionTime,
          predictions: predictions.predictions,
          isPartial: false,
          requestedCount: predictionsCount,
          actualCount: finalCount
        };

      } catch (error) {
        lastError = error;
        console.error(`Error generating predictions for ${symbol} with ${aiProvider} (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
        
        // If this isn't the last attempt, wait with exponential backoff
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
          console.log(`⏳ Waiting ${waitTime / 1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // All attempts failed
    console.error(`❌ Failed to generate predictions for ${symbol} with ${aiProvider} after ${maxRetries + 1} attempts`);
    return {
      success: false,
      error: lastError.message
    };
  }

  /**
   * Count existing future predictions for a symbol/interval/provider
   */
  async countFuturePredictions(symbol, interval, aiProvider) {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      const query = `
        SELECT COUNT(*) as count
        FROM predictions
        WHERE symbol = ?
          AND interval = ?
          AND ai_provider = ?
          AND target_time > ?
      `;

      this.db.get(query, [symbol, interval, aiProvider, currentTime], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }

  /**
   * Get existing future predictions for context
   */
  async getExistingFuturePredictions(symbol, interval, aiProvider) {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      
      const query = `
        SELECT
          p1.target_time,
          p1.predicted_price
        FROM predictions p1
        INNER JOIN (
          SELECT
            target_time,
            MAX(prediction_time) as max_prediction_time
          FROM predictions
          WHERE symbol = ?
            AND interval = ?
            AND ai_provider = ?
            AND target_time > ?
          GROUP BY target_time
        ) p2 ON p1.target_time = p2.target_time
            AND p1.prediction_time = p2.max_prediction_time
        WHERE p1.symbol = ?
          AND p1.interval = ?
          AND p1.ai_provider = ?
        ORDER BY p1.target_time ASC
      `;

      this.db.all(query, [
        symbol, interval, aiProvider, currentTime,
        symbol, interval, aiProvider
      ], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Calculate the next timestamp for new predictions
   */
  calculateNextTimestamp(interval, existingPredictions, klineData) {
    const intervalHours = interval === '1h' ? 1 : interval === '4h' ? 4 : 24;
    const intervalMs = intervalHours * 3600 * 1000;

    if (existingPredictions.length > 0) {
      const lastTimestamp = Math.max(...existingPredictions.map(p => p.target_time));
      return lastTimestamp + intervalMs;
    } else {
      const lastHistoricalTimestamp = klineData[klineData.length - 1].timestamp;
      return lastHistoricalTimestamp + intervalMs;
    }
  }

  /**
   * Generate rolling predictions (only missing ones)
   */
  async generateRollingPredictions(symbol, interval, aiProvider = 'gemini', maxRetries = 3) {
    try {
      console.log(`🔄 Checking rolling predictions for ${symbol} (${interval}) using ${aiProvider.toUpperCase()}...`);

      const existingCount = await this.countFuturePredictions(symbol, interval, aiProvider);
      const predictionsNeeded = Math.max(0, 24 - existingCount);

      console.log(`📊 Found ${existingCount} existing future predictions, need ${predictionsNeeded} more`);

      if (predictionsNeeded === 0) {
        console.log(`✅ Already have 24 future predictions for ${symbol} (${interval}), no rolling needed`);
        return {
          success: true,
          symbol,
          interval,
          aiProvider,
          predictionsNeeded: 0,
          generated: 0,
          message: 'No new predictions needed'
        };
      }

      const result = await this.generatePredictions(symbol, interval, aiProvider, maxRetries, predictionsNeeded);
      
      if (result.success) {
        console.log(`✅ Rolling predictions completed for ${symbol} (${interval}): generated ${predictionsNeeded} new predictions`);
      }

      return {
        ...result,
        predictionsNeeded,
        generated: result.success ? predictionsNeeded : 0
      };

    } catch (error) {
      console.error(`❌ Error in rolling predictions for ${symbol} (${interval}):`, error.message);
      return {
        success: false,
        error: error.message,
        symbol,
        interval,
        aiProvider
      };
    }
  }

  /**
   * Fetch historical kline data from database
   */
  fetchKlineData(symbol, interval, limit) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT open_time as timestamp, open, high, low, close, volume
        FROM kline_data
        WHERE symbol = ? AND interval = ?
        ORDER BY open_time DESC
        LIMIT ?
      `;

      this.db.all(query, [symbol, interval, limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.reverse());
        }
      });
    });
  }

  /**
   * Fetch technical indicators from database
   */
  fetchTechnicalIndicators(symbol, interval) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT timestamp, sma_20, sma_50, rsi_14, macd, macd_signal, macd_histogram
        FROM technical_indicators
        WHERE symbol = ? AND interval = ?
        ORDER BY timestamp DESC
        LIMIT 10
      `;

      this.db.all(query, [symbol, interval], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Read sentiment data from file
   */
  async readSentimentData() {
    try {
      const data = await fs.readFile(this.sentimentDataFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading sentiment data:', error.message);
      return null;
    }
  }

  /**
   * Store predictions in database
   */
  storePredictions(symbol, interval, predictionTime, predictions, aiProvider = 'gemini') {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO predictions
        (symbol, interval, prediction_time, target_time, predicted_price, model_version, ai_provider)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      let completed = 0;
      let hasError = false;
      let skipped = 0;

      // Map provider to model version
      const modelVersions = {
        'gemini': 'gemini-2.5-pro-preview-05-06',
        'gpt': 'o4-mini',
        'claude': 'claude-3-7-sonnet-latest',
        'arima': 'arima-statistical-model',
        'holt_winters': 'holt-winters-statistical-model'
      };

      predictions.forEach(pred => {
        stmt.run(
          symbol,
          interval,
          predictionTime,
          pred.timestamp,
          pred.price,
          modelVersions[aiProvider] || modelVersions['gemini'],
          aiProvider,
          function(err) {
            if (err && !hasError) {
              hasError = true;
              stmt.finalize();
              reject(err);
              return;
            }
            
            if (this.changes === 0) {
              skipped++;
              console.warn(`⚠️ Duplicate prediction skipped: ${symbol} ${interval} at ${new Date(pred.timestamp).toISOString()}`);
            }
            
            completed++;
            if (completed === predictions.length && !hasError) {
              stmt.finalize();
              if (skipped > 0) {
                console.log(`✅ Stored ${predictions.length - skipped} new predictions, skipped ${skipped} duplicates for ${symbol} (${interval})`);
              }
              resolve();
            }
          }
        );
      });
    });
  }

  /**
   * Get accuracy metrics for a symbol/interval
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @returns {Promise<Object>} Accuracy metrics
   */
  async getAccuracyMetrics(symbol, interval) {
    return new Promise((resolve, reject) => {
      // First try to get from prediction_metrics table
      const metricsQuery = `
        SELECT
          accuracy_percentage as overall_accuracy,
          predictions_count as total_predictions,
          ROUND(predictions_count * accuracy_percentage / 100) as accurate_predictions
        FROM prediction_metrics
        WHERE symbol = ? AND interval = ?
        ORDER BY date DESC
        LIMIT 1
      `;

      this.db.get(metricsQuery, [symbol, interval], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve(row);
        } else {
          // If no metrics in table, calculate from predictions
          const calcQuery = `
            SELECT
              COUNT(*) as total_predictions,
              SUM(CASE WHEN ABS(predicted_price - actual_price) / actual_price <= 0.05 THEN 1 ELSE 0 END) as accurate_predictions
            FROM predictions
            WHERE symbol = ?
              AND interval = ?
              AND actual_price IS NOT NULL
          `;

          this.db.get(calcQuery, [symbol, interval], (err, calcRow) => {
            if (err) {
              reject(err);
            } else if (calcRow && calcRow.total_predictions > 0) {
              const overall_accuracy = (calcRow.accurate_predictions / calcRow.total_predictions) * 100;
              resolve({
                overall_accuracy,
                total_predictions: calcRow.total_predictions,
                accurate_predictions: calcRow.accurate_predictions
              });
            } else {
              resolve({
                overall_accuracy: 0,
                total_predictions: 0,
                accurate_predictions: 0
              });
            }
          });
        }
      });
    });
  }

  /**
   * Update actual prices for predictions
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @returns {Promise<Object>} Update result
   */
  async updateActualPrices(symbol, interval) {
    try {
      console.log(`📊 Updating actual prices for ${symbol} (${interval}) predictions...`);

      // Get predictions that need actual price updates
      const predictions = await this.getPredictionsNeedingUpdate(symbol, interval);
      
      if (predictions.length === 0) {
        console.log(`No predictions need updating for ${symbol} (${interval})`);
        return { updated: 0 };
      }

      let updated = 0;
      
      for (const prediction of predictions) {
        // Fetch actual price for the target time
        const actualPrice = await this.getActualPrice(symbol, interval, prediction.target_time);
        
        if (actualPrice !== null) {
          // Calculate accuracy score (percentage error)
          const error = Math.abs(prediction.predicted_price - actualPrice) / actualPrice;
          const accuracyScore = Math.max(0, 1 - error) * 100;
          
          // Update prediction with actual price and accuracy
          await this.updatePrediction(
            prediction.id,
            actualPrice,
            accuracyScore
          );
          
          updated++;
        }
      }

      console.log(`✅ Updated ${updated} predictions with actual prices for ${symbol} (${interval})`);
      
      return { updated };

    } catch (error) {
      console.error(`Error updating actual prices for ${symbol}:`, error);
      return { error: error.message };
    }
  }

  /**
   * Get predictions that need actual price updates
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @returns {Promise<Array>} Predictions needing update
   */
  getPredictionsNeedingUpdate(symbol, interval) {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      const query = `
        SELECT id, target_time, predicted_price
        FROM predictions
        WHERE symbol = ?
          AND interval = ?
          AND target_time <= ?
          AND actual_price IS NULL
        ORDER BY target_time ASC
        LIMIT 100
      `;

      this.db.all(query, [symbol, interval, currentTime], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  /**
   * Get actual price for a specific timestamp
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {number} targetTime - Target timestamp
   * @returns {Promise<number|null>} Actual price or null
   */
  async getActualPrice(symbol, interval, targetTime) {
    try {
      const response = await fetch(`http://localhost:3000/api/klines/${symbol}/${interval}?limit=1&startTime=${targetTime}&endTime=${targetTime + 60000}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          return data[0].close;
        }
      }
    } catch (error) {
      console.error(`Error fetching actual price for ${symbol} at ${targetTime}:`, error);
    }
    return null;
  }

  /**
   * Update prediction with actual price and accuracy
   * @param {number} predictionId - Prediction ID
   * @param {number} actualPrice - Actual price
   * @param {number} accuracyScore - Accuracy score
   * @returns {Promise<void>}
   */
  updatePrediction(predictionId, actualPrice, accuracyScore) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE predictions
        SET actual_price = ?, accuracy_score = ?
        WHERE id = ?
      `;

      this.db.run(query, [actualPrice, accuracyScore, predictionId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = PredictionService;
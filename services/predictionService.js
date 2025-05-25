const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');
const { formatPredictionPrompt, validatePredictionResponse } = require('../utils/predictionPrompt');

class PredictionService {
  constructor() {
    this.db = new sqlite3.Database('./crypto_data.db');
    
    // Initialize AI providers
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.geminiModel = this.genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-05-06' });
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    this.sentimentDataFile = path.join(__dirname, '..', 'sentiment-data.json');
  }

  /**
   * Get predictions for a symbol/interval/provider
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {string} aiProvider - AI provider (gemini, gpt, claude)
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
   * Generate predictions using a specific AI provider
   * @param {string} provider - AI provider ('gemini', 'gpt', 'claude')
   * @param {string} prompt - The formatted prompt
   * @returns {Promise<string>} AI response text
   */
  async generateWithProvider(provider, prompt, retryCount = 0) {
    const maxRetries = 3;
    
    try {
      switch (provider) {
        case 'gpt':
          const openaiResponse = await this.openai.responses.create({
            model: 'o4-mini',
            reasoning: { effort: 'medium' },
            input: [
              {
                role: 'system',
                content: 'You are a cryptocurrency price prediction expert. Respond only with valid JSON containing exactly 24 predictions.'
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          });
          return openaiResponse.output_text;

        case 'claude':
          const claudeResponse = await this.anthropic.messages.create({
            model: 'claude-3-7-sonnet-latest',
            max_tokens: 8000, // Significantly increased for 24 predictions
            temperature: 0.7,
            system: 'You are a cryptocurrency price prediction expert. Respond only with valid JSON containing exactly 24 predictions.',
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
          // Configure Gemini with generation config for more consistent output
          const generationConfig = {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192, // Significantly increased for 24 predictions
          };
          
          const result = await this.geminiModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig,
          });
          const response = await result.response;
          const text = response.text();
          
          // Validate that Gemini returned JSON
          if (!text || text.trim().length === 0) {
            throw new Error('Gemini returned empty response');
          }
          
          // Check if response contains JSON
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.error(`Gemini response without JSON (attempt ${retryCount + 1}/${maxRetries + 1}):`, text);
            throw new Error('Gemini response does not contain valid JSON');
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
   * Generate predictions for a cryptocurrency with exponential backoff retry
   * @param {string} symbol - Cryptocurrency symbol (e.g., 'BTC', 'ETH')
   * @param {string} interval - Time interval ('1h', '4h', '1d')
   * @param {string} aiProvider - AI provider ('gemini', 'gpt', 'claude')
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @returns {Promise<Object>} Prediction results
   */
  async generatePredictions(symbol, interval, aiProvider = 'gemini', maxRetries = 3, predictionsCount = 24) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔮 Generating ${predictionsCount} predictions for ${symbol} (${interval}) using ${aiProvider.toUpperCase()}...${attempt > 0 ? ` (attempt ${attempt + 1}/${maxRetries + 1})` : ''}`);

        // Fetch latest 100 kline data points
        const klineData = await this.fetchKlineData(symbol, interval, 100);
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

        // Generate predictions using selected AI provider with retry logic
        let text;
        let predictions;
        
        try {
          text = await this.generateWithProvider(aiProvider, prompt);
          
          // Parse and validate response
          try {
            // Extract JSON from response (in case there's extra text)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
              throw new Error('No JSON found in response');
            }
            predictions = JSON.parse(jsonMatch[0]);
          } catch (parseError) {
            console.error(`Failed to parse ${aiProvider} response:`, text);
            throw new Error(`Invalid response format: ${parseError.message}`);
          }
        } catch (error) {
          // Log the error with more context
          console.error(`Failed to generate predictions with ${aiProvider}:`, error.message);
          
          // For Gemini specifically, provide more detailed error info
          if (aiProvider === 'gemini') {
            console.error('Gemini API failed to return valid JSON. This may be a temporary issue.');
            console.error('Consider trying again or using a different AI provider.');
          }
          
          throw error;
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
        
        // Check if we got the expected number of predictions
        if (predictions.predictions.length < predictionsCount) {
          console.warn(`⚠️ ${aiProvider} returned only ${predictions.predictions.length} predictions instead of ${predictionsCount} for ${symbol} (${interval})`);
          
          // If we got less than 80% of requested predictions, consider it a failure and retry
          const minAcceptable = Math.ceil(predictionsCount * 0.8);
          if (predictions.predictions.length < minAcceptable) {
            throw new Error(`Insufficient predictions returned: ${predictions.predictions.length}/${predictionsCount}`);
          }
        }

        // Store predictions in database with AI provider
        const predictionTime = Date.now();
        await this.storePredictions(symbol, interval, predictionTime, predictions.predictions, aiProvider);

        console.log(`✅ Generated ${predictions.predictions.length} predictions for ${symbol} (${interval}) using ${aiProvider.toUpperCase()}`);
        
        return {
          success: true,
          symbol,
          interval,
          aiProvider,
          predictionTime,
          predictions: predictions.predictions
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
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {string} aiProvider - AI provider
   * @returns {Promise<number>} Number of existing future predictions
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
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {string} aiProvider - AI provider
   * @returns {Promise<Array>} Array of existing future predictions
   */
  async getExistingFuturePredictions(symbol, interval, aiProvider) {
    return new Promise((resolve, reject) => {
      const currentTime = Date.now();
      
      // Get the most recent prediction for each future target_time
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
   * @param {string} interval - Time interval
   * @param {Array} existingPredictions - Existing future predictions
   * @param {Array} klineData - Historical kline data
   * @returns {number} Next timestamp for predictions
   */
  calculateNextTimestamp(interval, existingPredictions, klineData) {
    const intervalHours = interval === '1h' ? 1 : interval === '4h' ? 4 : 24;
    const intervalMs = intervalHours * 3600 * 1000;

    if (existingPredictions.length > 0) {
      // Start from the last existing prediction timestamp
      const lastTimestamp = Math.max(...existingPredictions.map(p => p.target_time));
      return lastTimestamp + intervalMs;
    } else {
      // Start from the last historical data point
      const lastHistoricalTimestamp = klineData[klineData.length - 1].timestamp;
      return lastHistoricalTimestamp + intervalMs;
    }
  }

  /**
   * Generate rolling predictions (only missing ones)
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {string} aiProvider - AI provider
   * @param {number} maxRetries - Maximum number of retries
   * @returns {Promise<Object>} Rolling prediction results
   */
  async generateRollingPredictions(symbol, interval, aiProvider = 'gemini', maxRetries = 3) {
    try {
      console.log(`🔄 Checking rolling predictions for ${symbol} (${interval}) using ${aiProvider.toUpperCase()}...`);

      // Count existing future predictions
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

      // Generate the missing predictions
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
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {number} limit - Number of data points to fetch
   * @returns {Promise<Array>} Kline data
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
          // Reverse to get chronological order
          resolve(rows.reverse());
        }
      });
    });
  }

  /**
   * Fetch technical indicators from database
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @returns {Promise<Array>} Technical indicators
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
   * @returns {Promise<Object>} Sentiment data
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
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {number} predictionTime - Timestamp when prediction was made
   * @param {Array} predictions - Array of predictions
   * @param {string} aiProvider - AI provider ('gemini', 'gpt', 'claude')
   * @returns {Promise<void>}
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
        'claude': 'claude-3-7-sonnet-latest'
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
            
            // Check if row was actually inserted (changes will be 0 if ignored)
            if (this.changes === 0) {
              skipped++;
              console.warn(`⚠️ Duplicate prediction skipped: ${symbol} ${interval} at ${new Date(pred.timestamp).toISOString()} - preserving historical data`);
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
   * Update predictions with actual prices when available
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @returns {Promise<Object>} Update results
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
      
      // Calculate and store daily metrics
      await this.calculateDailyMetrics(symbol, interval);
      
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
        SELECT id, target_time, predicted_price, ai_provider
        FROM predictions
        WHERE symbol = ?
          AND interval = ?
          AND actual_price IS NULL
          AND target_time <= ?
        ORDER BY target_time
        LIMIT 300
      `;

      this.db.all(query, [symbol, interval, currentTime], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get actual price for a specific timestamp
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {number} timestamp - Target timestamp
   * @returns {Promise<number|null>} Actual price or null
   */
  getActualPrice(symbol, interval, timestamp) {
    return new Promise((resolve, reject) => {
      // Allow for some time tolerance (within the interval period)
      const tolerance = interval === '1h' ? 3600000 : interval === '4h' ? 14400000 : 86400000;
      
      const query = `
        SELECT close
        FROM kline_data
        WHERE symbol = ?
          AND interval = ?
          AND open_time >= ?
          AND open_time <= ?
        ORDER BY ABS(open_time - ?)
        LIMIT 1
      `;

      this.db.get(
        query, 
        [symbol, interval, timestamp - tolerance, timestamp + tolerance, timestamp],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row ? row.close : null);
          }
        }
      );
    });
  }

  /**
   * Update prediction with actual price and accuracy
   * @param {number} predictionId - Prediction ID
   * @param {number} actualPrice - Actual price
   * @param {number} accuracyScore - Accuracy score (0-100)
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
   * Calculate accuracy metrics for predictions
   * @param {string} symbol - Cryptocurrency symbol (optional)
   * @param {string} interval - Time interval (optional)
   * @returns {Promise<Object>} Accuracy metrics
   */
  async calculateAccuracy(symbol = null, interval = null) {
    try {
      console.log(`📈 Calculating accuracy metrics...`);

      const metrics = await this.getAccuracyMetrics(symbol, interval);
      
      if (!metrics || metrics.count === 0) {
        return {
          message: 'No completed predictions available for accuracy calculation',
          metrics: null
        };
      }

      const result = {
        totalPredictions: metrics.count,
        averageAccuracy: parseFloat(metrics.avg_accuracy).toFixed(2),
        mae: parseFloat(metrics.mae).toFixed(2),
        rmse: parseFloat(metrics.rmse).toFixed(2),
        mape: parseFloat(metrics.mape).toFixed(2)
      };

      if (symbol) result.symbol = symbol;
      if (interval) result.interval = interval;

      console.log(`✅ Accuracy metrics calculated:`, result);
      
      return result;

    } catch (error) {
      console.error('Error calculating accuracy:', error);
      return { error: error.message };
    }
  }

  /**
   * Get accuracy metrics from database
   * @param {string} symbol - Cryptocurrency symbol (optional)
   * @param {string} interval - Time interval (optional)
   * @returns {Promise<Object>} Metrics data
   */
  getAccuracyMetrics(symbol, interval) {
    return new Promise((resolve, reject) => {
      let query = `
        SELECT 
          COUNT(*) as count,
          AVG(accuracy_score) as avg_accuracy,
          AVG(ABS(predicted_price - actual_price)) as mae,
          SQRT(AVG((predicted_price - actual_price) * (predicted_price - actual_price))) as rmse,
          AVG(ABS(predicted_price - actual_price) / actual_price * 100) as mape
        FROM predictions
        WHERE actual_price IS NOT NULL
      `;

      const params = [];
      
      if (symbol) {
        query += ' AND symbol = ?';
        params.push(symbol);
      }
      
      if (interval) {
        query += ' AND interval = ?';
        params.push(interval);
      }

      this.db.get(query, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Calculate and store daily metrics
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @returns {Promise<void>}
   */
  async calculateDailyMetrics(symbol, interval) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const metrics = await this.getDailyMetrics(symbol, interval, today);
      
      if (metrics && metrics.count > 0) {
        await this.storeDailyMetrics(
          symbol,
          interval,
          today,
          metrics.mae,
          metrics.rmse,
          metrics.avg_accuracy,
          metrics.count
        );
      }
    } catch (error) {
      console.error('Error calculating daily metrics:', error);
    }
  }

  /**
   * Get daily metrics from predictions
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Object>} Daily metrics
   */
  getDailyMetrics(symbol, interval, date) {
    return new Promise((resolve, reject) => {
      const startTime = new Date(date).getTime();
      const endTime = startTime + 86400000; // +24 hours

      const query = `
        SELECT 
          COUNT(*) as count,
          AVG(accuracy_score) as avg_accuracy,
          AVG(ABS(predicted_price - actual_price)) as mae,
          SQRT(AVG((predicted_price - actual_price) * (predicted_price - actual_price))) as rmse
        FROM predictions
        WHERE symbol = ?
          AND interval = ?
          AND actual_price IS NOT NULL
          AND target_time >= ?
          AND target_time < ?
      `;

      this.db.get(query, [symbol, interval, startTime, endTime], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Store daily metrics in database
   * @param {string} symbol - Cryptocurrency symbol
   * @param {string} interval - Time interval
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} mae - Mean Absolute Error
   * @param {number} rmse - Root Mean Square Error
   * @param {number} accuracy - Average accuracy percentage
   * @param {number} count - Number of predictions
   * @returns {Promise<void>}
   */
  storeDailyMetrics(symbol, interval, date, mae, rmse, accuracy, count) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT OR REPLACE INTO prediction_metrics
        (symbol, interval, date, mae, rmse, accuracy_percentage, predictions_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(
        query,
        [symbol, interval, date, mae, rmse, accuracy, count],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
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
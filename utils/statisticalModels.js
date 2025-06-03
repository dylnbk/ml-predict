/**
 * Statistical Models for Cryptocurrency Price Prediction
 * Implements ARIMA and Holt-Winters models for deterministic forecasting
 */

class StatisticalModels {
  constructor() {
    // Time interval mappings in milliseconds
    this.intervalMs = {
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000
    };
  }

  /**
   * Generate ARIMA predictions
   * @param {Array} historicalData - Array of kline data with {timestamp, close} format
   * @param {string} interval - Time interval ('1h', '4h', '1d')
   * @param {number} forecastPeriods - Number of future predictions (default 24)
   * @returns {Array} Array of {timestamp, price} predictions
   */
  generateARIMAPredictions(historicalData, interval, forecastPeriods = 24) {
    if (!historicalData || historicalData.length < 10) {
      throw new Error('Insufficient historical data for ARIMA model (minimum 10 points required)');
    }

    // Extract closing prices
    const prices = historicalData.map(d => d.close);
    const timestamps = historicalData.map(d => d.timestamp);
    
    // ARIMA(1,1,1) implementation - simplified but effective
    const arimaParams = this.fitARIMA(prices);
    
    // Generate forecasts
    const predictions = [];
    const intervalMsValue = this.intervalMs[interval];
    const lastTimestamp = timestamps[timestamps.length - 1];
    
    // Use the last few prices for initial forecast
    let lastPrices = prices.slice(-3); // Use last 3 prices for momentum
    
    for (let i = 0; i < forecastPeriods; i++) {
      const nextTimestamp = lastTimestamp + (i + 1) * intervalMsValue;
      const predictedPrice = this.arimaForecast(lastPrices, arimaParams, i);
      
      predictions.push({
        timestamp: nextTimestamp,
        price: Math.max(predictedPrice, 0.01) // Ensure positive price
      });
      
      // Update lastPrices for next iteration (sliding window)
      lastPrices = [...lastPrices.slice(1), predictedPrice];
    }
    
    return predictions;
  }

  /**
   * Generate Holt-Winters predictions
   * @param {Array} historicalData - Array of kline data with {timestamp, close} format
   * @param {string} interval - Time interval ('1h', '4h', '1d')
   * @param {number} forecastPeriods - Number of future predictions (default 24)
   * @returns {Array} Array of {timestamp, price} predictions
   */
  generateHoltWintersPredictions(historicalData, interval, forecastPeriods = 24) {
    if (!historicalData || historicalData.length < 24) {
      throw new Error('Insufficient historical data for Holt-Winters model (minimum 24 points required)');
    }

    // Extract closing prices
    const prices = historicalData.map(d => d.close);
    const timestamps = historicalData.map(d => d.timestamp);
    
    // Determine seasonality based on interval
    const seasonLength = this.getSeasonLength(interval);
    
    // Fit Holt-Winters model
    const hwParams = this.fitHoltWinters(prices, seasonLength);
    
    // Generate forecasts
    const predictions = [];
    const intervalMsValue = this.intervalMs[interval];
    const lastTimestamp = timestamps[timestamps.length - 1];
    
    for (let i = 0; i < forecastPeriods; i++) {
      const nextTimestamp = lastTimestamp + (i + 1) * intervalMsValue;
      const predictedPrice = this.holtWintersForecast(hwParams, i, seasonLength);
      
      predictions.push({
        timestamp: nextTimestamp,
        price: Math.max(predictedPrice, 0.01) // Ensure positive price
      });
    }
    
    return predictions;
  }

  /**
   * Fit ARIMA(1,1,1) model parameters
   * @param {Array} prices - Array of price values
   * @returns {Object} ARIMA parameters {ar, ma, trend}
   */
  fitARIMA(prices) {
    // Use log prices for better stability with crypto volatility
    const logPrices = prices.map(p => Math.log(p));
    
    // First difference to make series stationary
    const diff = [];
    for (let i = 1; i < logPrices.length; i++) {
      diff.push(logPrices[i] - logPrices[i - 1]);
    }
    
    // Calculate moving averages for better parameter estimation
    const shortMA = this.calculateMovingAverage(prices.slice(-20), 5);
    const longMA = this.calculateMovingAverage(prices.slice(-50), 20);
    
    // Improved AR coefficient using autocorrelation
    const arCoeff = this.calculateAutocorrelation(diff, 1);
    
    // MA coefficient using residual analysis
    const residuals = [];
    for (let i = 1; i < diff.length; i++) {
      const predicted = arCoeff * diff[i - 1];
      residuals.push(diff[i] - predicted);
    }
    const maCoeff = residuals.length > 1 ? this.calculateAutocorrelation(residuals, 1) : 0.1;
    
    // Enhanced trend calculation using multiple timeframes
    const shortTrend = this.calculateTrend(prices.slice(-10));
    const mediumTrend = this.calculateTrend(prices.slice(-20));
    const longTrend = this.calculateTrend(prices.slice(-50));
    
    // Weighted trend (more weight on recent trends)
    const trend = (shortTrend * 0.5 + mediumTrend * 0.3 + longTrend * 0.2) * 0.3;
    
    // Volatility estimation for better forecasting
    const volatility = this.calculateVolatility(diff);
    
    // Mean reversion level (recent moving average)
    const meanReversionLevel = this.calculateMovingAverage(prices.slice(-30), 15);
    
    return {
      ar: Math.max(-0.8, Math.min(0.8, arCoeff)),
      ma: Math.max(-0.8, Math.min(0.8, maCoeff)),
      trend: trend,
      volatility: volatility,
      meanReversionLevel: meanReversionLevel,
      lastDiff: diff[diff.length - 1],
      lastResidual: residuals.length > 0 ? residuals[residuals.length - 1] : 0,
      lastPrice: prices[prices.length - 1],
      shortMA: shortMA,
      longMA: longMA
    };
  }

  /**
   * Generate ARIMA forecast
   * @param {Array} lastPrices - Recent price values
   * @param {Object} params - ARIMA parameters
   * @param {number} step - Forecast step (0-based)
   * @returns {number} Predicted price
   */
  arimaForecast(lastPrices, params, step) {
    const { ar, ma, trend, volatility, meanReversionLevel, lastDiff, lastResidual, lastPrice, shortMA, longMA } = params;
    
    // Base forecast using ARIMA components
    let forecast;
    
    if (step === 0) {
      // First step: use AR and MA components directly
      const diffForecast = ar * lastDiff + ma * lastResidual;
      forecast = lastPrice * Math.exp(diffForecast);
    } else {
      // Subsequent steps: combine multiple components
      const basePrice = lastPrices[lastPrices.length - 1];
      
      // Trend component with decay
      const decayFactor = Math.pow(0.92, step); // Slightly faster decay for crypto
      const trendComponent = trend * step * decayFactor;
      
      // Mean reversion to moving average
      const meanReversionStrength = Math.min(0.3, step * 0.05); // Stronger over time
      const meanReversionTarget = (shortMA + longMA) / 2; // Average of short and long MA
      const meanReversionComponent = (meanReversionTarget - basePrice) * meanReversionStrength;
      
      // Momentum component based on recent price action
      const momentum = this.calculateMomentum(lastPrices);
      const momentumComponent = momentum * Math.pow(0.8, step);
      
      // Volatility-adjusted random walk
      const volatilityComponent = volatility * Math.sqrt(step) * (Math.random() - 0.5) * 0.5;
      
      // Support/Resistance levels
      const supportResistanceComponent = this.calculateSupportResistance(lastPrices, step);
      
      forecast = basePrice + trendComponent + meanReversionComponent + momentumComponent + volatilityComponent + supportResistanceComponent;
    }
    
    // Ensure reasonable bounds (no more than 20% change per step for stability)
    const maxChange = lastPrice * 0.2;
    forecast = Math.max(lastPrice - maxChange, Math.min(lastPrice + maxChange, forecast));
    
    return Math.max(forecast, 0.01); // Ensure positive price
  }

  /**
   * Fit Holt-Winters model parameters
   * @param {Array} prices - Array of price values
   * @param {number} seasonLength - Length of seasonal cycle
   * @returns {Object} Holt-Winters parameters and components
   */
  fitHoltWinters(prices, seasonLength) {
    // Smoothing parameters (optimized for crypto volatility)
    const alpha = 0.3; // Level smoothing
    const beta = 0.1;  // Trend smoothing
    const gamma = 0.2; // Seasonal smoothing
    
    // Initialize components
    const level = [];
    const trend = [];
    const seasonal = new Array(seasonLength).fill(1);
    
    // Initial level (average of first season)
    const firstSeasonSum = prices.slice(0, Math.min(seasonLength, prices.length))
      .reduce((sum, p) => sum + p, 0);
    level[0] = firstSeasonSum / Math.min(seasonLength, prices.length);
    
    // Initial trend (slope of first two seasons if available)
    if (prices.length >= 2 * seasonLength) {
      const firstSeasonAvg = prices.slice(0, seasonLength)
        .reduce((sum, p) => sum + p, 0) / seasonLength;
      const secondSeasonAvg = prices.slice(seasonLength, 2 * seasonLength)
        .reduce((sum, p) => sum + p, 0) / seasonLength;
      trend[0] = (secondSeasonAvg - firstSeasonAvg) / seasonLength;
    } else {
      trend[0] = 0;
    }
    
    // Initialize seasonal components
    if (prices.length >= seasonLength) {
      for (let i = 0; i < seasonLength; i++) {
        if (i < prices.length) {
          seasonal[i] = prices[i] / level[0];
        }
      }
    }
    
    // Fit the model
    for (let t = 1; t < prices.length; t++) {
      const seasonalIndex = (t - 1) % seasonLength;
      
      // Update level
      const newLevel = alpha * (prices[t] / seasonal[seasonalIndex]) + 
                      (1 - alpha) * (level[t - 1] + trend[t - 1]);
      level[t] = newLevel;
      
      // Update trend
      const newTrend = beta * (level[t] - level[t - 1]) + (1 - beta) * trend[t - 1];
      trend[t] = newTrend;
      
      // Update seasonal component
      seasonal[seasonalIndex] = gamma * (prices[t] / level[t]) + 
                               (1 - gamma) * seasonal[seasonalIndex];
    }
    
    return {
      level: level[level.length - 1],
      trend: trend[trend.length - 1],
      seasonal: seasonal,
      seasonLength: seasonLength
    };
  }

  /**
   * Generate Holt-Winters forecast
   * @param {Object} params - Holt-Winters parameters
   * @param {number} step - Forecast step (0-based)
   * @param {number} seasonLength - Length of seasonal cycle
   * @returns {number} Predicted price
   */
  holtWintersForecast(params, step, seasonLength) {
    const { level, trend, seasonal } = params;
    const seasonalIndex = step % seasonLength;
    
    // Forecast formula: (Level + step * Trend) * Seasonal
    const forecast = (level + (step + 1) * trend) * seasonal[seasonalIndex];
    
    return forecast;
  }

  /**
   * Determine seasonal length based on interval
   * @param {string} interval - Time interval
   * @returns {number} Seasonal cycle length
   */
  getSeasonLength(interval) {
    switch (interval) {
      case '1h':
        return 24; // Daily cycle (24 hours)
      case '4h':
        return 6;  // Daily cycle (6 * 4h = 24h)
      case '1d':
        return 7;  // Weekly cycle (7 days)
      default:
        return 12; // Default fallback
    }
  }

  /**
   * Validate prediction data format
   * @param {Array} predictions - Array of predictions
   * @returns {boolean} True if valid format
   */
  validatePredictions(predictions) {
    if (!Array.isArray(predictions) || predictions.length === 0) {
      return false;
    }
    
    return predictions.every(pred => 
      pred.hasOwnProperty('timestamp') &&
      pred.hasOwnProperty('price') &&
      typeof pred.timestamp === 'number' &&
      typeof pred.price === 'number' &&
      pred.price > 0 &&
      pred.timestamp > 0
    );
  }

  /**
   * Add noise to predictions for more realistic variance
   * @param {Array} predictions - Array of predictions
   * @param {number} noiseLevel - Noise level (0.01 = 1%)
   * @returns {Array} Predictions with added noise
   */
  addRealisticNoise(predictions, noiseLevel = 0.005) {
    return predictions.map(pred => ({
      ...pred,
      price: pred.price * (1 + (Math.random() - 0.5) * 2 * noiseLevel)
    }));
  }

  /**
   * Calculate autocorrelation for a given lag
   * @param {Array} series - Time series data
   * @param {number} lag - Lag period
   * @returns {number} Autocorrelation coefficient
   */
  calculateAutocorrelation(series, lag) {
    if (series.length <= lag) return 0;
    
    const mean = series.reduce((sum, val) => sum + val, 0) / series.length;
    let numerator = 0;
    let denominator = 0;
    
    for (let i = lag; i < series.length; i++) {
      numerator += (series[i] - mean) * (series[i - lag] - mean);
    }
    
    for (let i = 0; i < series.length; i++) {
      denominator += Math.pow(series[i] - mean, 2);
    }
    
    return denominator > 0 ? numerator / denominator : 0;
  }

  /**
   * Calculate moving average
   * @param {Array} prices - Price array
   * @param {number} period - Moving average period
   * @returns {number} Moving average value
   */
  calculateMovingAverage(prices, period) {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    
    const recentPrices = prices.slice(-period);
    return recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
  }

  /**
   * Calculate trend using linear regression
   * @param {Array} prices - Price array
   * @returns {number} Trend slope
   */
  calculateTrend(prices) {
    if (prices.length < 2) return 0;
    
    const n = prices.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = prices;
    
    const sumX = x.reduce((sum, val) => sum + val, 0);
    const sumY = y.reduce((sum, val) => sum + val, 0);
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
    const sumXX = x.reduce((sum, val) => sum + val * val, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return isNaN(slope) ? 0 : slope;
  }

  /**
   * Calculate volatility (standard deviation of returns)
   * @param {Array} returns - Array of returns/differences
   * @returns {number} Volatility measure
   */
  calculateVolatility(returns) {
    if (returns.length < 2) return 0.01;
    
    const mean = returns.reduce((sum, val) => sum + val, 0) / returns.length;
    const variance = returns.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate momentum based on recent price changes
   * @param {Array} prices - Recent price array
   * @returns {number} Momentum indicator
   */
  calculateMomentum(prices) {
    if (prices.length < 3) return 0;
    
    const recent = prices.slice(-3);
    const momentum = (recent[recent.length - 1] - recent[0]) / recent[0];
    return momentum * recent[recent.length - 1]; // Scale by current price
  }

  /**
   * Calculate support/resistance influence
   * @param {Array} prices - Price array
   * @param {number} step - Forecast step
   * @returns {number} Support/resistance adjustment
   */
  calculateSupportResistance(prices, step) {
    if (prices.length < 10) return 0;
    
    const currentPrice = prices[prices.length - 1];
    const recentPrices = prices.slice(-20);
    
    // Find recent highs and lows
    const recentHigh = Math.max(...recentPrices);
    const recentLow = Math.min(...recentPrices);
    
    // Calculate distance to support/resistance
    const distanceToResistance = recentHigh - currentPrice;
    const distanceToSupport = currentPrice - recentLow;
    
    // Apply gentle pull towards support/resistance
    let adjustment = 0;
    if (distanceToResistance < distanceToSupport) {
      // Closer to resistance, slight downward pressure
      adjustment = -distanceToResistance * 0.1 / step;
    } else {
      // Closer to support, slight upward pressure
      adjustment = distanceToSupport * 0.1 / step;
    }
    
    return adjustment;
  }
}

module.exports = StatisticalModels;
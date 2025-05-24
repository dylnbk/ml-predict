const sqlite3 = require('sqlite3').verbose();

class TechnicalIndicators {
  constructor(dbPath = './crypto_data.db') {
    this.db = new sqlite3.Database(dbPath);
  }

  /**
   * Calculate Simple Moving Average (SMA)
   * @param {Array} prices - Array of closing prices
   * @param {number} period - Period for SMA calculation
   * @returns {number|null} - SMA value or null if not enough data
   */
  calculateSMA(prices, period) {
    if (prices.length < period) return null;
    
    const relevantPrices = prices.slice(-period);
    const sum = relevantPrices.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  /**
   * Calculate Relative Strength Index (RSI)
   * @param {Array} prices - Array of closing prices
   * @param {number} period - Period for RSI calculation (default 14)
   * @returns {number|null} - RSI value or null if not enough data
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;

    // Calculate price changes
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }

    // Separate gains and losses
    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);

    // Calculate initial average gain and loss
    const relevantGains = gains.slice(-(period + 1));
    const relevantLosses = losses.slice(-(period + 1));
    
    let avgGain = relevantGains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = relevantLosses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    // Apply smoothing for the last value
    avgGain = ((avgGain * (period - 1)) + relevantGains[period]) / period;
    avgLoss = ((avgLoss * (period - 1)) + relevantLosses[period]) / period;

    // Calculate RSI
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return rsi;
  }

  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   * @param {Array} prices - Array of closing prices
   * @param {number} fastPeriod - Fast EMA period (default 12)
   * @param {number} slowPeriod - Slow EMA period (default 26)
   * @param {number} signalPeriod - Signal line EMA period (default 9)
   * @returns {Object|null} - MACD values {macd, signal, histogram} or null
   */
  calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (prices.length < slowPeriod + signalPeriod) return null;

    // Calculate EMAs
    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);
    
    if (!fastEMA || !slowEMA) return null;

    // Calculate MACD line
    const macdLine = fastEMA - slowEMA;

    // Calculate signal line (9-day EMA of MACD)
    // We need to calculate MACD values for the signal period
    const macdValues = [];
    for (let i = slowPeriod - 1; i < prices.length; i++) {
      const subPrices = prices.slice(0, i + 1);
      const fast = this.calculateEMA(subPrices, fastPeriod);
      const slow = this.calculateEMA(subPrices, slowPeriod);
      if (fast && slow) {
        macdValues.push(fast - slow);
      }
    }

    if (macdValues.length < signalPeriod) return null;

    const signalLine = this.calculateEMA(macdValues, signalPeriod);
    if (!signalLine) return null;

    // Calculate histogram
    const histogram = macdLine - signalLine;

    return {
      macd: macdLine,
      signal: signalLine,
      histogram: histogram
    };
  }

  /**
   * Calculate Exponential Moving Average (EMA)
   * @param {Array} prices - Array of prices
   * @param {number} period - Period for EMA calculation
   * @returns {number|null} - EMA value or null if not enough data
   */
  calculateEMA(prices, period) {
    if (prices.length < period) return null;

    const multiplier = 2 / (period + 1);
    
    // Start with SMA for the first period
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    // Calculate EMA for remaining prices
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }

  /**
   * Fetch price data from database
   * @param {string} symbol - Trading symbol
   * @param {string} interval - Time interval
   * @param {number} limit - Number of candles to fetch
   * @returns {Promise<Array>} - Array of price data
   */
  async fetchPriceData(symbol, interval, limit = 100) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT open_time, close 
         FROM kline_data 
         WHERE symbol = ? AND interval = ? 
         ORDER BY open_time DESC 
         LIMIT ?`,
        [symbol, interval, limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            // Reverse to get chronological order
            resolve(rows.reverse());
          }
        }
      );
    });
  }

  /**
   * Calculate and store technical indicators for a symbol/interval
   * @param {string} symbol - Trading symbol
   * @param {string} interval - Time interval
   * @returns {Promise<Object>} - Latest calculated indicators
   */
  async calculateAndStoreIndicators(symbol, interval) {
    try {
      // Fetch enough data for all indicators (need at least 50 for SMA-50)
      const priceData = await this.fetchPriceData(symbol, interval, 100);
      
      if (priceData.length < 50) {
        console.log(`Not enough data for ${symbol} ${interval} indicators`);
        return null;
      }

      const prices = priceData.map(d => d.close);
      const latestTimestamp = priceData[priceData.length - 1].open_time;

      // Calculate indicators
      const sma20 = this.calculateSMA(prices, 20);
      const sma50 = this.calculateSMA(prices, 50);
      const rsi14 = this.calculateRSI(prices, 14);
      const macdData = this.calculateMACD(prices);

      const indicators = {
        symbol,
        interval,
        timestamp: latestTimestamp,
        sma_20: sma20,
        sma_50: sma50,
        rsi_14: rsi14,
        macd: macdData ? macdData.macd : null,
        macd_signal: macdData ? macdData.signal : null,
        macd_histogram: macdData ? macdData.histogram : null
      };

      // Store in database
      await this.storeIndicators(indicators);

      return indicators;
    } catch (error) {
      console.error(`Error calculating indicators for ${symbol} ${interval}:`, error);
      throw error;
    }
  }

  /**
   * Store indicators in database
   * @param {Object} indicators - Indicators object
   * @returns {Promise<void>}
   */
  async storeIndicators(indicators) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO technical_indicators 
         (symbol, interval, timestamp, sma_20, sma_50, rsi_14, macd, macd_signal, macd_histogram)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          indicators.symbol,
          indicators.interval,
          indicators.timestamp,
          indicators.sma_20,
          indicators.sma_50,
          indicators.rsi_14,
          indicators.macd,
          indicators.macd_signal,
          indicators.macd_histogram
        ],
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
   * Get latest indicators for a symbol/interval
   * @param {string} symbol - Trading symbol
   * @param {string} interval - Time interval
   * @returns {Promise<Object|null>} - Latest indicators or null
   */
  async getLatestIndicators(symbol, interval) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT * FROM technical_indicators 
         WHERE symbol = ? AND interval = ? 
         ORDER BY timestamp DESC 
         LIMIT 1`,
        [symbol, interval],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  /**
   * Calculate indicators for all symbols and intervals
   * @param {Array} symbols - Array of symbols
   * @param {Array} intervals - Array of intervals
   * @returns {Promise<void>}
   */
  async calculateAllIndicators(symbols, intervals) {
    console.log('📊 Calculating technical indicators for all symbols...');
    
    for (const symbol of symbols) {
      for (const interval of intervals) {
        try {
          const indicators = await this.calculateAndStoreIndicators(symbol, interval);
          if (indicators) {
            console.log(`✅ Calculated indicators for ${symbol} ${interval}`);
          }
        } catch (error) {
          console.error(`❌ Error calculating indicators for ${symbol} ${interval}:`, error.message);
        }
        
        // Small delay to avoid overloading
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('✅ Technical indicators calculation completed');
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = TechnicalIndicators;
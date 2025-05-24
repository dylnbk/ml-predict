const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs').promises;
const OpenAI = require('openai');
const WebSocket = require('ws');
const http = require('http');
const TechnicalIndicators = require('./utils/technicalIndicators');
const PredictionService = require('./services/predictionService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store previous prices for calculating changes
const previousPrices = {
  BTC: null,
  ETH: null,
  XRP: null,
  SOL: null
};

// Store current prices
const currentPrices = {
  BTC: null,
  ETH: null,
  XRP: null,
  SOL: null
};

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// File-based sentiment data configuration
const SENTIMENT_DATA_FILE = path.join(__dirname, 'sentiment-data.json');
const SENTIMENT_UPDATE_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

// Cryptocurrency symbols
const SYMBOLS = ['BTC', 'ETH', 'XRP', 'SOL'];

// Helper function to check if sentiment data needs update
async function needsSentimentUpdate() {
  try {
    const data = await fs.readFile(SENTIMENT_DATA_FILE, 'utf8');
    const sentimentData = JSON.parse(data);
    const lastUpdate = new Date(sentimentData.lastUpdate).getTime();
    const now = Date.now();
    return (now - lastUpdate) >= SENTIMENT_UPDATE_INTERVAL;
  } catch (error) {
    // File doesn't exist or is invalid
    return true;
  }
}

// Helper function to read sentiment data from file
async function readSentimentData() {
  try {
    const data = await fs.readFile(SENTIMENT_DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading sentiment data file:', error.message);
    return null;
  }
}

// Helper function to write sentiment data to file
async function writeSentimentData(data) {
  try {
    await fs.writeFile(SENTIMENT_DATA_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Sentiment data saved to file');
  } catch (error) {
    console.error('Error writing sentiment data file:', error.message);
  }
}

// Function to fetch sentiment data for all cryptocurrencies
async function fetchAllSentimentData() {
  console.log('\n🔄 Fetching sentiment data for all cryptocurrencies...');
  
  const sentimentData = {
    lastUpdate: new Date().toISOString(),
    data: {}
  };

  // Fetch general market sentiment from Fear & Greed Index
  let marketSentiment = null;
  try {
    const fearGreedResponse = await axios.get('https://api.alternative.me/fng/?limit=1');
    if (fearGreedResponse.data && fearGreedResponse.data.data && fearGreedResponse.data.data[0]) {
      const fngData = fearGreedResponse.data.data[0];
      marketSentiment = {
        score: parseInt(fngData.value),
        classification: fngData.value_classification,
        timestamp: fngData.timestamp
      };
    }
  } catch (error) {
    console.error('Error fetching Fear & Greed Index:', error.message);
  }

  // Fetch news and sentiment for each cryptocurrency
  for (const symbol of SYMBOLS) {
    console.log(`📊 Fetching data for ${symbol}...`);
    
    let newsContent = '';
    let newsSummary = '';
    let sentimentRating = 'Neutral';
    let sentimentScore = 50;

    // Apply market sentiment
    if (marketSentiment) {
      sentimentScore = marketSentiment.score;
      if (sentimentScore >= 60) {
        sentimentRating = 'Bull';
      } else if (sentimentScore <= 40) {
        sentimentRating = 'Bear';
      } else {
        sentimentRating = 'Neutral';
      }
    }

    // Fetch news using OpenAI
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini-search-preview-2025-03-11",
          web_search_options: {
            search_context_size: "high",
          },
          messages: [{
            role: "user",
            content: `Latest ${symbol} cryptocurrency news and market analysis. Provide a brief summary of the most recent developments, price movements, and market sentiment.`,
          }],
        });
        
        newsContent = completion.choices[0].message.content;
        
        // Create a shorter summary for the card display
        const summaryCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: `Summarize this in 2-3 sentences for a dashboard card: ${newsContent}`,
          }],
        });
        
        newsSummary = summaryCompletion.choices[0].message.content;
        
      } catch (error) {
        console.error(`OpenAI API error for ${symbol}:`, error.message);
        newsContent = `Unable to fetch latest news for ${symbol}. Please check your OpenAI API key.`;
        newsSummary = 'News unavailable';
      }
    } else {
      newsContent = `OpenAI API key not configured. Please add your API key to the .env file.`;
      newsSummary = 'Configure API key for news';
    }

    // Store data for this symbol
    sentimentData.data[symbol] = {
      sentiment: {
        rating: sentimentRating,
        score: sentimentScore,
        data: marketSentiment
      },
      news: {
        content: newsContent,
        summary: newsSummary,
        timestamp: new Date().toISOString()
      }
    };

    // Small delay between API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Save to file
  await writeSentimentData(sentimentData);
  console.log('✅ All sentiment data fetched and saved\n');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database('./crypto_data.db');

// Initialize technical indicators
const technicalIndicators = new TechnicalIndicators('./crypto_data.db');

// Initialize prediction service
const predictionService = new PredictionService();

// Run migrations on startup
async function runMigrations() {
  try {
    // List of migration files to run in order
    const migrations = [
      'add_predictions_schema.sql',
      'add_ai_provider_column.sql'
    ];
    
    for (const migrationFile of migrations) {
      const migrationPath = path.join(__dirname, 'migrations', migrationFile);
      
      // Check if migration file exists
      try {
        await fs.access(migrationPath);
      } catch (error) {
        console.log(`Migration file ${migrationFile} not found, skipping...`);
        continue;
      }
      
      const migrationSQL = await fs.readFile(migrationPath, 'utf8');
      
      await new Promise((resolve, reject) => {
        db.exec(migrationSQL, (err) => {
          if (err) {
            // Check if it's a column already exists error
            if (err.message.includes('duplicate column name: ai_provider')) {
              console.log(`✅ Migration ${migrationFile} already applied`);
              resolve();
            } else {
              console.error(`Error running migration ${migrationFile}:`, err);
              reject(err);
            }
          } else {
            console.log(`✅ Migration ${migrationFile} completed successfully`);
            resolve();
          }
        });
      });
    }
    
    console.log('✅ All database migrations completed');
  } catch (error) {
    console.error('Error in migration process:', error);
    throw error;
  }
}

// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS kline_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      interval TEXT NOT NULL,
      open_time INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      close_time INTEGER NOT NULL,
      quote_volume REAL NOT NULL,
      trades INTEGER NOT NULL,
      UNIQUE(symbol, interval, open_time)
    )
  `);
  
  // Create indexes for better performance
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_symbol_interval_time
    ON kline_data(symbol, interval, open_time DESC)
  `);
  
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_latest_data
    ON kline_data(symbol, interval, open_time)
  `);
});

// Intervals for kline data
const INTERVALS = {
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
};

// API endpoints
const BINANCE_BASE_URL = 'https://api.binance.com/api/v3';
const OKX_BASE_URL = 'https://www.okx.com/api/v5';

// Helper function to fetch from Binance
async function fetchBinanceKlines(symbol, interval, limit = 1000, startTime = null, endTime = null) {
  try {
    const params = {
      symbol: `${symbol}USDT`,
      interval: interval,
      limit: limit
    };
    
    if (startTime) params.startTime = startTime;
    if (endTime) params.endTime = endTime;
    
    const response = await axios.get(`${BINANCE_BASE_URL}/klines`, {
      params: params
    });
    return response.data;
  } catch (error) {
    console.error(`Binance API error for ${symbol}:`, error.message);
    return null;
  }
}

// Helper function to fetch from OKX (fallback)
async function fetchOKXKlines(symbol, interval, limit = 1000, startTime = null, endTime = null) {
  try {
    // OKX uses different interval format
    const okxInterval = {
      '1h': '1H',
      '4h': '4H',
      '1d': '1D'
    }[interval];
    
    const params = {
      instId: `${symbol}-USDT-SWAP`,
      bar: okxInterval,
      limit: limit
    };
    
    if (startTime) params.after = startTime;
    if (endTime) params.before = endTime;
    
    const response = await axios.get(`${OKX_BASE_URL}/market/candles`, {
      params: params
    });
    
    // OKX returns data in different format, need to transform
    if (response.data.code === '0') {
      return response.data.data.map(candle => [
        parseInt(candle[0]), // open time
        candle[1], // open
        candle[2], // high
        candle[3], // low
        candle[4], // close
        candle[5], // volume
        parseInt(candle[0]) + (interval === '1h' ? 3600000 : interval === '4h' ? 14400000 : 86400000), // close time
        candle[6], // quote volume
        0 // trades (OKX doesn't provide this)
      ]).reverse(); // OKX returns newest first, we need oldest first
    }
    return null;
  } catch (error) {
    console.error(`OKX API error for ${symbol}:`, error.message);
    return null;
  }
}

// Helper function to get the latest timestamp for a symbol/interval
async function getLatestTimestamp(symbol, interval) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT MAX(open_time) as latest_timestamp
       FROM kline_data
       WHERE symbol = ? AND interval = ?`,
      [symbol, interval],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row?.latest_timestamp || null);
        }
      }
    );
  });
}

// Helper function to get total record count
async function getRecordCount(symbol, interval) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count
       FROM kline_data
       WHERE symbol = ? AND interval = ?`,
      [symbol, interval],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row?.count || 0);
        }
      }
    );
  });
}

// Function to fetch and store kline data with intelligent gap filling
async function fetchAndStoreKlines(symbol, interval) {
  console.log(`\n=== Processing ${symbol} ${interval} ===`);
  
  try {
    // Get the latest timestamp from database
    const latestTimestamp = await getLatestTimestamp(symbol, interval);
    const currentTime = Date.now();
    
    let startTime = null;
    let fetchLimit = 1000;
    
    if (latestTimestamp) {
      // Calculate the gap
      const intervalMs = {
        '1h': 3600000,
        '4h': 14400000,
        '1d': 86400000
      }[interval];
      
      // Start from the next candle after the latest one
      startTime = latestTimestamp + intervalMs;
      
      // Calculate how many candles we need
      const gapMs = currentTime - startTime;
      const candlesNeeded = Math.ceil(gapMs / intervalMs);
      
      if (candlesNeeded <= 0) {
        console.log(`✓ ${symbol} ${interval}: Already up to date`);
        const totalRecords = await getRecordCount(symbol, interval);
        console.log(`  Total records in database: ${totalRecords}`);
        return;
      }
      
      // Limit to 1000 candles per request
      fetchLimit = Math.min(candlesNeeded, 1000);
      
      const startDate = new Date(startTime).toISOString();
      const endDate = new Date(currentTime).toISOString();
      console.log(`📊 Fetching gap data:`);
      console.log(`  From: ${startDate}`);
      console.log(`  To: ${endDate}`);
      console.log(`  Candles needed: ${candlesNeeded} (fetching up to ${fetchLimit})`);
    } else {
      console.log(`📊 No existing data found. Fetching last ${fetchLimit} candles...`);
    }
    
    // Try Binance first
    let klines = await fetchBinanceKlines(symbol, interval, fetchLimit, startTime);
    
    // If Binance fails, try OKX
    if (!klines) {
      console.log(`⚠️ Binance failed, trying OKX for ${symbol}...`);
      klines = await fetchOKXKlines(symbol, interval, fetchLimit, startTime);
    }
    
    if (!klines || klines.length === 0) {
      console.error(`❌ Failed to fetch klines for ${symbol} from both APIs`);
      return;
    }
    
    // Filter out any klines that might already exist (in case of overlap)
    const newKlines = [];
    const existingTimestamps = new Set();
    
    if (latestTimestamp) {
      // Get existing timestamps to avoid duplicates
      const rows = await new Promise((resolve, reject) => {
        db.all(
          `SELECT open_time FROM kline_data
           WHERE symbol = ? AND interval = ? AND open_time >= ?`,
          [symbol, interval, latestTimestamp],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          }
        );
      });
      
      rows.forEach(row => existingTimestamps.add(row.open_time));
    }
    
    // Filter new klines
    for (const kline of klines) {
      const openTime = parseInt(kline[0]);
      if (!existingTimestamps.has(openTime)) {
        newKlines.push(kline);
      }
    }
    
    if (newKlines.length === 0) {
      console.log(`✓ No new data to insert (all ${klines.length} candles already exist)`);
      const totalRecords = await getRecordCount(symbol, interval);
      console.log(`  Total records in database: ${totalRecords}`);
      return;
    }
    
    // Store in database using transaction for better performance
    await new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO kline_data
          (symbol, interval, open_time, open, high, low, close, volume, close_time, quote_volume, trades)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        for (const kline of newKlines) {
          stmt.run(
            symbol,
            interval,
            parseInt(kline[0]),
            parseFloat(kline[1]),
            parseFloat(kline[2]),
            parseFloat(kline[3]),
            parseFloat(kline[4]),
            parseFloat(kline[5]),
            parseInt(kline[6]),
            parseFloat(kline[7]),
            parseInt(kline[8])
          );
        }
        
        stmt.finalize(() => {
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    });
    
    console.log(`✅ Successfully stored ${newKlines.length} new candles (skipped ${klines.length - newKlines.length} existing)`);
    
    // Get and display total records
    const totalRecords = await getRecordCount(symbol, interval);
    console.log(`  Total records in database: ${totalRecords}`);
    
    // Calculate technical indicators after storing new data
    if (newKlines.length > 0) {
      try {
        await technicalIndicators.calculateAndStoreIndicators(symbol, interval);
        console.log(`📈 Updated technical indicators for ${symbol} ${interval}`);
      } catch (indicatorError) {
        console.error(`⚠️ Error calculating indicators for ${symbol} ${interval}:`, indicatorError.message);
      }
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${symbol} ${interval}:`, error.message);
  }
}

// Function to fetch all data
async function fetchAllData() {
  console.log('\n🚀 Starting intelligent data fetch...');
  console.log(`📅 Current time: ${new Date().toISOString()}`);
  
  for (const symbol of SYMBOLS) {
    for (const interval of Object.values(INTERVALS)) {
      await fetchAndStoreKlines(symbol, interval);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('\n✅ Data fetch completed successfully!\n');
}

// API Routes
app.get('/api/klines/:symbol/:interval', (req, res) => {
  const { symbol, interval } = req.params;
  const limit = parseInt(req.query.limit) || 100;
  
  db.all(
    `SELECT * FROM kline_data 
     WHERE symbol = ? AND interval = ? 
     ORDER BY open_time DESC 
     LIMIT ?`,
    [symbol, interval, limit],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows.reverse()); // Return oldest first
    }
  );
});

// Get latest price for all symbols
app.get('/api/latest-prices', (req, res) => {
  const query = `
    SELECT DISTINCT symbol, close as price, open_time
    FROM kline_data
    WHERE (symbol, open_time) IN (
      SELECT symbol, MAX(open_time)
      FROM kline_data
      WHERE interval = '1h'
      GROUP BY symbol
    )
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const prices = {};
    rows.forEach(row => {
      prices[row.symbol] = row.price;
    });
    res.json(prices);
  });
});

// Sentiment API endpoint
app.get('/api/sentiment/:symbol', async (req, res) => {
  const { symbol } = req.params;
  
  try {
    // Read sentiment data from file
    const sentimentData = await readSentimentData();
    
    if (!sentimentData || !sentimentData.data || !sentimentData.data[symbol]) {
      // Data not available, return error
      return res.status(404).json({
        error: 'Sentiment data not available',
        message: 'Please wait for the scheduled update to fetch data'
      });
    }
    
    const symbolData = sentimentData.data[symbol];
    
    // Get current price from database
    const priceData = await new Promise((resolve, reject) => {
      db.get(
        `SELECT close as price, open_time
         FROM kline_data
         WHERE symbol = ? AND interval = '1h'
         ORDER BY open_time DESC
         LIMIT 1`,
        [symbol],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    res.json({
      symbol,
      price: priceData ? priceData.price : 0,
      sentiment: symbolData.sentiment,
      news: symbolData.news,
      lastUpdate: sentimentData.lastUpdate
    });
    
  } catch (error) {
    console.error(`Error in sentiment endpoint for ${symbol}:`, error);
    res.status(500).json({
      error: 'Failed to fetch sentiment data',
      message: error.message
    });
  }
});

// Get latest technical indicators endpoint
app.get('/api/indicators/:symbol/:interval', async (req, res) => {
  const { symbol, interval } = req.params;
  
  try {
    const indicators = await technicalIndicators.getLatestIndicators(symbol, interval);
    
    if (!indicators) {
      return res.status(404).json({
        error: 'No indicators available',
        message: 'Technical indicators have not been calculated yet'
      });
    }
    
    res.json(indicators);
  } catch (error) {
    console.error(`Error fetching indicators for ${symbol} ${interval}:`, error);
    res.status(500).json({
      error: 'Failed to fetch technical indicators',
      message: error.message
    });
  }
});

// Prediction API endpoints

// Get current predictions for a symbol/interval
app.get('/api/predictions/:symbol/:interval', async (req, res) => {
  const { symbol, interval } = req.params;
  const { provider = 'gemini' } = req.query; // Get AI provider from query param
  
  try {
    // Use predictionService to get predictions for specific provider
    const predictions = await predictionService.getPredictions(symbol, interval, provider);
    
    if (!predictions || predictions.length === 0) {
      return res.status(404).json({
        error: 'No predictions available',
        message: `No predictions found for ${symbol} ${interval} using ${provider}`
      });
    }
    
    // Return predictions in the format expected by frontend
    res.json(predictions);
    
  } catch (error) {
    console.error(`Error fetching predictions for ${symbol} ${interval} with ${provider}:`, error);
    res.status(500).json({
      error: 'Failed to fetch predictions',
      message: error.message
    });
  }
});

// Get accuracy metrics for a symbol/interval
app.get('/api/predictions/accuracy/:symbol/:interval', async (req, res) => {
  const { symbol, interval } = req.params;
  
  try {
    // Use predictionService to get accuracy metrics
    const metrics = await predictionService.getAccuracyMetrics(symbol, interval);
    
    if (!metrics) {
      return res.status(404).json({
        error: 'No accuracy data available',
        message: 'No completed predictions found for accuracy calculation'
      });
    }
    
    // Return metrics in the format expected by frontend
    res.json(metrics);
    
  } catch (error) {
    console.error(`Error fetching accuracy metrics for ${symbol} ${interval}:`, error);
    res.status(500).json({
      error: 'Failed to fetch accuracy metrics',
      message: error.message
    });
  }
});

// Manually trigger prediction generation (for testing)
app.post('/api/predictions/generate', async (req, res) => {
  const { symbol, interval } = req.body;
  
  // Validate input
  if (!symbol || !SYMBOLS.includes(symbol)) {
    return res.status(400).json({
      error: 'Invalid symbol',
      message: 'Symbol must be one of: ' + SYMBOLS.join(', ')
    });
  }
  
  if (!interval || !Object.values(INTERVALS).includes(interval)) {
    return res.status(400).json({
      error: 'Invalid interval',
      message: 'Interval must be one of: ' + Object.values(INTERVALS).join(', ')
    });
  }
  
  try {
    console.log(`📮 Manual prediction generation requested for ${symbol} ${interval}`);
    
    const result = await predictionService.generatePredictions(symbol, interval);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Prediction generation failed',
        message: result.error
      });
    }
    
    res.json({
      success: true,
      message: `Generated ${result.predictions.length} predictions for ${symbol} ${interval}`,
      result
    });
    
  } catch (error) {
    console.error('Error in manual prediction generation:', error);
    res.status(500).json({
      error: 'Failed to generate predictions',
      message: error.message
    });
  }
});

// Helper function to get latest indicators for predictions
async function getLatestIndicatorsForPrediction(symbol, interval) {
  try {
    const indicators = await technicalIndicators.getLatestIndicators(symbol, interval);
    return indicators;
  } catch (error) {
    console.error(`Error getting indicators for prediction ${symbol} ${interval}:`, error);
    return null;
  }
}

// Scheduled task to generate hourly predictions
async function generateHourlyPredictions() {
  console.log('\n⏰ Running scheduled hourly prediction generation...');
  
  const providers = ['gemini', 'gpt', 'claude'];
  
  for (const symbol of SYMBOLS) {
    for (const provider of providers) {
      try {
        const result = await predictionService.generatePredictions(symbol, '1h', provider);
        if (result.success) {
          console.log(`✅ Generated hourly predictions for ${symbol} using ${provider}`);
        } else {
          console.error(`❌ Failed to generate hourly predictions for ${symbol} using ${provider}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error generating hourly predictions for ${symbol} using ${provider}:`, error.message);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Delay between symbols
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('✅ Hourly prediction generation completed\n');
}

// Scheduled task to generate 4-hourly predictions
async function generate4HourlyPredictions() {
  console.log('\n⏰ Running scheduled 4-hourly prediction generation...');
  
  const providers = ['gemini', 'gpt', 'claude'];
  
  for (const symbol of SYMBOLS) {
    for (const provider of providers) {
      try {
        const result = await predictionService.generatePredictions(symbol, '4h', provider);
        if (result.success) {
          console.log(`✅ Generated 4-hourly predictions for ${symbol} using ${provider}`);
        } else {
          console.error(`❌ Failed to generate 4-hourly predictions for ${symbol} using ${provider}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error generating 4-hourly predictions for ${symbol} using ${provider}:`, error.message);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Delay between symbols
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('✅ 4-hourly prediction generation completed\n');
}

// Scheduled task to generate daily predictions
async function generateDailyPredictions() {
  console.log('\n⏰ Running scheduled daily prediction generation...');
  
  const providers = ['gemini', 'gpt', 'claude'];
  
  for (const symbol of SYMBOLS) {
    for (const provider of providers) {
      try {
        const result = await predictionService.generatePredictions(symbol, '1d', provider);
        if (result.success) {
          console.log(`✅ Generated daily predictions for ${symbol} using ${provider}`);
        } else {
          console.error(`❌ Failed to generate daily predictions for ${symbol} using ${provider}: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ Error generating daily predictions for ${symbol} using ${provider}:`, error.message);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Delay between symbols
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('✅ Daily prediction generation completed\n');
}

// Scheduled task to update actual prices and calculate accuracy
async function updatePredictionAccuracy() {
  console.log('\n📊 Running scheduled prediction accuracy update...');
  
  for (const symbol of SYMBOLS) {
    for (const interval of Object.values(INTERVALS)) {
      try {
        const result = await predictionService.updateActualPrices(symbol, interval);
        if (result.updated > 0) {
          console.log(`✅ Updated ${result.updated} predictions for ${symbol} ${interval}`);
        }
      } catch (error) {
        console.error(`❌ Error updating predictions for ${symbol} ${interval}:`, error.message);
      }
    }
  }
  
  console.log('✅ Prediction accuracy update completed\n');
}

// Initial data fetch on startup
fetchAllData();

// Check and fetch sentiment data on startup
(async () => {
  const needsUpdate = await needsSentimentUpdate();
  if (needsUpdate) {
    console.log('🚀 Initial sentiment data fetch needed...');
    await fetchAllSentimentData();
  } else {
    console.log('✅ Sentiment data is up to date');
  }
})();

// Schedule hourly updates for kline data
cron.schedule('0 * * * *', () => {
  console.log('\n⏰ Running scheduled kline data update...');
  fetchAllData();
});

// Schedule sentiment data updates every 4 hours
cron.schedule('0 */4 * * *', () => {
  console.log('\n⏰ Running scheduled sentiment data update...');
  fetchAllSentimentData();
});

// Schedule prediction generation tasks
// Hourly predictions: Run at 1 minute past each hour
cron.schedule('1 * * * *', () => {
  generateHourlyPredictions().catch(error => {
    console.error('Fatal error in hourly prediction generation:', error);
  });
});

// 4-hourly predictions: Run at 1 minute past every 4 hours
cron.schedule('1 */4 * * *', () => {
  generate4HourlyPredictions().catch(error => {
    console.error('Fatal error in 4-hourly prediction generation:', error);
  });
});

// Daily predictions: Run at 00:01 UTC
cron.schedule('1 0 * * *', () => {
  generateDailyPredictions().catch(error => {
    console.error('Fatal error in daily prediction generation:', error);
  });
});

// Update actual prices and calculate accuracy every 5 minutes
cron.schedule('*/5 * * * *', () => {
  updatePredictionAccuracy().catch(error => {
    console.error('Fatal error in prediction accuracy update:', error);
  });
});

// WebSocket connection to Binance
let binanceWs = null;
let reconnectInterval = null;

function connectToBinance() {
  if (binanceWs && binanceWs.readyState === WebSocket.OPEN) {
    return;
  }

  const streams = ['btcusdt@ticker', 'ethusdt@ticker', 'xrpusdt@ticker', 'solusdt@ticker'];
  const wsUrl = `wss://stream.binance.com:9443/ws/${streams.join('/')}`;

  binanceWs = new WebSocket(wsUrl);

  binanceWs.on('open', () => {
    console.log('✅ Connected to Binance WebSocket');
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  });

  binanceWs.on('message', (data) => {
    try {
      const ticker = JSON.parse(data);
      const symbol = ticker.s.replace('USDT', ''); // Remove USDT suffix
      const price = parseFloat(ticker.c); // Current price

      // Store previous price before updating
      if (currentPrices[symbol] !== null) {
        previousPrices[symbol] = currentPrices[symbol];
      }
      
      // Update current price
      currentPrices[symbol] = price;

      // Calculate price change
      let priceChange = 0;
      let priceChangePercent = 0;
      
      if (previousPrices[symbol] !== null) {
        priceChange = price - previousPrices[symbol];
        priceChangePercent = (priceChange / previousPrices[symbol]) * 100;
      }

      // Broadcast to all connected WebSocket clients
      const priceUpdate = {
        type: 'price_update',
        symbol: symbol,
        price: price,
        previousPrice: previousPrices[symbol],
        priceChange: priceChange,
        priceChangePercent: priceChangePercent,
        timestamp: Date.now()
      };

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(priceUpdate));
        }
      });
    } catch (error) {
      console.error('Error processing Binance message:', error);
    }
  });

  binanceWs.on('error', (error) => {
    console.error('❌ Binance WebSocket error:', error);
  });

  binanceWs.on('close', () => {
    console.log('⚠️ Binance WebSocket disconnected');
    // Attempt to reconnect after 5 seconds
    if (!reconnectInterval) {
      reconnectInterval = setInterval(() => {
        console.log('🔄 Attempting to reconnect to Binance...');
        connectToBinance();
      }, 5000);
    }
  });
}

// Handle client WebSocket connections
wss.on('connection', (ws) => {
  console.log('👤 New client connected');

  // Send current prices to new client
  const symbols = ['BTC', 'ETH', 'XRP', 'SOL'];
  symbols.forEach(symbol => {
    if (currentPrices[symbol] !== null) {
      const priceUpdate = {
        type: 'price_update',
        symbol: symbol,
        price: currentPrices[symbol],
        previousPrice: previousPrices[symbol],
        priceChange: previousPrices[symbol] ? currentPrices[symbol] - previousPrices[symbol] : 0,
        priceChangePercent: previousPrices[symbol] ? ((currentPrices[symbol] - previousPrices[symbol]) / previousPrices[symbol]) * 100 : 0,
        timestamp: Date.now()
      };
      ws.send(JSON.stringify(priceUpdate));
    }
  });

  ws.on('close', () => {
    console.log('👤 Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('Client WebSocket error:', error);
  });
});

// Initialize prices from database on startup
async function initializePrices() {
  const symbols = ['BTC', 'ETH', 'XRP', 'SOL'];
  
  for (const symbol of symbols) {
    try {
      const priceData = await new Promise((resolve, reject) => {
        db.get(
          `SELECT close as price
           FROM kline_data
           WHERE symbol = ? AND interval = '1h'
           ORDER BY open_time DESC
           LIMIT 1`,
          [symbol],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (priceData && priceData.price) {
        currentPrices[symbol] = priceData.price;
        previousPrices[symbol] = priceData.price;
      }
    } catch (error) {
      console.error(`Error initializing price for ${symbol}:`, error);
    }
  }
}

// Start server
server.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Run database migrations
  try {
    await runMigrations();
  } catch (error) {
    console.error('Failed to run migrations:', error);
  }
  
  // Initialize prices from database
  await initializePrices();
  
  // Connect to Binance WebSocket
  connectToBinance();
  
  // Calculate initial technical indicators for all existing data
  setTimeout(async () => {
    await technicalIndicators.calculateAllIndicators(SYMBOLS, Object.values(INTERVALS));
  }, 5000); // Wait 5 seconds for initial data fetch to complete
  
  // Generate initial predictions for all timeframes after a delay to ensure data is ready
  setTimeout(async () => {
    console.log('\n🚀 Generating initial predictions for all timeframes...');
    
    // Generate hourly predictions
    await generateHourlyPredictions().catch(error => {
      console.error('Error generating initial hourly predictions:', error);
    });
    
    // Generate 4-hourly predictions
    await generate4HourlyPredictions().catch(error => {
      console.error('Error generating initial 4-hourly predictions:', error);
    });
    
    // Generate daily predictions
    await generateDailyPredictions().catch(error => {
      console.error('Error generating initial daily predictions:', error);
    });
    
    console.log('✅ Initial predictions generation completed\n');
  }, 10000); // Wait 10 seconds for data and indicators to be ready
});

// Export helper function for use in other modules
module.exports = {
  getLatestIndicatorsForPrediction
};
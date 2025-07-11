# Cryptocurrency Dashboard

A real-time cryptocurrency dashboard displaying price charts, tables, and sentiment analysis for BTC, ETH, XRP, and SOL with automatic hourly updates.

## Features

- Dark theme interface with 2x2 grid layout (1x4 on mobile)
- Real-time price charts for Bitcoin (BTC), Ethereum (ETH), Ripple (XRP), and Solana (SOL)
- Table view showing historical price data
- **NEW: Sentiment analysis tab** with market sentiment ratings and AI-powered news summaries
- Multiple time intervals: 1 Hour, 4 Hour, and 1 Day
- Automatic data fetching from Binance API with OKX fallback
- SQLite database for historical data storage
- Hourly automatic updates
- Responsive design for mobile devices
- **NEW: Prediction Reset Mechanism** with automatic reset when prediction accuracy drops below 20%
- Fullscreen view for detailed analysis

## Installation

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
   - Create a `.env` file in the root directory
   - Add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_actual_openai_api_key_here
   ```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Architecture

- **Frontend**: Vanilla JavaScript with Chart.js for visualization
- **Backend**: Node.js with Express
- **Database**: SQLite for storing historical KLINE data
- **APIs**:
  - Binance (primary) and OKX (fallback) for cryptocurrency data
## Prediction Reset Mechanism

The system includes an intelligent reset mechanism that automatically detects when prediction models are performing poorly and resets them to maintain accuracy:

### How It Works

1. **Deviation Detection**: After each prediction period, the system checks if the most recent completed prediction deviates more than 20% from the actual price using: `Math.abs((predicted_price - actual_price) / actual_price) * 100`

2. **Automatic Reset**: When deviation exceeds the threshold:
   - All future predictions for that symbol/interval/provider are cleared
   - Historical prediction data is preserved
   - Reset event is logged with timestamp and reason
   - 24 new predictions are immediately generated

3. **Independent Operation**: Each AI provider (Gemini, GPT, Claude, ARIMA, Holt-Winters) handles resets independently

4. **Tracking**: All reset events are stored in the database for analysis and frontend visualization

### Configuration

- **Reset Threshold**: 20% deviation (configurable in [`PredictionService`](services/predictionService.js:38))
- **Reset Check**: Runs before every prediction generation cycle
- **Prediction Count**: System maintains exactly 24 future predictions per symbol/interval/provider

### API Endpoints

```javascript
// Get reset history
GET /api/predictions/resets/:symbol/:interval?aiProvider=gemini&limit=10

// Check if reset is needed
GET /api/predictions/reset-check/:symbol/:interval/:aiProvider

// Manually trigger reset (for testing)
POST /api/predictions/reset
Body: { symbol: "BTC", interval: "1h", aiProvider: "gemini" }
```

### Testing

Run the reset mechanism test suite:
```bash
node test-reset-mechanism.js
```
  - Alternative.me Fear & Greed Index for market sentiment
  - OpenAI GPT-4o-mini with web search for news summaries

## API Endpoints

- `GET /api/klines/:symbol/:interval` - Get historical kline data
- `GET /api/latest-prices` - Get latest prices for all symbols
- `GET /api/sentiment/:symbol` - Get sentiment analysis and news for a specific cryptocurrency

## Sentiment Tab

The new Sentiment tab provides:
- **Market Sentiment Rating**: Bull/Bear/Neutral indicators based on the Fear & Greed Index
- **Latest News**: AI-powered news summaries using OpenAI's web search model
- **View Details**: Click to see full news content and detailed analysis

### File-Based Sentiment System

The sentiment data is now stored in a file-based system with scheduled updates:
- **Data Storage**: All sentiment data is stored in `sentiment-data.json`
- **Update Schedule**: Data is automatically fetched every 4 hours
- **Persistence**: Data persists across server restarts
- **Efficiency**: All users receive the same cached data, reducing API calls

### API Requirements

- **OpenAI API**: Required for news summaries. Get your API key from [OpenAI Platform](https://platform.openai.com/)
- **Fear & Greed Index**: No API key required (uses Alternative.me public API)

## Automatic Updates

The application uses scheduled tasks for data updates:
- **Kline Data**: Fetched every hour for price charts
- **Sentiment Data**: Fetched every 4 hours and stored in `sentiment-data.json`

## Development

To run in development mode with auto-restart:
```bash
npm run dev
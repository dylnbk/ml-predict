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

### API Requirements

- **OpenAI API**: Required for news summaries. Get your API key from [OpenAI Platform](https://platform.openai.com/)
- **Fear & Greed Index**: No API key required (uses Alternative.me public API)

## Automatic Updates

The application automatically fetches new data every hour using node-cron scheduler.

## Development

To run in development mode with auto-restart:
```bash
npm run dev
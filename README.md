# Cryptocurrency Dashboard

A real-time cryptocurrency dashboard displaying price charts for BTC, ETH, XRP, and SOL with automatic hourly updates.

## Features

- Dark theme interface with 2x2 grid layout (1x4 on mobile)
- Real-time price charts for Bitcoin (BTC), Ethereum (ETH), Ripple (XRP), and Solana (SOL)
- Multiple time intervals: 1 Hour, 4 Hour, and 1 Day
- Automatic data fetching from Binance API with OKX fallback
- SQLite database for historical data storage
- Hourly automatic updates
- Responsive design for mobile devices

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Architecture

- **Frontend**: Vanilla JavaScript with Chart.js for visualization
- **Backend**: Node.js with Express
- **Database**: SQLite for storing historical KLINE data
- **APIs**: Binance (primary) and OKX (fallback) for cryptocurrency data

## API Endpoints

- `GET /api/klines/:symbol/:interval` - Get historical kline data
- `GET /api/latest-prices` - Get latest prices for all symbols

## Automatic Updates

The application automatically fetches new data every hour using node-cron scheduler.

## Development

To run in development mode with auto-restart:
```bash
npm run dev
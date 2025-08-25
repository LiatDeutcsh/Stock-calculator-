const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Configuration
const TWELVE_DATA_API_KEY = 'f2f5684216754d3792cc416cf4f6ccdb';
const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

// History file path
const HISTORY_FILE = path.join(__dirname, 'portfolio_history.json');

// Helper function to get stock price from TwelveData API
async function getStockPriceFromTwelveData(symbol) {
    try {
        const response = await axios.get(`${TWELVE_DATA_BASE_URL}/price`, {
            params: {
                symbol: symbol,
                apikey: TWELVE_DATA_API_KEY
            },
            timeout: 10000
        });

        if (response.data && response.data.price) {
            return parseFloat(response.data.price);
        } else {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        console.error(`TwelveData API error for ${symbol}:`, error.message);
        throw error;
    }
}

// Function to get stock price with fallback options
async function getStockPrice(symbol) {
    // Try TwelveData API first
    try {
        return await getStockPriceFromTwelveData(symbol);
    } catch (error) {
        console.log(`TwelveData failed for ${symbol}, trying Alpha Vantage...`);
    }

    throw new Error(`Unable to fetch price for ${symbol}`);
}

// Load history from file
async function loadHistory() {
    try {
        const data = await fs.readFile(HISTORY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // File doesn't exist or is invalid, return empty array
        return [];
    }
}

// Save history to file
async function saveHistory(history) {
    try {
        await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));
    } catch (error) {
        console.error('Error saving history:', error);
    }
}

// API Routes

// Calculate portfolio value
app.post('/api/portfolio', async (req, res) => {
    try {
        const { stocks } = req.body;

        if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid input. Please provide an array of stocks.' 
            });
        }

        const results = [];
        let totalPortfolioValue = 0;

        // Process each stock
        for (const stock of stocks) {
            const { symbol, quantity } = stock;

            if (!symbol || !quantity || quantity <= 0) {
                results.push({
                    symbol: symbol || 'Unknown',
                    error: 'Invalid symbol or quantity'
                });
                continue;
            }

            try {
                const currentPrice = await getStockPrice(symbol.toUpperCase());
                const totalValue = parseFloat((currentPrice * quantity).toFixed(2));
                
                results.push({
                    symbol: symbol.toUpperCase(),
                    quantity: quantity,
                    currentPrice: currentPrice.toFixed(2),
                    totalValue: totalValue.toFixed(2)
                });

                totalPortfolioValue += totalValue;
            } catch (error) {
                results.push({
                    symbol: symbol.toUpperCase(),
                    error: `Unable to fetch price: ${error.message}`
                });
            }
        }

        const response = {
            stocks: results,
            totalPortfolioValue: totalPortfolioValue.toFixed(2),
            timestamp: new Date().toISOString()
        };

        // Save to history
        const history = await loadHistory();
        const historyEntry = {
            ...response,
            id: Date.now()
        };
        history.unshift(historyEntry);
        
        // Keep only last 50 entries
        if (history.length > 50) {
            history.splice(50);
        }
        
        await saveHistory(history);

        res.json(response);

    } catch (error) {
        console.error('Portfolio calculation error:', error);
        res.status(500).json({ 
            error: 'Internal server error. Please try again later.' 
        });
    }
});

// Get portfolio history
app.get('/api/history', async (req, res) => {
    try {
        const history = await loadHistory();
        res.json(history);
    } catch (error) {
        console.error('History retrieval error:', error);
        res.status(500).json({ 
            error: 'Unable to retrieve history' 
        });
    }
});

// Get single stock price
app.get('/api/stock/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        
        if (!symbol) {
            return res.status(400).json({ 
                error: 'Stock symbol is required' 
            });
        }

        const price = await getStockPrice(symbol.toUpperCase());
        
        res.json({
            symbol: symbol.toUpperCase(),
            price: price.toFixed(2),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`Stock price error for ${req.params.symbol}:`, error);
        res.status(404).json({ 
            error: `Unable to fetch price for ${req.params.symbol}: ${error.message}` 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found' 
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Portfolio Calculator Server running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints:`);
    console.log(`   POST /api/portfolio - Calculate portfolio value`);
    console.log(`   GET  /api/history - Get calculation history`);
    console.log(`   GET  /api/stock/:symbol - Get single stock price`);
    console.log(`   GET  /api/health - Health check`);
    console.log(`💡 Open http://localhost:${PORT} in your browser to use the app`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;
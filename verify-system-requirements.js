const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./crypto_data.db');

// Configuration constants
const TIMEFRAMES = ['1h', '4h', '1d'];
const COINS = ['BTC', 'ETH', 'XRP', 'SOL'];
const LLMS = ['gemini', 'gpt', 'claude'];
const PREDICTIONS_PER_CONFIG = 24;
const TOTAL_EXPECTED_PREDICTIONS = PREDICTIONS_PER_CONFIG * TIMEFRAMES.length * COINS.length * LLMS.length;

console.log('🔍 Verifying Prediction System Requirements\n');
console.log('Expected Configuration:');
console.log(`- Timeframes: ${TIMEFRAMES.join(', ')}`);
console.log(`- Coins: ${COINS.join(', ')}`);
console.log(`- LLMs: ${LLMS.join(', ')}`);
console.log(`- Predictions per configuration: ${PREDICTIONS_PER_CONFIG}`);
console.log(`- Total expected predictions: ${TOTAL_EXPECTED_PREDICTIONS}\n`);

async function verifyPredictionGeneration() {
    console.log('1️⃣ VERIFYING PREDICTION GENERATION (24 per configuration)\n');
    
    const query = `
        SELECT 
            symbol,
            interval,
            ai_provider,
            COUNT(DISTINCT target_time) as unique_predictions,
            MIN(target_time) as earliest_prediction,
            MAX(target_time) as latest_prediction,
            COUNT(*) as total_records
        FROM predictions
        WHERE target_time > ?
        GROUP BY symbol, interval, ai_provider
        ORDER BY symbol, interval, ai_provider
    `;
    
    const currentTime = Date.now();
    
    return new Promise((resolve, reject) => {
        db.all(query, [currentTime], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            let totalConfigurations = 0;
            let correctConfigurations = 0;
            let totalPredictions = 0;
            
            console.log('Configuration Analysis:');
            console.log('─'.repeat(80));
            
            // Check each expected configuration
            for (const coin of COINS) {
                for (const timeframe of TIMEFRAMES) {
                    for (const llm of LLMS) {
                        totalConfigurations++;
                        const config = rows.find(r => 
                            r.symbol === coin && 
                            r.interval === timeframe && 
                            r.ai_provider === llm
                        );
                        
                        if (config) {
                            const status = config.unique_predictions >= PREDICTIONS_PER_CONFIG ? '✅' : '❌';
                            const timeSpan = config.latest_prediction - config.earliest_prediction;
                            const expectedSpan = getExpectedTimeSpan(timeframe);
                            
                            console.log(`${status} ${coin} ${timeframe} ${llm.toUpperCase()}: ${config.unique_predictions} predictions`);
                            
                            if (config.unique_predictions !== PREDICTIONS_PER_CONFIG) {
                                console.log(`   ⚠️  Expected ${PREDICTIONS_PER_CONFIG}, got ${config.unique_predictions}`);
                            }
                            
                            if (Math.abs(timeSpan - expectedSpan) > 3600000) { // More than 1 hour difference
                                console.log(`   ⚠️  Time span: ${formatDuration(timeSpan)} (expected ~${formatDuration(expectedSpan)})`);
                            }
                            
                            if (config.unique_predictions >= PREDICTIONS_PER_CONFIG) {
                                correctConfigurations++;
                            }
                            totalPredictions += config.unique_predictions;
                        } else {
                            console.log(`❌ ${coin} ${timeframe} ${llm.toUpperCase()}: NO PREDICTIONS FOUND`);
                        }
                    }
                }
            }
            
            console.log('─'.repeat(80));
            console.log(`\nSummary:`);
            console.log(`- Configurations with correct prediction count: ${correctConfigurations}/${totalConfigurations}`);
            console.log(`- Total future predictions: ${totalPredictions}`);
            console.log(`- Expected total: ${TOTAL_EXPECTED_PREDICTIONS}`);
            console.log(`- Status: ${totalPredictions >= TOTAL_EXPECTED_PREDICTIONS * 0.9 ? '✅ PASS' : '❌ FAIL'}\n`);
            
            resolve();
        });
    });
}

async function verifyDisplayLogic() {
    console.log('2️⃣ VERIFYING DISPLAY LOGIC\n');
    
    // Check recent predictions that should be displayed
    const query = `
        SELECT 
            symbol,
            interval,
            ai_provider,
            COUNT(*) as prediction_count,
            GROUP_CONCAT(
                CASE 
                    WHEN actual_price IS NOT NULL THEN 'H' 
                    ELSE 'F' 
                END, ''
            ) as prediction_types
        FROM (
            SELECT * FROM predictions
            WHERE target_time > ? - 86400000  -- Last 24 hours + future
            ORDER BY target_time DESC
            LIMIT 1000
        )
        GROUP BY symbol, interval, ai_provider
        ORDER BY symbol, interval, ai_provider
    `;
    
    const currentTime = Date.now();
    
    return new Promise((resolve, reject) => {
        db.all(query, [currentTime], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log('Display Data Analysis:');
            console.log('─'.repeat(80));
            console.log('Symbol | Interval | Provider | Count | Historical(H) vs Future(F) Pattern');
            console.log('─'.repeat(80));
            
            rows.forEach(row => {
                const historicalCount = (row.prediction_types.match(/H/g) || []).length;
                const futureCount = (row.prediction_types.match(/F/g) || []).length;
                
                console.log(
                    `${row.symbol.padEnd(6)} | ${row.interval.padEnd(8)} | ${row.ai_provider.padEnd(8)} | ${
                        row.prediction_count.toString().padEnd(5)
                    } | H:${historicalCount} F:${futureCount} Pattern: ${row.prediction_types.substring(0, 30)}...`
                );
            });
            
            console.log('─'.repeat(80));
            console.log('\nNote: H = Historical (has actual_price), F = Future (no actual_price yet)\n');
            
            resolve();
        });
    });
}

async function verifyHistoricalCommitment() {
    console.log('3️⃣ VERIFYING HISTORICAL COMMITMENT PROCESS\n');
    
    // Check predictions that have been committed with actual prices
    const query = `
        SELECT 
            symbol,
            interval,
            ai_provider,
            COUNT(*) as total_predictions,
            COUNT(actual_price) as predictions_with_actual,
            AVG(CASE WHEN actual_price IS NOT NULL THEN ABS(predicted_price - actual_price) / actual_price * 100 END) as avg_error_percent,
            MIN(CASE WHEN actual_price IS NOT NULL THEN target_time END) as oldest_committed,
            MAX(CASE WHEN actual_price IS NOT NULL THEN target_time END) as newest_committed
        FROM predictions
        WHERE target_time <= ?
        GROUP BY symbol, interval, ai_provider
        ORDER BY symbol, interval, ai_provider
    `;
    
    const currentTime = Date.now();
    
    return new Promise((resolve, reject) => {
        db.all(query, [currentTime], (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log('Historical Commitment Analysis:');
            console.log('─'.repeat(100));
            console.log('Symbol | Interval | Provider | Total | Committed | % Committed | Avg Error % | Commitment Range');
            console.log('─'.repeat(100));
            
            let totalPastPredictions = 0;
            let totalCommitted = 0;
            
            rows.forEach(row => {
                const commitmentRate = (row.predictions_with_actual / row.total_predictions * 100).toFixed(1);
                const avgError = row.avg_error_percent ? row.avg_error_percent.toFixed(2) : 'N/A';
                const oldestDate = row.oldest_committed ? new Date(row.oldest_committed).toLocaleDateString() : 'N/A';
                const newestDate = row.newest_committed ? new Date(row.newest_committed).toLocaleDateString() : 'N/A';
                
                totalPastPredictions += row.total_predictions;
                totalCommitted += row.predictions_with_actual;
                
                const status = commitmentRate > 90 ? '✅' : commitmentRate > 70 ? '⚠️' : '❌';
                
                console.log(
                    `${row.symbol.padEnd(6)} | ${row.interval.padEnd(8)} | ${row.ai_provider.padEnd(8)} | ${
                        row.total_predictions.toString().padEnd(5)
                    } | ${row.predictions_with_actual.toString().padEnd(9)} | ${status} ${
                        commitmentRate.padStart(6)
                    }% | ${avgError.padStart(10)}% | ${oldestDate} - ${newestDate}`
                );
            });
            
            console.log('─'.repeat(100));
            console.log(`\nOverall Commitment Rate: ${(totalCommitted / totalPastPredictions * 100).toFixed(1)}% (${totalCommitted}/${totalPastPredictions})`);
            console.log(`Status: ${totalCommitted / totalPastPredictions > 0.9 ? '✅ PASS' : '❌ FAIL'}\n`);
            
            resolve();
        });
    });
}

async function verifyDataIntegrity() {
    console.log('4️⃣ VERIFYING DATA INTEGRITY\n');
    
    // Check for any anomalies or data integrity issues
    const checks = [
        {
            name: 'Duplicate predictions check',
            query: `
                SELECT symbol, interval, target_time, ai_provider, COUNT(*) as count
                FROM predictions
                GROUP BY symbol, interval, target_time, ai_provider
                HAVING COUNT(*) > 1
            `
        },
        {
            name: 'Missing actual prices for past predictions',
            query: `
                SELECT COUNT(*) as missing_count
                FROM predictions
                WHERE target_time <= ? - 3600000  -- At least 1 hour old
                AND actual_price IS NULL
            `,
            params: [Date.now()]
        },
        {
            name: 'Predictions per provider summary',
            query: `
                SELECT 
                    ai_provider,
                    COUNT(*) as total_predictions,
                    COUNT(DISTINCT symbol || '-' || interval) as configurations,
                    COUNT(actual_price) as with_actual_price
                FROM predictions
                GROUP BY ai_provider
            `
        }
    ];
    
    for (const check of checks) {
        console.log(`Running: ${check.name}`);
        console.log('─'.repeat(60));
        
        await new Promise((resolve, reject) => {
            db.all(check.query, check.params || [], (err, rows) => {
                if (err) {
                    console.error(`Error: ${err.message}`);
                    reject(err);
                    return;
                }
                
                if (rows.length === 0 || (rows.length === 1 && rows[0].missing_count === 0)) {
                    console.log('✅ No issues found');
                } else {
                    console.log('Results:');
                    console.table(rows);
                }
                console.log();
                resolve();
            });
        });
    }
}

// Helper functions
function getExpectedTimeSpan(interval) {
    const hours = interval === '1h' ? 1 : interval === '4h' ? 4 : 24;
    return hours * 24 * 3600 * 1000; // 24 predictions * interval in milliseconds
}

function formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    }
    return `${hours}h`;
}

// Run all verifications
async function runVerification() {
    try {
        await verifyPredictionGeneration();
        await verifyDisplayLogic();
        await verifyHistoricalCommitment();
        await verifyDataIntegrity();
        
        console.log('✅ VERIFICATION COMPLETE\n');
    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        db.close();
    }
}

runVerification();
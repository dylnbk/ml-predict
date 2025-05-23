// Chart configuration
const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
        intersect: false,
        mode: 'index'
    },
    plugins: {
        legend: {
            display: false
        },
        decimation: {
            enabled: true,
            algorithm: 'lttb',
            samples: 200,
            threshold: 200
        },
        tooltip: {
            enabled: true,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#333',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
                label: function(context) {
                    return `$${context.parsed.y.toFixed(2)}`;
                }
            }
        }
    },
    scales: {
        x: {
            display: false,
            grid: {
                display: false
            },
            ticks: {
                maxTicksLimit: 20,
                autoSkip: true,
                maxRotation: 0
            }
        },
        y: {
            position: 'left',
            grid: {
                color: 'rgba(255, 255, 255, 0.03)',
                drawBorder: false,
                lineWidth: 1
            },
            border: {
                display: false
            },
            ticks: {
                color: 'rgba(255, 255, 255, 0.4)',
                font: {
                    size: 11,
                    weight: '400'
                },
                padding: 8,
                callback: function(value) {
                    if (value >= 1000) {
                        return '$' + (value / 1000).toFixed(1) + 'k';
                    }
                    return '$' + value.toFixed(value < 10 ? 2 : 0);
                }
            }
        }
    },
    elements: {
        line: {
            tension: 0.2,
            borderWidth: 2.5,
            borderCapStyle: 'round',
            borderJoinStyle: 'round'
        },
        point: {
            radius: 0,
            hoverRadius: 0,
            hitRadius: 0,
            hoverBorderWidth: 0,
            hoverBackgroundColor: 'transparent'
        }
    }
};

// Chart instances
const charts = {};
let currentInterval = '1h';
let fullscreenChart = null;
let currentFullscreenSymbol = null;
let currentView = 'chart';
let allCryptoData = {}; // Store data for all cryptocurrencies

// Symbol colors
const symbolColors = {
    'BTC': '#FFD700',
    'ETH': '#9B59B6',
    'XRP': '#00CED1',
    'SOL': '#00FF00'
};

// Create gradient for chart lines
function createLineGradient(ctx, symbol, height) {
    const gradientColors = {
        'BTC': {
            stops: [
                { position: 0, color: '#4A3C00' },    // Very dark gold/brown
                { position: 0.25, color: '#8B6914' }, // Dark gold
                { position: 0.5, color: '#cc8f00' },  // Medium gold
                { position: 0.75, color: '#FFD700' }, // Bright gold
                { position: 1, color: '#FFEA00' }     // Bright saturated yellow
            ]
        },
        'ETH': {
            stops: [
                { position: 0, color: '#1A0033' },    // Very dark purple
                { position: 0.25, color: '#4A148C' }, // Dark purple
                { position: 0.5, color: '#7B3FF2' },  // Medium purple
                { position: 0.75, color: '#9C27B0' }, // Bright purple
                { position: 1, color: '#E040FB' }     // Bright saturated purple/violet
            ]
        },
        'XRP': {
            stops: [
                { position: 0, color: '#003D4D' },    // Very dark teal
                { position: 0.25, color: '#006064' }, // Dark cyan
                { position: 0.5, color: '#007f8e' },  // Medium cyan
                { position: 0.75, color: '#00BCD4' }, // Bright cyan
                { position: 1, color: '#00E5FF' }     // Bright saturated cyan
            ]
        },
        'SOL': {
            stops: [
                { position: 0, color: '#002200' },    // Very dark green
                { position: 0.25, color: '#1B5E20' }, // Dark green
                { position: 0.5, color: '#00953e' },  // Medium green
                { position: 0.75, color: '#00E676' }, // Bright green
                { position: 1, color: '#76FF03' }     // Bright saturated green
            ]
        }
    };
    
    const gradient = gradientColors[symbol];
    const lineGradient = ctx.createLinearGradient(0, height, 0, 0); // Bottom to top
    
    // Add all color stops for smooth transition
    gradient.stops.forEach(stop => {
        lineGradient.addColorStop(stop.position, stop.color);
    });
    
    return lineGradient;
}

// Initialize charts
function initializeCharts() {
    ['BTC', 'ETH', 'XRP', 'SOL'].forEach(symbol => {
        const canvas = document.getElementById(`${symbol.toLowerCase()}-chart`);
        const ctx = canvas.getContext('2d');
        
        // Create area fill gradient
        const areaGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        areaGradient.addColorStop(0, `${symbolColors[symbol]}10`);
        areaGradient.addColorStop(1, `${symbolColors[symbol]}00`);
        
        // Create line gradient
        const lineGradient = createLineGradient(ctx, symbol, canvas.height);
        
        charts[symbol] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: symbol,
                    data: [],
                    borderColor: lineGradient,
                    backgroundColor: areaGradient,
                    fill: true,
                    borderWidth: 2.5
                }]
            },
            options: {
                ...chartOptions,
                animation: {
                    duration: 600,
                    easing: 'easeInOutQuart'
                },
                transitions: {
                    active: {
                        animation: {
                            duration: 400
                        }
                    }
                },
                scales: {
                    ...chartOptions.scales,
                    y: {
                        ...chartOptions.scales.y,
                        ticks: {
                            ...chartOptions.scales.y.ticks,
                            color: 'rgba(255, 255, 255, 0.5)'
                        }
                    }
                }
            }
        });
    });
}

// Format time based on interval
function formatTime(timestamp, interval) {
    const date = new Date(timestamp);
    const options = {
        hour: '2-digit',
        minute: '2-digit'
    };
    
    if (interval === '1d') {
        options.month = 'short';
        options.day = 'numeric';
        delete options.minute;
        delete options.hour;
    } else if (interval === '4h') {
        options.day = 'numeric';
        options.month = 'short';
        options.hour = '2-digit';
        delete options.minute;
    } else if (interval === '1h') {
        options.day = 'numeric';
        options.month = 'short';
    }
    
    return date.toLocaleString('en-US', options);
}

// Format time for fullscreen charts with short slash dates
function formatTimeFullscreen(timestamp, interval) {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1; // getMonth() returns 0-11
    const day = date.getDate();
    const hour = date.getHours();
    
    if (interval === '1d') {
        // Format: M/D (e.g., 5/23)
        return `${month}/${day}`;
    } else if (interval === '4h') {
        // Format: M/D H:00 (e.g., 5/23 14:00)
        return `${month}/${day} ${hour}:00`;
    } else if (interval === '1h') {
        // Format: M/D H:00 (e.g., 5/23 14:00)
        return `${month}/${day} ${hour}:00`;
    }
    
    return `${month}/${day}`;
}

// Update chart data with smooth transitions
async function updateChart(symbol, interval, animate = true) {
    try {
        const response = await fetch(`/api/klines/${symbol}/${interval}?limit=1000`);
        const data = await response.json();
        
        if (data.length === 0) return;
        
        // Store data for table view
        allCryptoData[symbol] = data;
        
        const labels = data.map(k => formatTime(k.open_time, interval));
        const prices = data.map(k => k.close);
        
        // Update line gradient based on new data range
        const canvas = document.getElementById(`${symbol.toLowerCase()}-chart`);
        const ctx = canvas.getContext('2d');
        const lineGradient = createLineGradient(ctx, symbol, canvas.height);
        
        charts[symbol].data.labels = labels;
        charts[symbol].data.datasets[0].data = prices;
        charts[symbol].data.datasets[0].borderColor = lineGradient;
        
        // Use animation for smooth transitions
        charts[symbol].update(animate ? 'active' : 'none');
        
        // Update current price with smooth transition
        const currentPrice = prices[prices.length - 1];
        const card = document.querySelector(`[data-symbol="${symbol}"]`);
        const priceElement = card.querySelector('.price');
        
        // Add transition class for price update
        priceElement.style.transition = 'opacity 0.3s ease';
        priceElement.style.opacity = '0.7';
        
        setTimeout(() => {
            priceElement.textContent = `$${currentPrice.toFixed(currentPrice < 10 ? 4 : 2)}`;
            priceElement.style.opacity = '1';
        }, 150);
    } catch (error) {
        console.error(`Error updating chart for ${symbol}:`, error);
    }
}

// Update all charts with loading state
async function updateAllCharts(animate = true) {
    const symbols = ['BTC', 'ETH', 'XRP', 'SOL'];
    
    // Add loading state to all cards
    if (animate) {
        if (currentView === 'chart') {
            document.querySelectorAll('#chart-view .crypto-card').forEach(card => {
                card.classList.add('loading');
            });
        } else if (currentView === 'table') {
            document.querySelectorAll('#table-view .crypto-card').forEach(card => {
                card.classList.add('loading');
            });
        }
    }
    
    // Update charts in parallel for better performance
    await Promise.all(symbols.map(symbol => updateChart(symbol, currentInterval, animate)));
    
    // Update table if in table view
    if (currentView === 'table') {
        updateTableView();
    }
    
    // Remove loading state
    if (animate) {
        setTimeout(() => {
            if (currentView === 'chart') {
                document.querySelectorAll('#chart-view .crypto-card').forEach(card => {
                    card.classList.remove('loading');
                });
            } else if (currentView === 'table') {
                document.querySelectorAll('#table-view .crypto-card').forEach(card => {
                    card.classList.remove('loading');
                });
            }
        }, 300);
    }
}

// Handle time interval buttons with smooth transitions
function setupTimeControls() {
    const buttons = document.querySelectorAll('.time-btn');
    const dropdown = document.getElementById('mobile-time-select');
    
    // Desktop button click handler
    buttons.forEach(button => {
        button.addEventListener('click', async () => {
            // Prevent multiple clicks during transition
            if (button.classList.contains('transitioning')) return;
            
            // Add transitioning state
            buttons.forEach(btn => {
                btn.classList.add('transitioning');
                btn.classList.remove('active');
            });
            button.classList.add('active');
            
            // Update interval and refresh charts with animation
            currentInterval = button.dataset.interval;
            await updateAllCharts(true);
            
            // Sync with mobile dropdown
            if (dropdown) {
                dropdown.value = currentInterval;
            }
            
            // Update table view if active
            if (currentView === 'table') {
                updateTableView();
            }
            
            // Also update fullscreen chart if open
            if (currentFullscreenSymbol && fullscreenChart) {
                await updateFullscreenChart(currentFullscreenSymbol, currentInterval);
            }
            
            // Also update fullscreen table if open
            if (currentFullscreenSymbol && document.getElementById('fullscreen-table').classList.contains('active')) {
                updateFullscreenTable(currentFullscreenSymbol);
            }
            
            // Remove transitioning state
            setTimeout(() => {
                buttons.forEach(btn => btn.classList.remove('transitioning'));
            }, 800);
        });
    });
    
    // Mobile dropdown change handler
    if (dropdown) {
        dropdown.addEventListener('change', async (e) => {
            currentInterval = e.target.value;
            
            // Update desktop buttons to match
            buttons.forEach(btn => {
                btn.classList.remove('active');
                if (btn.dataset.interval === currentInterval) {
                    btn.classList.add('active');
                }
            });
            
            // Update charts
            await updateAllCharts(true);
            
            // Update table view if active
            if (currentView === 'table') {
                updateTableView();
            }
            
            // Also update fullscreen chart if open
            if (currentFullscreenSymbol && fullscreenChart) {
                await updateFullscreenChart(currentFullscreenSymbol, currentInterval);
            }
            
            // Also update fullscreen table if open
            if (currentFullscreenSymbol && document.getElementById('fullscreen-table').classList.contains('active')) {
                updateFullscreenTable(currentFullscreenSymbol);
            }
        });
    }
}

// Setup model controls
function setupModelControls() {
    const buttons = document.querySelectorAll('.model-btn');
    const dropdown = document.getElementById('mobile-model-select');
    
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Sync with mobile dropdown
            if (dropdown) {
                const modelValue = button.textContent.toLowerCase();
                dropdown.value = modelValue;
            }
            
            // Model switching logic would go here
        });
    });
    
    // Mobile dropdown change handler
    if (dropdown) {
        dropdown.addEventListener('change', (e) => {
            const selectedModel = e.target.value;
            
            // Update desktop buttons to match
            buttons.forEach(btn => {
                btn.classList.remove('active');
                if (btn.textContent.toLowerCase() === selectedModel) {
                    btn.classList.add('active');
                }
            });
            
            // Model switching logic would go here
        });
    }
}

// Setup view controls
function setupViewControls() {
    const buttons = document.querySelectorAll('.view-btn');
    const dropdown = document.getElementById('mobile-view-select');
    
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            const viewName = button.textContent.toLowerCase();
            switchView(viewName);
            
            // Update active state
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Sync with mobile dropdown
            if (dropdown) {
                dropdown.value = viewName;
            }
        });
    });
    
    // Mobile dropdown change handler
    if (dropdown) {
        dropdown.addEventListener('change', (e) => {
            const selectedView = e.target.value;
            switchView(selectedView);
            
            // Update desktop buttons to match
            buttons.forEach(btn => {
                btn.classList.remove('active');
                if (btn.textContent.toLowerCase() === selectedView) {
                    btn.classList.add('active');
                }
            });
        });
    }
}

// Switch between views
function switchView(viewName) {
    if (viewName === currentView) return;
    
    const chartView = document.getElementById('chart-view');
    const tableView = document.getElementById('table-view');
    
    // Fade out current view
    if (currentView === 'chart') {
        chartView.classList.add('fade-out');
    } else if (currentView === 'table') {
        tableView.classList.add('fade-out');
    }
    
    // Switch views after fade out
    setTimeout(() => {
        if (viewName === 'chart') {
            chartView.style.display = 'grid';
            tableView.style.display = 'none';
            chartView.classList.remove('fade-out');
            chartView.classList.add('fade-in');
            setTimeout(() => chartView.classList.remove('fade-in'), 300);
        } else if (viewName === 'table') {
            tableView.style.display = 'block';
            chartView.style.display = 'none';
            tableView.classList.remove('fade-out');
            tableView.classList.add('fade-in');
            updateTableView();
            setTimeout(() => tableView.classList.remove('fade-in'), 300);
        }
        
        currentView = viewName;
    }, 300);
}

// Update table view with data
function updateTableView() {
    const symbols = ['BTC', 'ETH', 'XRP', 'SOL'];
    
    symbols.forEach(symbol => {
        const data = allCryptoData[symbol];
        if (!data || data.length === 0) return;
        
        // Update table price
        const prices = data.map(k => k.close);
        const currentPrice = prices[prices.length - 1];
        const priceElement = document.getElementById(`${symbol.toLowerCase()}-table-price`);
        if (priceElement) {
            priceElement.textContent = `$${currentPrice.toFixed(currentPrice < 10 ? 4 : 2)}`;
        }
        
        // Get table body for this symbol
        const tableBody = document.getElementById(`${symbol.toLowerCase()}-table-body`);
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        // Show last 20 entries for each crypto (to fit in the view)
        const recentData = data.slice(-20).reverse();
        
        recentData.forEach(kline => {
            const row = document.createElement('tr');
            
            const date = new Date(kline.open_time);
            const dateStr = formatTableDateTime(date, currentInterval);
            const closePrice = parseFloat(kline.close);
            
            row.innerHTML = `
                <td>${dateStr}</td>
                <td>$${closePrice.toFixed(closePrice < 10 ? 4 : 2)}</td>
                <td>-</td>
                <td>-</td>
            `;
            
            tableBody.appendChild(row);
        });
    });
}

// Format date/time for table view
function formatTableDateTime(date, interval) {
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    if (interval === '1d') {
        delete options.hour;
        delete options.minute;
    } else if (interval === '4h') {
        delete options.minute;
    }
    
    return date.toLocaleString('en-US', options);
}

// Setup fullscreen functionality
function setupFullscreenFeature() {
    const overlay = document.getElementById('fullscreen-overlay');
    const fullscreenContainer = document.getElementById('fullscreen-chart');
    const closeBtn = document.getElementById('close-fullscreen');
    const fullscreenCanvas = document.getElementById('fullscreen-canvas');
    const fullscreenSymbolEl = document.getElementById('fullscreen-symbol');
    const fullscreenPriceEl = document.getElementById('fullscreen-price');
    
    // Table fullscreen elements
    const tableOverlay = document.getElementById('fullscreen-table-overlay');
    const fullscreenTableContainer = document.getElementById('fullscreen-table');
    const closeTableBtn = document.getElementById('close-fullscreen-table');
    const fullscreenTableSymbolEl = document.getElementById('fullscreen-table-symbol');
    const fullscreenTablePriceEl = document.getElementById('fullscreen-table-price');
    const fullscreenTableBody = document.getElementById('fullscreen-table-body');
    
    // Function to open fullscreen chart
    function openFullscreenChart(symbol) {
        currentFullscreenSymbol = symbol;
        const card = document.querySelector(`#chart-view [data-symbol="${symbol}"]`);
        const price = card.querySelector('.price').textContent;
        
        // Update fullscreen header
        fullscreenSymbolEl.textContent = symbol;
        fullscreenPriceEl.textContent = price;
        
        // Show overlay and container
        overlay.classList.add('active');
        fullscreenContainer.classList.add('active');
        document.body.classList.add('fullscreen-active');
        
        // Create fullscreen chart with enhanced options
        const ctx = fullscreenCanvas.getContext('2d');
        
        // Get current chart data and reformat labels for fullscreen
        const sourceChart = charts[symbol];
        
        // Fetch fresh data to get timestamps for proper formatting
        fetch(`/api/klines/${symbol}/${currentInterval}?limit=1000`)
            .then(response => response.json())
            .then(data => {
                const labels = data.map(k => formatTimeFullscreen(k.open_time, currentInterval));
                const prices = data.map(k => k.close);
                
                const chartData = {
                    labels: labels,
                    datasets: [{
                        ...sourceChart.data.datasets[0],
                        data: prices,
                        borderColor: createLineGradient(ctx, symbol, fullscreenCanvas.height),
                        backgroundColor: createAreaGradient(ctx, symbol, fullscreenCanvas.height),
                        borderWidth: 3
                    }]
                };
        
        // Enhanced options for fullscreen
        const fullscreenOptions = {
            ...chartOptions,
            maintainAspectRatio: false,
            responsive: true,
            scales: {
                ...chartOptions.scales,
                x: {
                    ...chartOptions.scales.x,
                    display: true,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: {
                            size: 12
                        },
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: 20
                    }
                },
                y: {
                    ...chartOptions.scales.y,
                    ticks: {
                        ...chartOptions.scales.y.ticks,
                        font: {
                            size: 14
                        },
                        color: 'rgba(255, 255, 255, 0.7)'
                    }
                }
            },
            plugins: {
                ...chartOptions.plugins,
                tooltip: {
                    ...chartOptions.plugins.tooltip,
                    titleFont: {
                        size: 16
                    },
                    bodyFont: {
                        size: 14
                    },
                    padding: 12
                }
            },
            animation: {
                duration: 600,
                easing: 'easeInOutQuart'
            }
        };
        
                // Create the fullscreen chart
                fullscreenChart = new Chart(ctx, {
                    type: 'line',
                    data: chartData,
                    options: fullscreenOptions
                });
            })
            .catch(error => {
                console.error('Error loading fullscreen chart data:', error);
            });
        
        // Setup time controls for fullscreen
        setupFullscreenTimeControls();
    }
    
    // Function to close fullscreen
    function closeFullscreen() {
        overlay.classList.remove('active');
        fullscreenContainer.classList.remove('active');
        document.body.classList.remove('fullscreen-active');
        
        // Destroy fullscreen chart
        if (fullscreenChart) {
            fullscreenChart.destroy();
            fullscreenChart = null;
        }
        
        currentFullscreenSymbol = null;
    }
    
    // Function to open fullscreen table
    function openFullscreenTable(symbol) {
        currentFullscreenSymbol = symbol;
        const card = document.querySelector(`#table-view [data-symbol="${symbol}"]`);
        const price = card.querySelector('.price').textContent;
        
        // Update fullscreen header
        fullscreenTableSymbolEl.textContent = symbol;
        fullscreenTablePriceEl.textContent = price;
        
        // Show overlay and container
        tableOverlay.classList.add('active');
        fullscreenTableContainer.classList.add('active');
        document.body.classList.add('fullscreen-active');
        
        // Populate table with more data
        if (allCryptoData[symbol]) {
            const data = allCryptoData[symbol];
            // Show more rows in fullscreen (up to 50)
            const rowsToShow = Math.min(data.length, 50);
            let tableHTML = '';
            
            for (let i = 0; i < rowsToShow; i++) {
                const item = data[i];
                const date = new Date(item.open_time);
                const dateStr = formatTableDateTime(date, currentInterval);
                const closePrice = item.close.toFixed(item.close < 10 ? 4 : 2);
                
                // Generate mock prediction and accuracy
                const prediction = (item.close * (1 + (Math.random() * 0.02 - 0.01))).toFixed(item.close < 10 ? 4 : 2);
                const accuracy = (85 + Math.random() * 10).toFixed(1);
                
                tableHTML += `
                    <tr>
                        <td>${dateStr}</td>
                        <td>$${closePrice}</td>
                        <td>$${prediction}</td>
                        <td>${accuracy}%</td>
                    </tr>
                `;
            }
            
            fullscreenTableBody.innerHTML = tableHTML;
        }
    }
    
    // Function to close fullscreen table
    function closeFullscreenTable() {
        tableOverlay.classList.remove('active');
        fullscreenTableContainer.classList.remove('active');
        document.body.classList.remove('fullscreen-active');
        currentFullscreenSymbol = null;
    }
    
    // Function to update fullscreen table data
    function updateFullscreenTable(symbol) {
        if (allCryptoData[symbol]) {
            const data = allCryptoData[symbol];
            // Show more rows in fullscreen (up to 50)
            const rowsToShow = Math.min(data.length, 50);
            let tableHTML = '';
            
            for (let i = 0; i < rowsToShow; i++) {
                const item = data[i];
                const date = new Date(item.open_time);
                const dateStr = formatTableDateTime(date, currentInterval);
                const closePrice = item.close.toFixed(item.close < 10 ? 4 : 2);
                
                // Generate mock prediction and accuracy
                const prediction = (item.close * (1 + (Math.random() * 0.02 - 0.01))).toFixed(item.close < 10 ? 4 : 2);
                const accuracy = (85 + Math.random() * 10).toFixed(1);
                
                tableHTML += `
                    <tr>
                        <td>${dateStr}</td>
                        <td>$${closePrice}</td>
                        <td>$${prediction}</td>
                        <td>${accuracy}%</td>
                    </tr>
                `;
            }
            
            fullscreenTableBody.innerHTML = tableHTML;
        }
    }
    
    // Add click listeners to all crypto cards
    document.querySelectorAll('.crypto-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't trigger if clicking on time controls
            if (e.target.closest('.time-btn')) return;
            
            const symbol = card.dataset.symbol;
            
            // Check which view is active and open appropriate fullscreen
            if (currentView === 'chart') {
                openFullscreenChart(symbol);
            } else if (currentView === 'table') {
                openFullscreenTable(symbol);
            }
        });
    });
    
    // Close button listeners
    closeBtn.addEventListener('click', closeFullscreen);
    closeTableBtn.addEventListener('click', closeFullscreenTable);
    
    // Overlay click listeners
    overlay.addEventListener('click', closeFullscreen);
    tableOverlay.addEventListener('click', closeFullscreenTable);
    
    // ESC key listener
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentFullscreenSymbol) {
            if (fullscreenContainer.classList.contains('active')) {
                closeFullscreen();
            } else if (fullscreenTableContainer.classList.contains('active')) {
                closeFullscreenTable();
            }
        }
    });
    
    // Handle window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        if (fullscreenChart) {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                fullscreenChart.resize();
            }, 250);
        }
    });
}

// Create area gradient for fullscreen
function createAreaGradient(ctx, symbol, height) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `${symbolColors[symbol]}40`);
    gradient.addColorStop(1, `${symbolColors[symbol]}00`);
    return gradient;
}

// Setup time controls for fullscreen chart
function setupFullscreenTimeControls() {
    if (!currentFullscreenSymbol || !fullscreenChart) return;
    
    // Update fullscreen chart when main interval changes
    updateFullscreenChart(currentFullscreenSymbol, currentInterval);
}

// Update fullscreen chart data
async function updateFullscreenChart(symbol, interval) {
    if (!fullscreenChart) return;
    
    try {
        const response = await fetch(`/api/klines/${symbol}/${interval}?limit=1000`);
        const data = await response.json();
        
        if (data.length === 0) return;
        
        const labels = data.map(k => formatTimeFullscreen(k.open_time, interval));
        const prices = data.map(k => k.close);
        
        // Update gradients
        const ctx = document.getElementById('fullscreen-canvas').getContext('2d');
        const lineGradient = createLineGradient(ctx, symbol, document.getElementById('fullscreen-canvas').height);
        const areaGradient = createAreaGradient(ctx, symbol, document.getElementById('fullscreen-canvas').height);
        
        fullscreenChart.data.labels = labels;
        fullscreenChart.data.datasets[0].data = prices;
        fullscreenChart.data.datasets[0].borderColor = lineGradient;
        fullscreenChart.data.datasets[0].backgroundColor = areaGradient;
        
        fullscreenChart.update('active');
        
        // Update price
        const currentPrice = prices[prices.length - 1];
        document.getElementById('fullscreen-price').textContent = `$${currentPrice.toFixed(currentPrice < 10 ? 4 : 2)}`;
    } catch (error) {
        console.error(`Error updating fullscreen chart for ${symbol}:`, error);
    }
}

// Auto-refresh every 60 seconds
function startAutoRefresh() {
    setInterval(() => {
        updateAllCharts(false); // No animation for auto-refresh
        
        // Also update fullscreen chart if open
        if (currentFullscreenSymbol && fullscreenChart) {
            updateFullscreenChart(currentFullscreenSymbol, currentInterval);
        }
    }, 60000);
}

// Initialize application
async function init() {
    initializeCharts();
    setupTimeControls();
    setupModelControls();
    setupViewControls();
    setupFullscreenFeature();
    await updateAllCharts(false); // No animation on initial load
    startAutoRefresh();
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
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
            samples: 100,
            threshold: 100
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
                    let datasetLabel = context.dataset.label || '';
                    const value = context.parsed.y;
                    const numericValue = (typeof value === 'number' && !isNaN(value)) ? value : 0;
                    const formattedValue = '$' + numericValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    if (datasetLabel.endsWith(' Past Predictions')) {
                        return `Past Pred: ${formattedValue}`;
                    } else if (datasetLabel.endsWith(' Future Predictions')) {
                        return `Future Pred: ${formattedValue}`;
                    } else { // Actual data series (e.g., 'BTC', 'ETH')
                        return `Actual: ${formattedValue}`;
                    }
                }
            }
        },
        zoom: {
            zoom: {
                wheel: {
                    enabled: true,
                    speed: 0.1,
                    modifierKey: null
                },
                pinch: {
                    enabled: true
                },
                mode: 'xy',
                drag: {
                    enabled: true,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    borderColor: 'rgba(255,255,255,0.3)',
                    borderWidth: 1
                }
            },
            pan: {
                enabled: true,
                mode: 'xy',
                modifierKey: null
            },
            limits: {
                x: {
                    min: 'original',
                    max: 'original'
                },
                y: {
                    min: 'original',
                    max: 'original'
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
let currentAIModel = 'GPT';
let fullscreenChart = null;
let currentFullscreenSymbol = null;
let currentView = 'chart';
let allCryptoData = {}; // Store data for all cryptocurrencies
let allPredictions = {}; // Store predictions for all cryptocurrencies
let allAccuracyMetrics = {}; // Store accuracy metrics for all cryptocurrencies

// WebSocket connection
let ws = null;
let wsReconnectInterval = null;

// Store initial and previous prices for price change display
const initialPrices = {
    BTC: null,
    ETH: null,
    XRP: null,
    SOL: null
};

const previousPrices = {
    BTC: null,
    ETH: null,
    XRP: null,
    SOL: null
};


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
                { position: 0, color: '#FF5400' },
                { position: 0.25, color: '#FF7800' },
                { position: 0.5, color: '#FF8A00' },  
                { position: 0.75, color: '#FFD700' }, 
                { position: 1, color: '#FFEA00' }     
            ]
        },
        'ETH': {
            stops: [
                { position: 0, color: '#460089' },    
                { position: 0.25, color: '#5004AE' }, 
                { position: 0.5, color: '#7B3FF2' },  
                { position: 0.75, color: '#9C27B0' }, 
                { position: 1, color: '#F625AC' }     
            ]
        },
        'XRP': {
            stops: [
                { position: 0, color: '#055DCB' },   
                { position: 0.25, color: '#0486D7' }, 
                { position: 0.5, color: '#00BCD1' },  
                { position: 0.75, color: '#02DAE2' }, 
                { position: 1, color: '#00E5FF' }     
            ]
        },
        'SOL': {
            stops: [
                { position: 0, color: '#009100' },
                { position: 0.25, color: '#00A600' }, 
                { position: 0.5, color: '#00B64C' },  
                { position: 0.75, color: '#00E676' }, 
                { position: 1, color: '#76FF03' }
            ]
        }
    };
    
    const gradient = gradientColors[symbol];
    const lineGradient = ctx.createLinearGradient(0, 450, 0, 0); 
    
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
        
        // Add double-click to reset zoom
        canvas.addEventListener('dblclick', () => {
            charts[symbol].resetZoom();
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
        options.year = 'numeric';
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
        // Format: M/D/YY (e.g., 5/23/24)
        const year = date.getFullYear().toString().slice(-2);
        return `${month}/${day}/${year}`;
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
async function updateChart(symbol, interval, animate = true, isFullscreen = false) {
    try {
        const response = await fetch(`/api/klines/${symbol}/${interval}?limit=1000`);
        const data = await response.json();
        
        if (data.length === 0) return;
        
        // Store full data for table view and fullscreen charts
        allCryptoData[symbol] = data;
        
        // Fetch predictions for the current AI model
        const predictions = await fetchPredictions(symbol, interval);
        
        // For grid charts, limit to last 150 data points
        // For fullscreen charts, use all available data
        const chartData = isFullscreen ? data : data.slice(-150);
        
        const labels = chartData.map(k => formatTime(k.open_time, interval));
        const prices = chartData.map(k => k.close);
        
        // Update line gradient based on new data range
        const canvas = document.getElementById(`${symbol.toLowerCase()}-chart`);
        const ctx = canvas.getContext('2d');
        const lineGradient = createLineGradient(ctx, symbol, canvas.height);
        
        // Create area gradient for actual data
        const areaGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        areaGradient.addColorStop(0, `${symbolColors[symbol]}10`);
        areaGradient.addColorStop(1, `${symbolColors[symbol]}00`);
        
        // Prepare prediction data
        let pastPredictionLabels = [];
        let pastPredictionData = [];
        let futurePredictionLabels = [];
        let futurePredictionData = [];
        
        if (predictions && predictions.length > 0) {
            const currentTime = Date.now();
            const lastHistoricalTime = chartData.length > 0 ? chartData[chartData.length - 1].open_time : 0;
            
            predictions.forEach(pred => {
                const predLabel = formatTime(pred.timestamp, interval);
                const predPrice = pred.predicted_price;
                
                if (pred.timestamp <= lastHistoricalTime) {
                    // Past prediction
                    pastPredictionLabels.push(predLabel);
                    pastPredictionData.push(predPrice);
                } else {
                    // Future prediction
                    futurePredictionLabels.push(predLabel);
                    futurePredictionData.push(predPrice);
                }
            });
        }
        
        // Create prediction gradients (more subtle)
        const predictionLineGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        const baseColor = symbolColors[symbol];
        predictionLineGradient.addColorStop(0, `${baseColor}60`); // 37.5% opacity (increased from 25%)
        predictionLineGradient.addColorStop(1, `${baseColor}40`); // 25% opacity (increased from 12.5%)
        
        const predictionAreaGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        predictionAreaGradient.addColorStop(0, `${baseColor}15`); // 8% opacity (increased from 5%)
        predictionAreaGradient.addColorStop(1, `${baseColor}00`); // 0% opacity
        
        // Update chart datasets
        charts[symbol].data.labels = labels;
        charts[symbol].data.datasets = [
            // Actual price data (main dataset) - SOLID GRADIENT LINE 
            {
                label: symbol,
                data: prices,
                borderColor: lineGradient,
                backgroundColor: 'transparent',
                fill: false,
                borderWidth: 2.5,
                pointRadius: 0,
                tension: 0.2
            },
            // Past predictions - WITH AREA FILL
            {
                label: `${symbol} Past Predictions`,
                data: pastPredictionData.length > 0 ?
                    (() => {
                        // Create a map of timestamps to prediction values for faster lookup
                        const predictionMap = new Map();
                        predictions.forEach(pred => {
                            if (pred.timestamp <= (chartData.length > 0 ? chartData[chartData.length - 1].open_time : 0)) {
                                predictionMap.set(pred.timestamp, pred.predicted_price);
                            }
                        });
                        
                        // Map data by matching timestamps instead of formatted labels
                        const mappedData = chartData.map(dataPoint => {
                            return predictionMap.get(dataPoint.open_time) || null;
                        });
                        
                        // Debug logging for 1d timeframe
                        if (currentInterval === '1d') {
                            console.log('1d Past Predictions Debug:', {
                                predictionMapSize: predictionMap.size,
                                mappedDataLength: mappedData.length,
                                nonNullValues: mappedData.filter(v => v !== null).length,
                                mappedData: mappedData.filter(v => v !== null),
                                isFullscreen: isFullscreen,
                                chartDataLength: chartData.length
                            });
                        }
                        
                        return mappedData;
                    })() : [],
                borderColor: 'rgba(255, 255, 255, 0.8)', // More subtle white line for past predictions
                backgroundColor: 'rgba(255, 255, 255, 0.05)', // Very subtle white fill for past predictions
                fill: true,
                borderWidth: 1.5, // Slightly thinner line
                borderDash: [], // Solid line
                pointRadius: 2, 
                pointBackgroundColor: 'rgba(255, 255, 255, 0.4)',
                pointBorderColor: 'rgba(255, 255, 255, 0.4)',
                pointBorderWidth: 1,
                pointHoverRadius: 6,
                tension: 0.2,
                spanGaps: true
            },
            // Future predictions - DOTTED LINE NO AREA FILL
            {
                label: `${symbol} Future Predictions`,
                data: labels.concat(futurePredictionLabels).map((label, idx) => {
                    if (idx === labels.length - 1) {
                        // Connect to last actual price
                        return prices[prices.length - 1];
                    } else if (idx >= labels.length) {
                        const predIdx = futurePredictionLabels.indexOf(label);
                        return predIdx !== -1 ? futurePredictionData[predIdx] : null;
                    }
                    return null;
                }),
                borderColor: predictionLineGradient,
                backgroundColor: 'transparent',
                fill: false,
                borderWidth: 3, // Thicker line for more prominence
                borderDash: [4, 6], // More prominent dashed pattern
                pointRadius: 0,
                tension: 0.2,
                spanGaps: true
            }
        ];
        
        // Update labels to include future predictions
        if (futurePredictionLabels.length > 0) {
            charts[symbol].data.labels = labels.concat(futurePredictionLabels);
        }
        
        // Use animation for smooth transitions
        charts[symbol].update(animate ? 'active' : 'none');
        
        // Reset zoom when updating chart (e.g., when switching intervals)
        if (charts[symbol].isZoomedOrPanned && charts[symbol].isZoomedOrPanned()) {
            charts[symbol].resetZoom();
        }
        
        // Update current price with smooth transition
        const currentPrice = prices[prices.length - 1];
        
        // Set initial price if not set
        if (initialPrices[symbol] === null) {
            initialPrices[symbol] = currentPrice;
        }
        
        updatePriceDisplay(symbol, currentPrice);
    } catch (error) {
        console.error(`Error updating chart for ${symbol}:`, error);
    }
}

// Fetch predictions for a symbol/interval
async function fetchPredictions(symbol, interval) {
    try {
        // Get the current AI provider (convert to lowercase)
        const provider = currentAIModel.toLowerCase();
        const response = await fetch(`/api/predictions/${symbol}/${interval}?provider=${provider}`);
        if (response.ok) {
            const predictions = await response.json();
            // Store predictions indexed by symbol-interval-provider
            const key = `${symbol}-${interval}-${provider}`;
            allPredictions[key] = predictions;
            return predictions;
        }
    } catch (error) {
        console.error(`Error fetching predictions for ${symbol}/${interval} with ${currentAIModel}:`, error);
    }
    return [];
}

// Fetch accuracy metrics for a symbol/interval
async function fetchAccuracyMetrics(symbol, interval) {
    try {
        const response = await fetch(`/api/predictions/accuracy/${symbol}/${interval}`);
        if (response.ok) {
            const metrics = await response.json();
            // Store metrics indexed by symbol-interval
            const key = `${symbol}-${interval}`;
            allAccuracyMetrics[key] = metrics;
            return metrics;
        }
    } catch (error) {
        console.error(`Error fetching accuracy metrics for ${symbol}/${interval}:`, error);
    }
    return null;
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
    
    // Update charts in parallel for better performance (grid charts with 150 point limit)
    await Promise.all(symbols.map(symbol => updateChart(symbol, currentInterval, animate, false)));
    
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
    const customDropdown = document.getElementById('desktop-model-select-custom');
    const mobileModelSelect = document.getElementById('mobile-model-select'); // Keep for mobile

    const handleModelChange = (selectedValue) => {
        const newModel = selectedValue.toUpperCase(); // GPT, GEMINI, CLAUDE
        if (currentAIModel !== newModel) {
            currentAIModel = newModel;
            console.log(`AI Model changed to: ${currentAIModel}`);
            
            updateAllCharts(true);
            if (currentView === 'table') {
                updateTableView();
            }
            if (fullscreenChart && currentFullscreenSymbol) {
                updateFullscreenChart(currentFullscreenSymbol, currentInterval);
            }
            const fullscreenTable = document.getElementById('fullscreen-table');
            if (fullscreenTable.style.display === 'flex' && currentFullscreenSymbol) {
                updateFullscreenTable(currentFullscreenSymbol);
            }
        }
    };

    if (customDropdown) {
        const selectedDisplay = customDropdown.querySelector('.custom-dropdown-selected');
        const selectedTextElement = customDropdown.querySelector('.custom-dropdown-selected-text');
        const optionsList = customDropdown.querySelector('.custom-dropdown-options');
        const options = Array.from(customDropdown.querySelectorAll('.custom-dropdown-option'));

        // Set initial selected text based on HTML
        const initialSelectedOption = options.find(opt => opt.classList.contains('selected'));
        if (initialSelectedOption) {
            selectedTextElement.textContent = initialSelectedOption.textContent;
            // currentAIModel = initialSelectedOption.dataset.value.toUpperCase(); // Set initial model
        } else if (options.length > 0) { // Fallback to first option if none selected
            options[0].classList.add('selected');
            selectedTextElement.textContent = options[0].textContent;
            // currentAIModel = options[0].dataset.value.toUpperCase();
        }


        selectedDisplay.addEventListener('click', (event) => {
            event.stopPropagation();
            customDropdown.classList.toggle('open');
            optionsList.style.display = customDropdown.classList.contains('open') ? 'block' : 'none';
        });
        
        customDropdown.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                customDropdown.classList.toggle('open');
                optionsList.style.display = customDropdown.classList.contains('open') ? 'block' : 'none';
                 if(customDropdown.classList.contains('open')) {
                    options.find(o => o.classList.contains('selected') || o)?.focus();
                 }
            } else if (event.key === 'Escape' && customDropdown.classList.contains('open')) {
                customDropdown.classList.remove('open');
                optionsList.style.display = 'none';
                selectedDisplay.focus();
            } else if (customDropdown.classList.contains('open') && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault();
                let currentIndex = options.findIndex(opt => opt === document.activeElement);
                if (currentIndex === -1) { // If no option is focused, focus the selected one or the first one
                    currentIndex = options.findIndex(opt => opt.classList.contains('selected'));
                    if (currentIndex === -1) currentIndex = -1; // Will become 0 after +1 for ArrowDown
                }

                if (event.key === 'ArrowDown') {
                    currentIndex = (currentIndex + 1) % options.length;
                } else { // ArrowUp
                    currentIndex = (currentIndex - 1 + options.length) % options.length;
                }
                options[currentIndex].focus();
            }
        });

        options.forEach(option => {
            option.setAttribute('tabindex', '0'); // Make options focusable
            option.addEventListener('click', function() {
                selectOption(this);
            });
            option.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectOption(this);
                }
            });
        });
        
        function selectOption(optionElement) {
            const selectedValue = optionElement.dataset.value;
            selectedTextElement.textContent = optionElement.textContent;
            
            options.forEach(opt => opt.classList.remove('selected'));
            optionElement.classList.add('selected');

            customDropdown.classList.remove('open');
            optionsList.style.display = 'none';
            selectedDisplay.focus(); // Return focus to the main dropdown element

            handleModelChange(selectedValue);

            if (mobileModelSelect && mobileModelSelect.value !== selectedValue) {
                mobileModelSelect.value = selectedValue;
            }
        }

        document.addEventListener('click', (event) => {
            if (!customDropdown.contains(event.target) && customDropdown.classList.contains('open')) {
                customDropdown.classList.remove('open');
                optionsList.style.display = 'none';
            }
        });
        
        // Set initial model from custom dropdown's default selected
        const initiallySelected = options.find(opt => opt.classList.contains('selected'));
        if (initiallySelected && !currentAIModel) { // Only set if not already set (e.g. by mobile)
             currentAIModel = initiallySelected.dataset.value.toUpperCase();
        } else if (options.length > 0 && !currentAIModel) {
             currentAIModel = options[0].dataset.value.toUpperCase(); // Fallback
        }

    }

    if (mobileModelSelect) {
        mobileModelSelect.addEventListener('change', (event) => {
            const selectedValue = event.target.value;
            handleModelChange(selectedValue);
            if (customDropdown) {
                const selectedTextElement = customDropdown.querySelector('.custom-dropdown-selected-text');
                const options = customDropdown.querySelectorAll('.custom-dropdown-option');
                let found = false;
                options.forEach(opt => {
                    if (opt.dataset.value === selectedValue) {
                        selectedTextElement.textContent = opt.textContent;
                        opt.classList.add('selected');
                        found = true;
                    } else {
                        opt.classList.remove('selected');
                    }
                });
                 if (!found && options.length > 0) { // Fallback if value not in custom
                    selectedTextElement.textContent = options[0].textContent;
                    options[0].classList.add('selected');
                 }
            }
        });
        // Sync initial state if mobile has a value and custom dropdown doesn't match or isn't set
        if (mobileModelSelect.value && customDropdown) {
            const customSelectedValue = customDropdown.querySelector('.custom-dropdown-option.selected')?.dataset.value;
            if (customSelectedValue !== mobileModelSelect.value) {
                 const selectedTextElement = customDropdown.querySelector('.custom-dropdown-selected-text');
                 const options = customDropdown.querySelectorAll('.custom-dropdown-option');
                 let found = false;
                 options.forEach(opt => {
                    if (opt.dataset.value === mobileModelSelect.value) {
                        selectedTextElement.textContent = opt.textContent;
                        opt.classList.add('selected');
                        found = true;
                    } else {
                        opt.classList.remove('selected');
                    }
                 });
                 if (!found && options.length > 0) { // Fallback
                    selectedTextElement.textContent = options[0].textContent;
                    options[0].classList.add('selected');
                 }
                 currentAIModel = mobileModelSelect.value.toUpperCase();
            }
        } else if (mobileModelSelect.value && !currentAIModel) {
            currentAIModel = mobileModelSelect.value.toUpperCase();
        }
    }
     // Final check for initial currentAIModel if it's still default 'GPT' but HTML has other selected
    if (currentAIModel === 'GPT') {
        const desktopInitial = document.querySelector('#desktop-model-select-custom .custom-dropdown-option.selected');
        if (desktopInitial && desktopInitial.dataset.value.toUpperCase() !== 'GPT') {
            currentAIModel = desktopInitial.dataset.value.toUpperCase();
        } else {
            const mobileInitial = document.getElementById('mobile-model-select');
            if (mobileInitial && mobileInitial.value.toUpperCase() !== 'GPT') {
                 currentAIModel = mobileInitial.value.toUpperCase();
            }
        }
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
    const sentimentView = document.getElementById('sentiment-view');
    
    // Fade out current view
    if (currentView === 'chart') {
        chartView.classList.add('fade-out');
    } else if (currentView === 'table') {
        tableView.classList.add('fade-out');
    } else if (currentView === 'sentiment') {
        sentimentView.classList.add('fade-out');
    }
    
    // Switch views after fade out
    setTimeout(() => {
        if (viewName === 'chart') {
            chartView.style.display = 'grid';
            tableView.style.display = 'none';
            sentimentView.style.display = 'none';
            chartView.classList.remove('fade-out');
            chartView.classList.add('fade-in');
            setTimeout(() => chartView.classList.remove('fade-in'), 300);
        } else if (viewName === 'table') {
            tableView.style.display = 'block';
            chartView.style.display = 'none';
            sentimentView.style.display = 'none';
            tableView.classList.remove('fade-out');
            tableView.classList.add('fade-in');
            updateTableView();
            setTimeout(() => tableView.classList.remove('fade-in'), 300);
        } else if (viewName === 'sentiment') {
            sentimentView.style.display = 'block';
            chartView.style.display = 'none';
            tableView.style.display = 'none';
            sentimentView.classList.remove('fade-out');
            sentimentView.classList.add('fade-in');
            updateSentimentView();
            setTimeout(() => sentimentView.classList.remove('fade-in'), 300);
        }
        
        currentView = viewName;
    }, 300);
}

// Update table view with data
async function updateTableView() {
    const symbols = ['BTC', 'ETH', 'XRP', 'SOL'];
    
    await Promise.all(symbols.map(async (symbol) => {
        const data = allCryptoData[symbol];
        if (!data || data.length === 0) return;
        
        // Fetch predictions and accuracy for this symbol
        const predictions = await fetchPredictions(symbol, currentInterval);
        const accuracyMetrics = await fetchAccuracyMetrics(symbol, currentInterval);
        
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
        
        // Create a map of predictions by timestamp for easy lookup
        const predictionMap = {};
        if (predictions && predictions.length > 0) {
            predictions.forEach(pred => {
                predictionMap[pred.timestamp] = pred;
            });
        }
        
        // Create a map to track processed timestamps to avoid duplicates
        const processedTimestamps = new Set();
        const allRows = [];
        
        // Add historical data (last 10 entries)
        const recentData = data.slice(-10).reverse();
        recentData.forEach(kline => {
            const timestamp = kline.open_time;
            if (!processedTimestamps.has(timestamp)) {
                processedTimestamps.add(timestamp);
                const prediction = predictionMap[timestamp];
                allRows.push({
                    timestamp: timestamp,
                    type: 'historical',
                    closePrice: parseFloat(kline.close),
                    prediction: prediction
                });
            }
        });
        
        // Add future predictions (only those that don't have historical data)
        const currentTime = Date.now();
        const lastHistoricalTime = data.length > 0 ? data[data.length - 1].open_time : 0;
        
        if (predictions && predictions.length > 0) {
            predictions.forEach(pred => {
                // Only add if it's a future prediction (no historical data exists for this timestamp)
                if (!processedTimestamps.has(pred.timestamp) && pred.timestamp > lastHistoricalTime) {
                    processedTimestamps.add(pred.timestamp);
                    allRows.push({
                        timestamp: pred.timestamp,
                        type: 'future',
                        closePrice: null,
                        prediction: pred
                    });
                }
            });
        }
        
        // Sort by timestamp (newest first)
        allRows.sort((a, b) => b.timestamp - a.timestamp);
        
        // Display up to 100 rows
        const displayRows = allRows.slice(0, 100);
        
        displayRows.forEach(rowData => {
            const row = document.createElement('tr');
            
            const date = new Date(rowData.timestamp);
            const dateStr = formatTableDateTime(date, currentInterval);
            
            let closePriceHtml = '-';
            let predictionHtml = '-';
            let accuracyHtml = '-';
            
            if (rowData.type === 'historical') {
                // Historical row with actual close price
                closePriceHtml = `$${rowData.closePrice.toFixed(rowData.closePrice < 10 ? 4 : 2)}`;
                
                if (rowData.prediction) {
                    // Show predicted price with AI indicator
                    const predPrice = rowData.prediction.predicted_price;
                    predictionHtml = `$${predPrice.toFixed(predPrice < 10 ? 4 : 2)} <span class="ai-indicator">${currentAIModel}</span>`;
                    
                    // Calculate accuracy based on the actual close price we have
                    const accuracy = 100 - Math.abs((rowData.prediction.predicted_price - rowData.closePrice) / rowData.closePrice * 100);
                    const accuracyClass = accuracy >= 95 ? 'accuracy-high' : accuracy >= 85 ? 'accuracy-medium' : 'accuracy-low';
                    accuracyHtml = `<span class="${accuracyClass}">±${(100 - accuracy).toFixed(1)}%</span>`;
                }
            } else {
                // Future prediction row
                closePriceHtml = '-';
                const predPrice = rowData.prediction.predicted_price;
                predictionHtml = `$${predPrice.toFixed(predPrice < 10 ? 4 : 2)} <span class="ai-indicator">${currentAIModel}</span>`;
                accuracyHtml = '-';
            }
            
            row.innerHTML = `
                <td>${dateStr}</td>
                <td>${closePriceHtml}</td>
                <td>${predictionHtml}</td>
                <td>${accuracyHtml}</td>
            `;
            
            tableBody.appendChild(row);
        });
        
        // Add overall accuracy at the bottom of the table
        if (accuracyMetrics && accuracyMetrics.overall_accuracy !== undefined) {
            const card = document.querySelector(`#table-view [data-symbol="${symbol}"]`);
            let accuracyElement = card.querySelector('.overall-accuracy');
            
            if (!accuracyElement) {
                accuracyElement = document.createElement('div');
                accuracyElement.className = 'overall-accuracy';
                card.querySelector('.crypto-table').appendChild(accuracyElement);
            }
            
            const accuracy = accuracyMetrics.overall_accuracy;
            const accuracyClass = accuracy >= 95 ? 'accuracy-high' : accuracy >= 85 ? 'accuracy-medium' : 'accuracy-low';
            accuracyElement.innerHTML = `Model Accuracy: <span class="${accuracyClass}">${accuracy.toFixed(1)}%</span>`;
        }
    }));
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
    } else if (interval === '4h' || interval === '1h') {
        // For both 1h and 4h intervals, use consistent "hour am/pm" format
        options.hour = 'numeric';
        options.hour12 = true;
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
    async function openFullscreenChart(symbol) {
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
        
        // Use the full dataset for fullscreen charts
        const response = await fetch(`/api/klines/${symbol}/${currentInterval}?limit=1000`);
        const data = await response.json();
        
        const labels = data.map(k => formatTimeFullscreen(k.open_time, currentInterval));
        const prices = data.map(k => k.close);
        
        // Fetch predictions for the current AI model
        const predictions = await fetchPredictions(symbol, currentInterval);
                
        // Prepare prediction data
        let pastPredictionLabels = [];
        let pastPredictionData = [];
        let futurePredictionLabels = [];
        let futurePredictionData = [];
        
        if (predictions && predictions.length > 0) {
            const lastHistoricalTime = data.length > 0 ? data[data.length - 1].open_time : 0;
            
            predictions.forEach(pred => {
                const predLabel = formatTimeFullscreen(pred.timestamp, currentInterval);
                const predPrice = pred.predicted_price;
                
                if (pred.timestamp <= lastHistoricalTime) {
                    // Past prediction
                    pastPredictionLabels.push(predLabel);
                    pastPredictionData.push(predPrice);
                } else {
                    // Future prediction
                    futurePredictionLabels.push(predLabel);
                    futurePredictionData.push(predPrice);
                }
            });
        }
        
        // Create prediction gradients (more subtle)
        const predictionLineGradient = ctx.createLinearGradient(0, 0, 0, fullscreenCanvas.height);
        const baseColor = symbolColors[symbol];
        predictionLineGradient.addColorStop(0, `${baseColor}40`); // 25% opacity
        predictionLineGradient.addColorStop(1, `${baseColor}20`); // 12.5% opacity
        
        const predictionAreaGradient = ctx.createLinearGradient(0, 0, 0, fullscreenCanvas.height);
        predictionAreaGradient.addColorStop(0, `${baseColor}08`); // 5% opacity
        predictionAreaGradient.addColorStop(1, `${baseColor}00`); // 0% opacity
        
        const chartData = {
            labels: futurePredictionLabels.length > 0 ? labels.concat(futurePredictionLabels) : labels,
            datasets: [
                // Actual price data (main dataset) - SOLID GRADIENT LINE WITH AREA FILL
                {
                    label: symbol,
                    data: prices,
                    borderColor: createLineGradient(ctx, symbol, fullscreenCanvas.height),
                    backgroundColor: 'transparent',
                    fill: false,
                    borderWidth: 3,
                    pointRadius: 0,
                    tension: 0.2
                },
                // Past predictions - WITH AREA FILL
                {
                    label: `${symbol} Past Predictions`,
                    data: pastPredictionData.length > 0 ?
                        labels.map(label => {
                            const idx = pastPredictionLabels.indexOf(label);
                            return idx !== -1 ? pastPredictionData[idx] : null;
                        }) : [],
                    borderColor: 'rgba(255, 255, 255, 0.8)', // More subtle white line for past predictions
                    backgroundColor: 'rgba(255, 255, 255, 0.05)', // Very subtle white fill for past predictions
                    fill: true,
                    borderWidth: 1.5, // Slightly thinner line
                    borderDash: [], // Solid line
                    pointRadius: 2,
                    pointBackgroundColor: 'rgba(255, 255, 255, 0.4)',
                    pointBorderColor: 'rgba(255, 255, 255, 0.4)',
                    pointBorderWidth: 1,
                    pointHoverRadius: 6,
                    tension: 0.2,
                    spanGaps: true
                },
                // Future predictions - DOTTED LINE NO AREA FILL
                {
                    label: `${symbol} Future Predictions`,
                    data: labels.concat(futurePredictionLabels).map((label, idx) => {
                        if (idx === labels.length - 1) {
                            // Connect to last actual price
                            return prices[prices.length - 1];
                        } else if (idx >= labels.length) {
                            const predIdx = futurePredictionLabels.indexOf(label);
                            return predIdx !== -1 ? futurePredictionData[predIdx] : null;
                        }
                        return null;
                    }),
                    borderColor: predictionLineGradient,
                    backgroundColor: 'transparent',
                    fill: false,
                    borderWidth: 3,
                    borderDash: [4, 6],
                    pointRadius: 0,
                    tension: 0.2,
                    spanGaps: true
                }
            ]
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
                decimation: {
                    enabled: false  // Disable decimation for fullscreen to show full history
                },
                tooltip: {
                    ...chartOptions.plugins.tooltip,
                    titleFont: {
                        size: 16
                    },
                    bodyFont: {
                        size: 14
                    },
                    padding: 12
                },
                zoom: {
                    ...chartOptions.plugins.zoom,
                    zoom: {
                        ...chartOptions.plugins.zoom.zoom,
                        wheel: {
                            enabled: true,
                            speed: 0.1,
                            modifierKey: null
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'x'
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: null
                    }
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
        
        // Add double-click to reset zoom on fullscreen chart
        fullscreenCanvas.addEventListener('dblclick', () => {
            if (fullscreenChart) {
                fullscreenChart.resetZoom();
            }
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
        
        // Update table with predictions
        updateFullscreenTable(symbol);
    }
    
    // Function to close fullscreen table
    function closeFullscreenTable() {
        tableOverlay.classList.remove('active');
        fullscreenTableContainer.classList.remove('active');
        document.body.classList.remove('fullscreen-active');
        currentFullscreenSymbol = null;
    }
    
    // Function to update fullscreen table data
    async function updateFullscreenTable(symbol) {
        if (allCryptoData[symbol]) {
            const data = allCryptoData[symbol];
            
            // Fetch predictions for fullscreen view
            const predictions = await fetchPredictions(symbol, currentInterval);
            const accuracyMetrics = await fetchAccuracyMetrics(symbol, currentInterval);
            
            // Create prediction map
            const predictionMap = {};
            if (predictions && predictions.length > 0) {
                predictions.forEach(pred => {
                    predictionMap[pred.timestamp] = pred;
                });
            }
            
            // Create a map to track processed timestamps to avoid duplicates
            const processedTimestamps = new Set();
            const allRows = [];
            
            // Add all historical data
            data.forEach(item => {
                const timestamp = item.open_time;
                if (!processedTimestamps.has(timestamp)) {
                    processedTimestamps.add(timestamp);
                    const prediction = predictionMap[timestamp];
                    allRows.push({
                        timestamp: timestamp,
                        type: 'historical',
                        closePrice: parseFloat(item.close),
                        prediction: prediction
                    });
                }
            });
            
            // Add future predictions (only those that don't have historical data)
            const lastHistoricalTime = data.length > 0 ? data[data.length - 1].open_time : 0;
            
            if (predictions && predictions.length > 0) {
                predictions.forEach(pred => {
                    // Only add if it's a future prediction (no historical data exists for this timestamp)
                    if (!processedTimestamps.has(pred.timestamp) && pred.timestamp > lastHistoricalTime) {
                        processedTimestamps.add(pred.timestamp);
                        allRows.push({
                            timestamp: pred.timestamp,
                            type: 'future',
                            closePrice: null,
                            prediction: pred
                        });
                    }
                });
            }
            
            // Sort by timestamp (newest first)
            allRows.sort((a, b) => b.timestamp - a.timestamp);
            
            let tableHTML = '';
            
            allRows.forEach(rowData => {
                const date = new Date(rowData.timestamp);
                const dateStr = formatTableDateTime(date, currentInterval);
                
                let closePriceHtml = '-';
                let predictionHtml = '-';
                let accuracyHtml = '-';
                
                if (rowData.type === 'historical') {
                    // Historical row with actual close price
                    closePriceHtml = `$${rowData.closePrice.toFixed(rowData.closePrice < 10 ? 4 : 2)}`;
                    
                    if (rowData.prediction) {
                        // Show predicted price with AI indicator
                        const predPrice = rowData.prediction.predicted_price;
                        predictionHtml = `$${predPrice.toFixed(predPrice < 10 ? 4 : 2)} <span class="ai-indicator">${currentAIModel}</span>`;
                        
                        // Calculate accuracy based on the actual close price we have
                        const accuracy = 100 - Math.abs((rowData.prediction.predicted_price - rowData.closePrice) / rowData.closePrice * 100);
                        const accuracyClass = accuracy >= 95 ? 'accuracy-high' : accuracy >= 85 ? 'accuracy-medium' : 'accuracy-low';
                        accuracyHtml = `<span class="${accuracyClass}">±${(100 - accuracy).toFixed(1)}%</span>`;
                    }
                } else {
                    // Future prediction row
                    closePriceHtml = '-';
                    const predPrice = rowData.prediction.predicted_price;
                    predictionHtml = `$${predPrice.toFixed(predPrice < 10 ? 4 : 2)} <span class="ai-indicator">${currentAIModel}</span>`;
                    accuracyHtml = '-';
                }
                
                tableHTML += `
                    <tr>
                        <td>${dateStr}</td>
                        <td>${closePriceHtml}</td>
                        <td>${predictionHtml}</td>
                        <td>${accuracyHtml}</td>
                    </tr>
                `;
            });
            
            fullscreenTableBody.innerHTML = tableHTML;
            
            // Add overall accuracy at the bottom
            if (accuracyMetrics && accuracyMetrics.overall_accuracy !== undefined) {
                let accuracyElement = fullscreenTableContainer.querySelector('.overall-accuracy');
                
                if (!accuracyElement) {
                    accuracyElement = document.createElement('div');
                    accuracyElement.className = 'overall-accuracy fullscreen-accuracy';
                    fullscreenTableContainer.querySelector('.fullscreen-table-container').appendChild(accuracyElement);
                }
                
                const accuracy = accuracyMetrics.overall_accuracy;
                const accuracyClass = accuracy >= 95 ? 'accuracy-high' : accuracy >= 85 ? 'accuracy-medium' : 'accuracy-low';
                accuracyElement.innerHTML = `Model Accuracy: <span class="${accuracyClass}">${accuracy.toFixed(1)}%</span>`;
            }
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
        
        // Fetch predictions for the current AI model
        const predictions = await fetchPredictions(symbol, interval);
        
        const labels = data.map(k => formatTimeFullscreen(k.open_time, interval));
        const prices = data.map(k => k.close);
        
        // Update gradients
        const ctx = document.getElementById('fullscreen-canvas').getContext('2d');
        const lineGradient = createLineGradient(ctx, symbol, document.getElementById('fullscreen-canvas').height);
        const areaGradient = createAreaGradient(ctx, symbol, document.getElementById('fullscreen-canvas').height);
        
        // Prepare prediction data
        let pastPredictionLabels = [];
        let pastPredictionData = [];
        let futurePredictionLabels = [];
        let futurePredictionData = [];
        
        if (predictions && predictions.length > 0) {
            const lastHistoricalTime = data.length > 0 ? data[data.length - 1].open_time : 0;
            
            predictions.forEach(pred => {
                const predLabel = formatTimeFullscreen(pred.timestamp, interval);
                const predPrice = pred.predicted_price;
                
                if (pred.timestamp <= lastHistoricalTime) {
                    // Past prediction
                    pastPredictionLabels.push(predLabel);
                    pastPredictionData.push(predPrice);
                } else {
                    // Future prediction
                    futurePredictionLabels.push(predLabel);
                    futurePredictionData.push(predPrice);
                }
            });
        }
        
        // Create prediction gradients (more subtle)
        const predictionLineGradient = ctx.createLinearGradient(0, 0, 0, document.getElementById('fullscreen-canvas').height);
        const baseColor = symbolColors[symbol];
        predictionLineGradient.addColorStop(0, `${baseColor}40`); // 25% opacity
        predictionLineGradient.addColorStop(1, `${baseColor}20`); // 12.5% opacity
        
        const predictionAreaGradient = ctx.createLinearGradient(0, 0, 0, document.getElementById('fullscreen-canvas').height);
        predictionAreaGradient.addColorStop(0, `${baseColor}08`); // 5% opacity
        predictionAreaGradient.addColorStop(1, `${baseColor}00`); // 0% opacity
        
        // Update chart datasets
        fullscreenChart.data.labels = labels;
        fullscreenChart.data.datasets = [
            // Actual price data (main dataset) - SOLID GRADIENT LINE WITH AREA FILL
            {
                label: symbol,
                data: prices,
                borderColor: lineGradient,
                backgroundColor: 'transparent',
                fill: false,
                borderWidth: 3,
                pointRadius: 0,
                tension: 0.2
            },
            // Past predictions - WITH AREA FILL
            {
                label: `${symbol} Past Predictions`,
                data: pastPredictionData.length > 0 ?
                    (() => {
                        // Create a map of timestamps to prediction values for faster lookup
                        const predictionMap = new Map();
                        predictions.forEach(pred => {
                            if (pred.timestamp <= (data.length > 0 ? data[data.length - 1].open_time : 0)) {
                                predictionMap.set(pred.timestamp, pred.predicted_price);
                            }
                        });
                        
                        // Map data by matching timestamps instead of formatted labels
                        const mappedData = data.map(dataPoint => {
                            return predictionMap.get(dataPoint.open_time) || null;
                        });
                        
                        // Debug logging for 1d timeframe (fullscreen)
                        if (currentInterval === '1d') {
                            console.log('1d Past Predictions Debug (Fullscreen):', {
                                predictionMapSize: predictionMap.size,
                                mappedDataLength: mappedData.length,
                                nonNullValues: mappedData.filter(v => v !== null).length,
                                mappedData: mappedData.filter(v => v !== null)
                            });
                        }
                        
                        return mappedData;
                    })() : [],
                borderColor: 'rgba(255, 255, 255, 0.8)', // More subtle white line for past predictions
                backgroundColor: 'rgba(255, 255, 255, 0.05)', // Very subtle white fill for past predictions
                fill: true,
                borderWidth: 1.5, // Slightly thinner line
                borderDash: [], // Solid line
                pointRadius: 2, 
                pointBackgroundColor: 'rgba(255, 255, 255, 0.4)',
                pointBorderColor: 'rgba(255, 255, 255, 0.4)',
                pointBorderWidth: 1,
                pointHoverRadius: 6,
                tension: 0.2,
                spanGaps: true
            },
            // Future predictions - DOTTED LINE NO AREA FILL
            {
                label: `${symbol} Future Predictions`,
                data: labels.concat(futurePredictionLabels).map((label, idx) => {
                    if (idx === labels.length - 1) {
                        // Connect to last actual price
                        return prices[prices.length - 1];
                    } else if (idx >= labels.length) {
                        const predIdx = futurePredictionLabels.indexOf(label);
                        return predIdx !== -1 ? futurePredictionData[predIdx] : null;
                    }
                    return null;
                }),
                borderColor: predictionLineGradient,
                backgroundColor: 'transparent',
                fill: false,
                borderWidth: 3, // Thicker line for more prominence
                borderDash: [4, 6], // More prominent dashed pattern
                pointRadius: 0,
                tension: 0.2,
                spanGaps: true
            }
        ];
        
        // Update labels to include future predictions
        if (futurePredictionLabels.length > 0) {
            fullscreenChart.data.labels = labels.concat(futurePredictionLabels);
        }
        
        fullscreenChart.update('active');
        
        // Update price
        const currentPrice = prices[prices.length - 1];
        document.getElementById('fullscreen-price').textContent = `$${currentPrice.toFixed(currentPrice < 10 ? 4 : 2)}`;
    } catch (error) {
        console.error(`Error updating fullscreen chart for ${symbol}:`, error);
    }
}

// Update sentiment view
async function updateSentimentView() {
    const symbols = ['BTC', 'ETH', 'XRP', 'SOL'];
    
    // Add loading state to all sentiment cards
    document.querySelectorAll('#sentiment-view .crypto-card').forEach(card => {
        card.classList.add('loading');
    });
    
    // Fetch sentiment data for each symbol
    await Promise.all(symbols.map(async (symbol) => {
        try {
            const response = await fetch(`/api/sentiment/${symbol}`);
            const data = await response.json();
            
            // Update price
            const priceElement = document.getElementById(`${symbol.toLowerCase()}-sentiment-price`);
            if (priceElement && data.price) {
                priceElement.textContent = `$${data.price.toFixed(data.price < 10 ? 4 : 2)}`;
            }
            
            // Update sentiment rating
            const ratingElement = document.getElementById(`${symbol.toLowerCase()}-sentiment-rating`);
            if (ratingElement) {
                ratingElement.textContent = data.sentiment.rating;
                ratingElement.className = `sentiment-value ${data.sentiment.rating.toLowerCase()}`;
            }
            
            // Update news summary
            const newsElement = document.getElementById(`${symbol.toLowerCase()}-news-summary`);
            if (newsElement) {
                newsElement.textContent = data.news.summary;
            }
            
            // Store full data for details view
            const card = document.querySelector(`#sentiment-view .crypto-card[data-symbol="${symbol}"]`);
            if (card) {
                card.dataset.sentimentData = JSON.stringify(data);
            }
        } catch (error) {
            console.error(`Error fetching sentiment for ${symbol}:`, error);
        }
    }));
    
    // Remove loading state
    setTimeout(() => {
        document.querySelectorAll('#sentiment-view .crypto-card').forEach(card => {
            card.classList.remove('loading');
        });
    }, 300);
}

// Setup sentiment fullscreen feature
function setupSentimentFullscreen() {
    const overlay = document.getElementById('fullscreen-sentiment-overlay');
    const fullscreenContainer = document.getElementById('fullscreen-sentiment');
    const closeBtn = document.getElementById('close-fullscreen-sentiment');
    
    // Handle view details button clicks
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-details-btn')) {
            const symbol = e.target.dataset.symbol;
            const card = document.querySelector(`#sentiment-view .crypto-card[data-symbol="${symbol}"]`);
            const data = JSON.parse(card.dataset.sentimentData || '{}');
            
            openFullscreenSentiment(symbol, data);
        }
    });
    
    // Simple markdown parser for basic formatting
    function parseMarkdown(text) {
        if (!text) return 'Loading news...';
        
        // Escape HTML to prevent XSS
        let html = text.replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;')
                      .replace(/"/g, '&quot;')
                      .replace(/'/g, '&#039;');
        
        // Parse bold text
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // Parse italic text
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        
        // Parse links with target="_blank" for security
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        
        // Parse line breaks
        html = html.replace(/\n/g, '<br>');
        
        // Parse paragraphs (double line breaks)
        html = html.replace(/<br><br>/g, '</p><p>');
        html = '<p>' + html + '</p>';
        
        return html;
    }
    
    function openFullscreenSentiment(symbol, data) {
        // Update fullscreen content
        document.getElementById('fullscreen-sentiment-symbol').textContent = symbol;
        document.getElementById('fullscreen-sentiment-price').textContent =
            data.price ? `$${data.price.toFixed(data.price < 10 ? 4 : 2)}` : '$0.00';
        
        const ratingElement = document.getElementById('fullscreen-sentiment-rating');
        ratingElement.textContent = data.sentiment?.rating || 'Loading...';
        ratingElement.className = `sentiment-value-large ${(data.sentiment?.rating || '').toLowerCase()}`;
        
        const scoreElement = document.getElementById('fullscreen-sentiment-score');
        if (data.sentiment?.score) {
            scoreElement.textContent = `Score: ${data.sentiment.score}/100`;
        } else {
            scoreElement.textContent = '';
        }
        
        const newsContent = document.getElementById('fullscreen-news-content');
        // Use innerHTML with parsed markdown instead of textContent
        newsContent.innerHTML = parseMarkdown(data.news?.content);
        
        // Show fullscreen
        overlay.classList.add('active');
        fullscreenContainer.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    function closeFullscreenSentiment() {
        overlay.classList.remove('active');
        fullscreenContainer.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    // Close button handler
    closeBtn.addEventListener('click', closeFullscreenSentiment);
    
    // Overlay click handler
    overlay.addEventListener('click', closeFullscreenSentiment);
    
    // Escape key handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && fullscreenContainer.classList.contains('active')) {
            closeFullscreenSentiment();
        }
    });
}

// WebSocket connection management
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        if (wsReconnectInterval) {
            clearInterval(wsReconnectInterval);
            wsReconnectInterval = null;
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'price_update') {
                handlePriceUpdate(data);
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('⚠️ WebSocket disconnected');
        // Attempt to reconnect after 3 seconds
        if (!wsReconnectInterval) {
            wsReconnectInterval = setInterval(() => {
                console.log('🔄 Attempting to reconnect WebSocket...');
                connectWebSocket();
            }, 3000);
        }
    };
}

// Handle real-time price updates
function handlePriceUpdate(data) {
    const { symbol, price, priceChange, priceChangePercent } = data;
    
    // Store initial price on first update
    if (initialPrices[symbol] === null) {
        initialPrices[symbol] = price;
    }
    
    // Store previous price
    if (previousPrices[symbol] === null) {
        previousPrices[symbol] = price;
    }
    
    // Update price display with change information
    updatePriceDisplay(symbol, price, priceChange, priceChangePercent);
    
    // Update chart if we have the data
    if (charts[symbol] && charts[symbol].data.datasets[0].data.length > 0) {
        // Update the last data point in the chart
        const dataset = charts[symbol].data.datasets[0];
        dataset.data[dataset.data.length - 1] = price;
        charts[symbol].update('none'); // Update without animation for smooth real-time updates
    }
}

// Update price display with change information
function updatePriceDisplay(symbol, price, priceChange = null, priceChangePercent = null) {
    // Calculate 24h-style price change based on initial price
    let change24h = 0;
    let changePercent24h = 0;
    
    if (initialPrices[symbol] !== null) {
        change24h = price - initialPrices[symbol];
        changePercent24h = (change24h / initialPrices[symbol]) * 100;
    }
    
    // Calculate immediate price change for flash effect
    let immediateChange = 0;
    if (priceChange === null && previousPrices[symbol] !== null) {
        immediateChange = price - previousPrices[symbol];
    } else if (priceChange !== null) {
        immediateChange = priceChange;
    }
    
    // Format price change display
    const changePrefix = change24h >= 0 ? '+' : '';
    const formattedChange = `${changePrefix}$${Math.abs(change24h).toFixed(change24h < 10 ? 4 : 2)}`;
    const formattedPercent = `(${changePrefix}${Math.abs(changePercent24h).toFixed(2)}%)`;
    const fullChangeText = `${formattedChange} ${formattedPercent}`;
    
    // Update all price displays for this symbol
    const priceElements = document.querySelectorAll(`[data-symbol="${symbol}"] .price`);
    priceElements.forEach(priceElement => {
        // Format price
        const formattedPrice = `$${price.toFixed(price < 10 ? 4 : 2)}`;
        
        // Determine flash class based on immediate price change
        let flashClass = '';
        if (immediateChange !== 0) {
            flashClass = immediateChange > 0 ? 'flash-green' : 'flash-red';
        }
        
        // Update price with flash effect
        priceElement.textContent = formattedPrice;
        
        // Apply flash effect if there's a change
        if (flashClass) {
            priceElement.classList.add(flashClass);
            // Remove flash class after animation completes
            setTimeout(() => {
                priceElement.classList.remove(flashClass);
            }, 600);
        }
    });
    
    // Update price change displays for all views - COMMENTED OUT AS REQUESTED
    // const changeElements = [
    //     document.getElementById(`${symbol.toLowerCase()}-chart-change`),
    //     document.getElementById(`${symbol.toLowerCase()}-table-change`),
    //     document.getElementById(`${symbol.toLowerCase()}-sentiment-change`)
    // ];
    
    // changeElements.forEach(changeElement => {
    //     if (changeElement) {
    //         changeElement.textContent = fullChangeText;
    //         // Remove existing classes
    //         changeElement.classList.remove('price-up', 'price-down');
    //         // Add appropriate class
    //         if (change24h > 0) {
    //             changeElement.classList.add('price-up');
    //         } else if (change24h < 0) {
    //             changeElement.classList.add('price-down');
    //         }
    //     }
    // });
    
    // Update fullscreen displays if active
    if (currentFullscreenSymbol === symbol) {
        const fullscreenPrice = document.getElementById('fullscreen-price');
        const fullscreenTablePrice = document.getElementById('fullscreen-table-price');
        const fullscreenSentimentPrice = document.getElementById('fullscreen-sentiment-price');
        
        [fullscreenPrice, fullscreenTablePrice, fullscreenSentimentPrice].forEach(elem => {
            if (elem) {
                elem.textContent = `$${price.toFixed(price < 10 ? 4 : 2)}`;
                
                // Apply flash effect if there's an immediate change
                if (immediateChange !== 0) {
                    const flashClass = immediateChange > 0 ? 'flash-green' : 'flash-red';
                    elem.classList.add(flashClass);
                    setTimeout(() => {
                        elem.classList.remove(flashClass);
                    }, 600);
                }
            }
        });
        
        // Update fullscreen price change displays - COMMENTED OUT AS REQUESTED
        // const fullscreenChangeElements = [
        //     document.getElementById('fullscreen-price-change'),
        //     document.getElementById('fullscreen-table-price-change'),
        //     document.getElementById('fullscreen-sentiment-price-change')
        // ];
        
        // fullscreenChangeElements.forEach(changeElement => {
        //     if (changeElement) {
        //         changeElement.textContent = fullChangeText;
        //         // Remove existing classes
        //         changeElement.classList.remove('price-up', 'price-down');
        //         // Add appropriate class
        //         if (change24h > 0) {
        //             changeElement.classList.add('price-up');
        //         } else if (change24h < 0) {
        //             changeElement.classList.add('price-down');
        //         }
        //     }
        // });
    }
    
    // Update table view prices
    const tablePriceElement = document.getElementById(`${symbol.toLowerCase()}-table-price`);
    if (tablePriceElement) {
        tablePriceElement.textContent = `$${price.toFixed(price < 10 ? 4 : 2)}`;
        
        // Apply flash effect if there's an immediate change
        if (immediateChange !== 0) {
            const flashClass = immediateChange > 0 ? 'flash-green' : 'flash-red';
            tablePriceElement.classList.add(flashClass);
            setTimeout(() => {
                tablePriceElement.classList.remove(flashClass);
            }, 600);
        }
    }
    
    // Update sentiment view prices
    const sentimentPriceElement = document.getElementById(`${symbol.toLowerCase()}-sentiment-price`);
    if (sentimentPriceElement) {
        sentimentPriceElement.textContent = `$${price.toFixed(price < 10 ? 4 : 2)}`;
        
        // Apply flash effect if there's an immediate change
        if (immediateChange !== 0) {
            const flashClass = immediateChange > 0 ? 'flash-green' : 'flash-red';
            sentimentPriceElement.classList.add(flashClass);
            setTimeout(() => {
                sentimentPriceElement.classList.remove(flashClass);
            }, 600);
        }
    }
    
    // Store current price as previous for next update
    previousPrices[symbol] = price;
}

// Auto-refresh every 60 seconds (as fallback)
function startAutoRefresh() {
    setInterval(() => {
        updateAllCharts(false); // No animation for auto-refresh
        
        // Also update fullscreen chart if open
        if (currentFullscreenSymbol && fullscreenChart) {
            updateFullscreenChart(currentFullscreenSymbol, currentInterval);
        }
        
        // Update sentiment view if active
        if (currentView === 'sentiment') {
            updateSentimentView();
        }
    }, 60000);
    
    // Refresh predictions every 5 minutes
    setInterval(async () => {
        const symbols = ['BTC', 'ETH', 'XRP', 'SOL'];
        await Promise.all(symbols.map(async (symbol) => {
            await fetchPredictions(symbol, currentInterval);
            await fetchAccuracyMetrics(symbol, currentInterval);
        }));
        
        // Update table view if active
        if (currentView === 'table') {
            updateTableView();
        }
        
        // Update fullscreen table if open
        if (currentFullscreenSymbol && document.getElementById('fullscreen-table').classList.contains('active')) {
            updateFullscreenTable(currentFullscreenSymbol);
        }
    }, 300000); // 5 minutes
}

// Initialize application
async function init() {
    initializeCharts();
    setupTimeControls();
    setupModelControls();
    setupViewControls();
    setupFullscreenFeature();
    setupSentimentFullscreen();
    await updateAllCharts(false); // No animation on initial load
    
    // Connect WebSocket for real-time updates
    connectWebSocket();
    
    // Start auto-refresh as fallback
    startAutoRefresh();
}

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init);
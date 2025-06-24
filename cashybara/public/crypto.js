let currentTimeframe = '1d';
let isRefreshing = false;
let selectedCryptos = [];
let trackedCryptos = [];
const cryptoData = {};
let chart;
let unique = new Map();

const TF_MAP = {
    '1d': { interval: '1h', limit: 24 },
    '7d': { interval: '1h', limit: 168 },
    '30d': { interval: '1d', limit: 30 },
    '90d': { interval: '1d', limit: 90 },
    '1y': { interval: '1d', limit: 365 }
};

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

async function loadAvailableCryptos() {
    const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
    const json = await res.json();
    unique.clear();
    json.symbols.forEach(s => {
        if (s.quoteAsset === 'USDT' && !unique.has(s.baseAsset)) {
            unique.set(s.baseAsset, {
                id: s.symbol.toLowerCase(),
                symbol: s.baseAsset.toUpperCase(),
                name: s.baseAsset.toUpperCase()
            });
        }
    });

    trackedCryptos = Array.from(unique.values()).filter(c => ['BTC', 'ETH', 'SOL', 'DOGE'].includes(c.symbol));
}

async function fetchCryptoData (crypto) {
    try {
        const { interval, limit } = TF_MAP[currentTimeframe];
        const symbol = crypto.symbol.toUpperCase() + 'USDT';
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) return false;

        const ts = data.map(item => item[0]);
        const closes = data.map(item => parseFloat(item[4]));
        const first = closes[0];
        const last = closes[closes.length - 1];
        const pct = ((last - first) / first) * 100;

        cryptoData[crypto.id] = { ts, closes, first, last, pct };
        return true;
    } catch (err) {
        console.error(`Fetch failed for ${crypto.name}:`, err);
        return false;
    }
}

async function fetchAllCryptoData() {
    if (isRefreshing) return;
    isRefreshing = true;
    qs('#refreshBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    await Promise.all(trackedCryptos.map(fetchCryptoData));
    renderCryptoCards();
    if (!selectedCryptos.length) {
        selectedCryptos.push(trackedCryptos[0].id);
        updateSelectedTags();
    }
    updateChart();
    qs('#refreshBtn').innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Data';
    isRefreshing = false;
}

function renderCryptoCards() {
    const grid = qs('#cryptoGrid');
    grid.innerHTML = '';
    trackedCryptos.forEach(crypto => {
        const datum = cryptoData[crypto.id];
        const pctStr = datum ? datum.pct.toFixed(2) + '%' : '—';
        const card = document.createElement('div');
        card.className = 'etf-card' + (selectedCryptos.includes(crypto.id) ? ' selected': '');
        card.innerHTML = `
            <div class="etf-symbol">${crypto.symbol}</div>
            <div class="etf-name">${crypto.name}</div>
            <div class="etf-price">${datum ? datum.last.toFixed(2) : '—'}</div>
            <div class="etf-change ${datum && datum.pct >= 0 ? 'positive' : 'negative'}">${pctStr}</div>
            <button class="remove-card-btn" title="Remove">&times;</button>
        `;

        card.addEventListener('click', e => {
            if (e.target.classList.contains('remove-card-btn')) return;
            if (!selectedCryptos.includes(crypto.id))
                selectedCryptos.push(crypto.id);
            else
                selectedCryptos = selectedCryptos.filter(id => id !== crypto.id);
            renderCryptoCards();
            updateSelectedTags();
            updateChart();
        });

        card.querySelector('.remove-card-btn').addEventListener('click', e => {
            e.stopPropagation(); // prevent triggering select
            trackedCryptos = trackedCryptos.filter(c => c.id !== crypto.id);
            selectedCryptos = selectedCryptos.filter(id => id !== crypto.id);
            delete cryptoData[crypto.id];
            renderCryptoCards();
            updateSelectedTags();
            updateChart();
        });

        grid.appendChild(card);
    });
}

function updateSelectedTags() {
    const wrap = qs('#selectedCryptos');
    wrap.innerHTML = '';
    if (!selectedCryptos.length) {
        wrap.innerHTML = '<div class="etf-tag">Select Cryptos to compare</div>';
        return;
    }
    selectedCryptos.forEach(id => {
        const symbol = trackedCryptos.find(c => c.id === id)?.symbol || id;
        const tag = document.createElement('div');
        tag.className = 'etf-tag';
        tag.innerHTML = `${symbol} <span class="remove-tag">&times;</span>`;
        tag.querySelector('.remove-tag').onclick = () => {
            selectedCryptos = selectedCryptos.filter(i => i !== id);
            renderCryptoCards();
            updateSelectedTags();
            updateChart();
        };
        wrap.appendChild(tag);
    });
}

function updateChart() {
    if (!selectedCryptos.length) { chart?.destroy(); return; }
    const labels = cryptoData[selectedCryptos[0]].ts.map(t => new Date(t));
    const datasets = selectedCryptos.map(id => ({
        label: trackedCryptos.find(c => c.id === id)?.symbol || id,
        data: cryptoData[id].closes,
        borderWidth: 2,
        pointRadius: 0
    }));
    chart?.destroy();
    chart = new Chart(qs('#cryptoChart'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            interaction: { mode: 'nearest', intersect: false },
            plugins: { legend: { position: 'bottom' } },
            scales: {
                x: { type: 'time', time: { unit: ['1d', '7d'].includes(currentTimeframe) ? 'hour' : 'day' } },
                y: { beginAtZero: false }
            }
        }
    });
}

function clearAllCryptos() {
    selectedCryptos = [];
    updateSelectedTags();
    renderCryptoCards();
    updateChart();
}

function setupSearchBox() {
    const input = qs('#searchBox');
    const results = qs('#searchResults');

    input.addEventListener('input', () => {
        const keyword = input.value.trim().toLowerCase();
        results.innerHTML = '';
        results.hidden = true;
        if (!keyword) return;

        const matches = Array.from(unique.values())
            .filter(c => c.symbol.toLowerCase().includes(keyword) || c.name.toLowerCase().includes(keyword))
            .slice(0, 10);

        matches.forEach(crypto => {
            const li = document.createElement('li');
            li.textContent = `${crypto.symbol} - ${crypto.name}`;
            li.onclick = async () => {
                if (!trackedCryptos.some(c => c.id === crypto.id)) {
                    trackedCryptos.push(crypto);
                    await fetchCryptoData(crypto);
                    renderCryptoCards();
                }
                if (!selectedCryptos.includes(crypto.id)) {
                    selectedCryptos.push(crypto.id);
                    updateSelectedTags();
                    updateChart();
                }
                input.value = '';
                results.hidden = true;
            };
            results.appendChild(li);
        });
        results.hidden = matches.length === 0;
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadAvailableCryptos();
    await fetchAllCryptoData();
    setupSearchBox();

    qsa('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            qsa('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTimeframe = btn.dataset.timeframe;
            fetchAllCryptoData();
        });
    });

    qs('#refreshBtn').addEventListener('click', fetchAllCryptoData);

    const riskRange = qs('#riskRange');
    const riskLabel = qs('#riskLabel');
    const riskDesc = qs('#riskDesc');

    function getRiskProfile(value) {
        const v = Number(value);
        if (v <= 20) {
            return { label: 'Very conservative', desc: 'Very low volatility. Minimum gains or losses.'};
        } else if (v <= 40) {
            return { label: 'Conservative', desc: 'Low volatility. Smaller potential gains or losses.'};
        } else if (v <= 60) {
            return { label: 'Moderate', desc: 'Moderate volatility. Moderate return potential.'};
        } else if (v <= 80) {
            return { label: 'Aggresive', desc: 'High volatility, Greater potential returns with risks.'};
        } else {
            return { label: 'Very aggresive', desc: 'Extreme volatility. Potential for high gains or losses.'};
        }
    }

    riskRange.addEventListener ('input', () => {
        const { label, desc } = getRiskProfile(riskRange.value);
        riskLabel.textContent = label;
        riskDesc.textContent = desc;
    });

    const investRange = qs('#investRange');
    const investAmount = qs('#investAmount');
    investRange.addEventListener('input', () => {
        investAmount.textContent = Number(investRange.value).toLocaleString();
    });

    investAmount.textContent = Number(investRange.value).toLocaleString();
});
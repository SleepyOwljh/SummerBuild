let currentTimeframe = '1d';
let isRefreshing = false;
let selectedCryptos = [];
let trackedCryptos = [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum' },
    { id: 'solana', symbol: 'SOL', name: 'Solana' },
    { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin' }
];
const cryptoData = {};
let chart;

const TF_MAP = {
    '1d': { days: '1', interval: 'hourly' },
    '7d': { days: '7', interval: 'hourly' },
    '30d': { days: '30', interval: 'daily' },
    '90d': { days: '90', interval: 'daily' },
    '1y': { days: '365', interval: 'daily' }
};

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

async function fetchCryptoData (crypto) {
    try {
        const { days } = TF_MAP[currentTimeframe];
        const url = `https://api.coingecko.com/api/v3/coins/${crypto.id}/market_chart?vs_currency=usd&days=${days}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!json.prices || !json.prices.length) return false;

        const ts = json.prices.map(p => p[0]);
        const closes = json.prices.map(p => p[1]);
        const first = closes[0];
        const last = closes[closes.length - 1];
        const pct = ((last - first) / first) * 100;

        cryptoData[crypto.id] = { ts, closes, first, last, pct };
        return true;
    } catch (err) {
        console.error(`Fetch failed for ${crypto.name}:`, err.message || err);
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

    qs('#refreshtBtn').innerHTML = '<i class="fas fa-sync-alt></i> Refresh Data';
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
        `;

        card.onclick = () => {
            if (!selectedCryptos.includes(crypto.id))
                selectedCryptos.push(crypto.id);
            else
                selectedCryptos = selectedCryptos.filter(id => id !== crypto.id);

            renderCryptoCards();
            updateSelectedTags();
            updateChart();
        };

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
                x: { type: 'time', time: { unit: 'day' } },
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

document.addEventListener('DOMContentLoaded', () => {
    qsa('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            qsa('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTimeframe = btn.dataset.timeframe;
            fetchAllCryptoData();
        });
    });

    qs('#refreshBtn').addEventListener('click', fetchAllCryptoData);
    fetchAllCryptoData();

    const riskRange = qs('#riskRange');
    const riskLabel = qs('#riskLabel');
    const riskDesc = qs('#riskDesc');

    function getRiskProfile(value) {
        const v = Number(value);
        if (v <= 20) {
            return { label: 'Very conservative', desc: 'Low volatility. Small potential gains or losses.'};
        } else if (v <= 40) {
            return { label: 'Conservative', desc: 'Moderate volatility. Moderate return potential.'};
        } else if (v <= 80) {
            return { label: 'Aggresive', desc: 'High volatility, Greater potential returns with risks.'};
        } else {
            return { label: 'Very aggresive', desc: 'Extreme volatility. Potential for high gains or losses.'};
        }
    }

    function updateRiskUI() {
        const { label, desc } = getRiskProfile(riskRange.value);
        riskLabel.textContent = label;
        riskDesc.textContent = desc;
    }

    riskRange.addEventListener('input', updateRiskUI);
    updateRiskUI();

    const investRange = qs('#investRange');
    const investAmount = qs('#investAmount');

    investRange.addEventListener('input', () => {
        investAmount.textContent = Number(investRange.value).toLocaleString();
    });

    investAmount.textContent = Number(investRange.value).toLocaleString();
});
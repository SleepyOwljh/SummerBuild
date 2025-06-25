function getFullCryptoList() {
  const symSet = new Set([...trackedCryptos.map(c => c.symbol), ...selectedCryptos]);
  return Array.from(symSet).map(sym => {
    return recommendedCryptos.find(c => c.symbol === sym) || { symbol: sym, name: sym };
  });
}

let currentTimeframe = '1d';
let isRefreshing     = false;
let selectedCryptos  = [];
const trackedCryptos = [
  { symbol: 'BTCUSDT', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', name: 'Ethereum' },
  { symbol: 'BNBUSDT', name: 'BNB' },
  { symbol: 'SOLUSDT', name: 'Solana' }
];
let recommendedCryptos = [...trackedCryptos];
const cryptoData       = {};
let chart,plComparisonChart, drillSignalChart, drillPositionChart;
const INITIAL_CAPITAL  = 100000;

/* DOM HELPERS */
const qs  = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

const TF_MAP = {
  '1d':  { interval: '5m',  limit: 288 },
  '5d':  { interval: '30m', limit: 240 },
  '1mo': { interval: '1d',  limit: 30 },
  '6mo': { interval: '1d',  limit: 180 },
  '1y':  { interval: '1d',  limit: 365 }
};

function buildURL(symbol) {
  const { interval, limit } = TF_MAP[currentTimeframe];
  return `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
}

/* FETCH ONE CRYPTO */
async function fetchCryptoData(coin) {
  try {
    const rsp = await fetch(buildURL(coin.symbol));
    const raw = await rsp.json();
    if (!Array.isArray(raw) || !raw.length) throw new Error('Bad response');

    const pairs = raw.map(k => ({
      t: +k[0],      // open time in ms
      c: parseFloat(k[4]) // close price
    })).filter(p => p.c);

    const ts     = pairs.map(p => new Date(p.t)),
          closes = pairs.map(p => p.c),
          first  = closes[0],
          last   = closes[closes.length - 1],
          pct    = ((last - first) / first) * 100;

    cryptoData[coin.symbol] = { ts, closes, pct, last };
    return true;
  } catch (e) {
    console.error(`Fetch failed for ${coin.symbol}`, e);
    return false;
  }
}

/* FETCH ALL & RENDER */
async function fetchAllCryptoData() {
  if (isRefreshing) return;
  isRefreshing = true;
  qs('#refreshBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing…';

  await Promise.all(getFullCryptoList().map(fetchCryptoData));
  renderCryptoCards();

  if (!selectedCryptos.length) {
    selectedCryptos.push(trackedCryptos[0].symbol);
    updateSelectedTags();
    updateCompareCryptoSelect();
  }

  updateChart();
  qs('#refreshBtn').innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Data';
  isRefreshing = false;
}

/* RENDER SIDEBAR */
function renderCryptoCards() {
  const grid = qs('#etfGrid');
  grid.innerHTML = '';
  recommendedCryptos.slice(0, 4).forEach(coin => {
    const d   = cryptoData[coin.symbol],
          pct = d ? d.pct.toFixed(2) + '%' : '—';
    const card = document.createElement('div');
    card.className = 'etf-card' + (selectedCryptos.includes(coin.symbol) ? ' selected' : '');
    card.innerHTML = `
      <div class="etf-symbol">${coin.symbol}</div>
      <div class="etf-name">${coin.name}</div>
      <div class="etf-price">${d ? d.last.toFixed(2) : '—'}</div>
      <div class="etf-change ${d && d.pct >= 0 ? 'positive' : 'negative'}">${pct}</div>
    `;
    card.onclick = () => {
      if (!selectedCryptos.includes(coin.symbol)) selectedCryptos.push(coin.symbol);
      else selectedCryptos = selectedCryptos.filter(s => s !== coin.symbol);
      updateSelectedTags();
      updateCompareCryptoSelect();
      renderCryptoCards();
      updateChart();
    };
    grid.appendChild(card);
  });
}

/* UPDATE TAGS & SELECT */
function updateSelectedTags() {
  const wrap = qs('#selectedCryptos');
  wrap.innerHTML = '';
  if (!selectedCryptos.length) {
    wrap.innerHTML = '<div class="etf-tag">Select cryptocurrencies to compare</div>';
  } else {
    selectedCryptos.forEach(sym => {
      const tag = document.createElement('div');
      tag.className = 'etf-tag';
      tag.innerHTML = `${sym} <span class="remove-tag">&times;</span>`;
      tag.querySelector('.remove-tag').onclick = () => {
        selectedCryptos = selectedCryptos.filter(s => s !== sym);
        updateSelectedTags();
        updateCompareCryptoSelect();
        renderCryptoCards();
        updateChart();
      };
      wrap.appendChild(tag);
    });
  }
}

function updateCompareCryptoSelect() {
  const sel = qs('#compareCryptoSelect');
  sel.innerHTML = '<option value="">-- Choose Crypto --</option>';
  selectedCryptos.forEach(sym => {
    const opt = document.createElement('option');
    opt.value = sym;
    opt.textContent = sym;
    sel.appendChild(opt);
  });
}

/* MAIN PRICE CHART */
function updateChart() {
  if (!selectedCryptos.length) {
    chart?.destroy();
    return;
  }
  const sym     = selectedCryptos[0],
        d       = cryptoData[sym],
        labels  = d.ts.map(t => new Date(t)),
        datasets = selectedCryptos.map(s => ({
          label: s,
          data: cryptoData[s].closes,
          borderWidth: 2,
          pointRadius: 0
        }));

  chart?.destroy();
  chart = new Chart(qs('#cryptoChart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' }},
      scales: {
        x: { type: 'time', time: { unit: currentTimeframe === '1d' ? 'hour' : 'day' }}
      }
    }
  });
}

const debounce = (fn, ms = 300) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

async function searchCryptos(term) {
  const res = await fetch('https://api.binance.com/api/v3/exchangeInfo');
  const data = await res.json();
  const coins = data.symbols
    .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map(s => ({
      symbol: s.symbol,
      name: s.baseAsset // Binance doesn’t give full names, so we use baseAsset
    }));

  return coins.filter(c =>
    c.symbol.toLowerCase().includes(term.toLowerCase()) ||
    c.name.toLowerCase().includes(term.toLowerCase())
  ).slice(0, 10); // Limit to top 10 results
}

/* STRATEGIES */
function sma(arr, N) {
  const out = Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= N) sum -= arr[i - N];
    if (i >= N - 1) out[i] = sum / N;
  }
  return out;
}

function maCrossoverStrategy(prices, _, fast, slow) {
  const f = sma(prices, fast), s = sma(prices, slow);
  const pos = [0], eq = [INITIAL_CAPITAL];
  for (let i = 1; i < prices.length; i++) {
    const sig = (f[i - 1] != null && s[i - 1] != null && f[i - 1] > s[i - 1]) ? 1 : 0;
    pos.push(sig);
    const r = (prices[i] - prices[i - 1]) / prices[i - 1];
    eq.push(eq[i - 1] * (1 + sig * r));
  }
  return { timestamps: prices.map((_, i) => i), equity: eq, positions: pos, label: `MA${fast}-${slow}` };
}

function rsi(prices, L) {
  const d = prices.slice(1).map((p, i) => p - prices[i]), out = Array(prices.length).fill(null);
  let g = 0, l = 0;
  for (let i = 0; i < L; i++) { g += Math.max(d[i], 0); l += Math.max(-d[i], 0); }
  let ag = g / L, al = l / L;
  out[L] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  for (let i = L + 1; i < prices.length; i++) {
    const dd = d[i - 1];
    ag = (ag * (L - 1) + Math.max(dd, 0)) / L;
    al = (al * (L - 1) + Math.max(-dd, 0)) / L;
    out[i] = al === 0 ? 100 : 100 - (100 / (1 + ag / al));
  }
  return out;
}

function rsiStrategy(prices, _, L, lo, hi) {
  const s = rsi(prices, L), pos = [0], eq = [INITIAL_CAPITAL];
  for (let i = 1; i < prices.length; i++) {
    let sig = 0; if (s[i - 1] < lo) sig = 1; if (s[i - 1] > hi) sig = 0;
    pos.push(sig);
    const r = (prices[i] - prices[i - 1]) / prices[i - 1];
    eq.push(eq[i - 1] * (1 + sig * r));
  }
  return { timestamps: prices.map((_, i) => i), equity: eq, positions: pos, label: `RSI${L}-${lo}-${hi}` };
}

/* METRICS */
function totalReturn(eq) {
  return (eq[eq.length - 1] / eq[0] - 1) * 100;
}
function sharpeRatio(ret) {
  const μ = ret.reduce((a, b) => a + b, 0) / ret.length;
  const σ = Math.sqrt(ret.map(r => (r - μ) ** 2).reduce((a, b) => a + b) / (ret.length - 1));
  return μ / σ * Math.sqrt(252);
}
function maxDrawdown(eq) {
  let peak = eq[0], mdd = 0;
  eq.forEach(v => { peak = Math.max(peak, v); mdd = Math.max(mdd, (peak - v) / peak); });
  return mdd * 100;
}

function clearAllCryptos() {
  selectedCryptos = [];
  updateSelectedTags();
  updateCompareCryptoSelect();
  renderCryptoCards();
  updateChart();
}

/* INITIALISE */
document.addEventListener('DOMContentLoaded', () => {
  // timeframe
  qsa('.timeframe-btn').forEach(btn => btn.addEventListener('click', () => {
    qsa('.timeframe-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTimeframe = btn.dataset.timeframe;

    Promise.all(getFullCryptoList().map(fetchCryptoData)).then(() => {
        updateChart();
        renderCryptoCards();
    });
  }));

  qs('#refreshBtn').addEventListener('click', fetchAllCryptoData);

  Promise.all(getFullCryptoList().map(fetchCryptoData)).then(() => {
    updateChart();
    renderCryptoCards();
  });

  // live search
  const box = qs('#searchBox'), list = qs('#searchResults');
  box.addEventListener('input', debounce(async e => {
    const t = e.target.value.trim(); if (!t) { list.hidden = true; return; }
    const res = await searchCryptos(t); if (!res.length) { list.hidden = true; return; }
    list.innerHTML = '';
    res.forEach(r => {
      const li = document.createElement('li');
      li.textContent = `${r.symbol} – ${r.name}`;
      li.onclick = async () => {
        if (!recommendedCryptos.find(e => e.symbol === r.symbol)) {
          recommendedCryptos.unshift({ symbol: r.symbol, name: r.name });
          if (recommendedCryptos.length > 4) recommendedCryptos.pop();
        }
        const ok = await fetchCryptoData(r);
        if (!ok) { alert(`No data for ${r.symbol}`); return; }
        if (!selectedCryptos.includes(r.symbol)) selectedCryptos.push(r.symbol);
        renderCryptoCards();
        updateSelectedTags();
        updateCompareCryptoSelect();
        updateChart();
        list.hidden = true;
        box.value = '';
      };
      list.appendChild(li);
    });
    list.hidden = false;
  }));

  document.addEventListener('click', e => {
    if (!box.contains(e.target) && !list.contains(e.target)) list.hidden = true;
  });

  // risk
  const rr = qs('#riskRange'), rL = qs('#riskLabel'), rD = qs('#riskDesc');
  function updRisk() {
    const v = +rr.value;
    let label, desc;
    if (v <= 20) { label = 'Very conservative'; desc = '…won’t lose more than 3%.'; }
    else if (v <= 40) { label = 'Conservative'; desc = '…won’t lose more than 8%.'; }
    else if (v <= 60) { label = 'Moderate'; desc = '…won’t lose more than 19%.'; }
    else if (v <= 80) { label = 'Aggressive'; desc = '…won’t lose more than 30%.'; }
    else { label = 'Very aggressive'; desc = '…won’t lose more than 45%.'; }
    rL.textContent = label;
    rD.textContent = desc;
  }
  rr.addEventListener('input', updRisk);
  updRisk();

  // populate crypto select
  updateCompareCryptoSelect();

  // compare slider
  const ci = qs('#compareInvestAmt'), cd = qs('#compareInvestDisplay');
  ci.addEventListener('input', () => cd.textContent = '$' + Number(ci.value).toLocaleString());
  ci.dispatchEvent(new Event('input'));

  // run comparison
  qs('#runComparison').addEventListener('click', updateComparisonChart);

  // re-run when params change
  ['#maFastCompare', '#maSlowCompare', '#rsiLBCompare', '#rsiLowCompare', '#rsiHighCompare']
    .forEach(sel => qs(sel).addEventListener('input', updateComparisonChart));

  // drill change
  qs('#drillStrategySelect').addEventListener('change', () => {
    const d = qs('#drillStrategySelect').value;
    qs('#showDrillDetails').hidden = (d === 'bh');
    qs('#drillDetails').hidden = true;
    updateDrillMetrics();
  });

  // show details
  qs('#showDrillDetails').addEventListener('click', () => {
    qs('#drillDetails').hidden = false;
    drawDrillSignalChart();
    drawDrillPositionChart();
  });

  const clearBtn = qs('.clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllCryptos);
  }
});

function updateComparisonChart() {
  const sym = qs('#compareCryptoSelect').value;
  if (!sym) { alert('Please select a cryptocurrency'); return; }
  const d = cryptoData[sym];
  if (!d) { alert(`No data for ${sym}`); return; }

  const dates = d.ts.map(t => new Date(t));
  const invest = +qs('#compareInvestAmt').value;

  // Buy & Hold
  const bhEq = [INITIAL_CAPITAL];
  for (let i = 1; i < d.closes.length; i++) {
    const r = (d.closes[i] - d.closes[i - 1]) / d.closes[i - 1];
    bhEq.push(bhEq[i - 1] * (1 + r));
  }

  // MA Strategy
  const f = +qs('#maFastCompare').value, s = +qs('#maSlowCompare').value;
  const maRes = maCrossoverStrategy(d.closes, dates, f, s);

  // RSI Strategy
  const L = +qs('#rsiLBCompare').value, lo = +qs('#rsiLowCompare').value, hi = +qs('#rsiHighCompare').value;
  const rsiRes = rsiStrategy(d.closes, dates, L, lo, hi);

  const scale = arr => arr.map(v => v / INITIAL_CAPITAL * invest);
  const datasets = [
    { label: 'Buy & Hold', data: scale(bhEq), borderWidth: 2 },
    { label: maRes.label, data: scale(maRes.equity), borderWidth: 2 },
    { label: rsiRes.label, data: scale(rsiRes.equity), borderWidth: 2 }
  ];

  plComparisonChart?.destroy();
  plComparisonChart = new Chart(qs('#plComparisonChart'), {
    type: 'line',
    data: { labels: dates, datasets },
    options: { scales: { x: { type: 'time' } } }
  });

  qs('#drillStrategySelect').value = 'ma';
  updateDrillMetrics();
  qs('#showDrillDetails').hidden = false;
  qs('#drillDetails').hidden = true;
}

/* UPDATE DRILL METRICS */
function updateDrillMetrics() {
  const sym = qs('#compareCryptoSelect').value;
  if (!sym) return;
  const d = cryptoData[sym];
  const dates = d.ts.map(t => new Date(t));
  const invest = +qs('#compareInvestAmt').value;

  let res;
  const drill = qs('#drillStrategySelect').value;
  if (drill === 'bh') {
    const eq = [INITIAL_CAPITAL];
    for (let i = 1; i < d.closes.length; i++) {
      const r = (d.closes[i] - d.closes[i - 1]) / d.closes[i - 1];
      eq.push(eq[i - 1] * (1 + r));
    }
    res = { timestamps: dates, equity: eq, positions: [] };
  } else if (drill === 'ma') {
    const f = +qs('#maFastCompare').value, s = +qs('#maSlowCompare').value;
    res = maCrossoverStrategy(d.closes, dates, f, s);
  } else {
    const L = +qs('#rsiLBCompare').value, lo = +qs('#rsiLowCompare').value, hi = +qs('#rsiHighCompare').value;
    res = rsiStrategy(d.closes, dates, L, lo, hi);
  }

  const scaled = res.equity.map(v => v / INITIAL_CAPITAL * invest);
  const tot = totalReturn(scaled).toFixed(2) + '%';
  const ret = scaled.map((v, i, a) => i > 0 ? v / a[i - 1] - 1 : 0).slice(1);
  const sr = sharpeRatio(ret).toFixed(2);
  const md = maxDrawdown(scaled).toFixed(2) + '%';
  const pl = (scaled[scaled.length - 1] - invest).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

  qs('#drillTotalReturn').textContent = tot;
  qs('#drillSharpe').textContent = sr;
  qs('#drillMaxDD').textContent = md;
  qs('#drillPL').textContent = pl;
}

/* DRAW SIGNAL CHART */
function drawDrillSignalChart() {
  const sym = qs('#compareCryptoSelect').value;
  const d = cryptoData[sym];
  const dates = d.ts.map(t => new Date(t));

  let res;
  const drill = qs('#drillStrategySelect').value;
  if (drill === 'ma') {
    const f = +qs('#maFastCompare').value, s = +qs('#maSlowCompare').value;
    res = maCrossoverStrategy(d.closes, dates, f, s);
  } else if (drill === 'rsi') {
    const L = +qs('#rsiLBCompare').value, lo = +qs('#rsiLowCompare').value, hi = +qs('#rsiHighCompare').value;
    res = rsiStrategy(d.closes, dates, L, lo, hi);
  } else return;

  const buys = [], sells = [];
  for (let i = 1; i < res.positions.length; i++) {
    if (res.positions[i] === 1 && res.positions[i - 1] === 0)
      buys.push({ x: dates[i], y: d.closes[i] });
    if (res.positions[i] === 0 && res.positions[i - 1] === 1)
      sells.push({ x: dates[i], y: d.closes[i] });
  }

  drillSignalChart?.destroy();
  drillSignalChart = new Chart(qs('#drillSignalChart'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Price',
          data: d.closes.map((p, i) => ({ x: dates[i], y: p })),
          showLine: true,
          borderColor: 'blue',
          pointRadius: 0,
          order: 0
        },
        {
          label: 'Buy',
          data: buys,
          pointStyle: 'triangle',
          rotation: 0,
          pointBackgroundColor: 'green',
          pointBorderColor: 'darkgreen',
          pointRadius: 10,
          order: 1
        },
        {
          label: 'Sell',
          data: sells,
          pointStyle: 'triangle',
          rotation: 180,
          pointBackgroundColor: 'red',
          pointBorderColor: 'darkred',
          pointRadius: 10,
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { type: 'time' } }
    }
  });
}

/* DRAW POSITION CHART */
function drawDrillPositionChart() {
  const sym = qs('#compareCryptoSelect').value;
  const d = cryptoData[sym];
  const dates = d.ts.map(t => new Date(t));

  let res;
  const drill = qs('#drillStrategySelect').value;
  if (drill === 'ma') {
    const f = +qs('#maFastCompare').value, s = +qs('#maSlowCompare').value;
    res = maCrossoverStrategy(d.closes, dates, f, s);
  } else if (drill === 'rsi') {
    const L = +qs('#rsiLBCompare').value, lo = +qs('#rsiLowCompare').value, hi = +qs('#rsiHighCompare').value;
    res = rsiStrategy(d.closes, dates, L, lo, hi);
  } else return;

  drillPositionChart?.destroy();
  drillPositionChart = new Chart(qs('#drillPositionChart'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Position (1=Long,0=Flat)',
        data: res.positions,
        borderWidth: 2,
        stepped: true,
        fill: false,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'time' },
        y: { min: 0, max: 1, ticks: { stepSize: 1 } }
      }
    }
  });
}
/* =========  script.js  ========= */

/* ---------- GLOBAL STATE ---------- */
let currentTimeframe = '1d';
let isRefreshing     = false;
let selectedETFs     = [];         // symbols currently plotted
const trackedETFs    = [
  { symbol: 'QQQ',  name: 'Invesco QQQ Trust',               expenseRatio: 0.20 },
  { symbol: 'SPY',  name: 'SPDR S&P 500 ETF',                expenseRatio: 0.09 },
  { symbol: 'IWM',  name: 'iShares Russell 2000 ETF',        expenseRatio: 0.19 },
  { symbol: 'GLD',  name: 'SPDR Gold Shares',                expenseRatio: 0.40 }
];
let recommendedETFs = [ 
  { symbol: 'QQQ',  name: 'Invesco QQQ Trust',               expenseRatio: 0.20 },
  { symbol: 'SPY',  name: 'SPDR S&P 500 ETF',                expenseRatio: 0.09 },
  { symbol: 'IWM',  name: 'iShares Russell 2000 ETF',        expenseRatio: 0.19 },
  { symbol: 'GLD',  name: 'SPDR Gold Shares',                expenseRatio: 0.40 }];
const etfData = {};          // cache for fetched JSON
let chart;                   // Chart.js instance

/* ---------- TIME-FRAME MAP ---------- */
const TF_MAP = {
  '1d':  { range: '1d',  interval: '5m'  },
  '5d':  { range: '5d',  interval: '30m' },
  '1mo': { range: '1mo', interval: '1d'  },
  '6mo': { range: '6mo', interval: '1d'  },
  '1y':  { range: '1y',  interval: '1d'  }
};

/* ---------- DOM HELPERS ----------? */
const qs  = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

/* ---------- BUILD URL ---------- */
/* creates a full url that passes through AllOrigins and appends a timestamp to force a fresh hit.*/ 

function buildURL(symbol) {
  const { range, interval } = TF_MAP[currentTimeframe];
  const yahoo = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
                `?range=${range}&interval=${interval}&includePrePost=false`;
  // AllOrigins adds CORS headers → browser accepts it
  return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(yahoo) +'&timestamp=' + Date.now();
}


/* ----  Search helpers  ------------------------------------ */
const SEARCH_API = term =>
  'https://api.allorigins.win/raw?url=' +
  encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${term}&quotesCount=10&newsCount=0`) +
  '&timestamp=' + Date.now();                        // bypass AllOrigins cache

// debounce so we don't hammer the endpoint
const debounce = (fn, ms=350)=>{
  let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); };
};

async function searchETFs(term){
  if(!term) return [];
  const json = await (await fetch(SEARCH_API(term))).json();
  return (json.quotes || []).filter(q => q.quoteType === 'ETF')
                            .map(q => ({symbol:q.symbol, name:q.shortname || q.longname || q.symbol}));
}
const overviewCache = {};   // NEW


/* ---------- FETCH ONE ETF ---------- */
async function fetchETFData (etf) {
  try {
    const rsp = await fetch(buildURL(etf.symbol));
    const json = await rsp.json();
    const res  = json.chart?.result?.[0];
    if (!res) throw new Error('bad JSON');

    /* keep (timestamp, close) pairs where close !== null */
    const pairs = (res.timestamp || []).map((t, i) => ({
        t: t * 1000,
        c: res.indicators.quote[0].close[i]
      }))
      .filter(p => p.c != null);

    /* ---------- fallback if intraday data is empty ---------- */
    if (!pairs.length) {
      // only try once: when the user is on the 1-day / 5-min view
      if (currentTimeframe === '1d') {
        // temporarily widen to 5-day / 30-min
        const prevTF = currentTimeframe;
        currentTimeframe = '5d';
        const ok = await fetchETFData(etf);     // recurse once
        currentTimeframe = prevTF;              // restore selection
        return ok;                              // true or false from retry
      }
      return false;                             // give up for other ranges
    }


    const ts     = pairs.map(p => p.t);
    const closes = pairs.map(p => p.c);
    const first  = closes[0];
    const last   = closes[closes.length - 1];
    const pct    = ((last - first) / first) * 100;

    etfData[etf.symbol] = { ts, closes, first, last, pct };
    return true;                                  // 👈 success
  } catch (err) {
    console.error(`Fetch failed for ${etf.symbol}:`, err.message || err);
    return false;
  }
}

/* ---------- FETCH ALL ---------- */
async function fetchAllETFData () {
  if (isRefreshing) return;
  isRefreshing = true;

  qs('#refreshBtn').innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Refreshing…';

  await Promise.all(trackedETFs.map(fetchETFData));

  renderETFCards();

  /* 🆕 auto-select first ETF if none chosen yet */
  if (!selectedETFs.length) {
    selectedETFs.push(trackedETFs[0].symbol);   // VTI
    updateSelectedTags();
  }

  updateChart();

  qs('#refreshBtn').innerHTML =
      '<i class="fas fa-sync-alt"></i> Refresh Data';
  isRefreshing = false;
}


/* ---------- RENDER SIDEBAR CARDS ---------- */
function renderETFCards() {
  const grid = qs('#etfGrid');
  grid.innerHTML = '';
  recommendedETFs.slice(0, 4).forEach(etf => {
  const datum  = etfData[etf.symbol];                   // NEW
  const pctStr = datum ? datum.pct.toFixed(2) + '%' : '—'; // NEW

  const card = document.createElement('div');
  card.className = 'etf-card' +
                   (selectedETFs.includes(etf.symbol) ? ' selected' : '');

  card.innerHTML = `
    <div class="etf-symbol">${etf.symbol}</div>
    <div class="etf-name">${etf.name}</div>
    <div class="etf-price">${datum ? datum.last.toFixed(2) : '—'}</div>
    <div class="etf-change ${datum && datum.pct >= 0 ? 'positive' : 'negative'}">
      ${pctStr}
    </div>
  `;

  card.onclick = async () => {
//   /* first: show modal */
//   const overview = await fetchETFOverview(etf.symbol);
//   showETFModal(etf, overview);

  /* second: toggle chart selection as before */
  if (!selectedETFs.includes(etf.symbol))
      selectedETFs.push(etf.symbol);
  else  selectedETFs = selectedETFs.filter(s => s !== etf.symbol);

  renderETFCards();
  updateSelectedTags();
  updateChart();
};

  grid.appendChild(card);
});
}

/* ---------- TAGS UNDER CHART ---------- */
function updateSelectedTags() {
  const wrap = qs('#selectedETFs');
  wrap.innerHTML = '';
  if (!selectedETFs.length) {
    wrap.innerHTML = '<div class="etf-tag">Select ETFs to compare</div>';
    return;
  }
  selectedETFs.forEach(sym => {
    const tag = document.createElement('div');
    tag.className = 'etf-tag';
    tag.innerHTML = `${sym} <span class="remove-tag">&times;</span>`;
    tag.querySelector('.remove-tag').onclick = () => {
      selectedETFs = selectedETFs.filter(s => s !== sym);
      renderETFCards();
      updateSelectedTags();
      updateChart();
    };
    wrap.appendChild(tag);
  });
}

/* ---------- DRAW / UPDATE CHART ---------- */
function updateChart() {
  if (!selectedETFs.length) { chart?.destroy(); return; }

  const labels   = etfData[selectedETFs[0]].ts.map(t => new Date(t));
  const datasets = selectedETFs.map(sym => ({
    label: sym,
    data : etfData[sym].closes,
    borderWidth: 2,
    pointRadius: 0
  }));

  const unit = (currentTimeframe === '1d') ? 'hour' : 'day';      
  chart?.destroy();
  chart = new Chart(qs('#etfChart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'nearest', intersect: false },
      plugins   : { legend: { position: 'bottom' } },
      scales    : {
        x: { type: 'time', time: { unit } }                      // CHANGED
      }
    }
  });
}

/* ---------- CLEAR ALL BUTTON ---------- */
function clearAllETFs() {
  selectedETFs = [];
  updateSelectedTags();
  renderETFCards();
  updateChart();
}

/* ---------- INITIALISE ---------- */
document.addEventListener('DOMContentLoaded', () => {

  /* timeframe buttons */
  qsa('.timeframe-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      qsa('.timeframe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentTimeframe = btn.dataset.timeframe;
      fetchAllETFData();                 // re-fetch for new range
    });
  });

  /* refresh button */
  qs('#refreshBtn').addEventListener('click', fetchAllETFData);

  /* -------- first data pull -------- */
  fetchAllETFData();

  /* ============ 🆕 LIVE SEARCH ============ */
  const list = qs('#searchResults');  // <ul> we added in HTML
  const box  = qs('#searchBox');      // the <input>

  box.addEventListener('input', debounce(async e => {
    const term = e.target.value.trim();
    if (!term) { list.hidden = true; return; }

    const results = await searchETFs(term);   // helper from step 3
    if (!results.length) { list.hidden = true; return; }

    list.innerHTML = '';
    results.forEach(r => {
      const li = document.createElement('li');
      li.textContent = `${r.symbol} – ${r.name}`;

      /* 🆕 fully-featured click */
      li.onclick = async () => {

      if (!recommendedETFs.find(e => e.symbol === r.symbol)) {
        recommendedETFs.unshift({ symbol: r.symbol, name: r.name, expenseRatio: 0 });
        // drop the oldest so we stay at exactly 4
        if (recommendedETFs.length > 4) recommendedETFs.pop();
      }

        /* 2 – fetch price history; bail out if Yahoo returns no candles */
        const ok = await fetchETFData({ symbol: r.symbol, name: r.name, expenseRatio: 0 });
        if (!ok) {
          alert(`Sorry, no price data available for ${r.symbol}.`);
          return;
        }

        /* 3 – (optional) warm the overview cache */
        fetchETFOverview?.(r.symbol).catch(()=>{});

        /* 4 – rebuild sidebar, add to selections, redraw */
        renderETFCards();
        if (!selectedETFs.includes(r.symbol)) selectedETFs.push(r.symbol);
        updateSelectedTags();
        updateChart();

        /* 5 – tidy up */
        list.hidden = true;
        box.value   = '';
      };


      list.appendChild(li);
    });

    list.hidden = false;
  }));

  /* hide list when you click outside */
  document.addEventListener('click', e => {
    if (!box.contains(e.target) && !list.contains(e.target)) {
      list.hidden = true;
    }
  });
  const riskRange = qs('#riskRange');
  const riskLabel = qs('#riskLabel');
  const riskDesc  = qs('#riskDesc');

  function getRiskProfile(value) {
    const v = Number(value);
    if (v <= 20) {
      return { label: 'Very conservative',
               desc:  '99% chance you won’t lose more than 3% in a year.' };
    } else if (v <= 40) {
      return { label: 'Conservative',
               desc:  '99% chance you won’t lose more than 8% in a year.' };
    } else if (v <= 60) {
      return { label: 'Moderate',
               desc:  '99% chance you won’t lose more than 19% in a year.' };
    } else if (v <= 80) {
      return { label: 'Aggressive',
               desc:  '99% chance you won’t lose more than 30% in a year.' };
    } else {
      return { label: 'Very aggressive',
               desc:  '99% chance you won’t lose more than 45% in a year.' };
    }
  }

  function updateRiskUI() {
    const { label, desc } = getRiskProfile(riskRange.value);
    riskLabel.textContent = label;
    riskDesc.textContent  = desc;
  }

  riskRange.addEventListener('input', updateRiskUI);
  updateRiskUI();

  // —— NEW INVESTMENT SLIDER SETUP —— 
  const investRange  = qs('#investRange');
  const investAmount = qs('#investAmount');

  investRange.addEventListener('input', () => {
    investAmount.textContent = Number(investRange.value).toLocaleString();
  });
  function updateInvestUI() {
    investAmount.textContent = Number(investRange.value).toLocaleString();
  }

  // initialize on page-load
  updateInvestUI();

});   
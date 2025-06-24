// Bond script.js (FRED integration with CORS proxy)
const FRED_KEY = '6dad648a0ebc97770344c48efbe8c13b';
const FRED_ENDPOINT = 'https://api.stlouisfed.org/fred/series/observations';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';  // public proxy for CORS
const DEFAULT_SERIES = ['DGS2', 'DGS5', 'DGS10', 'DGS30'];
const { DateTime } = luxon;
let bondsData = [];
let charts = {};

document.addEventListener('DOMContentLoaded', () => {
  initUI();
  fetchAndRender();
});

function initUI() {
  document.getElementById('search-input').addEventListener('input', fetchAndRender);
  document.getElementById('filter-duration').addEventListener('change', fetchAndRender);
  document.getElementById('filter-return').addEventListener('change', fetchAndRender);
  document.getElementById('run-sim').addEventListener('click', simulateRateImpact);
}

// Fetch only the latest observation to reduce payload
async function fetchLatestObservation(seriesId) {
  const url = `${FRED_ENDPOINT}?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=1`;
  try {
    const response = await fetch(CORS_PROXY + encodeURIComponent(url));
    const json = await response.json();
    return json.observations && json.observations[0] ? json.observations[0] : null;
  } catch (err) {
    console.error(`Error loading ${seriesId}:`, err);
    return null;
  }
}

// Main data fetch & render
async function fetchAndRender() {
  const input = document.getElementById('search-input').value.trim().toUpperCase();
  const seriesList = input ? input.split(',').map(s => s.trim()) : DEFAULT_SERIES;

  const raw = await Promise.all(
    seriesList.map(async id => ({ id, obs: await fetchLatestObservation(id) }))
  );

  bondsData = raw.map(({ id, obs }) => {
    const years = parseInt(id.replace(/\D/g, ''), 10) || 0;
    const rate  = obs && obs.value !== '.' ? parseFloat(obs.value) : 0;
    return { ticker: id, couponRate: rate, yearsToMaturity: years };
  });

  applyFilters();
  renderList();
  updateGrowthChart();
  updateLadderChart();
  updateBubbleChart();
}

function applyFilters() {
  const dur = document.getElementById('filter-duration').value;
  const ret = document.getElementById('filter-return').value;
  bondsData = bondsData.filter(b => {
    let ok = true;
    if (dur === 'short')  ok = ok && b.yearsToMaturity < 3;
    if (dur === 'medium') ok = ok && b.yearsToMaturity >= 3 && b.yearsToMaturity <= 10;
    if (dur === 'long')   ok = ok && b.yearsToMaturity > 10;
    if (ret === 'low')    ok = ok && b.couponRate < 3;
    if (ret === 'mid')    ok = ok && b.couponRate >= 3 && b.couponRate <= 6;
    if (ret === 'high')   ok = ok && b.couponRate > 6;
    return ok;
  });
}

function renderList() {
  const ul = document.getElementById('bond-list');
  ul.innerHTML = bondsData.length
    ? bondsData.map(b => `<li>${b.ticker} – YTM: ${b.couponRate.toFixed(2)}%, Matures in ${b.yearsToMaturity} yrs</li>`).join('')
    : '<li>No matching bonds</li>';
}

// Re-create Growth chart each time with new data
function updateGrowthChart() {
  const ctx = document.getElementById('growth-chart').getContext('2d');
  const b = bondsData[0] || { ticker:'', couponRate:0 };
  const labels = [1,2,3,4,5].map(y => `${y}yr`);
  const data   = labels.map((_,i) => b.couponRate * (i+1));
  if (charts.growth) charts.growth.destroy();
  charts.growth = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets:[{ label: b.ticker, data, fill:false }] },
    options: { responsive:true, maintainAspectRatio:false }
  });
}

function updateLadderChart() {
  const ctx = document.getElementById('ladder-chart').getContext('2d');
  const labels = bondsData.map(b => b.ticker);
  const data   = bondsData.map(b => b.yearsToMaturity);
  if (charts.ladder) charts.ladder.destroy();
  charts.ladder = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets:[{ label:'Maturity (yrs)', data }] },
    options: { responsive:true, maintainAspectRatio:false }
  });
}

function updateBubbleChart() {
  const ctx = document.getElementById('bubble-chart').getContext('2d');
  const ds = bondsData.map(b => ({ label: b.ticker, data:[{ x:b.yearsToMaturity, y:b.couponRate, r:b.couponRate*2 }] }));
  if (charts.bubble) charts.bubble.destroy();
  charts.bubble = new Chart(ctx, {
    type: 'bubble',
    data: { datasets: ds },
    options: { responsive:true, maintainAspectRatio:false, scales:{ x:{ title:{ display:true, text:'Years' }}, y:{ title:{ display:true, text:'YTM (%)' }}} }
  });
}

function simulateRateImpact() {
  const base = +document.getElementById('sim-price').value;
  const chg  = +document.getElementById('sim-rate-change').value/100;
  const labels = Array.from({length:5},(_,i)=>`${i+1}yr`);
  const data   = labels.map((_,i)=> base/Math.pow(1+chg,i+1));
  const ctx = document.getElementById('rate-sim-chart').getContext('2d');
  if (charts.rate) charts.rate.destroy();
  charts.rate = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets:[{ label:'Price', data, fill:false }] },
    options: { responsive:true, maintainAspectRatio:false }
  });
}
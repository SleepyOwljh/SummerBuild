function getFullETFList() {
  const symbols = new Set([...trackedETFs.map(e => e.symbol), ...selectedETFs]);
  return Array.from(symbols).map(sym =>
    recommendedETFs.find(e => e.symbol === sym) || { symbol: sym, name: sym, expenseRatio: 0 }
  );
}

let currentTimeframe = '1d';
let isRefreshing     = false;
let selectedETFs     = [];
const trackedETFs    = [
  { symbol: 'QQQ', name: 'Invesco QQQ Trust',        expenseRatio: 0.20 },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF',         expenseRatio: 0.09 },
  { symbol: 'IWM', name: 'iShares Russell 2000 ETF', expenseRatio: 0.19 },
  { symbol: 'GLD', name: 'SPDR Gold Shares',         expenseRatio: 0.40 }
];
let recommendedETFs = [...trackedETFs];
const etfData       = {};
let chart, plComparisonChart, drillSignalChart, drillPositionChart;
const INITIAL_CAPITAL = 100000;

/* DOM HELPERS */
const qs  = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

/* TIMEFRAME MAP */
const TF_MAP = {
  '1d':  { range: '1d',  interval: '5m' },
  '5d':  { range: '5d',  interval: '30m' },
  '1mo': { range: '1mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y':  { range: '1y',  interval: '1d' }
};

/* BUILD URL */
function buildURL(symbol) {
  const { range, interval } = TF_MAP[currentTimeframe];
  const yahoo = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
                `?range=${range}&interval=${interval}&includePrePost=false`;
  return 'https://api.allorigins.win/raw?url=' +
         encodeURIComponent(yahoo) +
         '&timestamp=' + Date.now();
}

/* FETCH ONE ETF */
async function fetchETFData(etf) {
  try {
    const rsp  = await fetch(buildURL(etf.symbol));
    const json = await rsp.json();
    const res  = json.chart?.result?.[0];
    if (!res) throw new Error('bad JSON');

    let pairs = (res.timestamp||[]).map((t,i)=>({
      t: t*1000, c: res.indicators.quote[0].close[i]
    })).filter(p=>p.c!=null);

    if (!pairs.length && currentTimeframe==='1d') {
      const prev = currentTimeframe;
      currentTimeframe = '5d';
      const ok = await fetchETFData(etf);
      currentTimeframe = prev;
      return ok;
    }
    if (!pairs.length) return false;

    const ts     = pairs.map(p=>p.t),
          closes = pairs.map(p=>p.c),
          first  = closes[0],
          last   = closes[closes.length-1],
          pct    = ((last-first)/first)*100;

    etfData[etf.symbol] = { ts, closes, pct, last };
    return true;
  } catch (e) {
    console.error(`Fetch failed for ${etf.symbol}`, e);
    return false;
  }
}

/* FETCH ALL & RENDER */
async function fetchAllETFData() {
  if (isRefreshing) return;
  isRefreshing = true;
  qs('#refreshBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing…';

  await Promise.all(getFullETFList().map(fetchETFData));
  renderETFCards();

  if (!selectedETFs.length) {
    selectedETFs.push(trackedETFs[0].symbol);
    updateSelectedTags();
    updateCompareETFSelect();
  }

  updateChart();
  qs('#refreshBtn').innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Data';
  isRefreshing = false;
}

/* RENDER SIDEBAR */
function renderETFCards() {
  const grid = qs('#etfGrid');
  grid.innerHTML = '';
  recommendedETFs.slice(0,4).forEach(etf => {
    const d   = etfData[etf.symbol],
          pct = d? d.pct.toFixed(2)+'%' : '—';
    const card = document.createElement('div');
    card.className = 'etf-card' + (selectedETFs.includes(etf.symbol)?' selected':'');
    card.innerHTML = `
      <div class="etf-symbol">${etf.symbol}</div>
      <div class="etf-name">${etf.name}</div>
      <div class="etf-price">${d?d.last.toFixed(2):'—'}</div>
      <div class="etf-change ${d&&d.pct>=0?'positive':'negative'}">${pct}</div>
    `;
    card.onclick = () => {
      if (!selectedETFs.includes(etf.symbol)) selectedETFs.push(etf.symbol);
      else selectedETFs = selectedETFs.filter(s=>s!==etf.symbol);
      updateSelectedTags();
      updateCompareETFSelect();
      renderETFCards();
      updateChart();
    };
    grid.appendChild(card);
  });
}

/* UPDATE TAGS & ETF SELECT */
function updateSelectedTags() {
  const wrap = qs('#selectedETFs');
  wrap.innerHTML = '';
  if (!selectedETFs.length) {
    wrap.innerHTML = '<div class="etf-tag">Select ETFs to compare</div>';
  } else {
    selectedETFs.forEach(sym => {
      const tag = document.createElement('div');
      tag.className = 'etf-tag';
      tag.innerHTML = `${sym} <span class="remove-tag">&times;</span>`;
      tag.querySelector('.remove-tag').onclick = () => {
        selectedETFs = selectedETFs.filter(s=>s!==sym);
        updateSelectedTags();
        updateCompareETFSelect();
        renderETFCards();
        updateChart();
      };
      wrap.appendChild(tag);
    });
  }
}
function updateCompareETFSelect() {
  const sel = qs('#compareETFSelect');
  sel.innerHTML = '<option value="">-- Choose ETF --</option>';
  selectedETFs.forEach(sym => {
    const opt = document.createElement('option');
    opt.value = sym; opt.textContent = sym;
    sel.appendChild(opt);
  });
}

/* MAIN PRICE CHART */
function updateChart() {
  if (!selectedETFs.length) { chart?.destroy(); return; }
  const sym     = selectedETFs[0],
        d       = etfData[sym],
        labels  = d.ts.map(t=>new Date(t)),
        datasets = selectedETFs.map(s=>({
          label: s,
          data:  etfData[s].closes,
          borderWidth:2,
          pointRadius:0
        }));
  chart?.destroy();
  chart = new Chart(qs('#etfChart'),{
    type:'line',
    data:{ labels, datasets },
    options:{
      responsive:true,
      plugins:{ legend:{ position:'bottom' }},
      scales:{ x:{ type:'time', time:{ unit:currentTimeframe==='1d'?'hour':'day' } }}
    }
  });
}

/* LIVE SEARCH */
const SEARCH_API = term =>
  'https://api.allorigins.win/raw?url=' +
  encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${term}&quotesCount=10&newsCount=0`) +
  '&timestamp=' + Date.now();

const debounce = (fn,ms=300)=>{ let t; return(...a)=>{clearTimeout(t); t=setTimeout(()=>fn(...a),ms)}};

async function searchETFs(term) {
  if(!term) return [];
  const json = await (await fetch(SEARCH_API(term))).json();
  return (json.quotes||[])
    .filter(q=>q.quoteType==='ETF')
    .map(q=>({ symbol:q.symbol, name:q.shortname||q.longname||q.symbol }));
}

/* STRATEGIES */
function sma(arr,N){
  const out=Array(arr.length).fill(null); let sum=0;
  for(let i=0;i<arr.length;i++){
    sum+=arr[i];
    if(i>=N) sum-=arr[i-N];
    if(i>=N-1) out[i]=sum/N;
  }
  return out;
}
function maCrossoverStrategy(prices,_,fast,slow){
  const f=sma(prices,fast), s=sma(prices,slow);
  const pos=[0], eq=[INITIAL_CAPITAL];
  for(let i=1;i<prices.length;i++){
    const sig=(f[i-1]!=null&&s[i-1]!=null&&f[i-1]>s[i-1])?1:0;
    pos.push(sig);
    const r=(prices[i]-prices[i-1])/prices[i-1];
    eq.push(eq[i-1]*(1+sig*r));
  }
  return { timestamps:prices.map((_,i)=>i), equity:eq, positions:pos, label:`MA${fast}-${slow}` };
}
function rsi(prices,L){
  const d=prices.slice(1).map((p,i)=>p-prices[i]), out=Array(prices.length).fill(null);
  let g=0,l=0;
  for(let i=0;i<L;i++){ g+=Math.max(d[i],0); l+=Math.max(-d[i],0); }
  let ag=g/L, al=l/L;
  out[L]=al===0?100:100-(100/(1+ag/al));
  for(let i=L+1;i<prices.length;i++){
    const dd=d[i-1];
    ag=(ag*(L-1)+Math.max(dd,0))/L;
    al=(al*(L-1)+Math.max(-dd,0))/L;
    out[i]=al===0?100:100-(100/(1+ag/al));
  }
  return out;
}
function rsiStrategy(prices,_,L,lo,hi){
  const s=rsi(prices,L), pos=[0], eq=[INITIAL_CAPITAL];
  for(let i=1;i<prices.length;i++){
    let sig=0; if(s[i-1]<lo) sig=1; if(s[i-1]>hi) sig=0;
    pos.push(sig);
    const r=(prices[i]-prices[i-1])/prices[i-1];
    eq.push(eq[i-1]*(1+sig*r));
  }
  return { timestamps:prices.map((_,i)=>i), equity:eq, positions:pos, label:`RSI${L}-${lo}-${hi}` };
}

/* METRICS */
function totalReturn(eq){return (eq[eq.length-1]/eq[0]-1)*100;}
function sharpeRatio(ret){
  const μ=ret.reduce((a,b)=>a+b,0)/ret.length;
  const σ=Math.sqrt(ret.map(r=>(r-μ)**2).reduce((a,b)=>a+b)/(ret.length-1));
  return μ/σ*Math.sqrt(252);
}
function maxDrawdown(eq){
  let peak=eq[0], mdd=0;
  eq.forEach(v=>{peak=Math.max(peak,v); mdd=Math.max(mdd,(peak-v)/peak);});
  return mdd*100;
}

function clearAllETFs() {
  selectedETFs = [];
  updateSelectedTags();
  updateCompareETFSelect();
  renderETFCards();
  updateChart();
}

/* INITIALISE */
document.addEventListener('DOMContentLoaded',()=>{
  // timeframe
  qsa('.timeframe-btn').forEach(btn=>btn.addEventListener('click',()=>{
    qsa('.timeframe-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentTimeframe=btn.dataset.timeframe;

    Promise.all(selectedETFs.map(sym => {
      const etf = recommendedETFs.find(e => e.symbol === sym) || { symbol: sym, name: sym, expenseRatio: 0 };
      return fetchETFData(etf);
    })).then(() => {
      renderETFCards();
      updateChart();
    });
  }));

  qs('#refreshBtn').addEventListener('click',fetchAllETFData);

  fetchAllETFData();

  const box=qs('#searchBox'), list=qs('#searchResults');
  box.addEventListener('input',debounce(async e=>{
    const t=e.target.value.trim(); if(!t){list.hidden=true;return;}
    const res=await searchETFs(t); if(!res.length){list.hidden=true;return;}
    list.innerHTML=''; res.forEach(r=>{
      const li=document.createElement('li'); li.textContent=`${r.symbol} – ${r.name}`;
      li.onclick=async()=>{
        if(!recommendedETFs.find(e=>e.symbol===r.symbol)) {
          recommendedETFs.unshift({symbol:r.symbol,name:r.name,expenseRatio:0});
        }
        const ok=await fetchETFData(r);
        if(!ok){alert(`No data for ${r.symbol}`);return;}
        renderETFCards();
        updateSelectedTags();
        updateCompareETFSelect();
        updateChart();
        list.hidden=true; box.value='';
      };
      list.appendChild(li);
    });
    list.hidden=false;
  }));
  document.addEventListener('click',e=>{if(!box.contains(e.target)&&!list.contains(e.target))list.hidden=true;});

  // risk
  const rr=qs('#riskRange'), rL=qs('#riskLabel'), rD=qs('#riskDesc');
  function updRisk(){const v=+rr.value;let label,desc;
    if(v<=20){label='Very conservative';desc='…won’t lose more than 3%.';}
    else if(v<=40){label='Conservative';desc='…won’t lose more than 8%.';}
    else if(v<=60){label='Moderate';desc='…won’t lose more than 19%.';}
    else if(v<=80){label='Aggressive';desc='…won’t lose more than 30%.';}
    else{label='Very aggressive';desc='…won’t lose more than 45%.';}
    rL.textContent=label; rD.textContent=desc;
  }
  rr.addEventListener('input',updRisk); updRisk();

  // populate ETF select
  updateCompareETFSelect();

  // compare slider
  const ci=qs('#compareInvestAmt'), cd=qs('#compareInvestDisplay');
  ci.addEventListener('input',()=>cd.textContent='$'+Number(ci.value).toLocaleString());
  ci.dispatchEvent(new Event('input'));

  // run comparison
  qs('#runComparison').addEventListener('click',updateComparisonChart);

  // re-run when params change
  ['#maFastCompare','#maSlowCompare','#rsiLBCompare','#rsiLowCompare','#rsiHighCompare']
    .forEach(sel=>qs(sel).addEventListener('input',updateComparisonChart));

  // drill change
  qs('#drillStrategySelect').addEventListener('change',()=>{
    const d=qs('#drillStrategySelect').value;
    qs('#showDrillDetails').hidden=(d==='bh');
    qs('#drillDetails').hidden=true;
    updateDrillMetrics();
  });

  // show details
  qs('#showDrillDetails').addEventListener('click',()=>{
    qs('#drillDetails').hidden=false;
    drawDrillSignalChart();
    drawDrillPositionChart();
  });

  const clearBtn = qs('.clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllETFs);
  }
});

/* UPDATE COMPARISON */
function updateComparisonChart(){
  const sym=qs('#compareETFSelect').value;
  if(!sym){alert('Please select an ETF'); return;}
  const d=etfData[sym];
  if(!d){alert(`No data for ${sym}`); return;}
  const dates=d.ts.map(t=>new Date(t)), invest=+qs('#compareInvestAmt').value;

  // BH
  const bhEq=[INITIAL_CAPITAL];
  for(let i=1;i<d.closes.length;i++){
    const r=(d.closes[i]-d.closes[i-1])/d.closes[i-1];
    bhEq.push(bhEq[i-1]*(1+r));
  }
  // MA
  const f=+qs('#maFastCompare').value, s=+qs('#maSlowCompare').value;
  const maRes=maCrossoverStrategy(d.closes,dates,f,s);
  // RSI
  const L=+qs('#rsiLBCompare').value, lo=+qs('#rsiLowCompare').value, hi=+qs('#rsiHighCompare').value;
  const rsiRes=rsiStrategy(d.closes,dates,L,lo,hi);

  const scale=arr=>arr.map(v=>v/INITIAL_CAPITAL*invest);
  const datasets=[
    {label:'Buy & Hold',data:scale(bhEq),borderWidth:2},
    {label:maRes.label,data:scale(maRes.equity),borderWidth:2},
    {label:rsiRes.label,data:scale(rsiRes.equity),borderWidth:2}
  ];

  plComparisonChart?.destroy();
  plComparisonChart=new Chart(qs('#plComparisonChart'),{
    type:'line',
    data:{labels:dates,datasets},
    options:{scales:{x:{type:'time'}}}
  });

  // default drill → MA
  qs('#drillStrategySelect').value='ma';
  updateDrillMetrics();
  qs('#showDrillDetails').hidden=false;
  qs('#drillDetails').hidden=true;
}

/* UPDATE DRILL METRICS */
function updateDrillMetrics(){
  const sym=qs('#compareETFSelect').value; if(!sym)return;
  const d=etfData[sym];
  const dates=d.ts.map(t=>new Date(t)), invest=+qs('#compareInvestAmt').value;
  let res;
  const drill=qs('#drillStrategySelect').value;
  if(drill==='bh'){
    const eq=[INITIAL_CAPITAL];
    for(let i=1;i<d.closes.length;i++){
      const r=(d.closes[i]-d.closes[i-1])/d.closes[i-1];
      eq.push(eq[i-1]*(1+r));
    }
    res={timestamps:dates,equity:eq,positions:[]};
  }
  else if(drill==='ma'){
    const f=+qs('#maFastCompare').value, s=+qs('#maSlowCompare').value;
    res=maCrossoverStrategy(d.closes,dates,f,s);
  }
  else{
    const L=+qs('#rsiLBCompare').value, lo=+qs('#rsiLowCompare').value, hi=+qs('#rsiHighCompare').value;
    res=rsiStrategy(d.closes,dates,L,lo,hi);
  }

  const scaled=res.equity.map(v=>v/INITIAL_CAPITAL*invest);
  const tot=totalReturn(scaled).toFixed(2)+'%';
  const ret=scaled.map((v,i,a)=>i>0?v/a[i-1]-1:0).slice(1);
  const sr=sharpeRatio(ret).toFixed(2);
  const md=maxDrawdown(scaled).toFixed(2)+'%';
  const pl=(scaled[scaled.length-1]-invest).toLocaleString(undefined,{style:'currency',currency:'USD'});

  qs('#drillTotalReturn').textContent=tot;
  qs('#drillSharpe').textContent=sr;
  qs('#drillMaxDD').textContent=md;
  qs('#drillPL').textContent=pl;
}

/* DRAW SIGNAL CHART */
function drawDrillSignalChart(){
  const sym=qs('#compareETFSelect').value;
  const d=etfData[sym];
  const dates=d.ts.map(t=>new Date(t));
  let res;
  const drill=qs('#drillStrategySelect').value;
  if(drill==='ma'){
    const f=+qs('#maFastCompare').value, s=+qs('#maSlowCompare').value;
    res=maCrossoverStrategy(d.closes,dates,f,s);
  }
  else if(drill==='rsi'){
    const L=+qs('#rsiLBCompare').value, lo=+qs('#rsiLowCompare').value, hi=+qs('#rsiHighCompare').value;
    res=rsiStrategy(d.closes,dates,L,lo,hi);
  } else return;

  const buys=[], sells=[];
  for(let i=1;i<res.positions.length;i++){
    if(res.positions[i]===1 && res.positions[i-1]===0) buys.push({x:dates[i],y:d.closes[i]});
    if(res.positions[i]===0 && res.positions[i-1]===1) sells.push({x:dates[i],y:d.closes[i]});
  }

  drillSignalChart?.destroy();
  drillSignalChart=new Chart(qs('#drillSignalChart'),{
    type:'scatter',
    data:{
      datasets:[
        {
          label:'Price',
          data:d.closes.map((p,i)=>({x:dates[i],y:p})),
          showLine:true,
          borderColor:'blue',
          pointRadius:0,
          order:0
        },
        {
          label:'Buy',
          data:buys,
          pointStyle:'triangle',
          rotation:0,
          pointBackgroundColor:'green',
          pointBorderColor:'darkgreen',
          pointRadius:10,
          order:1
        },
        {
          label:'Sell',
          data:sells,
          pointStyle:'triangle',
          rotation:180,
          pointBackgroundColor:'red',
          pointBorderColor:'darkred',
          pointRadius:10,
          order:1
        }
      ]
    },
    options:{ 
      responsive: true,
      maintainAspectRatio: false,
      scales:{ x:{ type:'time' } } }
  });
}

/* DRAW POSITION CHART */
function drawDrillPositionChart(){
  const sym=qs('#compareETFSelect').value;
  const d=etfData[sym];
  const dates=d.ts.map(t=>new Date(t));
  let res;
  const drill=qs('#drillStrategySelect').value;
  if(drill==='ma'){
    const f=+qs('#maFastCompare').value, s=+qs('#maSlowCompare').value;
    res=maCrossoverStrategy(d.closes,dates,f,s);
  }
  else if(drill==='rsi'){
    const L=+qs('#rsiLBCompare').value, lo=+qs('#rsiLowCompare').value, hi=+qs('#rsiHighCompare').value;
    res=rsiStrategy(d.closes,dates,L,lo,hi);
  } else return;

  drillPositionChart?.destroy();
  drillPositionChart=new Chart(qs('#drillPositionChart'),{
    type:'line',
    data:{
      labels:dates,
      datasets:[{
        label:'Position (1=Long,0=Flat)',
        data:res.positions,
        borderWidth:2,
        stepped:true,
        fill:false,
        pointRadius:0
      }]
    },
    options:{
      responsive: true,
      maintainAspectRatio: false,
      scales:{
        x:{ type:'time' },
        y:{ min:0, max:1, ticks:{ stepSize:1 } }
      }
    }
  });
}
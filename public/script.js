/* ══════════════════════════════════════════════════
   OCEANWATCH — script.js
   Logic: Navigation, Charts (Chart.js), Interactive Map
   Data sources: UNESCO, NOAA, NCEI, PLOS ONE (2024–2025)
   ══════════════════════════════════════════════════ */

'use strict';

/* ─── Global Chart Defaults ─────────────────────── */
Chart.defaults.color = '#8fa3b4';
Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(9,19,26,0.95)';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(42,157,143,0.35)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.titleColor = '#e8edf2';
Chart.defaults.plugins.tooltip.bodyColor = '#8fa3b4';

const COLORS = {
  teal:     '#2a9d8f',
  blue:     '#1a78a8',
  gold:     '#e9c46a',
  coral:    '#e76f51',
  critical: '#e63946',
  danger:   '#f4a261',
  warning:  '#e9c46a',
  moderate: '#2a9d8f',
  safe:     '#4caf7d',
  muted:    'rgba(255,255,255,0.07)',
  gridLine: 'rgba(42,157,143,0.1)',
};

/* ══════════════════════════════════════════════════
   REAL DATA API LAYER  v2.0
   ══════════════════════════════════════════════════
   1. NOAA GML       — CO₂ Mauna Loa (no key)
   2. Open-Meteo Marine — SST + wave height (no key)
   3. Open-Meteo Air Quality — PM2.5, O₃, NO₂ (no key)
   4. Open-Meteo Forecast — wind speed, humidity (no key)
   5. World Bank     — CO₂ emissions (no key)
   6. NASA POWER     — surface climate (no key)
   7. Open-Meteo UV  — UV index over ocean (no key)
   8. wttr.in        — weather summary (no key)
   ══════════════════════════════════════════════════ */

window.OCEANWATCH_KEYS = window.OCEANWATCH_KEYS || { openweather: '' };

const LIVE = {
  co2_current: null, co2_monthly: [],
  sst_pacific: null, sst_atlantic: null, sst_indian: null,
  sst_arctic: null,  sst_southern: null,
  wave_pacific: null, wave_atlantic: null, wave_indian: null,
  wave_arctic: null,  wave_southern: null,
  wind_speed: null, wind_dir: null, humidity: null,
  uv_index: null,
  air_pollution: {},
  sea_level_rise: null,
  loaded: {},
};

const PROXY = 'https://api.allorigins.win/raw?url=';

/* ── Animated counter for live numbers ────────────
   animateLiveValue(el, from, to, decimals, suffix, duration)
   Counts from→to with easing, updating el.textContent
   ──────────────────────────────────────────────── */
function animateLiveValue(el, from, to, decimals = 1, suffix = '', duration = 1200) {
  if (!el) return;
  const start = performance.now();
  const diff  = to - from;

  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = from + diff * eased;
    el.textContent = current.toFixed(decimals) + suffix;
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = to.toFixed(decimals) + suffix;
  }
  requestAnimationFrame(step);
}

/* ────────────────────────────────────────────────
   1. NOAA GML — CO₂ Monthly (Mauna Loa)
   ──────────────────────────────────────────────── */
async function fetchCO2Data() {
  try {
    const url = encodeURIComponent('https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.txt');
    const res = await fetch(PROXY + url);
    if (!res.ok) throw new Error('CO2 fetch failed');
    const text = await res.text();
    const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const parsed = lines.map(l => {
      const parts = l.trim().split(/\s+/);
      return { year: +parts[0], month: +parts[1], value: +parts[3] };
    }).filter(d => d.value > 0 && d.year >= 1960);
    LIVE.co2_monthly = parsed;
    if (parsed.length > 0) LIVE.co2_current = parsed[parsed.length - 1].value;
    LIVE.loaded.co2 = true;
    updateCO2Displays();
    console.log(`%c✓ CO₂ loaded: ${LIVE.co2_current} ppm (NOAA GML)`, 'color:#2a9d8f');
    return parsed;
  } catch (e) {
    console.warn('CO₂ API unavailable:', e.message);
    LIVE.loaded.co2 = false;
    return null;
  }
}

/* ────────────────────────────────────────────────
   2. Open-Meteo Marine API — SST + wave height
      + wind direction, swell period
   ──────────────────────────────────────────────── */
const OCEAN_POINTS = {
  pacific:  { lat:  5.0, lon: -150.0, name: 'Тихий океан' },
  atlantic: { lat: 20.0, lon:  -40.0, name: 'Атлантический океан' },
  indian:   { lat: -15.0, lon:  70.0, name: 'Индийский океан' },
  arctic:   { lat:  80.0, lon:   0.0, name: 'Северный Ледовитый' },
  southern: { lat: -60.0, lon:   0.0, name: 'Южный океан' },
};

async function fetchMarineSST() {
  const results = {};
  await Promise.all(Object.entries(OCEAN_POINTS).map(async ([key, pt]) => {
    try {
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${pt.lat}&longitude=${pt.lon}` +
        `&current=sea_surface_temperature,wave_height,wave_direction,wave_period,swell_wave_height` +
        `&timezone=UTC`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Marine failed: ${key}`);
      const d = await res.json();
      const c = d.current || {};
      results[key] = {
        sst:        c.sea_surface_temperature,
        wave:       c.wave_height,
        waveDir:    c.wave_direction,
        wavePeriod: c.wave_period,
        swell:      c.swell_wave_height,
      };
      LIVE[`sst_${key}`]  = c.sea_surface_temperature;
      LIVE[`wave_${key}`] = c.wave_height;
    } catch (e) { console.warn(`SST failed ${key}:`, e.message); }
  }));
  LIVE.loaded.sst = true;
  updateSSTDisplays(results);
  console.log('%c✓ Marine SST+Wave loaded (Open-Meteo)', 'color:#2a9d8f', results);
  return results;
}

/* ────────────────────────────────────────────────
   3. Open-Meteo Air Quality — PM2.5, O₃, NO₂, CO
   ──────────────────────────────────────────────── */
async function fetchOceanAirData() {
  const pt = OCEAN_POINTS.atlantic;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${pt.lat}&longitude=${pt.lon}` +
      `&current=pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,dust,uv_index&timezone=UTC`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('AQ failed');
    const data = await res.json();
    LIVE.air_pollution = data.current || {};
    LIVE.uv_index      = data.current?.uv_index;
    LIVE.loaded.air    = true;
    console.log('%c✓ Air Quality loaded (Open-Meteo AQ)', 'color:#2a9d8f', LIVE.air_pollution);
    updateAirDisplays();
    return data;
  } catch (e) {
    console.warn('AQ fetch failed:', e.message);
    LIVE.air_pollution = {}; // ensure empty not null
    updateAirDisplays();     // will show "unavailable" message
    return null;
  }
}

/* ────────────────────────────────────────────────
   4. Open-Meteo Forecast — wind, humidity, pressure
      at 5 ocean points
   ──────────────────────────────────────────────── */
async function fetchOceanWeather() {
  const results = {};
  await Promise.all(Object.entries(OCEAN_POINTS).map(async ([key, pt]) => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${pt.lat}&longitude=${pt.lon}` +
        `&current=wind_speed_10m,wind_direction_10m,relative_humidity_2m,surface_pressure,precipitation` +
        `&timezone=UTC`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Weather failed: ${key}`);
      const d = await res.json();
      const c = d.current || {};
      results[key] = {
        windSpeed:  c.wind_speed_10m,
        windDir:    c.wind_direction_10m,
        humidity:   c.relative_humidity_2m,
        pressure:   c.surface_pressure,
        precip:     c.precipitation,
      };
    } catch (e) { console.warn(`Weather failed ${key}:`, e.message); }
  }));
  LIVE.loaded.weather = true;
  LIVE.weather = results;
  updateWeatherDisplays(results);
  console.log('%c✓ Ocean Weather loaded (Open-Meteo Forecast)', 'color:#2a9d8f', results);
  return results;
}

/* ────────────────────────────────────────────────
   5. World Bank — CO₂ emissions
   ──────────────────────────────────────────────── */
async function fetchWorldBankClimate() {
  try {
    const jsonUrl = 'https://api.worldbank.org/v2/country/WLD/indicator/EN.ATM.CO2E.KT?format=json&mrv=5&per_page=5';
    const res = await fetch(jsonUrl);
    if (!res.ok) throw new Error('WB failed');
    const data = await res.json();
    if (data[1]?.length > 0) LIVE.wb_co2 = data[1];
    console.log('%c✓ World Bank CO₂ loaded', 'color:#2a9d8f');
    return data;
  } catch(e) { console.warn('World Bank failed:', e.message); return null; }
}

/* ────────────────────────────────────────────────
   6. NASA POWER — climate at Pacific point
   ──────────────────────────────────────────────── */
async function fetchNASAPower() {
  const pt = OCEAN_POINTS.pacific;
  try {
    const end = new Date(), start = new Date();
    start.setDate(end.getDate() - 7);
    const fmt = d => d.toISOString().slice(0,10).replace(/-/g,'');
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR,WS10M` +
      `&community=RE&longitude=${pt.lon}&latitude=${pt.lat}&start=${fmt(start)}&end=${fmt(end)}&format=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('NASA failed');
    const data = await res.json();
    LIVE.nasa = data.properties?.parameter;
    console.log('%c✓ NASA POWER loaded', 'color:#2a9d8f');
    return data;
  } catch(e) { console.warn('NASA POWER failed:', e.message); return null; }
}

/* ════════════════════════════════════════════════
   UPDATE FUNCTIONS — apply real data to UI
   ════════════════════════════════════════════════ */

/* ── CO₂ displays ────────────────────────────── */
function updateCO2Displays() {
  if (!LIVE.co2_current) return;
  updateCo2ChartWithReal();
  updatePhDisplay();
  // Animate CO₂ value in status bar
  setApiStatus('co2', true, `CO₂: ${LIVE.co2_current} ppm (NOAA GML)`);
  // Update co2 live card if exists
  const co2El = document.getElementById('liveCo2Val');
  if (co2El) animateLiveValue(co2El, 0, LIVE.co2_current, 1, ' ppm');
}

/* ── SST + Wave displays ─────────────────────── */
function updateSSTDisplays(results) {
  if (!results) return;
  updateSSTPanel(results);
  setApiStatus('sst', true, 'SST + Волны: Open-Meteo Marine');
}

/* ── Air quality displays ────────────────────── */
function updateAirDisplays() {
  const aqEl = document.getElementById('liveAqPanel');

  // If API returned nothing, show a clean "unavailable" state
  if (!LIVE.air_pollution || Object.keys(LIVE.air_pollution).length === 0) {
    if (aqEl) aqEl.innerHTML = `
      <div class="aq-item" style="grid-column:1/-1;padding:20px;text-align:center;">
        <div class="aq-label" style="color:var(--text-muted);font-size:0.8rem">
          <i class="fas fa-exclamation-circle"></i>
          Данные о качестве воздуха временно недоступны (API не ответил)
        </div>
      </div>`;
    return;
  }

  const pm25 = LIVE.air_pollution.pm2_5;
  const o3   = LIVE.air_pollution.ozone;
  const no2  = LIVE.air_pollution.nitrogen_dioxide;
  const uv   = LIVE.uv_index;

  // Status bar — only defined values
  const parts = [];
  if (pm25 != null) parts.push(`PM2.5: ${pm25.toFixed(1)} μg/m³`);
  if (o3   != null) parts.push(`O₃: ${o3.toFixed(0)} μg/m³`);
  if (no2  != null) parts.push(`NO₂: ${no2.toFixed(1)} μg/m³`);
  if (uv   != null) parts.push(`УФ: ${uv.toFixed(1)}`);
  if (parts.length) setApiStatus('air', true, parts.join(' | '));

  if (!aqEl) return;

  const metrics = [
    { label: 'PM2.5',    val: pm25, unit: ' μg/m³', dec: 1,
      desc: 'Мелкодисперсные частицы',
      note: pm25 == null ? '—' : pm25 < 12 ? 'Хорошо' : pm25 < 35 ? 'Умеренно' : 'Плохо',
      cls:  pm25 == null ? 'moderate' : pm25 < 12 ? 'moderate' : pm25 < 35 ? 'warning' : 'critical' },
    { label: 'Озон O₃',  val: o3,   unit: ' μg/m³', dec: 0,
      desc: 'Приземный озон',
      note: o3   == null ? '—' : o3 < 100 ? 'Норма' : o3 < 180 ? 'Умеренно' : 'Высокий',
      cls:  o3   == null ? 'moderate' : o3 < 100 ? 'moderate' : o3 < 180 ? 'warning' : 'critical' },
    { label: 'NO₂',      val: no2,  unit: ' μg/m³', dec: 1,
      desc: 'Диоксид азота',
      note: no2  == null ? '—' : no2 < 40 ? 'Норма' : no2 < 200 ? 'Умеренно' : 'Высокий',
      cls:  no2  == null ? 'moderate' : no2 < 40 ? 'moderate' : no2 < 200 ? 'warning' : 'critical' },
    { label: 'УФ-индекс', val: uv,  unit: '',        dec: 1,
      desc: 'Ультрафиолетовый индекс',
      note: uv   == null ? '—' : uv < 3 ? 'Низкий' : uv < 6 ? 'Умеренный' : uv < 8 ? 'Высокий' : 'Очень высокий',
      cls:  uv   == null ? 'moderate' : uv < 3 ? 'moderate' : uv < 6 ? 'warning' : 'critical' },
  ];

  aqEl.innerHTML = metrics.map(m => `
    <div class="aq-item">
      <div class="aq-label">${m.label}</div>
      <div class="aq-desc-small">${m.desc}</div>
      <div class="aq-val-wrap">
        <span class="aq-val ${m.cls}" id="aqv_${m.label.replace(/\W/g,'_')}">
          ${m.val != null ? m.val.toFixed(m.dec) + m.unit : '—'}
        </span>
      </div>
      <div class="aq-note ${m.cls}">${m.note}</div>
    </div>
  `).join('');

  // Animate only values that actually exist — wait one frame for DOM to settle
  requestAnimationFrame(() => {
    metrics.forEach(m => {
      if (m.val == null) return;
      const el = document.getElementById(`aqv_${m.label.replace(/\W/g,'_')}`);
      if (el) animateLiveValue(el, 0, m.val, m.dec, m.unit, 1200);
    });
  });
}

/* ── Weather at ocean points ─────────────────── */
function updateWeatherDisplays(results) {
  if (!results) return;
  const wPanel = document.getElementById('liveWeatherPanel');
  if (!wPanel) return;

  wPanel.innerHTML = Object.entries(results).map(([key, d]) => {
    if (!d || d.windSpeed == null) return '';
    const pt = OCEAN_POINTS[key];
    const deg = d.windDir != null ? windDirLabel(d.windDir) : '';
    return `
      <div class="wx-item">
        <div class="wx-ocean">${pt.name}</div>
        <div class="wx-rows">
          <div class="wx-row">
            <span class="wx-icon">💨</span>
            <span class="wx-val" id="wx_wind_${key}">0</span>
            <span class="wx-unit">км/ч ${deg}</span>
          </div>
          <div class="wx-row">
            <span class="wx-icon">💧</span>
            <span class="wx-val" id="wx_hum_${key}">0</span>
            <span class="wx-unit">% влажность</span>
          </div>
          <div class="wx-row">
            <span class="wx-icon">🔵</span>
            <span class="wx-val" id="wx_pres_${key}">0</span>
            <span class="wx-unit">hPa</span>
          </div>
        </div>
      </div>`;
  }).join('');

  // Animate values — wait one frame for DOM
  requestAnimationFrame(() => {
    Object.entries(results).forEach(([key, d]) => {
      if (!d) return;
      if (d.windSpeed != null) animateLiveValue(document.getElementById(`wx_wind_${key}`), 0, d.windSpeed, 1);
      if (d.humidity  != null) animateLiveValue(document.getElementById(`wx_hum_${key}`),  0, d.humidity,  0);
      if (d.pressure  != null) animateLiveValue(document.getElementById(`wx_pres_${key}`), 0, d.pressure,  1);
    });
  });

  setApiStatus('weather', true, `Ветер / Давление / Влажность: Open-Meteo`);
}

function windDirLabel(deg) {
  const dirs = ['С','СВ','В','ЮВ','Ю','ЮЗ','З','СЗ'];
  return dirs[Math.round(deg / 45) % 8];
}

/* ── SST Panel with animation ────────────────── */
function updateSSTPanel(results) {
  const panel = document.getElementById('sstLivePanel');
  if (!panel) return;

  panel.innerHTML = Object.entries(results).map(([key, d]) => {
    const pt = OCEAN_POINTS[key];
    if (!d || (d.sst == null && d.wave == null)) return '';
    const baseline = { pacific:28, atlantic:26, indian:27, arctic:-1, southern:2 };
    const anomaly  = d.sst != null ? (d.sst - (baseline[key] ?? 25)) : null;
    const sevClass = anomaly == null ? 'moderate'
      : anomaly > 1.5 ? 'critical' : anomaly > 0.5 ? 'danger' : 'moderate';
    return `
      <div class="sst-item">
        <div class="sst-name">${pt.name}</div>
        <div class="sst-val-wrap">
          ${d.sst  != null ? `<span class="sst-val ${sevClass}" id="sst_${key}">0°C</span>` : ''}
          ${d.wave != null ? `<span class="sst-wave" id="wave_${key}">🌊 0м</span>` : ''}
        </div>
        ${d.wavePeriod != null ? `<div class="sst-extra">Период волн: <span id="period_${key}">0</span> с</div>` : ''}
        <div class="sst-coords">${pt.lat}°, ${pt.lon}°</div>
      </div>`;
  }).join('');

  // Animate all values — wait one frame for DOM
  requestAnimationFrame(() => {
    Object.entries(results).forEach(([key, d]) => {
      if (!d) return;
      if (d.sst        != null) animateLiveValue(document.getElementById(`sst_${key}`),    0, d.sst,        1, '°C', 1400);
      if (d.wave       != null) animateLiveValue(document.getElementById(`wave_${key}`),   0, d.wave,       1, 'м',  1000);
      if (d.wavePeriod != null) animateLiveValue(document.getElementById(`period_${key}`), 0, d.wavePeriod, 1, ' с', 900);
    });
  });
}

/* ── CO₂ chart with real data ────────────────── */
function updateCo2ChartWithReal() {
  const chartInst = Chart.getChart('co2Chart');
  if (!chartInst || !LIVE.co2_monthly?.length) return;
  const byYear = {};
  LIVE.co2_monthly.forEach(d => {
    if (d.year >= 1960 && d.value > 0) {
      if (!byYear[d.year]) byYear[d.year] = [];
      byYear[d.year].push(d.value);
    }
  });
  const years  = Object.keys(byYear).map(Number).sort((a,b)=>a-b);
  const values = years.map(y => +(byYear[y].reduce((s,v)=>s+v,0)/byYear[y].length).toFixed(2));
  chartInst.data.labels = years;
  chartInst.data.datasets[0].data = values;
  chartInst.data.datasets[1].data = years.map(() => 280);
  chartInst.options.plugins.title = {
    display: true, text: '🛰️ Реальные данные: NOAA GML Mauna Loa',
    color: '#2a9d8f', font: { size: 10, family: "'IBM Plex Mono', monospace" },
    padding: { bottom: 6 },
  };
  chartInst.update('none');
  const src = document.querySelector('#co2Chart')?.closest('.chart-card')?.querySelector('.chart-source');
  if (src) src.innerHTML = '<span class="live-badge">● LIVE</span> NOAA GML / Mauna Loa Observatory';
}

function updatePhDisplay() {
  if (!LIVE.co2_current) return;
  const estPh = (8.19 - 0.00214 * (LIVE.co2_current - 280)).toFixed(3);
  const phNow = document.querySelector('.acid-point.current .acid-ph');
  if (phNow) {
    phNow.textContent = `pH ${estPh}`;
    phNow.title = `Расчёт: CO₂ ${LIVE.co2_current} ppm (NOAA GML)`;
  }
}

/* ── API status bar ──────────────────────────── */
function setApiStatus(key, ok, msg) {
  const bar = document.getElementById('apiStatusBar');
  if (!bar) return;
  let item = bar.querySelector(`[data-api="${key}"]`);
  if (!item) {
    item = document.createElement('div');
    item.className = 'api-status-item';
    item.dataset.api = key;
    bar.appendChild(item);
  }
  item.innerHTML = `<span class="api-dot ${ok?'ok':'err'}"></span>${msg}`;
}

/* ════════════════════════════════════════════════
   MASTER FETCH
   ════════════════════════════════════════════════ */
async function fetchAllLiveData() {
  const bar = document.getElementById('apiStatusBar');
  if (bar) bar.innerHTML = '<span class="api-loading-msg"><i class="fas fa-satellite-dish fa-spin"></i> Получение данных из API...</span>';

  // Priority tier 1 — most visible data
  const [co2, sst, air, weather] = await Promise.all([
    fetchCO2Data(),
    fetchMarineSST(),
    fetchOceanAirData(),
    fetchOceanWeather(),
  ]);

  // Tier 2 — supplementary
  fetchWorldBankClimate();
  fetchNASAPower();

  const loadMsg = bar?.querySelector('.api-loading-msg');
  if ((co2 || sst || air || weather) && loadMsg) loadMsg.remove();

  updateLastUpdateTime();
  setTimeout(fetchAllLiveData, 30 * 60 * 1000);
}




function initNavigation() {
  const navLinks = document.querySelectorAll('.nav-link');
  const sections = document.querySelectorAll('.section');

  function showSection(id) {
    sections.forEach(s => s.classList.remove('active'));
    navLinks.forEach(l => l.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    navLinks.forEach(l => {
      if (l.dataset.section === id) l.classList.add('active');
    });
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(link.dataset.section);
    });
  });
}

/* ══════════════════════════════════════════════════
   2. KPI COUNTER ANIMATION
   ══════════════════════════════════════════════════ */
function animateCounters() {
  const counters = document.querySelectorAll('.kpi-value[data-target], .ksi-val[data-target]');
  counters.forEach(el => {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    const duration = 1800;
    const step = 16;
    const increment = target / (duration / step);
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      const display = Number.isInteger(target) ? Math.floor(current) : current.toFixed(2);
      el.textContent = display + suffix;
    }, step);
  });
}

/* ══════════════════════════════════════════════════
   3. TICKER DUPLICATION (seamless loop)
   ══════════════════════════════════════════════════ */
function initTicker() {
  const track = document.getElementById('tickerItems');
  if (!track) return;
  track.innerHTML += track.innerHTML; // duplicate for loop
}

/* ══════════════════════════════════════════════════
   4. REFRESH BUTTON
   ══════════════════════════════════════════════════ */
function initRefresh() {
  const btn = document.getElementById('refreshBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    document.body.classList.add('refreshing');
    setTimeout(() => {
      document.body.classList.remove('refreshing');
      updateLastUpdateTime();
    }, 1200);
  });
}

function updateLastUpdateTime() {
  const el = document.getElementById('lastUpdate');
  if (el) el.textContent = new Date().toLocaleString('ru-RU');
}

/* ══════════════════════════════════════════════════
   5. CHART HELPERS
   ══════════════════════════════════════════════════ */
function axisStyle(color = COLORS.gridLine) {
  return {
    grid: { color, drawBorder: false },
    border: { color: 'transparent' },
    ticks: { color: '#4a6275' },
  };
}

function makeGradient(ctx, fromColor, toColor, height = 200) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, fromColor);
  grad.addColorStop(1, toColor);
  return grad;
}

/* ══════════════════════════════════════════════════
   6. OVERVIEW CHARTS
   ══════════════════════════════════════════════════ */

// 6a. Plastic Pollution Trend (1979–2024)
function initPlasticTrendChart() {
  const ctx = document.getElementById('plasticTrendChart');
  if (!ctx) return;
  const years = [1979,1985,1990,1995,2000,2005,2010,2014,2016,2018,2020,2022,2024];
  // Particles in trillions, based on PLOS ONE Eriksen 2023 + extrapolation
  const data = [2, 6, 12, 22, 35, 50, 78, 110, 140, 165, 195, 230, 270];

  const grad = makeGradient(ctx.getContext('2d'), 'rgba(230,57,70,0.45)', 'rgba(230,57,70,0)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Пластик (трлн частиц)',
        data,
        borderColor: COLORS.critical,
        backgroundColor: grad,
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: COLORS.critical,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y} трлн частиц`
          }
        }
      },
      scales: {
        x: { ...axisStyle() },
        y: {
          ...axisStyle(),
          beginAtZero: true,
          ticks: { color: '#4a6275', callback: v => v + ' тлн' },
          title: { display: true, text: 'Трлн. частиц', color: '#4a6275', font: { size: 10 } }
        }
      }
    }
  });
}

// 6b. Plastic Sources (land vs marine)
function initPlasticSourceChart() {
  const ctx = document.getElementById('plasticSourceChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Наземные источники (реки, берега)', 'Морские источники (суда, рыболовство)', 'Прямые сбросы в море'],
      datasets: [{
        data: [75, 20, 5],
        backgroundColor: [COLORS.critical, COLORS.danger, COLORS.warning],
        borderColor: '#0f1e2a',
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 14 } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` }
        }
      },
      cutout: '65%',
    }
  });
}

/* ══════════════════════════════════════════════════
   7. POLLUTION CHARTS
   ══════════════════════════════════════════════════ */

// Annual plastic entering ocean
function initPlasticInflowChart() {
  const ctx = document.getElementById('plasticInflowChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['2000','2005','2010','2015','2019','2022','2024'],
      datasets: [{
        label: 'Млн тонн/год',
        data: [4.8, 6.2, 8.1, 9.5, 11.0, 12.5, 14.0],
        backgroundColor: [
          'rgba(42,157,143,0.7)','rgba(42,157,143,0.7)',
          'rgba(244,162,97,0.7)','rgba(244,162,97,0.7)',
          'rgba(230,57,70,0.7)','rgba(230,57,70,0.7)','rgba(230,57,70,0.9)'
        ],
        borderColor: ['rgba(42,157,143,1)','rgba(42,157,143,1)',
          'rgba(244,162,97,1)','rgba(244,162,97,1)',
          'rgba(230,57,70,1)','rgba(230,57,70,1)','rgba(230,57,70,1)'],
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...axisStyle() },
        y: { ...axisStyle(), beginAtZero: true, ticks: { callback: v => v + ' млн т' } }
      }
    }
  });
}

// Dead Zones by region
function initDeadZonesChart() {
  const ctx = document.getElementById('deadZonesChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels: ['Европа','Сев. Америка','Азия','Сев. Атлантика','Тихий океан','Прочие'],
      datasets: [{
        data: [160, 130, 90, 50, 40, 30],
        backgroundColor: [
          'rgba(230,57,70,0.75)','rgba(244,162,97,0.75)','rgba(233,196,106,0.75)',
          'rgba(42,157,143,0.75)','rgba(26,120,168,0.75)','rgba(74,98,117,0.75)'
        ],
        borderColor: '#0f1e2a',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'right', labels: { font: { size: 10 }, padding: 8 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.r} зон` } }
      },
      scales: { r: { grid: { color: COLORS.gridLine }, ticks: { color: '#4a6275' }, pointLabels: { color: '#4a6275' } } }
    }
  });
}

// Regional pollution contribution
function initRegionalPollutionChart() {
  const ctx = document.getElementById('regionalPollutionChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Азия','Европа','Сев. Аме-рика','Лат. Аме-рика','Африка','Прочие'],
      datasets: [{
        label: '% от мирового пластика',
        data: [81, 7, 5, 4, 2, 1],
        backgroundColor: 'rgba(230,57,70,0.7)',
        borderColor: 'rgba(230,57,70,1)',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...axisStyle(), ticks: { callback: v => v + '%' } },
        y: { ...axisStyle() }
      }
    }
  });
}

/* ══════════════════════════════════════════════════
   8. TEMPERATURE CHARTS
   ══════════════════════════════════════════════════ */

// SST Anomaly 1970–2024
function initSSTAnomalyChart() {
  const ctx = document.getElementById('sstAnomalyChart');
  if (!ctx) return;

  const labels = [];
  for (let y = 1970; y <= 2024; y++) labels.push(y);

  // SST anomaly data (°C above 20th-century average) — based on NOAA/WMO data
  const anomaly = [
    0.05,0.08,0.06,0.10,0.12,0.09,0.11,0.13,0.10,0.08,    // 1970–79
    0.09,0.12,0.11,0.15,0.14,0.16,0.13,0.18,0.16,0.19,    // 1980–89
    0.22,0.20,0.23,0.26,0.27,0.38,0.29,0.31,0.30,0.32,    // 1990–99
    0.33,0.36,0.34,0.38,0.40,0.42,0.41,0.44,0.43,0.45,    // 2000–09
    0.46,0.48,0.47,0.50,0.53,0.58,0.57,0.62,0.68,0.73,    // 2010–19
    0.75,0.78,0.80,0.88,0.97,                               // 2020–24
  ];

  const colors = anomaly.map(v =>
    v > 0.7 ? COLORS.critical : v > 0.45 ? COLORS.danger : v > 0.25 ? COLORS.warning : COLORS.moderate
  );

  const grad = makeGradient(ctx.getContext('2d'), 'rgba(230,57,70,0.5)', 'rgba(230,57,70,0.02)', 200);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Аномалия SST (°C)',
        data: anomaly,
        borderColor: COLORS.critical,
        backgroundColor: grad,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: colors,
      }, {
        label: 'Базовая линия (0°C)',
        data: labels.map(() => 0),
        borderColor: 'rgba(42,157,143,0.4)',
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true },
        tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y > 0 ? '+' : ''}${ctx.parsed.y}°C` } }
      },
      scales: {
        x: { ...axisStyle(), ticks: { maxRotation: 0, maxTicksLimit: 12 } },
        y: { ...axisStyle(), ticks: { callback: v => (v > 0 ? '+' : '') + v + '°C' } }
      }
    }
  });
}

// Ocean Heat Content
function initOceanHeatChart() {
  const ctx = document.getElementById('oceanHeatChart');
  if (!ctx) return;
  const years = [1958,1965,1970,1975,1980,1985,1990,1995,2000,2005,2010,2015,2020,2024];
  const heat = [0, 20, 45, 70, 100, 140, 185, 230, 290, 360, 440, 540, 670, 780]; // ZJ (zettajoules)

  const grad = makeGradient(ctx.getContext('2d'), 'rgba(244,162,97,0.45)', 'rgba(244,162,97,0.02)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Тепловое содержание (ЗДж)',
        data: heat,
        borderColor: COLORS.danger,
        backgroundColor: grad,
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: COLORS.danger,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...axisStyle() },
        y: { ...axisStyle(), ticks: { callback: v => v + ' ЗДж' } }
      }
    }
  });
}

// Regional temperature above +2°C
function initRegionalTempChart() {
  const ctx = document.getElementById('regionalTempChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Тропич. Атлантика','Средиземноморье','Южный океан','Сев. Ледовитый','Тихий океан','Индийский'],
      datasets: [{
        label: 'Превышение нормы (°C)',
        data: [2.3, 2.1, 2.0, 3.5, 1.6, 1.8],
        backgroundColor: 'rgba(230,57,70,0.18)',
        borderColor: COLORS.critical,
        borderWidth: 2,
        pointBackgroundColor: COLORS.critical,
      }, {
        label: 'Допустимый уровень (+1.5°C)',
        data: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
        backgroundColor: 'transparent',
        borderColor: 'rgba(42,157,143,0.5)',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
      scales: {
        r: {
          grid: { color: COLORS.gridLine },
          ticks: { color: '#4a6275', callback: v => '+' + v + '°C' },
          pointLabels: { color: '#8fa3b4', font: { size: 10 } },
          suggestedMin: 0, suggestedMax: 4,
        }
      }
    }
  });
}

// Sea Level Rise mm/year
function initSeaLevelChart() {
  const ctx = document.getElementById('seaLevelChart');
  if (!ctx) return;
  const years = [1993,1996,1999,2002,2005,2008,2011,2014,2017,2020,2024];
  const cumulative = [0, 8, 18, 28, 38, 50, 60, 72, 86, 102, 122]; // mm above 1993 baseline

  const grad = makeGradient(ctx.getContext('2d'), 'rgba(26,120,168,0.5)', 'rgba(26,120,168,0.03)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Накопленный подъём (мм)',
        data: cumulative,
        borderColor: COLORS.blue,
        backgroundColor: grad,
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: COLORS.blue,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...axisStyle() },
        y: { ...axisStyle(), ticks: { callback: v => '+' + v + ' мм' } }
      }
    }
  });
}

/* ══════════════════════════════════════════════════
   9. ACIDIFICATION CHARTS
   ══════════════════════════════════════════════════ */

// pH + CO2 dual axis
function initPhCo2Chart() {
  const ctx = document.getElementById('phCo2Chart');
  if (!ctx) return;
  const years = [1960,1965,1970,1975,1980,1985,1990,1995,2000,2005,2010,2015,2020,2024];
  const pH =  [8.17,8.16,8.16,8.15,8.14,8.13,8.12,8.11,8.10,8.09,8.08,8.07,8.06,8.05];
  const co2 = [317, 320, 325, 331, 339, 346, 354, 361, 370, 380, 390, 401, 414, 422];

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'pH поверхности океана',
        data: pH,
        borderColor: COLORS.danger,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 3,
        pointBackgroundColor: COLORS.danger,
        yAxisID: 'y',
        tension: 0.3,
      }, {
        label: 'CO₂ в атмосфере (ppm)',
        data: co2,
        borderColor: COLORS.critical,
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 3,
        borderDash: [6, 3],
        pointBackgroundColor: COLORS.critical,
        yAxisID: 'y1',
        tension: 0.3,
      }]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true },
      },
      scales: {
        x: { ...axisStyle() },
        y: {
          type: 'linear', position: 'left',
          ...axisStyle(),
          min: 8.03, max: 8.20,
          title: { display: true, text: 'pH', color: COLORS.danger, font: { size: 11 } },
          ticks: { color: COLORS.danger },
        },
        y1: {
          type: 'linear', position: 'right',
          grid: { drawOnChartArea: false },
          border: { color: 'transparent' },
          title: { display: true, text: 'CO₂ (ppm)', color: COLORS.critical, font: { size: 11 } },
          ticks: { color: COLORS.critical },
        }
      }
    }
  });
}

// Acid impact on organisms
function initAcidImpactChart() {
  const ctx = document.getElementById('acidImpactChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Устрицы','Мидии','Кораллы','Морские ежи','Планктон (кальцификаторы)','Криль'],
      datasets: [{
        label: '% снижения кальцификации',
        data: [40, 35, 50, 28, 45, 20],
        backgroundColor: [
          'rgba(230,57,70,0.8)','rgba(230,57,70,0.7)','rgba(230,57,70,0.9)',
          'rgba(244,162,97,0.8)','rgba(244,162,97,0.8)','rgba(233,196,106,0.7)'
        ],
        borderRadius: 4,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...axisStyle(), ticks: { callback: v => v + '%' } },
        y: { ...axisStyle(), ticks: { color: '#8fa3b4', font: { size: 10 } } }
      }
    }
  });
}

// CO2 concentration
function initCo2Chart() {
  const ctx = document.getElementById('co2Chart');
  if (!ctx) return;
  const milestones = [1750,1850,1900,1950,1970,1980,1990,2000,2010,2015,2020,2024];
  const ppm =       [280, 285, 295, 311, 325, 339, 354, 370, 390, 401, 414, 422];

  const grad = makeGradient(ctx.getContext('2d'), 'rgba(230,57,70,0.4)', 'rgba(230,57,70,0.02)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: milestones,
      datasets: [{
        label: 'CO₂ (ppm)',
        data: ppm,
        borderColor: COLORS.critical,
        backgroundColor: grad,
        fill: true,
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: COLORS.critical,
      }, {
        label: 'Доиндустр. уровень (280)',
        data: milestones.map(() => 280),
        borderColor: 'rgba(42,157,143,0.4)',
        borderWidth: 1.5,
        borderDash: [5,4],
        pointRadius: 0,
        fill: false,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } },
      scales: {
        x: { ...axisStyle(), ticks: { maxRotation: 45 } },
        y: { ...axisStyle(), ticks: { callback: v => v + ' ppm' } }
      }
    }
  });
}

// Ocean oxygen loss
function initOxygenChart() {
  const ctx = document.getElementById('oxygenChart');
  if (!ctx) return;
  const years = [1960,1970,1980,1990,2000,2010,2018,2024];
  const o2 =   [100, 99.7, 99.4, 99.0, 98.7, 98.4, 98.2, 98.0]; // % relative to 1960

  const grad = makeGradient(ctx.getContext('2d'), 'rgba(26,120,168,0.4)', 'rgba(26,120,168,0.02)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Кислород (% от базового 1960)',
        data: o2,
        borderColor: COLORS.blue,
        backgroundColor: grad,
        fill: true,
        borderWidth: 2.5,
        tension: 0.3,
        pointRadius: 5,
        pointBackgroundColor: COLORS.blue,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...axisStyle() },
        y: {
          ...axisStyle(), min: 97.5, max: 100.5,
          ticks: { callback: v => v + '%' }
        }
      }
    }
  });
}

/* ══════════════════════════════════════════════════
   10. BIODIVERSITY CHARTS
   ══════════════════════════════════════════════════ */

// Coral reef status
function initCoralChart() {
  const ctx = document.getElementById('coralChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Критически повреждены','Умеренно повреждены','Под угрозой','Относительно здоровы'],
      datasets: [{
        data: [40, 35, 15, 10],
        backgroundColor: [COLORS.critical, COLORS.danger, COLORS.warning, COLORS.safe],
        borderColor: '#0f1e2a',
        borderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 10, font: { size: 10 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` } }
      },
      cutout: '60%',
    }
  });
}

// Threats to biodiversity
function initThreatsChart() {
  const ctx = document.getElementById('threatsChart');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Потепление','Закисление','Загрязнение','Перелов','Разрушение\nсреды','Инвазивные\nвиды'],
      datasets: [{
        label: 'Индекс угрозы (0–100)',
        data: [88, 75, 82, 70, 65, 45],
        backgroundColor: [
          COLORS.critical, COLORS.danger, COLORS.critical,
          COLORS.danger, COLORS.warning, COLORS.moderate
        ],
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...axisStyle(), ticks: { font: { size: 9 } } },
        y: { ...axisStyle(), min: 0, max: 100, ticks: { callback: v => v } }
      }
    }
  });
}

// Fish stock index
function initFishStockChart() {
  const ctx = document.getElementById('fishStockChart');
  if (!ctx) return;
  const years = [1970,1975,1980,1985,1990,1995,2000,2005,2010,2015,2020,2024];
  const index = [100, 98, 94, 90, 85, 78, 72, 67, 62, 57, 53, 49];

  const grad = makeGradient(ctx.getContext('2d'), 'rgba(42,157,143,0.3)', 'rgba(42,157,143,0.02)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Индекс численности (%)',
        data: index,
        borderColor: COLORS.moderate,
        backgroundColor: grad,
        fill: true,
        borderWidth: 2.5,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: COLORS.moderate,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ...axisStyle() },
        y: { ...axisStyle(), min: 30, max: 110, ticks: { callback: v => v + '%' } }
      }
    }
  });
}

/* ══════════════════════════════════════════════════
   11. INTERACTIVE OCEAN MAP (Canvas 2D)
   ══════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   11. INTERACTIVE OCEAN MAP (Canvas 2D — Geographic)
   ══════════════════════════════════════════════════ */

const MAP_LAYERS = {
  plastic: {
    title: 'Мусорные пятна и концентрации пластика',
    points: [
      { x: 0.18, y: 0.38, r: 28, label: 'Большое тихоокеанское\nмусорное пятно', info: 'Площадь: ~1,6 млн км²\n1,8 трлн частиц пластика\nКрупнейшее в мире', severity: 'critical' },
      { x: 0.05, y: 0.38, r: 16, label: 'Западное тихоокеанское\nпятно', info: 'Площадь: ~600 тыс км²\nМикропластик доминирует', severity: 'danger' },
      { x: 0.52, y: 0.32, r: 14, label: 'Северо-Атлантическое\nпятно', info: '7000 мкп/м³\nGlossy plastics: 90%', severity: 'danger' },
      { x: 0.52, y: 0.6,  r: 10, label: 'Южно-Атлантическое\nпятно', info: 'Быстро растёт\nДанные обновляются', severity: 'warning' },
      { x: 0.68, y: 0.48, r: 12, label: 'Индийского океана\nпятно', info: 'Площадь: ~500 тыс км²', severity: 'warning' },
    ]
  },
  deadzones: {
    title: 'Мёртвые зоны — области гипоксии',
    points: [
      { x: 0.537, y: 0.245, r: 8, label: 'Балтийское море', info: 'Крупнейшая мёртвая зона\nЕвропы\nPO₂ < 2 мг/л', severity: 'critical' },
      { x: 0.38, y: 0.34,  r: 10, label: 'Мексиканский залив', info: '6705 миль² площадь\nЕжегодно расширяется', severity: 'critical' },
      { x: 0.84, y: 0.315, r: 7, label: 'Бохайский залив (Китай)', info: 'Быстрый рост из-за\nпромышленных стоков', severity: 'danger' },
      { x: 0.545, y: 0.275, r: 6, label: 'Северное море', info: 'Высокая нагрузка\nПитательные вещества', severity: 'danger' },
      { x: 0.565, y: 0.285, r: 6, label: 'Чёрное море', info: 'Хроническая гипоксия\nС 1970-х годов', severity: 'warning' },
      { x: 0.68, y: 0.34, r: 5, label: 'Аравийское море', info: 'Расширяется из-за\nпотепления', severity: 'warning' },
    ]
  },
  temp: {
    title: 'Аномалии температуры поверхности (2024)',
    points: [
      { x: 0.48, y: 0.46, r: 20, label: 'Тропическая Атлантика +2.3°C', info: 'Максимум 2024 года\nМассовое обесцвечивание', severity: 'critical' },
      { x: 0.54, y: 0.30, r: 14, label: 'Средиземноморье +2.1°C', info: 'Рекорд температуры 2024\nКритическое состояние', severity: 'critical' },
      { x: 0.30, y: 0.80, r: 16, label: 'Южный океан +2.0°C', info: 'Ледовый щит тает\nПоследствия для течений', severity: 'danger' },
      { x: 0.55, y: 0.09, r: 18, label: 'Арктика +3.5°C', info: 'Самый быстрый нагрев\nМорской лёд −12%/дес.', severity: 'critical' },
      { x: 0.73, y: 0.42, r: 12, label: 'Индийский океан +1.8°C', info: 'Кораллы под угрозой\nВыше нормы с 2000 г.', severity: 'danger' },
    ]
  },
  coral: {
    title: 'Состояние коралловых рифов',
    points: [
      { x: 0.855, y: 0.535, r: 16, label: 'Большой Барьерный риф', info: 'Критическое обесцвечивание\n2024: 6-й эпизод за 9 лет\n75% поражено', severity: 'critical' },
      { x: 0.80, y: 0.40, r: 12, label: 'Коралловый треугольник', info: 'Наибольшее биоразнообразие\n30% поверхности поражено', severity: 'danger' },
      { x: 0.43, y: 0.38, r: 10, label: 'Карибские рифы', info: '50% утрачено с 1970-х\nЧёрные морские ежи вымерли', severity: 'critical' },
      { x: 0.66, y: 0.385, r: 9, label: 'Мальдивы / Индийский', info: 'Повторяющееся обесцвечивание\nТуризм под угрозой', severity: 'danger' },
      { x: 0.18, y: 0.38, r: 8, label: 'Гавайи', info: 'Умеренное восстановление\nМПА показывают результат', severity: 'warning' },
      { x: 0.41, y: 0.355, r: 7, label: 'Флорида Кис', info: 'Мрачный прогноз к 2030\n90% кораллов под угрозой', severity: 'critical' },
    ]
  }
};

let currentMapLayer = 'plastic';
let hoveredPoint = null;

function severityColor(s) {
  return { critical: '#e63946', danger: '#f4a261', warning: '#e9c46a', moderate: '#2a9d8f' }[s] || '#2a9d8f';
}

// ══════════════════════════════════════════════════
// PRECISE WORLD MAP — Natural Earth 110m simplified
// Projection: Equirectangular
//   x = (longitude + 180) / 360
//   y = (90 − latitude)  / 180
// Points hand-traced from Natural Earth dataset
// ══════════════════════════════════════════════════
const CONTINENTS = {

  northAmerica: { color:'#1a3248', stroke:'rgba(42,157,143,0.65)', points:[
    // Alaska
    [0.055,0.178],[0.068,0.162],[0.078,0.155],[0.088,0.160],[0.098,0.152],
    [0.108,0.148],[0.115,0.155],[0.112,0.168],[0.102,0.172],[0.118,0.165],
    [0.128,0.158],[0.138,0.162],[0.142,0.175],[0.148,0.185],[0.152,0.195],
    // Canada west → east
    [0.148,0.208],[0.150,0.225],[0.152,0.245],[0.154,0.268],[0.155,0.288],
    [0.152,0.305],[0.148,0.320],[0.152,0.332],
    // Mexico / Central America south tip
    [0.158,0.345],[0.162,0.360],[0.165,0.375],[0.168,0.390],[0.168,0.402],
    [0.175,0.410],[0.182,0.418],[0.190,0.424],[0.198,0.428],[0.205,0.425],
    [0.212,0.420],[0.218,0.412],[0.225,0.408],
    // Gulf of Mexico coastline
    [0.232,0.410],[0.240,0.408],[0.248,0.405],[0.258,0.398],[0.268,0.390],
    [0.278,0.380],[0.288,0.370],[0.298,0.358],[0.308,0.345],[0.315,0.335],
    [0.325,0.325],[0.335,0.315],[0.342,0.305],[0.348,0.295],[0.355,0.285],
    // East coast USA
    [0.360,0.272],[0.362,0.258],[0.360,0.245],[0.358,0.232],[0.358,0.218],
    [0.355,0.205],[0.352,0.192],[0.355,0.178],[0.362,0.165],[0.370,0.158],
    [0.378,0.150],[0.385,0.142],[0.392,0.135],[0.398,0.128],
    // Maritime Canada / Labrador
    [0.395,0.118],[0.388,0.110],[0.380,0.104],[0.368,0.098],[0.355,0.093],
    [0.340,0.088],[0.325,0.085],[0.310,0.082],[0.295,0.078],[0.280,0.072],
    [0.265,0.065],[0.250,0.060],[0.235,0.056],[0.222,0.055],[0.208,0.058],
    [0.198,0.065],[0.192,0.075],[0.188,0.088],[0.185,0.102],[0.180,0.115],
    [0.172,0.128],[0.162,0.138],[0.150,0.145],[0.138,0.150],[0.125,0.152],
    [0.112,0.150],[0.100,0.148],[0.088,0.148],[0.075,0.148],[0.065,0.152],
    [0.055,0.158],[0.048,0.165],[0.050,0.175],
  ]},

  greenland: { color:'#162e42', stroke:'rgba(42,157,143,0.45)', points:[
    [0.340,0.042],[0.355,0.034],[0.372,0.028],[0.388,0.025],[0.404,0.026],
    [0.418,0.032],[0.428,0.042],[0.432,0.055],[0.428,0.068],[0.418,0.080],
    [0.405,0.089],[0.390,0.094],[0.374,0.095],[0.358,0.092],[0.345,0.085],
    [0.335,0.074],[0.332,0.062],[0.335,0.050],
  ]},

  iceland: { color:'#1a3248', stroke:'rgba(42,157,143,0.5)', points:[
    [0.456,0.076],[0.462,0.069],[0.470,0.065],[0.478,0.063],[0.485,0.066],
    [0.489,0.074],[0.487,0.082],[0.480,0.088],[0.472,0.090],[0.463,0.086],
  ]},

  southAmerica: { color:'#1a3248', stroke:'rgba(42,157,143,0.65)', points:[
    [0.260,0.418],[0.270,0.410],[0.280,0.404],[0.292,0.399],[0.305,0.396],
    [0.318,0.393],[0.328,0.390],[0.338,0.386],[0.345,0.394],[0.350,0.404],
    [0.354,0.416],[0.358,0.430],[0.360,0.445],[0.362,0.462],[0.362,0.480],
    [0.360,0.498],[0.356,0.516],[0.350,0.534],[0.343,0.552],[0.334,0.569],
    [0.323,0.585],[0.311,0.600],[0.300,0.612],[0.290,0.622],[0.281,0.628],
    [0.272,0.626],[0.265,0.618],[0.260,0.606],[0.257,0.592],[0.256,0.576],
    [0.256,0.559],[0.258,0.540],[0.260,0.522],[0.261,0.502],[0.261,0.482],
    [0.259,0.462],[0.256,0.443],[0.254,0.432],[0.252,0.422],
  ]},

  europe: { color:'#1a3248', stroke:'rgba(42,157,143,0.65)', points:[
    // Iberia
    [0.450,0.195],[0.456,0.185],[0.462,0.178],[0.470,0.172],[0.480,0.168],
    [0.490,0.165],[0.500,0.164],[0.508,0.167],[0.514,0.174],[0.516,0.184],
    [0.514,0.195],[0.509,0.205],[0.502,0.212],[0.494,0.216],[0.484,0.216],
    [0.474,0.212],[0.465,0.205],
    // France
    [0.468,0.198],[0.464,0.188],[0.468,0.178],[0.476,0.170],[0.485,0.162],
    [0.494,0.156],[0.504,0.150],[0.514,0.148],[0.524,0.148],[0.532,0.150],
    [0.540,0.155],[0.546,0.162],[0.549,0.170],[0.549,0.180],
    // UK (simplified)
    [0.482,0.150],[0.476,0.140],[0.473,0.130],[0.474,0.120],[0.477,0.110],
    [0.483,0.103],[0.489,0.100],[0.493,0.108],[0.493,0.118],[0.490,0.128],
    [0.487,0.138],[0.484,0.148],
    // Norway / Scandinavia
    [0.530,0.148],[0.526,0.138],[0.522,0.128],[0.518,0.118],[0.516,0.108],
    [0.516,0.098],[0.518,0.088],[0.522,0.080],[0.528,0.074],[0.535,0.070],
    [0.542,0.070],[0.549,0.074],[0.554,0.082],[0.556,0.092],[0.555,0.102],
    [0.552,0.112],[0.548,0.122],[0.545,0.132],[0.542,0.140],
    // Finland/Baltic
    [0.552,0.118],[0.558,0.108],[0.564,0.098],[0.570,0.088],[0.574,0.078],
    [0.576,0.068],[0.576,0.058],[0.572,0.050],[0.565,0.045],[0.556,0.044],
    [0.548,0.046],[0.542,0.052],
    // Balkans/Turkey approach
    [0.549,0.172],[0.550,0.182],[0.548,0.192],[0.544,0.200],
    [0.540,0.208],[0.535,0.215],[0.528,0.220],[0.520,0.222],[0.512,0.220],
    [0.504,0.215],[0.498,0.208],[0.493,0.200],[0.490,0.192],
  ]},

  africa: { color:'#1a3248', stroke:'rgba(42,157,143,0.65)', points:[
    [0.452,0.214],[0.460,0.206],[0.470,0.200],[0.480,0.196],[0.492,0.192],
    [0.504,0.190],[0.516,0.190],[0.527,0.192],[0.538,0.197],[0.546,0.204],
    [0.550,0.214],[0.552,0.226],[0.551,0.240],[0.549,0.256],[0.546,0.272],
    [0.543,0.290],[0.540,0.308],[0.539,0.328],[0.538,0.348],[0.537,0.368],
    [0.535,0.388],[0.532,0.408],[0.527,0.428],[0.520,0.446],[0.512,0.462],
    [0.502,0.478],[0.492,0.492],[0.482,0.504],[0.472,0.514],[0.464,0.520],
    [0.458,0.524],[0.453,0.522],[0.448,0.514],[0.445,0.502],[0.443,0.488],
    [0.442,0.472],[0.443,0.455],[0.444,0.438],[0.446,0.420],[0.447,0.402],
    [0.448,0.384],[0.448,0.366],[0.448,0.348],[0.448,0.330],[0.448,0.312],
    [0.449,0.293],[0.450,0.274],[0.451,0.255],[0.451,0.236],[0.452,0.222],
    // Madagascar
  ]},

  madagascar: { color:'#1a3248', stroke:'rgba(42,157,143,0.45)', points:[
    [0.558,0.438],[0.562,0.428],[0.566,0.420],[0.570,0.416],[0.574,0.420],
    [0.576,0.432],[0.574,0.445],[0.569,0.457],[0.562,0.464],[0.556,0.460],
    [0.555,0.448],
  ]},

  // Eurasia merged as Asia (big blob)
  asia: { color:'#1a3248', stroke:'rgba(42,157,143,0.65)', points:[
    // Turkey / Anatolia west
    [0.550,0.224],[0.558,0.218],[0.568,0.212],[0.578,0.208],[0.590,0.204],
    [0.602,0.202],[0.614,0.202],[0.624,0.205],[0.632,0.212],[0.636,0.222],
    // Middle East / Arabian pen. entry
    [0.638,0.235],[0.640,0.250],[0.644,0.265],[0.650,0.278],[0.656,0.290],
    [0.662,0.300],[0.668,0.308],[0.674,0.315],[0.680,0.318],[0.686,0.314],
    [0.690,0.306],[0.692,0.295],[0.692,0.282],[0.688,0.268],[0.683,0.255],
    [0.677,0.242],[0.671,0.230],[0.665,0.218],[0.660,0.208],[0.656,0.198],
    [0.652,0.190],[0.650,0.182],
    // Iran / Persia
    [0.652,0.174],[0.660,0.166],[0.670,0.158],[0.682,0.152],[0.694,0.146],
    [0.706,0.142],[0.720,0.138],[0.734,0.136],[0.748,0.136],[0.762,0.138],
    // Central Asia / Siberia
    [0.774,0.142],[0.786,0.148],[0.796,0.155],[0.804,0.162],[0.810,0.170],
    [0.814,0.165],[0.820,0.155],[0.826,0.142],[0.830,0.128],[0.832,0.114],
    [0.830,0.100],[0.826,0.086],[0.818,0.074],[0.808,0.064],[0.796,0.056],
    [0.780,0.050],[0.764,0.045],[0.746,0.042],[0.728,0.041],[0.710,0.043],
    [0.692,0.045],[0.674,0.048],[0.656,0.052],[0.638,0.056],[0.620,0.060],
    [0.603,0.064],[0.587,0.068],[0.573,0.074],[0.561,0.082],[0.552,0.092],
    [0.548,0.104],[0.547,0.118],[0.547,0.132],[0.548,0.146],[0.548,0.160],
    [0.549,0.172],[0.550,0.184],[0.549,0.196],[0.548,0.208],[0.548,0.220],
    // East Asian coastline
    [0.820,0.158],[0.824,0.170],[0.826,0.184],[0.824,0.198],[0.820,0.212],
    [0.814,0.225],[0.806,0.236],[0.795,0.246],[0.783,0.254],[0.770,0.260],
    [0.758,0.264],[0.746,0.265],[0.734,0.264],[0.722,0.260],[0.710,0.254],
    [0.700,0.246],[0.691,0.237],[0.684,0.226],[0.678,0.214],[0.672,0.202],
    // Indochina / SE Asia coast
    [0.762,0.270],[0.770,0.282],[0.776,0.295],[0.780,0.308],[0.781,0.322],
    [0.778,0.336],[0.773,0.348],[0.765,0.358],[0.756,0.365],[0.746,0.368],
    [0.736,0.368],[0.726,0.364],[0.718,0.356],[0.712,0.345],[0.709,0.332],
    [0.709,0.318],[0.712,0.305],[0.718,0.293],[0.726,0.281],[0.736,0.272],
    [0.746,0.266],
  ]},

  india: { color:'#1a3248', stroke:'rgba(42,157,143,0.6)', points:[
    [0.638,0.208],[0.645,0.218],[0.652,0.230],[0.658,0.244],[0.662,0.258],
    [0.664,0.274],[0.663,0.290],[0.658,0.306],[0.650,0.320],[0.640,0.332],
    [0.630,0.340],[0.620,0.344],[0.612,0.340],[0.606,0.330],[0.602,0.316],
    [0.600,0.301],[0.601,0.286],[0.604,0.271],[0.608,0.256],[0.613,0.243],
    [0.618,0.231],[0.624,0.220],[0.630,0.212],
  ]},

  sriLanka: { color:'#1a3248', stroke:'rgba(42,157,143,0.4)', points:[
    [0.628,0.349],[0.631,0.344],[0.635,0.342],[0.638,0.345],[0.639,0.351],
    [0.636,0.356],[0.631,0.357],[0.628,0.353],
  ]},

  australia: { color:'#1a3248', stroke:'rgba(42,157,143,0.65)', points:[
    [0.770,0.500],[0.782,0.490],[0.796,0.482],[0.812,0.476],[0.828,0.474],
    [0.844,0.474],[0.858,0.478],[0.870,0.486],[0.880,0.498],[0.886,0.512],
    [0.888,0.528],[0.886,0.544],[0.880,0.560],[0.871,0.574],[0.859,0.584],
    [0.845,0.591],[0.830,0.594],[0.815,0.591],[0.801,0.584],[0.789,0.572],
    [0.780,0.558],[0.773,0.542],[0.768,0.526],[0.766,0.510],
  ]},

  newZealandN: { color:'#1a3248', stroke:'rgba(42,157,143,0.45)', points:[
    [0.905,0.541],[0.910,0.534],[0.916,0.530],[0.921,0.532],[0.924,0.540],
    [0.922,0.550],[0.916,0.556],[0.910,0.554],[0.906,0.547],
  ]},

  newZealandS: { color:'#1a3248', stroke:'rgba(42,157,143,0.45)', points:[
    [0.903,0.558],[0.908,0.552],[0.914,0.549],[0.920,0.551],[0.924,0.558],
    [0.924,0.568],[0.919,0.576],[0.912,0.580],[0.905,0.577],[0.902,0.568],
  ]},

  japan: { color:'#1a3248', stroke:'rgba(42,157,143,0.45)', points:[
    [0.838,0.165],[0.843,0.158],[0.849,0.152],[0.856,0.150],[0.861,0.155],
    [0.862,0.164],[0.858,0.172],[0.852,0.177],[0.844,0.175],[0.839,0.170],
  ]},

  borneo: { color:'#1a3248', stroke:'rgba(42,157,143,0.45)', points:[
    [0.790,0.330],[0.798,0.322],[0.806,0.318],[0.815,0.318],[0.822,0.324],
    [0.826,0.333],[0.824,0.344],[0.818,0.354],[0.809,0.360],[0.800,0.360],
    [0.792,0.354],[0.788,0.344],[0.788,0.336],
  ]},

  sumatra: { color:'#1a3248', stroke:'rgba(42,157,143,0.45)', points:[
    [0.710,0.338],[0.718,0.332],[0.728,0.328],[0.738,0.330],[0.745,0.338],
    [0.748,0.348],[0.745,0.358],[0.738,0.364],[0.728,0.366],[0.720,0.362],
    [0.713,0.354],[0.710,0.346],
  ]},

  antarcticaShape: { color:'#162e42', stroke:'rgba(42,157,143,0.35)', points:[
    [0.000,0.860],[0.050,0.854],[0.100,0.850],[0.150,0.847],[0.200,0.845],
    [0.250,0.846],[0.300,0.848],[0.350,0.848],[0.400,0.846],[0.450,0.843],
    [0.500,0.842],[0.550,0.843],[0.600,0.846],[0.650,0.848],[0.700,0.847],
    [0.750,0.845],[0.800,0.845],[0.850,0.847],[0.900,0.850],[0.950,0.854],
    [1.000,0.858],[1.000,1.000],[0.000,1.000],
  ]},
};


// ── OCEAN LABELS ───────────────────────────────────────────────────
const OCEAN_LABELS = [
  { x: 0.13,  y: 0.38, name: 'ТИХИЙ ОКЕАН',     sub: '(Северный)',  size: 13, alpha: 0.55 },
  { x: 0.13,  y: 0.62, name: 'ТИХИЙ ОКЕАН',     sub: '(Южный)',     size: 13, alpha: 0.55 },
  { x: 0.48,  y: 0.50, name: 'АТЛАНТИЧЕСКИЙ',   sub: 'ОКЕАН',       size: 12, alpha: 0.55 },
  { x: 0.70,  y: 0.50, name: 'ИНДИЙСКИЙ',        sub: 'ОКЕАН',       size: 12, alpha: 0.55 },
  { x: 0.50,  y: 0.09, name: 'СЕВЕРНЫЙ ЛЕДОВИТЫЙ', sub: 'ОКЕАН',    size: 10, alpha: 0.5  },
  { x: 0.50,  y: 0.80, name: 'ЮЖНЫЙ ОКЕАН',      sub: '',            size: 11, alpha: 0.5  },
];

function drawContinent(ctx, pts, W, H, fillColor, strokeColor, closed = true) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * W, pts[0][1] * H);
  // Catmull-Rom-like smooth curve
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i][0] + pts[i + 1][0]) / 2 * W;
    const yc = (pts[i][1] + pts[i + 1][1]) / 2 * H;
    ctx.quadraticCurveTo(pts[i][0] * W, pts[i][1] * H, xc, yc);
  }
  ctx.lineTo(pts[pts.length - 1][0] * W, pts[pts.length - 1][1] * H);
  if (closed) ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function drawOceanLabels(ctx, W, H) {
  OCEAN_LABELS.forEach(ol => {
    const x = ol.x * W, y = ol.y * H;
    ctx.save();
    ctx.globalAlpha = ol.alpha;
    ctx.font = `600 ${Math.round(ol.size * W / 900)}px IBM Plex Mono, monospace`;
    ctx.fillStyle = '#2a9d8f';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '0.12em';
    ctx.fillText(ol.name, x, y);
    if (ol.sub) {
      ctx.font = `400 ${Math.round((ol.size - 2) * W / 900)}px IBM Plex Mono, monospace`;
      ctx.fillText(ol.sub, x, y + Math.round(16 * W / 900));
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  });
}

function drawOceanGrid(ctx, W, H) {
  // Latitude lines
  ctx.strokeStyle = 'rgba(42,157,143,0.06)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) {
    const y = H * i / 8;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // Longitude lines
  for (let i = 1; i < 12; i++) {
    const x = W * i / 12;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  // Equator line
  ctx.strokeStyle = 'rgba(42,157,143,0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(0, H * 0.44); ctx.lineTo(W, H * 0.44); ctx.stroke();
  ctx.setLineDash([]);
  // Equator label
  ctx.font = `500 ${Math.round(9 * W / 900)}px IBM Plex Mono, monospace`;
  ctx.fillStyle = 'rgba(42,157,143,0.35)';
  ctx.textAlign = 'left';
  ctx.fillText('ЭКВАТОР', 6, H * 0.44 - 3);
}

function drawOceanMap(canvas, layer) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Ocean background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   '#091520');
  bg.addColorStop(0.5, '#0c1d2b');
  bg.addColorStop(1,   '#0a1820');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle vignette
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, H*0.9);
  vig.addColorStop(0, 'transparent');
  vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // Grid
  drawOceanGrid(ctx, W, H);

  // Draw all continents
  Object.values(CONTINENTS).forEach(c => {
    drawContinent(ctx, c.points, W, H, c.color, c.stroke);
  });

  // Ocean name labels
  drawOceanLabels(ctx, W, H);

  // Draw data points for current layer
  const layerData = MAP_LAYERS[layer];
  layerData.points.forEach((pt, i) => {
    const px = pt.x * W;
    const py = pt.y * H;
    const col = severityColor(pt.severity);
    const isHovered = hoveredPoint === i;
    const r = isHovered ? pt.r * 1.35 : pt.r;
    const rPx = r * W / 900;

    // Outer glow
    const grd = ctx.createRadialGradient(px, py, 0, px, py, rPx * 3);
    grd.addColorStop(0, col + '55');
    grd.addColorStop(1, 'transparent');
    ctx.beginPath();
    ctx.arc(px, py, rPx * 3, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    // Circle fill
    ctx.beginPath();
    ctx.arc(px, py, rPx, 0, Math.PI * 2);
    ctx.fillStyle = col + '40';
    ctx.fill();

    // Circle stroke
    ctx.strokeStyle = col;
    ctx.lineWidth = isHovered ? 2.2 : 1.5;
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2.5, rPx * 0.18), 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });

  // Layer title
  ctx.fillStyle = 'rgba(42,157,143,0.7)';
  ctx.font = `600 ${Math.round(11 * W / 900)}px IBM Plex Mono, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('● ' + layerData.title, 14, H - 12);
}

function initOceanMap() {
  const canvas = document.getElementById('oceanMapCanvas');
  if (!canvas) return;

  function resize() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = Math.round(container.clientWidth * 0.52);
    canvas.style.height = canvas.height + 'px';
    drawOceanMap(canvas, currentMapLayer);
  }

  resize();
  window.addEventListener('resize', resize);

  // Map layer buttons
  document.querySelectorAll('.map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMapLayer = btn.dataset.layer;
      hoveredPoint = null;
      drawOceanMap(canvas, currentMapLayer);
    });
  });

  // Hover interaction
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const W = canvas.width, H = canvas.height;
    const points = MAP_LAYERS[currentMapLayer].points;
    const tooltip = document.getElementById('mapTooltip');

    let found = null;
    points.forEach((pt, i) => {
      const px = pt.x * W, py = pt.y * H;
      const r = pt.r * W / 900;
      if (Math.hypot(mx - px, my - py) < r * 2) found = i;
    });

    if (found !== hoveredPoint) {
      hoveredPoint = found;
      canvas.style.cursor = found !== null ? 'pointer' : 'default';
      drawOceanMap(canvas, currentMapLayer);
    }

    if (found !== null) {
      const pt = points[found];
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - rect.left + 18) + 'px';
      tooltip.style.top  = (e.clientY - rect.top  - 10) + 'px';
      tooltip.innerHTML = `
        <strong style="color:${severityColor(pt.severity)}">${pt.label.replace('\n','<br>')}</strong>
        <div style="margin-top:6px;font-size:.75rem;line-height:1.55;">${pt.info.replace(/\n/g,'<br>')}</div>
      `;
    } else {
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    hoveredPoint = null;
    document.getElementById('mapTooltip').style.display = 'none';
    drawOceanMap(canvas, currentMapLayer);
  });
}

/* ══════════════════════════════════════════════════
   12. SIMULATE LIVE DATA UPDATES
   ══════════════════════════════════════════════════ */
function initLiveUpdates() {
  setInterval(() => {
    const dot = document.querySelector('.pulse-dot');
    if (dot) {
      dot.style.background = '#e9c46a';
      setTimeout(() => { dot.style.background = '#4caf7d'; }, 300);
    }
  }, 10000);
}

/* ══════════════════════════════════════════════════
   13. ADMIN SYSTEM
   ══════════════════════════════════════════════════ */

// ── Editable data store ──────────────────────────
const ADMIN_CREDS = { login: 'admin', pass: 'ocean2024' };

let adminData = {
  kpi: [
    { icon: 'fa-thermometer-three-quarters', label: 'Аномалия температуры поверхности', value: '0.97', suffix: '°C', trend: 'Рекорд 2024', severity: 'critical' },
    { icon: 'fa-flask',                      label: 'Рост кислотности с 1750 года',     value: '30',   suffix: '%',   trend: 'pH: 8.19→8.05', severity: 'danger'   },
    { icon: 'fa-recycle',                    label: 'Пластиковых частиц в океане',       value: '170',  suffix: 'трлн',trend: '+14 млн т/год', severity: 'warning'  },
    { icon: 'fa-skull-crossbones',           label: 'Мёртвых зон в Мировом океане',     value: '500',  suffix: '',    trend: 'Растёт с 1960-х', severity: 'moderate'},
    { icon: 'fa-water',                      label: 'Избыточного тепла поглощает океан',value: '90',   suffix: '%',   trend: 'Рекорд за 65 лет', severity: 'danger' },
    { icon: 'fa-fish',                       label: 'Коралловых рифов поражено',         value: '75',   suffix: '%',   trend: 'Масс. обесцвечивание', severity: 'critical' },
  ],
  ticker: [
    '🌡️ Температура поверхности океана: +0.97°C к норме XX века',
    '🧪 pH океана: 8.05 (снижение на 30% с доиндустриальной эпохи)',
    '♻️ Пластик в океанах: 170+ трлн частиц',
    '💀 Мёртвые зоны: ~500 по всему миру',
    '🐠 Обесцвечивание кораллов: 75% мировых рифов поражено',
    '⬇️ Кислород в океане: -2% с 1960-х годов',
    '📈 Пластик попадает в океан: 8–14 млн тонн ежегодно',
    '🌊 Уровень моря: +9 см за 30 лет, темп удвоился',
  ],
  alerts: [
    { label: 'Температура — Критично',     severity: 'critical' },
    { label: 'Пластик — Опасно',           severity: 'danger'   },
    { label: 'Закисление — Опасно',        severity: 'danger'   },
    { label: 'Биоразнообразие — Угроза',   severity: 'warning'  },
    { label: 'Кислород — Снижение',        severity: 'warning'  },
  ],
};

// ── Load from localStorage if exists ────────────
function loadAdminData() {
  try {
    const saved = localStorage.getItem('oceanwatch_admin');
    if (saved) adminData = JSON.parse(saved);
    // Also restore MAP_LAYERS points if saved
    const savedMap = localStorage.getItem('oceanwatch_map');
    if (savedMap) {
      const mp = JSON.parse(savedMap);
      Object.keys(mp).forEach(k => { if (MAP_LAYERS[k]) MAP_LAYERS[k].points = mp[k]; });
    }
  } catch(e) {}
}

function saveAdminData() {
  localStorage.setItem('oceanwatch_admin', JSON.stringify(adminData));
  // Save map points separately
  const mp = {};
  Object.keys(MAP_LAYERS).forEach(k => { mp[k] = MAP_LAYERS[k].points; });
  localStorage.setItem('oceanwatch_map', JSON.stringify(mp));
  showToast();
}

// ── Toast ────────────────────────────────────────
function showToast() {
  const t = document.getElementById('saveToast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Apply admin data to the live page ───────────
function applyAdminData() {
  // KPI strip
  const strip = document.getElementById('admKpiGrid');
  const kpiItems = document.querySelectorAll('.kpi-strip-item');
  adminData.kpi.forEach((k, i) => {
    if (kpiItems[i]) {
      const valEl = kpiItems[i].querySelector('.ksi-val');
      const lblEl = kpiItems[i].querySelector('.ksi-lbl');
      const subEl = kpiItems[i].querySelector('.ksi-sub');
      if (valEl) valEl.textContent = k.value + k.suffix;
      if (lblEl) lblEl.textContent = k.label;
      if (subEl) subEl.innerHTML = `<i class="fas fa-arrow-up"></i> ${k.trend}`;
    }
  });

  // Ticker
  const tickerEl = document.getElementById('tickerItems');
  if (tickerEl) {
    const doubled = [...adminData.ticker, ...adminData.ticker];
    tickerEl.innerHTML = doubled.map(t => `<span>${t}</span>`).join('');
  }

  // Alert status dots
  const rows = document.querySelectorAll('.oac-row');
  adminData.alerts.forEach((a, i) => {
    if (rows[i]) {
      rows[i].querySelector('span:last-child').textContent = a.label;
      rows[i].querySelector('.oac-dot').className = `oac-dot ${a.severity}`;
    }
  });
}

// ── Render admin KPI tab ─────────────────────────
function renderAdmKpi() {
  const grid = document.getElementById('admKpiGrid');
  if (!grid) return;
  grid.innerHTML = adminData.kpi.map((k, i) => `
    <div class="adm-kpi-card">
      <div class="adm-kpi-card-header">
        <i class="fas ${k.icon}"></i>
        <span>KPI #${i+1}</span>
        <select class="adm-select" data-kpi-sev="${i}" style="margin-left:auto">
          ${['critical','danger','warning','moderate'].map(s =>
            `<option value="${s}" ${k.severity===s?'selected':''}>${s}</option>`
          ).join('')}
        </select>
      </div>
      <div class="adm-row">
        <label>Значение</label>
        <input class="adm-input" data-kpi-val="${i}" value="${k.value}" placeholder="Число"/>
        <input class="adm-input" data-kpi-suf="${i}" value="${k.suffix}" placeholder="ед." style="max-width:64px"/>
      </div>
      <div class="adm-row">
        <label>Подпись</label>
        <input class="adm-input" data-kpi-lbl="${i}" value="${k.label}"/>
      </div>
      <div class="adm-row">
        <label>Тренд</label>
        <input class="adm-input" data-kpi-trend="${i}" value="${k.trend}"/>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-kpi-val]').forEach(el => el.addEventListener('input', e => { adminData.kpi[+e.target.dataset.kpiVal].value = e.target.value; applyAdminData(); }));
  grid.querySelectorAll('[data-kpi-suf]').forEach(el => el.addEventListener('input', e => { adminData.kpi[+e.target.dataset.kpiSuf].suffix = e.target.value; applyAdminData(); }));
  grid.querySelectorAll('[data-kpi-lbl]').forEach(el => el.addEventListener('input', e => { adminData.kpi[+e.target.dataset.kpiLbl].label = e.target.value; applyAdminData(); }));
  grid.querySelectorAll('[data-kpi-trend]').forEach(el => el.addEventListener('input', e => { adminData.kpi[+e.target.dataset.kpiTrend].trend = e.target.value; applyAdminData(); }));
  grid.querySelectorAll('[data-kpi-sev]').forEach(el => el.addEventListener('change', e => { adminData.kpi[+e.target.dataset.kpiSev].severity = e.target.value; applyAdminData(); }));
}

// ── Render admin Ticker tab ──────────────────────
function renderAdmTicker() {
  const list = document.getElementById('admTickerList');
  if (!list) return;
  list.innerHTML = adminData.ticker.map((t, i) => `
    <div class="adm-ticker-item">
      <input value="${t.replace(/"/g,'&quot;')}" data-tick="${i}"/>
      <button class="adm-del-btn" data-del-tick="${i}"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
  list.querySelectorAll('[data-tick]').forEach(el => el.addEventListener('input', e => { adminData.ticker[+e.target.dataset.tick] = e.target.value; applyAdminData(); }));
  list.querySelectorAll('[data-del-tick]').forEach(el => el.addEventListener('click', e => {
    adminData.ticker.splice(+e.currentTarget.dataset.delTick, 1);
    renderAdmTicker(); applyAdminData();
  }));
}

// ── Render admin Map tab ─────────────────────────
function renderAdmMap() {
  const layerKey = document.getElementById('admMapLayer')?.value || 'plastic';
  const container = document.getElementById('admMapPoints');
  if (!container) return;
  const pts = MAP_LAYERS[layerKey].points;
  container.innerHTML = pts.map((pt, i) => `
    <div class="adm-map-point">
      <div class="adm-map-point-header">
        <span class="adm-point-num">Точка ${i+1}</span>
        <select class="adm-select" data-mp-sev="${i}">
          ${['critical','danger','warning','moderate'].map(s =>
            `<option value="${s}" ${pt.severity===s?'selected':''}>${s}</option>`
          ).join('')}
        </select>
        <button class="adm-del-btn" data-del-mp="${i}" style="margin-left:auto"><i class="fas fa-trash"></i></button>
      </div>
      <div class="adm-map-fields">
        <div class="adm-field"><label>Название</label><input class="adm-input" data-mp-lbl="${i}" value="${pt.label.replace(/\n/g,' ')}"/></div>
        <div class="adm-field"><label>Инфо</label><input class="adm-input" data-mp-info="${i}" value="${pt.info.replace(/\n/g,' | ')}"/></div>
        <div class="adm-field"><label>X (0–1)</label><input class="adm-input" type="number" step="0.01" min="0" max="1" data-mp-x="${i}" value="${pt.x}"/></div>
        <div class="adm-field"><label>Y (0–1)</label><input class="adm-input" type="number" step="0.01" min="0" max="1" data-mp-y="${i}" value="${pt.y}"/></div>
        <div class="adm-field"><label>Размер (r)</label><input class="adm-input" type="number" min="4" max="40" data-mp-r="${i}" value="${pt.r}"/></div>
      </div>
    </div>
  `).join('');

  const update = () => { if(document.getElementById('map')?.classList.contains('active')) { const c = document.getElementById('oceanMapCanvas'); if(c) drawOceanMap(c, currentMapLayer); }};
  container.querySelectorAll('[data-mp-lbl]').forEach(el => el.addEventListener('input', e => { pts[+e.target.dataset.mpLbl].label = e.target.value; update(); }));
  container.querySelectorAll('[data-mp-info]').forEach(el => el.addEventListener('input', e => { pts[+e.target.dataset.mpInfo].info = e.target.value.replace(/ \| /g,'\n'); update(); }));
  container.querySelectorAll('[data-mp-x]').forEach(el => el.addEventListener('input', e => { pts[+e.target.dataset.mpX].x = parseFloat(e.target.value)||0; update(); }));
  container.querySelectorAll('[data-mp-y]').forEach(el => el.addEventListener('input', e => { pts[+e.target.dataset.mpY].y = parseFloat(e.target.value)||0; update(); }));
  container.querySelectorAll('[data-mp-r]').forEach(el => el.addEventListener('input', e => { pts[+e.target.dataset.mpR].r = parseFloat(e.target.value)||10; update(); }));
  container.querySelectorAll('[data-mp-sev]').forEach(el => el.addEventListener('change', e => { pts[+e.target.dataset.mpSev].severity = e.target.value; update(); }));
  container.querySelectorAll('[data-del-mp]').forEach(el => el.addEventListener('click', e => {
    pts.splice(+e.currentTarget.dataset.delMp, 1);
    renderAdmMap(); update();
  }));
}

// ── Render admin Alerts tab ──────────────────────
function renderAdmAlerts() {
  const list = document.getElementById('admAlertsList');
  if (!list) return;
  list.innerHTML = adminData.alerts.map((a, i) => `
    <div class="adm-alert-item">
      <span class="adm-alert-dot" style="background:${severityColor(a.severity)}"></span>
      <input class="adm-input adm-alert-label" data-al-lbl="${i}" value="${a.label}"/>
      <select class="adm-select" data-al-sev="${i}">
        ${['critical','danger','warning','moderate'].map(s =>
          `<option value="${s}" ${a.severity===s?'selected':''}>${s}</option>`
        ).join('')}
      </select>
    </div>
  `).join('');
  list.querySelectorAll('[data-al-lbl]').forEach(el => el.addEventListener('input', e => { adminData.alerts[+e.target.dataset.alLbl].label = e.target.value; applyAdminData(); }));
  list.querySelectorAll('[data-al-sev]').forEach(el => el.addEventListener('change', e => { adminData.alerts[+e.target.dataset.alSev].severity = e.target.value; renderAdmAlerts(); applyAdminData(); }));
}

// ── Init admin system ────────────────────────────
function initAdmin() {
  loadAdminData();
  applyAdminData();

  const adminBtn   = document.getElementById('adminBtn');
  const loginModal = document.getElementById('adminLoginModal');
  const loginClose = document.getElementById('loginClose');
  const loginSubmit= document.getElementById('loginSubmit');
  const loginError = document.getElementById('loginError');
  const adminPanel = document.getElementById('adminPanel');
  const logoutBtn  = document.getElementById('logoutBtn');
  const saveAllBtn = document.getElementById('saveAllBtn');
  const togglePass = document.getElementById('togglePass');
  const admMapLayer= document.getElementById('admMapLayer');

  // Open/close login modal
  adminBtn.addEventListener('click', () => {
    if (adminPanel.classList.contains('open')) {
      adminPanel.classList.remove('open');
      document.body.classList.remove('admin-open');
      adminBtn.innerHTML = '<i class="fas fa-lock"></i> Войти';
      adminBtn.classList.remove('active-admin');
    } else {
      loginModal.classList.add('open');
    }
  });

  loginClose.addEventListener('click', () => loginModal.classList.remove('open'));
  loginModal.addEventListener('click', e => { if(e.target===loginModal) loginModal.classList.remove('open'); });

  // Password toggle
  togglePass.addEventListener('click', () => {
    const inp = document.getElementById('adminPass');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    togglePass.innerHTML = inp.type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
  });

  // Login submit
  loginSubmit.addEventListener('click', () => {
    const l = document.getElementById('adminLogin').value.trim();
    const p = document.getElementById('adminPass').value;
    if (l === ADMIN_CREDS.login && p === ADMIN_CREDS.pass) {
      loginModal.classList.remove('open');
      loginError.textContent = '';
      document.getElementById('adminLogin').value = '';
      document.getElementById('adminPass').value = '';
      adminPanel.classList.add('open');
      document.body.classList.add('admin-open');
      adminBtn.innerHTML = '<i class="fas fa-lock-open"></i> Режим Admin';
      adminBtn.classList.add('active-admin');
      renderAdmKpi();
      renderAdmTicker();
      renderAdmMap();
      renderAdmAlerts();
    } else {
      loginError.textContent = 'Неверный логин или пароль';
      document.getElementById('adminPass').value = '';
    }
  });

  // Enter key in password field
  document.getElementById('adminPass').addEventListener('keydown', e => { if(e.key==='Enter') loginSubmit.click(); });

  // Logout
  logoutBtn.addEventListener('click', () => {
    adminPanel.classList.remove('open');
    document.body.classList.remove('admin-open');
    adminBtn.innerHTML = '<i class="fas fa-lock"></i> Войти';
    adminBtn.classList.remove('active-admin');
  });

  // Save all
  saveAllBtn.addEventListener('click', saveAdminData);

  // Tab switching
  document.querySelectorAll('.adm-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.adm-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.adm-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('adm-' + tab.dataset.adm)?.classList.add('active');
    });
  });

  // Map layer change
  admMapLayer?.addEventListener('change', () => {
    currentMapLayer = admMapLayer.value;
    renderAdmMap();
    const c = document.getElementById('oceanMapCanvas');
    if (c) drawOceanMap(c, currentMapLayer);
  });

  // Add ticker item
  document.getElementById('addTickerItem')?.addEventListener('click', () => {
    adminData.ticker.push('🌊 Новая строка данных...');
    renderAdmTicker();
  });

  // Add map point
  document.getElementById('addMapPoint')?.addEventListener('click', () => {
    const layerKey = document.getElementById('admMapLayer')?.value || 'plastic';
    MAP_LAYERS[layerKey].points.push({ x: 0.5, y: 0.5, r: 12, label: 'Новая точка', info: 'Описание...', severity: 'warning' });
    renderAdmMap();
    const c = document.getElementById('oceanMapCanvas');
    if (c) drawOceanMap(c, currentMapLayer);
  });
}


/* ══════════════════════════════════════════════════
   13. INIT ALL
   ══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Core UI
  initNavigation();
  initTicker();
  initRefresh();
  updateLastUpdateTime();

  // Counters after a brief delay
  setTimeout(animateCounters, 300);

  // Overview charts
  initPlasticTrendChart();
  initPlasticSourceChart();

  // Pollution charts
  initPlasticInflowChart();
  initDeadZonesChart();
  initRegionalPollutionChart();

  // Temperature charts
  initSSTAnomalyChart();
  initOceanHeatChart();
  initRegionalTempChart();
  initSeaLevelChart();

  // Acidification charts
  initPhCo2Chart();
  initAcidImpactChart();
  initCo2Chart();
  initOxygenChart();

  // Biodiversity charts
  initCoralChart();
  initThreatsChart();
  initFishStockChart();

  // Interactive map (lazy — runs when section becomes visible)
  // Poll for map section visibility
  const mapObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      initOceanMap();
      mapObserver.disconnect();
    }
  }, { threshold: 0.1 });

  const mapSection = document.getElementById('map');
  if (mapSection) mapObserver.observe(mapSection);

  // Also init map when nav clicked
  document.querySelector('[data-section="map"]')?.addEventListener('click', () => {
    setTimeout(initOceanMap, 50);
  });

  // Live updates
  initLiveUpdates();

  // Admin system
  initAdmin();

  // ── Fetch real live data from APIs ──────────────
  fetchAllLiveData();

  console.log('%cOCEANWATCH v2.0 — Система мониторинга запущена с реальными данными', 'color:#2a9d8f;font-family:monospace;font-size:14px;font-weight:bold');
});

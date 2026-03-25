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
      `&current=pm2_5,nitrogen_dioxide,ozone,uv_index&timezone=UTC`;
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

/* ══════════════════════════════════════════════════
   11. LEAFLET MAP — CartoDB Dark Matter
   Real world tiles, precise geography
   ══════════════════════════════════════════════════ */

const MAP_LAYERS = {
  plastic: {
    title: 'Мусорные пятна и концентрации пластика',
    points: [
      { lat:  30.0, lng: -140.0, r: 38, label: 'Большое тихоокеанское мусорное пятно',  info: 'Площадь: ~1,6 млн км²\n1,8 трлн частиц пластика\nКрупнейшее в мире', severity: 'critical' },
      { lat:  38.0, lng:  160.0, r: 22, label: 'Западное тихоокеанское пятно',           info: 'Площадь: ~600 тыс км²\nМикропластик доминирует', severity: 'danger' },
      { lat:  30.0, lng:  -40.0, r: 20, label: 'Северо-Атлантическое пятно',             info: '7000 мкп/м³\n90% — глянцевый пластик', severity: 'danger' },
      { lat: -30.0, lng:  -30.0, r: 14, label: 'Южно-Атлантическое пятно',               info: 'Быстро растёт\nДанные уточняются', severity: 'warning' },
      { lat: -30.0, lng:   80.0, r: 16, label: 'Индийского океана мусорное пятно',       info: 'Площадь: ~500 тыс км²', severity: 'warning' },
    ]
  },
  deadzones: {
    title: 'Мёртвые зоны — области гипоксии',
    points: [
      { lat:  57.0, lng:  19.0, r: 14, label: 'Балтийское море',        info: 'Крупнейшая мёртвая зона Европы\nPO₂ < 2 мг/л', severity: 'critical' },
      { lat:  29.0, lng: -90.0, r: 18, label: 'Мексиканский залив',     info: '6705 миль² площадь\nЕжегодно расширяется', severity: 'critical' },
      { lat:  38.5, lng: 120.5, r: 12, label: 'Бохайский залив (Китай)',info: 'Промышленные стоки\nБыстро растёт', severity: 'danger' },
      { lat:  55.0, lng:   4.0, r: 10, label: 'Северное море',          info: 'Высокая нутриентная нагрузка', severity: 'danger' },
      { lat:  43.0, lng:  34.0, r: 10, label: 'Чёрное море',            info: 'Хроническая гипоксия с 1970-х', severity: 'warning' },
      { lat:  18.0, lng:  58.0, r:  9, label: 'Аравийское море',        info: 'Расширяется из-за потепления', severity: 'warning' },
    ]
  },
  temp: {
    title: 'Аномалии температуры поверхности (2024)',
    points: [
      { lat:  10.0, lng:  -30.0, r: 28, label: 'Тропическая Атлантика +2.3°C', info: 'Рекорд 2024\nМассовое обесцвечивание', severity: 'critical' },
      { lat:  38.0, lng:   18.0, r: 22, label: 'Средиземноморье +2.1°C',       info: 'Рекорд температуры 2024', severity: 'critical' },
      { lat: -55.0, lng:    0.0, r: 24, label: 'Южный океан +2.0°C',           info: 'Ледяной щит тает\nВлияние на течения', severity: 'danger' },
      { lat:  82.0, lng:    0.0, r: 26, label: 'Арктика +3.5°C',               info: 'Морской лёд −12%/дес.\nНаибольший нагрев', severity: 'critical' },
      { lat: -20.0, lng:   70.0, r: 18, label: 'Индийский океан +1.8°C',       info: 'Выше нормы с 2000 г.', severity: 'danger' },
    ]
  },
  coral: {
    title: 'Состояние коралловых рифов',
    points: [
      { lat: -18.0, lng: 147.0, r: 24, label: 'Большой Барьерный риф',    info: '6-й эпизод обесцвечивания за 9 лет\n75% поражено', severity: 'critical' },
      { lat:   2.0, lng: 124.0, r: 18, label: 'Коралловый треугольник',   info: 'Наибольшее биоразнообразие\n30% поражено', severity: 'danger' },
      { lat:  17.0, lng: -67.0, r: 16, label: 'Карибские рифы',           info: '50% утрачено с 1970-х', severity: 'critical' },
      { lat:   4.0, lng:  73.0, r: 14, label: 'Мальдивы / Индийский',     info: 'Повторяющееся обесцвечивание', severity: 'danger' },
      { lat:  21.0, lng:-157.0, r: 12, label: 'Гавайи',                   info: 'Умеренное восстановление', severity: 'warning' },
      { lat:  24.5, lng: -81.5, r: 11, label: 'Флорида Кис',              info: '90% кораллов под угрозой к 2030', severity: 'critical' },
    ]
  }
};

let leafletMap     = null;
let markersLayer   = null;
let currentMapLayer = 'plastic';

function severityColor(s) {
  return { critical:'#e63946', danger:'#f4a261', warning:'#e9c46a', moderate:'#2a9d8f' }[s] || '#2a9d8f';
}

function severityFill(s) {
  return { critical:'rgba(230,57,70,0.22)', danger:'rgba(244,162,97,0.2)', warning:'rgba(233,196,106,0.18)', moderate:'rgba(42,157,143,0.18)' }[s] || 'rgba(42,157,143,0.18)';
}

function initLeafletMap() {
  if (leafletMap) return; // already init

  const container = document.getElementById('leafletMap');
  if (!container) return;

  // Create map — world view, no scroll zoom initially
  leafletMap = L.map('leafletMap', {
    center:          [20, 10],
    zoom:            2,
    minZoom:         2,
    maxZoom:         8,
    scrollWheelZoom: true,
    zoomControl:     true,
    attributionControl: true,
  });

  // CartoDB Dark Matter tiles — dark ocean, perfect colour match
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    subdomains:  'abcd',
    maxZoom:     19,
  }).addTo(leafletMap);

  // Markers group
  markersLayer = L.layerGroup().addTo(leafletMap);

  renderMapLayer(currentMapLayer);
}

function renderMapLayer(layerKey) {
  if (!leafletMap || !markersLayer) return;
  markersLayer.clearLayers();

  const layerData = MAP_LAYERS[layerKey];

  layerData.points.forEach(pt => {
    const col  = severityColor(pt.severity);
    const fill = severityFill(pt.severity);
    const r    = pt.r;

    // Outer glow circle
    const glowCircle = L.circle([pt.lat, pt.lng], {
      radius:      r * 18000,   // metres
      color:       col,
      weight:      1,
      opacity:     0.5,
      fillColor:   fill,
      fillOpacity: 0.35,
    }).addTo(markersLayer);

    // Inner marker circle
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:${Math.max(10, r/2)}px;
        height:${Math.max(10, r/2)}px;
        border-radius:50%;
        background:${col};
        border:2px solid ${col};
        box-shadow:0 0 ${r}px ${col}88, 0 0 ${r*2}px ${col}44;
        opacity:0.9;
      "></div>`,
      iconAnchor: [Math.max(5, r/4), Math.max(5, r/4)],
    });

    const marker = L.marker([pt.lat, pt.lng], { icon })
      .addTo(markersLayer)
      .bindPopup(`
        <div class="lf-popup">
          <div class="lf-popup-title" style="color:${col}">${pt.label}</div>
          <div class="lf-popup-body">${pt.info.replace(/\n/g,'<br>')}</div>
          <div class="lf-popup-sev">${pt.severity.toUpperCase()}</div>
        </div>
      `, {
        className:   'lf-custom-popup',
        maxWidth:    240,
        closeButton: true,
      });
  });
}

function initOceanMap() {
  initLeafletMap();
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

  const update = () => { renderMapLayer(currentMapLayer); };
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
    renderMapLayer(currentMapLayer);
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
    renderMapLayer(currentMapLayer);
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
  const mapObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      initOceanMap();
      mapObserver.disconnect();
    }
  }, { threshold: 0.1 });

  const mapSection = document.getElementById('map');
  if (mapSection) mapObserver.observe(mapSection);

  // Nav click — init map
  document.querySelector('[data-section="map"]')?.addEventListener('click', () => {
    setTimeout(() => {
      initOceanMap();
      // Leaflet needs invalidateSize when container was hidden
      if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 100);
    }, 50);
  });

  // Map layer buttons — switch Leaflet markers
  document.querySelectorAll('.map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.map-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMapLayer = btn.dataset.layer;
      renderMapLayer(currentMapLayer);
    });
  });

  // Live updates
  initLiveUpdates();

  // Admin system
  initAdmin();

  // ── Fetch real live data from APIs ──────────────
  fetchAllLiveData();

  console.log('%cOCEANWATCH v2.0 — Система мониторинга запущена с реальными данными', 'color:#2a9d8f;font-family:monospace;font-size:14px;font-weight:bold');
});

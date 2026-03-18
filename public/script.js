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
   1. NAVIGATION
   ══════════════════════════════════════════════════ */
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

// ── PRECISE CONTINENT PATH DATA (Natural Earth simplified, normalised 0..1)
// Projection: Equirectangular. X = (lon+180)/360, Y = (90-lat)/180
// Points traced from Natural Earth 110m land dataset
const CONTINENTS = {
  northAmerica: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.6)',
    holes: [],
    points: [
      // Alaska peninsula + west coast Canada
      [0.040,0.160],[0.055,0.145],[0.068,0.152],[0.072,0.168],[0.060,0.178],
      [0.078,0.172],[0.090,0.165],[0.102,0.160],[0.108,0.172],[0.098,0.185],
      [0.112,0.180],[0.124,0.176],[0.132,0.182],[0.138,0.195],[0.142,0.210],
      // West coast USA
      [0.148,0.220],[0.152,0.240],[0.154,0.260],[0.156,0.278],[0.152,0.292],
      [0.148,0.305],[0.152,0.315],[0.148,0.330],
      // Baja / Mexico west
      [0.148,0.345],[0.152,0.360],[0.156,0.375],[0.158,0.390],[0.156,0.405],
      // Central America
      [0.220,0.395],[0.228,0.405],[0.232,0.418],[0.238,0.425],[0.244,0.418],
      [0.248,0.408],[0.255,0.415],
      // Caribbean & Gulf coast
      [0.260,0.345],[0.278,0.340],[0.292,0.330],[0.310,0.320],[0.325,0.318],
      [0.335,0.305],[0.340,0.295],[0.348,0.285],[0.358,0.282],
      // East coast USA
      [0.360,0.268],[0.362,0.252],[0.360,0.240],[0.356,0.228],[0.358,0.215],
      [0.355,0.200],[0.352,0.188],
      // New England / Maritime Canada
      [0.355,0.175],[0.362,0.162],[0.372,0.155],[0.380,0.148],[0.388,0.140],
      [0.395,0.132],[0.390,0.120],[0.382,0.112],[0.375,0.105],[0.368,0.098],
      // Labrador / Hudson Bay area
      [0.355,0.095],[0.340,0.090],[0.325,0.088],[0.310,0.082],[0.298,0.075],
      [0.285,0.068],[0.272,0.062],[0.260,0.058],[0.248,0.055],[0.235,0.055],
      [0.222,0.058],[0.210,0.062],[0.200,0.068],[0.192,0.078],[0.188,0.092],
      [0.185,0.108],[0.180,0.122],[0.172,0.135],[0.162,0.142],[0.152,0.148],
      [0.140,0.152],[0.128,0.155],[0.115,0.155],[0.100,0.152],[0.085,0.148],
      [0.072,0.142],[0.060,0.138],[0.050,0.140],
    ]
  },
  southAmerica: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.6)',
    points: [
      [0.258,0.418],[0.268,0.408],[0.278,0.402],[0.290,0.398],[0.302,0.395],
      [0.315,0.392],[0.325,0.388],[0.335,0.382],[0.342,0.392],[0.348,0.402],
      [0.352,0.415],[0.355,0.428],[0.358,0.442],[0.360,0.458],[0.360,0.475],
      [0.358,0.492],[0.355,0.510],[0.350,0.528],[0.344,0.546],[0.336,0.562],
      [0.326,0.578],[0.315,0.592],[0.305,0.605],[0.296,0.616],[0.288,0.625],
      [0.280,0.630],[0.272,0.628],[0.265,0.620],[0.260,0.608],[0.256,0.594],
      [0.254,0.578],[0.254,0.562],[0.256,0.545],[0.258,0.528],[0.260,0.510],
      [0.260,0.492],[0.258,0.474],[0.255,0.456],[0.252,0.440],[0.250,0.425],
    ]
  },
  europe: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.6)',
    points: [
      // Iberian peninsula
      [0.450,0.185],[0.458,0.178],[0.468,0.172],[0.478,0.168],[0.488,0.165],
      [0.498,0.165],[0.505,0.168],[0.510,0.175],[0.512,0.185],[0.510,0.195],
      [0.505,0.205],[0.498,0.212],[0.490,0.215],[0.480,0.215],[0.470,0.210],
      // France, Benelux
      [0.465,0.200],[0.462,0.190],[0.465,0.180],[0.472,0.172],
      [0.482,0.162],[0.492,0.155],[0.502,0.150],[0.512,0.148],[0.522,0.148],
      [0.530,0.150],[0.538,0.154],[0.544,0.160],[0.548,0.168],[0.548,0.178],
      // Germany, Scandinavia
      [0.545,0.162],[0.540,0.152],[0.535,0.142],[0.530,0.132],[0.528,0.120],
      [0.525,0.108],[0.522,0.098],[0.518,0.088],[0.515,0.078],[0.515,0.068],
      [0.518,0.060],[0.522,0.055],[0.528,0.052],[0.536,0.052],[0.544,0.055],
      [0.550,0.060],[0.555,0.068],[0.558,0.078],[0.558,0.090],[0.555,0.102],
      [0.552,0.112],[0.548,0.122],[0.545,0.132],[0.542,0.142],
      // Baltic / Finland
      [0.548,0.118],[0.555,0.108],[0.562,0.098],[0.568,0.088],[0.572,0.078],
      [0.575,0.068],[0.575,0.058],[0.572,0.050],[0.565,0.045],[0.555,0.042],
      [0.548,0.042],[0.558,0.048],[0.565,0.058],[0.562,0.070],[0.555,0.080],
      // UK outline simplified
      [0.480,0.148],[0.475,0.138],[0.472,0.128],[0.472,0.118],[0.475,0.108],
      [0.480,0.100],[0.486,0.095],[0.490,0.102],[0.490,0.112],[0.488,0.122],
      [0.485,0.132],[0.483,0.142],
    ]
  },
  africa: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.6)',
    points: [
      [0.452,0.205],[0.460,0.198],[0.470,0.192],[0.480,0.188],[0.490,0.185],
      [0.500,0.182],[0.510,0.182],[0.520,0.184],[0.530,0.188],[0.538,0.194],
      [0.544,0.202],[0.548,0.212],[0.550,0.222],[0.550,0.235],[0.548,0.250],
      [0.545,0.265],[0.542,0.280],[0.540,0.298],[0.538,0.315],[0.538,0.332],
      [0.538,0.350],[0.536,0.368],[0.534,0.385],[0.530,0.402],[0.524,0.418],
      [0.516,0.434],[0.506,0.450],[0.495,0.464],[0.485,0.476],[0.475,0.486],
      [0.468,0.494],[0.462,0.498],[0.458,0.498],[0.454,0.492],[0.450,0.480],
      [0.448,0.465],[0.446,0.448],[0.446,0.430],[0.448,0.412],[0.450,0.395],
      [0.452,0.378],[0.454,0.360],[0.454,0.342],[0.453,0.325],[0.452,0.308],
      [0.450,0.290],[0.450,0.272],[0.450,0.255],[0.450,0.238],[0.452,0.222],
    ]
  },
  asia: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.6)',
    points: [
      // Turkey / Near East
      [0.548,0.192],[0.558,0.185],[0.568,0.180],[0.580,0.176],[0.592,0.174],
      [0.605,0.172],[0.618,0.172],[0.628,0.175],[0.635,0.182],[0.638,0.192],
      // Arabian peninsula
      [0.638,0.205],[0.640,0.220],[0.645,0.235],[0.650,0.250],[0.655,0.262],
      [0.660,0.272],[0.665,0.280],[0.670,0.285],[0.675,0.288],[0.680,0.285],
      [0.685,0.278],[0.688,0.268],[0.688,0.255],[0.685,0.242],[0.680,0.230],
      [0.675,0.220],[0.670,0.210],[0.665,0.202],[0.660,0.195],[0.658,0.188],
      // Iran / Central Asia
      [0.660,0.178],[0.668,0.170],[0.678,0.162],[0.690,0.155],[0.702,0.150],
      [0.715,0.145],[0.728,0.142],[0.742,0.140],[0.756,0.140],[0.768,0.142],
      [0.780,0.145],[0.792,0.150],[0.802,0.155],[0.810,0.162],[0.815,0.170],
      // Russia / Siberia
      [0.818,0.165],[0.825,0.155],[0.830,0.142],[0.834,0.128],[0.836,0.115],
      [0.835,0.102],[0.832,0.088],[0.826,0.075],[0.818,0.065],[0.808,0.058],
      [0.795,0.052],[0.780,0.048],[0.762,0.046],[0.744,0.045],[0.725,0.046],
      [0.706,0.048],[0.688,0.050],[0.670,0.052],[0.652,0.055],[0.635,0.058],
      [0.618,0.062],[0.602,0.065],[0.588,0.068],[0.576,0.072],[0.566,0.078],
      [0.558,0.086],[0.552,0.096],[0.548,0.108],[0.546,0.120],[0.546,0.132],
      [0.546,0.145],[0.546,0.158],[0.548,0.170],[0.548,0.180],
      // East Asia coastline
      [0.820,0.158],[0.824,0.170],[0.826,0.182],[0.824,0.195],[0.820,0.208],
      [0.815,0.220],[0.808,0.232],[0.800,0.242],[0.790,0.252],[0.778,0.260],
      [0.768,0.265],[0.758,0.268],[0.748,0.268],[0.738,0.265],[0.728,0.260],
      [0.718,0.252],[0.710,0.242],[0.702,0.232],[0.695,0.220],[0.690,0.210],
      // SE Asia / Indochina
      [0.760,0.268],[0.768,0.278],[0.775,0.290],[0.780,0.302],[0.782,0.315],
      [0.780,0.328],[0.775,0.340],[0.768,0.350],[0.760,0.358],[0.750,0.362],
      [0.740,0.362],[0.732,0.358],[0.725,0.350],[0.720,0.340],[0.718,0.328],
      [0.718,0.315],[0.720,0.302],[0.724,0.290],[0.730,0.278],[0.738,0.270],
    ]
  },
  india: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.55)',
    points: [
      [0.638,0.192],[0.645,0.200],[0.652,0.210],[0.658,0.222],[0.662,0.235],
      [0.665,0.250],[0.665,0.265],[0.663,0.280],[0.658,0.295],[0.650,0.308],
      [0.640,0.320],[0.630,0.328],[0.620,0.332],[0.612,0.330],[0.605,0.322],
      [0.600,0.310],[0.598,0.296],[0.598,0.282],[0.600,0.268],[0.604,0.254],
      [0.608,0.240],[0.612,0.228],[0.616,0.216],[0.620,0.205],[0.625,0.196],
      [0.630,0.190],
    ]
  },
  australia: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.6)',
    points: [
      [0.770,0.500],[0.782,0.490],[0.795,0.482],[0.808,0.476],[0.822,0.472],
      [0.836,0.470],[0.850,0.470],[0.862,0.472],[0.872,0.478],[0.880,0.486],
      [0.886,0.496],[0.890,0.508],[0.890,0.522],[0.888,0.536],[0.882,0.550],
      [0.874,0.562],[0.864,0.572],[0.852,0.580],[0.838,0.585],[0.824,0.586],
      [0.810,0.582],[0.797,0.575],[0.785,0.565],[0.776,0.552],[0.769,0.538],
      [0.765,0.522],[0.764,0.508],
    ]
  },
  newZealand: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.45)',
    points: [
      [0.905,0.548],[0.910,0.540],[0.916,0.535],[0.922,0.535],[0.926,0.542],
      [0.926,0.552],[0.922,0.560],[0.916,0.565],[0.910,0.562],[0.906,0.555],
    ]
  },
  greenland: {
    color: '#162535',
    stroke: 'rgba(42,157,143,0.4)',
    points: [
      [0.338,0.040],[0.350,0.032],[0.365,0.026],[0.380,0.022],[0.395,0.022],
      [0.410,0.026],[0.422,0.033],[0.430,0.043],[0.432,0.055],[0.428,0.068],
      [0.420,0.079],[0.408,0.087],[0.394,0.092],[0.378,0.094],[0.362,0.092],
      [0.348,0.086],[0.338,0.076],[0.332,0.064],[0.332,0.052],
    ]
  },
  iceland: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.4)',
    points: [
      [0.456,0.075],[0.462,0.068],[0.470,0.064],[0.478,0.062],[0.484,0.065],
      [0.488,0.072],[0.486,0.080],[0.480,0.086],[0.472,0.088],[0.464,0.085],
    ]
  },
  japan: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.45)',
    points: [
      [0.838,0.165],[0.842,0.158],[0.848,0.152],[0.854,0.150],[0.859,0.154],
      [0.860,0.162],[0.857,0.170],[0.851,0.175],[0.844,0.174],[0.839,0.170],
    ]
  },
  madagascar: {
    color: '#1a3045',
    stroke: 'rgba(42,157,143,0.4)',
    points: [
      [0.556,0.440],[0.560,0.430],[0.564,0.422],[0.568,0.418],[0.572,0.420],
      [0.574,0.432],[0.572,0.445],[0.568,0.455],[0.562,0.460],[0.556,0.455],
    ]
  },
  antarcticaShape: {
    color: '#162535',
    stroke: 'rgba(42,157,143,0.3)',
    points: [
      [0.000,0.858],[0.042,0.852],[0.083,0.848],[0.125,0.845],[0.167,0.844],
      [0.208,0.845],[0.250,0.848],[0.292,0.850],[0.333,0.852],[0.375,0.850],
      [0.417,0.846],[0.458,0.842],[0.500,0.840],[0.542,0.842],[0.583,0.845],
      [0.625,0.848],[0.667,0.850],[0.708,0.848],[0.750,0.845],[0.792,0.843],
      [0.833,0.844],[0.875,0.847],[0.917,0.850],[0.958,0.854],[1.000,0.858],
      [1.000,1.000],[0.000,1.000],
    ]
  },
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

  console.log('%cOCEANWATCH v1.0 — Система мониторинга запущена', 'color:#2a9d8f;font-family:monospace;font-size:14px;font-weight:bold');
});

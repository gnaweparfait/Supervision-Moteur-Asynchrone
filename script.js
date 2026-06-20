/**
 * ============================================================
 * Supervision Moteur Asynchrone Triphasé — Script principal
 * Authentification + simulation temps réel + alarmes + Chart.js
 * ============================================================
 */

'use strict';

/* ============================================================
   AUTHENTIFICATION (sans backend — localStorage)
   ============================================================ */

/** Identifiants et profil admin (sécurité simulée côté client) */
const AUTH_CONFIG = {
  username: 'Abdel KAWIL',
  password: 'Abdel062026',
  sessionKey: 'motorSupervisionSession',
  profile: {
    fullName: 'Abdel KAWIL',
    role: 'Administrateur',
    department: 'Supervision moteur asynchrone triphasé',
    email: 'abdel.kawil@supervision.local',
    accessLevel: 'Accès complet — Dashboard & réglages moteur'
  }
};

/**
 * Vérifie si une session utilisateur valide existe
 */
function isAuthenticated() {
  try {
    const raw = localStorage.getItem(AUTH_CONFIG.sessionKey);
    if (!raw) return false;

    const session = JSON.parse(raw);
    return session && session.isLoggedIn === true && session.username === AUTH_CONFIG.username;
  } catch (e) {
    return false;
  }
}

/**
 * Retourne les informations du profil administrateur
 */
function getAdminProfile() {
  return { ...AUTH_CONFIG.profile, username: AUTH_CONFIG.username };
}

/**
 * Retourne les informations de session (date de connexion, etc.)
 */
function getSessionInfo() {
  try {
    const raw = localStorage.getItem(AUTH_CONFIG.sessionKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Initialise la barre de navigation commune (dashboard / admin)
 */
function initAppNav(activePage) {
  const loggedInUserEl = document.getElementById('loggedInUser');
  if (loggedInUserEl) {
    loggedInUserEl.textContent = getLoggedInUser() || AUTH_CONFIG.username;
  }

  document.querySelectorAll('.nav-app-link').forEach(link => {
    link.classList.toggle('active', link.dataset.page === activePage);
  });

  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', logout);
  }

  initThemeToggle();
}

/**
 * Retourne le nom d'utilisateur connecté ou null
 */
function getLoggedInUser() {
  try {
    const raw = localStorage.getItem(AUTH_CONFIG.sessionKey);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session.isLoggedIn ? session.username : null;
  } catch (e) {
    return null;
  }
}

/**
 * Formate une date ISO en affichage français
 */
function formatLoginDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Enregistre la session dans localStorage
 */
function setSession(username) {
  const session = {
    isLoggedIn: true,
    username,
    loginTime: new Date().toISOString()
  };
  localStorage.setItem(AUTH_CONFIG.sessionKey, JSON.stringify(session));
}

/**
 * Supprime la session (déconnexion)
 */
function clearSession() {
  localStorage.removeItem(AUTH_CONFIG.sessionKey);
}

/**
 * Tente une connexion avec identifiants fournis
 * @returns {{ success: boolean, message?: string }}
 */
function attemptLogin(username, password) {
  const trimmedUser = (username || '').trim();

  if (!trimmedUser || !password) {
    return { success: false, message: 'Veuillez remplir tous les champs.' };
  }

  if (trimmedUser === AUTH_CONFIG.username && password === AUTH_CONFIG.password) {
    setSession(trimmedUser);
    return { success: true };
  }

  return { success: false, message: 'Identifiants incorrects. Accès refusé.' };
}

/**
 * Redirige vers login.html si l'utilisateur n'est pas authentifié
 */
function requireAuth() {
  if (!isAuthenticated()) {
    window.location.replace('login.html');
    return false;
  }
  return true;
}

/**
 * Déconnexion : arrête la simulation, efface la session, redirige
 */
function logout() {
  if (typeof state !== 'undefined' && state.isRunning) {
    stopSimulation();
  }
  clearSession();
  window.location.replace('login.html');
}

/**
 * Initialise la page de connexion (login.html)
 */
function initLoginPage() {
  // Déjà connecté → accès direct au dashboard
  if (isAuthenticated()) {
    window.location.replace('dashboard.html');
    return;
  }

  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorBox = document.getElementById('loginError');
  const errorMessage = document.getElementById('loginErrorMessage');
  const btnTogglePassword = document.getElementById('btnTogglePassword');
  const togglePasswordIcon = document.getElementById('togglePasswordIcon');

  /** Affiche ou masque le message d'erreur */
  function showError(message) {
    errorMessage.textContent = message;
    errorBox.classList.remove('d-none');
  }

  function hideError() {
    errorBox.classList.add('d-none');
  }

  // Soumission du formulaire
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    hideError();

    const result = attemptLogin(usernameInput.value, passwordInput.value);

    if (result.success) {
      window.location.replace('dashboard.html');
    } else {
      showError(result.message);
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  // Afficher / masquer le mot de passe
  btnTogglePassword.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePasswordIcon.classList.toggle('bi-eye', !isPassword);
    togglePasswordIcon.classList.toggle('bi-eye-slash', isPassword);
  });

  // Masquer l'erreur lors de la saisie
  [usernameInput, passwordInput].forEach(input => {
    input.addEventListener('input', hideError);
  });

  usernameInput.focus();
  initThemeToggle();
}

/* --- Configuration des capteurs --- */
const SENSORS = {
  temperature: {
    label: 'Température',
    unit: '°C',
    default: 55.0,
    min: 20,
    max: 100,
    step: 0.1,
    decimals: 1,
    threshold: { type: 'max', value: 75 },
    // Paramètres de simulation : valeur nominale et amplitude du bruit
    sim: { nominal: 55, noise: 0.8, drift: 0.05 }
  },
  pressure: {
    label: 'Pression',
    unit: 'bar',
    default: 3.2,
    min: 0,
    max: 6,
    step: 0.01,
    decimals: 2,
    threshold: { type: 'max', value: 4.5 },
    sim: { nominal: 3.2, noise: 0.04, drift: 0.008 }
  },
  current: {
    label: 'Courant',
    unit: 'A',
    default: 15.5,
    min: 0,
    max: 30,
    step: 0.1,
    decimals: 1,
    threshold: { type: 'max', value: 22 },
    sim: { nominal: 15.5, noise: 0.5, drift: 0.03 }
  },
  speed: {
    label: 'Vitesse asynchrone',
    unit: 'tr/min',
    default: 1450,
    min: 1000,
    max: 1800,
    step: 1,
    decimals: 0,
    threshold: { type: 'range', min: 1300, max: 1550 },
    sim: { nominal: 1450, noise: 8, drift: 2 }
  }
};

/* --- Constantes globales --- */
const SIMULATION_INTERVAL = 800;
const CHART_MAX_POINTS = 60;
const STORAGE_KEY = 'motorSupervisionState';
const THEME_STORAGE_KEY = 'motorSupervisionTheme';

/* --- État de l'application --- */
const state = {
  values: {},
  isRunning: false,
  manualMode: false,   // true = l'utilisateur contrôle les valeurs manuellement
  intervalId: null,
  previousAlarms: {},
  chartLabels: [],
  simPhase: 0
};

/* --- Références DOM --- */
const dom = {};

/* --- Graphiques Chart.js --- */
let chartTempPressure = null;
let chartCurrentSpeed = null;

/**
 * Point d'entrée : route vers login ou dashboard selon data-page
 */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  if (page === 'login') {
    initLoginPage();
    return;
  }

  if (page === 'dashboard') {
    initDashboard();
    return;
  }

  if (page === 'admin') {
    initAdminPage();
    return;
  }

  if (page === 'intervention') {
    initInterventionPage();
  }
});

/**
 * Initialise le dashboard (protégé par authentification)
 */
function initDashboard() {
  if (!requireAuth()) return;

  cacheDOMElements();
  initSensorValues();
  initCharts();
  bindEvents();
  updateDateTime();
  setInterval(updateDateTime, 1000);
  loadFromLocalStorage();
  updateUI();

  initAppNav('dashboard');
  updateDateTimeHeader();

  addLog(`Connexion réussie — Bienvenue, ${getLoggedInUser() || AUTH_CONFIG.username}.`, 'ok');
  addLog('Système initialisé. En attente de démarrage de la simulation.', 'info');
}

/**
 * Initialise la page Espace Admin (admin.html)
 */
function initAdminPage() {
  if (!requireAuth()) return;

  initAppNav('admin');
  updateDateTimeHeader();

  const profile = getAdminProfile();
  const session = getSessionInfo();

  // Remplir les champs du profil administrateur
  const fields = {
    'admin-fullName': profile.fullName,
    'admin-username': profile.username,
    'admin-role': profile.role,
    'admin-department': profile.department,
    'admin-email': profile.email,
    'admin-access': profile.accessLevel,
    'admin-loginTime': formatLoginDate(session?.loginTime)
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });

  // Mot de passe masqué avec bouton afficher/masquer
  const passwordDisplay = document.getElementById('admin-password');
  const btnToggleAdminPassword = document.getElementById('btnToggleAdminPassword');
  let passwordVisible = false;

  if (passwordDisplay) {
    passwordDisplay.textContent = '•••••••••••';
  }

  if (btnToggleAdminPassword && passwordDisplay) {
    btnToggleAdminPassword.addEventListener('click', () => {
      passwordVisible = !passwordVisible;
      passwordDisplay.textContent = passwordVisible ? AUTH_CONFIG.password : '•••••••••••';
      btnToggleAdminPassword.innerHTML = passwordVisible
        ? '<i class="bi bi-eye-slash"></i> Masquer'
        : '<i class="bi bi-eye"></i> Afficher';
    });
  }

  const btnLogoutCard = document.getElementById('btnLogoutCard');
  if (btnLogoutCard) {
    btnLogoutCard.addEventListener('click', logout);
  }
}

/**
 * Met à jour l'horloge dans l'en-tête (dashboard et admin)
 */
function updateDateTimeHeader() {
  const el = document.getElementById('currentDateTime');
  if (!el) return;

  const update = () => {
    el.textContent = new Date().toLocaleString('fr-FR', {
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  update();
  if (!window._dateTimeInterval) {
    window._dateTimeInterval = setInterval(update, 1000);
  }
}

/**
 * Cache les éléments DOM fréquemment utilisés
 */
function cacheDOMElements() {
  dom.motorStatusIndicator = document.getElementById('motorStatusIndicator');
  dom.motorStatusText = document.getElementById('motorStatusText');
  dom.simulationBadge = document.getElementById('simulationBadge');
  dom.btnStart = document.getElementById('btnStart');
  dom.btnStop = document.getElementById('btnStop');
  dom.btnReset = document.getElementById('btnReset');
  dom.btnClearLog = document.getElementById('btnClearLog');
  dom.eventLog = document.getElementById('eventLog');
  dom.currentDateTime = document.getElementById('currentDateTime');
  dom.manualModeToggle = document.getElementById('manualModeToggle');

  dom.sensors = {};
  Object.keys(SENSORS).forEach(key => {
    dom.sensors[key] = {
      card: document.getElementById(`card-${key}`),
      value: document.getElementById(`value-${key}`),
      status: document.getElementById(`status-${key}`),
      slider: document.getElementById(`slider-${key}`),
      input: document.getElementById(`input-${key}`),
      panelSlider: document.getElementById(`panel-slider-${key}`),
      panelInput: document.getElementById(`panel-input-${key}`),
      controlValue: document.getElementById(`control-value-${key}`)
    };
  });
}

/**
 * Initialise les valeurs par défaut des capteurs
 */
function initSensorValues() {
  Object.keys(SENSORS).forEach(key => {
    state.values[key] = SENSORS[key].default;
    state.previousAlarms[key] = false;
  });
}

/**
 * Lie tous les événements utilisateur
 */
function bindEvents() {
  dom.btnStart.addEventListener('click', startSimulation);
  dom.btnStop.addEventListener('click', stopSimulation);
  dom.btnReset.addEventListener('click', resetValues);
  dom.btnClearLog.addEventListener('click', clearLog);

  const btnIntervention = document.getElementById('btnIntervention');
  if (btnIntervention) {
    btnIntervention.addEventListener('click', (e) => {
      e.preventDefault();
      saveInterventionContext(getCurrentMotorSnapshot());
      window.location.href = 'intervention.html?new=1';
    });
  }

  // Mode manuel
  if (dom.manualModeToggle) {
    dom.manualModeToggle.addEventListener('change', () => {
      state.manualMode = dom.manualModeToggle.checked;
      const msg = state.manualMode
        ? 'Mode manuel activé — réglage température, pression, courant et vitesse asynchrone.'
        : 'Mode automatique — la simulation met à jour les paramètres moteur.';
      addLog(msg, state.manualMode ? 'warning' : 'info');
    });
  }

  // Boutons ± du panneau de réglage
  document.querySelectorAll('.btn-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.sensor;
      const direction = parseInt(btn.dataset.step, 10);
      const config = SENSORS[key];
      const step = config.step * (direction > 0 ? 1 : -1) * (key === 'speed' ? 10 : (key === 'pressure' ? 5 : 1));
      setSensorValue(key, state.values[key] + step, true);
    });
  });

  Object.keys(SENSORS).forEach(key => {
    const { slider, input, panelSlider, panelInput } = dom.sensors[key];
    const config = SENSORS[key];

    // Curseurs des cartes capteurs
    slider.addEventListener('input', () => {
      setSensorValue(key, parseFloat(slider.value), true);
    });

    input.addEventListener('input', () => {
      let val = parseFloat(input.value);
      if (!isNaN(val)) setSensorValue(key, val, true);
    });

    input.addEventListener('change', () => {
      let val = parseFloat(input.value);
      if (isNaN(val)) val = config.default;
      setSensorValue(key, val, true);
    });

    // Curseurs et inputs du panneau de réglage
    if (panelSlider) {
      panelSlider.addEventListener('input', () => {
        setSensorValue(key, parseFloat(panelSlider.value), true);
      });
    }

    if (panelInput) {
      panelInput.addEventListener('input', () => {
        let val = parseFloat(panelInput.value);
        if (!isNaN(val)) setSensorValue(key, val, true);
      });

      panelInput.addEventListener('change', () => {
        let val = parseFloat(panelInput.value);
        if (isNaN(val)) val = config.default;
        setSensorValue(key, val, true);
      });
    }
  });
}

/**
 * Met à jour l'horloge affichée dans l'en-tête
 */
function updateDateTime() {
  const now = new Date();
  dom.currentDateTime.textContent = now.toLocaleString('fr-FR', {
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/* ============================================================
   SIMULATION
   ============================================================ */

/**
 * Démarre la simulation temps réel
 */
function startSimulation() {
  if (state.isRunning) return;

  state.isRunning = true;
  dom.btnStart.disabled = true;
  dom.btnStop.disabled = false;
  dom.simulationBadge.textContent = 'SIMULATION EN COURS';
  dom.simulationBadge.classList.add('running');

  addLog('Simulation démarrée — moteur en fonctionnement.', 'ok');

  state.intervalId = setInterval(simulationTick, SIMULATION_INTERVAL);
}

/**
 * Arrête la simulation
 */
function stopSimulation() {
  if (!state.isRunning) return;

  state.isRunning = false;
  clearInterval(state.intervalId);
  state.intervalId = null;

  dom.btnStart.disabled = false;
  dom.btnStop.disabled = true;
  dom.simulationBadge.textContent = 'SIMULATION ARRÊTÉE';
  dom.simulationBadge.classList.remove('running');

  addLog('Simulation arrêtée.', 'warning');
  saveToLocalStorage();
}

/**
 * Remet toutes les valeurs aux défauts nominaux
 */
function resetValues() {
  stopSimulation();

  state.manualMode = false;
  if (dom.manualModeToggle) dom.manualModeToggle.checked = false;

  Object.keys(SENSORS).forEach(key => {
    state.values[key] = SENSORS[key].default;
    state.previousAlarms[key] = false;
  });

  // Réinitialiser les graphiques
  state.chartLabels = [];
  if (chartTempPressure) {
    chartTempPressure.data.labels = [];
    chartTempPressure.data.datasets.forEach(ds => ds.data = []);
    chartTempPressure.update('none');
  }
  if (chartCurrentSpeed) {
    chartCurrentSpeed.data.labels = [];
    chartCurrentSpeed.data.datasets.forEach(ds => ds.data = []);
    chartCurrentSpeed.update('none');
  }

  updateUI();
  addLog('Valeurs réinitialisées aux paramètres nominaux.', 'info');
  saveToLocalStorage();
}

/**
 * Tick de simulation : génère des variations réalistes
 */
function simulationTick() {
  state.simPhase += 0.15;

  // En mode manuel, seuls les graphiques et alarmes sont mis à jour
  if (!state.manualMode) {
    Object.keys(SENSORS).forEach((key, index) => {
      const config = SENSORS[key];
      const sim = config.sim;
      const current = state.values[key];

      const noise = (Math.random() - 0.5) * 2 * sim.noise;
      const oscillation = Math.sin(state.simPhase + index * 1.2) * sim.drift;
      const correction = (sim.nominal - current) * 0.02;

      let newValue = current + noise + oscillation + correction;
      newValue = clamp(newValue, config.min, config.max);
      newValue = roundValue(newValue, config.decimals);

      state.values[key] = newValue;
    });
  }

  updateUI();
  appendChartData();
  saveToLocalStorage();
}

/* ============================================================
   GESTION DES VALEURS & ALARMES
   ============================================================ */

/**
 * Définit manuellement la valeur d'un capteur (slider, input ou bouton ±)
 * @param {string} key - Identifiant capteur
 * @param {number} value - Nouvelle valeur
 * @param {boolean} fromUser - true si action utilisateur (active le mode manuel)
 */
function setSensorValue(key, value, fromUser = false) {
  const config = SENSORS[key];
  value = clamp(value, config.min, config.max);
  value = roundValue(value, config.decimals);
  state.values[key] = value;

  // Réglage manuel : activer le mode manuel automatiquement
  if (fromUser && !state.manualMode) {
    state.manualMode = true;
    if (dom.manualModeToggle) dom.manualModeToggle.checked = true;
  }

  updateUI();

  if (state.isRunning) {
    appendChartData();
  }
  saveToLocalStorage();
}

/**
 * Vérifie si une valeur dépasse le seuil configuré
 */
function isAlarm(key, value) {
  const threshold = SENSORS[key].threshold;

  if (threshold.type === 'max') {
    return value > threshold.value;
  }
  if (threshold.type === 'range') {
    return value < threshold.min || value > threshold.max;
  }
  return false;
}

/**
 * Met à jour l'ensemble de l'interface
 */
function updateUI() {
  let globalAlarm = false;

  Object.keys(SENSORS).forEach(key => {
    const config = SENSORS[key];
    const value = state.values[key];
    const alarm = isAlarm(key, value);
    const { card, value: valueEl, status, slider, input, panelSlider, panelInput, controlValue } = dom.sensors[key];

    // Affichage valeur principale
    valueEl.textContent = formatValue(value, config.decimals);

    // Synchroniser tous les contrôles (cartes + panneau réglage)
    slider.value = value;
    input.value = value;
    if (panelSlider) panelSlider.value = value;
    if (panelInput) panelInput.value = value;
    if (controlValue) {
      controlValue.textContent = `${formatValue(value, config.decimals)} ${config.unit}`;
    }

    // Badge VERT / ROUGE
    status.textContent = alarm ? 'ROUGE' : 'VERT';
    status.classList.toggle('alarm', alarm);

    // Style carte
    card.classList.toggle('status-ok', !alarm);
    card.classList.toggle('status-alarm', alarm);

    // Journaliser les transitions d'alarme
    if (alarm && !state.previousAlarms[key]) {
      addLog(`ALARME — ${config.label} : ${formatValue(value, config.decimals)} ${config.unit} (seuil dépassé)`, 'alarm');
    } else if (!alarm && state.previousAlarms[key]) {
      addLog(`${config.label} revenu à la normale : ${formatValue(value, config.decimals)} ${config.unit}`, 'ok');
    }
    state.previousAlarms[key] = alarm;

    if (alarm) globalAlarm = true;
  });

  // État global moteur
  dom.motorStatusIndicator.classList.toggle('alarm', globalAlarm);
  dom.motorStatusText.textContent = globalAlarm ? 'ALARME' : 'OK';
  dom.motorStatusText.classList.toggle('ok', !globalAlarm);
  dom.motorStatusText.classList.toggle('alarm', globalAlarm);
}

/* ============================================================
   GRAPHIQUES Chart.js
   ============================================================ */

/**
 * Configuration commune des graphiques (couleurs adaptées au thème)
 */
function getChartThemeColors() {
  return {
    tick: getComputedStyle(document.documentElement).getPropertyValue('--chart-tick').trim() || '#6e7681',
    grid: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.05)',
    legend: getComputedStyle(document.documentElement).getPropertyValue('--chart-legend').trim() || '#8b949e'
  };
}

function getChartOptions(yLabel) {
  const colors = getChartThemeColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: { color: colors.legend, font: { family: 'Roboto Mono', size: 11 } }
      }
    },
    scales: {
      x: {
        ticks: { color: colors.tick, maxTicksLimit: 8, font: { size: 10 } },
        grid: { color: colors.grid }
      },
      y: {
        ticks: { color: colors.tick, font: { size: 10 } },
        grid: { color: colors.grid },
        title: {
          display: true,
          text: yLabel,
          color: colors.legend,
          font: { size: 11 }
        }
      }
    }
  };
}

/**
 * Met à jour les couleurs des graphiques après changement de thème
 */
function refreshChartsTheme() {
  if (!chartTempPressure || !chartCurrentSpeed) return;

  const colors = getChartThemeColors();
  [chartTempPressure, chartCurrentSpeed].forEach(chart => {
    chart.options.plugins.legend.labels.color = colors.legend;
    Object.values(chart.options.scales).forEach(scale => {
      if (scale.ticks) scale.ticks.color = colors.tick;
      if (scale.grid) scale.grid.color = colors.grid;
      if (scale.title) scale.title.color = colors.legend;
    });
    chart.update('none');
  });
}

/**
 * Initialise les deux graphiques Chart.js
 */
function initCharts() {
  const ctx1 = document.getElementById('chartTempPressure').getContext('2d');
  chartTempPressure = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Température (°C)',
          data: [],
          borderColor: '#f85149',
          backgroundColor: 'rgba(248, 81, 73, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Pression (bar)',
          data: [],
          borderColor: '#388bfd',
          backgroundColor: 'rgba(56, 139, 253, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: getChartOptions('Valeur')
  });

  const ctx2 = document.getElementById('chartCurrentSpeed').getContext('2d');
  chartCurrentSpeed = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Courant (A)',
          data: [],
          borderColor: '#d29922',
          backgroundColor: 'rgba(210, 153, 34, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true
        },
        {
          label: 'Vitesse asynchrone (tr/min)',
          data: [],
          borderColor: '#39d353',
          backgroundColor: 'rgba(57, 211, 83, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      ...getChartOptions('Courant (A)'),
      scales: (() => {
        const colors = getChartThemeColors();
        return {
          x: {
            ticks: { color: colors.tick, maxTicksLimit: 8, font: { size: 10 } },
            grid: { color: colors.grid }
          },
          y: {
            position: 'left',
            ticks: { color: colors.tick, font: { size: 10 } },
            grid: { color: colors.grid },
            title: { display: true, text: 'Courant (A)', color: colors.legend, font: { size: 11 } }
          },
          y1: {
            position: 'right',
            ticks: { color: colors.tick, font: { size: 10 } },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Vitesse (tr/min)', color: colors.legend, font: { size: 11 } }
          }
        };
      })()
    }
  });
}

/**
 * Ajoute un point de données aux graphiques
 */
function appendChartData() {
  const now = new Date();
  const label = now.toLocaleTimeString('fr-FR');

  state.chartLabels.push(label);
  if (state.chartLabels.length > CHART_MAX_POINTS) {
    state.chartLabels.shift();
  }

  // Graphique Température & Pression
  chartTempPressure.data.labels = [...state.chartLabels];
  chartTempPressure.data.datasets[0].data.push(state.values.temperature);
  chartTempPressure.data.datasets[1].data.push(state.values.pressure);
  if (chartTempPressure.data.datasets[0].data.length > CHART_MAX_POINTS) {
    chartTempPressure.data.datasets.forEach(ds => ds.data.shift());
  }
  chartTempPressure.update('none');

  // Graphique Courant & Vitesse
  chartCurrentSpeed.data.labels = [...state.chartLabels];
  chartCurrentSpeed.data.datasets[0].data.push(state.values.current);
  chartCurrentSpeed.data.datasets[1].data.push(state.values.speed);
  if (chartCurrentSpeed.data.datasets[0].data.length > CHART_MAX_POINTS) {
    chartCurrentSpeed.data.datasets.forEach(ds => ds.data.shift());
  }
  chartCurrentSpeed.update('none');
}

/* ============================================================
   JOURNAL D'ÉVÉNEMENTS
   ============================================================ */

/**
 * Ajoute une entrée au journal
 */
function addLog(message, type = 'info') {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('fr-FR');

  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `<span class="log-time">${timeStr}</span><span class="log-message">${message}</span>`;

  dom.eventLog.prepend(entry);

  // Limiter à 100 entrées
  while (dom.eventLog.children.length > 100) {
    dom.eventLog.removeChild(dom.eventLog.lastChild);
  }
}

/**
 * Efface le journal d'événements
 */
function clearLog() {
  dom.eventLog.innerHTML = '';
  addLog('Journal effacé.', 'info');
}

/* ============================================================
   LOCALSTORAGE — Persistance simple
   ============================================================ */

/**
 * Sauvegarde l'état courant dans localStorage
 */
function saveToLocalStorage() {
  try {
    const data = {
      values: state.values,
      chartLabels: state.chartLabels,
      chartData: {
        temperature: chartTempPressure?.data.datasets[0].data || [],
        pressure: chartTempPressure?.data.datasets[1].data || [],
        current: chartCurrentSpeed?.data.datasets[0].data || [],
        speed: chartCurrentSpeed?.data.datasets[1].data || []
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // localStorage indisponible — ignorer silencieusement
  }
}

/**
 * Restaure l'état depuis localStorage
 */
function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);

    if (data.values) {
      Object.keys(SENSORS).forEach(key => {
        if (data.values[key] !== undefined) {
          state.values[key] = clamp(data.values[key], SENSORS[key].min, SENSORS[key].max);
        }
      });
    }

    if (data.chartLabels && data.chartData) {
      state.chartLabels = data.chartLabels.slice(-CHART_MAX_POINTS);

      if (chartTempPressure) {
        chartTempPressure.data.labels = [...state.chartLabels];
        chartTempPressure.data.datasets[0].data = (data.chartData.temperature || []).slice(-CHART_MAX_POINTS);
        chartTempPressure.data.datasets[1].data = (data.chartData.pressure || []).slice(-CHART_MAX_POINTS);
        chartTempPressure.update('none');
      }

      if (chartCurrentSpeed) {
        chartCurrentSpeed.data.labels = [...state.chartLabels];
        chartCurrentSpeed.data.datasets[0].data = (data.chartData.current || []).slice(-CHART_MAX_POINTS);
        chartCurrentSpeed.data.datasets[1].data = (data.chartData.speed || []).slice(-CHART_MAX_POINTS);
        chartCurrentSpeed.update('none');
      }
    }

    updateUI();
    addLog('État restauré depuis la session précédente.', 'info');
  } catch (e) {
    // Données corrompues — ignorer
  }
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundValue(value, decimals) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function formatValue(value, decimals) {
  return decimals === 0 ? Math.round(value).toString() : value.toFixed(decimals);
}

/* ============================================================
   THÈME CLAIR / SOMBRE
   ============================================================ */

function getCurrentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-bs-theme', theme === 'light' ? 'light' : 'dark');
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeToggleButton();
  if (chartTempPressure && chartCurrentSpeed) {
    refreshChartsTheme();
  }
}

function toggleTheme() {
  applyTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
}

function updateThemeToggleButton() {
  const btn = document.getElementById('btnThemeToggle');
  if (!btn) return;

  const isDark = getCurrentTheme() === 'dark';
  const icon = isDark ? 'bi-sun-fill' : 'bi-moon-fill';
  const label = isDark ? 'Mode clair' : 'Mode sombre';

  if (btn.classList.contains('btn-theme-login')) {
    btn.innerHTML = `<i class="bi ${icon}"></i> ${label}`;
  } else {
    btn.innerHTML = `<i class="bi ${icon}"></i>`;
  }
  btn.title = isDark ? 'Activer le mode clair' : 'Activer le mode sombre';
}

function initThemeToggle() {
  updateThemeToggleButton();
  const btn = document.getElementById('btnThemeToggle');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = 'true';
    btn.addEventListener('click', toggleTheme);
  }
}

/* ============================================================
   FICHES D'INTERVENTION (localStorage)
   ============================================================ */

const INTERVENTION_STORAGE_KEY = 'motorSupervisionInterventions';
const INTERVENTION_CONTEXT_KEY = 'motorSupervisionInterventionContext';

const INTERVENTION_LABELS = {
  type: {
    corrective: 'Corrective',
    preventive: 'Préventive',
    alarme: 'Suite à alarme',
    inspection: 'Inspection'
  },
  priorite: {
    basse: 'Basse',
    normale: 'Normale',
    haute: 'Haute',
    urgente: 'Urgente'
  },
  statut: {
    ouverte: 'Ouverte',
    en_cours: 'En cours',
    cloturee: 'Clôturée'
  },
  resultat: {
    OK: 'Moteur OK',
    ALARME: 'Alarme persistante',
    A_SUIVRE: 'À compléter'
  }
};

/** Snapshot des mesures moteur depuis le dashboard */
function getCurrentMotorSnapshot() {
  const alarms = {};
  const alarmDetails = [];

  Object.keys(SENSORS).forEach(key => {
    const alarm = isAlarm(key, state.values[key]);
    alarms[key] = alarm;
    if (alarm) {
      const config = SENSORS[key];
      alarmDetails.push(`${config.label} : ${formatValue(state.values[key], config.decimals)} ${config.unit}`);
    }
  });

  const motorStatus = alarmDetails.length ? 'ALARME' : 'OK';

  return {
    values: { ...state.values },
    alarms,
    motorStatus,
    alarmDetails,
    capturedAt: new Date().toISOString()
  };
}

function saveInterventionContext(snapshot) {
  try {
    sessionStorage.setItem(INTERVENTION_CONTEXT_KEY, JSON.stringify(snapshot));
  } catch (e) { /* ignore */ }
}

function loadInterventionContext() {
  try {
    const raw = sessionStorage.getItem(INTERVENTION_CONTEXT_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return getMotorSnapshotFromStorage();
}

function getMotorSnapshotFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const values = data.values || {};
    const alarmDetails = [];
    const alarms = {};

    Object.keys(SENSORS).forEach(key => {
      if (values[key] === undefined) return;
      const alarm = isAlarm(key, values[key]);
      alarms[key] = alarm;
      if (alarm) {
        const config = SENSORS[key];
        alarmDetails.push(`${config.label} : ${formatValue(values[key], config.decimals)} ${config.unit}`);
      }
    });

    return {
      values,
      alarms,
      motorStatus: alarmDetails.length ? 'ALARME' : 'OK',
      alarmDetails,
      capturedAt: new Date().toISOString()
    };
  } catch (e) {
    return null;
  }
}

function loadInterventions() {
  try {
    const raw = localStorage.getItem(INTERVENTION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveInterventionsList(list) {
  localStorage.setItem(INTERVENTION_STORAGE_KEY, JSON.stringify(list));
}

function generateInterventionReference() {
  const list = loadInterventions();
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  const countToday = list.filter(i => i.reference && i.reference.includes(dateStr)).length + 1;
  return `INT-${dateStr}-${String(countToday).padStart(3, '0')}`;
}

function createEmptyIntervention(snapshot) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  let motif = '';
  let type = 'preventive';
  let priorite = 'normale';

  if (snapshot && snapshot.motorStatus === 'ALARME') {
    type = 'alarme';
    priorite = 'haute';
    motif = snapshot.alarmDetails?.length
      ? `Alarme détectée sur le moteur :\n${snapshot.alarmDetails.join('\n')}`
      : 'Intervention suite à alarme moteur.';
  }

  return {
    id: `int-${Date.now()}`,
    reference: generateInterventionReference(),
    date: dateStr,
    technicien: getLoggedInUser() || AUTH_CONFIG.username,
    equipement: 'Moteur asynchrone triphasé',
    type,
    priorite,
    statut: 'ouverte',
    mesures: snapshot?.values || {},
    motorStatus: snapshot?.motorStatus || 'OK',
    motif,
    actions: '',
    pieces: '',
    heureDebut: timeStr,
    heureFin: '',
    resultat: snapshot?.motorStatus === 'ALARME' ? 'A_SUIVRE' : 'OK',
    observations: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

/**
 * Initialise la page fiches d'intervention
 */
function initInterventionPage() {
  if (!requireAuth()) return;

  initAppNav('intervention');
  updateDateTimeHeader();

  const params = new URLSearchParams(window.location.search);
  const isNew = params.get('new') === '1';
  const editId = params.get('edit');

  bindInterventionEvents();
  updateInterventionStats();
  renderInterventionList();

  if (editId) {
    loadInterventionIntoForm(editId);
  } else if (isNew) {
    resetInterventionForm(loadInterventionContext());
  } else {
    resetInterventionForm(getMotorSnapshotFromStorage());
  }

  if (isNew || editId) {
    sessionStorage.removeItem(INTERVENTION_CONTEXT_KEY);
    window.history.replaceState({}, '', 'intervention.html');
  }
}

function bindInterventionEvents() {
  const form = document.getElementById('interventionForm');
  const btnNew = document.getElementById('btnNewIntervention');
  const btnReset = document.getElementById('btnResetForm');
  const btnCancel = document.getElementById('btnCancelEdit');
  const filter = document.getElementById('filterStatut');
  const btnClosePreview = document.getElementById('btnClosePreview');
  const btnPrint = document.getElementById('btnPrintFiche');

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    saveInterventionFromForm();
  });

  btnNew?.addEventListener('click', () => {
    resetInterventionForm(getMotorSnapshotFromStorage());
    document.getElementById('interventionFormCard')?.scrollIntoView({ behavior: 'smooth' });
  });

  btnReset?.addEventListener('click', () => {
    resetInterventionForm(getMotorSnapshotFromStorage());
  });

  btnCancel?.addEventListener('click', () => {
    resetInterventionForm(getMotorSnapshotFromStorage());
  });

  filter?.addEventListener('change', renderInterventionList);

  btnClosePreview?.addEventListener('click', () => {
    document.getElementById('printPreviewSection')?.classList.add('d-none');
  });

  btnPrint?.addEventListener('click', () => window.print());
}

function fillMeasureDisplay(snapshot) {
  const values = snapshot?.values || {};
  const set = (id, val, unit) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== undefined ? `${val} ${unit}` : '—';
  };

  set('measureTemperature', values.temperature !== undefined ? formatValue(values.temperature, 1) : undefined, '°C');
  set('measurePressure', values.pressure !== undefined ? formatValue(values.pressure, 2) : undefined, 'bar');
  set('measureCurrent', values.current !== undefined ? formatValue(values.current, 1) : undefined, 'A');
  set('measureSpeed', values.speed !== undefined ? formatValue(values.speed, 0) : undefined, 'tr/min');

  const badge = document.getElementById('measureMotorStatus');
  if (badge) {
    const status = snapshot?.motorStatus || '—';
    badge.textContent = `État moteur : ${status}`;
    badge.className = `badge ${status === 'ALARME' ? 'bg-danger' : status === 'OK' ? 'bg-success' : 'bg-secondary'}`;
  }
}

function resetInterventionForm(snapshot) {
  const data = createEmptyIntervention(snapshot);
  document.getElementById('interventionId').value = '';
  document.getElementById('formTitle').textContent = 'Nouvelle fiche d\'intervention';
  document.getElementById('btnCancelEdit')?.classList.add('d-none');

  populateInterventionForm(data);
  fillMeasureDisplay(snapshot);
}

function populateInterventionForm(data) {
  const fields = {
    fieldReference: data.reference,
    fieldDate: data.date,
    fieldTechnicien: data.technicien,
    fieldEquipement: data.equipement,
    fieldType: data.type,
    fieldPriorite: data.priorite,
    fieldStatut: data.statut,
    fieldMotif: data.motif,
    fieldActions: data.actions,
    fieldPieces: data.pieces,
    fieldHeureDebut: data.heureDebut,
    fieldHeureFin: data.heureFin,
    fieldResultat: data.resultat,
    fieldObservations: data.observations
  };

  Object.entries(fields).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  });

  fillMeasureDisplay({ values: data.mesures, motorStatus: data.motorStatus });
}

function loadInterventionIntoForm(id) {
  const item = loadInterventions().find(i => i.id === id);
  if (!item) return;

  document.getElementById('interventionId').value = item.id;
  document.getElementById('formTitle').textContent = `Modifier — ${item.reference}`;
  document.getElementById('btnCancelEdit')?.classList.remove('d-none');
  populateInterventionForm(item);
  document.getElementById('interventionFormCard')?.scrollIntoView({ behavior: 'smooth' });
}

function readInterventionFormData() {
  const id = document.getElementById('interventionId').value;
  const existing = id ? loadInterventions().find(i => i.id === id) : null;
  const snapshot = existing
    ? { values: existing.mesures, motorStatus: existing.motorStatus }
    : loadInterventionContext() || getMotorSnapshotFromStorage();

  return {
    id: id || `int-${Date.now()}`,
    reference: document.getElementById('fieldReference').value,
    date: document.getElementById('fieldDate').value,
    technicien: document.getElementById('fieldTechnicien').value.trim(),
    equipement: document.getElementById('fieldEquipement').value,
    type: document.getElementById('fieldType').value,
    priorite: document.getElementById('fieldPriorite').value,
    statut: document.getElementById('fieldStatut').value,
    mesures: snapshot?.values || existing?.mesures || {},
    motorStatus: snapshot?.motorStatus || existing?.motorStatus || 'OK',
    motif: document.getElementById('fieldMotif').value.trim(),
    actions: document.getElementById('fieldActions').value.trim(),
    pieces: document.getElementById('fieldPieces').value.trim(),
    heureDebut: document.getElementById('fieldHeureDebut').value,
    heureFin: document.getElementById('fieldHeureFin').value,
    resultat: document.getElementById('fieldResultat').value,
    observations: document.getElementById('fieldObservations').value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function saveInterventionFromForm() {
  const technicien = document.getElementById('fieldTechnicien').value.trim();
  const motif = document.getElementById('fieldMotif').value.trim();

  if (!technicien || !motif) {
    alert('Veuillez renseigner le technicien et le motif de l\'intervention.');
    return;
  }

  const data = readInterventionFormData();
  let list = loadInterventions();
  const idx = list.findIndex(i => i.id === data.id);

  if (idx >= 0) {
    list[idx] = data;
  } else {
    list.unshift(data);
  }

  saveInterventionsList(list);
  updateInterventionStats();
  renderInterventionList();
  resetInterventionForm(getMotorSnapshotFromStorage());

  alert(`Fiche ${data.reference} enregistrée avec succès.`);
}

function deleteIntervention(id) {
  if (!confirm('Supprimer définitivement cette fiche d\'intervention ?')) return;

  const list = loadInterventions().filter(i => i.id !== id);
  saveInterventionsList(list);
  updateInterventionStats();
  renderInterventionList();
}

function updateInterventionStats() {
  const list = loadInterventions();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('statOpen', list.filter(i => i.statut === 'ouverte').length);
  set('statProgress', list.filter(i => i.statut === 'en_cours').length);
  set('statClosed', list.filter(i => i.statut === 'cloturee').length);
}

function renderInterventionList() {
  const container = document.getElementById('interventionList');
  const empty = document.getElementById('interventionEmpty');
  if (!container) return;

  const filter = document.getElementById('filterStatut')?.value || 'all';
  let list = loadInterventions();

  if (filter !== 'all') {
    list = list.filter(i => i.statut === filter);
  }

  container.querySelectorAll('.intervention-item').forEach(el => el.remove());

  if (!list.length) {
    empty?.classList.remove('d-none');
    return;
  }

  empty?.classList.add('d-none');

  list.forEach(item => {
    const statutClass = `statut-${item.statut}`;
    const prioriteClass = item.priorite === 'urgente' || item.priorite === 'haute' ? 'priorite-haute' : '';

    const el = document.createElement('div');
    el.className = `intervention-item ${statutClass} ${prioriteClass}`;
    el.innerHTML = `
      <div class="intervention-item-main">
        <div class="intervention-item-ref">${item.reference}</div>
        <div class="intervention-item-meta">
          <span><i class="bi bi-calendar3"></i> ${item.date}</span>
          <span><i class="bi bi-person"></i> ${item.technicien}</span>
          <span class="badge intervention-badge-type">${INTERVENTION_LABELS.type[item.type] || item.type}</span>
          <span class="badge intervention-badge-statut statut-badge-${item.statut}">${INTERVENTION_LABELS.statut[item.statut]}</span>
        </div>
        <div class="intervention-item-motif">${item.motif.substring(0, 120)}${item.motif.length > 120 ? '…' : ''}</div>
      </div>
      <div class="intervention-item-actions">
        <button type="button" class="btn btn-sm btn-outline-primary btn-view-intervention" data-id="${item.id}" title="Aperçu">
          <i class="bi bi-eye"></i>
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary btn-edit-intervention" data-id="${item.id}" title="Modifier">
          <i class="bi bi-pencil"></i>
        </button>
        <button type="button" class="btn btn-sm btn-outline-danger btn-delete-intervention" data-id="${item.id}" title="Supprimer">
          <i class="bi bi-trash"></i>
        </button>
      </div>`;

    container.appendChild(el);
  });

  container.querySelectorAll('.btn-edit-intervention').forEach(btn => {
    btn.addEventListener('click', () => loadInterventionIntoForm(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete-intervention').forEach(btn => {
    btn.addEventListener('click', () => deleteIntervention(btn.dataset.id));
  });

  container.querySelectorAll('.btn-view-intervention').forEach(btn => {
    btn.addEventListener('click', () => showInterventionPreview(btn.dataset.id));
  });
}

function showInterventionPreview(id) {
  const item = loadInterventions().find(i => i.id === id);
  if (!item) return;

  const section = document.getElementById('printPreviewSection');
  const preview = document.getElementById('printPreview');
  if (!section || !preview) return;

  const m = item.mesures || {};

  preview.innerHTML = `
    <div class="card-body intervention-print-body">
      <div class="print-header">
        <div>
          <h2>FICHE D'INTERVENTION</h2>
          <p class="print-subtitle">Moteur asynchrone triphasé — Maintenance industrielle</p>
        </div>
        <div class="print-ref-box">
          <strong>${item.reference}</strong>
          <span>${item.date}</span>
        </div>
      </div>

      <table class="print-table">
        <tr><th>Technicien</th><td>${item.technicien}</td><th>Type</th><td>${INTERVENTION_LABELS.type[item.type]}</td></tr>
        <tr><th>Équipement</th><td colspan="3">${item.equipement}</td></tr>
        <tr><th>Priorité</th><td>${INTERVENTION_LABELS.priorite[item.priorite]}</td><th>Statut</th><td>${INTERVENTION_LABELS.statut[item.statut]}</td></tr>
        <tr><th>Heure début</th><td>${item.heureDebut || '—'}</td><th>Heure fin</th><td>${item.heureFin || '—'}</td></tr>
      </table>

      <h3 class="print-section-title">Mesures moteur enregistrées</h3>
      <table class="print-table">
        <tr>
          <th>Température</th><td>${m.temperature ?? '—'} °C</td>
          <th>Pression</th><td>${m.pressure ?? '—'} bar</td>
        </tr>
        <tr>
          <th>Courant</th><td>${m.current ?? '—'} A</td>
          <th>Vitesse asynchrone</th><td>${m.speed ?? '—'} tr/min</td>
        </tr>
        <tr><th>État moteur</th><td colspan="3">${item.motorStatus}</td></tr>
      </table>

      <h3 class="print-section-title">Motif / Description</h3>
      <p class="print-text">${item.motif.replace(/\n/g, '<br>')}</p>

      <h3 class="print-section-title">Actions réalisées</h3>
      <p class="print-text">${item.actions ? item.actions.replace(/\n/g, '<br>') : '—'}</p>

      <h3 class="print-section-title">Pièces remplacées</h3>
      <p class="print-text">${item.pieces || '—'}</p>

      <h3 class="print-section-title">Résultat &amp; observations</h3>
      <table class="print-table">
        <tr><th>Résultat</th><td>${INTERVENTION_LABELS.resultat[item.resultat] || item.resultat}</td></tr>
        <tr><th>Observations</th><td>${item.observations || '—'}</td></tr>
      </table>

      <div class="print-signatures">
        <div class="print-signature-box">
          <span>Signature technicien</span>
          <div class="print-signature-line"></div>
          <small>${item.technicien}</small>
        </div>
        <div class="print-signature-box">
          <span>Validation responsable</span>
          <div class="print-signature-line"></div>
          <small>Abdel KAWIL — Administrateur</small>
        </div>
      </div>

      <p class="print-footer-note">Document généré le ${new Date().toLocaleString('fr-FR')} — Supervision moteur asynchrone</p>
    </div>`;

  section.classList.remove('d-none');
  section.scrollIntoView({ behavior: 'smooth' });
}

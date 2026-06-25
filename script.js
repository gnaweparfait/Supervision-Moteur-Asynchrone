/**
 * ============================================================
 * MOTEUR ASYNCHRONE TRIPHASÉ À CAGE D'ÉCUREUIL — Script principal
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
    department: "MOTEUR ASYNCHRONE TRIPHASÉ À CAGE D'ÉCUREUIL",
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
  stopPersistentAlarm();
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

/* ============================================================
   SEUILS DE FONCTIONNEMENT — Structure centralisée
   Chaque paramètre possède 3 états : Normal (vert), Dégradation (jaune), Critique (rouge)
   ============================================================ */

/**
 * Seuils officiels par paramètre clé (affichés sur les courbes individuelles)
 * Température stator : 0-55°C Normal | 55-60°C Dégradation | >60°C Critique
 * Vibrations        : 0-2 mm/s Normal | 2-4 mm/s Dégradation | >4 mm/s Critique
 * Courant triphasé  : 0-18 A Normal | 18-25 A Dégradation | >25 A Critique
 * Tension           : 380-420 V Normal | 340-380/420-450 V Dégradation | <340/>450 V Critique
 * Pression lubr.    : 2.5-4 bar Normal | 1.5-2.5 bar Dégradation | <1.5 bar Critique
 * Rendement         : >90% Normal | 75-90% Dégradation | <75% Critique
 * Vitesse rotation  : 1400-1500 tr/min Normal | 1200-1400 tr/min Dégradation | <1200 tr/min Critique
 */
const PARAM_THRESHOLDS = {
  temperature_stator:  { normalMin: 0,    normalMax: 55,   warnMin: 55,   warnMax: 60,   critMin: 60,  critMax: 100, unit: '°C',     label: 'Température stator' },
  vibration:           { normalMin: 0,    normalMax: 2,    warnMin: 2,    warnMax: 4,    critMin: 4,   critMax: 15,  unit: 'mm/s',   label: 'Vibrations' },
  current:             { normalMin: 0,    normalMax: 18,   warnMin: 18,   warnMax: 25,   critMin: 25,  critMax: 35,  unit: 'A',      label: 'Courant triphasé' },
  voltage:             { normalMin: 380,  normalMax: 420,  warnMin: 340,  warnMax: 450,  critMin: 0,   critMax: 500, unit: 'V',      label: 'Tension' },
  pressure:            { normalMin: 2.5,  normalMax: 4,    warnMin: 1.5,  warnMax: 2.5,  critMin: 0,   critMax: 1.5, unit: 'bar',    label: 'Pression lubrification' },
  efficiency:          { normalMin: 90,   normalMax: 100,  warnMin: 75,   warnMax: 90,   critMin: 0,   critMax: 75,  unit: '%',      label: 'Rendement' },
  speed:               { normalMin: 1400, normalMax: 1500, warnMin: 1200, warnMax: 1400, critMin: 0,   critMax: 1200, unit: 'tr/min', label: 'Vitesse de rotation' }
};

/* --- Configuration des composants moteur --- */
const COMPONENTS = {
  stator: {
    label: 'Stator',
    icon: 'bi-magnet',
    weight: 1.2,
    diagramComponent: 'stator',
    zones: ['Carcasse du stator', 'Circuit magnétique'],
    params: {
      temperature: {
        label: 'Température stator', unit: '°C', default: 28, min: 0, max: 100, step: 0.1, decimals: 1,
        // Normal: 0-55°C | Dégradation: 55-60°C | Critique: >60°C
        threshold: { type: 'max', warning: 55, critical: 60 },
        sim: { nominal: 28, noise: 0.5, drift: 0.03 },
        faultWarning: 'Échauffement stator', faultCritical: 'Surchauffe du stator',
        element: 'STATOR'
      },
      vibration: {
        label: 'Vibrations stator', unit: 'mm/s', default: 1.2, min: 0, max: 15, step: 0.1, decimals: 1,
        // Normal: 0-2 mm/s | Dégradation: 2-4 mm/s | Critique: >4 mm/s
        threshold: { type: 'max', warning: 2, critical: 4 },
        sim: { nominal: 1.2, noise: 0.12, drift: 0.04 },
        faultWarning: 'Vibrations modérées', faultCritical: 'Vibration excessive',
        element: 'STATOR'
      },
      current: {
        label: 'Courant triphasé', unit: 'A', default: 12, min: 0, max: 35, step: 0.1, decimals: 1,
        // Normal: 0-18 A | Dégradation: 18-25 A | Critique: >25 A
        threshold: { type: 'max', warning: 18, critical: 25 },
        sim: { nominal: 12, noise: 0.3, drift: 0.02 },
        faultWarning: 'Courant élevé', faultCritical: 'Surintensité — Déséquilibre électrique',
        element: 'STATOR'
      },
      voltage: {
        label: 'Tension alimentation', unit: 'V', default: 400, min: 280, max: 500, step: 1, decimals: 0,
        // Normal: 380-420 V | Dégradation: 340-380/420-450 V | Critique: <340 ou >450 V
        threshold: { type: 'range', warningMin: 340, warningMax: 450, criticalMin: 340, criticalMax: 450 },
        sim: { nominal: 400, noise: 1.5, drift: 0.5 },
        faultWarning: 'Tension hors plage nominale', faultCritical: 'Tension critique — Risque de défaillance',
        element: 'STATOR'
      }
    }
  },
  windings: {
    label: 'Enroulements',
    icon: 'bi-lightning-charge',
    weight: 1.3,
    diagramComponent: 'stator',
    zones: ['Bobinages internes'],
    params: {
      temperature: {
        label: 'Température enroulements', unit: '°C', default: 35, min: 0, max: 150, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 55, critical: 60 },
        sim: { nominal: 35, noise: 0.6, drift: 0.04 },
        faultWarning: 'Échauffement enroulements', faultCritical: 'Surchauffe des enroulements',
        element: 'ENROULEMENTS'
      },
      insulation: {
        label: 'Résistance d\'isolement', unit: 'MΩ', default: 500, min: 0, max: 1000, step: 1, decimals: 0,
        threshold: { type: 'min', warning: 100, critical: 50 },
        sim: { nominal: 500, noise: 5, drift: 1 },
        faultWarning: 'Isolement en baisse', faultCritical: 'Dégradation de l\'isolant',
        element: 'ENROULEMENTS'
      },
      current: {
        label: 'Courant électrique', unit: 'A', default: 12, min: 0, max: 35, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 18, critical: 25 },
        sim: { nominal: 12, noise: 0.3, drift: 0.02 },
        faultWarning: 'Courant élevé', faultCritical: 'Court-circuit partiel',
        element: 'ENROULEMENTS'
      }
    }
  },
  rotor: {
    label: 'Rotor',
    icon: 'bi-arrow-repeat',
    weight: 1.1,
    diagramComponent: 'rotor',
    zones: ['Cage rotorique', 'Axe du rotor'],
    params: {
      temperature: {
        label: 'Température rotor', unit: '°C', default: 30, min: 0, max: 110, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 55, critical: 60 },
        sim: { nominal: 30, noise: 0.4, drift: 0.03 },
        faultWarning: 'Échauffement rotor', faultCritical: 'Échauffement anormal du rotor',
        element: 'ROTOR'
      },
      speed: {
        label: 'Vitesse asynchrone', unit: 'tr/min', default: 1450, min: 800, max: 1800, step: 1, decimals: 0,
        // Normal: 1400-1500 tr/min | Dégradation: 1200-1400 tr/min | Critique: <1200 tr/min
        threshold: { type: 'range', warningMin: 1200, warningMax: 1500, criticalMin: 1200, criticalMax: 1500 },
        sim: { nominal: 1450, noise: 6, drift: 1.5 },
        faultWarning: 'Vitesse hors plage nominale', faultCritical: 'Défaut de rotation — Vitesse critique',
        element: 'ROTOR'
      },
      vibration: {
        label: 'Vibrations rotor', unit: 'mm/s', default: 1.0, min: 0, max: 15, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 2, critical: 4 },
        sim: { nominal: 1.0, noise: 0.1, drift: 0.03 },
        faultWarning: 'Vibrations rotor modérées', faultCritical: 'Déséquilibre mécanique rotor',
        element: 'ROTOR'
      }
    }
  },
  shaft: {
    label: 'Arbre de transmission',
    icon: 'bi-arrows-collapse',
    weight: 1.0,
    diagramComponent: 'shaft',
    zones: ['Axe de transmission'],
    params: {
      vibration: {
        label: 'Vibration arbre', unit: 'mm/s', default: 0.9, min: 0, max: 12, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 2, critical: 4 },
        sim: { nominal: 0.9, noise: 0.08, drift: 0.02 },
        faultWarning: 'Vibrations arbre', faultCritical: 'Déséquilibre / Fatigue mécanique arbre',
        element: 'ARBRE'
      },
      speed: {
        label: 'Vitesse rotation arbre', unit: 'tr/min', default: 1450, min: 800, max: 1800, step: 1, decimals: 0,
        threshold: { type: 'range', warningMin: 1200, warningMax: 1500, criticalMin: 1200, criticalMax: 1500 },
        sim: { nominal: 1450, noise: 5, drift: 1 },
        faultWarning: 'Vitesse anormale arbre', faultCritical: 'Défaut transmission arbre',
        element: 'ARBRE'
      },
      alignment: {
        label: 'Alignement', unit: 'mm', default: 0.05, min: 0, max: 2, step: 0.01, decimals: 2,
        threshold: { type: 'max', warning: 0.3, critical: 0.6 },
        sim: { nominal: 0.05, noise: 0.01, drift: 0.004 },
        faultWarning: 'Alignement dégradé', faultCritical: 'Désalignement critique',
        element: 'ARBRE'
      }
    }
  },
  bearings: {
    label: 'Paliers / Roulements',
    icon: 'bi-circle',
    weight: 1.15,
    diagramComponent: 'bearings',
    zones: ['Roulements avant et arrière'],
    params: {
      temperature: {
        label: 'Température paliers', unit: '°C', default: 28, min: 0, max: 100, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 55, critical: 60 },
        sim: { nominal: 28, noise: 0.35, drift: 0.02 },
        faultWarning: 'Échauffement paliers', faultCritical: 'Surchauffe paliers — Lubrification insuffisante',
        element: 'ROULEMENTS'
      },
      vibration: {
        label: 'Vibrations paliers', unit: 'mm/s', default: 0.8, min: 0, max: 12, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 2, critical: 4 },
        sim: { nominal: 0.8, noise: 0.07, drift: 0.02 },
        faultWarning: 'Vibrations paliers', faultCritical: 'Vibration excessive — Usure roulements',
        element: 'ROULEMENTS'
      },
      wear: {
        label: 'Niveau d\'usure', unit: '%', default: 12, min: 0, max: 100, step: 1, decimals: 0,
        threshold: { type: 'max', warning: 60, critical: 80 },
        sim: { nominal: 12, noise: 0.4, drift: 0.08 },
        faultWarning: 'Usure modérée roulements', faultCritical: 'Usure critique — Risque de blocage',
        element: 'ROULEMENTS'
      },
      pressure: {
        label: 'Pression lubrification', unit: 'bar', default: 3.2, min: 0, max: 6, step: 0.01, decimals: 2,
        // Normal: 2.5-4 bar | Dégradation: 1.5-2.5 bar | Critique: <1.5 bar
        threshold: { type: 'range', warningMin: 1.5, warningMax: 4, criticalMin: 1.5, criticalMax: 6 },
        sim: { nominal: 3.2, noise: 0.03, drift: 0.007 },
        faultWarning: 'Pression lubrification basse', faultCritical: 'Pression insuffisante — SYSTÈME DE LUBRIFICATION',
        element: 'SYSTÈME DE LUBRIFICATION'
      }
    }
  },
  ventilation: {
    label: 'Ventilation',
    icon: 'bi-fan',
    weight: 0.9,
    optional: true,
    diagramComponent: 'ventilation',
    zones: ['Système de refroidissement'],
    params: {
      coolingTemp: {
        label: 'Temp. refroidissement', unit: '°C', default: 28, min: 15, max: 80, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 55, critical: 60 },
        sim: { nominal: 28, noise: 0.4, drift: 0.03 },
        faultWarning: 'Refroidissement insuffisant', faultCritical: 'Défaillance système refroidissement',
        element: 'VENTILATION'
      },
      fanSpeed: {
        label: 'Vitesse ventilateur', unit: 'tr/min', default: 2800, min: 500, max: 3500, step: 10, decimals: 0,
        threshold: { type: 'range', warningMin: 2200, warningMax: 3200, criticalMin: 1800, criticalMax: 3400 },
        sim: { nominal: 2800, noise: 28, drift: 8 },
        faultWarning: 'Ventilateur hors plage', faultCritical: 'Défaillance ventilateur',
        element: 'VENTILATION'
      },
      airFlow: {
        label: 'Débit d\'air', unit: 'm³/h', default: 850, min: 0, max: 1500, step: 5, decimals: 0,
        threshold: { type: 'min', warning: 600, critical: 400 },
        sim: { nominal: 850, noise: 12, drift: 4 },
        faultWarning: 'Débit d\'air réduit', faultCritical: 'Ventilation insuffisante — Risque surchauffe',
        element: 'VENTILATION'
      }
    }
  }
};

const STATUS_LABELS = { normal: 'Normal', warning: 'Dégradation', critical: 'Critique' };
const HEALTH_LABELS = [
  { min: 90, label: 'Excellent' },
  { min: 70, label: 'Bon' },
  { min: 50, label: 'Moyen' },
  { min: 0, label: 'Critique' }
];

/* --- Constantes globales --- */
const SIMULATION_INTERVAL = 800;
const CHART_MAX_POINTS = 60;
const STORAGE_KEY = 'motorSupervisionState';
const THEME_STORAGE_KEY = 'motorSupervisionTheme';

/* --- État de l'application --- */
const state = {
  values: {},
  componentHealth: {},
  globalHealth: 100,
  operationLevel: 100,
  isRunning: false,
  manualMode: false,
  ventilationPresent: true,
  intervalId: null,
  previousAlarms: {},
  chartLabels: [],
  simPhase: 0,
  alarmSoundActive: false,
  alarmHistory: []  // Historique des alarmes [{date, heure, element, defaut, valeur, niveau}]
};

/* --- Références DOM --- */
const dom = {};

/* --- Graphiques Chart.js --- */
let chartTemperatures = null;
let chartVibrations = null;
let chartHealth = null;
let componentCharts = {};
let alarmAudioContext = null;
let alarmSoundInterval = null;

/* --- Graphiques individuels par paramètre --- */
let chartIndivTemp = null;
let chartIndivVib = null;
let chartIndivCurrent = null;
let chartIndivVoltage = null;
let chartIndivPressure = null;
let chartIndivSpeed = null;
let chartIndivEfficiency = null;

const OPERATION_REDUCTION_CRITICAL = 30;
const OPERATION_REDUCTION_WARNING = 8;
const GLOBAL_OPERATION_REDUCTION_CRITICAL = 30;
const GLOBAL_OPERATION_REDUCTION_WARNING = 5;
const COMPONENT_CHART_COLORS = ['#f85149', '#388bfd', '#39d353', '#d29922', '#a371f7'];

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
  initComponentValues();
  renderComponentCards();
  renderManualControls();
  initComponentCharts();
  initCharts();
  initIndividualCharts();
  bindEvents();
  updateVentilationVisibility();
  updateDateTime();
  setInterval(updateDateTime, 1000);
  loadFromLocalStorage();
  updateUI();
  renderAlarmHistoryTable();

  initAppNav('dashboard');
  updateDateTimeHeader();

  // Bouton effacer historique alarmes
  const btnClearAlarmHistory = document.getElementById('btnClearAlarmHistory');
  if (btnClearAlarmHistory) {
    btnClearAlarmHistory.addEventListener('click', () => {
      state.alarmHistory = [];
      renderAlarmHistoryTable();
      addLog('Historique des alarmes effacé.', 'info');
    });
  }

  addLog(`Connexion réussie — Bienvenue, ${getLoggedInUser() || AUTH_CONFIG.username}.`, 'ok');
  addLog('Système de supervision initialisé. Démarrez la simulation (mode auto) ou activez le mode manuel.', 'info');
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
  dom.healthStateLabel = document.getElementById('healthStateLabel');
  dom.globalHealthBar = document.getElementById('globalHealthBar');
  dom.globalHealthValue = document.getElementById('globalHealthValue');
  dom.operationLevelBar = document.getElementById('operationLevelBar');
  dom.operationLevelValue = document.getElementById('operationLevelValue');
  dom.simulationBadge = document.getElementById('simulationBadge');
  dom.btnStart = document.getElementById('btnStart');
  dom.btnStop = document.getElementById('btnStop');
  dom.btnReset = document.getElementById('btnReset');
  dom.btnClearLog = document.getElementById('btnClearLog');
  dom.eventLog = document.getElementById('eventLog');
  dom.currentDateTime = document.getElementById('currentDateTime');
  dom.manualModeToggle = document.getElementById('manualModeToggle');
  dom.modeLabel = document.getElementById('modeLabel');
  dom.activeAlarmsList = document.getElementById('activeAlarmsList');
  dom.alarmCountBadge = document.getElementById('alarmCountBadge');
  dom.alarmPanel = document.getElementById('alarmPanel');
  dom.componentCards = document.getElementById('componentCards');
  dom.kpiAvgTemp = document.getElementById('kpiAvgTemp');
  dom.kpiAvgVibration = document.getElementById('kpiAvgVibration');
  dom.kpiEfficiency = document.getElementById('kpiEfficiency');
  dom.kpiCurrent = document.getElementById('kpiCurrent');
  dom.kpiVoltage = document.getElementById('kpiVoltage');
  dom.kpiSpeed = document.getElementById('kpiSpeed');
  dom.kpiPressure = document.getElementById('kpiPressure');
  dom.ventilationToggle = document.getElementById('ventilationToggle');
  dom.ventilationCardWrap = document.getElementById('ventilationCardWrap');
  dom.ventilationDiagramParts = document.querySelectorAll('[data-component="ventilation"]');
  dom.fanBlades = document.getElementById('fanBlades');
}

function initComponentValues() {
  Object.keys(COMPONENTS).forEach(compId => {
    state.values[compId] = {};
    state.componentHealth[compId] = 100;
    state.previousAlarms[compId] = {};
    Object.keys(COMPONENTS[compId].params).forEach(paramId => {
      state.values[compId][paramId] = COMPONENTS[compId].params[paramId].default;
      state.previousAlarms[compId][paramId] = false;
    });
  });
}

function getActiveComponentIds() {
  return Object.keys(COMPONENTS).filter(compId => {
    if (COMPONENTS[compId].optional && !state.ventilationPresent) return false;
    return true;
  });
}

function renderComponentCards() {
  if (!dom.componentCards) return;
  dom.componentCards.innerHTML = '';

  Object.entries(COMPONENTS).forEach(([compId, comp]) => {
    const col = document.createElement('div');
    col.className = 'col-xl-4 col-lg-6';
    col.id = comp.optional ? 'ventilationCardWrap' : '';
    col.dataset.componentWrap = compId;
    col.innerHTML = `
      <div class="card component-card status-normal" id="card-${compId}" data-component="${compId}">
        <div class="card-header component-header">
          <i class="bi ${comp.icon}"></i>
          <span>${comp.label}</span>
          <span class="component-status-badge" id="status-badge-${compId}">Normal</span>
        </div>
        <div class="card-body">
          <div class="component-health-row">
            <span class="component-health-label">Bon état</span>
            <div class="health-bar-wrap sm">
              <div class="health-bar" id="health-bar-${compId}" style="width:100%"></div>
            </div>
            <span class="component-health-value" id="health-value-${compId}">100 %</span>
          </div>
          <div class="component-operation">
            <span>Fonctionnement : <strong id="operation-${compId}">100 %</strong></span>
          </div>
          <div class="component-zones"><small>${comp.zones.join(' · ')}</small></div>
          <div class="component-params" id="params-${compId}"></div>
          <div class="component-history">
            <small class="component-history-label"><i class="bi bi-graph-up"></i> Évolution des mesures</small>
            <div class="component-chart-wrap">
              <canvas id="comp-chart-${compId}"></canvas>
            </div>
          </div>
        </div>
      </div>`;
    dom.componentCards.appendChild(col);

    const paramsEl = col.querySelector(`#params-${compId}`);
    Object.entries(comp.params).forEach(([paramId, param]) => {
      const row = document.createElement('div');
      row.className = 'component-param-row';
      row.innerHTML = `
        <span class="param-label">${param.label}</span>
        <span class="param-value" id="val-${compId}-${paramId}">—</span>
        <span class="param-status-dot normal" id="dot-${compId}-${paramId}"></span>`;
      paramsEl.appendChild(row);
    });
  });

  dom.diagramParts = document.querySelectorAll('.diagram-part');
  dom.ventilationCardWrap = document.getElementById('ventilationCardWrap');
  dom.ventilationDiagramParts = document.querySelectorAll('[data-component="ventilation"]');
}

function updateVentilationVisibility() {
  const show = state.ventilationPresent;
  if (dom.ventilationCardWrap) {
    dom.ventilationCardWrap.classList.toggle('d-none', !show);
  }
  dom.ventilationDiagramParts?.forEach(el => el.classList.toggle('d-none', !show));
}

function renderManualControls() {
  const accordion = document.getElementById('manualControlsAccordion');
  if (!accordion) return;
  accordion.innerHTML = '';

  Object.entries(COMPONENTS).forEach(([compId, comp], idx) => {
    const item = document.createElement('div');
    item.className = 'accordion-item manual-accordion-item';
    item.dataset.componentManual = compId;
    item.innerHTML = `
      <h2 class="accordion-header">
        <button class="accordion-button ${idx > 0 ? 'collapsed' : ''}" type="button"
          data-bs-toggle="collapse" data-bs-target="#manual-${compId}">
          <i class="bi ${comp.icon} me-2"></i> ${comp.label}
        </button>
      </h2>
      <div id="manual-${compId}" class="accordion-collapse collapse ${idx === 0 ? 'show' : ''}"
        data-bs-parent="#manualControlsAccordion">
        <div class="accordion-body">
          <div class="row g-3" id="controls-${compId}"></div>
        </div>
      </div>`;
    accordion.appendChild(item);

    const controlsEl = item.querySelector(`#controls-${compId}`);
    Object.entries(comp.params).forEach(([paramId, param]) => {
      const col = document.createElement('div');
      col.className = 'col-md-6';
      col.innerHTML = `
        <div class="control-item">
          <div class="control-item-header">
            <span>${param.label}</span>
            <span class="control-live-value" id="ctrl-val-${compId}-${paramId}">—</span>
          </div>
          <input type="range" class="form-range manual-slider"
            id="slider-${compId}-${paramId}"
            data-comp="${compId}" data-param="${paramId}"
            min="${param.min}" max="${param.max}" step="${param.step}" value="${param.default}">
          <div class="d-flex align-items-center gap-2 mt-1">
            <button type="button" class="btn btn-sm btn-outline-secondary btn-step-manual"
              data-comp="${compId}" data-param="${paramId}" data-dir="-1">−</button>
            <input type="number" class="form-control form-control-sm sensor-input manual-input"
              id="input-${compId}-${paramId}"
              data-comp="${compId}" data-param="${paramId}"
              min="${param.min}" max="${param.max}" step="${param.step}" value="${param.default}">
            <span class="input-group-text param-unit">${param.unit}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary btn-step-manual"
              data-comp="${compId}" data-param="${paramId}" data-dir="1">+</button>
          </div>
        </div>`;
      controlsEl.appendChild(col);
    });
  });
}

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

  if (dom.manualModeToggle) {
    dom.manualModeToggle.addEventListener('change', () => {
      state.manualMode = dom.manualModeToggle.checked;
      if (dom.modeLabel) {
        dom.modeLabel.textContent = state.manualMode ? 'Mode Manuel' : 'Mode Auto';
      }
      addLog(
        state.manualMode
          ? 'Mode manuel activé — température, vibration, pression, courant, tension, vitesse modifiables.'
          : 'Mode automatique — données capteurs simulées en temps réel.',
        state.manualMode ? 'warning' : 'info'
      );
    });
  }

  if (dom.ventilationToggle) {
    dom.ventilationToggle.checked = state.ventilationPresent;
    dom.ventilationToggle.addEventListener('change', () => {
      state.ventilationPresent = dom.ventilationToggle.checked;
      updateVentilationVisibility();
      updateUI();
      addLog(
        state.ventilationPresent
          ? 'Système de ventilation activé sur ce moteur.'
          : 'Ventilation désactivée — composant exclu de la supervision.',
        'info'
      );
      saveToLocalStorage();
    });
  }

  document.addEventListener('input', (e) => {
    if (e.target.classList.contains('manual-slider')) {
      const compId = e.target.dataset.comp;
      const paramId = e.target.dataset.param;
      if (compId && paramId) setParamValue(compId, paramId, parseFloat(e.target.value), true);
    }
    if (e.target.classList.contains('manual-input')) {
      const compId = e.target.dataset.comp;
      const paramId = e.target.dataset.param;
      const val = parseFloat(e.target.value);
      if (compId && paramId && !isNaN(val)) setParamValue(compId, paramId, val, true);
    }
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-step-manual');
    if (!btn) return;
    const { comp, param, dir } = btn.dataset;
    const config = COMPONENTS[comp].params[param];
    const mult = parseInt(dir, 10) > 0 ? 1 : -1;
    const step = config.step * mult * (param === 'speed' || param === 'fanSpeed' ? 10 : 1);
    setParamValue(comp, param, state.values[comp][param] + step, true);
  });

  dom.diagramParts?.forEach(part => {
    part.addEventListener('click', () => {
      const compId = part.dataset.component;
      document.getElementById(`card-${compId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
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
  if (dom.modeLabel) dom.modeLabel.textContent = 'Mode Auto';

  initComponentValues();
  state.chartLabels = [];
  stopPersistentAlarm();

  [chartTemperatures, chartVibrations, chartHealth,
   chartIndivTemp, chartIndivVib, chartIndivCurrent,
   chartIndivVoltage, chartIndivPressure, chartIndivSpeed, chartIndivEfficiency
  ].forEach(chart => {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets.forEach(ds => { ds.data = []; });
    chart.update('none');
  });

  Object.values(componentCharts).forEach(chart => {
    chart.data.labels = [];
    chart.data.datasets.forEach(ds => { ds.data = []; });
    chart.update('none');
  });

  updateUI();
  addLog('Valeurs réinitialisées — tous les composants à 100 %.', 'info');
  saveToLocalStorage();
}

function simulationTick() {
  state.simPhase += 0.15;

  if (!state.manualMode) {
    Object.entries(COMPONENTS).forEach(([compId, comp], compIdx) => {
      Object.entries(comp.params).forEach(([paramId, param], paramIdx) => {
        const sim = param.sim;
        const current = state.values[compId][paramId];
        const noise = (Math.random() - 0.5) * 2 * sim.noise;
        const oscillation = Math.sin(state.simPhase + compIdx * 1.1 + paramIdx * 0.7) * sim.drift;
        const correction = (sim.nominal - current) * 0.02;
        let newValue = current + noise + oscillation + correction;
        newValue = clamp(newValue, param.min, param.max);
        state.values[compId][paramId] = roundValue(newValue, param.decimals);
      });
    });
  }

  updateUI();
  appendChartData();
  saveToLocalStorage();
}

function setParamValue(compId, paramId, value, fromUser = false) {
  const param = COMPONENTS[compId].params[paramId];
  value = clamp(value, param.min, param.max);
  value = roundValue(value, param.decimals);
  state.values[compId][paramId] = value;

  if (fromUser && !state.manualMode) {
    state.manualMode = true;
    if (dom.manualModeToggle) dom.manualModeToggle.checked = true;
    if (dom.modeLabel) dom.modeLabel.textContent = 'Mode Manuel';
  }

  updateUI();
  if (state.isRunning || fromUser) {
    appendChartData();
  }
  saveToLocalStorage();
}

function evaluateParamStatus(param, value) {
  const t = param.threshold;
  if (t.type === 'min') {
    if (value <= t.critical) return 'critical';
    if (value <= t.warning) return 'warning';
    return 'normal';
  }
  if (t.type === 'range') {
    if (value < t.criticalMin || value > t.criticalMax) return 'critical';
    if (value < t.warningMin || value > t.warningMax) return 'warning';
    return 'normal';
  }
  if (value >= t.critical) return 'critical';
  if (value >= t.warning) return 'warning';
  return 'normal';
}

function getParamFaultMessage(param, status) {
  if (status === 'critical') return param.faultCritical;
  if (status === 'warning') return param.faultWarning;
  return null;
}

function computeComponentState(compId) {
  const comp = COMPONENTS[compId];
  let health = 100;
  let worstStatus = 'normal';
  const paramStates = {};
  let warningCount = 0;
  let criticalCount = 0;

  Object.entries(comp.params).forEach(([paramId, param]) => {
    const value = state.values[compId][paramId];
    const status = evaluateParamStatus(param, value);
    paramStates[paramId] = { value, status, param };

    if (status === 'warning') { health -= 12; warningCount++; }
    if (status === 'critical') { health -= 30; criticalCount++; }
    if (status === 'critical') worstStatus = 'critical';
    else if (status === 'warning' && worstStatus !== 'critical') worstStatus = 'warning';
  });

  health = Math.max(0, Math.min(100, health));
  const operation = Math.max(25, 100 - criticalCount * OPERATION_REDUCTION_CRITICAL - warningCount * OPERATION_REDUCTION_WARNING);

  return { health, status: worstStatus, paramStates, operation, warningCount, criticalCount };
}

function computeGlobalState() {
  let totalWeight = 0;
  let weightedHealth = 0;
  let totalWarnings = 0;
  let totalCriticals = 0;
  let worstGlobal = 'normal';
  const componentStates = {};

  getActiveComponentIds().forEach(compId => {
    const cs = computeComponentState(compId);
    componentStates[compId] = cs;
    const w = COMPONENTS[compId].weight;
    totalWeight += w;
    weightedHealth += cs.health * w;
    totalWarnings += cs.warningCount;
    totalCriticals += cs.criticalCount;
    if (cs.status === 'critical') worstGlobal = 'critical';
    else if (cs.status === 'warning' && worstGlobal !== 'critical') worstGlobal = 'warning';
  });

  const globalHealth = totalWeight ? Math.round(weightedHealth / totalWeight) : 100;
  const operationLevel = Math.max(25, 100 - totalCriticals * GLOBAL_OPERATION_REDUCTION_CRITICAL - totalWarnings * GLOBAL_OPERATION_REDUCTION_WARNING);

  return { globalHealth, operationLevel, worstGlobal, componentStates, totalWarnings, totalCriticals };
}

function getHealthLabel(health) {
  for (const h of HEALTH_LABELS) {
    if (health >= h.min) return h.label;
  }
  return 'Critique';
}

function getAvgTemperature() {
  const temps = [];
  ['stator', 'windings', 'rotor', 'bearings', 'ventilation'].forEach(compId => {
    const v = state.values[compId];
    if (!v) return;
    if (v.temperature !== undefined) temps.push(v.temperature);
    if (v.coolingTemp !== undefined) temps.push(v.coolingTemp);
  });
  return temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
}

function getAvgVibration() {
  const vibs = [];
  Object.entries(state.values).forEach(([, params]) => {
    if (params.vibration !== undefined) vibs.push(params.vibration);
  });
  return vibs.length ? vibs.reduce((a, b) => a + b, 0) / vibs.length : 0;
}

function getEstimatedEfficiency(globalHealth, operationLevel) {
  return Math.round((globalHealth * 0.6 + operationLevel * 0.4) * 0.92);
}

function playAlarmBeep() {
  try {
    if (!alarmAudioContext) alarmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (alarmAudioContext.state === 'suspended') alarmAudioContext.resume();
    const osc = alarmAudioContext.createOscillator();
    const gain = alarmAudioContext.createGain();
    osc.connect(gain);
    gain.connect(alarmAudioContext.destination);
    osc.frequency.value = 880;
    osc.type = 'square';
    gain.gain.value = 0.07;
    const t = alarmAudioContext.currentTime;
    osc.start(t);
    osc.stop(t + 0.25);
  } catch (e) { /* audio non disponible */ }
}

function startPersistentAlarm() {
  if (state.alarmSoundActive) return;
  state.alarmSoundActive = true;
  playAlarmBeep();
  alarmSoundInterval = setInterval(playAlarmBeep, 900);
}

function stopPersistentAlarm() {
  state.alarmSoundActive = false;
  if (alarmSoundInterval) {
    clearInterval(alarmSoundInterval);
    alarmSoundInterval = null;
  }
}

function managePersistentAlarm(hasCriticalAlarms) {
  if (hasCriticalAlarms) startPersistentAlarm();
  else stopPersistentAlarm();
}

function updateUI() {
  const global = computeGlobalState();
  state.globalHealth = global.globalHealth;
  state.operationLevel = global.operationLevel;

  Object.entries(global.componentStates).forEach(([compId, cs]) => {
    state.componentHealth[compId] = cs.health;

    const card = document.getElementById(`card-${compId}`);
    const badge = document.getElementById(`status-badge-${compId}`);
    const healthBar = document.getElementById(`health-bar-${compId}`);
    const healthVal = document.getElementById(`health-value-${compId}`);
    const opEl = document.getElementById(`operation-${compId}`);

    if (card) {
      card.classList.remove('status-normal', 'status-warning', 'status-critical');
      card.classList.add(`status-${cs.status}`);
    }
    if (badge) {
      badge.textContent = STATUS_LABELS[cs.status];
      badge.className = `component-status-badge status-${cs.status}`;
    }
    if (healthBar) {
      healthBar.style.width = `${cs.health}%`;
      healthBar.className = `health-bar health-${cs.status}`;
    }
    if (healthVal) healthVal.textContent = `${cs.health} %`;
    if (opEl) opEl.textContent = `${cs.operation} %`;

    Object.entries(cs.paramStates).forEach(([paramId, ps]) => {
      const valEl = document.getElementById(`val-${compId}-${paramId}`);
      const dotEl = document.getElementById(`dot-${compId}-${paramId}`);
      const slider = document.getElementById(`slider-${compId}-${paramId}`);
      const input = document.getElementById(`input-${compId}-${paramId}`);
      const ctrlVal = document.getElementById(`ctrl-val-${compId}-${paramId}`);

      if (valEl) valEl.textContent = `${formatValue(ps.value, ps.param.decimals)} ${ps.param.unit}`;
      if (dotEl) dotEl.className = `param-status-dot ${ps.status}`;
      if (slider) slider.value = ps.value;
      if (input) input.value = ps.value;
      if (ctrlVal) ctrlVal.textContent = `${formatValue(ps.value, ps.param.decimals)} ${ps.param.unit}`;

      const alarmKey = `${compId}_${paramId}`;
      const isAlarm = ps.status !== 'normal';
      if (isAlarm && !state.previousAlarms[compId][paramId]) {
        const fault = getParamFaultMessage(ps.param, ps.status);
        const element = ps.param.element || COMPONENTS[compId].label;
        addLog(
          `ALARME [${element}] — ${fault} : ${formatValue(ps.value, ps.param.decimals)} ${ps.param.unit}`,
          ps.status === 'critical' ? 'alarm' : 'warning'
        );
        if (ps.status === 'critical') {
          addLog(`Fonctionnement moteur réduit à ${global.operationLevel} % (était 100 %).`, 'alarm');
        }
        // Ajouter à l'historique des alarmes
        addAlarmToHistory(element, fault, formatValue(ps.value, ps.param.decimals), ps.param.unit, ps.status);
      } else if (!isAlarm && state.previousAlarms[compId][paramId]) {
        addLog(`${COMPONENTS[compId].label} — ${ps.param.label} revenu à la normale.`, 'ok');
      }
      state.previousAlarms[compId][paramId] = isAlarm;
    });
  });

  // État global
  const isGlobalAlarm = global.worstGlobal !== 'normal';
  dom.motorStatusIndicator?.classList.toggle('alarm', global.worstGlobal === 'critical');
  dom.motorStatusIndicator?.classList.toggle('warning', global.worstGlobal === 'warning');
  if (dom.motorStatusText) {
    const globalLabel = global.worstGlobal === 'normal' ? 'NORMAL' : global.worstGlobal === 'warning' ? 'DÉGRADÉ' : 'CRITIQUE';
    dom.motorStatusText.textContent = globalLabel;
    dom.motorStatusText.className = `status-value ${global.worstGlobal === 'normal' ? 'ok' : global.worstGlobal}`;
  }
  if (dom.healthStateLabel) dom.healthStateLabel.textContent = getHealthLabel(global.globalHealth);

  if (dom.globalHealthBar) {
    dom.globalHealthBar.style.width = `${global.globalHealth}%`;
    dom.globalHealthBar.className = `health-bar health-${global.worstGlobal === 'normal' ? 'normal' : global.worstGlobal}`;
  }
  if (dom.globalHealthValue) dom.globalHealthValue.textContent = `${global.globalHealth} %`;
  if (dom.operationLevelBar) dom.operationLevelBar.style.width = `${global.operationLevel}%`;
  if (dom.operationLevelValue) dom.operationLevelValue.textContent = `${global.operationLevel} %`;

  // KPIs
  if (dom.kpiAvgTemp) dom.kpiAvgTemp.textContent = `${formatValue(getAvgTemperature(), 1)} °C`;
  if (dom.kpiAvgVibration) dom.kpiAvgVibration.textContent = `${formatValue(getAvgVibration(), 1)} mm/s`;
  if (dom.kpiEfficiency) dom.kpiEfficiency.textContent = `${getEstimatedEfficiency(global.globalHealth, global.operationLevel)} %`;
  if (dom.kpiCurrent) dom.kpiCurrent.textContent = `${formatValue(state.values.stator?.current ?? 0, 1)} A`;
  if (dom.kpiVoltage) dom.kpiVoltage.textContent = `${formatValue(state.values.stator?.voltage ?? 0, 0)} V`;
  if (dom.kpiSpeed) dom.kpiSpeed.textContent = `${formatValue(state.values.rotor?.speed ?? 0, 0)} tr/min`;
  if (dom.kpiPressure) dom.kpiPressure.textContent = `${formatValue(state.values.bearings?.pressure ?? 0, 2)} bar`;

  updateActiveAlarms(global);
  updateMotorDiagram(global);
  animateFan(global.operationLevel);
  managePersistentAlarm(global.totalCriticals > 0);

  document.querySelectorAll('[data-component-manual]').forEach(el => {
    const compId = el.dataset.componentManual;
    if (COMPONENTS[compId]?.optional) {
      el.classList.toggle('d-none', !state.ventilationPresent);
    }
  });
}

function updateActiveAlarms(global) {
  if (!dom.activeAlarmsList) return;
  const alarms = [];

  Object.entries(global.componentStates).forEach(([compId, cs]) => {
    Object.entries(cs.paramStates).forEach(([paramId, ps]) => {
      if (ps.status === 'normal') return;
      alarms.push({
        compId,
        compLabel: COMPONENTS[compId].label,
        paramLabel: ps.param.label,
        value: ps.value,
        unit: ps.param.unit,
        decimals: ps.param.decimals,
        status: ps.status,
        fault: getParamFaultMessage(ps.param, ps.status)
      });
    });
  });

  if (dom.alarmCountBadge) {
    dom.alarmCountBadge.textContent = alarms.length;
    dom.alarmCountBadge.classList.toggle('d-none', alarms.length === 0);
  }
  dom.alarmPanel?.classList.toggle('has-alarms', alarms.some(a => a.status === 'critical'));

  if (!alarms.length) {
    dom.activeAlarmsList.innerHTML = '<p class="text-muted mb-0 no-alarm-msg"><i class="bi bi-check-circle"></i> Aucune alarme active — tous les composants sont normaux.</p>';
    return;
  }

  dom.activeAlarmsList.innerHTML = alarms.map(a => `
    <div class="active-alarm-item status-${a.status}">
      <div class="active-alarm-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
      <div class="active-alarm-body">
        <strong>${a.compLabel}</strong> — ${a.fault}
        <div class="active-alarm-detail">${a.paramLabel} : ${formatValue(a.value, a.decimals)} ${a.unit}</div>
      </div>
      <span class="badge alarm-badge-${a.status}">${STATUS_LABELS[a.status]}</span>
    </div>`).join('');
}

function updateMotorDiagram(global) {
  dom.diagramParts?.forEach(part => {
    const compId = part.dataset.component;
    if (COMPONENTS[compId]?.optional && !state.ventilationPresent) return;
    const cs = global.componentStates[compId];
    if (!cs) return;
    part.classList.remove('diagram-normal', 'diagram-warning', 'diagram-critical');
    part.classList.add(`diagram-${cs.status}`);
  });
}

function animateFan(operationLevel) {
  if (!dom.fanBlades) return;
  const fanActive = state.isRunning && state.ventilationPresent;
  const duration = fanActive ? Math.max(0.3, 2 - operationLevel / 60) : 0;
  dom.fanBlades.style.animationDuration = duration ? `${duration}s` : '0s';
  dom.fanBlades.classList.toggle('spinning', fanActive && duration > 0);
}

function getComponentChartOptions() {
  const colors = getChartThemeColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: { color: colors.legend, font: { size: 9 }, boxWidth: 10 }
      }
    },
    scales: {
      x: {
        display: false,
        ticks: { color: colors.tick },
        grid: { color: colors.grid }
      },
      y: {
        display: true,
        ticks: { color: colors.tick, font: { size: 8 }, maxTicksLimit: 4 },
        grid: { color: colors.grid }
      }
    }
  };
}

function initComponentCharts() {
  componentCharts = {};
  Object.keys(COMPONENTS).forEach(compId => {
    const canvas = document.getElementById(`comp-chart-${compId}`);
    if (!canvas) return;

    const paramEntries = Object.entries(COMPONENTS[compId].params).slice(0, 3);
    componentCharts[compId] = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: paramEntries.map(([paramId, param], i) => ({
          label: param.label,
          paramId,
          data: [],
          borderColor: COMPONENT_CHART_COLORS[i % COMPONENT_CHART_COLORS.length],
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3
        }))
      },
      options: getComponentChartOptions()
    });
  });
}

function appendComponentChartData() {
  if (!state.chartLabels.length) return;

  Object.keys(componentCharts).forEach(compId => {
    if (COMPONENTS[compId]?.optional && !state.ventilationPresent) return;
    const chart = componentCharts[compId];
    if (!chart) return;

    chart.data.labels = [...state.chartLabels];
    chart.data.datasets.forEach(ds => {
      const val = state.values[compId]?.[ds.paramId];
      ds.data.push(val !== undefined ? val : null);
      if (ds.data.length > CHART_MAX_POINTS) ds.data.shift();
    });
    chart.update('none');
  });
}

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
  const colors = getChartThemeColors();
  [chartTemperatures, chartVibrations, chartHealth,
   chartIndivTemp, chartIndivVib, chartIndivCurrent,
   chartIndivVoltage, chartIndivPressure, chartIndivSpeed, chartIndivEfficiency
  ].forEach(chart => {
    if (!chart) return;
    chart.options.plugins.legend.labels.color = colors.legend;
    Object.values(chart.options.scales).forEach(scale => {
      if (scale.ticks) scale.ticks.color = colors.tick;
      if (scale.grid) scale.grid.color = colors.grid;
      if (scale.title) scale.title.color = colors.legend;
    });
    chart.update('none');
  });

  Object.values(componentCharts).forEach(chart => {
    chart.options.plugins.legend.labels.color = colors.legend;
    Object.values(chart.options.scales).forEach(scale => {
      if (scale.ticks) scale.ticks.color = colors.tick;
      if (scale.grid) scale.grid.color = colors.grid;
    });
    chart.update('none');
  });
}

function initCharts() {
  const ctxTemp = document.getElementById('chartTemperatures')?.getContext('2d');
  const ctxVib = document.getElementById('chartVibrations')?.getContext('2d');
  const ctxHealth = document.getElementById('chartHealth')?.getContext('2d');
  if (!ctxTemp || !ctxVib || !ctxHealth) return;

  chartTemperatures = new Chart(ctxTemp, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Stator', data: [], borderColor: '#f85149', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Enroulements', data: [], borderColor: '#d29922', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Rotor', data: [], borderColor: '#388bfd', borderWidth: 2, pointRadius: 0, tension: 0.3 }
      ]
    },
    options: getChartOptions('°C')
  });

  chartVibrations = new Chart(ctxVib, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Stator', data: [], borderColor: '#f85149', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Rotor', data: [], borderColor: '#388bfd', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Arbre', data: [], borderColor: '#39d353', borderWidth: 2, pointRadius: 0, tension: 0.3 }
      ]
    },
    options: getChartOptions('mm/s')
  });

  chartHealth = new Chart(ctxHealth, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Santé (%)', data: [], borderColor: '#39d353', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true, backgroundColor: 'rgba(57,211,83,0.1)' },
        { label: 'Fonctionnement (%)', data: [], borderColor: '#388bfd', borderWidth: 2, pointRadius: 0, tension: 0.3 }
      ]
    },
    options: getChartOptions('%')
  });
}

function appendChartData() {
  const now = new Date();
  const label = now.toLocaleTimeString('fr-FR');
  state.chartLabels.push(label);
  if (state.chartLabels.length > CHART_MAX_POINTS) state.chartLabels.shift();

  const global = computeGlobalState();

  if (chartTemperatures) {
    chartTemperatures.data.labels = [...state.chartLabels];
    chartTemperatures.data.datasets[0].data.push(state.values.stator.temperature);
    chartTemperatures.data.datasets[1].data.push(state.values.windings.temperature);
    chartTemperatures.data.datasets[2].data.push(state.values.rotor.temperature);
    chartTemperatures.data.datasets.forEach(ds => { if (ds.data.length > CHART_MAX_POINTS) ds.data.shift(); });
    chartTemperatures.update('none');
  }

  if (chartVibrations) {
    chartVibrations.data.labels = [...state.chartLabels];
    chartVibrations.data.datasets[0].data.push(state.values.stator.vibration);
    chartVibrations.data.datasets[1].data.push(state.values.rotor.vibration);
    chartVibrations.data.datasets[2].data.push(state.values.shaft.vibration);
    chartVibrations.data.datasets.forEach(ds => { if (ds.data.length > CHART_MAX_POINTS) ds.data.shift(); });
    chartVibrations.update('none');
  }

  if (chartHealth) {
    chartHealth.data.labels = [...state.chartLabels];
    chartHealth.data.datasets[0].data.push(global.globalHealth);
    chartHealth.data.datasets[1].data.push(global.operationLevel);
    chartHealth.data.datasets.forEach(ds => { if (ds.data.length > CHART_MAX_POINTS) ds.data.shift(); });
    chartHealth.update('none');
  }

  const efficiency = getEstimatedEfficiency(global.globalHealth, global.operationLevel);
  appendIndividualChartsData(label, efficiency);
  appendComponentChartData();
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
   HISTORIQUE DES ALARMES
   ============================================================ */

/**
 * Ajoute une entrée dans l'historique des alarmes
 */
function addAlarmToHistory(element, defaut, valeur, unite, niveau) {
  const now = new Date();
  const entry = {
    date: now.toLocaleDateString('fr-FR'),
    heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    element,
    defaut,
    valeur: `${valeur} ${unite}`,
    niveau
  };
  state.alarmHistory.unshift(entry);
  // Limiter à 100 entrées
  if (state.alarmHistory.length > 100) state.alarmHistory.pop();
  renderAlarmHistoryTable();
}

/**
 * Met à jour le tableau d'historique des alarmes
 */
function renderAlarmHistoryTable() {
  const tbody = document.getElementById('alarmHistoryBody');
  if (!tbody) return;

  const empty = document.getElementById('alarmHistoryEmpty');

  // Remove all rows except empty row
  Array.from(tbody.querySelectorAll('tr.alarm-history-row')).forEach(r => r.remove());

  if (!state.alarmHistory.length) {
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  state.alarmHistory.forEach(entry => {
    const tr = document.createElement('tr');
    tr.className = `alarm-history-row alarm-history-${entry.niveau}`;
    tr.innerHTML = `
      <td>${entry.date}</td>
      <td class="font-mono">${entry.heure}</td>
      <td><strong>${entry.element}</strong></td>
      <td>${entry.defaut}</td>
      <td class="font-mono">${entry.valeur}</td>
      <td><span class="badge alarm-history-badge-${entry.niveau}">${entry.niveau === 'critical' ? 'Critique' : 'Dégradation'}</span></td>`;
    tbody.appendChild(tr);
  });
}

/* ============================================================
   GRAPHIQUES INDIVIDUELS PAR PARAMÈTRE avec zones de seuils
   ============================================================ */

/**
 * Crée les options pour un graphique individuel avec zones colorées
 * @param {string} yLabel - Unité de l'axe Y
 * @param {object} zones - { normalMax, warnMax, yMax } pour dessiner les zones
 */
function getIndivChartOptions(yLabel, yMin, yMax, colors) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        labels: { color: colors.legend, font: { size: 10 }, boxWidth: 10 }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} ${yLabel}`
        }
      }
    },
    scales: {
      x: {
        display: false,
        ticks: { color: colors.tick },
        grid: { color: colors.grid }
      },
      y: {
        min: yMin,
        max: yMax,
        ticks: { color: colors.tick, font: { size: 9 }, maxTicksLimit: 5 },
        grid: { color: colors.grid },
        title: { display: true, text: yLabel, color: colors.legend, font: { size: 10 } }
      }
    }
  };
}

/**
 * Génère un plugin Chart.js pour afficher des zones colorées (normal/dégradation/critique)
 */
function makeThresholdPlugin(id, zones) {
  return {
    id: `thresholdZones_${id}`,
    beforeDraw(chart) {
      const { ctx, chartArea: { top, bottom, left, right }, scales: { y } } = chart;
      if (!y || !ctx) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, right - left, bottom - top);
      ctx.clip();
      zones.forEach(zone => {
        const yTop = Math.max(top, y.getPixelForValue(zone.max));
        const yBottom = Math.min(bottom, y.getPixelForValue(zone.min));
        if (yBottom <= yTop) return;
        ctx.fillStyle = zone.color;
        ctx.fillRect(left, yTop, right - left, yBottom - yTop);
      });
      ctx.restore();
    }
  };
}

/**
 * Initialise les 7 graphiques individuels par paramètre
 */
function initIndividualCharts() {
  const colors = getChartThemeColors();

  // 1. Température stator (0-100°C : 0-55 vert, 55-60 jaune, >60 rouge)
  const ctxTemp = document.getElementById('chartIndivTemp');
  if (ctxTemp) {
    const zones = [
      { min: 0,  max: 55, color: 'rgba(35,134,54,0.15)' },
      { min: 55, max: 60, color: 'rgba(210,153,34,0.18)' },
      { min: 60, max: 100, color: 'rgba(218,54,51,0.18)' }
    ];
    chartIndivTemp = new Chart(ctxTemp.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Temp. stator (°C)', data: [], borderColor: '#f85149', borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
      options: getIndivChartOptions('°C', 0, 100, colors),
      plugins: [makeThresholdPlugin('temp', zones)]
    });
  }

  // 2. Vibrations (0-15 mm/s : 0-2 vert, 2-4 jaune, >4 rouge)
  const ctxVib = document.getElementById('chartIndivVib');
  if (ctxVib) {
    const zones = [
      { min: 0, max: 2, color: 'rgba(35,134,54,0.15)' },
      { min: 2, max: 4, color: 'rgba(210,153,34,0.18)' },
      { min: 4, max: 15, color: 'rgba(218,54,51,0.18)' }
    ];
    chartIndivVib = new Chart(ctxVib.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Vibrations (mm/s)', data: [], borderColor: '#a371f7', borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
      options: getIndivChartOptions('mm/s', 0, 15, colors),
      plugins: [makeThresholdPlugin('vib', zones)]
    });
  }

  // 3. Courant (0-35 A : 0-18 vert, 18-25 jaune, >25 rouge)
  const ctxCurrent = document.getElementById('chartIndivCurrent');
  if (ctxCurrent) {
    const zones = [
      { min: 0,  max: 18, color: 'rgba(35,134,54,0.15)' },
      { min: 18, max: 25, color: 'rgba(210,153,34,0.18)' },
      { min: 25, max: 35, color: 'rgba(218,54,51,0.18)' }
    ];
    chartIndivCurrent = new Chart(ctxCurrent.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Courant (A)', data: [], borderColor: '#d29922', borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
      options: getIndivChartOptions('A', 0, 35, colors),
      plugins: [makeThresholdPlugin('current', zones)]
    });
  }

  // 4. Tension (280-500 V : 380-420 vert, 340-380/420-450 jaune, <340/>450 rouge)
  const ctxVoltage = document.getElementById('chartIndivVoltage');
  if (ctxVoltage) {
    const zones = [
      { min: 280, max: 340,  color: 'rgba(218,54,51,0.18)' },
      { min: 340, max: 380,  color: 'rgba(210,153,34,0.18)' },
      { min: 380, max: 420,  color: 'rgba(35,134,54,0.15)' },
      { min: 420, max: 450,  color: 'rgba(210,153,34,0.18)' },
      { min: 450, max: 500,  color: 'rgba(218,54,51,0.18)' }
    ];
    chartIndivVoltage = new Chart(ctxVoltage.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Tension (V)', data: [], borderColor: '#388bfd', borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
      options: getIndivChartOptions('V', 280, 500, colors),
      plugins: [makeThresholdPlugin('voltage', zones)]
    });
  }

  // 5. Pression (0-6 bar : 2.5-4 vert, 1.5-2.5 jaune, <1.5 rouge)
  const ctxPressure = document.getElementById('chartIndivPressure');
  if (ctxPressure) {
    const zones = [
      { min: 0,   max: 1.5, color: 'rgba(218,54,51,0.18)' },
      { min: 1.5, max: 2.5, color: 'rgba(210,153,34,0.18)' },
      { min: 2.5, max: 4.0, color: 'rgba(35,134,54,0.15)' },
      { min: 4.0, max: 6.0, color: 'rgba(210,153,34,0.10)' }
    ];
    chartIndivPressure = new Chart(ctxPressure.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Pression (bar)', data: [], borderColor: '#39d353', borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
      options: getIndivChartOptions('bar', 0, 6, colors),
      plugins: [makeThresholdPlugin('pressure', zones)]
    });
  }

  // 6. Vitesse rotation (800-1800 tr/min : 1400-1500 vert, 1200-1400 jaune, <1200 rouge)
  const ctxSpeed = document.getElementById('chartIndivSpeed');
  if (ctxSpeed) {
    const zones = [
      { min: 800,  max: 1200, color: 'rgba(218,54,51,0.18)' },
      { min: 1200, max: 1400, color: 'rgba(210,153,34,0.18)' },
      { min: 1400, max: 1500, color: 'rgba(35,134,54,0.15)' },
      { min: 1500, max: 1800, color: 'rgba(210,153,34,0.10)' }
    ];
    chartIndivSpeed = new Chart(ctxSpeed.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Vitesse (tr/min)', data: [], borderColor: '#58a6ff', borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
      options: getIndivChartOptions('tr/min', 800, 1800, colors),
      plugins: [makeThresholdPlugin('speed', zones)]
    });
  }

  // 7. Rendement (0-100% : >90 vert, 75-90 jaune, <75 rouge)
  const ctxEff = document.getElementById('chartIndivEfficiency');
  if (ctxEff) {
    const zones = [
      { min: 0,  max: 75, color: 'rgba(218,54,51,0.18)' },
      { min: 75, max: 90, color: 'rgba(210,153,34,0.18)' },
      { min: 90, max: 100, color: 'rgba(35,134,54,0.15)' }
    ];
    chartIndivEfficiency = new Chart(ctxEff.getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ label: 'Rendement (%)', data: [], borderColor: '#39d353', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true, backgroundColor: 'rgba(57,211,83,0.06)' }] },
      options: getIndivChartOptions('%', 0, 100, colors),
      plugins: [makeThresholdPlugin('eff', zones)]
    });
  }
}

/**
 * Alimente les graphiques individuels avec les données courantes
 */
function appendIndividualChartsData(label, globalEfficiency) {
  const MAX = CHART_MAX_POINTS;

  function push(chart, value) {
    if (!chart) return;
    chart.data.labels.push(label);
    if (chart.data.labels.length > MAX) chart.data.labels.shift();
    chart.data.datasets[0].data.push(value);
    if (chart.data.datasets[0].data.length > MAX) chart.data.datasets[0].data.shift();
    chart.update('none');
  }

  push(chartIndivTemp,       state.values.stator?.temperature ?? null);
  push(chartIndivVib,        state.values.stator?.vibration ?? null);
  push(chartIndivCurrent,    state.values.stator?.current ?? null);
  push(chartIndivVoltage,    state.values.stator?.voltage ?? null);
  push(chartIndivPressure,   state.values.bearings?.pressure ?? null);
  push(chartIndivSpeed,      state.values.rotor?.speed ?? null);
  push(chartIndivEfficiency, globalEfficiency ?? null);
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
      globalHealth: state.globalHealth,
      operationLevel: state.operationLevel,
      ventilationPresent: state.ventilationPresent,
      chartLabels: state.chartLabels,
      chartData: {
        statorTemp: chartTemperatures?.data.datasets[0].data || [],
        windingsTemp: chartTemperatures?.data.datasets[1].data || [],
        rotorTemp: chartTemperatures?.data.datasets[2].data || [],
        statorVib: chartVibrations?.data.datasets[0].data || [],
        rotorVib: chartVibrations?.data.datasets[1].data || [],
        shaftVib: chartVibrations?.data.datasets[2].data || [],
        health: chartHealth?.data.datasets[0].data || [],
        operation: chartHealth?.data.datasets[1].data || [],
        componentCharts: Object.fromEntries(
          Object.entries(componentCharts).map(([compId, chart]) => [
            compId,
            chart.data.datasets.map(ds => ({ paramId: ds.paramId, data: ds.data }))
          ])
        )
      }
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.values) {
      Object.keys(COMPONENTS).forEach(compId => {
        if (!data.values[compId]) return;
        Object.keys(COMPONENTS[compId].params).forEach(paramId => {
          if (data.values[compId][paramId] !== undefined) {
            const p = COMPONENTS[compId].params[paramId];
            state.values[compId][paramId] = clamp(data.values[compId][paramId], p.min, p.max);
          }
        });
      });
    }

    if (data.ventilationPresent !== undefined) {
      state.ventilationPresent = data.ventilationPresent;
      if (dom.ventilationToggle) dom.ventilationToggle.checked = state.ventilationPresent;
      updateVentilationVisibility();
    }

    if (data.chartLabels && data.chartData) {
      state.chartLabels = data.chartLabels.slice(-CHART_MAX_POINTS);
      const cd = data.chartData;

      if (chartTemperatures) {
        chartTemperatures.data.labels = [...state.chartLabels];
        chartTemperatures.data.datasets[0].data = (cd.statorTemp || []).slice(-CHART_MAX_POINTS);
        chartTemperatures.data.datasets[1].data = (cd.windingsTemp || []).slice(-CHART_MAX_POINTS);
        chartTemperatures.data.datasets[2].data = (cd.rotorTemp || []).slice(-CHART_MAX_POINTS);
        chartTemperatures.update('none');
      }
      if (chartVibrations) {
        chartVibrations.data.labels = [...state.chartLabels];
        chartVibrations.data.datasets[0].data = (cd.statorVib || []).slice(-CHART_MAX_POINTS);
        chartVibrations.data.datasets[1].data = (cd.rotorVib || []).slice(-CHART_MAX_POINTS);
        chartVibrations.data.datasets[2].data = (cd.shaftVib || []).slice(-CHART_MAX_POINTS);
        chartVibrations.update('none');
      }
      if (chartHealth) {
        chartHealth.data.labels = [...state.chartLabels];
        chartHealth.data.datasets[0].data = (cd.health || []).slice(-CHART_MAX_POINTS);
        chartHealth.data.datasets[1].data = (cd.operation || []).slice(-CHART_MAX_POINTS);
        chartHealth.update('none');
      }

      if (cd.componentCharts) {
        Object.entries(cd.componentCharts).forEach(([compId, datasets]) => {
          const chart = componentCharts[compId];
          if (!chart) return;
          chart.data.labels = [...state.chartLabels];
          datasets.forEach(saved => {
            const ds = chart.data.datasets.find(d => d.paramId === saved.paramId);
            if (ds) ds.data = (saved.data || []).slice(-CHART_MAX_POINTS);
          });
          chart.update('none');
        });
      }
    }

    updateUI();
    addLog('État restauré depuis la session précédente.', 'info');
  } catch (e) { /* ignore */ }
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
  if (chartTemperatures || chartVibrations || chartHealth) {
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
  const global = computeGlobalState();
  const alarmDetails = [];

  Object.entries(global.componentStates).forEach(([compId, cs]) => {
    Object.entries(cs.paramStates).forEach(([paramId, ps]) => {
      if (ps.status === 'normal') return;
      const fault = getParamFaultMessage(ps.param, ps.status);
      alarmDetails.push(`[${COMPONENTS[compId].label}] ${fault} : ${formatValue(ps.value, ps.param.decimals)} ${ps.param.unit}`);
    });
  });

  const motorStatus = global.worstGlobal === 'critical' ? 'ALARME' : global.worstGlobal === 'warning' ? 'ALERTE' : 'OK';

  return {
    values: JSON.parse(JSON.stringify(state.values)),
    globalHealth: global.globalHealth,
    operationLevel: global.operationLevel,
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
    if (!data.values || !data.values.stator) return null;

    const savedValues = data.values;
    const prevValues = state.values;
    state.values = savedValues;
    const global = computeGlobalState();
    state.values = prevValues;

    const alarmDetails = [];
    Object.entries(global.componentStates).forEach(([compId, cs]) => {
      Object.entries(cs.paramStates).forEach(([paramId, ps]) => {
        if (ps.status === 'normal') return;
        alarmDetails.push(`[${COMPONENTS[compId].label}] ${getParamFaultMessage(ps.param, ps.status)}`);
      });
    });

    return {
      values: savedValues,
      globalHealth: global.globalHealth,
      operationLevel: global.operationLevel,
      motorStatus: global.worstGlobal !== 'normal' ? 'ALARME' : 'OK',
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
    mesures: {
      ...(snapshot?.values || {}),
      globalHealth: snapshot?.globalHealth,
      operationLevel: snapshot?.operationLevel
    },
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

  set('measureTemperature', values.stator?.temperature !== undefined ? formatValue(values.stator.temperature, 1) : undefined, '°C');
  set('measureCurrent', values.stator?.current !== undefined ? formatValue(values.stator.current, 1) : undefined, 'A');
  set('measureSpeed', values.rotor?.speed !== undefined ? formatValue(values.rotor.speed, 0) : undefined, 'tr/min');

  const pressureEl = document.getElementById('measurePressure');
  if (pressureEl) {
    const pressure = values.bearings?.pressure;
    pressureEl.textContent = pressure !== undefined ? `${formatValue(pressure, 2)} bar` : '—';
  }

  const healthEl = document.getElementById('measureHealth');
  if (healthEl) {
    const health = snapshot?.globalHealth;
    healthEl.textContent = health !== undefined ? `${health} %` : '—';
  }

  const badge = document.getElementById('measureMotorStatus');
  if (badge) {
    const status = snapshot?.motorStatus || '—';
    const healthInfo = snapshot?.globalHealth !== undefined ? ` — Santé ${snapshot.globalHealth}%` : '';
    badge.textContent = `État moteur : ${status}${healthInfo}`;
    badge.className = `badge ${status === 'ALARME' ? 'bg-danger' : status === 'ALERTE' ? 'bg-warning text-dark' : status === 'OK' ? 'bg-success' : 'bg-secondary'}`;
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
    mesures: {
      ...(snapshot?.values || existing?.mesures || {}),
      globalHealth: snapshot?.globalHealth ?? existing?.mesures?.globalHealth,
      operationLevel: snapshot?.operationLevel ?? existing?.mesures?.operationLevel
    },
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
          <th>Temp. stator</th><td>${m.stator?.temperature ?? '—'} °C</td>
          <th>Temp. enroulements</th><td>${m.windings?.temperature ?? '—'} °C</td>
        </tr>
        <tr>
          <th>Courant</th><td>${m.stator?.current ?? '—'} A</td>
          <th>Pression paliers</th><td>${m.bearings?.pressure ?? '—'} bar</td>
        </tr>
        <tr>
          <th>Vitesse rotor</th><td>${m.rotor?.speed ?? '—'} tr/min</td>
          <th>Santé moteur</th><td>${item.mesures?.globalHealth ?? '—'} %</td>
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

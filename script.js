/**
 * ============================================================
 * MOTEUR ASYNCHRONE TRIPHASÉ À CAGE D'ÉCUREUIL — Script principal
 * Supervision industrielle · SCADA · Simulation · Alarmes · Diagnostic
 * ============================================================
 */
'use strict';

/* ============================================================
   AUTHENTIFICATION
   ============================================================ */
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

function isAuthenticated() {
  try {
    const raw = localStorage.getItem(AUTH_CONFIG.sessionKey);
    if (!raw) return false;
    const s = JSON.parse(raw);
    return s && s.isLoggedIn === true && s.username === AUTH_CONFIG.username;
  } catch (e) { return false; }
}
function getAdminProfile() { return { ...AUTH_CONFIG.profile, username: AUTH_CONFIG.username }; }
function getSessionInfo() { try { return JSON.parse(localStorage.getItem(AUTH_CONFIG.sessionKey)); } catch (e) { return null; } }
function getLoggedInUser() {
  try { const s = JSON.parse(localStorage.getItem(AUTH_CONFIG.sessionKey)); return s?.isLoggedIn ? s.username : null; } catch (e) { return null; }
}
function formatLoginDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function setSession(username) {
  localStorage.setItem(AUTH_CONFIG.sessionKey, JSON.stringify({ isLoggedIn: true, username, loginTime: new Date().toISOString() }));
}
function clearSession() { localStorage.removeItem(AUTH_CONFIG.sessionKey); }
function attemptLogin(username, password) {
  const u = (username || '').trim();
  if (!u || !password) return { success: false, message: 'Veuillez remplir tous les champs.' };
  if (u === AUTH_CONFIG.username && password === AUTH_CONFIG.password) { setSession(u); return { success: true }; }
  return { success: false, message: 'Identifiants incorrects. Accès refusé.' };
}
function requireAuth() {
  if (!isAuthenticated()) { window.location.replace('login.html'); return false; }
  return true;
}
function logout() {
  if (typeof state !== 'undefined' && state.isRunning) stopSimulation();
  stopPersistentAlarm();
  if (typeof state !== 'undefined' && state._animFrame) cancelAnimationFrame(state._animFrame);
  clearSession();
  window.location.replace('login.html');
}
function initAppNav(activePage) {
  const el = document.getElementById('loggedInUser');
  if (el) el.textContent = getLoggedInUser() || AUTH_CONFIG.username;
  document.querySelectorAll('.nav-app-link').forEach(link => link.classList.toggle('active', link.dataset.page === activePage));
  document.getElementById('btnLogout')?.addEventListener('click', logout);
  initThemeToggle();
}
function initLoginPage() {
  if (isAuthenticated()) { window.location.replace('dashboard.html'); return; }
  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorBox = document.getElementById('loginError');
  const errorMessage = document.getElementById('loginErrorMessage');
  const btnToggle = document.getElementById('btnTogglePassword');
  const toggleIcon = document.getElementById('togglePasswordIcon');
  const showError = msg => { errorMessage.textContent = msg; errorBox.classList.remove('d-none'); };
  const hideError = () => errorBox.classList.add('d-none');
  form.addEventListener('submit', e => {
    e.preventDefault(); hideError();
    const r = attemptLogin(usernameInput.value, passwordInput.value);
    if (r.success) window.location.replace('dashboard.html');
    else { showError(r.message); passwordInput.value = ''; passwordInput.focus(); }
  });
  btnToggle.addEventListener('click', () => {
    const isPass = passwordInput.type === 'password';
    passwordInput.type = isPass ? 'text' : 'password';
    toggleIcon.classList.toggle('bi-eye', !isPass);
    toggleIcon.classList.toggle('bi-eye-slash', isPass);
  });
  [usernameInput, passwordInput].forEach(i => i.addEventListener('input', hideError));
  usernameInput.focus();
  initThemeToggle();
}

/* ============================================================
   CATALOGUE DES DÉFAUTS — Cause + Action recommandée
   ============================================================ */
const FAULT_CATALOG = {
  stator_temperature_warning:       { cause: 'Charge excessive ou ventilation réduite',             action: 'Vérifier la charge et le système de refroidissement' },
  stator_temperature_critical:      { cause: 'Défaillance du refroidissement ou surcharge grave',   action: 'ARRÊTER LE MOTEUR — Vérifier ventilation et isolement' },
  stator_vibration_warning:         { cause: 'Légère balourd ou désalignement naissant',            action: "Contrôler l'équilibrage et l'alignement" },
  stator_vibration_critical:        { cause: 'Déséquilibre sévère ou défaut mécanique',             action: 'ARRÊTER LE MOTEUR — Inspecter les roulements et l\'arbre' },
  stator_current_warning:           { cause: 'Charge élevée ou déséquilibre de phase partiel',      action: "Contrôler la tension d'alimentation et la charge" },
  stator_current_critical:          { cause: 'Court-circuit ou surcharge grave',                    action: 'COUPE-CIRCUIT — Vérifier bobinages et alimentation' },
  stator_voltage_warning:           { cause: 'Fluctuation réseau ou câblage insuffisant',           action: 'Vérifier le réseau et les connexions électriques' },
  stator_voltage_critical:          { cause: 'Rupture réseau ou surtension dangereuse',             action: 'ARRÊTER — Protéger les bobinages contre la surtension' },
  windings_temperature_warning:     { cause: 'Surcharge des enroulements',                          action: 'Réduire la charge et contrôler le ventilateur' },
  windings_temperature_critical:    { cause: "Dégradation de l'isolant thermique",                  action: 'ARRÊTER — Tester l\'isolement et rembobiner si nécessaire' },
  windings_insulation_warning:      { cause: "Humidité ou vieillissement de l'isolant",             action: "Mesurer la résistance d'isolement, sécher le moteur" },
  windings_insulation_critical:     { cause: "Claquage de l'isolant imminent",                      action: 'ARRÊTER — Révision complète des bobinages requise' },
  windings_current_warning:         { cause: 'Déséquilibre des phases ou surcharge',                action: "Contrôler les trois phases d'alimentation" },
  windings_current_critical:        { cause: 'Court-circuit partiel des spires',                    action: 'ARRÊTER — Contrôle diélectrique et rembobinage' },
  rotor_temperature_warning:        { cause: 'Échauffement par courants de Foucault excessifs',     action: 'Vérifier le glissement et la charge' },
  rotor_temperature_critical:       { cause: 'Barres de cage endommagées ou cassées',              action: 'ARRÊTER — Contrôle visuel des barres rotoriques' },
  rotor_speed_warning:              { cause: 'Surcharge ou variation de fréquence réseau',          action: "Contrôler la charge et la fréquence d'alimentation" },
  rotor_speed_critical:             { cause: 'Blocage mécanique ou défaut grave du rotor',         action: "ARRÊTER D'URGENCE — Inspecter la mécanique" },
  rotor_vibration_warning:          { cause: 'Balourd rotor ou excentricité',                      action: 'Équilibrage dynamique recommandé' },
  rotor_vibration_critical:         { cause: 'Déséquilibre grave — risque de casse',               action: "ARRÊTER — Inspecter arbre et roulements immédiatement" },
  shaft_vibration_warning:          { cause: "Désalignement naissant ou usure d'accouplement",     action: "Contrôler l'alignement et l'accouplement" },
  shaft_vibration_critical:         { cause: "Rupture imminente de l'arbre",                       action: "ARRÊTER D'URGENCE — Sécuriser la machine" },
  shaft_speed_warning:              { cause: 'Variation de charge ou de fréquence',                action: 'Vérifier la charge mécanique' },
  shaft_speed_critical:             { cause: "Blocage ou patinage de l'arbre",                     action: "ARRÊTER — Inspecter l'accouplement et la charge" },
  shaft_alignment_warning:          { cause: 'Tassement du socle ou desserrage de fixation',       action: 'Ré-aligner et resserrer les boulons de fixation' },
  shaft_alignment_critical:         { cause: 'Désalignement critique — fatigue accélérée',         action: 'ARRÊTER — Ré-aligner immédiatement' },
  bearings_temperature_warning:     { cause: 'Lubrification insuffisante ou surcharge paliers',    action: 'Graisser les roulements et contrôler la charge radiale' },
  bearings_temperature_critical:    { cause: 'Grippage des roulements en cours',                   action: 'ARRÊTER — Remplacer les roulements' },
  bearings_vibration_warning:       { cause: 'Usure des bagues ou début de fatigue',               action: "Analyse vibratoire et contrôle de l'état des roulements" },
  bearings_vibration_critical:      { cause: 'Écaillage avancé des roulements',                    action: 'ARRÊTER — Remplacement immédiat des roulements' },
  bearings_wear_warning:            { cause: 'Usure normale mais avancée',                         action: 'Planifier le remplacement préventif' },
  bearings_wear_critical:           { cause: 'Roulements en fin de vie',                           action: 'ARRÊTER — Remplacement immédiat obligatoire' },
  bearings_pressure_warning:        { cause: "Fuite d'huile ou pompe de lubrification faible",     action: 'Contrôler le circuit de lubrification' },
  bearings_pressure_critical:       { cause: 'Rupture du circuit de lubrification',               action: 'ARRÊTER — Risque de grippage immédiat' },
  ventilation_coolingTemp_warning:  { cause: "Filtre colmaté ou débit d'air réduit",              action: 'Nettoyer le filtre et contrôler le ventilateur' },
  ventilation_coolingTemp_critical: { cause: 'Panne du système de refroidissement',               action: 'ARRÊTER — Inspecter et réparer le ventilateur' },
  ventilation_fanSpeed_warning:     { cause: "Tension basse ou courroie d'entraînement usée",     action: "Vérifier l'alimentation du ventilateur" },
  ventilation_fanSpeed_critical:    { cause: 'Panne moteur ventilateur',                          action: 'ARRÊTER — Remplacer le moteur du ventilateur' },
  ventilation_airFlow_warning:      { cause: "Obstruction partielle de la grille d'air",          action: 'Dégager les grilles et nettoyer les filtres' },
  ventilation_airFlow_critical:     { cause: 'Obstruction totale — risque de surchauffe',         action: "ARRÊTER — Dégager immédiatement les voies d'air" }
};

function getFaultInfo(compId, paramId, status) {
  return FAULT_CATALOG[`${compId}_${paramId}_${status}`] || { cause: 'Cause indéterminée', action: 'Inspecter le composant' };
}

/* ============================================================
   COMPOSANTS — Seuils industriels officiels
   ============================================================ */
const COMPONENTS = {
  stator: {
    label: 'Stator', icon: 'bi-magnet', weight: 1.2, diagramComponent: 'stator',
    zones: ['Carcasse du stator', 'Circuit magnétique'],
    params: {
      temperature: {
        label: 'Température stator', unit: '°C', default: 28, min: 0, max: 100, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 37, critical: 55 },
        sim: { nominal: 28, noise: 0.5, drift: 0.03 },
        faultWarning: 'Échauffement stator', faultCritical: 'Surchauffe du stator', element: 'STATOR'
      },
      vibration: {
        label: 'Vibrations stator', unit: 'mm/s', default: 1.2, min: 0, max: 15, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 2, critical: 4 },
        sim: { nominal: 1.2, noise: 0.12, drift: 0.04 },
        faultWarning: 'Vibrations modérées', faultCritical: 'Vibration excessive', element: 'STATOR'
      },
      current: {
        label: 'Courant triphasé', unit: 'A', default: 12, min: 0, max: 35, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 18, critical: 25 },
        sim: { nominal: 12, noise: 0.3, drift: 0.02 },
        faultWarning: 'Courant élevé', faultCritical: 'Surintensité — Déséquilibre électrique', element: 'STATOR'
      },
      voltage: {
        label: 'Tension alimentation', unit: 'V', default: 400, min: 280, max: 500, step: 1, decimals: 0,
        threshold: { type: 'range', normalMin: 380, normalMax: 420, warningMin: 340, warningMax: 450, criticalMin: 340, criticalMax: 450 },
        sim: { nominal: 400, noise: 1.5, drift: 0.5 },
        faultWarning: 'Tension hors plage nominale', faultCritical: 'Tension critique — Risque de défaillance', element: 'STATOR'
      }
    }
  },
  windings: {
    label: 'Enroulements', icon: 'bi-lightning-charge', weight: 1.3, diagramComponent: 'stator',
    zones: ['Bobinages internes'],
    params: {
      temperature: {
        label: 'Température enroulements', unit: '°C', default: 35, min: 0, max: 150, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 37, critical: 55 },
        sim: { nominal: 35, noise: 0.6, drift: 0.04 },
        faultWarning: 'Échauffement enroulements', faultCritical: 'Surchauffe des enroulements', element: 'ENROULEMENTS'
      },
      insulation: {
        label: "Résistance d'isolement", unit: 'MΩ', default: 500, min: 0, max: 1000, step: 1, decimals: 0,
        threshold: { type: 'min', warning: 100, critical: 50 },
        sim: { nominal: 500, noise: 5, drift: 1 },
        faultWarning: "Isolement en baisse", faultCritical: "Dégradation de l'isolant", element: 'ENROULEMENTS'
      },
      current: {
        label: 'Courant électrique', unit: 'A', default: 12, min: 0, max: 35, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 18, critical: 25 },
        sim: { nominal: 12, noise: 0.3, drift: 0.02 },
        faultWarning: 'Courant élevé', faultCritical: 'Court-circuit partiel', element: 'ENROULEMENTS'
      }
    }
  },
  rotor: {
    label: 'Rotor', icon: 'bi-arrow-repeat', weight: 1.1, diagramComponent: 'rotor',
    zones: ['Cage rotorique', 'Axe du rotor'],
    params: {
      temperature: {
        label: 'Température rotor', unit: '°C', default: 30, min: 0, max: 110, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 37, critical: 55 },
        sim: { nominal: 30, noise: 0.4, drift: 0.03 },
        faultWarning: 'Échauffement rotor', faultCritical: 'Échauffement anormal du rotor', element: 'ROTOR'
      },
      speed: {
        label: 'Vitesse asynchrone', unit: 'tr/min', default: 1450, min: 800, max: 1800, step: 1, decimals: 0,
        threshold: { type: 'range', normalMin: 1400, normalMax: 1500, warningMin: 1200, warningMax: 1500, criticalMin: 1200, criticalMax: 1800 },
        sim: { nominal: 1450, noise: 6, drift: 1.5 },
        faultWarning: 'Vitesse hors plage nominale', faultCritical: 'Défaut de rotation — Vitesse critique', element: 'ROTOR'
      },
      vibration: {
        label: 'Vibrations rotor', unit: 'mm/s', default: 1.0, min: 0, max: 15, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 2, critical: 4 },
        sim: { nominal: 1.0, noise: 0.1, drift: 0.03 },
        faultWarning: 'Vibrations rotor modérées', faultCritical: 'Déséquilibre mécanique rotor', element: 'ROTOR'
      }
    }
  },
  shaft: {
    label: 'Arbre de transmission', icon: 'bi-arrows-collapse', weight: 1.0, diagramComponent: 'shaft',
    zones: ['Axe de transmission'],
    params: {
      vibration: {
        label: 'Vibration arbre', unit: 'mm/s', default: 0.9, min: 0, max: 12, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 2, critical: 4 },
        sim: { nominal: 0.9, noise: 0.08, drift: 0.02 },
        faultWarning: 'Vibrations arbre', faultCritical: 'Déséquilibre / Fatigue mécanique arbre', element: 'ARBRE'
      },
      speed: {
        label: 'Vitesse rotation arbre', unit: 'tr/min', default: 1450, min: 800, max: 1800, step: 1, decimals: 0,
        threshold: { type: 'range', normalMin: 1400, normalMax: 1500, warningMin: 1200, warningMax: 1500, criticalMin: 1200, criticalMax: 1800 },
        sim: { nominal: 1450, noise: 5, drift: 1 },
        faultWarning: 'Vitesse anormale arbre', faultCritical: 'Défaut transmission arbre', element: 'ARBRE'
      },
      alignment: {
        label: 'Alignement', unit: 'mm', default: 0.05, min: 0, max: 2, step: 0.01, decimals: 2,
        threshold: { type: 'max', warning: 0.3, critical: 0.6 },
        sim: { nominal: 0.05, noise: 0.01, drift: 0.004 },
        faultWarning: 'Alignement dégradé', faultCritical: 'Désalignement critique', element: 'ARBRE'
      }
    }
  },
  bearings: {
    label: 'Paliers / Roulements', icon: 'bi-circle', weight: 1.15, diagramComponent: 'bearings',
    zones: ['Roulements avant et arrière'],
    params: {
      temperature: {
        label: 'Température paliers', unit: '°C', default: 28, min: 0, max: 100, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 37, critical: 55 },
        sim: { nominal: 28, noise: 0.35, drift: 0.02 },
        faultWarning: 'Échauffement paliers', faultCritical: 'Surchauffe paliers — Lubrification insuffisante', element: 'ROULEMENTS'
      },
      vibration: {
        label: 'Vibrations paliers', unit: 'mm/s', default: 0.8, min: 0, max: 12, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 2, critical: 4 },
        sim: { nominal: 0.8, noise: 0.07, drift: 0.02 },
        faultWarning: 'Vibrations paliers', faultCritical: 'Vibration excessive — Usure roulements', element: 'ROULEMENTS'
      },
      wear: {
        label: "Niveau d'usure", unit: '%', default: 12, min: 0, max: 100, step: 1, decimals: 0,
        threshold: { type: 'max', warning: 60, critical: 80 },
        sim: { nominal: 12, noise: 0.4, drift: 0.08 },
        faultWarning: 'Usure modérée roulements', faultCritical: 'Usure critique — Risque de blocage', element: 'ROULEMENTS'
      },
      pressure: {
        label: 'Pression lubrification', unit: 'bar', default: 3.2, min: 0, max: 6, step: 0.01, decimals: 2,
        threshold: { type: 'range', normalMin: 2.5, normalMax: 4.0, warningMin: 1.5, warningMax: 4.0, criticalMin: 1.5, criticalMax: 6.0 },
        sim: { nominal: 3.2, noise: 0.03, drift: 0.007 },
        faultWarning: 'Pression lubrification basse', faultCritical: 'Pression insuffisante — SYSTÈME DE LUBRIFICATION', element: 'SYSTÈME DE LUBRIFICATION'
      }
    }
  },
  ventilation: {
    label: 'Ventilation', icon: 'bi-fan', weight: 0.9, optional: true, diagramComponent: 'ventilation',
    zones: ['Système de refroidissement'],
    params: {
      coolingTemp: {
        label: 'Temp. refroidissement', unit: '°C', default: 28, min: 15, max: 80, step: 0.1, decimals: 1,
        threshold: { type: 'max', warning: 37, critical: 55 },
        sim: { nominal: 28, noise: 0.4, drift: 0.03 },
        faultWarning: 'Refroidissement insuffisant', faultCritical: 'Défaillance système refroidissement', element: 'VENTILATION'
      },
      fanSpeed: {
        label: 'Vitesse ventilateur', unit: 'tr/min', default: 2800, min: 500, max: 3500, step: 10, decimals: 0,
        threshold: { type: 'range', normalMin: 2200, normalMax: 3200, warningMin: 2200, warningMax: 3200, criticalMin: 1800, criticalMax: 3400 },
        sim: { nominal: 2800, noise: 28, drift: 8 },
        faultWarning: 'Ventilateur hors plage', faultCritical: 'Défaillance ventilateur', element: 'VENTILATION'
      },
      airFlow: {
        label: "Débit d'air", unit: 'm³/h', default: 850, min: 0, max: 1500, step: 5, decimals: 0,
        threshold: { type: 'min', warning: 600, critical: 400 },
        sim: { nominal: 850, noise: 12, drift: 4 },
        faultWarning: "Débit d'air réduit", faultCritical: 'Ventilation insuffisante — Risque surchauffe', element: 'VENTILATION'
      }
    }
  }
};

const STATUS_LABELS = { normal: 'Normal', warning: 'Dégradation', critical: 'Critique' };
const HEALTH_LABELS = [{ min: 90, label: 'Excellent' }, { min: 70, label: 'Bon' }, { min: 50, label: 'Moyen' }, { min: 0, label: 'Critique' }];

/* ============================================================
   CONSTANTES & ÉTAT GLOBAL
   ============================================================ */
const SIMULATION_INTERVAL = 800;
const CHART_MAX_POINTS = 60;
const STORAGE_KEY = 'motorSupervisionState';
const THEME_STORAGE_KEY = 'motorSupervisionTheme';
const OPERATION_REDUCTION_CRITICAL = 30;
const OPERATION_REDUCTION_WARNING = 8;
const GLOBAL_OPERATION_REDUCTION_CRITICAL = 30;
const GLOBAL_OPERATION_REDUCTION_WARNING = 5;
const COMPONENT_CHART_COLORS = ['#f85149','#388bfd','#39d353','#d29922','#a371f7'];

const state = {
  values: {}, componentHealth: {}, globalHealth: 100, operationLevel: 100,
  isRunning: false, manualMode: false, ventilationPresent: true,
  intervalId: null, previousAlarms: {}, chartLabels: [],
  simPhase: 0, alarmSoundActive: false, alarmHistory: [],
  activeFault: null, runStartTime: null, totalAlarmCount: 0,
  _animFrame: null, _fanAngle: 0, _rotorAngle: 0
};

const dom = {};
let chartTemperatures=null, chartVibrations=null, chartHealth=null, componentCharts={};
let alarmAudioContext=null, alarmSoundInterval=null;
let chartIndivTemp=null, chartIndivVib=null, chartIndivCurrent=null;
let chartIndivVoltage=null, chartIndivPressure=null, chartIndivSpeed=null, chartIndivEfficiency=null;

/* ============================================================
   POINT D'ENTRÉE
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'login') { initLoginPage(); return; }
  if (page === 'dashboard') { initDashboard(); return; }
  if (page === 'admin') { initAdminPage(); return; }
  if (page === 'intervention') initInterventionPage();
});

/* ============================================================
   DASHBOARD — Initialisation
   ============================================================ */
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
  startMotorAnimation();
  initAppNav('dashboard');
  updateDateTimeHeader();

  document.getElementById('btnClearAlarmHistory')?.addEventListener('click', () => {
    state.alarmHistory = [];
    renderAlarmHistoryTable();
    addLog('Historique des alarmes effacé.', 'info');
  });

  // Boutons simulation de défauts
  document.querySelectorAll('.btn-fault').forEach(btn => btn.addEventListener('click', () => injectFault(btn.dataset.fault)));
  document.getElementById('btnClearFault')?.addEventListener('click', clearFault);

  addLog(`Connexion réussie — Bienvenue, ${getLoggedInUser() || AUTH_CONFIG.username}.`, 'ok');
  addLog("Système de supervision SCADA initialisé. Démarrez la simulation ou injectez un défaut.", 'info');
}

/* ============================================================
   SIMULATION DE DÉFAUTS INDUSTRIELS
   ============================================================ */
const FAULT_PRESETS = {
  overheat_stator:    { label: 'Surchauffe stator',         apply: v => { v.stator.temperature=72; v.windings.temperature=65; v.ventilation.coolingTemp=58; } },
  overheat_windings:  { label: 'Surchauffe enroulements',   apply: v => { v.windings.temperature=68; v.windings.insulation=45; v.stator.temperature=58; } },
  vibration:          { label: 'Vibration excessive',        apply: v => { v.stator.vibration=5.8; v.rotor.vibration=6.2; v.shaft.vibration=7.1; v.bearings.vibration=5.3; v.shaft.alignment=0.75; } },
  lube_loss:          { label: 'Perte lubrification',        apply: v => { v.bearings.pressure=0.9; v.bearings.temperature=62; v.bearings.wear=85; } },
  undervoltage:       { label: 'Chute de tension',           apply: v => { v.stator.voltage=310; v.stator.current=22; v.rotor.speed=1150; v.shaft.speed=1150; } },
  overcurrent:        { label: 'Surintensité',               apply: v => { v.stator.current=28; v.windings.current=29; v.stator.temperature=60; v.windings.temperature=66; } },
  fan_failure:        { label: 'Panne ventilateur',          apply: v => { v.ventilation.fanSpeed=400; v.ventilation.airFlow=150; v.ventilation.coolingTemp=68; v.stator.temperature=58; } }
};

function injectFault(faultId) {
  const preset = FAULT_PRESETS[faultId];
  if (!preset) return;
  state.activeFault = faultId;
  state.manualMode = true;
  if (dom.manualModeToggle) dom.manualModeToggle.checked = true;
  if (dom.modeLabel) dom.modeLabel.textContent = 'Mode Manuel';
  preset.apply(state.values);
  updateUI(); appendChartData();
  document.querySelectorAll('.btn-fault').forEach(b => b.classList.toggle('active', b.dataset.fault === faultId));
  addLog(`🔧 DÉFAUT INJECTÉ : ${preset.label}`, 'alarm');
  saveToLocalStorage();
}

function clearFault() {
  state.activeFault = null;
  Object.keys(COMPONENTS).forEach(compId => {
    Object.keys(COMPONENTS[compId].params).forEach(paramId => {
      state.values[compId][paramId] = COMPONENTS[compId].params[paramId].default;
    });
  });
  state.manualMode = false;
  if (dom.manualModeToggle) dom.manualModeToggle.checked = false;
  if (dom.modeLabel) dom.modeLabel.textContent = 'Mode Auto';
  document.querySelectorAll('.btn-fault').forEach(b => b.classList.remove('active'));
  updateUI();
  addLog('✅ Défaut effacé — valeurs réinitialisées aux nominaux.', 'ok');
}

/* ============================================================
   ANIMATION RAF — Rotor + Ventilateur + Vibration schéma
   ============================================================ */
function startMotorAnimation() {
  const fanBlades = document.getElementById('fanBlades');
  const squirrelCage = document.getElementById('squirrelCage');
  const motorSvg = document.getElementById('motorSvg');

  function animate() {
    state._animFrame = requestAnimationFrame(animate);
    if (!state.isRunning) return;

    const speed = state.values.rotor?.speed ?? 1450;
    const fanSpd = state.values.ventilation?.fanSpeed ?? 2800;
    const avgVib = getAvgVibration();

    state._rotorAngle = (state._rotorAngle + (speed / 1500) * 3.5) % 360;
    state._fanAngle   = (state._fanAngle   + (fanSpd / 2800) * 5.0) % 360;

    if (squirrelCage) squirrelCage.setAttribute('transform', `rotate(${state._rotorAngle} 230 155)`);
    if (fanBlades && state.ventilationPresent) {
      fanBlades.setAttribute('transform', `rotate(${state._fanAngle} 80 155)`);
    }

    // Effet vibration : oscillation du SVG
    if (motorSvg) {
      if (avgVib > 1.5) {
        const intensity = Math.min((avgVib - 1.5) / 5, 1);
        const shake = Math.sin(Date.now() * 0.05) * intensity * 4;
        motorSvg.style.transform = `translateX(${shake}px)`;
      } else {
        motorSvg.style.transform = '';
      }
    }
  }
  animate();
}

/* ============================================================
   COMPTEURS + ANNEAU DE SANTÉ
   ============================================================ */
function updateCounters() {
  const runEl = document.getElementById('runHours');
  if (runEl && state.runStartTime) {
    const elapsed = Date.now() - state.runStartTime;
    const h = Math.floor(elapsed / 3600000);
    const m = Math.floor((elapsed % 3600000) / 60000);
    runEl.textContent = `${h}h ${String(m).padStart(2, '0')}m`;
  }
  const alEl = document.getElementById('totalAlarms');
  if (alEl) alEl.textContent = state.totalAlarmCount;

  const faEl = document.getElementById('activeFaultsCount');
  if (faEl) {
    const cs = computeGlobalState();
    let count = 0;
    Object.values(cs.componentStates).forEach(c => Object.values(c.paramStates).forEach(p => { if (p.status !== 'normal') count++; }));
    faEl.textContent = count;
  }

  const arc = document.getElementById('healthRingCircle');
  const val = document.getElementById('healthRingValue');
  if (arc && val) {
    const cs = computeGlobalState();
    const pct = state.globalHealth / 100;
    arc.style.strokeDashoffset = 2 * Math.PI * 34 * (1 - pct);
    const color = cs.worstGlobal === 'critical' ? 'var(--status-alarm)' : cs.worstGlobal === 'warning' ? 'var(--status-warning)' : 'var(--accent-cyan)';
    arc.style.stroke = color;
    val.textContent = `${state.globalHealth}%`;
    val.style.color = color;
  }
}

/* ============================================================
   JAUGES KPI
   ============================================================ */
function updateKpiGauges(global) {
  const temp = getAvgTemperature();
  const vib  = getAvgVibration();
  const eff  = getEstimatedEfficiency(global.globalHealth, global.operationLevel);
  const curr = state.values.stator?.current ?? 0;
  const volt = state.values.stator?.voltage ?? 400;
  const pres = state.values.bearings?.pressure ?? 3.2;
  const spd  = state.values.rotor?.speed ?? 1450;

  const tempSt  = evaluateParamStatus(COMPONENTS.stator.params.temperature, temp);
  const vibSt   = evaluateParamStatus(COMPONENTS.stator.params.vibration, vib);
  const currSt  = evaluateParamStatus(COMPONENTS.stator.params.current, curr);
  const voltSt  = evaluateParamStatus(COMPONENTS.stator.params.voltage, volt);
  const presSt  = evaluateParamStatus(COMPONENTS.bearings.params.pressure, pres);
  const spdSt   = evaluateParamStatus(COMPONENTS.rotor.params.speed, spd);
  const effSt   = eff >= 90 ? 'normal' : eff >= 75 ? 'warning' : 'critical';

  function setGauge(id, pct, status, dotId) {
    const g = document.getElementById(id);
    if (g) { g.style.width = `${Math.min(100, Math.max(0, pct))}%`; g.className = `kpi-gauge-fill gauge-${status}`; }
    const d = document.getElementById(dotId);
    if (d) d.className = `kpi-status-dot dot-${status}`;
  }
  setGauge('gaugeTemp',     (temp / 100) * 100,        tempSt,  'dotKpiTemp');
  setGauge('gaugeVib',      (vib / 15) * 100,          vibSt,   'dotKpiVib');
  setGauge('gaugeEff',      eff,                        effSt,   'dotKpiEff');
  setGauge('gaugeCurrent',  (curr / 35) * 100,          currSt,  'dotKpiCurrent');
  setGauge('gaugeVoltage',  ((volt - 280) / 220) * 100, voltSt,  'dotKpiVoltage');
  setGauge('gaugePressure', (pres / 6) * 100,           presSt,  'dotKpiPressure');
  setGauge('gaugeSpeed',    ((spd - 800) / 1000) * 100, spdSt,   'dotKpiSpeed');
}

/* ============================================================
   LEDs SCHÉMA MOTEUR
   ============================================================ */
function updateDiagramLeds(global) {
  const map = { ledStator: ['stator','windings'], ledRotor: ['rotor','shaft'], ledBearings: ['bearings'], ledFan: ['ventilation'] };
  Object.entries(map).forEach(([ledId, compIds]) => {
    const led = document.getElementById(ledId);
    if (!led) return;
    let worst = 'normal';
    compIds.forEach(cid => {
      const cs = global.componentStates[cid];
      if (!cs) return;
      if (cs.status === 'critical') worst = 'critical';
      else if (cs.status === 'warning' && worst !== 'critical') worst = 'warning';
    });
    led.setAttribute('fill', worst === 'critical' ? '#da3633' : worst === 'warning' ? '#d29922' : '#238636');
    led.style.filter = worst !== 'normal' ? (worst === 'critical' ? 'drop-shadow(0 0 5px #da3633)' : 'drop-shadow(0 0 4px #d29922)') : '';
  });
}

/* ============================================================
   DOM CACHE
   ============================================================ */
function cacheDOMElements() {
  dom.motorStatusIndicator = document.getElementById('motorStatusIndicator');
  dom.motorStatusText      = document.getElementById('motorStatusText');
  dom.healthStateLabel     = document.getElementById('healthStateLabel');
  dom.globalHealthBar      = document.getElementById('globalHealthBar');
  dom.globalHealthValue    = document.getElementById('globalHealthValue');
  dom.operationLevelBar    = document.getElementById('operationLevelBar');
  dom.operationLevelValue  = document.getElementById('operationLevelValue');
  dom.simulationBadge      = document.getElementById('simulationBadge');
  dom.btnStart             = document.getElementById('btnStart');
  dom.btnStop              = document.getElementById('btnStop');
  dom.btnReset             = document.getElementById('btnReset');
  dom.btnClearLog          = document.getElementById('btnClearLog');
  dom.eventLog             = document.getElementById('eventLog');
  dom.currentDateTime      = document.getElementById('currentDateTime');
  dom.manualModeToggle     = document.getElementById('manualModeToggle');
  dom.modeLabel            = document.getElementById('modeLabel');
  dom.activeAlarmsList     = document.getElementById('activeAlarmsList');
  dom.alarmCountBadge      = document.getElementById('alarmCountBadge');
  dom.alarmPanel           = document.getElementById('alarmPanel');
  dom.componentCards       = document.getElementById('componentCards');
  dom.kpiAvgTemp           = document.getElementById('kpiAvgTemp');
  dom.kpiAvgVibration      = document.getElementById('kpiAvgVibration');
  dom.kpiEfficiency        = document.getElementById('kpiEfficiency');
  dom.kpiCurrent           = document.getElementById('kpiCurrent');
  dom.kpiVoltage           = document.getElementById('kpiVoltage');
  dom.kpiSpeed             = document.getElementById('kpiSpeed');
  dom.kpiPressure          = document.getElementById('kpiPressure');
  dom.ventilationToggle    = document.getElementById('ventilationToggle');
  dom.ventilationCardWrap  = document.getElementById('ventilationCardWrap');
  dom.ventilationDiagramParts = document.querySelectorAll('[data-component="ventilation"]');
  dom.fanBlades            = document.getElementById('fanBlades');
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
  return Object.keys(COMPONENTS).filter(c => !(COMPONENTS[c].optional && !state.ventilationPresent));
}

/* ============================================================
   RENDU CARTES COMPOSANTS
   ============================================================ */
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
          <i class="bi ${comp.icon}"></i><span>${comp.label}</span>
          <span class="component-status-badge" id="status-badge-${compId}">Normal</span>
        </div>
        <div class="card-body">
          <div class="component-health-row">
            <span class="component-health-label">Bon état</span>
            <div class="health-bar-wrap sm"><div class="health-bar" id="health-bar-${compId}" style="width:100%"></div></div>
            <span class="component-health-value" id="health-value-${compId}">100 %</span>
          </div>
          <div class="component-operation"><span>Fonctionnement : <strong id="operation-${compId}">100 %</strong></span></div>
          <div class="component-zones"><small>${comp.zones.join(' · ')}</small></div>
          <div class="component-params" id="params-${compId}"></div>
          <div class="component-history">
            <small class="component-history-label"><i class="bi bi-graph-up"></i> Évolution des mesures</small>
            <div class="component-chart-wrap"><canvas id="comp-chart-${compId}"></canvas></div>
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
  dom.ventilationCardWrap?.classList.toggle('d-none', !state.ventilationPresent);
  dom.ventilationDiagramParts?.forEach(el => el.classList.toggle('d-none', !state.ventilationPresent));
}

/* ============================================================
   CONTRÔLES MANUELS
   ============================================================ */
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
        <button class="accordion-button ${idx>0?'collapsed':''}" type="button"
          data-bs-toggle="collapse" data-bs-target="#manual-${compId}">
          <i class="bi ${comp.icon} me-2"></i> ${comp.label}
        </button>
      </h2>
      <div id="manual-${compId}" class="accordion-collapse collapse ${idx===0?'show':''}" data-bs-parent="#manualControlsAccordion">
        <div class="accordion-body"><div class="row g-3" id="controls-${compId}"></div></div>
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
          <input type="range" class="form-range manual-slider" id="slider-${compId}-${paramId}"
            data-comp="${compId}" data-param="${paramId}"
            min="${param.min}" max="${param.max}" step="${param.step}" value="${param.default}">
          <div class="d-flex align-items-center gap-2 mt-1">
            <button type="button" class="btn btn-sm btn-outline-secondary btn-step-manual"
              data-comp="${compId}" data-param="${paramId}" data-dir="-1">−</button>
            <input type="number" class="form-control form-control-sm sensor-input manual-input"
              id="input-${compId}-${paramId}" data-comp="${compId}" data-param="${paramId}"
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

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */
function bindEvents() {
  dom.btnStart.addEventListener('click', startSimulation);
  dom.btnStop.addEventListener('click', stopSimulation);
  dom.btnReset.addEventListener('click', resetValues);
  dom.btnClearLog.addEventListener('click', clearLog);

  document.getElementById('btnIntervention')?.addEventListener('click', e => {
    e.preventDefault();
    saveInterventionContext(getCurrentMotorSnapshot());
    window.location.href = 'intervention.html?new=1';
  });

  dom.manualModeToggle?.addEventListener('change', () => {
    state.manualMode = dom.manualModeToggle.checked;
    if (dom.modeLabel) dom.modeLabel.textContent = state.manualMode ? 'Mode Manuel' : 'Mode Auto';
    addLog(state.manualMode ? 'Mode manuel activé — paramètres modifiables.' : 'Mode automatique — simulation temps réel.', state.manualMode ? 'warning' : 'info');
  });

  dom.ventilationToggle?.addEventListener('change', () => {
    state.ventilationPresent = dom.ventilationToggle.checked;
    updateVentilationVisibility();
    updateUI();
    addLog(state.ventilationPresent ? 'Ventilation activée.' : 'Ventilation désactivée.', 'info');
    saveToLocalStorage();
  });

  document.addEventListener('input', e => {
    if (e.target.classList.contains('manual-slider')) {
      const {comp,param} = e.target.dataset;
      if (comp && param) setParamValue(comp, param, parseFloat(e.target.value), true);
    }
    if (e.target.classList.contains('manual-input')) {
      const {comp,param} = e.target.dataset;
      const val = parseFloat(e.target.value);
      if (comp && param && !isNaN(val)) setParamValue(comp, param, val, true);
    }
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-step-manual');
    if (!btn) return;
    const {comp,param,dir} = btn.dataset;
    const config = COMPONENTS[comp].params[param];
    const step = config.step * (parseInt(dir,10)>0?1:-1) * (param==='speed'||param==='fanSpeed'?10:1);
    setParamValue(comp, param, state.values[comp][param] + step, true);
  });

  dom.diagramParts?.forEach(part => {
    part.addEventListener('click', () => {
      document.getElementById(`card-${part.dataset.component}`)?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    part.style.cursor = 'pointer';
  });
}

function updateDateTime() {
  if (!dom.currentDateTime) return;
  dom.currentDateTime.textContent = new Date().toLocaleString('fr-FR', {
    weekday:'short', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
}

/* ============================================================
   SIMULATION
   ============================================================ */
function startSimulation() {
  if (state.isRunning) return;
  state.isRunning = true;
  state.runStartTime = state.runStartTime || Date.now();
  dom.btnStart.disabled = true;
  dom.btnStop.disabled = false;
  dom.simulationBadge.textContent = 'SIMULATION EN COURS';
  dom.simulationBadge.classList.add('running');
  addLog('▶ Simulation démarrée — moteur en fonctionnement.', 'ok');
  state.intervalId = setInterval(simulationTick, SIMULATION_INTERVAL);
}

function stopSimulation() {
  if (!state.isRunning) return;
  state.isRunning = false;
  clearInterval(state.intervalId);
  state.intervalId = null;
  dom.btnStart.disabled = false;
  dom.btnStop.disabled = true;
  dom.simulationBadge.textContent = 'SIMULATION ARRÊTÉE';
  dom.simulationBadge.classList.remove('running');
  addLog('⏹ Simulation arrêtée.', 'warning');
  saveToLocalStorage();
}

function resetValues() {
  stopSimulation();
  state.manualMode = false; state.activeFault = null;
  state.totalAlarmCount = 0; state.runStartTime = null;
  state.alarmHistory = [];
  if (dom.manualModeToggle) dom.manualModeToggle.checked = false;
  if (dom.modeLabel) dom.modeLabel.textContent = 'Mode Auto';
  document.querySelectorAll('.btn-fault').forEach(b => b.classList.remove('active'));
  initComponentValues();
  state.chartLabels = [];
  stopPersistentAlarm();
  [chartTemperatures,chartVibrations,chartHealth,
   chartIndivTemp,chartIndivVib,chartIndivCurrent,
   chartIndivVoltage,chartIndivPressure,chartIndivSpeed,chartIndivEfficiency
  ].forEach(c => { if (!c) return; c.data.labels=[]; c.data.datasets.forEach(ds=>{ds.data=[];}); c.update('none'); });
  Object.values(componentCharts).forEach(c => { c.data.labels=[]; c.data.datasets.forEach(ds=>{ds.data=[];}); c.update('none'); });
  renderAlarmHistoryTable();
  updateUI();
  addLog('↺ Valeurs réinitialisées — tous les composants aux nominaux.', 'info');
  saveToLocalStorage();
}

function simulationTick() {
  state.simPhase += 0.15;
  if (!state.manualMode) {
    Object.entries(COMPONENTS).forEach(([compId, comp], ci) => {
      Object.entries(comp.params).forEach(([paramId, param], pi) => {
        const sim = param.sim;
        const cur = state.values[compId][paramId];
        const noise = (Math.random()-0.5)*2*sim.noise;
        const osc = Math.sin(state.simPhase + ci*1.1 + pi*0.7) * sim.drift;
        const correction = (sim.nominal - cur) * 0.025;
        state.values[compId][paramId] = roundValue(clamp(cur+noise+osc+correction, param.min, param.max), param.decimals);
      });
    });
  }
  updateUI(); appendChartData(); updateCounters(); saveToLocalStorage();
}

function setParamValue(compId, paramId, value, fromUser=false) {
  const param = COMPONENTS[compId].params[paramId];
  value = roundValue(clamp(value, param.min, param.max), param.decimals);
  state.values[compId][paramId] = value;
  if (fromUser && !state.manualMode) {
    state.manualMode = true;
    if (dom.manualModeToggle) dom.manualModeToggle.checked = true;
    if (dom.modeLabel) dom.modeLabel.textContent = 'Mode Manuel';
  }
  updateUI();
  if (state.isRunning || fromUser) appendChartData();
  saveToLocalStorage();
}

/* ============================================================
   ÉVALUATION DES SEUILS
   ============================================================ */
function evaluateParamStatus(param, value) {
  const t = param.threshold;
  if (t.type === 'min') {
    if (value <= t.critical) return 'critical';
    if (value <= t.warning) return 'warning';
    return 'normal';
  }
  if (t.type === 'range') {
    // Si normalMin/normalMax définis : plage normale au centre
    if (t.normalMin !== undefined) {
      if (value < t.criticalMin || value > t.criticalMax) return 'critical';
      if (value >= t.normalMin && value <= t.normalMax) return 'normal';
      if (value >= t.warningMin && value <= t.warningMax) return 'warning';
      return 'critical';
    }
    if (value < t.criticalMin || value > t.criticalMax) return 'critical';
    if (value < t.warningMin || value > t.warningMax) return 'warning';
    return 'normal';
  }
  // type 'max'
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
  let health=100, worstStatus='normal', warningCount=0, criticalCount=0;
  const paramStates = {};
  Object.entries(comp.params).forEach(([paramId, param]) => {
    const value = state.values[compId][paramId];
    const status = evaluateParamStatus(param, value);
    paramStates[paramId] = { value, status, param };
    if (status==='warning') { health-=12; warningCount++; }
    if (status==='critical') { health-=30; criticalCount++; }
    if (status==='critical') worstStatus='critical';
    else if (status==='warning' && worstStatus!=='critical') worstStatus='warning';
  });
  health = Math.max(0, Math.min(100, health));
  const operation = Math.max(25, 100 - criticalCount*OPERATION_REDUCTION_CRITICAL - warningCount*OPERATION_REDUCTION_WARNING);
  return { health, status: worstStatus, paramStates, operation, warningCount, criticalCount };
}

function computeGlobalState() {
  let totalWeight=0, weightedHealth=0, totalWarnings=0, totalCriticals=0, worstGlobal='normal';
  const componentStates = {};
  getActiveComponentIds().forEach(compId => {
    const cs = computeComponentState(compId);
    componentStates[compId] = cs;
    const w = COMPONENTS[compId].weight;
    totalWeight += w; weightedHealth += cs.health * w;
    totalWarnings += cs.warningCount; totalCriticals += cs.criticalCount;
    if (cs.status==='critical') worstGlobal='critical';
    else if (cs.status==='warning' && worstGlobal!=='critical') worstGlobal='warning';
  });
  const globalHealth = totalWeight ? Math.round(weightedHealth/totalWeight) : 100;
  const operationLevel = Math.max(25, 100 - totalCriticals*GLOBAL_OPERATION_REDUCTION_CRITICAL - totalWarnings*GLOBAL_OPERATION_REDUCTION_WARNING);
  return { globalHealth, operationLevel, worstGlobal, componentStates, totalWarnings, totalCriticals };
}

function getHealthLabel(h) { for (const l of HEALTH_LABELS) if (h>=l.min) return l.label; return 'Critique'; }
function getAvgTemperature() {
  const t=[];
  ['stator','windings','rotor','bearings','ventilation'].forEach(c=>{
    const v=state.values[c]; if(!v)return;
    if(v.temperature!==undefined)t.push(v.temperature);
    if(v.coolingTemp!==undefined)t.push(v.coolingTemp);
  });
  return t.length ? t.reduce((a,b)=>a+b,0)/t.length : 0;
}
function getAvgVibration() {
  const v=[];
  Object.values(state.values).forEach(p=>{if(p.vibration!==undefined)v.push(p.vibration);});
  return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0;
}
function getEstimatedEfficiency(gh,ol) { return Math.round((gh*0.6+ol*0.4)*0.92); }

/* ============================================================
   ALARME SONORE
   ============================================================ */
function playAlarmBeep() {
  try {
    if (!alarmAudioContext) alarmAudioContext = new (window.AudioContext||window.webkitAudioContext)();
    if (alarmAudioContext.state==='suspended') alarmAudioContext.resume();
    const osc=alarmAudioContext.createOscillator();
    const gain=alarmAudioContext.createGain();
    osc.connect(gain); gain.connect(alarmAudioContext.destination);
    osc.frequency.value=880; osc.type='square'; gain.gain.value=0.07;
    const t=alarmAudioContext.currentTime; osc.start(t); osc.stop(t+0.25);
  } catch(e){}
}
function startPersistentAlarm() { if(state.alarmSoundActive)return; state.alarmSoundActive=true; playAlarmBeep(); alarmSoundInterval=setInterval(playAlarmBeep,900); }
function stopPersistentAlarm() { state.alarmSoundActive=false; if(alarmSoundInterval){clearInterval(alarmSoundInterval);alarmSoundInterval=null;} }
function managePersistentAlarm(hasCritical) { if(hasCritical)startPersistentAlarm();else stopPersistentAlarm(); }

/* ============================================================
   MISE À JOUR DE L'INTERFACE (updateUI)
   ============================================================ */
function updateUI() {
  const global = computeGlobalState();
  state.globalHealth = global.globalHealth;
  state.operationLevel = global.operationLevel;

  Object.entries(global.componentStates).forEach(([compId, cs]) => {
    state.componentHealth[compId] = cs.health;
    const card=document.getElementById(`card-${compId}`);
    const badge=document.getElementById(`status-badge-${compId}`);
    const healthBar=document.getElementById(`health-bar-${compId}`);
    const healthVal=document.getElementById(`health-value-${compId}`);
    const opEl=document.getElementById(`operation-${compId}`);
    if(card){card.classList.remove('status-normal','status-warning','status-critical');card.classList.add(`status-${cs.status}`);}
    if(badge){badge.textContent=STATUS_LABELS[cs.status];badge.className=`component-status-badge status-${cs.status}`;}
    if(healthBar){healthBar.style.width=`${cs.health}%`;healthBar.className=`health-bar health-${cs.status}`;}
    if(healthVal)healthVal.textContent=`${cs.health} %`;
    if(opEl)opEl.textContent=`${cs.operation} %`;

    Object.entries(cs.paramStates).forEach(([paramId, ps]) => {
      const valEl=document.getElementById(`val-${compId}-${paramId}`);
      const dotEl=document.getElementById(`dot-${compId}-${paramId}`);
      const slider=document.getElementById(`slider-${compId}-${paramId}`);
      const input=document.getElementById(`input-${compId}-${paramId}`);
      const ctrlVal=document.getElementById(`ctrl-val-${compId}-${paramId}`);
      if(valEl)valEl.textContent=`${formatValue(ps.value,ps.param.decimals)} ${ps.param.unit}`;
      if(dotEl)dotEl.className=`param-status-dot ${ps.status}`;
      if(slider)slider.value=ps.value;
      if(input)input.value=ps.value;
      if(ctrlVal)ctrlVal.textContent=`${formatValue(ps.value,ps.param.decimals)} ${ps.param.unit}`;

      const isAlarm = ps.status !== 'normal';
      if (isAlarm && !state.previousAlarms[compId][paramId]) {
        const fault = getParamFaultMessage(ps.param, ps.status);
        const element = ps.param.element || COMPONENTS[compId].label;
        const fi = getFaultInfo(compId, paramId, ps.status);
        const icon = ps.status==='critical' ? '🔴' : '🟡';
        addLog(`${icon} ALARME [${element}] — ${fault} : ${formatValue(ps.value,ps.param.decimals)} ${ps.param.unit}`, ps.status==='critical'?'alarm':'warning');
        addLog(`  ↳ Cause : ${fi.cause}`, ps.status==='critical'?'alarm':'warning');
        addLog(`  ↳ Action : ${fi.action}`, ps.status==='critical'?'alarm':'warning');
        addAlarmToHistory(element, fault, formatValue(ps.value,ps.param.decimals), ps.param.unit, ps.status, fi.cause, fi.action);
        state.totalAlarmCount++;
      } else if (!isAlarm && state.previousAlarms[compId][paramId]) {
        addLog(`✅ ${COMPONENTS[compId].label} — ${ps.param.label} revenu à la normale.`, 'ok');
      }
      state.previousAlarms[compId][paramId] = isAlarm;
    });
  });

  // État global
  dom.motorStatusIndicator?.classList.toggle('alarm', global.worstGlobal==='critical');
  dom.motorStatusIndicator?.classList.toggle('warning', global.worstGlobal==='warning');
  if(dom.motorStatusText){
    const lbl=global.worstGlobal==='normal'?'NORMAL':global.worstGlobal==='warning'?'DÉGRADÉ':'CRITIQUE';
    dom.motorStatusText.textContent=lbl;
    dom.motorStatusText.className=`status-value ${global.worstGlobal==='normal'?'ok':global.worstGlobal}`;
  }
  if(dom.healthStateLabel)dom.healthStateLabel.textContent=getHealthLabel(global.globalHealth);
  if(dom.globalHealthBar){dom.globalHealthBar.style.width=`${global.globalHealth}%`;dom.globalHealthBar.className=`health-bar health-${global.worstGlobal==='normal'?'normal':global.worstGlobal}`;}
  if(dom.globalHealthValue)dom.globalHealthValue.textContent=`${global.globalHealth} %`;
  if(dom.operationLevelBar)dom.operationLevelBar.style.width=`${global.operationLevel}%`;
  if(dom.operationLevelValue)dom.operationLevelValue.textContent=`${global.operationLevel} %`;

  const avgTemp=getAvgTemperature(), avgVib=getAvgVibration(), eff=getEstimatedEfficiency(global.globalHealth,global.operationLevel);
  if(dom.kpiAvgTemp)dom.kpiAvgTemp.textContent=`${formatValue(avgTemp,1)} °C`;
  if(dom.kpiAvgVibration)dom.kpiAvgVibration.textContent=`${formatValue(avgVib,1)} mm/s`;
  if(dom.kpiEfficiency)dom.kpiEfficiency.textContent=`${eff} %`;
  if(dom.kpiCurrent)dom.kpiCurrent.textContent=`${formatValue(state.values.stator?.current??0,1)} A`;
  if(dom.kpiVoltage)dom.kpiVoltage.textContent=`${formatValue(state.values.stator?.voltage??0,0)} V`;
  if(dom.kpiSpeed)dom.kpiSpeed.textContent=`${formatValue(state.values.rotor?.speed??0,0)} tr/min`;
  if(dom.kpiPressure)dom.kpiPressure.textContent=`${formatValue(state.values.bearings?.pressure??0,2)} bar`;

  updateKpiGauges(global);
  updateActiveAlarms(global);
  updateMotorDiagram(global);
  updateDiagramLeds(global);
  managePersistentAlarm(global.totalCriticals>0);

  document.querySelectorAll('[data-component-manual]').forEach(el => {
    if(COMPONENTS[el.dataset.componentManual]?.optional) el.classList.toggle('d-none',!state.ventilationPresent);
  });
}

/* ============================================================
   PANNEAU ALARMES ACTIVES — Diagnostic enrichi
   ============================================================ */
function updateActiveAlarms(global) {
  if(!dom.activeAlarmsList)return;
  const alarms=[];
  Object.entries(global.componentStates).forEach(([compId,cs])=>{
    Object.entries(cs.paramStates).forEach(([paramId,ps])=>{
      if(ps.status==='normal')return;
      const fi=getFaultInfo(compId,paramId,ps.status);
      alarms.push({
        compLabel:COMPONENTS[compId].label, paramLabel:ps.param.label,
        value:ps.value, unit:ps.param.unit, decimals:ps.param.decimals,
        status:ps.status, fault:getParamFaultMessage(ps.param,ps.status),
        cause:fi.cause, action:fi.action, element:ps.param.element||COMPONENTS[compId].label
      });
    });
  });

  if(dom.alarmCountBadge){dom.alarmCountBadge.textContent=alarms.length;dom.alarmCountBadge.classList.toggle('d-none',alarms.length===0);}
  dom.alarmPanel?.classList.toggle('has-alarms',alarms.some(a=>a.status==='critical'));

  if(!alarms.length){
    dom.activeAlarmsList.innerHTML='<p class="text-muted mb-0 no-alarm-msg"><i class="bi bi-check-circle text-success me-2"></i>Aucune alarme active — tous les composants fonctionnent normalement.</p>';
    return;
  }
  dom.activeAlarmsList.innerHTML=alarms.map(a=>`
    <div class="active-alarm-item status-${a.status}">
      <div class="active-alarm-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
      <div class="active-alarm-body">
        <div class="active-alarm-title">
          <span class="badge alarm-badge-${a.status} me-2">${a.status==='critical'?'CRITIQUE':'DÉGRADATION'}</span>
          <strong>${a.element}</strong> — ${a.fault}
        </div>
        <div class="active-alarm-value"><i class="bi bi-bar-chart-line me-1"></i>${a.paramLabel} : <strong>${formatValue(a.value,a.decimals)} ${a.unit}</strong></div>
        <div class="active-alarm-cause"><i class="bi bi-search me-1"></i>Cause probable : ${a.cause}</div>
        <div class="active-alarm-action"><i class="bi bi-tools me-1"></i>Action recommandée : <strong>${a.action}</strong></div>
      </div>
    </div>`).join('');
}

/* ============================================================
   SCHÉMA MOTEUR — Colorisation + effet vibration arbre
   ============================================================ */
function updateMotorDiagram(global) {
  dom.diagramParts?.forEach(part=>{
    const compId=part.dataset.component;
    if(COMPONENTS[compId]?.optional&&!state.ventilationPresent)return;
    const cs=global.componentStates[compId]; if(!cs)return;
    part.classList.remove('diagram-normal','diagram-warning','diagram-critical');
    part.classList.add(`diagram-${cs.status}`);
  });
  const shaft=document.getElementById('svgShaft');
  const avgVib=getAvgVibration();
  if(shaft){ shaft.style.filter=avgVib>4?'drop-shadow(0 0 6px #da3633)':avgVib>2?'drop-shadow(0 0 4px #d29922)':''; }
}

/* ============================================================
   HISTORIQUE DES ALARMES
   ============================================================ */
function addAlarmToHistory(element, defaut, valeur, unite, niveau, cause, action) {
  const now=new Date();
  state.alarmHistory.unshift({
    date:now.toLocaleDateString('fr-FR'),
    heure:now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),
    element, defaut, valeur:`${valeur} ${unite}`,
    cause:cause||'—', action:action||'—', niveau
  });
  if(state.alarmHistory.length>100)state.alarmHistory.pop();
  renderAlarmHistoryTable();
}

function renderAlarmHistoryTable() {
  const tbody=document.getElementById('alarmHistoryBody'); if(!tbody)return;
  const empty=document.getElementById('alarmHistoryEmpty');
  tbody.querySelectorAll('tr.alarm-history-row').forEach(r=>r.remove());
  if(!state.alarmHistory.length){if(empty)empty.style.display='';return;}
  if(empty)empty.style.display='none';
  state.alarmHistory.forEach(entry=>{
    const tr=document.createElement('tr');
    tr.className=`alarm-history-row alarm-history-${entry.niveau}`;
    tr.innerHTML=`
      <td>${entry.date}</td>
      <td class="font-mono">${entry.heure}</td>
      <td><strong>${entry.element}</strong></td>
      <td>${entry.defaut}</td>
      <td class="font-mono">${entry.valeur}</td>
      <td class="small text-muted">${entry.cause}</td>
      <td class="small"><strong>${entry.action}</strong></td>
      <td><span class="badge alarm-history-badge-${entry.niveau}">${entry.niveau==='critical'?'Critique':'Dégradation'}</span></td>`;
    tbody.appendChild(tr);
  });
}

/* ============================================================
   GRAPHIQUES INDIVIDUELS PAR PARAMÈTRE (avec zones colorées)
   ============================================================ */
function getChartThemeColors() {
  const s=getComputedStyle(document.documentElement);
  return {
    tick:  s.getPropertyValue('--chart-tick').trim()  ||'#6e7681',
    grid:  s.getPropertyValue('--chart-grid').trim()  ||'rgba(255,255,255,0.05)',
    legend:s.getPropertyValue('--chart-legend').trim()||'#8b949e'
  };
}

function getIndivChartOptions(yLabel, yMin, yMax, colors) {
  return {
    responsive:true, maintainAspectRatio:false, animation:{duration:150},
    interaction:{mode:'index',intersect:false},
    plugins:{
      legend:{display:true,labels:{color:colors.legend,font:{size:10},boxWidth:10}},
      tooltip:{callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.raw} ${yLabel}`}}
    },
    scales:{
      x:{display:false,ticks:{color:colors.tick},grid:{color:colors.grid}},
      y:{min:yMin,max:yMax,ticks:{color:colors.tick,font:{size:9},maxTicksLimit:5},
         grid:{color:colors.grid},title:{display:true,text:yLabel,color:colors.legend,font:{size:10}}}
    }
  };
}

function makeThresholdPlugin(id, zones) {
  return {
    id:`thresholdZones_${id}`,
    beforeDraw(chart){
      const{ctx,chartArea:{top,bottom,left,right},scales:{y}}=chart;
      if(!y||!ctx)return;
      ctx.save(); ctx.beginPath(); ctx.rect(left,top,right-left,bottom-top); ctx.clip();
      zones.forEach(zone=>{
        const yTop=Math.max(top,y.getPixelForValue(zone.max));
        const yBottom=Math.min(bottom,y.getPixelForValue(zone.min));
        if(yBottom<=yTop)return;
        ctx.fillStyle=zone.color; ctx.fillRect(left,yTop,right-left,yBottom-yTop);
      });
      ctx.restore();
    }
  };
}

function initIndividualCharts() {
  const colors=getChartThemeColors();
  const mk=(canvasId,label,color,yMin,yMax,unit,zones)=>{
    const el=document.getElementById(canvasId); if(!el)return null;
    return new Chart(el.getContext('2d'),{
      type:'line',
      data:{labels:[],datasets:[{label,data:[],borderColor:color,borderWidth:2.5,pointRadius:0,tension:0.4,fill:true,backgroundColor:color+'18'}]},
      options:getIndivChartOptions(unit,yMin,yMax,colors),
      plugins:[makeThresholdPlugin(canvasId,zones)]
    });
  };
  chartIndivTemp     =mk('chartIndivTemp','Temp. stator (°C)','#f85149',0,100,'°C',[{min:0,max:37,color:'rgba(35,134,54,0.12)'},{min:37,max:55,color:'rgba(210,153,34,0.15)'},{min:55,max:100,color:'rgba(218,54,51,0.15)'}]);
  chartIndivVib      =mk('chartIndivVib','Vibrations (mm/s)','#a371f7',0,15,'mm/s',[{min:0,max:2,color:'rgba(35,134,54,0.12)'},{min:2,max:4,color:'rgba(210,153,34,0.15)'},{min:4,max:15,color:'rgba(218,54,51,0.15)'}]);
  chartIndivCurrent  =mk('chartIndivCurrent','Courant (A)','#d29922',0,35,'A',[{min:0,max:18,color:'rgba(35,134,54,0.12)'},{min:18,max:25,color:'rgba(210,153,34,0.15)'},{min:25,max:35,color:'rgba(218,54,51,0.15)'}]);
  chartIndivVoltage  =mk('chartIndivVoltage','Tension (V)','#388bfd',280,500,'V',[{min:280,max:340,color:'rgba(218,54,51,0.15)'},{min:340,max:380,color:'rgba(210,153,34,0.15)'},{min:380,max:420,color:'rgba(35,134,54,0.12)'},{min:420,max:450,color:'rgba(210,153,34,0.15)'},{min:450,max:500,color:'rgba(218,54,51,0.15)'}]);
  chartIndivPressure =mk('chartIndivPressure','Pression (bar)','#39d353',0,6,'bar',[{min:0,max:1.5,color:'rgba(218,54,51,0.15)'},{min:1.5,max:2.5,color:'rgba(210,153,34,0.15)'},{min:2.5,max:4,color:'rgba(35,134,54,0.12)'},{min:4,max:6,color:'rgba(210,153,34,0.10)'}]);
  chartIndivSpeed    =mk('chartIndivSpeed','Vitesse (tr/min)','#58a6ff',800,1800,'tr/min',[{min:800,max:1200,color:'rgba(218,54,51,0.15)'},{min:1200,max:1400,color:'rgba(210,153,34,0.15)'},{min:1400,max:1500,color:'rgba(35,134,54,0.12)'},{min:1500,max:1800,color:'rgba(210,153,34,0.10)'}]);
  chartIndivEfficiency=mk('chartIndivEfficiency','Rendement (%)','#39d353',0,100,'%',[{min:0,max:75,color:'rgba(218,54,51,0.15)'},{min:75,max:90,color:'rgba(210,153,34,0.15)'},{min:90,max:100,color:'rgba(35,134,54,0.12)'}]);
}

function appendIndividualChartsData(label, eff) {
  const MAX=CHART_MAX_POINTS;
  function push(chart,val){
    if(!chart)return;
    chart.data.labels.push(label); if(chart.data.labels.length>MAX)chart.data.labels.shift();
    chart.data.datasets[0].data.push(val); if(chart.data.datasets[0].data.length>MAX)chart.data.datasets[0].data.shift();
    chart.update('none');
  }
  push(chartIndivTemp,      state.values.stator?.temperature??null);
  push(chartIndivVib,       state.values.stator?.vibration??null);
  push(chartIndivCurrent,   state.values.stator?.current??null);
  push(chartIndivVoltage,   state.values.stator?.voltage??null);
  push(chartIndivPressure,  state.values.bearings?.pressure??null);
  push(chartIndivSpeed,     state.values.rotor?.speed??null);
  push(chartIndivEfficiency,eff??null);
}

/* ============================================================
   GRAPHIQUES HISTORIQUES
   ============================================================ */
function getChartOptions(yLabel) {
  const colors=getChartThemeColors();
  return {
    responsive:true,maintainAspectRatio:false,animation:{duration:300},
    interaction:{mode:'index',intersect:false},
    plugins:{legend:{labels:{color:colors.legend,font:{family:'Roboto Mono',size:11}}}},
    scales:{
      x:{ticks:{color:colors.tick,maxTicksLimit:8,font:{size:10}},grid:{color:colors.grid}},
      y:{ticks:{color:colors.tick,font:{size:10}},grid:{color:colors.grid},title:{display:true,text:yLabel,color:colors.legend,font:{size:11}}}
    }
  };
}

function refreshChartsTheme() {
  const colors=getChartThemeColors();
  [chartTemperatures,chartVibrations,chartHealth,
   chartIndivTemp,chartIndivVib,chartIndivCurrent,
   chartIndivVoltage,chartIndivPressure,chartIndivSpeed,chartIndivEfficiency
  ].forEach(c=>{
    if(!c)return;
    c.options.plugins.legend.labels.color=colors.legend;
    Object.values(c.options.scales).forEach(s=>{
      if(s.ticks)s.ticks.color=colors.tick;
      if(s.grid)s.grid.color=colors.grid;
      if(s.title)s.title.color=colors.legend;
    });
    c.update('none');
  });
  Object.values(componentCharts).forEach(c=>{
    c.options.plugins.legend.labels.color=colors.legend;
    Object.values(c.options.scales).forEach(s=>{ if(s.ticks)s.ticks.color=colors.tick; if(s.grid)s.grid.color=colors.grid; });
    c.update('none');
  });
}

function initCharts() {
  const ctxTemp=document.getElementById('chartTemperatures')?.getContext('2d');
  const ctxVib=document.getElementById('chartVibrations')?.getContext('2d');
  const ctxHealth=document.getElementById('chartHealth')?.getContext('2d');
  if(!ctxTemp||!ctxVib||!ctxHealth)return;
  chartTemperatures=new Chart(ctxTemp,{type:'line',data:{labels:[],datasets:[
    {label:'Stator (°C)',data:[],borderColor:'#f85149',borderWidth:2,pointRadius:0,tension:0.3},
    {label:'Enroulements (°C)',data:[],borderColor:'#d29922',borderWidth:2,pointRadius:0,tension:0.3},
    {label:'Rotor (°C)',data:[],borderColor:'#388bfd',borderWidth:2,pointRadius:0,tension:0.3}
  ]},options:getChartOptions('°C')});
  chartVibrations=new Chart(ctxVib,{type:'line',data:{labels:[],datasets:[
    {label:'Stator (mm/s)',data:[],borderColor:'#f85149',borderWidth:2,pointRadius:0,tension:0.3},
    {label:'Rotor (mm/s)',data:[],borderColor:'#388bfd',borderWidth:2,pointRadius:0,tension:0.3},
    {label:'Arbre (mm/s)',data:[],borderColor:'#39d353',borderWidth:2,pointRadius:0,tension:0.3}
  ]},options:getChartOptions('mm/s')});
  chartHealth=new Chart(ctxHealth,{type:'line',data:{labels:[],datasets:[
    {label:'Santé (%)',data:[],borderColor:'#39d353',borderWidth:2,pointRadius:0,tension:0.3,fill:true,backgroundColor:'rgba(57,211,83,0.08)'},
    {label:'Fonctionnement (%)',data:[],borderColor:'#388bfd',borderWidth:2,pointRadius:0,tension:0.3}
  ]},options:getChartOptions('%')});
}

function appendChartData() {
  const label=new Date().toLocaleTimeString('fr-FR');
  state.chartLabels.push(label);
  if(state.chartLabels.length>CHART_MAX_POINTS)state.chartLabels.shift();
  const global=computeGlobalState();
  if(chartTemperatures){
    chartTemperatures.data.labels=[...state.chartLabels];
    chartTemperatures.data.datasets[0].data.push(state.values.stator.temperature);
    chartTemperatures.data.datasets[1].data.push(state.values.windings.temperature);
    chartTemperatures.data.datasets[2].data.push(state.values.rotor.temperature);
    chartTemperatures.data.datasets.forEach(ds=>{if(ds.data.length>CHART_MAX_POINTS)ds.data.shift();});
    chartTemperatures.update('none');
  }
  if(chartVibrations){
    chartVibrations.data.labels=[...state.chartLabels];
    chartVibrations.data.datasets[0].data.push(state.values.stator.vibration);
    chartVibrations.data.datasets[1].data.push(state.values.rotor.vibration);
    chartVibrations.data.datasets[2].data.push(state.values.shaft.vibration);
    chartVibrations.data.datasets.forEach(ds=>{if(ds.data.length>CHART_MAX_POINTS)ds.data.shift();});
    chartVibrations.update('none');
  }
  if(chartHealth){
    chartHealth.data.labels=[...state.chartLabels];
    chartHealth.data.datasets[0].data.push(global.globalHealth);
    chartHealth.data.datasets[1].data.push(global.operationLevel);
    chartHealth.data.datasets.forEach(ds=>{if(ds.data.length>CHART_MAX_POINTS)ds.data.shift();});
    chartHealth.update('none');
  }
  const eff=getEstimatedEfficiency(global.globalHealth,global.operationLevel);
  appendIndividualChartsData(label,eff);
  appendComponentChartData();
}

function getComponentChartOptions() {
  const colors=getChartThemeColors();
  return {
    responsive:true,maintainAspectRatio:false,animation:{duration:200},interaction:{mode:'index',intersect:false},
    plugins:{legend:{display:true,labels:{color:colors.legend,font:{size:9},boxWidth:10}}},
    scales:{
      x:{display:false,ticks:{color:colors.tick},grid:{color:colors.grid}},
      y:{display:true,ticks:{color:colors.tick,font:{size:8},maxTicksLimit:4},grid:{color:colors.grid}}
    }
  };
}

function initComponentCharts() {
  componentCharts={};
  Object.keys(COMPONENTS).forEach(compId=>{
    const canvas=document.getElementById(`comp-chart-${compId}`); if(!canvas)return;
    const paramEntries=Object.entries(COMPONENTS[compId].params).slice(0,3);
    componentCharts[compId]=new Chart(canvas.getContext('2d'),{
      type:'line',
      data:{labels:[],datasets:paramEntries.map(([paramId,param],i)=>({
        label:param.label,paramId,data:[],
        borderColor:COMPONENT_CHART_COLORS[i%COMPONENT_CHART_COLORS.length],
        borderWidth:1.5,pointRadius:0,tension:0.3
      }))},
      options:getComponentChartOptions()
    });
  });
}

function appendComponentChartData() {
  if(!state.chartLabels.length)return;
  Object.keys(componentCharts).forEach(compId=>{
    if(COMPONENTS[compId]?.optional&&!state.ventilationPresent)return;
    const chart=componentCharts[compId]; if(!chart)return;
    chart.data.labels=[...state.chartLabels];
    chart.data.datasets.forEach(ds=>{
      const val=state.values[compId]?.[ds.paramId];
      ds.data.push(val!==undefined?val:null);
      if(ds.data.length>CHART_MAX_POINTS)ds.data.shift();
    });
    chart.update('none');
  });
}

/* ============================================================
   JOURNAL D'ÉVÉNEMENTS
   ============================================================ */
function addLog(message,type='info'){
  if(!dom.eventLog)return;
  const entry=document.createElement('div');
  entry.className=`log-entry log-${type}`;
  entry.innerHTML=`<span class="log-time">${new Date().toLocaleTimeString('fr-FR')}</span><span class="log-message">${message}</span>`;
  dom.eventLog.prepend(entry);
  while(dom.eventLog.children.length>100)dom.eventLog.removeChild(dom.eventLog.lastChild);
}
function clearLog(){ if(dom.eventLog)dom.eventLog.innerHTML=''; addLog('Journal effacé.','info'); }

/* ============================================================
   LOCALSTORAGE
   ============================================================ */
function saveToLocalStorage(){
  try{
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      values:state.values, globalHealth:state.globalHealth,
      operationLevel:state.operationLevel, ventilationPresent:state.ventilationPresent,
      chartLabels:state.chartLabels,
      chartData:{
        statorTemp:chartTemperatures?.data.datasets[0].data||[],
        windingsTemp:chartTemperatures?.data.datasets[1].data||[],
        rotorTemp:chartTemperatures?.data.datasets[2].data||[],
        statorVib:chartVibrations?.data.datasets[0].data||[],
        rotorVib:chartVibrations?.data.datasets[1].data||[],
        shaftVib:chartVibrations?.data.datasets[2].data||[],
        health:chartHealth?.data.datasets[0].data||[],
        operation:chartHealth?.data.datasets[1].data||[],
        componentCharts:Object.fromEntries(Object.entries(componentCharts).map(([cid,chart])=>[cid,chart.data.datasets.map(ds=>({paramId:ds.paramId,data:ds.data}))]))
      }
    }));
  }catch(e){}
}

function loadFromLocalStorage(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY); if(!raw)return;
    const data=JSON.parse(raw);
    if(data.values){
      Object.keys(COMPONENTS).forEach(compId=>{
        if(!data.values[compId])return;
        Object.keys(COMPONENTS[compId].params).forEach(paramId=>{
          if(data.values[compId][paramId]!==undefined){
            const p=COMPONENTS[compId].params[paramId];
            state.values[compId][paramId]=clamp(data.values[compId][paramId],p.min,p.max);
          }
        });
      });
    }
    if(data.ventilationPresent!==undefined){
      state.ventilationPresent=data.ventilationPresent;
      if(dom.ventilationToggle)dom.ventilationToggle.checked=state.ventilationPresent;
      updateVentilationVisibility();
    }
    if(data.chartLabels&&data.chartData){
      state.chartLabels=data.chartLabels.slice(-CHART_MAX_POINTS);
      const cd=data.chartData;
      if(chartTemperatures){
        chartTemperatures.data.labels=[...state.chartLabels];
        chartTemperatures.data.datasets[0].data=(cd.statorTemp||[]).slice(-CHART_MAX_POINTS);
        chartTemperatures.data.datasets[1].data=(cd.windingsTemp||[]).slice(-CHART_MAX_POINTS);
        chartTemperatures.data.datasets[2].data=(cd.rotorTemp||[]).slice(-CHART_MAX_POINTS);
        chartTemperatures.update('none');
      }
      if(chartVibrations){
        chartVibrations.data.labels=[...state.chartLabels];
        chartVibrations.data.datasets[0].data=(cd.statorVib||[]).slice(-CHART_MAX_POINTS);
        chartVibrations.data.datasets[1].data=(cd.rotorVib||[]).slice(-CHART_MAX_POINTS);
        chartVibrations.data.datasets[2].data=(cd.shaftVib||[]).slice(-CHART_MAX_POINTS);
        chartVibrations.update('none');
      }
      if(chartHealth){
        chartHealth.data.labels=[...state.chartLabels];
        chartHealth.data.datasets[0].data=(cd.health||[]).slice(-CHART_MAX_POINTS);
        chartHealth.data.datasets[1].data=(cd.operation||[]).slice(-CHART_MAX_POINTS);
        chartHealth.update('none');
      }
      if(cd.componentCharts){
        Object.entries(cd.componentCharts).forEach(([compId,datasets])=>{
          const chart=componentCharts[compId]; if(!chart)return;
          chart.data.labels=[...state.chartLabels];
          datasets.forEach(saved=>{
            const ds=chart.data.datasets.find(d=>d.paramId===saved.paramId);
            if(ds)ds.data=(saved.data||[]).slice(-CHART_MAX_POINTS);
          });
          chart.update('none');
        });
      }
    }
    updateUI(); addLog('État restauré depuis la session précédente.','info');
  }catch(e){}
}

/* ============================================================
   UTILITAIRES
   ============================================================ */
function clamp(v,min,max){return Math.min(Math.max(v,min),max);}
function roundValue(v,d){const f=Math.pow(10,d);return Math.round(v*f)/f;}
function formatValue(v,d){return d===0?Math.round(v).toString():v.toFixed(d);}

/* ============================================================
   THÈME
   ============================================================ */
function getCurrentTheme(){return document.documentElement.getAttribute('data-theme')||'dark';}
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme',theme);
  document.documentElement.setAttribute('data-bs-theme',theme==='light'?'light':'dark');
  localStorage.setItem(THEME_STORAGE_KEY,theme);
  updateThemeToggleButton();
  if(chartTemperatures||chartVibrations||chartHealth)refreshChartsTheme();
}
function toggleTheme(){applyTheme(getCurrentTheme()==='dark'?'light':'dark');}
function updateThemeToggleButton(){
  const btn=document.getElementById('btnThemeToggle'); if(!btn)return;
  const isDark=getCurrentTheme()==='dark';
  btn.innerHTML=`<i class="bi ${isDark?'bi-sun-fill':'bi-moon-fill'}"></i>`;
  if(btn.classList.contains('btn-theme-login'))btn.innerHTML+=isDark?' Mode clair':' Mode sombre';
  btn.title=isDark?'Activer le mode clair':'Activer le mode sombre';
}
function initThemeToggle(){
  updateThemeToggleButton();
  const btn=document.getElementById('btnThemeToggle');
  if(btn&&!btn.dataset.bound){btn.dataset.bound='true';btn.addEventListener('click',toggleTheme);}
}

/* ============================================================
   PAGE ADMIN
   ============================================================ */
function initAdminPage(){
  if(!requireAuth())return;
  initAppNav('admin'); updateDateTimeHeader();
  const profile=getAdminProfile(), session=getSessionInfo();
  const fields={'admin-fullName':profile.fullName,'admin-username':profile.username,'admin-role':profile.role,'admin-department':profile.department,'admin-email':profile.email,'admin-access':profile.accessLevel,'admin-loginTime':formatLoginDate(session?.loginTime)};
  Object.entries(fields).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.textContent=val;});
  const pd=document.getElementById('admin-password'), btnT=document.getElementById('btnToggleAdminPassword');
  let pv=false;
  if(pd)pd.textContent='•••••••••••';
  if(btnT&&pd){btnT.addEventListener('click',()=>{pv=!pv;pd.textContent=pv?AUTH_CONFIG.password:'•••••••••••';btnT.innerHTML=pv?'<i class="bi bi-eye-slash"></i> Masquer':'<i class="bi bi-eye"></i> Afficher';});}
  document.getElementById('btnLogoutCard')?.addEventListener('click',logout);
}

function updateDateTimeHeader(){
  const el=document.getElementById('currentDateTime'); if(!el)return;
  const update=()=>{el.textContent=new Date().toLocaleString('fr-FR',{weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});};
  update();
  if(!window._dateTimeInterval)window._dateTimeInterval=setInterval(update,1000);
}

/* ============================================================
   FICHES D'INTERVENTION
   ============================================================ */
const INTERVENTION_STORAGE_KEY='motorSupervisionInterventions';
const INTERVENTION_CONTEXT_KEY='motorSupervisionInterventionContext';
const INTERVENTION_LABELS={
  type:{corrective:'Corrective',preventive:'Préventive',alarme:'Suite à alarme',inspection:'Inspection'},
  priorite:{basse:'Basse',normale:'Normale',haute:'Haute',urgente:'Urgente'},
  statut:{ouverte:'Ouverte',en_cours:'En cours',cloturee:'Clôturée'},
  resultat:{OK:'Moteur OK',ALARME:'Alarme persistante',A_SUIVRE:'À compléter'}
};

function getCurrentMotorSnapshot(){
  const global=computeGlobalState();
  const alarmDetails=[];
  Object.entries(global.componentStates).forEach(([compId,cs])=>{
    Object.entries(cs.paramStates).forEach(([paramId,ps])=>{
      if(ps.status==='normal')return;
      alarmDetails.push(`[${COMPONENTS[compId].label}] ${getParamFaultMessage(ps.param,ps.status)} : ${formatValue(ps.value,ps.param.decimals)} ${ps.param.unit}`);
    });
  });
  return {values:JSON.parse(JSON.stringify(state.values)),globalHealth:global.globalHealth,operationLevel:global.operationLevel,motorStatus:global.worstGlobal==='critical'?'ALARME':global.worstGlobal==='warning'?'ALERTE':'OK',alarmDetails,capturedAt:new Date().toISOString()};
}
function saveInterventionContext(snapshot){try{sessionStorage.setItem(INTERVENTION_CONTEXT_KEY,JSON.stringify(snapshot));}catch(e){}}
function loadInterventionContext(){try{const raw=sessionStorage.getItem(INTERVENTION_CONTEXT_KEY);if(raw)return JSON.parse(raw);}catch(e){}return getMotorSnapshotFromStorage();}
function getMotorSnapshotFromStorage(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return null;
    const data=JSON.parse(raw);if(!data.values||!data.values.stator)return null;
    const saved=data.values,prev=state.values;
    state.values=saved;const global=computeGlobalState();state.values=prev;
    const alarmDetails=[];
    Object.entries(global.componentStates).forEach(([compId,cs])=>{Object.entries(cs.paramStates).forEach(([paramId,ps])=>{if(ps.status==='normal')return;alarmDetails.push(`[${COMPONENTS[compId].label}] ${getParamFaultMessage(ps.param,ps.status)}`);});});
    return{values:saved,globalHealth:global.globalHealth,operationLevel:global.operationLevel,motorStatus:global.worstGlobal!=='normal'?'ALARME':'OK',alarmDetails,capturedAt:new Date().toISOString()};
  }catch(e){return null;}
}
function loadInterventions(){try{return JSON.parse(localStorage.getItem(INTERVENTION_STORAGE_KEY))||[];}catch(e){return[];}}
function saveInterventionsList(list){localStorage.setItem(INTERVENTION_STORAGE_KEY,JSON.stringify(list));}
function generateInterventionReference(){
  const list=loadInterventions(),today=new Date();
  const pad=n=>String(n).padStart(2,'0');
  const ds=`${today.getFullYear()}${pad(today.getMonth()+1)}${pad(today.getDate())}`;
  return `INT-${ds}-${String(list.filter(i=>i.reference&&i.reference.includes(ds)).length+1).padStart(3,'0')}`;
}
function createEmptyIntervention(snapshot){
  const now=new Date(),pad=n=>String(n).padStart(2,'0');
  const dateStr=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const timeStr=`${pad(now.getHours())}:${pad(now.getMinutes())}`;
  let motif='',type='preventive',priorite='normale';
  if(snapshot?.motorStatus==='ALARME'){type='alarme';priorite='haute';motif=snapshot.alarmDetails?.length?`Alarme détectée :\n${snapshot.alarmDetails.join('\n')}`:'Intervention suite à alarme moteur.';}
  return{id:`int-${Date.now()}`,reference:generateInterventionReference(),date:dateStr,technicien:getLoggedInUser()||AUTH_CONFIG.username,equipement:"Moteur asynchrone triphasé à cage d'écureuil",type,priorite,statut:'ouverte',mesures:{...(snapshot?.values||{}),globalHealth:snapshot?.globalHealth,operationLevel:snapshot?.operationLevel},motorStatus:snapshot?.motorStatus||'OK',motif,actions:'',pieces:'',heureDebut:timeStr,heureFin:'',resultat:snapshot?.motorStatus==='ALARME'?'A_SUIVRE':'OK',observations:'',createdAt:now.toISOString(),updatedAt:now.toISOString()};
}

function initInterventionPage(){
  if(!requireAuth())return;
  initAppNav('intervention');updateDateTimeHeader();
  const params=new URLSearchParams(window.location.search),isNew=params.get('new')==='1',editId=params.get('edit');
  bindInterventionEvents();updateInterventionStats();renderInterventionList();
  if(editId)loadInterventionIntoForm(editId);
  else if(isNew)resetInterventionForm(loadInterventionContext());
  else resetInterventionForm(getMotorSnapshotFromStorage());
  if(isNew||editId){sessionStorage.removeItem(INTERVENTION_CONTEXT_KEY);window.history.replaceState({},'','intervention.html');}
}

function bindInterventionEvents(){
  document.getElementById('interventionForm')?.addEventListener('submit',e=>{e.preventDefault();saveInterventionFromForm();});
  document.getElementById('btnNewIntervention')?.addEventListener('click',()=>{resetInterventionForm(getMotorSnapshotFromStorage());document.getElementById('interventionFormCard')?.scrollIntoView({behavior:'smooth'});});
  document.getElementById('btnResetForm')?.addEventListener('click',()=>resetInterventionForm(getMotorSnapshotFromStorage()));
  document.getElementById('btnCancelEdit')?.addEventListener('click',()=>resetInterventionForm(getMotorSnapshotFromStorage()));
  document.getElementById('filterStatut')?.addEventListener('change',renderInterventionList);
  document.getElementById('btnClosePreview')?.addEventListener('click',()=>document.getElementById('printPreviewSection')?.classList.add('d-none'));
  document.getElementById('btnPrintFiche')?.addEventListener('click',()=>window.print());
}

function fillMeasureDisplay(snapshot){
  const values=snapshot?.values||{};
  const set=(id,val,unit)=>{const el=document.getElementById(id);if(el)el.textContent=val!==undefined?`${val} ${unit}`:'—';};
  set('measureTemperature',values.stator?.temperature!==undefined?formatValue(values.stator.temperature,1):undefined,'°C');
  set('measureCurrent',values.stator?.current!==undefined?formatValue(values.stator.current,1):undefined,'A');
  set('measureSpeed',values.rotor?.speed!==undefined?formatValue(values.rotor.speed,0):undefined,'tr/min');
  const pe=document.getElementById('measurePressure');if(pe){const p=values.bearings?.pressure;pe.textContent=p!==undefined?`${formatValue(p,2)} bar`:'—';}
  const he=document.getElementById('measureHealth');if(he){const h=snapshot?.globalHealth;he.textContent=h!==undefined?`${h} %`:'—';}
  const badge=document.getElementById('measureMotorStatus');
  if(badge){const s=snapshot?.motorStatus||'—';badge.textContent=`État moteur : ${s}${snapshot?.globalHealth!==undefined?` — Santé ${snapshot.globalHealth}%`:''}`;badge.className=`badge ${s==='ALARME'?'bg-danger':s==='ALERTE'?'bg-warning text-dark':s==='OK'?'bg-success':'bg-secondary'}`;}
}

function resetInterventionForm(snapshot){const data=createEmptyIntervention(snapshot);document.getElementById('interventionId').value='';document.getElementById('formTitle').textContent="Nouvelle fiche d'intervention";document.getElementById('btnCancelEdit')?.classList.add('d-none');populateInterventionForm(data);fillMeasureDisplay(snapshot);}

function populateInterventionForm(data){
  const fields={fieldReference:data.reference,fieldDate:data.date,fieldTechnicien:data.technicien,fieldEquipement:data.equipement,fieldType:data.type,fieldPriorite:data.priorite,fieldStatut:data.statut,fieldMotif:data.motif,fieldActions:data.actions,fieldPieces:data.pieces,fieldHeureDebut:data.heureDebut,fieldHeureFin:data.heureFin,fieldResultat:data.resultat,fieldObservations:data.observations};
  Object.entries(fields).forEach(([id,val])=>{const el=document.getElementById(id);if(el)el.value=val??'';});
  fillMeasureDisplay({values:data.mesures,motorStatus:data.motorStatus});
}

function loadInterventionIntoForm(id){const item=loadInterventions().find(i=>i.id===id);if(!item)return;document.getElementById('interventionId').value=item.id;document.getElementById('formTitle').textContent=`Modifier — ${item.reference}`;document.getElementById('btnCancelEdit')?.classList.remove('d-none');populateInterventionForm(item);document.getElementById('interventionFormCard')?.scrollIntoView({behavior:'smooth'});}

function readInterventionFormData(){
  const id=document.getElementById('interventionId').value;
  const existing=id?loadInterventions().find(i=>i.id===id):null;
  const snapshot=existing?{values:existing.mesures,motorStatus:existing.motorStatus}:loadInterventionContext()||getMotorSnapshotFromStorage();
  return{id:id||`int-${Date.now()}`,reference:document.getElementById('fieldReference').value,date:document.getElementById('fieldDate').value,technicien:document.getElementById('fieldTechnicien').value.trim(),equipement:document.getElementById('fieldEquipement').value,type:document.getElementById('fieldType').value,priorite:document.getElementById('fieldPriorite').value,statut:document.getElementById('fieldStatut').value,mesures:{...(snapshot?.values||existing?.mesures||{}),globalHealth:snapshot?.globalHealth??existing?.mesures?.globalHealth,operationLevel:snapshot?.operationLevel??existing?.mesures?.operationLevel},motorStatus:snapshot?.motorStatus||existing?.motorStatus||'OK',motif:document.getElementById('fieldMotif').value.trim(),actions:document.getElementById('fieldActions').value.trim(),pieces:document.getElementById('fieldPieces').value.trim(),heureDebut:document.getElementById('fieldHeureDebut').value,heureFin:document.getElementById('fieldHeureFin').value,resultat:document.getElementById('fieldResultat').value,observations:document.getElementById('fieldObservations').value.trim(),createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
}

function saveInterventionFromForm(){
  const technicien=document.getElementById('fieldTechnicien').value.trim();
  const motif=document.getElementById('fieldMotif').value.trim();
  if(!technicien||!motif){alert("Veuillez renseigner le technicien et le motif.");return;}
  const data=readInterventionFormData();
  let list=loadInterventions();const idx=list.findIndex(i=>i.id===data.id);
  if(idx>=0)list[idx]=data;else list.unshift(data);
  saveInterventionsList(list);updateInterventionStats();renderInterventionList();resetInterventionForm(getMotorSnapshotFromStorage());
  alert(`Fiche ${data.reference} enregistrée avec succès.`);
}

function deleteIntervention(id){if(!confirm("Supprimer définitivement cette fiche ?"))return;saveInterventionsList(loadInterventions().filter(i=>i.id!==id));updateInterventionStats();renderInterventionList();}

function updateInterventionStats(){
  const list=loadInterventions();
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
  set('statOpen',list.filter(i=>i.statut==='ouverte').length);
  set('statProgress',list.filter(i=>i.statut==='en_cours').length);
  set('statClosed',list.filter(i=>i.statut==='cloturee').length);
}

function renderInterventionList(){
  const container=document.getElementById('interventionList'),empty=document.getElementById('interventionEmpty');
  if(!container)return;
  const filter=document.getElementById('filterStatut')?.value||'all';
  let list=loadInterventions();
  if(filter!=='all')list=list.filter(i=>i.statut===filter);
  container.querySelectorAll('.intervention-item').forEach(el=>el.remove());
  if(!list.length){empty?.classList.remove('d-none');return;}
  empty?.classList.add('d-none');
  list.forEach(item=>{
    const el=document.createElement('div');
    el.className=`intervention-item statut-${item.statut} ${(item.priorite==='urgente'||item.priorite==='haute')?'priorite-haute':''}`;
    el.innerHTML=`
      <div class="intervention-item-main">
        <div class="intervention-item-ref">${item.reference}</div>
        <div class="intervention-item-meta">
          <span><i class="bi bi-calendar3"></i> ${item.date}</span>
          <span><i class="bi bi-person"></i> ${item.technicien}</span>
          <span class="badge intervention-badge-type">${INTERVENTION_LABELS.type[item.type]||item.type}</span>
          <span class="badge intervention-badge-statut statut-badge-${item.statut}">${INTERVENTION_LABELS.statut[item.statut]}</span>
        </div>
        <div class="intervention-item-motif">${item.motif.substring(0,120)}${item.motif.length>120?'…':''}</div>
      </div>
      <div class="intervention-item-actions">
        <button class="btn btn-sm btn-outline-primary btn-view-intervention" data-id="${item.id}"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-secondary btn-edit-intervention" data-id="${item.id}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger btn-delete-intervention" data-id="${item.id}"><i class="bi bi-trash"></i></button>
      </div>`;
    container.appendChild(el);
  });
  container.querySelectorAll('.btn-edit-intervention').forEach(btn=>btn.addEventListener('click',()=>loadInterventionIntoForm(btn.dataset.id)));
  container.querySelectorAll('.btn-delete-intervention').forEach(btn=>btn.addEventListener('click',()=>deleteIntervention(btn.dataset.id)));
  container.querySelectorAll('.btn-view-intervention').forEach(btn=>btn.addEventListener('click',()=>showInterventionPreview(btn.dataset.id)));
}

function showInterventionPreview(id){
  const item=loadInterventions().find(i=>i.id===id);if(!item)return;
  const section=document.getElementById('printPreviewSection'),preview=document.getElementById('printPreview');
  if(!section||!preview)return;
  const m=item.mesures||{};
  preview.innerHTML=`
    <div class="card-body intervention-print-body">
      <div class="print-header">
        <div><h2>FICHE D'INTERVENTION</h2><p class="print-subtitle">Moteur asynchrone triphasé à cage d'écureuil — Maintenance industrielle</p></div>
        <div class="print-ref-box"><strong>${item.reference}</strong><span>${item.date}</span></div>
      </div>
      <table class="print-table">
        <tr><th>Technicien</th><td>${item.technicien}</td><th>Type</th><td>${INTERVENTION_LABELS.type[item.type]}</td></tr>
        <tr><th>Équipement</th><td colspan="3">${item.equipement}</td></tr>
        <tr><th>Priorité</th><td>${INTERVENTION_LABELS.priorite[item.priorite]}</td><th>Statut</th><td>${INTERVENTION_LABELS.statut[item.statut]}</td></tr>
        <tr><th>Heure début</th><td>${item.heureDebut||'—'}</td><th>Heure fin</th><td>${item.heureFin||'—'}</td></tr>
      </table>
      <h3 class="print-section-title">Mesures enregistrées</h3>
      <table class="print-table">
        <tr><th>Temp. stator</th><td>${m.stator?.temperature??'—'} °C</td><th>Temp. enroulements</th><td>${m.windings?.temperature??'—'} °C</td></tr>
        <tr><th>Courant</th><td>${m.stator?.current??'—'} A</td><th>Pression paliers</th><td>${m.bearings?.pressure??'—'} bar</td></tr>
        <tr><th>Vitesse rotor</th><td>${m.rotor?.speed??'—'} tr/min</td><th>Santé moteur</th><td>${item.mesures?.globalHealth??'—'} %</td></tr>
        <tr><th>État moteur</th><td colspan="3">${item.motorStatus}</td></tr>
      </table>
      <h3 class="print-section-title">Motif / Description</h3>
      <p class="print-text">${item.motif.replace(/\n/g,'<br>')}</p>
      <h3 class="print-section-title">Actions réalisées</h3>
      <p class="print-text">${item.actions?item.actions.replace(/\n/g,'<br>'):'—'}</p>
      <h3 class="print-section-title">Pièces remplacées</h3>
      <p class="print-text">${item.pieces||'—'}</p>
      <h3 class="print-section-title">Résultat &amp; observations</h3>
      <table class="print-table">
        <tr><th>Résultat</th><td>${INTERVENTION_LABELS.resultat[item.resultat]||item.resultat}</td></tr>
        <tr><th>Observations</th><td>${item.observations||'—'}</td></tr>
      </table>
      <div class="print-signatures">
        <div class="print-signature-box"><span>Signature technicien</span><div class="print-signature-line"></div><small>${item.technicien}</small></div>
        <div class="print-signature-box"><span>Validation responsable</span><div class="print-signature-line"></div><small>Abdel KAWIL — Administrateur</small></div>
      </div>
      <p class="print-footer-note">Document généré le ${new Date().toLocaleString('fr-FR')} — Moteur asynchrone triphasé à cage d'écureuil</p>
    </div>`;
  section.classList.remove('d-none');section.scrollIntoView({behavior:'smooth'});
}

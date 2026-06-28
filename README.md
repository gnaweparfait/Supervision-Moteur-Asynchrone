# Système de Supervision et de Diagnostic du Moteur Asynchrone Triphasé à Cage d'Écureuil

**Projet de fin d'études — Maintenance prédictive basée sur les capteurs**  
Abdel KAWIL — Administrateur  
Déployé sur : https://gnaweparfait.github.io/Supervision-Moteur-Asynchrone

---

## Présentation

Cette application web est un système de supervision industrielle simulant un **jumeau numérique (Digital Twin)** d'un moteur asynchrone triphasé à cage d'écureuil. Elle reproduit le comportement d'un tableau de bord de type **SCADA** entièrement développé en HTML5, CSS3 et JavaScript, sans aucun serveur ni base de données externe.

Elle a été conçue dans le cadre d'un projet de fin d'études portant sur la **mise en œuvre d'un système de maintenance prédictive basée sur les capteurs**.

---

## Fonctionnalités principales

### Supervision temps réel
- Surveillance continue de 6 composants moteur : Stator, Enroulements, Rotor, Arbre de transmission, Paliers / Roulements, Ventilation
- Affichage en temps réel de la température, des vibrations, du courant, de la tension, de la pression de lubrification, de la vitesse de rotation et du rendement estimé
- Indice de santé global du moteur calculé dynamiquement (%)
- Niveau de fonctionnement ajusté automatiquement en cas de défaut

### Animation du moteur (Canvas 2D)
- Rotation continue du rotor liée à la vitesse réelle (RPM)
- Ventilateur animé proportionnellement à sa vitesse
- Effet thermique sur le stator : couleur évolutive bleu → vert → jaune → rouge selon la température
- Flux électrique animé dans les enroulements (particules lumineuses)
- Vibration visuelle du moteur proportionnelle au niveau de vibration mesuré
- Glow rouge / orange sur les composants en alarme

### Simulation avancée des capteurs
- Valeurs qui évoluent progressivement (bruit gaussien filtré + oscillation sinusoïdale + inertie thermique)
- Cohérence entre les paramètres (vitesse arbre = vitesse rotor, courant enroulements = courant stator)
- Mode Auto : simulation continue autonome
- Mode Manuel : modification libre de chaque paramètre via curseurs et champs numériques

### Seuils industriels
Chaque paramètre possède ses propres seuils avec trois niveaux :

| Couleur | État | Signification |
|---|---|---|
| 🟢 Vert | Normal | Fonctionnement nominal |
| 🟡 Jaune | Dégradation | Surveillance renforcée requise |
| 🔴 Rouge | Critique | Intervention immédiate nécessaire |

Exemples de seuils appliqués :
- Température stator : 0–37 °C Normal · 37–55 °C Dégradation · > 55 °C Critique
- Vibrations : 0–2 mm/s Normal · 2–4 mm/s Dégradation · > 4 mm/s Critique
- Courant triphasé : 0–18 A Normal · 18–25 A Dégradation · > 25 A Critique
- Tension alimentation : 380–420 V Normal · 340–380 / 420–450 V Dégradation · < 340 / > 450 V Critique
- Pression lubrification : 2,5–4 bar Normal · 1,5–2,5 bar Dégradation · < 1,5 bar Critique

### Diagnostic automatique
Pour chaque défaut détecté, le système affiche automatiquement :
- Le composant concerné
- Le défaut identifié
- La **cause probable**
- L'**action recommandée**
- Le niveau de criticité

La base de connaissances couvre 42 scénarios de défauts différents (défaut de roulement, surchauffe, déséquilibre, désalignement, court-circuit, perte de lubrification, rupture de barre rotorique, etc.).

### Simulation de défauts prédéfinis
8 scénarios accessibles en un clic depuis le tableau de bord :

| Scénario | Paramètres modifiés |
|---|---|
| Surchauffe stator | T stator = 75 °C, T enroulements = 82 °C |
| Surchauffe enroulements | T enroulements = 68 °C, isolement = 45 MΩ, I = 22 A |
| Vibration excessive | Vibrations arbre = 6,2 mm/s, stator = 5,8 mm/s |
| Perte lubrification | Pression = 0,8 bar, T paliers = 62 °C |
| Chute de tension | U = 310 V, I = 26 A |
| Surintensité | I = 32 A, T stator = 58 °C |
| Panne ventilateur | Vitesse = 300 tr/min, débit = 150 m³/h |
| Retour nominal | Retour à toutes les valeurs nominales |

### Alarmes intelligentes
- Bandeau rouge animé en haut de l'écran lors d'une alarme critique
- Effet de tremblement de l'interface (shake)
- Alarme sonore (Web Audio API)
- Liste des alarmes actives avec composant, valeur mesurée et niveau
- Historique complet des alarmes avec date, heure, défaut, valeur, niveau et action recommandée

### Graphiques professionnels
- 3 graphiques historiques (Températures, Vibrations, Santé & fonctionnement)
- 7 courbes individuelles par paramètre avec zones colorées correspondant aux seuils
- 6 mini-graphiques d'évolution dans les cartes de composants
- Mise en évidence visuelle des dépassements de seuil (zones vertes / jaunes / rouges)

### Fiches d'intervention
Module complet de gestion de la maintenance :
- Création de fiches avec référence automatique (INT-AAAAMMJJ-XXX)
- Capture automatique des mesures moteur au moment de l'intervention
- Gestion des statuts : Ouverte · En cours · Clôturée
- Niveaux de priorité : Basse · Normale · Haute · Urgente
- Aperçu imprimable et impression de la fiche
- Historique filtrable par statut

---

## Architecture technique

| Élément | Technologie |
|---|---|
| Structure des pages | HTML5 sémantique |
| Mise en page & composants | Bootstrap 5.3 |
| Logique applicative | JavaScript ES6+ (vanilla) |
| Animation moteur | Canvas 2D API |
| Graphiques | Chart.js 4.4 |
| Styles personnalisés | CSS3 (variables, thèmes, animations) |
| Stockage des données | localStorage / sessionStorage |
| Déploiement | Fichiers statiques — GitHub Pages |

**Aucune dépendance backend.** L'application fonctionne entièrement côté navigateur.

---

## Structure du projet

```
/
├── index.html          → Redirection vers login
├── login.html          → Page d'authentification
├── dashboard.html      → Tableau de bord principal (SCADA)
├── intervention.html   → Module fiches d'intervention
├── admin.html          → Espace administrateur
├── script.js           → Logique applicative complète (~1 100 lignes)
└── style.css           → Styles industriels + thèmes (~375 lignes)
```

---

## Accès à l'application

**URL de déploiement :** https://gnaweparfait.github.io/Supervision-Moteur-Asynchrone
---

## Utilisation

### Démarrer la simulation
1. Se connecter avec les identifiants ci-dessus
2. Cliquer sur **Start** dans la barre d'état
3. Les valeurs évoluent automatiquement toutes les 800 ms

### Simuler un défaut
- Utiliser les boutons de la section **Simulation de défauts**
- Ou activer le **Mode Manuel** et ajuster manuellement les curseurs

### Créer une fiche d'intervention
- Cliquer sur **Intervention** dans la barre de contrôle ou via le menu
- Les mesures moteur actuelles sont capturées automatiquement
- Renseigner le technicien, le motif et les actions réalisées

### Changer de thème
- Cliquer sur l'icône soleil / lune dans le header pour basculer entre le mode sombre et le mode clair

---

## Composants surveillés

| Composant | Paramètres surveillés |
|---|---|
| **Stator** | Température · Vibrations · Courant triphasé · Tension alimentation |
| **Enroulements** | Température · Résistance d'isolement · Courant électrique |
| **Rotor** | Température · Vitesse asynchrone · Vibrations |
| **Arbre de transmission** | Vibration · Vitesse rotation · Alignement |
| **Paliers / Roulements** | Température · Vibrations · Niveau d'usure · Pression lubrification |
| **Ventilation** | Température refroidissement · Vitesse ventilateur · Débit d'air |

---

## Capteurs simulés

| Capteur | Paramètre mesuré | Composant |
|---|---|---|
| Sonde Pt100 | Température | Enroulements statoriques |
| Accéléromètre Wilcoxon 786A | Vibrations | Carter du moteur |
| Capteur de courant ACS758 | Courant triphasé | Alimentation électrique |
| Encodeur incrémental Omron | Vitesse de rotation | Arbre |

---

---

*Application de simulation industrielle — Toutes les données sont simulées localement dans le navigateur.*

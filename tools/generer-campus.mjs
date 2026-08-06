#!/usr/bin/env node
/** Générateur du campus Jarvis : 1 pièce par projet + la table du board.
 *  Écrit ~/.pixel-agents/layout.json (+ areaMappings dans config.json).
 *  Usage : node tools/generer-campus.mjs   (backup de l'existant automatique) */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const COLS = 44,
  ROWS = 30,
  WALL = 0,
  VOID = 255;
const DIR = path.join(os.homedir(), '.pixel-agents');

let uidN = 0;
const uid = () => `f-${Date.now()}-c${(uidN++).toString(36).padStart(3, '0')}`;
const place = (arr, type, col, row) => arr.push({ uid: uid(), type, col, row });

/** Salles : rectangles [x0,y0,x1,y1] inclus, teinte sol + couleur de zone. */
const ROOMS = [
  {
    label: 'board',
    x0: 16,
    y0: 3,
    x1: 27,
    y1: 12,
    floor: 7,
    color: '#e3b45c',
    tint: { h: 40, s: 45, b: 12, c: 5 },
  },
  {
    label: 'werky',
    x0: 2,
    y0: 3,
    x1: 13,
    y1: 12,
    floor: 1,
    color: '#ee7042',
    tint: { h: 20, s: 40, b: 10, c: 0 },
  },
  {
    label: 'dgds',
    x0: 30,
    y0: 3,
    x1: 41,
    y1: 12,
    floor: 2,
    color: '#4fa3ff',
    tint: { h: 210, s: 35, b: 8, c: 0 },
  },
  {
    label: 'ha-lenoir',
    x0: 2,
    y0: 16,
    x1: 13,
    y1: 27,
    floor: 3,
    color: '#46c98d',
    tint: { h: 140, s: 35, b: 8, c: 0 },
  },
  {
    label: 'infra',
    x0: 16,
    y0: 16,
    x1: 27,
    y1: 27,
    floor: 4,
    color: '#9a86c9',
    tint: { h: 265, s: 25, b: 8, c: 0 },
  },
  {
    label: 'jarvis',
    x0: 30,
    y0: 16,
    x1: 41,
    y1: 27,
    floor: 5,
    color: '#c9a959',
    tint: { h: 45, s: 35, b: 10, c: 0 },
  },
];

/** Sessions → salles (clé = basename du cwd réel, cf. greffe campus/projet-cle-cwd). */
const MAPPINGS = {
  'orku-workspace': ['werky'],
  chantier: ['werky'],
  web: ['werky'],
  'dgds-portal': ['dgds'],
  dgds: ['dgds'],
  'ha-lenoir': ['ha-lenoir'],
  'HA henok': ['ha-lenoir'],
  'orku-infra': ['infra'],
  jarvis: ['jarvis'],
  'jarvis-campus': ['jarvis'],
  StephanDeGrove: ['board'], // sessions générales → à la table du board
};

// ── Tuiles + zones + teintes ─────────────────────────────────────
const tiles = new Array(COLS * ROWS).fill(VOID);
const areaTiles = new Array(COLS * ROWS).fill(null);
const tileColors = new Array(COLS * ROWS).fill(null);
const idx = (c, r) => r * COLS + c;

for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) tiles[idx(c, r)] = 1; // hall commun
for (let c = 0; c < COLS; c++) {
  tiles[idx(c, 0)] = WALL;
  tiles[idx(c, 1)] = WALL;
  tiles[idx(c, ROWS - 1)] = WALL;
}
for (let r = 0; r < ROWS; r++) {
  tiles[idx(0, r)] = WALL;
  tiles[idx(COLS - 1, r)] = WALL;
}

for (const z of ROOMS)
  for (let r = z.y0; r <= z.y1; r++)
    for (let c = z.x0; c <= z.x1; c++) {
      tiles[idx(c, r)] = z.floor;
      areaTiles[idx(c, r)] = z.label;
      tileColors[idx(c, r)] = z.tint;
    }

// ── Meubles ──────────────────────────────────────────────────────
const furniture = [];
/** Table de réunion 4 places (motif du gabarit d'origine, rangées 16-18). */
function tableQuatre(cx, cy) {
  place(furniture, 'TABLE_FRONT', cx, cy);
  place(furniture, 'WOODEN_CHAIR_SIDE', cx - 1, cy);
  place(furniture, 'PC_SIDE', cx, cy);
  place(furniture, 'PC_SIDE:left', cx + 2, cy);
  place(furniture, 'WOODEN_CHAIR_SIDE:left', cx + 3, cy);
  place(furniture, 'WOODEN_CHAIR_SIDE', cx - 1, cy + 2);
  place(furniture, 'PC_SIDE', cx, cy + 2);
  place(furniture, 'PC_SIDE:left', cx + 2, cy + 2);
  place(furniture, 'WOODEN_CHAIR_SIDE:left', cx + 3, cy + 2);
}
/** Poste solo : bureau + PC + banquette (motif desk du gabarit). */
function posteSolo(cx, cy) {
  place(furniture, 'DESK_FRONT', cx, cy);
  place(furniture, 'PC_FRONT_OFF', cx + 1, cy);
  place(furniture, 'CUSHIONED_BENCH', cx + 1, cy + 2);
}

for (const z of ROOMS.filter((z) => z.label !== 'board')) {
  const cx = z.x0 + 4,
    cy = z.y0 + 3;
  tableQuatre(cx, cy);
  posteSolo(z.x0 + 1, z.y1 - 3);
  place(furniture, 'PLANT_2', z.x1 - 1, z.y0 + 1);
  place(furniture, 'BIN', z.x1 - 1, z.y1 - 1);
}

// La table du board : double table, 6 chaises, coin salon.
const B = ROOMS[0];
tableQuatre(B.x0 + 2, B.y0 + 3);
place(furniture, 'WOODEN_CHAIR_SIDE', B.x0 + 1, B.y0 + 4);
place(furniture, 'WOODEN_CHAIR_SIDE:left', B.x0 + 5, B.y0 + 4);
place(furniture, 'SOFA_FRONT', B.x1 - 3, B.y0 + 2);
place(furniture, 'COFFEE_TABLE', B.x1 - 3, B.y0 + 4);
place(furniture, 'COFFEE', B.x1 - 3, B.y0 + 5);
place(furniture, 'LARGE_PLANT', B.x1 - 1, B.y1 - 1);

// Déco du mur du haut (rangée 1, sur tuiles WALL comme le gabarit).
const deco = [
  'HANGING_PLANT',
  'DOUBLE_BOOKSHELF',
  'CLOCK',
  'SMALL_PAINTING',
  'LARGE_PAINTING',
  'SMALL_PAINTING_2',
  'HANGING_PLANT',
];
deco.forEach((t, i) => place(furniture, t, 3 + i * 6, 1));

// ── Écriture ─────────────────────────────────────────────────────
const layout = {
  version: 1,
  cols: COLS,
  rows: ROWS,
  tiles,
  tileColors,
  furniture,
  areas: ROOMS.map(({ label, color }) => ({ label, color })),
  areaTiles,
  layoutRevision: 1,
};

fs.mkdirSync(DIR, { recursive: true });
const layoutFile = path.join(DIR, 'layout.json');
if (fs.existsSync(layoutFile))
  fs.copyFileSync(layoutFile, path.join(DIR, `layout.avant-campus-${Date.now()}.json`));
fs.writeFileSync(layoutFile, JSON.stringify(layout));

const configFile = path.join(DIR, 'config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
} catch {
  /* premier lancement */
}
config.standalone = {
  ...(config.standalone ?? {}),
  areaMappings: MAPPINGS,
  watchAllSessions: true,
};
fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

console.log(`Campus écrit : ${COLS}x${ROWS}, ${ROOMS.length} salles, ${furniture.length} meubles.`);
console.log('Relance le serveur (node dist/cli.js) puis recharge le navigateur.');

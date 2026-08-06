import type { FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';

/** Jarvis semantic task route — extracts the next concrete task of a project
 *  from its STATE.md (or falls back to the IDEE.md title). Localhost only. */

const CODE_ROOT = process.env.JARVIS_CODE_ROOT ?? 'F:/Code';

const DOSSIER_RE = /^[\w. -]{1,60}$/;
const SECTION_RE =
  /##[^\n]*(?:Prochaine action|TU ES ICI|Où on en est)[^\n]*\n([\s\S]*?)(?=\n## |$)/i;
const LISTE_RE = /^(?:[-*+]|\d+[.)])\s+(.+)$/;
const CACHE_TTL_MS = 10_000;

interface Tache {
  tache: string | null;
  source: string | null;
}

const cache = new Map<string, { quand: number; valeur: Tache }>();

function lire(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** Strip bullet/number prefix and bold markers from a markdown list line. */
function nettoyer(ligne: string): string {
  return ligne.replace(/\*\*/g, '').trim().slice(0, 160);
}

/** First non-empty list item of the "Prochaine action" (or alias) section. */
function tacheDepuisState(txt: string): string | null {
  const section = txt.match(SECTION_RE);
  if (!section) return null;
  for (const brute of section[1].split('\n')) {
    const item = brute.trim().match(LISTE_RE);
    if (item && item[1].trim()) return nettoyer(item[1]);
  }
  return null;
}

/** "# title" of an IDEE.md, for projects without an actionable STATE.md. */
function tacheDepuisIdee(txt: string): string | null {
  const titre = txt.match(/^# (.+)$/m)?.[1]?.trim();
  return titre ? nettoyer(`Kickoff : ${titre}`) : null;
}

function resoudre(dossier: string): Tache {
  const base = path.join(CODE_ROOT, dossier);
  const depuisState = tacheDepuisState(lire(path.join(base, 'STATE.md')));
  if (depuisState) return { tache: depuisState, source: 'STATE.md' };
  const depuisIdee = tacheDepuisIdee(lire(path.join(base, 'IDEE.md')));
  if (depuisIdee) return { tache: depuisIdee, source: 'IDEE.md' };
  return { tache: null, source: null };
}

export function registerTacheRoute(app: FastifyInstance): void {
  app.get<{ Querystring: { dossier?: string } }>('/api/jarvis/tache', async (req, reply) => {
    const dossier = req.query?.dossier ?? '';
    if (!DOSSIER_RE.test(dossier) || dossier.includes('..')) {
      return reply.code(400).send({ erreur: 'dossier invalide' });
    }

    const connu = cache.get(dossier);
    if (connu && Date.now() - connu.quand < CACHE_TTL_MS) return connu.valeur;

    const valeur = resoudre(dossier);
    cache.set(dossier, { quand: Date.now(), valeur });
    return valeur;
  });
}

import type { FastifyInstance } from 'fastify';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Jarvis HQ routes — dashboard data + interactions (localhost only, additive layer).
 *  Data sources: STATE.md, briefs and .quorum/decisions of the tracked repos. */

const CODE_ROOT = process.env.JARVIS_CODE_ROOT ?? 'F:/Code';

interface RepoDef {
  nom: string;
  dir: string;
  salle: string;
}

const REPOS: RepoDef[] = [
  { nom: 'werky / orku-workspace', dir: 'orku-workspace', salle: 'werky' },
  { nom: 'dgds-portal', dir: 'dgds-portal', salle: 'dgds' },
  { nom: 'dgds (clients)', dir: 'dgds', salle: 'dgds' },
  { nom: 'ha-lenoir', dir: 'ha-lenoir', salle: 'ha-lenoir' },
  { nom: 'orku-infra', dir: 'orku-infra', salle: 'infra' },
  { nom: 'jarvis', dir: 'jarvis', salle: 'jarvis' },
];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const ADR_FILE_RE = /^[\w][\w.-]*\.md$/;
const DECISION_HEADING = '## Décision de Stephan';

function lire(p: string): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** First useful lines of the "Prochaine action" (or "TU ES ICI") section of a STATE.md. */
function prochaineAction(txt: string): string | null {
  const m = txt.match(
    /##[^\n]*(?:Prochaine action|TU ES ICI|Où on en est)[^\n]*\n([\s\S]*?)(?=\n## |$)/i,
  );
  if (!m) return null;
  const lignes = m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('_'));
  return lignes.slice(0, 3).join(' · ').slice(0, 260) || null;
}

interface AdrEnAttente {
  repo: string;
  fichier: string;
  titre: string;
  contenu: string;
}

function adrsEnAttente(repoDir: string): AdrEnAttente[] {
  const dir = path.join(CODE_ROOT, repoDir, '.quorum', 'decisions');
  const out: AdrEnAttente[] = [];
  let fichiers: string[] = [];
  try {
    fichiers = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return out;
  }
  for (const fichier of fichiers) {
    const contenu = lire(path.join(dir, fichier));
    const m = contenu.match(new RegExp(`${DECISION_HEADING}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
    if (m && (/^\s*$/.test(m[1]) || /à remplir/i.test(m[1]))) {
      const titre = contenu.match(/^# (.+)$/m)?.[1] ?? fichier;
      out.push({ repo: repoDir, fichier, titre, contenu });
    }
  }
  return out;
}

function gitLog(repoDir: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', path.join(CODE_ROOT, repoDir), ...args],
      { windowsHide: true, timeout: 8000 },
      (err, stdout) => resolve(err ? '' : stdout),
    );
  });
}

interface EvenementGit {
  repo: string;
  hash: string;
  auteur: string;
  date: string;
  message: string;
  ai: boolean;
}

let timelineCache: { quand: number; valeur: unknown } | null = null;

async function construireTimeline(): Promise<unknown> {
  const SEP = '\u{1f}';
  const evenements: EvenementGit[] = [];
  const activite: Record<string, number[]> = {};
  const jourIndex = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return diff >= 0 && diff < 7 ? 6 - diff : -1;
  };
  await Promise.all(
    REPOS.map(async (r) => {
      const out = await gitLog(r.dir, [
        'log',
        '--since=7 days ago',
        '--date=iso-strict',
        `--pretty=%h${SEP}%an${SEP}%ad${SEP}%s`,
      ]);
      const buckets = new Array(7).fill(0) as number[];
      for (const ligne of out.split('\n')) {
        if (!ligne.trim()) continue;
        const [hash, auteur, date, ...reste] = ligne.split(SEP);
        const message = reste.join(SEP);
        const bi = jourIndex(date);
        if (bi >= 0) buckets[bi] += 1;
        evenements.push({ repo: r.dir, hash, auteur, date, message, ai: /^\[ai\]/.test(message) });
      }
      activite[r.dir] = buckets;
    }),
  );
  evenements.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { evenements: evenements.slice(0, 120), activite };
}

export function registerJarvisRoutes(app: FastifyInstance): void {
  app.get('/api/jarvis/timeline', async () => {
    if (timelineCache && Date.now() - timelineCache.quand < 60_000) return timelineCache.valeur;
    const valeur = await construireTimeline();
    timelineCache = { quand: Date.now(), valeur };
    return valeur;
  });

  app.get('/api/jarvis/etat', async () => {
    const brief = lire(path.join(CODE_ROOT, 'jarvis', 'briefs', 'dernier.md'));
    const projets = REPOS.map((r) => {
      const state = lire(path.join(CODE_ROOT, r.dir, 'STATE.md'));
      return {
        ...r,
        action: state ? prochaineAction(state) : null,
        enAttente: adrsEnAttente(r.dir).map(({ fichier, titre }) => ({ fichier, titre })),
      };
    });
    const decisions = REPOS.flatMap((r) => adrsEnAttente(r.dir));
    return { brief, projets, decisions, genere: new Date().toISOString() };
  });

  /** Record Stephan's decision inside an ADR (unblocks the quorum-gate). */
  app.post<{ Body: { repo?: string; fichier?: string; texte?: string } }>(
    '/api/jarvis/decisions/repondre',
    async (req, reply) => {
      const { repo, fichier, texte } = req.body ?? {};
      if (!repo || !REPOS.some((r) => r.dir === repo))
        return reply.code(400).send({ erreur: 'repo inconnu' });
      if (!fichier || !ADR_FILE_RE.test(fichier))
        return reply.code(400).send({ erreur: 'fichier invalide' });
      if (!texte || !texte.trim()) return reply.code(400).send({ erreur: 'décision vide' });

      const cible = path.join(CODE_ROOT, repo, '.quorum', 'decisions', fichier);
      const contenu = lire(cible);
      if (!contenu.includes(DECISION_HEADING))
        return reply.code(404).send({ erreur: 'ADR introuvable' });

      const date = new Date().toLocaleDateString('fr-BE');
      const bloc = `${DECISION_HEADING}\n\n**« ${texte.trim()} »** (via Jarvis, ${date})\n`;
      const nouveau = contenu.replace(
        new RegExp(`${DECISION_HEADING}\\s*\\n[\\s\\S]*?(?=\\n## |$)`),
        `${bloc}`,
      );
      fs.writeFileSync(cible, nouveau, 'utf8');
      return { ok: true };
    },
  );

  /** Create a new project skeleton: STATE.md + IDEE.md + .quorum, ready for a kickoff session. */
  app.post<{ Body: { nom?: string; description?: string } }>(
    '/api/jarvis/projets',
    async (req, reply) => {
      const nom = (req.body?.nom ?? '').trim().toLowerCase();
      const description = (req.body?.description ?? '').trim();
      if (!SLUG_RE.test(nom))
        return reply.code(400).send({ erreur: 'nom invalide (kebab-case, 2-40 car.)' });
      const cible = path.join(CODE_ROOT, nom);
      if (fs.existsSync(cible)) return reply.code(409).send({ erreur: 'ce dossier existe déjà' });

      const date = new Date().toLocaleDateString('fr-BE');
      fs.mkdirSync(path.join(cible, '.quorum', 'decisions'), { recursive: true });
      fs.writeFileSync(
        path.join(cible, 'IDEE.md'),
        `# ${nom} — l'idée\n\n_Créé via Jarvis le ${date}._\n\n${description || '(à décrire)'}\n\n` +
          `## Prochaine étape\n\nOuvrir une session dans ce dossier et lancer le kickoff : débat quorum sur l'idée, puis charte.\n`,
        'utf8',
      );
      fs.writeFileSync(
        path.join(cible, 'STATE.md'),
        `# STATE — ${nom}\n\n_Créé via Jarvis le ${date}. Aucune session encore._\n\n## Prochaine action\n\n1. Kickoff : session dans ce dossier, débat quorum sur IDEE.md, décision de Stephan, charte.\n`,
        'utf8',
      );
      return { ok: true, chemin: cible };
    },
  );
}

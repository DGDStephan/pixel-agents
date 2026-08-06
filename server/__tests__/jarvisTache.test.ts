import fastify, { type FastifyInstance } from 'fastify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolated temp CODE_ROOT; must be set BEFORE the module import so that
// tache.ts resolves projects inside the temp dir (env is read at load time).
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pxl-jarvis-tache-'));
process.env.JARVIS_CODE_ROOT = tmpRoot;

// Must import AFTER env setup
const { registerTacheRoute } = await import('../src/jarvis/tache.js');

let compteur = 0;

/** Fresh project dir per test — unique name so the 10 s cache never leaks across tests. */
function creerProjet(fichiers: Record<string, string>): string {
  const nom = `projet-${compteur++}`;
  const dir = path.join(tmpRoot, nom);
  fs.mkdirSync(dir, { recursive: true });
  for (const [fichier, contenu] of Object.entries(fichiers)) {
    fs.writeFileSync(path.join(dir, fichier), contenu, 'utf8');
  }
  return nom;
}

describe('registerTacheRoute', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = fastify();
    registerTacheRoute(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  async function demander(dossier: string): Promise<{ statut: number; corps: unknown }> {
    const res = await app.inject({ method: 'GET', url: `/api/jarvis/tache?dossier=${dossier}` });
    return { statut: res.statusCode, corps: res.json() };
  }

  // ── Extraction STATE.md ─────────────────────────────────────

  it('extracts the first list item of "## Prochaine action", stripped of bullets and bold', async () => {
    const nom = creerProjet({
      'STATE.md':
        '# STATE — x\n\n## Contexte\n\nblabla\n\n## Prochaine action\n\n' +
        '1. **Kickoff** : lancer la session de cadrage\n2. autre chose\n\n## Après\n\nrien\n',
    });
    const { statut, corps } = await demander(nom);
    expect(statut).toBe(200);
    expect(corps).toEqual({ tache: 'Kickoff : lancer la session de cadrage', source: 'STATE.md' });
  });

  it('matches alias headings case-insensitively and skips blank lines before the list', async () => {
    const nom = creerProjet({
      'STATE.md': '# STATE\n\n## tu es ici\n\n\n- réparer le webhook de deploy\n',
    });
    const { corps } = await demander(nom);
    expect(corps).toEqual({ tache: 'réparer le webhook de deploy', source: 'STATE.md' });
  });

  it('truncates the task to 160 characters', async () => {
    const nom = creerProjet({
      'STATE.md': `## Prochaine action\n\n- ${'a'.repeat(300)}\n`,
    });
    const { corps } = await demander(nom);
    expect((corps as { tache: string }).tache).toHaveLength(160);
  });

  // ── Validation ──────────────────────────────────────────────

  it('rejects traversal, separators and missing dossier with 400', async () => {
    for (const mauvais of ['..', '__tests__%2F..%2Fsecret', 'a%2Fb', 'a%5Cb', '']) {
      const { statut } = await demander(mauvais);
      expect(statut, `dossier=${mauvais}`).toBe(400);
    }
  });

  // ── Fallbacks ───────────────────────────────────────────────

  it('falls back to the IDEE.md title when STATE.md has no actionable section', async () => {
    const nom = creerProjet({
      'STATE.md': '# STATE\n\n## Historique\n\n- rien à faire ici\n',
      'IDEE.md': "# mon-projet — l'idée\n\nDescription.\n",
    });
    const { corps } = await demander(nom);
    expect(corps).toEqual({ tache: "Kickoff : mon-projet — l'idée", source: 'IDEE.md' });
  });

  it('returns {tache: null, source: null} when neither file exists (no throw)', async () => {
    const nom = creerProjet({});
    const { statut, corps } = await demander(nom);
    expect(statut).toBe(200);
    expect(corps).toEqual({ tache: null, source: null });
  });

  // ── Cache 10 s ──────────────────────────────────────────────

  it('serves the cached task within 10 s, then re-reads once the TTL expires', async () => {
    const nom = creerProjet({ 'STATE.md': '## Prochaine action\n\n- version A\n' });
    expect((await demander(nom)).corps).toMatchObject({ tache: 'version A' });

    fs.writeFileSync(path.join(tmpRoot, nom, 'STATE.md'), '## Prochaine action\n\n- version B\n');
    expect((await demander(nom)).corps).toMatchObject({ tache: 'version A' });

    const vrai = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(vrai + 11_000);
    expect((await demander(nom)).corps).toMatchObject({ tache: 'version B' });
  });
});

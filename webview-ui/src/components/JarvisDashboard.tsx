import './jarvis-dashboard.css';

import { useCallback, useEffect, useState } from 'react';

/** Jarvis QG — structure issue de la maquette validée (stat row / file de décisions /
 *  cartes projets / timeline droite / git par agent / Q&R), 3 thèmes commutables.
 *  Toutes les données sont réelles : API /api/jarvis/{etat,timeline,decisions,projets}. */

interface AdrRef {
  fichier: string;
  titre: string;
}
interface Projet {
  nom: string;
  dir: string;
  salle: string;
  action: string | null;
  enAttente: AdrRef[];
}
interface Decision extends AdrRef {
  repo: string;
  contenu: string;
}
interface Etat {
  brief: string;
  projets: Projet[];
  decisions: Decision[];
}
interface EvenementGit {
  repo: string;
  hash: string;
  auteur: string;
  date: string;
  message: string;
  ai: boolean;
}
interface Timeline {
  evenements: EvenementGit[];
  activite: Record<string, number[]>;
}

type Theme = '' | 'th-b' | 'th-c';
const THEMES: Array<{ cls: Theme; nom: string }> = [
  { cls: '', nom: 'A · ROCINANTE' },
  { cls: 'th-b', nom: 'B · PHOSPHORE' },
  { cls: 'th-c', nom: 'C · RAILS' },
];

const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
const jourDe = (iso: string) => new Date(iso).toDateString();

export function JarvisDashboard({
  onEnterCampus,
  agentsActifs,
}: {
  onEnterCampus: () => void;
  agentsActifs: number;
}) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [tl, setTl] = useState<Timeline | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [texte, setTexte] = useState('');
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState('');
  const [desc, setDesc] = useState('');
  const [erreur, setErreur] = useState('');
  const [briefOuvert, setBriefOuvert] = useState(false);
  const [question, setQuestion] = useState('');
  const [reponse, setReponse] = useState('');
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('jarvis-theme') as Theme) ?? '',
  );
  const [maintenant, setMaintenant] = useState(() => Date.now());

  const charger = useCallback(() => {
    setMaintenant(Date.now());
    fetch('/api/jarvis/etat')
      .then((r) => r.json())
      .then(setEtat)
      .catch(() => setEtat(null));
    fetch('/api/jarvis/timeline')
      .then((r) => r.json())
      .then(setTl)
      .catch(() => setTl(null));
  }, []);
  useEffect(() => {
    charger();
    const t = setInterval(charger, 30000);
    return () => clearInterval(t);
  }, [charger]);

  const choisirTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem('jarvis-theme', t);
  };

  const trancher = async () => {
    if (!decision || !texte.trim()) return;
    setErreur('');
    const r = await fetch('/api/jarvis/decisions/repondre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo: decision.repo, fichier: decision.fichier, texte }),
    });
    if (r.ok) {
      setDecision(null);
      setTexte('');
      charger();
    } else setErreur(((await r.json()) as { erreur?: string }).erreur ?? 'échec');
  };

  const creer = async () => {
    setErreur('');
    const r = await fetch('/api/jarvis/projets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom, description: desc }),
    });
    if (r.ok) {
      setCreation(false);
      setNom('');
      setDesc('');
      charger();
    } else setErreur(((await r.json()) as { erreur?: string }).erreur ?? 'échec');
  };

  const evenements = tl?.evenements ?? [];
  const commits24h = evenements.filter(
    (e) => maintenant - new Date(e.date).getTime() < 86_400_000,
  ).length;
  const nbAttente = etat?.decisions.length ?? 0;
  const dernierParRepo = new Map<string, EvenementGit>();
  for (const e of evenements) if (!dernierParRepo.has(e.repo)) dernierParRepo.set(e.repo, e);
  const projetsActifs = etat?.projets.filter((p) => {
    const d = dernierParRepo.get(p.dir);
    return d && maintenant - new Date(d.date).getTime() < 172_800_000;
  }).length;

  const etatCarte = (p: Projet): string => {
    const d = dernierParRepo.get(p.dir);
    if (!d) return 'idle';
    const age = maintenant - new Date(d.date).getTime();
    return age < 3_600_000 ? 'build' : age < 172_800_000 ? 'ready' : 'idle';
  };

  const jours: Array<{ label: string; evts: EvenementGit[] }> = [];
  const aujourdHui = jourDe(new Date().toISOString());
  const hier = jourDe(new Date(maintenant - 86_400_000).toISOString());
  for (const e of evenements.slice(0, 60)) {
    const j = jourDe(e.date);
    const label =
      j === aujourdHui ? "Aujourd'hui" : j === hier ? 'Hier' : new Date(e.date).toLocaleDateString('fr-BE');
    if (!jours.length || jours[jours.length - 1].label !== label) jours.push({ label, evts: [] });
    jours[jours.length - 1].evts.push(e);
  }

  const dateHdr = new Date()
    .toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: 'long' })
    .toUpperCase();

  return (
    <div className={`hq ${theme}`} data-testid="jarvis-hq">
      <div className="hq-shell">
        <div className="hq-hdr">
          <span className="hq-date">
            <b>JARVIS</b> · {dateHdr}
          </span>
          <span className="hq-sp" />
          <button className="hq-btn" onClick={() => setCreation(true)}>
            + Projet
          </button>
          <button className="hq-btn" onClick={() => setBriefOuvert(true)}>
            🌅 Brief du matin
          </button>
          <button className="hq-btn cy" onClick={onEnterCampus}>
            Campus →
          </button>
        </div>

        <div className="hq-center">
          <div className="hq-stats">
            <div className="hq-stat warn">
              <div className="v">{nbAttente}</div>
              <div className="l">à trancher</div>
            </div>
            <div className="hq-stat info">
              <div className="v">{agentsActifs}</div>
              <div className="l">agents en salle</div>
            </div>
            <div className="hq-stat ok">
              <div className="v">
                {projetsActifs ?? '—'}
                <small>/{etat?.projets.length ?? 6}</small>
              </div>
              <div className="l">projets actifs 48 h</div>
            </div>
            <div className="hq-stat">
              <div className="v">{commits24h}</div>
              <div className="l">commits · 24 h</div>
            </div>
          </div>

          <div className="hq-panel">
            <div className="hq-ph">
              <h2>Décisions — ta seule file</h2>
              <span className="hq-meta">clic = ADR complet + trancher</span>
            </div>
            {nbAttente > 0 && (
              <div className="hq-sec">
                À trancher <b>({nbAttente})</b>
              </div>
            )}
            {etat?.decisions.map((d) => (
              <button
                key={`${d.repo}/${d.fichier}`}
                className="hq-dec"
                onClick={() => {
                  setDecision(d);
                  setTexte('');
                  setErreur('');
                }}
              >
                <span className="dot" />
                <span>
                  <span className="t">{d.titre}</span>
                  <span className="m">
                    {d.repo} · {d.fichier}
                  </span>
                </span>
                <span className="age">quorum passé</span>
              </button>
            ))}
            {etat && nbAttente === 0 && (
              <div className="hq-ok-line">Aucune décision en attente — tout est tranché. ✔</div>
            )}
          </div>

          <div className="hq-cards">
            {etat?.projets.map((p) => {
              const d = dernierParRepo.get(p.dir);
              const spark = tl?.activite[p.dir] ?? [];
              const max = Math.max(1, ...spark);
              return (
                <div className="hq-card" key={p.dir}>
                  <div className="hq-spark">
                    {spark.map((v, i) => (
                      <i
                        key={i}
                        className={v >= max && v > 0 ? 'hot' : ''}
                        style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                      />
                    ))}
                  </div>
                  <div className="hq-nm">
                    <span className={`hq-st ${etatCarte(p)}`} />
                    <b>{p.dir}</b>
                    <span>{p.salle}</span>
                  </div>
                  <div className="hq-commit">{d ? `⎇ ${d.message}` : 'aucun commit 7 j'}</div>
                  <div className="hq-who">
                    {d ? (
                      <>
                        {d.ai ? '🤖' : '👤'} <b>{d.ai ? 'agent' : d.auteur}</b> ·{' '}
                        {new Date(d.date).toLocaleDateString('fr-BE')} {heure(d.date)}
                      </>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="hq-ft">
                    {p.enAttente.length > 0 && (
                      <span className="w">⚠ {p.enAttente.length} décision</span>
                    )}
                    {d && (
                      <span className="m">
                        {(tl?.activite[p.dir] ?? []).reduce((a, b) => a + b, 0)} commits · 7 j
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hq-panel">
            <div className="hq-ph">
              <h2>Git — par agent</h2>
              <span className="hq-meta">[ai] = agent · 7 jours</span>
            </div>
            <table className="hq-git">
              <tbody>
                {evenements.slice(0, 14).map((e) => (
                  <tr key={`${e.repo}${e.hash}`}>
                    <td>{heure(e.date)}</td>
                    <td className={e.ai ? 'ai' : 'hu'}>{e.ai ? 'agent' : e.auteur.split(' ')[0]}</td>
                    <td>{e.repo}</td>
                    <td className="msg">{e.message}</td>
                    <td>{e.hash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="hq-right">
          <div className="hq-ph">
            <h2>Timeline</h2>
            <span className="hq-meta">{evenements.length} évts · 7 j</span>
          </div>
          <div className="hq-tl">
            {jours.map((j) => (
              <div key={j.label}>
                <div className="hq-day">{j.label}</div>
                {j.evts.map((e) => (
                  <div className="hq-ev" key={`${e.repo}${e.hash}`}>
                    <span className="h">{heure(e.date)}</span>
                    <span className="w">
                      <span className={`act ${e.ai ? 'ai' : 'hu'}`}>
                        {e.ai ? 'agent' : e.auteur.split(' ')[0]}
                      </span>{' '}
                      <span className="repo">{e.repo}</span> — {e.message}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="hq-qr">
            <div className="lbl">Demande à Jarvis</div>
            <input
              value={question}
              placeholder="« Où en est werky ? »"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && question.trim())
                  setReponse(
                    'Le Q&R arrive à l’itération 5 (branchement Claude headless sur tes STATE/briefs). Ta question est notée.',
                  );
              }}
            />
            {reponse && <div className="ans">{reponse}</div>}
          </div>
        </aside>
      </div>

      <div className="hq-themes">
        {THEMES.map((t) => (
          <button
            key={t.nom}
            className={theme === t.cls ? 'on' : ''}
            onClick={() => choisirTheme(t.cls)}
          >
            {t.nom}
          </button>
        ))}
      </div>

      {decision && (
        <div className="hq-veil" onClick={() => setDecision(null)}>
          <div className="hq-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div className="t">{decision.titre}</div>
              <div className="m">
                {decision.repo}/.quorum/decisions/{decision.fichier}
              </div>
            </div>
            <div className="hq-adr">{decision.contenu}</div>
            {erreur && <div className="hq-err">{erreur}</div>}
            <div className="mf">
              <textarea
                autoFocus
                placeholder="Ta décision — écrite dans l'ADR, elle débloque le quorum-gate…"
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
              />
              <button className="hq-btn" onClick={() => setDecision(null)}>
                Fermer
              </button>
              <button className="hq-btn cy" onClick={trancher} disabled={!texte.trim()}>
                Trancher
              </button>
            </div>
          </div>
        </div>
      )}

      {briefOuvert && (
        <div className="hq-veil" onClick={() => setBriefOuvert(false)}>
          <div className="hq-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div className="t">Brief du matin</div>
              <div className="m">généré chaque jour à 6h27 par la routine cloud</div>
            </div>
            <div className="hq-adr">{etat?.brief || 'Brief indisponible.'}</div>
            <div className="mf">
              <button className="hq-btn cy" onClick={() => setBriefOuvert(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {creation && (
        <div className="hq-veil" onClick={() => setCreation(false)}>
          <div className="hq-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh">
              <div className="t">Nouveau projet</div>
              <div className="m">crée STATE.md + IDEE.md + .quorum — prêt pour le kickoff</div>
            </div>
            {erreur && <div className="hq-err">{erreur}</div>}
            <div className="mf" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <input
                autoFocus
                placeholder="nom-en-kebab-case"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
              <textarea
                placeholder="L'idée, en quelques lignes…"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="hq-btn" onClick={() => setCreation(false)}>
                  Annuler
                </button>
                <button className="hq-btn cy" onClick={creer} disabled={!nom.trim()}>
                  Créer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

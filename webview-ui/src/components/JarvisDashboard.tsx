import './jarvis-dashboard.css';

import { useCallback, useEffect, useState } from 'react';

/** Jarvis HQ — the landing view. Direction: Iron Man JARVIS HUD (FUI) —
 *  holographic cyan on deep black, cut-corner frames, ambient scanline.
 *  Amber = decision awaiting Stephan; the inbox modal shows the full ADR. */

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

export function JarvisDashboard({ onEnterCampus }: { onEnterCampus: () => void }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [texte, setTexte] = useState('');
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState('');
  const [desc, setDesc] = useState('');
  const [erreur, setErreur] = useState('');

  const charger = useCallback(() => {
    fetch('/api/jarvis/etat')
      .then((r) => r.json())
      .then(setEtat)
      .catch(() => setEtat(null));
  }, []);
  useEffect(() => {
    charger();
    const t = setInterval(charger, 20000);
    return () => clearInterval(t);
  }, [charger]);

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
    } else setErreur((await r.json()).erreur ?? 'échec');
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
    } else setErreur((await r.json()).erreur ?? 'échec');
  };

  const briefSansTitre =
    etat?.brief?.replace(/^# .+$/m, '').trim() || 'Brief indisponible — la routine passe à 6h27.';
  const nbAttente = etat?.decisions.length ?? 0;

  return (
    <div className="hq" data-testid="jarvis-hq">
      <div className="hq-bar">
        <span className="hq-mark">
          <b>JARVIS</b> · QG
        </span>
        <span className="hq-count">
          {nbAttente ? (
            <>
              <b>{nbAttente}</b> décision{nbAttente > 1 ? 's' : ''} t'attend
              {nbAttente > 1 ? 'ent' : ''}
            </>
          ) : (
            'rien ne t’attend'
          )}
        </span>
        <span className="hq-spacer" />
        <button className="hq-btn" onClick={() => setCreation(true)}>
          + Nouveau projet
        </button>
        <button className="hq-btn primary" onClick={onEnterCampus}>
          Entrer au campus →
        </button>
      </div>

      <div className="hq-grid">
        <div className="hq-panel">
          <h2>Le brief du matin</h2>
          <div className="hq-brief">{briefSansTitre}</div>
        </div>
        <div className="hq-panel">
          <h2>Décisions en attente — ta seule file</h2>
          {etat && nbAttente === 0 && <div className="hq-ok">Aucune — tout est tranché. ✔</div>}
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
              {d.titre}
              <small>
                {d.repo}/.quorum/decisions/{d.fichier}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="hq-cards">
        {etat?.projets.map((p) => (
          <div className="hq-card" key={p.dir}>
            <b>{p.nom}</b>
            <span className="hq-salle">{p.salle}</span>
            <p>{p.action ?? 'pas de STATE.md'}</p>
            {p.enAttente.length > 0 && (
              <span className="hq-badge">⚠ {p.enAttente.length} décision(s)</span>
            )}
          </div>
        ))}
      </div>

      {decision && (
        <div className="hq-veil" onClick={() => setDecision(null)}>
          <div className="hq-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              {decision.titre}
              <small>
                {decision.repo}/.quorum/decisions/{decision.fichier}
              </small>
            </header>
            <div className="hq-adr">{decision.contenu}</div>
            {erreur && <div className="hq-err">{erreur}</div>}
            <footer>
              <textarea
                autoFocus
                placeholder="Ta décision (elle sera écrite dans l'ADR et débloquera le quorum-gate)…"
                value={texte}
                onChange={(e) => setTexte(e.target.value)}
              />
              <button className="hq-btn" onClick={() => setDecision(null)}>
                Fermer
              </button>
              <button className="hq-btn primary" onClick={trancher} disabled={!texte.trim()}>
                Trancher
              </button>
            </footer>
          </div>
        </div>
      )}

      {creation && (
        <div className="hq-veil" onClick={() => setCreation(false)}>
          <div className="hq-modal" onClick={(e) => e.stopPropagation()}>
            <header>Nouveau projet</header>
            {erreur && (
              <div className="hq-err" style={{ paddingTop: 10 }}>
                {erreur}
              </div>
            )}
            <footer style={{ borderTop: 'none', flexDirection: 'column', alignItems: 'stretch' }}>
              <input
                autoFocus
                placeholder="nom-en-kebab-case"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
              <textarea
                placeholder="L'idée, en quelques lignes — elle deviendra IDEE.md, point de départ du kickoff quorum."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="hq-btn" onClick={() => setCreation(false)}>
                  Annuler
                </button>
                <button className="hq-btn primary" onClick={creer} disabled={!nom.trim()}>
                  Créer (STATE + IDEE + .quorum)
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

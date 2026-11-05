# STATE — jarvis-campus

_Mis à jour : 24/08/2026 (création du fichier — le repo n'en avait pas, loi n°6)._

## Ce que c'est

Fork de pixel-agents (MIT, github.com/DGDStephan/pixel-agents, upstream branché) — base visuelle du campus Jarvis (ADR T-0001 option A, « à notre sauce »). Démo : `node dist/cli.js` puis ouvrir l'URL affichée.

## Où on en est

- Buildé, serveur standalone testé OK (06/08). gitleaks installé (pre-commit du fork).
- Branche `campus/projet-cle-cwd` (greffe G2-a, commit dca9f1f) : mergeable, 23 tests verts, 7 échecs préexistants prouvés hors diff. **Pas mergée.**
- Plan des 3 greffes : `greffes/cartographie-fork.md` du repo jarvis (ordre : G2-config → G3 board quorum → G1 driver Codex).
- 5 fichiers WIP locaux non commités (état au 24/08, à trier en session dédiée).

## Prochaine action

Attend la décision « ordre des itérations QG » (A-2026-08-09-audit-jarvis-ordre-iterations, repo jarvis). La supervision quotidienne passe d'abord par la page de décisions (24/08) ; le campus visuel vient après.

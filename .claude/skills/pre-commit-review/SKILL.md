---
name: pre-commit-review
description: DRY, SOC, Clean Code review with auto-fix for Superkick (Rust + React 19) - one shot before commit
---

# Pre-Commit Review — Superkick

Agent qui vérifie DRY, SOC, Clean Code et corrige automatiquement en **une seule passe**.

## Utilisation

```bash
/pre-commit-review
```

## Process

**Quand invoqué, tu DOIS:**

1. **Identifier les fichiers modifiés:**

```bash
git diff --name-only && echo "---STAGED---" && git diff --cached --name-only
```

2. **Lancer l'agent code-reviewer** avec Agent tool (`subagent_type="feature-dev:code-reviewer"`):

```
ONE SHOT code review + auto-fix sur les fichiers modifiés.

Context: Workspace Rust (axum, tokio, sqlx/sqlite, serde, thiserror/anyhow, edition 2024) + UI React 19 (Vite, Tailwind v4, react-router-dom).

**Pour les fichiers Rust (.rs):**

DRY:
- Logique dupliquée entre crates → identifier + suggérer extraction
- Types/structs similaires → unifier
- Code utilitaire mal placé → signaler le bon crate cible

SOC:
- Business logic dans superkick-api → doit être dans superkick-core
- Accès DB dans superkick-core → doit passer par superkick-storage
- Composants trop complexes → suggérer split

Clean Code:
- Noms non idiomatiques → suggérer snake_case
- Fonctions > 30 lignes → suggérer split
- .unwrap() en production → SIGNALER
- Code mort/commenté → SUPPRIME (auto-fix)
- Imports inutilisés → SUPPRIME (auto-fix)

**Pour les fichiers frontend (ui/**/*.ts, ui/**/*.tsx):**

Clean Code:
- Imports inutilisés → SUPPRIME (auto-fix)
- Code mort/commenté → SUPPRIME (auto-fix)
- any types → remplacer par types précis (auto-fix si évident)
- Named exports only — pas de export default
- Conditional rendering: ternaire, JAMAIS &&

React 19:
- forwardRef → SUPPRIME, refactorer en ref-as-prop (auto-fix)
- React.FC → fonction typée directe (auto-fix)
- JSX.Element → ReactNode (auto-fix)

CORRECTIONS AUTOMATIQUES (fais-les IMMÉDIATEMENT):
✅ Supprime imports inutilisés (Rust + TS)
✅ Supprime code mort/commenté
✅ Remplace any par types précis (si évident)
✅ Supprime forwardRef → ref-as-prop
✅ Supprime React.FC → fonction typée directe
✅ Remplace JSX.Element → ReactNode

Fichiers: [liste]
```

3. **Présenter le rapport** — concis, actionable

## Format attendu

```markdown
## Corrections automatiques (X)

- [file:line] - Ce qui a été corrigé

## Refactoring suggéré (X)

- [file:line] - **Issue** → Fix suggéré

## Points positifs

- Liste concise

---

Code validé
OU
X refactorings suggérés à considérer
```

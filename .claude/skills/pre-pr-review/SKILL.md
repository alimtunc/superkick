---
name: pre-pr-review
description: Comprehensive PR review for Superkick — Rust backend (clippy, error handling, async patterns) + React 19 frontend (best practices, composition). Run before creating a PR.
---

# Pre-PR Review — Superkick

Review complète avant PR : Rust best practices + React 19 frontend + Clean Code.
Lance **2 agents en parallèle** et consolide les résultats.

> **Stack**: Rust workspace (axum, tokio, sqlx/sqlite, serde, thiserror/anyhow) + React 19 UI (Vite, Tailwind v4, react-router-dom). Pas de Next.js, pas de server components.

## Utilisation

```bash
/pre-pr-review
```

## Process

**Quand invoqué, tu DOIS:**

1. **Identifier la base branch et les fichiers modifiés:**

```bash
git diff main --name-only
```

Séparer les fichiers Rust (`*.rs`, `Cargo.toml`) des fichiers frontend (`ui/**/*.ts`, `ui/**/*.tsx`).

2. **Lancer 2 agents EN PARALLÈLE** avec le Agent tool — un seul message, 2 tool calls:

### Agent 1 — Rust Review (`subagent_type="feature-dev:code-reviewer"`)

```
Code review Rust — analyse les fichiers .rs et Cargo.toml modifiés par rapport à main.

Context: Workspace Rust avec crates: superkick-api (axum), superkick-core (domain), superkick-config, superkick-runtime (tokio), superkick-storage (sqlx/sqlite), superkick-integrations.
Edition 2024, MSRV 1.85, rustfmt max_width=100.

**Error Handling:**
- anyhow::Result pour les fonctions applicatives, thiserror pour les erreurs de domaine
- Pas de .unwrap() en production code (seulement dans les tests)
- Pas de panic! en production — utiliser Result
- Les erreurs doivent remonter avec ? et avoir du contexte (.context() ou .with_context())
- Les match sur Result/Option doivent être exhaustifs

**Ownership & Borrowing:**
- Préférer &str à String dans les signatures de fonction quand ownership n'est pas nécessaire
- Éviter les .clone() inutiles — vérifier si une référence suffit
- Lifetime annotations explicites quand le compilateur ne peut pas inférer

**Async Patterns (tokio):**
- Pas de .block_on() dans du code async
- Utiliser tokio::spawn pour les tâches concurrentes indépendantes
- Les Mutex tokio::sync::Mutex pour le code async, pas std::sync::Mutex
- Éviter les .await dans des boucles tight — préférer futures::join_all ou tokio::join!

**API (axum):**
- Handlers doivent retourner des types Result avec IntoResponse
- Extractors ordonnés correctement (Path avant Body)
- État partagé via Extension ou State, pas de globals

**SQL (sqlx):**
- Utiliser les query macros typées (query!, query_as!) quand possible
- Pas de SQL string formatting — toujours des paramètres bindés
- Les migrations doivent être idempotentes

**Clean Code Rust:**
- Fonctions > 30 lignes → suggérer split
- Modules > 300 lignes → suggérer split en sous-modules
- Imports inutilisés → SIGNALER
- Code mort/commenté → SIGNALER
- Noms non idiomatiques (camelCase au lieu de snake_case) → SIGNALER
- Préférer les iterators (.map, .filter, .collect) aux boucles for manuelles quand approprié
- Utiliser #[must_use] pour les fonctions dont le résultat ne devrait pas être ignoré
- Dériver les traits standard quand approprié (Debug, Clone, PartialEq)

**DRY:**
- Logique dupliquée entre crates → identifier + suggérer extraction
- Types/structs similaires → unifier ou utiliser des generics
- Code utilitaire → devrait être dans le bon crate (core pour le domaine, runtime pour l'infra)

**SOC:**
- Pas de logique métier dans superkick-api → doit être dans superkick-core
- Pas d'accès DB direct dans superkick-core → passer par superkick-storage
- Pas de dépendance circulaire entre crates

NE corrige PAS automatiquement. Rapporte uniquement.

Fichiers: [liste des fichiers .rs et Cargo.toml modifiés]
```

### Agent 2 — React 19 / Frontend Review (`subagent_type="feature-dev:code-reviewer"`)

> **Note:** Lancer cet agent UNIQUEMENT si des fichiers `ui/**` sont modifiés. Sinon, skip.

```
Code review React 19 + Clean Code sur les fichiers frontend modifiés par rapport à main.
Context: React 19, Vite, Tailwind v4, react-router-dom. PAS de Next.js, PAS de server components. Petit dashboard UI.

**React 19 — Règles:**
- forwardRef est INTERDIT → ref est un prop standard
- React.FC / React.FunctionComponent sont INTERDITS → fonctions typées directement
- JSX.Element → utiliser ReactNode pour les props rendues
- defaultProps est INTERDIT → valeurs par défaut ES6
- Préférer use(MyContext) à useContext(MyContext) pour les nouveaux composants

**Clean Code:**
- Named exports uniquement — pas de export default
- Conditional rendering: ternaire condition ? <X /> : null, JAMAIS condition && <X />
- Empty returns: return null, JAMAIS return <></>
- Imports inutilisés → SIGNALER
- Code mort/commenté → SIGNALER
- any types → SIGNALER avec suggestion de type précis
- Composants > 150 lignes → suggérer split

**DRY/SOC:**
- Logique dupliquée → suggérer extraction dans un hook ou utilitaire
- Business logic dans composants → doit être dans des hooks
- Pas de fetch direct — utiliser des fonctions API séparées

**Tailwind v4:**
- Pas de classes CSS custom si un utilitaire Tailwind existe
- Responsive design cohérent

NE corrige PAS automatiquement. Rapporte uniquement.

Fichiers: [liste des fichiers ui/ modifiés]
```

3. **Consolider les rapports** dans le format ci-dessous.

## Format attendu

```markdown
# Pre-PR Review — Superkick

## Issues critiques (X)

- [file:line] - **[Catégorie]** Description → Fix

## Améliorations suggérées (X)

- [file:line] - **[Catégorie]** Description → Fix

## Points positifs

- Liste concise

---

PR prête
OU
X issues critiques à corriger avant PR
X améliorations à considérer
```

Catégories possibles : `Error Handling`, `Ownership`, `Async`, `API Design`, `SQL`, `Clean Code`, `DRY`, `SOC`, `React 19`, `Composition`, `Bundle`, `Tailwind`.

# Iteration 2 Launch Plan

## Goal

The first functional version now exists with:

- a stronger dashboard home
- an initial CLI surface

This iteration closes the next product loop:

- launch several runs easily
- supervise several runs in one window
- switch focus quickly without tab chaos

## Worktrees

### Multi-Session Track

- path: `/private/tmp/superkick-multi-session`
- branch: `feat/multi-session-rail`

### Manual Run Track

- path: `/private/tmp/superkick-manual-run`
- branch: `feat/manual-run-cli`

## Launch Commands

### Terminal 1

```bash
cd /private/tmp/superkick-multi-session
claude
```

### Terminal 2

```bash
cd /private/tmp/superkick-manual-run
claude
```

## Prompt For Multi-Session Track

```text
Tu es lancé depuis le repo principal `/Users/alimtunc/Developement/Side/superkick`, mais pour cette tâche tu dois travailler exclusivement dans le worktree :

`/private/tmp/superkick-multi-session`

Branche attendue :
`feat/multi-session-rail`

Commence par vérifier :
- que tu travailles bien dans `/private/tmp/superkick-multi-session`
- que la branche active est `feat/multi-session-rail`

Lis d’abord :
- `docs/stories/SK-STORY-005-multi-session-rail-and-quick-switching.md`
- `docs/dashboard-home-structure.md`
- `docs/dashboard-visual-directions.md`
- `ui/src/App.tsx`
- `ui/src/pages/ControlCenter.tsx`
- `ui/src/pages/RunDetail.tsx`
- `ui/src/components/dashboard/RunBoard.tsx`
- `ui/src/hooks/useDashboardRuns.ts`
- tout autre fichier UI utile pour comprendre la shell actuelle

Contexte important :
- une première version du dashboard control center existe déjà
- une première `SessionWatchRail` existe déjà visuellement
- il ne faut pas la refaire de zéro sans raison
- il faut la transformer en vraie feature de supervision multi-session

Objectif produit :
Permettre de garder plusieurs sessions visibles dans la même fenêtre, de changer de focus instantanément, et de superviser plusieurs runs sans ouvrir plusieurs tabs.

Ce que cette itération doit apporter :
- transformer la logique actuelle du rail en vrai pattern de `watched sessions`
- permettre de suivre plusieurs runs en parallèle dans la même fenêtre
- rendre le changement de focus rapide et naturel
- garder un seul contexte principal lisible à la fois
- poser une base propre pour une évolution future vers compare mode ou split view

Scope recommandé :
- session rail persistante et utile, pas seulement décorative
- watched sessions explicites ou intelligemment dérivées
- support de 3 à 5 sessions max de façon lisible
- switch instantané entre sessions
- comportement cohérent entre overview et run detail si c’est pertinent
- persistance locale si cela aide l’expérience

Contraintes importantes :
- ne transforme pas l’écran en mur de logs multi-run
- une seule session doit rester le focus principal
- ne pars pas sur un split-screen complexe dans cette itération
- reste dans une solution simple, produit, lisible
- n’introduis pas de backend lourd si ce n’est pas indispensable

Résultat attendu :
- une vraie feature multi-session crédible
- une expérience de supervision plus proche d’un mission control
- une UI plus pratique quand plusieurs runs vivent en même temps

Tu gères librement l’architecture frontend et les choix techniques.

À la fin, donne :
- les fichiers modifiés
- les choix UX faits
- ce qui existait déjà et ce que tu as réellement ajouté
- les vérifications/tests effectués
- les follow-ups utiles
```

## Prompt For Manual Run Track

```text
Tu es lancé depuis le repo principal `/Users/alimtunc/Developement/Side/superkick`, mais pour cette tâche tu dois travailler exclusivement dans le worktree :

`/private/tmp/superkick-manual-run`

Branche attendue :
`feat/manual-run-cli`

Commence par vérifier :
- que tu travailles bien dans `/private/tmp/superkick-manual-run`
- que la branche active est `feat/manual-run-cli`

Lis d’abord :
- `docs/stories/SK-STORY-004-manual-run-from-cli.md`
- `docs/local-setup.md`
- `docs/target-architecture.md`
- `crates/superkick-cli/src/main.rs`
- `crates/superkick-cli/src/doctor.rs`
- `crates/superkick-cli/src/init.rs`
- `crates/superkick-cli/src/serve.rs`
- `crates/superkick-cli/src/status.rs`
- `crates/superkick-cli/src/cancel.rs`
- `crates/superkick-api/src/lib.rs`
- tout autre fichier nécessaire pour comprendre le contrat actuel entre CLI et serveur

Contexte important :
- une CLI existe déjà
- elle couvre déjà `doctor`, `init`, `serve`, `status`, `cancel`
- cette tâche ne consiste pas à refondre toute la CLI
- la tâche consiste à fermer la boucle de lancement manuel avec un vrai `superkick run`

Objectif produit :
Permettre à un développeur de lancer un run depuis la CLI avec un issue identifier, sans attendre un webhook Linear, tout en passant par le control plane local.

Ce que cette itération doit apporter :
- un `superkick run <issue>` propre
- validation du contexte repo/config
- création du run via le service local, pas en contournant l’architecture
- messages utilisateurs clairs
- un comportement cohérent avec la philosophie locale-first du produit

Scope recommandé :
- ajouter la commande `run`
- définir les entrées minimales nécessaires
- vérifier que le repo courant est configuré pour Superkick
- utiliser l’API locale existante pour créer le run
- rendre l’erreur actionnable si le serveur n’est pas disponible ou si la config est invalide
- mettre à jour la doc d’usage si nécessaire

Contraintes importantes :
- ne réécris pas la CLI entière
- ne casse pas `doctor`, `init`, `serve`, `status`, `cancel`
- ne déporte pas l’exécution dans la CLI elle-même
- garde le serveur local comme source de vérité
- privilégie une solution simple et cohérente

Résultat attendu :
- un vrai `manual run` utilisable
- une boucle de démo plus crédible
- une meilleure continuité entre CLI, API locale et dashboard

Tu gères librement l’architecture et les choix techniques.

À la fin, donne :
- les fichiers modifiés
- les décisions prises
- les commandes à utiliser
- les vérifications/tests effectués
- les limites restantes
- les follow-ups utiles
```

## Integration Order

Recommended merge order:

1. `feat/manual-run-cli`
2. `feat/multi-session-rail`

Why:

- manual run strengthens the product loop first
- multi-session then lands on top of a more complete usage flow

# Réalignement design Issue-centered v1 — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner l'UI au pixel sur les maquettes approuvées (A1/A2/A3 + `SPEC.md`), périmètre **Couche 0 (Fondations) + Couche 1 (Issues)** — Runs/Cockpit/Drawer (Couche 2) et Shell/extras restants (Couche 3) en passes ultérieures.

**Architecture:** L'app vit aujourd'hui sur deux design systems en parallèle. La Couche 0 supprime le système « Graphite » déprécié et fait tout passer par `tokens.css`, corrige l'échelle root (16px) et les polices, puis répare les atomes/icônes. La Couche 1 rend chaque surface Issues identique à la maquette. Chaque tâche est isolée dans un worktree, taille ≈ une PR, et cite les IDs de findings de [`AUDIT.md`](./AUDIT.md) (référence exhaustive des 182 écarts + fix concret par item).

**Tech Stack:** React 19, Vite, Tailwind v4 (`@theme` dans CSS), TanStack Router/Query/Form, vitest + testing-library, harness visual-parity (`ui/visual-parity/`).

---

## Stratégie de vérification

La parité visuelle ne se teste pas en TDD unitaire ; la vérité est la maquette. Pour chaque tâche :

| Vérif | Commande | Quand |
|---|---|---|
| Types (rapide) | `just check` (`tsc --noEmit`) | à chaque étape |
| Types CI-parité | `pnpm --dir ui build` (`tsc -b`, plus strict) | avant de clore une tâche |
| Comportement | `pnpm --dir ui test` (vitest) | tâches touchant la logique/les tests existants |
| Lint/format | `pnpm --dir ui lint && pnpm --dir ui fmt` | avant de clore une tâche |
| Parité pixel | `pnpm --dir ui visual:parity --states <états>` (ou `just visual-parity --states …`) | par surface, diff vs artboard |

> ⚠️ **Re-vérification systémique attendue.** Task F1 (root 16px) ré-inflate toutes les utilités `rem` de ~14 % d'un coup → des layouts ajustés à l'œil au scale 14px vont bouger. Après F1, faire une passe `visual:parity` complète avant d'enchaîner — c'est le filet.

> **Pas de fabrication de données.** Si un champ optionnel n'est pas câblé (linked run, estimate, due date…), on **omet l'affordance** (spacer, pas « — »). cf. `COMPONENT_MAPPING.md` § Data gaps.

---

## Dispositions hors-spec (à CONFIRMER avant exécution)

Tu as demandé de retirer le hors-spec **mais de garder ce qui est un vrai « plus »**. Voici ma proposition par item (pattern « flag default-off » = code préservé, masqué ; « delete » = bruit visuel pur ; « re-skin » = on garde mais aux tokens). À valider/ajuster :

| Item | Code | Disposition proposée | Pourquoi |
|---|---|---|---|
| `Pill` tons mineral/oxide/gold/cyan/violet | `components/ui/pill.tsx` | **delete** (migrer callers → sémantiques) | bruit / palette dépréciée |
| Pills texte P1/P2 sur cartes kanban | `SeverityPill` dans `KanbanIssueCard` | **delete** → `PriorityIcon` glyphe | EX-01, anti-pattern explicite |
| Pills Ready/Waiting/Blocked (carte kanban) | `IssueExtraBadges` | **flag** `kanbanGatingPills:false` | capacité d'info réelle, mais hors anatomie §12.1 |
| Bouton « Dispatch » sur carte | `KanbanIssueCard:208-219` | **flag** `kanbanCardLaunch:false` | lancement = topbar du détail (EX-04) ; vrai raccourci → on préserve |
| Runs rendus comme cartes kanban | `KanbanCard`/`KanbanRunCard` | **flag** `kanbanRunCards:false` | §0.5 : le run vit sur l'issue (TaskDot), pas une carte |
| Tag « auto » colonne kanban | `KanbanColumn` | **delete** | EX-05, bruit d'entête |
| Terminal takeover (drawer) | `TerminalTakeover` via `ShellTab` | **flag** `drawerTerminalTakeover:false` + flux read-only | EX-09 + smell sécurité (force-takeover 1-tap) ; capacité réelle → préservée |
| RunDock (barre globale basse) | `components/shell/RunDock.tsx` | **flag** `globalRunDock:false` | contredit §0.5 (3 surfaces « ce qui tourne »). Préservé : c'est un « plus » possible |
| SessionWatchRail (bandeau sous topbar) | `dashboard/SessionWatchRail.tsx` | **flag** `sessionWatchRail:false` | idem |
| Panneau contexte workspace (snapshot/memory/linked-items) | `IssueContextPanel` & sections | **flag** `workspaceContextPanel:false` | rend sur ChatPanel/LaunchTaskFeed, pas la hover-card ; vrai contexte de lancement → préservé, à re-designer |
| Bouton « Launch task » dans la hover-card | `IssuePreview:161-179` | **delete** | §11.3 interdit action primaire dans la card |

Tous les flags vivent dans un nouveau `ui/src/lib/features.ts` (créé en F2), default `false`, et sont tracés dans `IMPLEMENTATION_EXTRAS.md`.

---

# Couche 0 — Fondations

> Débloque tout le reste et rend l'app cohérente d'un coup (une seule palette, une seule échelle, une seule police mono). Le codemod de tokens est **mécanique** (couleur uniquement) — il ne fait PAS le rework de layout des surfaces Run (ça reste Couche 2).

## Task F1 — Échelle root 16px + polices (JetBrains Mono, `.font-data` unifié)

**Files:**
- Modify: `ui/src/index.css:1` (import polices), `:48-50` (root), `:52-62` (body), `:64-67` (`.font-data`)
- Modify: `ui/src/styles/tokens.css:28` (`--font-mono`)

- [ ] **Étape 1 — Charger JetBrains Mono.** Remplacer l'`@import` ligne 1 pour ajouter la famille :
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```
(on retire DM Mono de l'import — plus consommé après cette tâche.)

- [ ] **Étape 2 — Root 16px, body 14px.** Dans `index.css` :
```css
html { font-size: 16px; }            /* rem nominal = px du mockup */
body {
  font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
  font-size: 14px;                    /* texte de base spec §1 (rem reste relatif à html=16) */
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: var(--color-void);   /* corrigé en F2 (un seul --color-void = #0b0d0f) */
  color: var(--color-fg);
}
```

- [ ] **Étape 3 — `.font-data` → mono canonique.**
```css
.font-data { font-family: var(--font-mono); font-feature-settings: 'tnum','ss01'; }
```
Et dans `tokens.css:28`, retirer `'DM Mono'` de la liste : `--font-mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace;`

- [ ] **Étape 4 — Vérifier.** `just check` puis `pnpm --dir ui build`. Lancer le dev (`just dev`) et confirmer visuellement : tous les IDs/compteurs/timestamps en JetBrains Mono, fond `#0b0d0f`. **Puis passe `visual:parity` complète** (baseline post-inflation rem).

Findings: `FND-03`, `HOV-01`/`HOV-04` (échelle), `CMT` mono, foundations summary.

## Task F2 — Supprimer la palette Graphite + codemod tokens (+ `features.ts`)

**Files:**
- Modify: `ui/src/index.css` (supprimer `@theme` Graphite `:8-37`, remapper le `:root` shadcn `:197-217`, le `@theme inline` `:169-195` reste mais pointe vers les bons `:root`)
- Create: `ui/src/lib/features.ts`
- Modify (codemod, ~40 fichiers) : tout consommateur des classes Graphite (voir mapping)

- [ ] **Étape 1 — Résoudre la collision `void`.** Dans `tokens.css`, renommer `--color-canvas` → `--color-void` (valeur `#0b0d0f` inchangée) et garder un alias `--color-canvas: var(--color-void);` temporaire pour ne rien casser. Supprimer le `--color-void: #0b0c0e` du bloc Graphite (`index.css:11`).

- [ ] **Étape 2 — Codemod des classes.** Remplacer dans tout `ui/src/**` (hors `tokens.css`/`index.css`) selon :
```
edge / edge-bright   → border / border-strong
carbon / graphite    → surface
carbon-dim           → surface          (⚠ classe INDÉFINIE aujourd'hui → fond transparent)
slate-deep           → raised
panel                → overlay
fog                  → fg
silver               → fg-muted
ash / dim            → fg-dim
mineral / neon-green → success
oxide                → danger
gold                 → warn
cyan                 → info
violet               → accent
font-data            → (laisser ; résolu en F1)
```
Préfixes concernés : `bg-`, `text-`, `border-`, `ring-`, `ring-offset-`, `from-`/`to-`, `*-dim`/`/NN` alpha. Faire le remplacement, puis `just check`.

- [ ] **Étape 3 — Remapper le bloc shadcn `:root`** (`index.css:197-217`) sur les valeurs tokens (au lieu des Graphite) :
```css
:root {
  --background: var(--color-void);   --foreground: var(--color-fg);
  --card: var(--color-surface);      --card-foreground: var(--color-fg);
  --popover: var(--color-overlay);   --popover-foreground: var(--color-fg);
  --primary: var(--color-accent);    --primary-foreground: #fff;
  --secondary: var(--color-raised);  --secondary-foreground: var(--color-fg);
  --muted: var(--color-raised);      --muted-foreground: var(--color-fg-muted);
  --accent: var(--color-raised);     --accent-foreground: var(--color-fg);
  --destructive: var(--color-danger);
  --border: var(--color-border);     --input: var(--color-border);
  --ring: var(--color-accent);       --radius: 7px;   /* §4.2 Btn radius */
}
```
Puis **supprimer le bloc `@theme` Graphite** (`index.css:8-37`) et les utilitaires Graphite morts (`.panel`, `.glow-*` si non utilisés après codemod — vérifier `grep`).

- [ ] **Étape 4 — Créer `ui/src/lib/features.ts`** :
```ts
export const FEATURES = {
  kanbanGatingPills: false,
  kanbanCardLaunch: false,
  kanbanRunCards: false,
  drawerTerminalTakeover: false,
  globalRunDock: false,
  sessionWatchRail: false,
  workspaceContextPanel: false,
} as const
```

- [ ] **Étape 5 — Vérifier.** `just check` && `pnpm --dir ui build` && `pnpm --dir ui test` && `pnpm --dir ui lint`. Grep de contrôle : `grep -rn "carbon\|edge\|silver\|fog\|mineral\|oxide\|gold\|cyan\|violet\|slate-deep\|graphite\|panel-hover" ui/src --include=*.tsx` doit revenir vide (hors commentaires).

Findings: `FND-01`, `FND-02`, `FND-04` (foundations) ; `DRW-01`, `FND-01`/`FND-02` (inspector) ; `DOCK-01`, `DOCK-02` ; tout `color`/`elevation` sur surfaces Run (couleur réglée ici, layout en Couche 2).

## Task F3 — Atome `Pill` : géométrie + tons sémantiques

**Files:** Modify `ui/src/components/ui/pill.tsx`, + callers utilisant des tons non-sémantiques.

- [ ] **Étape 1 — Tons.** Remplacer les variantes par les 6 sémantiques :
```
neutral → bg-transparent border border-border text-fg-muted
accent  → bg-accent-soft text-accent border-transparent
success → bg-success-soft text-success border-transparent
warn    → bg-warn-soft  text-warn  border-transparent
danger  → bg-danger-soft text-danger border-transparent
info    → bg-info-soft  text-info  border-transparent
```
- [ ] **Étape 2 — Géométrie (artboard, priorité 1).** taille de base : `h-[18px] px-2 py-px rounded-full text-[11.5px] font-medium gap-1.5 leading-none`. Dot optionnel 5×5 en tête, `sk-pulse` si `pulse`.
- [ ] **Étape 3 — Migrer les callers** restés sur d'anciens noms de tons (`mineral`→`success`, etc.). `just check`.
- [ ] **Étape 4 — Vérifier.** `pnpm --dir ui build` && `pnpm --dir ui test`.

Findings: `FND-04` (foundations), note UX exec-log « StateChip borderless ».

## Task F4 — Icônes + motion + avatar par agent

**Files:** Modify `ui/src/ui/PriorityIcon.tsx`, `StatusIcon.tsx`, `ui/src/index.css` (keyframes), `ui/src/ui/Avatar.tsx`, `ui/src/ui/TaskBadge.tsx` (+ `TaskBadge.test.tsx`), `AlertRow.tsx`, `WatchChip.tsx`. Create `ui/src/lib/domain/agentColor.ts`.

- [ ] **Étape 1 — PriorityIcon.** Barres pleines `fill="var(--color-fg)"`, barres vides `fill="var(--color-border-strong)"` (ne plus piloter par `text-*`). `urgent` reste `text-danger`. (`FND-05`)
- [ ] **Étape 2 — StatusIcon `review`.** `TONE_CLASS.review = 'text-accent'` ; glyphe = cercle `fillOpacity 0.18` + cercle stroke + check `M4.4 7.3 L6.2 9 L9.6 5.4` (comme `done` sans fond plein). (`FND-06`)
- [ ] **Étape 3 — StatusIcon `needs`.** Corriger le wedge en demi-disque haut→bas-droite conforme artboard. (`FND-07`)
- [ ] **Étape 4 — Keyframes.** Ajouter dans `index.css` :
```css
@keyframes sk-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
.sk-pulse { animation: sk-pulse 1.6s ease-in-out infinite; }
@keyframes sk-shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
```
Router `live-pulse` → `sk-pulse` (TaskBadge, AlertRow, WatchChip) **et** mettre à jour `TaskBadge.test.tsx` (`.live-pulse` → `.sk-pulse`). Supprimer l'ancien `live-pulse` (ou l'aliaser). (`MOT-*`)
- [ ] **Étape 5 — Avatar par agent.** Créer `agentColor.ts` avec la table fixe (§6.3 : `fix-bot #3a6f4e`, `review-bot #5b6ef2`, `senior-bot #a87a1f`, `Léa M #6f5ad9`, `C. Park #b06a3a`, `Owen #357a8a`, fallback neutre). Ajouter prop `color` à `Avatar` et la câbler dans les avatars de commentaires/agents. (`FND` avatar)
- [ ] **Étape 6 — Vérifier.** `pnpm --dir ui build` && `pnpm --dir ui test`. Rendre côte-à-côte les 7 status + 5 priorités vs artboard `detail-*`.

---

# Couche 1 — Issues (drop-for-drop)

## Task I1 — Issue row : colonnes manquantes + état sélectionné + largeurs

**Files:** Create `ui/src/ui/EstimateChip.tsx`, `ui/src/ui/SubCountChip.tsx`, `ui/src/components/issues/ProjectTag.tsx`. Modify `ui/src/components/issues/IssueRow.tsx`, `IssueRow.test.tsx`, `TaskDot.tsx`.

- [ ] **Étape 1 — Primitives.** `EstimateChip` (22×18, border `--color-border`, mono 11px, radius 5) ; `SubCountChip` (`done/total` mono 11, fgDim, largeur 42 right) ; `ProjectTag` (folder 11 fgDim + nom 11.5 fgMuted, `max-w-[140px] truncate`).
- [ ] **Étape 2 — Colonnes (§8.2).** Insérer entre Labels et Project : **Sub-count** (42) puis, entre Project et Assignee : **Estimate** (22). Rendre un spacer de la bonne largeur quand la valeur est absente (alignement stable).
- [ ] **Étape 3 — Largeurs/tailles.** ID `w-16` mono `text-[11.5px]` ; StatusIcon `size 14` ; Assignee avatar `20` ; Updated cellule `38` ; TaskDot cellule `w-2.5` (10px) dot `8`.
- [ ] **Étape 4 — État sélectionné (`ROW-01`).** Remplacer `focused ? 'bg-raised ring-1 ring-accent-soft ring-inset'` par :
```
focused ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]' : null
```
- [ ] **Étape 5 — TaskDot.** `needs` et `running` : `sk-pulse` + anneau externe 3px (`color-mix 18%`). Retirer le dim du titre des rows Done.
- [ ] **Étape 6 — Vérifier.** Mettre à jour `IssueRow.test.tsx` (nouvelles colonnes/spacers), `pnpm --dir ui test`, `pnpm --dir ui build`, `visual:parity --states issues-list-default,issues-list-hover`.

Findings: `ROW-01..ROW-23` (voir AUDIT).

## Task I2 — Group header 32px + regroupement par statut Linear (liste + kanban)

**Files:** Modify `ui/src/lib/domain/issueState.ts` (+ `issueState.test.ts`), `components/issues/IssueGroupHeader.tsx`, `IssuesListView.tsx`, `IssuesKanbanView.tsx`, `KanbanColumn.tsx`.

- [ ] **Étape 1 — Header `h-9` → `h-8`** (32px) + glyphes `+`/`more` fgDim basse emphase. (`GRP-04`)
- [ ] **Étape 2 — Ordre des statuts.** Dans `issueState.ts`, remplacer le bucket `open` (Backlog+Todo fusionnés) par deux lanes, et réordonner :
```
needs_human (épinglé, warn) → backlog → todo → in_progress → in_review → done
```
Mettre à jour `issueState.test.ts`.
- [ ] **Étape 3 — Liste + kanban consomment ce même ordre.** Vérifier `IssuesListView` (groupes) et `IssuesKanbanView` (colonnes) : 6 colonnes, `Needs you` épinglé warn en tête, drop « Open ». Done : 2 cartes + « Show all N → ». (`KAN-01`)
- [ ] **Étape 4 — Vérifier.** `pnpm --dir ui test`, `pnpm --dir ui build`, `visual:parity --states issues-list-default,issues-kanban`.

Findings: `GRP-01..`, `KAN-01`.

## Task I3 — Chrome liste : view tabs + filter bar + dropdown

**Files:** Modify `IssueViewTabs.tsx`, `IssueFilterBar.tsx`, `IssueFilterDropdown.tsx`. Delete `IssuesViewToggle.tsx` (dead code).

- [ ] **Étape 1 — View tabs (§10.1).** underline `bg-fg` (PAS accent) ; badge compteur = chip `bg-raised min-w-[16px] rounded-[4px] text-[11px] text-fg-dim text-center` ; labels `text-[13px]` ; container `h-[38px] px-4 gap-0`, tab `px-3`. Star « My open work » → `text-fg-muted` (EX-06).
- [ ] **Étape 2 — Filter bar.** Standardiser toutes les commandes à `h-[26px]` ; `+Filter` dashed (déjà) ; DisplayChip Group/Sort + chevron `chevDown` visible.
- [ ] **Étape 3 — Dropdown (§10.3).** Restaurer les 4 facettes supprimées (Creator, Milestone, Cycle, Estimate) — en lignes activables ou désactivées « bientôt », jamais omises ; ordre Priority/Status correct ; **tag SK** sur « Task state » (`bg-raised`, tag `text-[9.5px] border-accent-line text-accent uppercase`) ; ligne footer « Save current as view… ». Décision : garder le drill-in 2-niveaux (bon UX, hors maquette) → flag/note, sinon flat.
- [ ] **Étape 4 — Vérifier.** `pnpm --dir ui test`, `pnpm --dir ui build`, `visual:parity --states issues-list-default,issues-filter`.

Findings: `TAB-01..`, `DROP-01..`, note IssuesViewToggle.

## Task I4 — Hover card

**Files:** Modify `ui/src/components/issues/IssuePreview.tsx`, `HoverCard.tsx`.

- [ ] **Étape 1 — Géométrie.** `w-[480px]` (px-absolu) ; `rounded-[10px]` ; ombre `shadow-[0_24px_56px_rgba(0,0,0,.55)]` ; bg `overlay`.
- [ ] **Étape 2 — Footer no-run (`HOV-06`).** Supprimer le branch `else` (`IssuePreview:161-179`) et `onLaunch` (`:45-49`) ; rendre la section liée uniquement via `linkedRun ? (…) : null`.
- [ ] **Étape 3 — Close.** Retirer le debounce 150ms (fermeture immédiate à `pointer-leave`).
- [ ] **Étape 4 — Humaniser `run.state`** → label de phase (petite map) au lieu de l'enum brut.
- [ ] **Étape 5 — Vérifier.** `pnpm --dir ui test`, `pnpm --dir ui build`, `visual:parity --states issues-list-hover`.

Findings: `HOV-01..HOV-14`.

## Task I5 — Issue detail : layout + rail + description

**Files:** Modify `IssueDetail.tsx`, `IssueDetailRail.tsx`, `IssuePropertiesBlock.tsx` (+ `properties/`), `IssueDescription.tsx`/`IssueMarkdown.tsx`, `IssueDetailTopbarRight.tsx`.

- [ ] **Étape 1 — Rail.** `w-[308px]` ; `bg-surface` (PAS `bg-canvas`) ; padding `14px 12px`. (`RAIL-02`)
- [ ] **Étape 2 — PropRow (§13.4).** `grid grid-cols-[92px_1fr] items-center gap-2 min-h-7 rounded-[5px] px-2 py-[5px] cursor-pointer hover:bg-raised` — zone cliquable = toute la ligne.
- [ ] **Étape 3 — Status dé-pillé (`RAIL-04`).** Remplacer `<StatusChip>` par `<StatusIcon size={13}/>` + `<span class="text-[12.5px] text-fg">{statusName}</span>`. (Garder StatusChip ailleurs : kanban/tasks tile.)
- [ ] **Étape 4 — Description.** `text-[13.5px] leading-[1.65] text-fg max-w-[720px]`.
- [ ] **Étape 5 — Left column** padding `20px 28px 32px`, `gap 22`. Done-state CTA « Re-launch » → `secondary`.
- [ ] **Étape 6 — Vérifier.** `pnpm --dir ui test`, `pnpm --dir ui build`, `visual:parity --states issue-detail-idle,issue-detail-running`.

Findings: `RAIL-01..`, `TOPBAR-01..`.

## Task I6 — ExecutionLog : sections manquantes + élévation + NeedsBanner

**Files:** Create `ui/src/components/issue-detail/execution-log/ExecSection.tsx`, `ExecRow.tsx`, `ExecFileRow.tsx`. Modify `ExecutionLog.tsx`, `ExecutionLogHeader.tsx`, `NeedsBanner.tsx`, `PhaseStrip` (dans exec-log), `lib/domain/executionLog.ts`, `types/executionLog.ts`.

- [ ] **Étape 1 — Élévation (`EXEC-03`).** Outer `<section>` → `bg-surface rounded-[10px] overflow-hidden` (plus de `bg-canvas`, plus de padding sur l'outer). Header = bande pleine largeur `bg-canvas border-b border-border px-4 py-3`.
- [ ] **Étape 2 — NeedsBanner (`EXEC-05`).** Bandeau full-bleed sous le header (pas de radius, pas de bordure périmètre) :
```
border-b border-[color-mix(in_srgb,var(--color-warn)_30%,var(--color-border))]
bg-[color-mix(in_srgb,var(--color-warn)_10%,var(--color-surface))] px-3.5 py-2.5
```
Approve → `primary` (accent), Reject → `secondary`, Comment → `ghost`. Garder les décisions ICI (pas dans le drawer).
- [ ] **Étape 3 — `ExecSection`** (shell réutilisable §17.5) : `px-4 py-3 gap-2.5 border-t border-border`, eyebrow `text-[10.5px] font-semibold uppercase tracking-[0.9px] text-fg-dim`, chevron, `· N`, slot action ghost.
- [ ] **Étape 4 — `ExecRow` (RECENT ACTIVITY, `EXEC-01`).** dot 14 rond border 1.5 `palette.c`, icon 7, anneau pulse si actif ; titre flex-1 12.5 ellipsis (fgMuted/fg) ; badge Pill ; meta mono 11 fgDim min-w-50 right. Palette par kind (plan→fgMuted/layers, search→fgDim/search, tool→info/terminal, edit→accent/doc, test/pr/done→success, ask/stuck→warn, note→fgDim/clock). 3–5 rows + action « All in drawer ».
- [ ] **Étape 5 — `ExecFileRow` (FILES CHANGED, `EXEC-02`).** doc 11 fgDim, path mono 11 fg (accent si actif), barre empilée 56×4 [adds% success | dels% danger], `+N` mono 10.5 success / `−N` mono 10.5 danger min-w-22 right. Action « Diff » (ouvre drawer Files).
- [ ] **Étape 6 — PhaseStrip.** discs 18px ; actif = info-tint + anneau `sk-pulse` (pas accent plein) ; connecteurs en gradient (pas border 1px) ; câbler `· N of M`. Past runs → repli dans `ExecSection` (eyebrow « PAST RUNS · N »).
- [ ] **Étape 7 — Idle.** Conforme §17.9. Le launch idle ouvre un dialog/drawer (pas navigation `/tasks/new`) — à confirmer (voir décisions produit).
- [ ] **Étape 8 — Vérifier.** `pnpm --dir ui test` (+ `ExecutionLog.test.tsx`), `pnpm --dir ui build`, `visual:parity --states issue-detail-running,issue-detail-needs,issue-detail-done`.

Findings: `EXEC-01..EXEC-19`.

## Task I7 — Feed : séparer `ActivityNode` → carte commentaire + timeline event

**Files:** Create `ui/src/components/issue-detail/IssueCommentCard.tsx`, `IssueTimelineEvent.tsx`. Modify `IssueFeed.tsx`, retirer/réduire `ActivityNode.tsx`, `ChildIssues.tsx`, `IssueReplyComposer.tsx`.

- [ ] **Étape 1 — `IssueTimelineEvent` (§16, `TL-01`).** `row gap-2.5 pl-0.5`, cercle **26×26** `rounded-full bg-surface border border-border`, icon `size 12` coloré par rôle, **PAS de connecteur**. Chips `Inline` pour les changements de statut, pill « agent ».
- [ ] **Étape 2 — `IssueCommentCard` (§15, `CMT-01`).** Carte auto-contenue : header DANS la carte `px-3 pt-[7px] pb-[5px]` (Name 12.5/500 + pill agent + `· 3h ago` + spacer + more), body `px-3 pb-2.5 text-[13px] leading-[1.55]`. Avatar **26** à gauche de la carte (couleur via `agentColor`).
- [ ] **Étape 3 — `IssueFeed`** route comment → `IssueCommentCard`, event → `IssueTimelineEvent` (ne plus tout passer par `ActivityNode`). Header Activity : ajouter l'affordance « Newest first » + chevDown (§13.3).
- [ ] **Étape 4 — Sub-issues card.** `bg-surface` (pas canvas) `rounded-[8px]`, header chevron + « Sub-issues » + mono `done/total` + barre 80×5 success + `+`. Rows 30px (variante dense, pas `IssueRow`).
- [ ] **Étape 5 — Replies imbriqués.** Si Linear ne renvoie pas `children`, retirer le code de thread ; sinon flag `commentThreads` (extra).
- [ ] **Étape 6 — Vérifier.** `pnpm --dir ui test` (`IssueFeed.test.tsx`, `ChildIssues.test.tsx`), `pnpm --dir ui build`, `visual:parity --states issue-detail-running`.

Findings: `TL-01..`, `CMT-01..`, `SUB-*`.

## Task I8 — Kanban cleanup + flags + masquer barres globales

**Files:** Modify `KanbanIssueCard.tsx`, `KanbanCard.tsx`, `KanbanColumn.tsx`, `IssueExtraBadges.tsx`, `components/shell/AppShell.tsx`.

- [ ] **Étape 1 — Priorité.** `SeverityPill` (P1/P2 texte) → `<PriorityIcon size={11}/>` dans la meta row. (`KAN-02`)
- [ ] **Étape 2 — Flags (voir table dispositions).** Envelopper `IssueExtraBadges` (gating pills), le bouton Dispatch (`:208-219`), et `KanbanRunCard` derrière `FEATURES.*` (default off). Retirer le tag « auto » colonne.
- [ ] **Étape 3 — Carte (§12.1).** 3 rows, titre single-line ellipsis (pas de croissance 2-lignes), 1 label max footer, TaskDot 7, date relative (pas absolue).
- [ ] **Étape 4 — Masquer barres globales.** Dans `AppShell.tsx`, gater `<RunDock/>` derrière `FEATURES.globalRunDock` et `<SessionWatchRail/>` derrière `FEATURES.sessionWatchRail` (default off). Tracer dans `IMPLEMENTATION_EXTRAS.md`.
- [ ] **Étape 5 — Vérifier.** `pnpm --dir ui test`, `pnpm --dir ui build`, `visual:parity --states issues-kanban`.

Findings: `KAN-02..`, `DOCK-01`, `DOCK-02`, EX-01/02/03/04/05.

---

## Self-Review

- **Couverture spec.** F1–F4 couvrent §0–§6 (fondations/atomes/icônes/motion). I1–I2 → §8/§9. I3 → §10. I4 → §11. I5 → §13. I6 → §17. I7 → §14/§15/§16. I8 → §12 + hide list. Hors périmètre (assumé) : §18 (Drawer), §19/§20 (Cockpit/Inspector), §7 finition sidebar/topbar (PINNED, séparateur ›), §21/§22 hors atomes — **Couches 2 & 3**.
- **Pas de placeholder.** Code donné pour chaque morceau non trivial ; le détail exhaustif par finding est dans `AUDIT.md` (cité par ID).
- **Cohérence des noms.** `FEATURES.*` (F2) réutilisés en I8. `agentColor` (F4) réutilisé en I7. `--color-void` canonique (F2) consommé en F1/RAIL-02/EXEC-03. `sk-pulse` (F4) consommé en I1/I6.
- **Dépendances.** F1→F2 (le `--color-void` doit exister avant que body le consomme) ; F2 avant tout I (codemod global) ; F3/F4 avant I1/I6/I7 (Pill/icônes/avatar). I2 modifie `issueState.ts` (liste+kanban) avant I8.

## Execution Handoff

Deux options d'exécution :

1. **Workflow multi-agent (recommandé, ultracode)** — un agent par tâche en worktree isolé, pipeline Couche 0 (séquentiel F1→F4 car dépendances) puis Couche 1 (I1–I8 largement parallélisables après F2), review entre tâches, vérif `build`+`test`+`visual:parity` par tâche.
2. **Subagent-driven** — un subagent frais par tâche, review en deux temps.
3. **Inline** — exécution en lot avec checkpoints.

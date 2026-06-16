# UI Component Architecture Audit — Superkick `ui/`

**Date:** 2026-06-14
**Scope:** React 19 component architecture in `ui/src/components/**` (read-only audit, pre-refactor).
**Method:** 10 parallel deep-readers (one per component family) → architecture synthesis → adversarial safety check on the proposed first ticket. Every quantitative claim below was re-verified by grep against the working tree.
**Out of scope (explicitly):** GitHub Reviews, Agents/Skills, runtime. No product-visual redesign. No mega-PR. No "design-system migration" — the primitives already exist; this is an *adoption* problem, not a *creation* problem.

---

## 1. Verdict

**Real problem, but moderate — and far less dire than a "design system migration" framing implies.**

The primitive layer is genuinely healthy. `button`/`input`/`badge`/`card`/`pill`/`switch`/`tooltip`/`table` are real base-ui / shadcn-vendored wrappers, React 19-compliant, properly centralized. `Pill` even has a compile-time tone-sync guard (`AssertTonesMatch`). The `*-shell` wrappers (`dialog-shell`, `popover-shell`, `menu-shell`, `side-drawer`, `confirm-dialog`) are correct headless wrappers. The `state-*` primitives are mature (`EmptyState` has 21 importers).

The problem is **under-adoption + a handful of well-defined duplications**, not missing primitives or wrong tech choices:

1. **Two parallel button systems** — `ui/src/ui/Btn.tsx` (17 direct importers, plus loose `className="btn"/"iconbtn"`) vs `components/ui/button.tsx` (33 importers). Mismatched vocabularies (`danger` vs `destructive`; `success`/`surface` exist only in `Btn`). Biggest single debt, biggest blast radius.
2. **Three divergent picker scaffolds** — `issues/pickers/` (searchable, via `popoverParts`), `chat/*Picker` + `launch/*Picker` (menu-radio, via `menu-shell`), and `settings/ConfigSelect` (the de-facto shared menu-select, stranded in `settings/`). None reuse the others.
3. **Dialog chrome duplicated 6×** — every dialog re-implements `dialog__head` (icon + title + spacer + close) and `dialog__foot` (spacer + Cancel + submit-with-busy-label), because `dialog-shell` wraps the Popup but not `Dialog.Root` / header / footer.
4. **Hand-rolled tab strips** bypassing `tab-bar.tsx` (`RunDrawerTabs`, `StepFocusSelector`); the run-session tab set is declared **three times**.
5. **State UI under-adopted** — inline `<p>No X.</p>` placeholders and 3 copies of the loading/error/empty/data branch ladder (`state-async` vs `ContextSection` vs `InboxSectionBody`).
6. **Chip/Badge/Pill naming drift** — `RunState` is mapped into two incompatible color systems (`RunStateBadge`→Pill vs `RunChip`→`.runchip` CSS); two tone unions (`PillTone` vs `SKTone`); 6 loose `*Badge` files at the components root.
7. **Dead code masquerading as debt** — `AttentionRequestPanel`, `InterruptPanel`, `CompletedTable` have **zero consumers** (verified); `ui/table.tsx`, `header-divider`, `inspector-section`, `inspector-section-label` are orphan primitives.

A **new wrapper layer (`components/common/`) is NOT warranted.** The existing `ui/` shell pattern already plays that role. The only structural fix needed is to *move* genuinely-shared components currently stranded in feature dirs (`ConfigSelect`, the loose `*Badge` files) into `ui/`. Introducing a third home would just create a new "where does this go?" coin-flip.

**Sequencing rule:** start with **pure subtraction** (delete dead code) and **pure moves** (relocate badges), then mechanical consolidations, and defer everything that changes behavior, a11y, or visuals (pickers, button convergence, Pill recolor) to late, individually-reviewable tickets.

---

## 2. Architecture observed today

Two informal tiers:

```
ui/src/components/ui/      L0 — primitives + *-shell wrappers + state primitives   (42 files, healthy)
ui/src/components/<feat>/  L2 — feature components that compose (or bypass) L0
ui/src/components/*.tsx    7 loose *Badge files at the root (no home)
ui/src/ui/Btn.tsx          a SECOND button primitive outside components/ui/
ui/src/styles/redesign.css the hidden third tier — styling contract lives half in
                           TSX and half in global string-keyed CSS classes
```

The defining structural smell is that **the styling contract is split between TSX and `redesign.css`**: `.dialog__head/__foot`, `.dtab`, `.runchip`, `.agdot`, `.input`, `.textarea`, `.btn`, `.iconbtn`, `.prop`, `.feeditem`, `.empty-state*`, `.select`. A component and its styling are not co-located, so any structural refactor must touch `redesign.css` in lockstep or styling silently breaks app-wide. This is the single biggest source of refactor risk (see §8).

Secondary smell: **feature dirs bypass available primitives** rather than missing them — raw tab strips next to `tab-bar`, raw `<table>` next to `table.tsx`, inline `<p>` empties next to `EmptyState`, `Btn` next to `Button`.

---

## 3. Target architecture (recommended)

Keep the two-tier model. Fix only the boundary leaks. **No `components/common/` layer.**

| Layer | Location | Contains |
|---|---|---|
| **L0 — primitives** | `ui/src/components/ui/` | True primitives only: `button`, `input`, `badge`, `card`, `label`, `separator`, `switch`, `tooltip`, `table`, `pill`, the `state-*` set, the `*-shell` wrappers, `tab-bar`, `disclosure`, the consolidated `field` compound. **Promote here:** `ConfigSelect` → `menu-select.tsx`; (later) a searchable `picker` over base-ui Combobox. **No domain types, no fetch, no business logic.** This is the *only* shared-wrapper home. |
| **L1 — domain-status components (grouped)** | `ui/src/components/badges/` *(new)* | The 6 loose `*Badge` files moved out of the components root: `ExecutionModeBadge`, `PrStateBadge`, `RunStateBadge`, `ProviderStatusBadge`, `CapabilityBadge`, `RuntimeStatusBadge`. One per file, named exports. Tone/label maps live in `lib/domain`, not here. |
| **L2 — feature dirs** | `ui/src/components/<feature>/` | Components that *compose* L0/L1. Domain pickers, property/inbox/command rows, dialogs, panels. Feature-scoped row/shell bases that encode distinct a11y/interaction semantics (`InboxRow`, `ResultRowShell`, `Evidence`, `PropertyRow`, `SettingsRow`) **stay here** — do not hoist into `ui/`. |
| **L3 — logic (no JSX)** | `ui/src/lib/**`, `ui/src/hooks/**`, `ui/src/stores/**` | Pure helpers, tone+label maps (`lib/domain`), data transforms, orchestration hooks. Fat-orchestrator components extract their state machines here *over time* (later, higher-risk tickets). |

**Rationale:** the existing `ui/` shell tier already works; the only gap is that shared components are stranded in/under feature dirs. Moving them in fixes the boundary without a new abstraction. A `common/` tier would duplicate `ui/`'s role and invite a third ambiguous home.

**Convention reaffirmed (already in `docs/conventions/frontend.md`):** shadcn first → drop to base-ui only when no shadcn covers it; never hand-roll interactive UI when a primitive exists; domain status = `Pill`, shadcn `Badge` for shadcn-internal slots only; empty/loading/error = the shared `state-*` primitives.

---

## 4. Duplication inventory by family

> Verified counts in **bold**.

### 4.1 Buttons — **the #1 debt**
- **Two systems:** `ui/src/ui/Btn.tsx` (**17** direct importers) vs `ui/src/components/ui/button.tsx` (**33**), plus loose `className="btn"/"iconbtn"` strings on `Dialog.Close` etc.
- Vocabulary mismatch: `Btn.kind = primary|secondary|ghost|danger|success|surface` maps onto `Button.variant` but `danger ≠ destructive`, `success`/`surface` have **no `Button` equivalent**, and `surface`/`secondary` in `Btn` render no class. A naive codemod silently drops styling.

### 4.2 Inputs / textareas
- **Zero** of ~22 input/textarea files import the `Input` primitive. Split between global `.input`/`.textarea` CSS (`redesign.css:105`, duplicates `Input`'s border/focus/disabled styling) and fully bespoke inline-Tailwind inputs (`ProfileEditor`, `ProviderSettingsCard`, `DiffPatchView`, `RunnerConfigForm`, `NewIssueDialog`, `ShipModal`).
- **No `Textarea` primitive exists** — must be created before forms can migrate.
- Legit native exceptions: `ProviderSettingsCard` (datalist combobox), `CommandBarHeader` (chrome-less search), `EditableTitle`.

### 4.3 Pickers / dropdowns — three scaffolds
- **Menu-radio single-select** (no search): `chat/{Mode,Model,Provider}Picker`, `settings/ConfigSelect`, `launch/{LaunchProfilePicker,AgentPicker}`. Item class copied verbatim; only the bg token drifts (`bg-surface` vs `bg-raised` vs `bg-active`). `ConfigSelect` is the most complete — promote it.
- **Searchable listbox** (`useState(query)` + `filterByName` + `PopHeader` + `PopBody role=listbox` + `Popline role=option`): the 7 `issues/pickers/*`. Width drifts (`w-64/w-72/w-[200px]/w-[180px]`); empty-state handling inconsistent (`EmptyState` vs inline `<p>`).
- **Popover-anchored field trigger**: `issue-detail/properties/*Row` (`PROPERTY_ROW_TRIGGER`) vs `NewIssueDialog`'s inline `FieldPopover` (`FIELD_TRIGGER`) vs `.select` triggers — three trigger-chrome strings for one concept.
- **Combobox popup chrome** re-implemented by hand in `launch/IssueChipPicker` (inline `Combobox.Portal/Positioner/Popup`) instead of a shared `combobox-shell` mirroring `popover-shell`/`menu-shell`.

### 4.4 Dialogs / modals / drawers
- **Header skeleton duplicated 6×**: `NewIssueDialog:175`, `LaunchDialog:63`, `ProfileEditorDialog:70`, `SkillImportDialog:69`, `SkillEditor:90`, `ShipModal:121`. Icon source drifts (lucide `X` vs `@/ui/Icon name=x`); `SkillEditor` injects a `Pill`.
- **Footer skeleton duplicated 7×** (same files + `confirm-dialog:51`): split between `Btn` and `Button`; two Cancel-wiring idioms.
- **`Dialog.Root` + `onOpenChange` shim repeated** in every dialog because `DialogPopup` doesn't own `Dialog.Root` → **7 direct `@base-ui/react/dialog` imports** that a `DialogShell` would eliminate.
- **Drawers are healthy** — `SideDrawer` + `RunDrawer`/`ChatDrawer`/`IssuePrDiffDrawer` share chrome adequately. Do not touch.

### 4.5 Tabs
- **Run-session tab set declared 3×**: `run-tabs/runSessionTabItems.ts` (with icons), `run-drawer/RunDrawerTabs.tsx` (local `TABS`, no icons, `.dtab` CSS), `stores/runDrawer.ts` (`RunDrawerTab` union = duplicate of `RunSessionTab`).
- **Hand-rolled tablists** bypassing `tab-bar.tsx`: `RunDrawerTabs` (clean win — fully replaceable), `StepFocusSelector` (carries a per-tab `Pill` → concrete proof `tab-bar` is too rigid: needs an optional trailing slot), `IssueViewTabs` (`.view-tab__count`).
- **Dead CSS:** `.dtab__count` (`redesign.css:2151`) — authored for run-drawer counts, never referenced.

### 4.6 Chips / Badges / Pills — naming drift
- **`RunState` mapped into two incompatible systems:** `RunStateBadge` → `PillTone` (renders `Pill`) vs `run-shared/RunChip` → `STATE_VARIANT` + `.runchip--*`/`.agdot--*` CSS. They co-render in `RunInspector` and **disagree on color** (`running=accent` vs `coding=success`). ⚠️ Possibly intentional — **design sign-off required** before converging.
- **`LaunchTaskStatus` mapped twice:** `run-shared/launchTaskChip.ts` ({variant,label}) vs `lib/domain/launchTaskLabels.ts` ({label,SKTone}); labels even differ ("needs you" vs "Needs…").
- **Two tone unions:** `PillTone` (8) vs `SKTone` (6, strict subset). Alias them.
- **Mono-uppercase "tag" geometry** re-derived via `className` override in `ProviderStatusBadge`, `CapabilityBadge`, and `RuntimeStatusBadge` (raw `<span>`, **doesn't use Pill at all**).
- **`.select` trigger** (icon + dim-label + value + chevron) duplicated in `launch/BaseBranchChip` and `launch/WorktreeStrategyChip` — these are config controls misnamed "Chip".

### 4.7 Rows / tables / lists
- **`ui/table.tsx` has 0 consumers** (verified) while `dashboard/CompletedTable` hand-writes a raw `<table>`. → adopt the primitive (also resurrects it).
- **Feed-item row** (`<li class=feeditem>` + node-glyph + timestamp) duplicated in `LedgerRow` and `ProtocolActivityRow` → small justified `FeedItem` shell.
- **Diff-stat (`+N`/`-N` + `splitPath`)** duplicated in `ExecFileRow` and `FileDiffRow`.
- **Per-row state→label maps** redefined in `command/rows/{IssueResultRow,RunResultRow}` instead of `lib/domain`.
- **NOT duplication (keep separate):** `PropertyRow` vs `SettingsRow`; `InboxRow` vs `ResultRowShell` vs `Evidence` — each encodes distinct a11y/interaction semantics (`role=option`, focus-within, disclosure). Merging would regress keyboard nav / create nested-interactive bugs.

### 4.8 State (empty / loading / error / async)
- **Branch ladder re-implemented 3×:** `state-async.tsx` (`AsyncSection`, `error:string|null`, no retry/title) vs `ContextSection` (`error:unknown`, retry/title/icon/rows) vs `InboxSectionBody`.
- **Inline `<p>No X.</p>` section-empties** instead of `EmptyState`: `CompletedTable:25`, `AttentionRequestPanel:42`, `InterruptPanel:35`, `StepTimeline:65`. ⚠️ 3 of these 4 files are dead (§4.10) and `EmptyState` is a bordered card, not a bare line — **not** the no-op the line-level grep suggests (see §8).
- **Hand-rolled empty components:** `IssuesEmptyState` (mirrors `EmptyState` props but uses `.empty-state` CSS + `ReactNode` description + action), `NoProvidersDetected` (raw `<p>`, has a `variant` consumed at 2 sites).
- **Loading faked as empty:** `ChangesTab:67` / `ToolsTab:18` pass a loading message as `TabEmptyState.title`.

### 4.9 Filter bars / toolbars / disclosures / feature-mixing
- **Disclosure hand-rolled 6×** (`useState(open)` + button + `aria-expanded` + chevron rotate): `ExecSection`, `ProtocolActivityRow`, `FileDiffRow`, `ToolCallRow`, `TerminalTakeover`, `IssueGroupHeader` — while `ui/disclosure.tsx` exists but is used by only 2 chat files.
- **Diff review summary bar** (`ChangesSummaryBar` + `FixRunStatus`) extracted in `ChangesTab` but **inlined verbatim** in `IssuePrDiffDrawer` (same `TOGGLE_CLASS`, same "Fix with AI" markup). → promote to `components/diff/`.
- **`IssueFilterDropdown`** re-implements the search input + checkbox rows instead of `popoverParts.PopHeader`/`Popline` (~80 lines reducible).
- **NOT duplication:** `IssueFilterBar.FilterChip` vs `ScopeChips` vs `CommandBarHeader` — semantically distinct. A generic `Chip` is **not** justified.

### 4.10 Dead / orphan code (verified — 0 consumers)
- `components/run-detail/AttentionRequestPanel.tsx`, `components/run-detail/InterruptPanel.tsx`, `components/dashboard/CompletedTable.tsx` — **0 external refs**.
- `components/ui/header-divider.tsx`, `components/ui/inspector-section.tsx`, `components/ui/inspector-section-label.tsx` — **0 consumers**.
- `components/ui/table.tsx` — **0 consumers** (keep: sanctioned primitive awaiting its first consumer, `CompletedTable`).
- Dead CSS: `.dtab__count` (`redesign.css:2151`).

---

## 5. Keep as-is (do NOT generalize)

- **Primitives:** `button`, `input`, `badge`, `card`, `label`, `separator`, `switch`, `tooltip`, `table`, `pill` — canonical, React 19-compliant.
- **State primitives:** `state-empty`, `state-loading`, `state-error`, `state-empty-tab` (only `state-async` needs widening).
- **`*-shell` wrappers:** `dialog-shell`, `popover-shell`, `menu-shell`, `side-drawer`, `confirm-dialog`, `sidebar`. `side-drawer` is the reference (owns chrome, not just positioning).
- **Drawer stack:** `SideDrawer` + `RunDrawer` + `ChatDrawer` + `IssuePrDiffDrawer` — healthy.
- **Reference SoC patterns:** `issue-detail/properties/` (`PropertyRow` + `PROPERTY_ROW_TRIGGER` + per-row pickers); the thin `issues/pickers/*`.
- **Specialized shells (merging regresses a11y):** `InboxRow`, `command/ResultRowShell`, `launch/Evidence`, `settings/SettingsRow`.
- **`CommandBar` subsystem** — no `cmdk`/Command primitive exists; hand-rolling the palette is acceptable.
- **Legit non-Pill chips:** `LabelChip`, `StatusChip` (arbitrary per-item dynamic colors outside Pill's fixed palette); `WatchChip`, `ScopeChips` (composite/filter widgets).
- **`DueDatePicker`** (date-input popover, not a list picker); `IssueViewTabs` (segmented + count, 1 call site); `IssueFilterBar` outer toolbar (1 call site — recurrence bar not met).
- **Long-but-clean** (delegate primitives, logic in helpers/hooks): `SkillEditor`, `ProviderSettingsCard`, `TaskCockpitNowPanel`, `RaiseAttentionRequestForm`, `ChangesTab`, `StepListEditor`, `IssueFeed`.

---

## 6. Centralize / wrap (create these)

| Wrapper to create / widen | Absorbs | Notes |
|---|---|---|
| Promote `ConfigSelect` → `ui/menu-select.tsx` (`MenuRadioSelect`, `triggerVariant: 'select'\|'chip'`, `renderItem`) | `chat/{Mode,Model,Provider}Picker`, `launch/LaunchProfilePicker` become thin option-data wrappers | `LaunchStepSkillPicker` already proves the pattern |
| Widen `state-async.tsx` (`error: unknown` coerced, `onRetry`, `errorTitle`, `emptyIcon`, `loadingRows`, `omitWhenEmpty`) | `ContextSection` + `InboxSectionBody` collapse to thin layout wrappers | Verify the stale-while-revalidate nuance (§8) |
| Generalize `ui/disclosure.tsx` on `@base-ui/react/collapsible` (+ count, trailing-action, controlled-open, style-override) | `ExecSection`, `ProtocolActivityRow`, `FileDiffRow`, `ToolCallRow`, `TerminalTakeover` | Verify chat `TurnView`/`ToolCallBlock` parity |
| Extend `tab-bar.tsx` (optional icon + trailing-node/count slot) | `RunDrawerTabs` (feed `RUN_SESSION_TAB_ITEMS`), `StepFocusSelector` (per-tab Pill via trailing slot) | Delete `RunDrawerTab` union + `.dtab`/`.dtab__count` CSS after |
| New `DialogShell` (`Dialog.Root` + popup + `dialog__head` {icon?, title, headerSlot, close} + body + footer slot) | the 6 dialog headers/footers + 7 direct base-ui dialog imports | Keep low-level `DialogPopup` for `CommandBar` + wide `LaunchComposerDialog` |
| Add `Textarea` primitive + adopt `Input`/`Field` in settings/dialog forms | `RunnerConfigForm`, `ProfileEditor`, `NewIssueDialog`, … | Retire `.input`/`.textarea` CSS only after all sites migrate |
| New `combobox-shell.tsx` (`ComboboxPopup` mirroring popover/menu shells) | `launch/IssueChipPicker` inline chrome; future searchable `Picker` | |
| Add `Pill` `shape='tag'` (mono/uppercase) variant | `ProviderStatusBadge`, `CapabilityBadge`, `RuntimeStatusBadge` stop overriding geometry | |
| `lib/domain` consolidation: alias `SKTone = PillTone`; one label+tone map per `RunState`/`LaunchTaskStatus`; move `STATE_LABEL`/`ACTIVE_STATES` here | `RunChip`, `launchTaskChip.ts`, command-row maps | **Design-gated** (RunChip recolor) |
| Promote `ChangesSummaryBar` + `FixRunStatus` → `components/diff/` | `IssuePrDiffDrawer` inline copy | |
| (Optional) `SectionLabel` primitive (`as` prop) | `section-heading` + `inspector-section-label` + side-drawer inline title | |
| (Optional) `FeedItem` shell | `LedgerRow` + `ProtocolActivityRow` | |

---

## 7. Delete / merge

**Delete (verified 0 consumers):**
- `components/run-detail/AttentionRequestPanel.tsx`, `components/run-detail/InterruptPanel.tsx`, `components/dashboard/CompletedTable.tsx` *(or rewrite `CompletedTable` on the `table` primitive if a consumer is planned — but today it's dead)*.
- `components/ui/header-divider.tsx`, `components/ui/inspector-section.tsx`, `components/ui/inspector-section-label.tsx`.
- Dead CSS rule `.dtab__count`.
- `components/run-detail/RunWorkspaceTabs/ContextTab.tsx` — *verify no mount first*.

**Merge:**
- 11 `field-*` files → single `ui/field.tsx` compound behind the existing barrel (matches `card.tsx`/`table.tsx` house style; preserve every `data-slot` + group/peer selector name verbatim; keep `field-error`'s `useMemo` dedupe).
- `ui/src/ui/Btn.tsx` → `ui/components/ui/button.tsx` (codemod, then delete `Btn` + `.btn`/`.iconbtn` CSS).
- `ContextSection` + `InboxSectionBody` branch logic → `AsyncSection`.
- `RunChip` + `launchTaskChip.ts` → `Pill` + `lib/domain` (**design-gated**).
- 4 inline section-empties + hand-rolled empty components → `EmptyState` (**but see §8 — not the no-op it looks like**).

---

## 8. Risks

> The adversarial pass found the originally-proposed "state-primitive adoption" first ticket **unsafe**. Its findings drive the ticket reorder in §9.

| # | Risk | Severity | Detail |
|---|---|---|---|
| R1 | **Styling contract split across TSX + `redesign.css`** | **High** | `.dialog__*`, `.dtab`, `.runchip`, `.agdot`, `.input`, `.textarea`, `.btn`, `.iconbtn`, `.prop`, `.feeditem`, `.empty-state*`. Deleting a class before every call site migrates regresses all consumers at once. Every structural ticket must touch CSS in lockstep. |
| R2 | **Two button systems, mismatched vocabularies** | **High** | `Btn.success`/`surface` have no `Button` equivalent; `danger ≠ destructive`. Convergence needs a `kind→variant` mapping table + a new `success` variant *before* any swap, and CSS retirement *after* all sites migrate. Largest blast radius — sequence late. |
| R3 | **"EmptyState adoption" is NOT a no-op** | **High** (to the original plan) | Inline `<p class="font-data text-sm text-fg-dim">No X.</p>` → `EmptyState` renders a **centered, dashed-border, padded card**. For the one *live* target (`StepTimeline`, shown in `FocusedRunPanel` + `RunInspector`) that's a user-visible chrome change. And 3 of the 4 "violations" are **dead code** (R7). Treat as a visual change requiring screenshots, not a mechanical swap. |
| R4 | **Picker / dialog refactors are behavior+a11y changes disguised as cleanup** | Medium | base-ui Combobox changes DOM/keyboard semantics; `StatusPicker`/`StatusRow` tests assert current DOM; `LabelsPicker`'s draft+Apply ≠ Combobox commit-on-toggle. Sequence late; never bundle with mechanical tickets. |
| R5 | **Over-generalization of row/shell components** | Medium | Merging `ResultRowShell`/`InboxRow`/`Evidence` or `PropertyRow`/`SettingsRow`, or forcing `IssueViewTabs`/`StepFocusSelector` onto `tab-bar` without a trailing slot, destroys distinct a11y semantics (`role=option`, count/Pill slots) and creates nested-interactive bugs. |
| R6 | **Pill convergence may recolor the product** | Medium | `RunChip` vs `RunStateBadge` disagree on `RunState`→color and co-render in `RunInspector`. Unifying the tone source silently recolors the execution log / run drawer / inspector — a product-visual change the constraints forbid without **design sign-off**. |
| R7 | **Audit's own first-ticket trap** | Medium | `AttentionRequestPanel`, `InterruptPanel`, `CompletedTable` are dead (0 refs). Refactoring them under a "no-risk adoption" banner burns review effort on code that should be *deleted*. Any "adoption" ticket must pre-flight grep each target for live usage. |
| R8 | **No `Textarea` primitive; `Input` geometry differs** | Low | `Input` is `h-8`; `.input`/`.textarea` and bespoke inputs use different sizing. Adopting `Input` blindly shifts form layouts. Create `Textarea` + per-field overrides + visual QA first. |

---

## 9. Recommended ticket split (minimal, ordered: high value / low risk first)

Each ticket is independently shippable. **No mega-PR.** Behavior/a11y/visual changes are quarantined to the back half.

| # | Ticket | Value | Risk | Effort |
|---|---|---|---|---|
| **1** | **Delete dead/orphan components + dead CSS** (`AttentionRequestPanel`, `InterruptPanel`, `CompletedTable`, `header-divider`, `inspector-section`, `inspector-section-label`, `.dtab__count`; verify+delete `ContextTab`) | High | **Low** | S |
| 2 | **Move 6 loose `*Badge` files → `components/badges/`** (import-path updates only, no JSX change) | Med | Low | S |
| 3 | **Merge `field-*` (11→1) + delete-confirmed orphans cleanup**, behind the existing barrel (no call-site changes) | Med | Low | M |
| 4 | **Single tab strip:** extend `tab-bar` (optional icon + trailing slot), migrate `RunDrawerTabs` + `StepFocusSelector`, dedupe the run-session tab set, drop `.dtab` CSS | Med | Low–Med | M |
| 5 | **State consolidation:** widen `AsyncSection`; fold `ContextSection` + `InboxSectionBody`; migrate the *live* inline empties with screenshots (StepTimeline) | High | Med | M |
| 6 | **`DialogShell`:** own `Dialog.Root` + head + footer slot; migrate the 6 dialogs; remove 7 direct base-ui dialog imports | High | Med | M |
| 7 | **Generalize `Disclosure`** on base-ui Collapsible; adopt across the 5 hand-rolled sites | Med | Med | M |
| 8 | **Promote `ConfigSelect` → `ui/menu-select`;** collapse the 4 menu-radio pickers | Med | Med | M |
| 9 | **Converge buttons:** `Btn` → `Button` (mapping table + `success` variant first), then delete `Btn` + CSS | High | **High** | L |
| 10 | **Input/Textarea adoption** across settings/dialog forms (create `Textarea` first) | Med | Med | M |
| 11 | **Searchable picker** over base-ui Combobox (`issues/pickers` + `IssueChipPicker`) — behavior/a11y change, tests update | Med | High | L |
| 12 | **Pill/Chip convergence** (`RunChip`→Pill, tone-union alias, `Pill shape='tag'`) — **design sign-off gated** | Low | Med | M |

---

## 10. First ticket to launch

> **The originally-modelled "replace inline empty states with `EmptyState`" was rejected by the adversarial pass** (3/4 targets dead; `EmptyState` is a bordered card, not a bare line; `FocusedRunPanel` AC built on a non-existent nullable; `IssuesEmptyState.description` is `ReactNode` but `EmptyState.description` is `string`). It became ticket #5, properly scoped. The safe first move is **pure subtraction**.

### Ticket — `[ui] Remove dead/orphan components and dead CSS`

**Why:** highest value-to-risk ratio. Purely subtractive, fully grep-+`tsc`-verifiable, zero runtime/behavior/visual change, no design sign-off. Shrinks the surface (and removes 3 files the audit itself nearly miscounted as "live debt") *before* any consolidation begins. The cleanest possible "minimal, safe, incremental" opener.

**In scope (verified 0 consumers):**
- Delete `ui/src/components/run-detail/AttentionRequestPanel.tsx`
- Delete `ui/src/components/run-detail/InterruptPanel.tsx`
- Delete `ui/src/components/dashboard/CompletedTable.tsx`
- Delete `ui/src/components/ui/header-divider.tsx`
- Delete `ui/src/components/ui/inspector-section.tsx`
- Delete `ui/src/components/ui/inspector-section-label.tsx`
- Delete the dead `.dtab__count` rule in `ui/src/styles/redesign.css`
- Remove any now-dead barrel re-exports of the above

**Out of scope:**
- `ui/src/components/ui/table.tsx` — orphan but a *sanctioned* primitive; it gets its first consumer when `CompletedTable`'s replacement lands. Leave it (or open a separate explicit YAGNI decision).
- `ContextTab.tsx` — *suspected* orphan; include **only** after a grep confirms no route/component mounts it. If unconfirmed, defer.
- Any `EmptyState`/`Btn`/tab/picker/Pill change.
- Any `redesign.css` deletion other than `.dtab__count` (broad CSS retirement is gated on call-site migration — R1).

**Acceptance criteria:**
1. The 6 listed files are deleted; no `import`/JSX reference to any of them remains anywhere in `ui/src/**` (prove with a repo-wide grep in the PR description).
2. The `.dtab__count` rule is removed; grep confirms it had **zero** `.tsx` references before removal.
3. Each deleted target was confirmed unreferenced by grep **before** deletion (paste the grep output in the PR).
4. `ContextTab.tsx` is deleted **only if** grep proves no mount; otherwise explicitly left out of scope with a note.
5. `ui/src/components/ui/table.tsx` is **not** deleted (documented as intentionally retained).
6. `just check` passes (`tsc -b` parity) and `pnpm build` is green in `ui/`.
7. Full test suite passes with **no test deletions** beyond tests that exclusively covered the removed files.
8. No global `redesign.css` class is removed other than `.dtab__count`.
9. Net diff is **subtractive only** — no new components, props, or styles introduced.

---

### Appendix — audit method

Generated by a 12-agent workflow: 10 parallel family deep-readers (primitives, pickers, dialogs, tabs, filters, buttons/inputs, chips/badges, rows/tables, state, feature-mixing) → 1 architecture synthesizer → 1 adversarial first-ticket verifier. All headline numbers (`Btn` 17 / `Button` 33; the three 0-ref dead components; `table`/`header-divider`/`inspector-section` orphans; `StepTimeline` live in 5 places) were re-verified by direct grep against the working tree on 2026-06-14.

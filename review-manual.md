# Manual review cleanup — demandes à traiter

Objectif : nettoyer les incohérences UX/UI et les actions cassées observées en dogfood. Regroupe les fixes quand c'est le même problème de fond. Ne pas réinventer une nouvelle direction produit : rester issue-first, Linear-like, desktop multi-projets, avec shadcn/base-ui comme base de composants.

## Priorité P0 — Bugs bloquants / actions cassées

### Diff / navigation cassée
- Cliquer sur le diff d'une PR/issue peut casser l'app avec l'erreur `'text/html' is not a valid JavaScript MIME type`.
- Il faut empêcher l'état bloqué : afficher une erreur récupérable et permettre de revenir à l'issue/home.
- Vérifier que les liens diff/PR ne pointent jamais vers une route qui renvoie du HTML chargé comme JS.

### Inbox non fonctionnelle
- Les notifications Inbox ne se clear pas quand on ouvre l'Inbox.
- Les onglets `Watching` / `All activity` semblent non branchés ou contiennent de la fausse data.
- Le filtre de l'Inbox ne s'ouvre pas / ne fonctionne pas.
- Après switch de projet, les issues/inbox ne sont pas refetch correctement : l'Inbox peut rester vide alors que le projet a des données.

### Saved views cassées
- Le système de vues ne fonctionne pas : impossible d'ajouter une nouvelle vue.
- Les saved views dans la sidebar ne naviguent pas vraiment : cliquer reste sur `/issues`.
- Les vues doivent être persistées, navigables, et refléter les filtres/tri attendus.

### Actions issue/run indispensables
- Depuis une issue, on doit pouvoir cancel une run/task active directement.
- On doit pouvoir clean une issue : archiver ou supprimer les runs/tasks liés. Par défaut préférer archive stats-safe ; purge destructive seulement opt-in avec confirmation.
- Reject/Cancel doit laisser task + step + run dans un état cohérent.

## Priorité P1 — Cohérence produit / modèle mental

### Clarifier Launch Task vs Run
- Aujourd'hui `Launch new task` vs `Launch new run` porte à confusion.
- Le lancement depuis une issue doit ouvrir un dialogue, pas rediriger vers une page séparée.
- Utiliser le même pattern UX pour lancer l'exécution, avec des libellés clairs :
  - `Launch task` = lancer un workflow/profil sur l'issue.
  - `Run` = exécution technique d'un step/agent, visible en drawer ou deep-link.
- Éviter de présenter à l'utilisateur qu'il "lance 3 runs dans une run".

### Auto-transition Linear
- Quand on lance une task sur une issue, l'issue devrait pouvoir passer automatiquement en `In Progress`.
- Ajouter un setting explicite pour activer/désactiver cette transition automatique.
- Ne pas hardcoder le workflow Linear : utiliser les options/states disponibles.

### Past runs et current run
- Les past runs doivent utiliser le même design que la run actuelle/dernière run.
- On doit pouvoir ouvrir le drawer d'une past run.
- Les états cancelled/failed/completed doivent rester visibles et actionnables.

### Attention page / notifications
- La page Attention n'est pas claire et difficile d'accès.
- Clarifier son rôle : soit surface produit utile, soit retirer/masquer tant que non branchée.
- Le bouton de notification en haut ne doit pas être le seul chemin non évident vers cette page.

## Priorité P1 — UI Linear-like / design system

### Sidebar et switch projet
- Le switcher de projet doit utiliser la même sidebar/design que le reste de l'app, idéalement les primitives shadcn/base-ui déjà adoptées.
- Prévoir aussi un mode horizontal/tab pour changer de projet si activé/configuré.
- Le bouton Search doit rester accessible en permanence en haut de la sidebar.
- Le système de pin semble ne pas fonctionner et son intérêt produit est à revalider.

### Composants shadcn/base-ui
- Plusieurs dropdowns/popovers n'ont pas le feeling shadcn/base-ui.
- Utiliser au maximum les primitives existantes shadcn/base-ui au lieu de composants custom divergents.
- Settings contient encore des composants natifs/non homogènes : aligner sur le design system.

### Issue detail Linear-like
- Le détail d'issue doit imiter davantage Linear :
  - propriétés groupées dans des boxes/catégories modifiables ;
  - inline edit ghost, pas un gros input visible quand on édite ;
  - dropdown assignee plus compact ;
  - taille minimale et densité proches de Linear.
- Si besoin, demander le design de référence avant d'implémenter.

### Breadcrumb issue
- Le breadcrumb casse quand il manque de place.
- Ellipser proprement les titres longs.
- Ne pas afficher `No project` ou des statuts inutiles dans le breadcrumb. Afficher le projet seulement s'il existe.

### Comment composer issue
- Les boutons du composer ne fonctionnent pas.
- Simplifier comme Linear : garder seulement les actions réellement supportées, probablement attach/file pour V1.
- Retirer les boutons non branchés.

## Priorité P2 — Nettoyage d'actions mortes

### Boutons non branchés à retirer ou brancher
- Bouton info du drawer : ne fonctionne pas.
- Bouton `Subscribe` sur issue : non implémenté, à retirer ou brancher.
- Bouton copier le lien : peu utile pour une app locale, à retirer sauf si lien partageable réel.
- Bouton `Newest first` sur issue : à retirer, inutile.
- Bouton refresh issue data : éviter un menu caché, mettre un refresh direct si nécessaire.
- Dans les dropdowns, pas de bouton `Apply` si le clic sélectionne déjà l'option.
- Le texte `hold to exclude` est confus : justifier ou retirer.

### Accordéons / Kanban
- L'icône `+` sur les accordéons ne sert à rien : remplacer par un chevron à droite si c'est uniquement expand/collapse.
- Dans le Kanban, le `+` de colonne ne fait rien. Soit brancher création d'issue, soit retirer.
- Si une colonne Kanban est vide, ne pas garder la même largeur/hauteur visuelle inutilement.
- On a plusieurs designs de Kanban divergents. Garder un seul design, probablement celui du Kanban Issues qui est le meilleur, et le réutiliser ailleurs.

### Terminal drawer
- Dans l'onglet Terminal, l'accordéon `Direct Terminal Access` n'apporte pas de valeur claire.
- Revoir l'UX : si l'accès direct est disponible, le rendre direct et compréhensible ; sinon masquer.

## Priorité P2 — Settings / profiles / agents

### Retirer legacy agents/profile
- Retirer le profile agents legacy et le dead code lié si ce n'est plus utilisé.
- Clarifier la page Agents :
  - peut-on ajouter des agents ?
  - les agents affichés sont-ils vrais ou fakes ?
  - d'où viennent les modèles affichés ?
  - l'écran a-t-il encore une valeur avec Launch Profiles/Skills ?

### Launch profiles
- Dans Settings, permettre aux utilisateurs de disable/masquer les launch profiles built-in.
- Les built-ins ne doivent pas forcément être supprimables, mais ils doivent pouvoir ne pas apparaître dans le launcher.

### Rules
- Le bouton ajouter une règle ne fait rien.
- Les règles existantes ne sont pas éditables.
- Brancher create/edit/delete ou masquer la section si elle n'est pas prête.

## Contraintes d'implémentation

- Garder l'issue comme surface principale.
- Ne pas réintroduire Tasks/Runs comme navigation principale.
- Ne pas ajouter de fake data pour matcher l'UI.
- Préférer supprimer/masquer les actions non branchées plutôt que garder des boutons morts.
- Réutiliser les composants existants et shadcn/base-ui au lieu de créer un troisième design.
- Si un changement est trop gros, proposer un split clair, mais regrouper les fixes par surface pour éviter 20 petits tickets.

## Split recommandé

1. **P0 product correctness** : Inbox/views/project switch refetch/diff crash/cancel-clean issue.
2. **Issue detail Linear-like cleanup** : properties, composer, breadcrumb, dead buttons, launch dialog.
3. **Navigation + sidebar + project switch polish** : sidebar consistency, search, pins, project switch modes.
4. **Kanban + dropdown design system pass** : one Kanban design, shadcn dropdowns, remove inert plus/apply/hold-to-exclude.
5. **Settings profiles/agents/rules cleanup** : remove legacy, clarify agents, built-in profile visibility, rules CRUD or hide.

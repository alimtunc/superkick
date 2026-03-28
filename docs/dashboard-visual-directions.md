# Dashboard Visual Directions

## Purpose

Define 3 clear visual directions for the Superkick dashboard so the product
can move away from the current basic engineering UI and toward a more refined,
memorable control surface.

These are intentionally distinct.
The goal is to choose one strong direction, not to average all 3 together.

## Shared Design Goals

All directions should preserve the same product intent:

- elegant
- calm
- premium
- operational
- readable at a glance
- more control center than debug page

All directions should also respect these rules:

- badges must not dominate the page
- typography should create hierarchy before color does
- logs should feel secondary on overview screens
- completed work should feel rewarding and visible
- urgent states should feel impossible to miss

---

## Direction A: Warm Editorial Control Room

### Summary

This direction makes Superkick feel like a premium operations journal:
calm, polished, expensive, and very readable.
It avoids the default dark devtool look entirely.

### Best For

- making the product feel more mature
- standing apart from generic dashboards
- emphasizing clarity, hierarchy, and confidence

### Mood

- editorial
- composed
- warm
- trustworthy
- productized

### Palette

- background: bone, parchment, warm ivory
- surface: soft stone, light sand
- text: ink, charcoal, espresso
- positive: deep moss
- warning: muted amber
- danger: brick red
- accent: dark olive or forest

### Typography

- headings: elegant grotesk or humanist sans
- body: highly readable neutral sans
- mono: used only for ids, branches, timestamps, and step keys

Suggested font mood:

- headings should feel designed, not default
- body should stay quiet and practical

### UI Character

- thin borders instead of heavy shadows
- subtle section backgrounds
- generous spacing
- more cards with content blocks than boxed widgets
- status signals integrated into layout edges, labels, and numerals

### Dashboard Translation

**Top bar**

- light background
- clean title treatment
- small system status text on the right

**Executive summary band**

- big typographic numerals
- low-chrome cards
- thin separators

**KPI ribbon**

- compact tiles with very restrained accents
- trend deltas in small uppercase or mono

**Attention zone**

- strongest contrast on page
- pale background with red or amber structural edge
- reads like a priority brief

**Completed issues**

- elegant, almost editorial list cards
- emphasis on issue id, completion time, and duration
- should feel satisfying, not archival

### Motion

- soft fade and rise on initial load
- gentle number change transitions
- no loud pulses except for truly live states

### Risks

- can become too soft if status contrast is under-designed
- requires careful typography to avoid feeling like a marketing page

### Keywords

`editorial`, `bone`, `olive`, `quiet luxury`, `calm operations`

---

## Direction B: Graphite Operations Atelier

### Summary

This direction keeps a dark interface, but abandons the current blue-slate
template feel.
It becomes darker, denser, more precise, and more premium.

### Best For

- preserving a technical atmosphere
- supporting long observation sessions
- making metrics and live states feel sharp and focused

### Mood

- disciplined
- surgical
- high-end technical
- nocturnal
- exacting

### Palette

- background: graphite, carbon, blackened plum, smoke
- surface: deep charcoal and oil
- text: bone, soft silver, muted fog
- positive: mineral green
- warning: oxidized gold
- danger: oxide red
- accent: cold champagne or brushed steel

### Typography

- headings: compact, assertive grotesk
- body: crisp sans with strong legibility
- mono: more present than in Direction A, but still controlled

### UI Character

- stronger contrast than the current UI
- deeper surfaces
- fewer colors, more tonal structure
- precise grid alignment
- state shown with bars, dots, and edges rather than thick pills

### Dashboard Translation

**Top bar**

- almost invisible chrome
- floating over a dark field

**Executive summary band**

- big luminous numerals on dark surfaces
- strong contrast, very compact

**KPI ribbon**

- feels like instrument readouts
- tight spacing, crisp separators

**Attention zone**

- appears as a sharp alert panel
- broken states feel unavoidable

**Active runs board**

- closest to a command table, but refined
- high density without looking cramped

### Motion

- restrained glow on live states
- sliding panel transitions
- hover states should feel precise, not playful

### Risks

- if overdone, can still feel like a generic "dev dashboard"
- must avoid falling back into cobalt, violet, and tailwind-slate defaults

### Keywords

`graphite`, `atelier`, `instrument panel`, `precision`, `premium dark`

---

## Direction C: Monochrome Executive Grid

### Summary

This direction is the most minimal and severe.
It relies on black, white, warm gray, and almost no chroma.
Color appears only when something truly matters.

### Best For

- making the interface feel expensive and controlled
- pushing elegance through hierarchy instead of decoration
- making alerts feel especially meaningful

### Mood

- minimal
- executive
- restrained
- architectural
- premium

### Palette

- background: chalk, pearl, ash, off-white
- surface: white, fog, light graphite
- text: black, coal, graphite
- positive: dark spruce
- warning: tobacco amber
- danger: oxblood
- accent color only on critical states

### Typography

- headings: highly structured grotesk with strong weight contrast
- body: neutral sans
- mono: extremely limited use

### UI Character

- clean grid
- almost no decorative framing
- heavy reliance on scale, spacing, and rhythm
- sections feel architectural
- charts and KPIs look more like executive reporting than ops telemetry

### Dashboard Translation

**Top bar**

- extremely minimal
- mostly text and spacing

**Executive summary band**

- huge black numerals on pale fields
- almost no chip or badge noise

**Attention zone**

- rare and forceful use of amber or oxblood
- because the rest is quiet, alerts hit harder

**Completed issues**

- can feel like a refined delivery ledger
- very elegant if properly spaced

### Motion

- almost invisible
- only opacity, slide, and count-up
- avoid decorative animation entirely

### Risks

- can become cold or sterile
- requires very strong visual discipline
- if spacing is weak, the design collapses into plainness

### Keywords

`monochrome`, `executive`, `architectural`, `restrained`, `ledger`

---

## Comparison

### Direction A

- most differentiated
- warmest
- friendliest
- best if you want Superkick to feel like a premium product, not a tool clone

### Direction B

- most technical
- strongest for live monitoring
- best if you want to stay in a dark control-room world without looking generic

### Direction C

- most elegant
- most severe
- best if you want a very high-end, almost executive reporting feel

## Recommendation

If the goal is exactly what you described:

- more elegant
- more epure
- less basic
- still useful with lots of KPIs

The strongest recommendation is:

**Direction A: Warm Editorial Control Room**

Why:

- it breaks hardest from the current basic dashboard feel
- it gives more room for "finished issues" and KPI storytelling
- it can make the product feel more premium without becoming cold
- it avoids the trap of a generic dark ops UI

## Decision Frame For Next Step

Pick one of these three:

1. `Direction A` if you want premium, calm, editorial, and differentiated
2. `Direction B` if you want sharp, dark, technical, and intense
3. `Direction C` if you want minimal, executive, and restrained

Once one direction is chosen, the next doc should define:

- exact page styling rules
- component treatments
- badges, cards, spacing, borders, and typography behavior

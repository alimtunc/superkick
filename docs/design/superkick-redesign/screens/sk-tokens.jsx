// Superkick design tokens — single source of truth.
// Two themes: dark (default operator surface) and light (paper companion).
// Inject once via <SKStyles/> at the top of the canvas.

const SK = {
  dark: {
    // Surfaces — 4 elevations, no more
    void: '#0b0d0f',           // app behind everything (gutters)
    surface: '#15181c',         // primary surface (sidebar, cards)
    raised: '#1c2026',          // raised inside surface (active row, input)
    overlay: '#23282f',         // popovers, command bar, dialogs

    // Lines & text
    border: '#262b32',          // hairlines
    borderStrong: '#323843',    // emphasized borders
    fg: '#e7e9ec',              // primary text
    fgMuted: '#9aa0a8',          // labels, secondary
    fgDim: '#6b727b',            // timestamps, meta

    // Accents (sparse use only)
    accent: '#5b6ef2',           // cobalt-violet — primary actions only
    accentSoft: 'rgba(91,110,242,.16)',
    accentLine: 'rgba(91,110,242,.50)',

    // Semantic — for status only, never decoration
    success: '#4ea674',
    successSoft: 'rgba(78,166,116,.13)',
    warn: '#d4a04a',             // needs human, paused
    warnSoft: 'rgba(212,160,74,.14)',
    danger: '#cf5a55',
    dangerSoft: 'rgba(207,90,85,.13)',
    info: '#5b8ec9',
    infoSoft: 'rgba(91,142,201,.13)',

    // Code / mono surfaces
    code: '#0f1114',
    codeFg: '#cdd2d8',
  },
  light: {
    void: '#ebe7df',
    surface: '#ffffff',
    raised: '#f6f3ec',
    overlay: '#ffffff',

    border: '#e3ddd1',
    borderStrong: '#cdc4b2',
    fg: '#1c1a16',
    fgMuted: '#605a4f',
    fgDim: '#8c8576',

    accent: '#3d52d6',
    accentSoft: 'rgba(61,82,214,.10)',
    accentLine: 'rgba(61,82,214,.40)',

    success: '#3b8a5b',
    successSoft: 'rgba(59,138,91,.10)',
    warn: '#a87a1f',
    warnSoft: 'rgba(168,122,31,.12)',
    danger: '#b94842',
    dangerSoft: 'rgba(185,72,66,.10)',
    info: '#3e6fa8',
    infoSoft: 'rgba(62,111,168,.10)',

    code: '#1c1a16',
    codeFg: '#e7e0d2',
  },
  // Type
  fontUI: '"DM Sans", "Inter", system-ui, -apple-system, sans-serif',
  fontMono: '"JetBrains Mono", "IBM Plex Mono", ui-monospace, Menlo, monospace',
  // Geometry
  r: { sm: 6, md: 8, lg: 12, xl: 16 },
  // Spacing scale (use multiples of 4)
  s: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
};

// Theme provider — wraps a screen in a sized frame and injects CSS vars.
function SKFrame({ theme = 'dark', width = 1280, height = 800, children, label }) {
  const t = SK[theme];
  const vars = {};
  Object.entries(t).forEach(([k, v]) => { vars[`--sk-${k}`] = v; });
  vars['--sk-font'] = SK.fontUI;
  vars['--sk-mono'] = SK.fontMono;
  return (
    <div style={{
      width, height, background: t.void, color: t.fg,
      fontFamily: SK.fontUI, fontSize: 14, lineHeight: 1.45,
      overflow: 'hidden', position: 'relative', ...vars,
    }}>
      {children}
    </div>
  );
}

// One-shot global CSS for SK screens.
function SKStyles() {
  return (
    <style dangerouslySetInnerHTML={{__html: `
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
      .sk-row { display:flex; align-items:center; }
      .sk-col { display:flex; flex-direction:column; }
      .sk-mono { font-family: ${SK.fontMono}; font-feature-settings: "tnum","ss01"; }
      .sk-tab { font-feature-settings: "tnum"; }
      .sk-hr { height:1px; background:var(--sk-border); }
      .sk-vr { width:1px; background:var(--sk-border); }
      .sk-scrollbox::-webkit-scrollbar { display:none; }
      .sk-scrollbox { scrollbar-width:none; }
      .sk-shadow-1 { box-shadow:0 1px 0 rgba(0,0,0,.04); }
      .sk-shadow-2 { box-shadow:0 8px 24px rgba(0,0,0,.28), 0 0 0 1px var(--sk-border); }
      .sk-shadow-3 { box-shadow:0 24px 60px rgba(0,0,0,.45), 0 0 0 1px var(--sk-border); }
      .sk-link { color: var(--sk-accent); text-decoration:none; }
      .sk-num { font-variant-numeric: tabular-nums; }
    `}}/>
  );
}

Object.assign(window, { SK, SKFrame, SKStyles });

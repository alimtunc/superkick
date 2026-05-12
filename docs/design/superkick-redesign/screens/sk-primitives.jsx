// SK primitives — icons (inline SVG bank), pills, buttons, rows.
// All components use CSS vars (--sk-*) so they re-theme automatically.

const I = (path, viewBox = '0 0 24 24') => ({ size = 16, color = 'currentColor', strokeWidth = 1.8, style }) => (
  <svg width={size} height={size} viewBox={viewBox} fill="none" stroke={color}
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    style={{ flex: 'none', ...style }}>
    {path}
  </svg>
);

const SKI = {
  inbox: I(<><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 4h14l2 8v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7l2-8z"/></>),
  issue: I(<><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><circle cx="12" cy="16.5" r=".8" fill="currentColor"/></>),
  task: I(<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10l3 3 5-6"/></>),
  agent: I(<><rect x="5" y="7" width="14" height="11" rx="2"/><path d="M12 4v3M9 11h.01M15 11h.01M9 15h6"/></>),
  settings: I(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9 1.7 1.7 0 0 0 4.3 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>),
  search: I(<><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>),
  cmd: I(<path d="M9 9h6v6H9zM9 9V6a3 3 0 1 1 3 3M15 9V6a3 3 0 1 0-3 3M9 15v3a3 3 0 1 0 3-3M15 15v3a3 3 0 1 1-3-3"/>),
  play: I(<path d="M6 4l14 8-14 8z" fill="currentColor"/>),
  pause: I(<><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></>),
  stop: I(<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>),
  check: I(<path d="M5 12l5 5 9-11"/>),
  x: I(<><path d="M6 6l12 12M18 6L6 18"/></>),
  chev: I(<path d="m9 6 6 6-6 6"/>),
  chevDown: I(<path d="m6 9 6 6 6-6"/>),
  arrowRight: I(<><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></>),
  external: I(<><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></>),
  github: I(<path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.7.4-1.1.7-1.4-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 0 1 5 0c2-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.4 4.7-4.6 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A10 10 0 0 0 12 2z" fill="currentColor" stroke="none"/>),
  branch: I(<><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="9" r="2"/><path d="M6 8v8M18 11v1a4 4 0 0 1-4 4H8"/></>),
  pr: I(<><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8v8M18 8a2 2 0 0 0-2-2h-3l2 2-2 2"/></>),
  comment: I(<path d="M21 12c0 4.4-4 8-9 8a10 10 0 0 1-4-.8L3 21l1.8-5A8 8 0 0 1 3 12c0-4.4 4-8 9-8s9 3.6 9 8z"/>),
  doc: I(<><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7M8 13h8M8 17h5"/></>),
  folder: I(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>),
  zap: I(<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>),
  alert: I(<><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.7 3h16.94a2 2 0 0 0 1.7-3L13.7 3.86a2 2 0 0 0-3.4 0z"/></>),
  clock: I(<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>),
  user: I(<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>),
  bot: I(<><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 14h.01M15 14h.01M9 18h6"/></>),
  filter: I(<path d="M3 5h18l-7 9v6l-4-2v-4z"/>),
  plus: I(<><path d="M12 5v14M5 12h14"/></>),
  more: I(<><circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/></>),
  copy: I(<><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></>),
  link: I(<><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>),
  send: I(<path d="m22 2-11 11M22 2l-7 20-4-9-9-4z"/>),
  download: I(<><path d="M12 3v13M5 12l7 7 7-7M5 21h14"/></>),
  loop: I(<><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></>),
  spark: I(<><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></>),
  terminal: I(<><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M13 15h4"/></>),
  pin: I(<path d="M12 17v5M9 3h6l-1 5 3 3v3H7v-3l3-3z"/>),
  star: I(<path d="m12 3 2.6 5.5 6 .9-4.3 4.2 1 6L12 16.8l-5.4 2.8 1-6L3.4 9.4l6-.9z"/>),
  flag: I(<path d="M4 21V4h13l-2 4 2 4H4"/>),
  history: I(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/></>),
  layers: I(<><path d="M12 2 2 8l10 6 10-6z"/><path d="M2 14l10 6 10-6"/></>),
};

function Icon({ name, size = 16, color, strokeWidth, style }) {
  const C = SKI[name];
  if (!C) return <span style={{ width: size, height: size, display: 'inline-block', background: '#f0f' }}/>;
  return <C size={size} color={color} strokeWidth={strokeWidth} style={style}/>;
}

// Pill — tiny status indicator, NOT a button. tone: neutral|accent|success|warn|danger|info
function Pill({ tone = 'neutral', dot = false, children, mono = false, style }) {
  const map = {
    neutral: { bg: 'transparent', fg: 'var(--sk-fgMuted)', bd: 'var(--sk-border)' },
    accent:  { bg: 'var(--sk-accentSoft)',  fg: 'var(--sk-accent)',  bd: 'transparent' },
    success: { bg: 'var(--sk-successSoft)', fg: 'var(--sk-success)', bd: 'transparent' },
    warn:    { bg: 'var(--sk-warnSoft)',    fg: 'var(--sk-warn)',    bd: 'transparent' },
    danger:  { bg: 'var(--sk-dangerSoft)',  fg: 'var(--sk-danger)',  bd: 'transparent' },
    info:    { bg: 'var(--sk-infoSoft)',    fg: 'var(--sk-info)',    bd: 'transparent' },
  };
  const s = map[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
      lineHeight: 1.4, color: s.fg, background: s.bg,
      border: s.bd === 'transparent' ? '1px solid transparent' : `1px solid ${s.bd}`,
      fontFamily: mono ? SK.fontMono : 'inherit',
      letterSpacing: mono ? 0 : 0.1,
      ...style,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: s.fg }}/>}
      {children}
    </span>
  );
}

// Button — primary|secondary|ghost|danger. size sm|md
function Btn({ kind = 'secondary', size = 'md', icon, iconRight, children, style, onClick, full }) {
  const sizes = {
    sm: { h: 26, px: 10, fs: 12.5, ic: 14 },
    md: { h: 32, px: 13, fs: 13.5, ic: 15 },
  };
  const z = sizes[size];
  const kinds = {
    primary:   { bg: 'var(--sk-accent)', fg: '#fff', bd: 'transparent' },
    secondary: { bg: 'var(--sk-raised)', fg: 'var(--sk-fg)', bd: 'var(--sk-border)' },
    ghost:     { bg: 'transparent', fg: 'var(--sk-fgMuted)', bd: 'transparent' },
    danger:    { bg: 'transparent', fg: 'var(--sk-danger)', bd: 'var(--sk-border)' },
    surface:   { bg: 'var(--sk-surface)', fg: 'var(--sk-fg)', bd: 'var(--sk-border)' },
  };
  const k = kinds[kind];
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      height: z.h, padding: `0 ${z.px}px`, fontSize: z.fs, fontWeight: 500,
      color: k.fg, background: k.bg, border: `1px solid ${k.bd}`,
      borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
      width: full ? '100%' : 'auto', justifyContent: full ? 'center' : 'flex-start',
      ...style,
    }}>
      {icon && <Icon name={icon} size={z.ic}/>}
      {children}
      {iconRight && <Icon name={iconRight} size={z.ic}/>}
    </button>
  );
}

// Avatar — small initial or icon disc
function Avatar({ name, color, size = 22, icon }) {
  const initials = name ? name.split(' ').map(w => w[0]).slice(0, 2).join('') : '';
  return (
    <span style={{
      width: size, height: size, borderRadius: 999, flex: 'none',
      background: color || 'var(--sk-raised)', color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 600, letterSpacing: 0.2,
    }}>
      {icon ? <Icon name={icon} size={size * 0.55}/> : initials}
    </span>
  );
}

// KBD — keyboard key
function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 18, height: 18, padding: '0 5px', borderRadius: 4,
      background: 'var(--sk-raised)', border: '1px solid var(--sk-border)',
      color: 'var(--sk-fgMuted)', fontSize: 10.5, fontFamily: SK.fontMono, fontWeight: 500,
    }}>{children}</span>
  );
}

// Sparkline — tiny inline activity chart
function Spark({ data = [], w = 64, h = 20, color = 'currentColor' }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const dx = w / (data.length - 1 || 1);
  const pts = data.map((v, i) => `${i * dx},${h - (v / max) * (h - 2) - 1}`).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4}/>
    </svg>
  );
}

// Status dot — solid colored circle, no text
function Dot({ tone = 'neutral', size = 8, pulse = false }) {
  const map = {
    neutral: 'var(--sk-fgDim)', accent: 'var(--sk-accent)',
    success: 'var(--sk-success)', warn: 'var(--sk-warn)',
    danger: 'var(--sk-danger)', info: 'var(--sk-info)',
  };
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: 999,
      background: map[tone], flex: 'none',
      boxShadow: pulse ? `0 0 0 4px ${map[tone].replace(')', ' / .25)').replace('var(--sk-', 'rgb(')}` : 'none',
    }}/>
  );
}

Object.assign(window, { Icon, Pill, Btn, Avatar, Kbd, Spark, Dot, SKI });

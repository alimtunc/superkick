// Linear-style status + priority icons. Kept in their own file so they can
// be reused across issues + kanban + search + hover preview.

// Status icons mirror Linear's vocabulary; colors are wired to Superkick tokens.
function StatusIcon({ kind = 'todo', size = 14, color }) {
  const c = color || {
    backlog:    'var(--sk-fgDim)',
    todo:       'var(--sk-fgMuted)',
    progress:   'var(--sk-info)',
    needs:      'var(--sk-warn)',
    review:     'var(--sk-accent)',
    done:       'var(--sk-success)',
    cancelled:  'var(--sk-fgDim)',
  }[kind];
  const stroke = { stroke: c, strokeWidth: 1.6, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  const filled = { fill: c, stroke: c };
  switch (kind) {
    case 'backlog':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.6" {...stroke} strokeDasharray="2.2 2"/>
        </svg>
      );
    case 'todo':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.6" {...stroke}/>
        </svg>
      );
    case 'progress':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.6" {...stroke}/>
          <path d="M7 7 L7 1.4 A5.6 5.6 0 0 1 12.6 7 Z" {...filled}/>
        </svg>
      );
    case 'needs':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.6" {...stroke}/>
          <path d="M7 7 L7 1.4 A5.6 5.6 0 0 1 11.4 11.4 L7 7 Z" {...filled}/>
        </svg>
      );
    case 'review':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="5.6" {...filled} fillOpacity="0.18"/>
          <circle cx="7" cy="7" r="5.6" {...stroke}/>
          <path d="M4.4 7.3 L6.2 9 L9.6 5.4" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case 'done':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="6" {...filled}/>
          <path d="M4.4 7.3 L6.2 9 L9.6 5.2" stroke="var(--sk-void)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      );
    case 'cancelled':
      return (
        <svg width={size} height={size} viewBox="0 0 14 14">
          <circle cx="7" cy="7" r="6" fill={c}/>
          <path d="M4.8 4.8 L9.2 9.2 M9.2 4.8 L4.8 9.2" stroke="var(--sk-void)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      );
  }
}

// Priority — Linear's bar stack. Urgent gets the exclamation square.
function PriorityIcon({ kind = 'none', size = 14 }) {
  if (kind === 'urgent') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14">
        <rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="var(--sk-danger)"/>
        <rect x="6.4" y="3.6" width="1.2" height="4.6" rx="0.6" fill="var(--sk-void)"/>
        <rect x="6.4" y="9.4" width="1.2" height="1.2" rx="0.6" fill="var(--sk-void)"/>
      </svg>
    );
  }
  if (kind === 'none') {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14">
        {[2.5, 7, 11.5].map((cx) => (
          <circle key={cx} cx={cx} cy="7" r="0.9" fill="var(--sk-fgDim)"/>
        ))}
      </svg>
    );
  }
  const bars = { high: 3, medium: 2, low: 1 }[kind] || 0;
  return (
    <svg width={size} height={size} viewBox="0 0 14 14">
      {[0, 1, 2].map((i) => {
        const on = i < bars;
        const h = 3 + i * 2.5;
        const y = 11 - h;
        return (
          <rect key={i} x={2 + i * 3.4} y={y} width="2.2" height={h} rx="0.6"
            fill={on ? 'var(--sk-fg)' : 'var(--sk-borderStrong)'}/>
        );
      })}
    </svg>
  );
}

// Sub-issue count chip (Linear-style "3/8" sub-issue tally)
function SubCount({ done, total }) {
  return (
    <span className="sk-mono" style={{
      fontSize: 11, color: 'var(--sk-fgDim)',
      letterSpacing: 0, whiteSpace: 'nowrap',
    }}>{done}/{total}</span>
  );
}

// Label chip — small tinted dot + name, Linear-style
function Label({ name, color = '#7a8fb8' }) {
  return (
    <span className="sk-row" style={{
      gap: 5, padding: '1px 7px 1px 6px', borderRadius: 999,
      border: '1px solid var(--sk-border)', fontSize: 11,
      color: 'var(--sk-fgMuted)', height: 18, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }}/>
      {name}
    </span>
  );
}

// Task-state badge — the Superkick-specific addition to a row.
// Indicates whether a Launch Task is in flight on this issue.
// kind: 'needs' | 'running' | 'review' | 'shipped' | null
function TaskBadge({ kind, label, mono }) {
  if (!kind) return null;
  const map = {
    needs:   { tone: 'warn',    text: label || 'needs you',  pulse: false },
    running: { tone: 'info',    text: label || 'running',    pulse: true },
    review:  { tone: 'accent',  text: label || 'review',     pulse: false },
    shipped: { tone: 'success', text: label || 'shipped',    pulse: false },
  };
  const m = map[kind];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '1px 7px', borderRadius: 4, height: 18,
      background: `var(--sk-${m.tone}Soft)`, color: `var(--sk-${m.tone})`,
      fontSize: 11, fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap',
      fontFamily: mono ? SK.fontMono : 'inherit',
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: 999, background: `var(--sk-${m.tone})`,
        animation: m.pulse ? 'sk-pulse 1.6s ease-in-out infinite' : 'none',
      }}/>
      {m.text}
    </span>
  );
}

Object.assign(window, { StatusIcon, PriorityIcon, SubCount, Label, TaskBadge });

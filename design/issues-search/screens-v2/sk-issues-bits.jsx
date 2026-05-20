// Building blocks for the reworked /issues surface:
// • IssueRowV2  — 32px Linear-density row with Superkick task-state badge
// • GroupHeader — the bucket header (Needs you · Active · Launchable · Open)
// • FilterChip  — "Status: ≠ Done ×" + "+ Filter"
// • FilterBar   — chips, sort/group, list/board toggle
// • ViewTabs    — saved views (My open work +)
// • IssueHoverCard — Linear-style preview floating over a row

function ViewTabs({ active = 'mine', counts = {} }) {
  const tabs = [
    { id: 'mine',    label: 'My open work', n: counts.mine ?? 7,    pinned: true },
    { id: 'allopen', label: 'All open',     n: counts.allopen ?? 27 },
    { id: 'shipped', label: 'Recently shipped', n: counts.shipped ?? 12 },
  ];
  return (
    <div className="sk-row" style={{
      gap: 2, padding: '0 24px', borderBottom: '1px solid var(--sk-border)',
      flex: 'none', background: 'var(--sk-surface)',
    }}>
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <div key={t.id} className="sk-row" style={{
            gap: 7, padding: '10px 12px', cursor: 'pointer',
            borderBottom: on ? '2px solid var(--sk-accent)' : '2px solid transparent',
            color: on ? 'var(--sk-fg)' : 'var(--sk-fgMuted)',
            fontSize: 13, fontWeight: on ? 500 : 400,
            marginBottom: -1, position: 'relative',
          }}>
            {t.pinned && <Icon name="star" size={11} color={on ? 'var(--sk-accent)' : 'var(--sk-fgDim)'}/>}
            <span>{t.label}</span>
            <span className="sk-mono" style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>{t.n}</span>
          </div>
        );
      })}
      <div className="sk-row" style={{
        gap: 5, padding: '10px 12px', color: 'var(--sk-fgDim)',
        fontSize: 13, cursor: 'pointer',
      }}>
        <Icon name="plus" size={12} color="var(--sk-fgDim)"/>
        New view
      </div>
      <span style={{ flex: 1 }}/>
    </div>
  );
}

function FilterChip({ k, v, op = ':', removable = true, tone, accent }) {
  return (
    <span className="sk-row" style={{
      gap: 6, padding: '0 4px 0 8px', height: 24, borderRadius: 6,
      background: tone ? `var(--sk-${tone}Soft)` : 'var(--sk-raised)',
      border: `1px solid ${tone ? 'transparent' : 'var(--sk-border)'}`,
      fontSize: 12, color: 'var(--sk-fg)', whiteSpace: 'nowrap',
    }}>
      <span style={{ color: 'var(--sk-fgMuted)' }}>{k}</span>
      <span style={{ color: 'var(--sk-fgDim)' }}>{op}</span>
      {accent}
      <span style={{ color: tone ? `var(--sk-${tone})` : 'var(--sk-fg)', fontWeight: 500 }}>{v}</span>
      {removable && (
        <span className="sk-row" style={{
          width: 16, height: 16, borderRadius: 4, justifyContent: 'center',
          color: 'var(--sk-fgDim)', cursor: 'pointer',
        }}>
          <Icon name="x" size={10}/>
        </span>
      )}
    </span>
  );
}

function FilterBar({ chips = [], extra }) {
  return (
    <div className="sk-row" style={{
      gap: 7, padding: '8px 24px',
      borderBottom: '1px solid var(--sk-border)', flex: 'none',
      background: 'var(--sk-surface)', minHeight: 41,
    }}>
      <button style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        height: 24, padding: '0 8px', borderRadius: 6,
        background: 'transparent', border: '1px dashed var(--sk-border)',
        color: 'var(--sk-fgMuted)', fontSize: 12, fontFamily: 'inherit',
        cursor: 'pointer',
      }}>
        <Icon name="plus" size={11} color="var(--sk-fgMuted)"/>
        Filter
      </button>
      {chips}
      {extra}
      <span style={{ flex: 1 }}/>
      <span className="sk-row" style={{ gap: 5, color: 'var(--sk-fgMuted)', fontSize: 12 }}>
        <span style={{ color: 'var(--sk-fgDim)' }}>Sort</span>
        <span>Updated</span>
        <Icon name="chevDown" size={11} color="var(--sk-fgDim)"/>
      </span>
      <span style={{ width: 1, height: 14, background: 'var(--sk-border)', margin: '0 4px' }}/>
      <span className="sk-row" style={{ gap: 5, color: 'var(--sk-fgMuted)', fontSize: 12 }}>
        <span style={{ color: 'var(--sk-fgDim)' }}>Group</span>
        <span>Lifecycle</span>
        <Icon name="chevDown" size={11} color="var(--sk-fgDim)"/>
      </span>
      <span style={{ width: 1, height: 14, background: 'var(--sk-border)', margin: '0 4px' }}/>
      <ViewToggle active="list"/>
    </div>
  );
}

function ViewToggle({ active = 'list' }) {
  return (
    <div className="sk-row" style={{
      background: 'var(--sk-raised)', borderRadius: 6,
      border: '1px solid var(--sk-border)', padding: 2, gap: 2,
    }}>
      {['list', 'board'].map(v => {
        const on = v === active;
        return (
          <span key={v} className="sk-row" style={{
            padding: '2px 8px', borderRadius: 4, gap: 5,
            background: on ? 'var(--sk-surface)' : 'transparent',
            color: on ? 'var(--sk-fg)' : 'var(--sk-fgDim)',
            fontSize: 11.5, cursor: 'pointer', textTransform: 'capitalize',
          }}>
            <Icon name={v === 'list' ? 'doc' : 'layers'} size={11}
              color={on ? 'var(--sk-fg)' : 'var(--sk-fgDim)'}/>
            {v}
          </span>
        );
      })}
    </div>
  );
}

// The bucket header that sits above each grouped section.
function GroupHeader({ id, label, count, tone = 'neutral', action, defaultOpen = true }) {
  const dotColor = {
    danger:  'var(--sk-danger)',
    warn:    'var(--sk-warn)',
    info:    'var(--sk-info)',
    accent:  'var(--sk-accent)',
    neutral: 'var(--sk-fgDim)',
    success: 'var(--sk-success)',
  }[tone];
  return (
    <div className="sk-row" style={{
      gap: 8, padding: '6px 24px',
      borderBottom: '1px solid var(--sk-border)',
      background: 'var(--sk-surface)', height: 32, flex: 'none',
      position: 'sticky', top: 0, zIndex: 1,
    }}>
      <Icon name={defaultOpen ? 'chevDown' : 'chev'} size={11} color="var(--sk-fgDim)"/>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: dotColor, flex: 'none' }}/>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--sk-fg)' }}>{label}</span>
      <span className="sk-mono" style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>{count}</span>
      <span style={{ flex: 1 }}/>
      {action}
    </div>
  );
}

// IssueRowV2 — Linear-density 32px row with a Superkick task-state badge
// inserted between the title and the labels column.
function IssueRowV2({
  id, prio = 'medium', status = 'todo', title,
  task,      // { kind, label } | null
  labels = [],
  project,
  assignee,
  age,
  active = false,
}) {
  return (
    <div className="sk-row" style={{
      gap: 8, padding: '0 24px', height: 32,
      cursor: 'pointer', borderBottom: '1px solid var(--sk-border)',
      background: active ? 'var(--sk-raised)' : 'transparent',
      fontSize: 13, position: 'relative',
    }}>
      <span style={{ width: 14, flex: 'none', display: 'inline-flex', justifyContent: 'center' }}>
        <PriorityIcon kind={prio} size={12}/>
      </span>
      <span className="sk-mono" style={{
        width: 60, flex: 'none', color: 'var(--sk-fgDim)',
        fontSize: 11, letterSpacing: 0,
      }}>{id}</span>
      <span style={{ width: 14, flex: 'none', display: 'inline-flex', justifyContent: 'center' }}>
        <StatusIcon kind={status} size={13}/>
      </span>
      <span style={{
        flex: 1, color: 'var(--sk-fg)', fontWeight: 400,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        minWidth: 0,
      }}>{title}</span>
      {task && <TaskBadge kind={task.kind} label={task.label} mono={task.mono}/>}
      {labels.length > 0 && (
        <div className="sk-row" style={{ gap: 4, flex: 'none' }}>
          {labels.slice(0, 2).map(l => <Label key={l.name} name={l.name} color={l.color}/>)}
        </div>
      )}
      {project && (
        <div className="sk-row" style={{ gap: 4, flex: 'none', color: 'var(--sk-fgDim)', fontSize: 11.5 }}>
          <Icon name="chev" size={10} color="var(--sk-fgDim)"/>
          <span className="sk-mono" style={{ fontSize: 11 }}>{project}</span>
        </div>
      )}
      <div className="sk-row" style={{ width: 22, flex: 'none', justifyContent: 'center' }}>
        {assignee
          ? <Avatar name={assignee.name} color={assignee.color} size={18} icon={assignee.icon}/>
          : <span style={{ width: 18, height: 18, borderRadius: 999, border: '1px dashed var(--sk-border)' }}/>}
      </div>
      <span className="sk-mono" style={{
        width: 36, textAlign: 'right', flex: 'none',
        fontSize: 11, color: 'var(--sk-fgDim)',
      }}>{age}</span>
    </div>
  );
}

// IssueHoverCard — Linear-rich preview that floats above a row on hover.
// Used in artboards to demonstrate the comment/context preview pattern.
function IssueHoverCard({ id, title, prio, status, body, lastComment, runs, pr, labels = [], assignee, opened }) {
  return (
    <div style={{
      width: 460, background: 'var(--sk-overlay)',
      borderRadius: 10, border: '1px solid var(--sk-border)',
      boxShadow: '0 20px 48px rgba(0,0,0,.55)',
      overflow: 'hidden',
    }}>
      <div className="sk-row" style={{ gap: 8, padding: '12px 14px 8px' }}>
        <PriorityIcon kind={prio} size={13}/>
        <StatusIcon kind={status} size={13}/>
        <span className="sk-mono" style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>{id}</span>
        <span style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>opened {opened}</span>
      </div>
      <div style={{ padding: '0 14px 10px', fontSize: 14, fontWeight: 500,
        color: 'var(--sk-fg)', lineHeight: 1.35 }}>{title}</div>
      <div style={{ padding: '0 14px 12px', fontSize: 12.5,
        color: 'var(--sk-fgMuted)', lineHeight: 1.55,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {body}
      </div>
      {labels.length > 0 && (
        <div className="sk-row" style={{ gap: 5, padding: '0 14px 12px', flexWrap: 'wrap' }}>
          {labels.map(l => <Label key={l.name} name={l.name} color={l.color}/>)}
        </div>
      )}
      {lastComment && (
        <div className="sk-row" style={{
          gap: 9, padding: '10px 14px',
          borderTop: '1px solid var(--sk-border)',
          background: 'var(--sk-surface)',
        }}>
          <Avatar name={lastComment.who} color={lastComment.color} size={20} icon={lastComment.icon}/>
          <div className="sk-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <div className="sk-row" style={{ gap: 6, fontSize: 11.5 }}>
              <span style={{ color: 'var(--sk-fg)', fontWeight: 500 }}>{lastComment.who}</span>
              <span style={{ color: 'var(--sk-fgDim)' }}>· last comment · {lastComment.age}</span>
            </div>
            <div style={{
              fontSize: 12, color: 'var(--sk-fgMuted)', lineHeight: 1.45,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{lastComment.text}</div>
          </div>
        </div>
      )}
      {(runs || pr) && (
        <div className="sk-row" style={{
          gap: 7, padding: '10px 14px',
          borderTop: '1px solid var(--sk-border)',
        }}>
          {runs && runs.map(r => (
            <span key={r.id} className="sk-row" style={{
              gap: 5, padding: '2px 8px', borderRadius: 6,
              background: 'var(--sk-raised)', border: '1px solid var(--sk-border)',
              fontSize: 11.5,
            }}>
              <Dot tone={r.tone} pulse={r.pulse} size={6}/>
              <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>{r.id}</span>
              <span style={{ color: 'var(--sk-fgMuted)' }}>· {r.label}</span>
            </span>
          ))}
          {pr && (
            <span className="sk-row" style={{
              gap: 5, padding: '2px 8px', borderRadius: 6,
              background: 'var(--sk-raised)', border: '1px solid var(--sk-border)',
              fontSize: 11.5,
            }}>
              <Icon name="pr" size={11} color="var(--sk-fgMuted)"/>
              <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>{pr.id}</span>
              <span style={{ color: 'var(--sk-fgMuted)' }}>· {pr.label}</span>
            </span>
          )}
        </div>
      )}
      <div className="sk-row" style={{
        gap: 7, padding: '9px 14px', justifyContent: 'flex-end',
        borderTop: '1px solid var(--sk-border)', background: 'var(--sk-void)',
      }}>
        <Btn kind="ghost" size="sm" icon="external">Open</Btn>
        <Btn kind="primary" size="sm" icon="zap">Launch task</Btn>
      </div>
    </div>
  );
}

Object.assign(window, {
  ViewTabs, FilterChip, FilterBar, ViewToggle,
  GroupHeader, IssueRowV2, IssueHoverCard,
});

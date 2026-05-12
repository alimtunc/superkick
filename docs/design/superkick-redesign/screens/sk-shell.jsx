// Superkick shell — Sidebar + Topbar + Page container.
// Used by every full-page screen.

function Sidebar({ active = 'inbox', counts = {} }) {
  const Item = ({ id, icon, label, badge, badgeTone = 'accent' }) => {
    const on = active === id;
    return (
      <div className="sk-row" style={{
        gap: 10, padding: '7px 10px', borderRadius: 7,
        background: on ? 'var(--sk-raised)' : 'transparent',
        color: on ? 'var(--sk-fg)' : 'var(--sk-fgMuted)',
        cursor: 'pointer', fontSize: 13.5, fontWeight: on ? 500 : 400,
        position: 'relative',
      }}>
        {on && <span style={{
          position: 'absolute', left: -10, top: 6, bottom: 6, width: 2,
          background: 'var(--sk-accent)', borderRadius: 2,
        }}/>}
        <Icon name={icon} size={16} color={on ? 'var(--sk-fg)' : 'var(--sk-fgDim)'}/>
        <span style={{ flex: 1 }}>{label}</span>
        {badge != null && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
            background: badgeTone === 'accent' ? 'var(--sk-accent)' : 'var(--sk-raised)',
            color: badgeTone === 'accent' ? '#fff' : 'var(--sk-fgMuted)',
            fontFamily: SK.fontMono,
          }}>{badge}</span>
        )}
      </div>
    );
  };
  return (
    <div className="sk-col" style={{
      width: 224, height: '100%', background: 'var(--sk-surface)',
      borderRight: '1px solid var(--sk-border)', padding: '14px 12px',
      gap: 2, flex: 'none',
    }}>
      {/* Workspace */}
      <div className="sk-row" style={{ gap: 9, padding: '4px 8px 12px' }}>
        <span style={{
          width: 26, height: 26, borderRadius: 7, background: 'var(--sk-accent)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, fontWeight: 700,
        }}>S</span>
        <div className="sk-col" style={{ gap: 0, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sk-fg)' }}>superkick</div>
          <div style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>acme-platform</div>
        </div>
        <Icon name="chevDown" size={14} color="var(--sk-fgDim)"/>
      </div>

      {/* Search */}
      <div className="sk-row" style={{
        gap: 7, padding: '6px 9px', borderRadius: 7,
        background: 'var(--sk-raised)', border: '1px solid var(--sk-border)',
        marginBottom: 12,
      }}>
        <Icon name="search" size={14} color="var(--sk-fgDim)"/>
        <span style={{ flex: 1, color: 'var(--sk-fgDim)', fontSize: 12.5 }}>Search</span>
        <Kbd>⌘K</Kbd>
      </div>

      <Item id="inbox" icon="inbox" label="Inbox" badge={counts.inbox ?? 4}/>
      <Item id="issues" icon="issue" label="Issues" badge={counts.issues ?? 27} badgeTone="muted"/>
      <Item id="tasks" icon="task" label="Tasks" badge={counts.tasks ?? 12} badgeTone="muted"/>
      <Item id="runs" icon="loop" label="Runs"/>
      <Item id="agents" icon="agent" label="Agents"/>

      <div style={{ height: 1, background: 'var(--sk-border)', margin: '14px 0 10px' }}/>

      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--sk-fgDim)',
        textTransform: 'uppercase', letterSpacing: 0.8, padding: '4px 10px 6px' }}>
        Pinned
      </div>
      <Item id="p1" icon="pin" label="Q4 payments incident"/>
      <Item id="p2" icon="pin" label="Stripe 3DS rollout"/>

      <div style={{ flex: 1 }}/>

      <Item id="settings" icon="settings" label="Settings"/>
      <div className="sk-row" style={{ gap: 9, padding: '8px 8px 2px', marginTop: 8 }}>
        <Avatar name="Léa M" color="#6f5ad9" size={24}/>
        <div className="sk-col" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: 'var(--sk-fg)', fontWeight: 500 }}>Léa Martin</div>
          <div style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>SRE · on-call</div>
        </div>
        <Icon name="chevDown" size={13} color="var(--sk-fgDim)"/>
      </div>
    </div>
  );
}

function Topbar({ title, crumbs, right, sub }) {
  return (
    <div className="sk-row" style={{
      height: 52, padding: '0 24px', borderBottom: '1px solid var(--sk-border)',
      background: 'var(--sk-surface)', gap: 14, flex: 'none',
    }}>
      <div className="sk-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        {crumbs && (
          <div className="sk-row" style={{ gap: 6, fontSize: 11.5, color: 'var(--sk-fgDim)' }}>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
                <span style={{ color: i === crumbs.length - 1 ? 'var(--sk-fgMuted)' : 'var(--sk-fgDim)' }}>{c}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="sk-row" style={{ gap: 10 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sk-fg)' }}>{title}</div>
          {sub}
        </div>
      </div>
      {right}
    </div>
  );
}

function Page({ active, title, crumbs, sub, right, children, counts }) {
  return (
    <div className="sk-row" style={{ height: '100%', alignItems: 'stretch' }}>
      <Sidebar active={active} counts={counts}/>
      <div className="sk-col" style={{ flex: 1, minWidth: 0 }}>
        <Topbar title={title} crumbs={crumbs} sub={sub} right={right}/>
        <div className="sk-col" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar, Topbar, Page });

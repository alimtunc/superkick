// Kanban — triage view. Status columns; drag issues across.
// Card shows: ID + priority, title, task-state badge if any, label + age.

function KCard({ row, dragging, ghost }) {
  return (
    <div style={{
      background: ghost ? 'transparent' : 'var(--sk-raised)',
      borderRadius: 7, padding: '8px 10px',
      border: ghost
        ? '1px dashed var(--sk-borderStrong)'
        : dragging
          ? '1px solid var(--sk-accent)'
          : '1px solid var(--sk-border)',
      cursor: 'grab',
      boxShadow: dragging ? '0 12px 28px rgba(0,0,0,.45)' : 'none',
      transform: dragging ? 'rotate(-1.3deg)' : 'none',
      opacity: ghost ? 0.65 : 1,
    }}>
      <div className="sk-row" style={{ gap: 6, marginBottom: 5 }}>
        <PriorityIcon kind={row.prio} size={11}/>
        <span className="sk-mono" style={{ fontSize: 10.5, color: 'var(--sk-fgDim)' }}>{row.id}</span>
        <span style={{ flex: 1 }}/>
        {row.task && <TaskBadge kind={row.task.kind} label={row.task.label} mono={row.task.mono}/>}
      </div>
      <div style={{
        fontSize: 12.5, color: 'var(--sk-fg)', lineHeight: 1.35,
        marginBottom: 7, fontWeight: 400,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{row.title}</div>
      <div className="sk-row" style={{ gap: 5 }}>
        {row.labels.slice(0, 1).map(l => <Label key={l.name} name={l.name} color={l.color}/>)}
        <span style={{ flex: 1 }}/>
        {row.assignee && <Avatar name={row.assignee.name} color={row.assignee.color}
          size={16} icon={row.assignee.icon}/>}
        <span style={{ fontSize: 10.5, color: 'var(--sk-fgDim)' }}>{row.age}</span>
      </div>
    </div>
  );
}

function KCol({ title, n, tone = 'neutral', children, dropTarget }) {
  const dotColor = {
    danger: 'var(--sk-danger)', warn: 'var(--sk-warn)',
    info: 'var(--sk-info)', accent: 'var(--sk-accent)',
    neutral: 'var(--sk-fgDim)', success: 'var(--sk-success)',
  }[tone];
  return (
    <div className="sk-col" style={{
      width: 268, flex: 'none', height: '100%', minHeight: 0,
      background: dropTarget ? 'var(--sk-accentSoft)' : 'transparent',
      borderRight: '1px solid var(--sk-border)',
      transition: 'background 120ms ease',
    }}>
      <div className="sk-row" style={{ padding: '10px 14px 8px', gap: 8, flex: 'none' }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: dotColor }}/>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--sk-fg)' }}>{title}</span>
        <span className="sk-mono" style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>{n}</span>
        <span style={{ flex: 1 }}/>
        <Icon name="plus" size={13} color="var(--sk-fgDim)"/>
      </div>
      <div className="sk-col sk-scrollbox" style={{
        gap: 7, padding: '0 12px 14px', overflow: 'auto', flex: 1, minHeight: 0,
      }}>{children}</div>
    </div>
  );
}

function IssuesKanbanTriage({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="Issues · kanban triage">
      <Page
        active="issues"
        title="Issues"
        sub={<span style={{ fontSize: 12, color: 'var(--sk-fgDim)' }}>acme-platform</span>}
        right={<IssuesRight/>}
      >
        <ViewTabs active="allopen"/>
        <FilterBar chips={<FilterChip k="Status" op="≠" v="Done"/>}/>
        <div className="sk-row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          <KCol title="Open" n={8} tone="neutral">
            <KCard row={ISSUE_ROWS.launchable[0]}/>
            <KCard row={ISSUE_ROWS.launchable[1]}/>
            <KCard row={ISSUE_ROWS.open[0]}/>
            <KCard row={ISSUE_ROWS.open[1]}/>
          </KCol>
          <KCol title="In progress" n={6} tone="info" dropTarget>
            <KCard row={ISSUE_ROWS.active[0]}/>
            <KCard row={ISSUE_ROWS.active[1]}/>
            {/* Ghost placeholder showing where the dragged card lands */}
            <KCard row={{ id: '', prio: 'medium', title: '', labels: [], assignee: null, age: '' }} ghost/>
            {/* Dragging card (visually rotated, shadowed) */}
            <div style={{ position: 'relative' }}>
              <KCard row={{
                id: 'ISS-206', prio: 'medium',
                title: "Webhook retries don't respect Retry-After header",
                labels: [{ name: 'webhook', color: '#5b8ec9' }],
                assignee: { name: 'Léa M', color: '#6f5ad9' }, age: '2d',
                task: null,
              }} dragging/>
            </div>
          </KCol>
          <KCol title="Needs human" n={4} tone="warn">
            <KCard row={ISSUE_ROWS.needs[0]}/>
            <KCard row={ISSUE_ROWS.needs[1]}/>
          </KCol>
          <KCol title="Review" n={5} tone="accent">
            <KCard row={ISSUE_ROWS.active[2]}/>
            <KCard row={{
              id: 'ISS-195', prio: 'medium',
              title: 'Token refresh fails on long-lived sessions',
              labels: [{ name: 'auth', color: '#3a6f4e' }],
              task: { kind: 'review', label: 'PR #79' },
              assignee: { name: 'fix-bot', color: FIX, icon: 'bot' }, age: '4d',
            }}/>
          </KCol>
          <KCol title="Done" n={143} tone="success">
            <KCard row={{
              id: 'ISS-198', prio: 'low',
              title: 'Spelling in onboarding email template',
              labels: [], task: { kind: 'shipped' },
              assignee: { name: 'fix-bot', color: FIX, icon: 'bot' }, age: '3d',
            }}/>
            <KCard row={{
              id: 'ISS-194', prio: 'medium',
              title: 'Bump axios past CVE-2024-39338',
              labels: [{ name: 'security', color: '#cf5a55' }],
              task: { kind: 'shipped' },
              assignee: { name: 'fix-bot', color: FIX, icon: 'bot' }, age: '3d',
            }}/>
            <div style={{ fontSize: 11.5, color: 'var(--sk-fgDim)',
              textAlign: 'center', padding: '8px 0' }} className="sk-link">
              Show all 143 →
            </div>
          </KCol>
        </div>
      </Page>
    </SKFrame>
  );
}

Object.assign(window, { IssuesKanbanTriage });

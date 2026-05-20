// SK Issues — list + kanban variations.

function IssueRow({ id, prio, title, sev, repo, agent, status, runs, age, last }) {
  const sevTone = { P0: 'danger', P1: 'danger', P2: 'warn', P3: 'info', P4: 'neutral' }[sev] || 'neutral';
  const statusTone = {
    'open': 'neutral',
    'in-progress': 'info',
    'needs-human': 'warn',
    'review': 'accent',
    'done': 'success',
  }[status] || 'neutral';
  return (
    <div className="sk-row" style={{
      gap: 12, padding: '10px 24px', cursor: 'pointer',
      borderBottom: last ? 'none' : '1px solid var(--sk-border)',
      fontSize: 13,
    }}>
      <span className="sk-mono" style={{ width: 60, color: 'var(--sk-fgDim)', fontSize: 11.5 }}>{id}</span>
      <Pill tone={sevTone} mono style={{ width: 32, justifyContent: 'center' }}>{sev}</Pill>
      <span style={{ flex: 1, color: 'var(--sk-fg)', fontWeight: 500, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      <Pill tone={statusTone} dot>{status.replace('-', ' ')}</Pill>
      <span style={{ width: 130, fontSize: 11.5, color: 'var(--sk-fgMuted)' }} className="sk-mono">{repo}</span>
      <div className="sk-row" style={{ width: 110, gap: 6 }}>
        {agent ? (<><Avatar name={agent} color="#3a6f4e" size={18} icon="bot"/>
          <span style={{ fontSize: 12, color: 'var(--sk-fgMuted)' }}>{agent}</span></>) : (
          <span style={{ fontSize: 12, color: 'var(--sk-fgDim)' }}>—</span>
        )}
      </div>
      <span className="sk-mono" style={{ width: 38, textAlign: 'right', fontSize: 11.5, color: 'var(--sk-fgMuted)' }}>{runs}</span>
      <span style={{ width: 56, textAlign: 'right', fontSize: 11.5, color: 'var(--sk-fgDim)' }}>{age}</span>
    </div>
  );
}

function IssuesList({ theme = 'dark' }) {
  const rows = [
    ['ISS-217','P2','Webhook signature intermittently rejected from us-east-2','open','payments-api', null, 'open', 0, '1h'],
    ['ISS-216','P1','Checkout 500s spike after deploy','danger','checkout-web', 'fix-bot', 'in-progress', 2, '3h'],
    ['ISS-214','P2','Stripe 3DS redirect lost on Safari iOS','warn','checkout-web', 'review-bot', 'needs-human', 4, '5h'],
    ['ISS-211','P3','Stale invoice state for prorated upgrades','info','billing-worker', 'fix-bot', 'in-progress', 3, '1d'],
    ['ISS-209','P4','Dead link on /pricing footer','neutral','marketing-site', 'fix-bot', 'review', 1, '1d'],
    ['ISS-206','P2','Webhook retries don\'t respect Retry-After','warn','payments-api', null, 'open', 0, '2d'],
    ['ISS-204','P3','Dashboard timeline jitter on Firefox','info','dashboard-web', 'fix-bot', 'in-progress', 1, '2d'],
    ['ISS-201','P1','Race condition in tenant migration','danger','migrations', 'senior-bot', 'needs-human', 6, '3d'],
    ['ISS-198','P4','Spelling in onboarding email template','neutral','emails', 'fix-bot', 'done', 1, '3d'],
    ['ISS-197','P3','Add audit log for admin role changes','info','auth-service', null, 'open', 0, '4d'],
    ['ISS-195','P2','Token refresh fails on long-lived sessions','warn','auth-service', 'fix-bot', 'review', 2, '4d'],
  ];
  return (
    <SKFrame theme={theme} label="Issues — list">
      <Page
        active="issues"
        title="Issues"
        sub={<Pill tone="neutral" mono>27 open</Pill>}
        right={
          <div className="sk-row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="filter">Severity, status, repo…</Btn>
            <div style={{ width: 1, height: 20, background: 'var(--sk-border)' }}/>
            <Btn kind="ghost" size="sm" icon="layers">Kanban</Btn>
            <Btn kind="primary" size="sm" icon="plus">New issue</Btn>
          </div>
        }
      >
        {/* Column headers */}
        <div className="sk-row" style={{
          gap: 12, padding: '8px 24px', borderBottom: '1px solid var(--sk-border)',
          fontSize: 10.5, color: 'var(--sk-fgDim)', textTransform: 'uppercase',
          letterSpacing: 0.8, fontWeight: 600, background: 'var(--sk-surface)',
        }}>
          <span style={{ width: 60 }}>id</span>
          <span style={{ width: 32 }}>sev</span>
          <span style={{ flex: 1 }}>title</span>
          <span style={{ width: 74 }}>status</span>
          <span style={{ width: 130 }}>repo</span>
          <span style={{ width: 110 }}>agent</span>
          <span style={{ width: 38, textAlign: 'right' }}>runs</span>
          <span style={{ width: 56, textAlign: 'right' }}>age</span>
        </div>
        <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto' }}>
          {rows.map((r, i) => (
            <IssueRow key={r[0]} id={r[0]} sev={r[1]} title={r[2]}
              repo={r[4]} agent={r[5]} status={r[6]} runs={r[7]} age={r[8]}
              last={i === rows.length - 1}/>
          ))}
        </div>
      </Page>
    </SKFrame>
  );
}

function KanbanCard({ id, title, sev, agent, status, age, tag }) {
  const sevTone = { P0: 'danger', P1: 'danger', P2: 'warn', P3: 'info', P4: 'neutral' }[sev];
  return (
    <div style={{
      background: 'var(--sk-raised)', borderRadius: 8,
      padding: 11, border: '1px solid var(--sk-border)',
      cursor: 'pointer',
    }}>
      <div className="sk-row" style={{ gap: 6, marginBottom: 6 }}>
        <span className="sk-mono" style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>{id}</span>
        <Pill tone={sevTone} mono style={{ marginLeft: 'auto' }}>{sev}</Pill>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--sk-fg)', fontWeight: 500, lineHeight: 1.4, marginBottom: 9 }}>{title}</div>
      <div className="sk-row" style={{ gap: 6 }}>
        {agent && <Avatar name={agent} color="#3a6f4e" size={18} icon="bot"/>}
        {tag && <Pill tone="info">{tag}</Pill>}
        <span style={{ flex: 1 }}/>
        <span style={{ fontSize: 10.5, color: 'var(--sk-fgDim)' }}>{age}</span>
      </div>
    </div>
  );
}

function KanbanCol({ title, n, accent, children }) {
  return (
    <div className="sk-col" style={{
      width: 260, flex: 'none', height: '100%',
      borderRight: '1px solid var(--sk-border)',
    }}>
      <div className="sk-row" style={{
        padding: '12px 14px 10px', gap: 8, flex: 'none',
      }}>
        {accent && <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }}/>}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sk-fg)' }}>{title}</span>
        <span className="sk-mono" style={{ fontSize: 11, color: 'var(--sk-fgDim)' }}>{n}</span>
        <span style={{ flex: 1 }}/>
        <Icon name="more" size={14} color="var(--sk-fgDim)"/>
      </div>
      <div className="sk-col sk-scrollbox" style={{ gap: 8, padding: '0 14px 14px', overflow: 'auto', flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function IssuesKanban({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="Issues — kanban">
      <Page
        active="issues"
        title="Issues"
        sub={<Pill tone="neutral" mono>27 open</Pill>}
        right={
          <div className="sk-row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="filter">Filters</Btn>
            <Btn kind="ghost" size="sm" icon="layers">List</Btn>
            <Btn kind="primary" size="sm" icon="plus">New issue</Btn>
          </div>
        }
      >
        <div className="sk-row" style={{ flex: 1, minHeight: 0, alignItems: 'stretch' }}>
          <KanbanCol title="Open" n={8} accent="var(--sk-fgDim)">
            <KanbanCard id="ISS-217" sev="P2" title="Webhook signature intermittently rejected from us-east-2" age="1h"/>
            <KanbanCard id="ISS-206" sev="P2" title="Webhook retries don't respect Retry-After header" age="2d"/>
            <KanbanCard id="ISS-197" sev="P3" title="Add audit log for admin role changes" age="4d"/>
            <KanbanCard id="ISS-193" sev="P4" title="Increase JWT cookie maxAge for 'remember me'" age="5d"/>
          </KanbanCol>
          <KanbanCol title="In progress" n={6} accent="var(--sk-info)">
            <KanbanCard id="ISS-216" sev="P1" title="Checkout 500s spike after stripe-rust 0.18 bump" agent="fix-bot" age="3h"/>
            <KanbanCard id="ISS-211" sev="P3" title="Stale invoice state for prorated upgrades" agent="fix-bot" age="1d"/>
            <KanbanCard id="ISS-204" sev="P3" title="Dashboard timeline jitter on Firefox" agent="fix-bot" age="2d"/>
          </KanbanCol>
          <KanbanCol title="Needs human" n={4} accent="var(--sk-warn)">
            <KanbanCard id="ISS-214" sev="P2" title="Stripe 3DS redirect lost on Safari iOS" agent="review-bot" tag="paused" age="5h"/>
            <KanbanCard id="ISS-201" sev="P1" title="Race condition in tenant migration script" agent="senior-bot" tag="destructive" age="3d"/>
          </KanbanCol>
          <KanbanCol title="Review" n={5} accent="var(--sk-accent)">
            <KanbanCard id="ISS-209" sev="P4" title="Dead link on /pricing footer" agent="fix-bot" age="1d"/>
            <KanbanCard id="ISS-195" sev="P2" title="Token refresh fails on long-lived sessions" agent="fix-bot" age="4d"/>
          </KanbanCol>
          <KanbanCol title="Done" n={143} accent="var(--sk-success)">
            <KanbanCard id="ISS-198" sev="P4" title="Spelling in onboarding email template" agent="fix-bot" age="3d"/>
            <KanbanCard id="ISS-194" sev="P3" title="Bump axios past CVE-2024-39338" agent="fix-bot" age="3d"/>
            <KanbanCard id="ISS-190" sev="P2" title="Webhook dead-letter UI on dashboard" agent="senior-bot" age="6d"/>
          </KanbanCol>
        </div>
      </Page>
    </SKFrame>
  );
}

Object.assign(window, { IssuesList, IssuesKanban });

// Reworked /issues surface — three list variants + a kanban triage variant.

// Shared dataset so all variants stay in sync.
const FIX = '#3a6f4e', REV = '#5b6ef2', SEN = '#a87a1f';
const ISSUE_ROWS = {
  needs: [
    { id: 'ISS-201', prio: 'urgent', status: 'needs', age: '8m',
      title: 'Race condition in tenant migration script',
      task: { kind: 'needs', label: 'destructive · approve' },
      labels: [{ name: 'migrations', color: '#c45a3d' }, { name: 'security', color: '#cf5a55' }],
      project: 'migrations',
      assignee: { name: 'senior-bot', color: SEN, icon: 'bot' } },
    { id: 'ISS-214', prio: 'high', status: 'needs', age: '32m',
      title: 'Stripe 3DS redirect lost on Safari iOS — reviewer flagged unsafe diff',
      task: { kind: 'needs', label: 'review me' },
      labels: [{ name: 'checkout', color: '#c4ad3d' }],
      project: 'checkout-web',
      assignee: { name: 'review-bot', color: REV, icon: 'bot' } },
  ],
  active: [
    { id: 'ISS-216', prio: 'high', status: 'progress', age: '3h',
      title: 'Checkout 500s spike after stripe-rust 0.18 bump',
      task: { kind: 'running', label: 'implement · 2m', mono: true },
      labels: [{ name: 'checkout', color: '#c4ad3d' }, { name: 'P1', color: '#cf5a55' }],
      project: 'checkout-web',
      assignee: { name: 'fix-bot', color: FIX, icon: 'bot' } },
    { id: 'ISS-211', prio: 'medium', status: 'progress', age: '1d',
      title: 'Stale invoice state for prorated upgrades',
      task: { kind: 'running', label: 'plan · 14s', mono: true },
      labels: [{ name: 'billing', color: '#5b8ec9' }],
      project: 'billing-worker',
      assignee: { name: 'fix-bot', color: FIX, icon: 'bot' } },
    { id: 'ISS-204', prio: 'medium', status: 'progress', age: '2d',
      title: 'Dashboard timeline jitter on Firefox',
      task: { kind: 'review', label: 'PR #82' },
      labels: [{ name: 'dashboard', color: '#9b8aff' }],
      project: 'dashboard-web',
      assignee: { name: 'fix-bot', color: FIX, icon: 'bot' } },
  ],
  launchable: [
    { id: 'ISS-217', prio: 'medium', status: 'progress', age: '1h',
      title: 'Webhook signature intermittently rejected from us-east-2',
      task: null,
      labels: [{ name: 'webhook', color: '#5b8ec9' }],
      project: 'payments-api',
      assignee: { name: 'Léa M', color: '#6f5ad9' } },
    { id: 'ISS-218', prio: 'low', status: 'progress', age: '4h',
      title: 'Add audit log for admin role changes',
      task: null,
      labels: [{ name: 'auth', color: '#3a6f4e' }],
      project: 'auth-service',
      assignee: { name: 'Léa M', color: '#6f5ad9' } },
  ],
  open: [
    { id: 'ISS-206', prio: 'medium', status: 'todo', age: '2d',
      title: 'Webhook retries don\'t respect Retry-After header',
      task: null,
      labels: [{ name: 'webhook', color: '#5b8ec9' }],
      project: 'payments-api',
      assignee: { name: 'Léa M', color: '#6f5ad9' } },
    { id: 'ISS-193', prio: 'low', status: 'backlog', age: '5d',
      title: "Increase JWT cookie maxAge for 'remember me'",
      task: null,
      labels: [],
      project: 'auth-service',
      assignee: { name: 'Léa M', color: '#6f5ad9' } },
  ],
};

const BUCKETS = [
  { id: 'needs',      label: 'Needs you',  tone: 'danger',  rows: ISSUE_ROWS.needs },
  { id: 'active',     label: 'Active',     tone: 'info',    rows: ISSUE_ROWS.active },
  { id: 'launchable', label: 'Launchable', tone: 'accent',  rows: ISSUE_ROWS.launchable,
    action: <Btn kind="ghost" size="sm" icon="zap">Launch all</Btn> },
  { id: 'open',       label: 'Open',       tone: 'neutral', rows: ISSUE_ROWS.open },
];

// Topbar right cluster (shared across list variants)
function IssuesRight({ flat }) {
  return (
    <div className="sk-row" style={{ gap: 8 }}>
      <span className="sk-row" style={{
        gap: 6, padding: '0 9px', height: 26, borderRadius: 6,
        background: 'var(--sk-raised)', border: '1px solid var(--sk-border)',
        color: 'var(--sk-fgMuted)', fontSize: 12, cursor: 'pointer',
      }}>
        <Icon name="search" size={12} color="var(--sk-fgDim)"/>
        Search issues
        <Kbd>⌘K</Kbd>
      </span>
      <Btn kind="secondary" size="sm" icon="plus">New issue</Btn>
    </div>
  );
}

// Layout primitive used by every list variant.
function IssuesShell({ theme, label, children, active = 'mine' }) {
  return (
    <SKFrame theme={theme} label={label}>
      <Page
        active="issues"
        title="Issues"
        sub={<span style={{ fontSize: 12, color: 'var(--sk-fgDim)' }}>acme-platform</span>}
        right={<IssuesRight/>}
      >
        <ViewTabs active={active}/>
        {children}
      </Page>
    </SKFrame>
  );
}

// ─── Variant 1 — Default "My open work", grouped by lifecycle bucket
function IssuesListDefault({ theme = 'dark' }) {
  return (
    <IssuesShell theme={theme} label="Issues · My open work (default)">
      <FilterBar chips={
        <>
          <FilterChip k="Assignee" v="Léa M" accent={<Avatar name="Léa M" color="#6f5ad9" size={14}/>}/>
          <FilterChip k="Status" op="≠" v="Done"/>
        </>
      }/>
      <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto' }}>
        {BUCKETS.map(b => (
          <React.Fragment key={b.id}>
            <GroupHeader id={b.id} label={b.label} count={b.rows.length}
              tone={b.tone} action={b.action}/>
            {b.rows.map(r => <IssueRowV2 key={r.id} {...r}/>)}
          </React.Fragment>
        ))}
        <div className="sk-row" style={{
          padding: '12px 24px', gap: 8, fontSize: 12, color: 'var(--sk-fgDim)',
        }}>
          <Icon name="check" size={11} color="var(--sk-fgDim)"/>
          12 done this week · hidden by default
          <span className="sk-link" style={{ cursor: 'pointer', marginLeft: 4 }}>Show</span>
        </div>
      </div>
    </IssuesShell>
  );
}

// ─── Variant 2 — Same view with the rich hover preview floating
function IssuesListWithHover({ theme = 'dark' }) {
  return (
    <IssuesShell theme={theme} label="Issues · hover preview">
      <FilterBar chips={
        <>
          <FilterChip k="Assignee" v="Léa M" accent={<Avatar name="Léa M" color="#6f5ad9" size={14}/>}/>
          <FilterChip k="Status" op="≠" v="Done"/>
        </>
      }/>
      <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <GroupHeader id="needs" label="Needs you" count={2} tone="danger"/>
        <IssueRowV2 {...ISSUE_ROWS.needs[0]}/>
        <div style={{ position: 'relative' }}>
          <IssueRowV2 {...ISSUE_ROWS.needs[1]} active/>
          {/* Hover preview floats below the row */}
          <div style={{ position: 'absolute', top: 26, left: 70, zIndex: 5 }}>
            <IssueHoverCard
              id="ISS-214" prio="high" status="needs" opened="5h ago"
              title="Stripe 3DS redirect lost on Safari iOS — reviewer flagged unsafe diff"
              body="Reviewer agent halted because the proposed patch widens the redirect allow-list to *.stripe.com. On Safari 17.4 mobile the 3DS sheet returns to about:blank instead of our callback. Needs human approval before the broader allow-list lands."
              labels={[{ name: 'checkout', color: '#c4ad3d' }, { name: 'security', color: '#cf5a55' }]}
              lastComment={{
                who: 'review-bot', color: REV, icon: 'bot', age: '12m ago',
                text: "Flagged: broadening redirect allow-list to *.stripe.com is risky. We could pin to checkout.stripe.com only. Want me to retry with the narrower allow-list?",
              }}
              runs={[{ id: 'run-9c1f', label: 'review · paused', tone: 'warn', pulse: true }]}
              pr={null}
            />
          </div>
        </div>
        <GroupHeader id="active" label="Active" count={3} tone="info"/>
        {ISSUE_ROWS.active.map(r => <IssueRowV2 key={r.id} {...r}/>)}
        <GroupHeader id="launchable" label="Launchable" count={2} tone="accent"
          action={<Btn kind="ghost" size="sm" icon="zap">Launch all</Btn>}/>
        {ISSUE_ROWS.launchable.map(r => <IssueRowV2 key={r.id} {...r}/>)}
      </div>
    </IssuesShell>
  );
}

// ─── Variant 3 — "All open" view, filter dropdown open
function IssuesListAllOpen({ theme = 'dark' }) {
  return (
    <IssuesShell theme={theme} label="Issues · All open (filter dropdown)" active="allopen">
      <FilterBar chips={<FilterChip k="Status" op="≠" v="Done"/>}
        extra={
          <span className="sk-row" style={{
            gap: 6, padding: '0 8px', height: 24, borderRadius: 6,
            background: 'var(--sk-raised)', border: '1px solid var(--sk-borderStrong)',
            fontSize: 12, color: 'var(--sk-fg)', position: 'relative',
          }}>
            <Icon name="plus" size={11} color="var(--sk-fgMuted)"/>
            Filter
            {/* Dropdown floating below */}
            <div style={{
              position: 'absolute', top: 28, left: 0, zIndex: 6,
              width: 240, background: 'var(--sk-overlay)',
              border: '1px solid var(--sk-border)', borderRadius: 8,
              padding: 6, boxShadow: '0 16px 36px rgba(0,0,0,.45)',
            }}>
              <div style={{ padding: '6px 8px 2px', fontSize: 10.5, color: 'var(--sk-fgDim)',
                textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>Filter by</div>
              {[
                { ic: 'agent', label: 'Assignee' },
                { ic: 'alert', label: 'Priority' },
                { ic: 'pin',   label: 'Label' },
                { ic: 'folder', label: 'Project' },
                { ic: 'layers', label: 'Repo' },
                { ic: 'loop',  label: 'Task state',  meta: 'running · needs · review · shipped' },
                { ic: 'clock', label: 'Created', meta: 'last 24h…' },
              ].map((x, i) => (
                <div key={i} className="sk-row" style={{
                  gap: 9, padding: '6px 8px', borderRadius: 5,
                  background: i === 5 ? 'var(--sk-raised)' : 'transparent',
                  fontSize: 12.5, color: 'var(--sk-fg)', cursor: 'pointer',
                }}>
                  <Icon name={x.ic} size={13} color="var(--sk-fgMuted)"/>
                  <span>{x.label}</span>
                  {x.meta && <span style={{ color: 'var(--sk-fgDim)', fontSize: 11, marginLeft: 'auto' }}>{x.meta}</span>}
                </div>
              ))}
              <div style={{ height: 1, background: 'var(--sk-border)', margin: '4px 0' }}/>
              <div className="sk-row" style={{ gap: 9, padding: '6px 8px', fontSize: 12.5,
                color: 'var(--sk-fgMuted)', cursor: 'pointer' }}>
                <Icon name="filter" size={13} color="var(--sk-fgDim)"/>
                Save current as view…
              </div>
            </div>
          </span>
        }/>
      <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto' }}>
        <GroupHeader id="needs" label="Needs human" count={4} tone="danger"/>
        {ISSUE_ROWS.needs.map(r => <IssueRowV2 key={r.id} {...r}/>)}
        <IssueRowV2 id="ISS-189" prio="urgent" status="needs" age="6h"
          title="Production DB connection pool exhausted on us-east-2"
          task={{ kind: 'needs', label: 'agent stuck' }}
          labels={[{ name: 'infra', color: '#cf5a55' }]}
          project="ops" assignee={{ name: 'senior-bot', color: SEN, icon: 'bot' }}/>
        <IssueRowV2 id="ISS-181" prio="high" status="needs" age="1d"
          title="OAuth callback fails for SSO users on slow networks"
          task={{ kind: 'needs', label: 'review me' }}
          labels={[{ name: 'auth', color: '#3a6f4e' }]}
          project="auth-service" assignee={{ name: 'C. Park', color: '#a87a1f' }}/>
        <GroupHeader id="active" label="Active" count={6} tone="info"/>
        {ISSUE_ROWS.active.map(r => <IssueRowV2 key={r.id} {...r}/>)}
        <IssueRowV2 id="ISS-180" prio="medium" status="progress" age="3d"
          title="Sentry rate-limit alerts firing for billing-worker"
          task={{ kind: 'running', label: 'implement · 8m', mono: true }}
          labels={[{ name: 'billing', color: '#5b8ec9' }]}
          project="billing-worker" assignee={{ name: 'fix-bot', color: FIX, icon: 'bot' }}/>
      </div>
    </IssuesShell>
  );
}

Object.assign(window, { IssuesListDefault, IssuesListWithHover, IssuesListAllOpen });

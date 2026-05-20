// SK Inbox — triage queue. Rows are issues/runs that need a human decision.
// Each row: status, title, why-it's-here line, age, primary action.

function InboxRow({ tone, title, ctx, age, why, sub, action, last }) {
  return (
    <div className="sk-row" style={{
      gap: 14, padding: '14px 24px', cursor: 'pointer',
      borderBottom: last ? 'none' : '1px solid var(--sk-border)',
      alignItems: 'flex-start',
    }}>
      <Dot tone={tone} size={9} style={{ marginTop: 7 }}/>
      <div className="sk-col" style={{ flex: 1, gap: 5, minWidth: 0 }}>
        <div className="sk-row" style={{ gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--sk-fg)' }}>{title}</span>
          {sub}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--sk-fgMuted)', lineHeight: 1.5 }}>{why}</div>
        <div className="sk-row" style={{ gap: 10, fontSize: 11.5, color: 'var(--sk-fgDim)', marginTop: 2 }}>
          <span className="sk-mono">{ctx}</span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span>{age}</span>
        </div>
      </div>
      <div className="sk-row" style={{ gap: 6, alignSelf: 'center' }}>
        {action}
      </div>
    </div>
  );
}

function InboxScreen({ theme = 'dark', state = 'default' }) {
  const tabs = state === 'all-clear'
    ? [{ id: 'needs', label: 'Needs you', n: 0, active: true },
       { id: 'mine', label: 'Watching', n: 6 },
       { id: 'all', label: 'All activity', n: 142 }]
    : [{ id: 'needs', label: 'Needs you', n: 4, active: true },
       { id: 'mine', label: 'Watching', n: 9 },
       { id: 'all', label: 'All activity', n: 142 }];

  return (
    <SKFrame theme={theme} label="Inbox">
      <Page
        active="inbox"
        title="Inbox"
        sub={<Pill tone="neutral" mono>4 need you</Pill>}
        right={
          <div className="sk-row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="filter">Filters</Btn>
            <Btn kind="ghost" size="sm" icon="check">Mark all read</Btn>
            <Btn kind="primary" size="sm" icon="plus">Launch task</Btn>
          </div>
        }
        counts={state === 'all-clear' ? { inbox: 0 } : { inbox: 4 }}
      >
        {/* Tabs */}
        <div className="sk-row" style={{
          padding: '0 24px', borderBottom: '1px solid var(--sk-border)',
          gap: 22, flex: 'none',
        }}>
          {tabs.map(t => (
            <div key={t.id} style={{
              padding: '12px 0', fontSize: 13, color: t.active ? 'var(--sk-fg)' : 'var(--sk-fgMuted)',
              fontWeight: t.active ? 600 : 500, cursor: 'pointer',
              borderBottom: t.active ? '2px solid var(--sk-accent)' : '2px solid transparent',
              marginBottom: -1, display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {t.label}
              <span style={{
                fontSize: 11, color: t.active ? 'var(--sk-fgMuted)' : 'var(--sk-fgDim)',
                background: 'var(--sk-raised)', padding: '0 6px', borderRadius: 999,
                fontFamily: SK.fontMono,
              }}>{t.n}</span>
            </div>
          ))}
        </div>

        {state === 'all-clear' ? (
          <div className="sk-col" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 999, background: 'var(--sk-successSoft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="check" size={26} color="var(--sk-success)"/>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--sk-fg)' }}>Inbox zero.</div>
            <div style={{ fontSize: 13, color: 'var(--sk-fgMuted)', maxWidth: 360, textAlign: 'center' }}>
              9 runs are still in flight — they'll surface here if anything needs your call.
            </div>
            <Btn kind="secondary" size="sm" icon="layers" style={{ marginTop: 6 }}>See watching tab</Btn>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }} className="sk-scrollbox">
            {/* Group header */}
            <div className="sk-row" style={{ gap: 8, padding: '14px 24px 6px', fontSize: 11,
              color: 'var(--sk-fgDim)', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 }}>
              <span>Needs a human · 4</span>
              <span style={{ flex: 1, height: 1, background: 'var(--sk-border)', marginLeft: 6 }}/>
            </div>

            <InboxRow
              tone="warn"
              title="Run paused — destructive migration"
              sub={<Pill tone="warn" dot>needs human</Pill>}
              ctx="run-7af2 · payments-api · drop_legacy_tokens migration"
              age="4 min ago"
              why="Agent flagged the migration as destructive (DROP TABLE on 4M rows). Awaiting your approval to run on production."
              action={<><Btn size="sm" icon="x">Block</Btn><Btn size="sm" kind="primary" icon="play">Review &amp; approve</Btn></>}
            />

            <InboxRow
              tone="warn"
              title="Tests pass but coverage dropped 2.4%"
              sub={<Pill tone="warn" dot>review</Pill>}
              ctx="run-7ad9 · checkout-web · ISS-184 fix stripe webhook idempotency"
              age="22 min ago"
              why="Patch is ready. CI green. Coverage went from 84.1% → 81.7% — your team rule is no more than 1% drop."
              action={<Btn size="sm" kind="primary" icon="arrowRight">Open run</Btn>}
            />

            <InboxRow
              tone="danger"
              title="Agent stuck in loop after 3 retries"
              sub={<Pill tone="danger" dot>failed</Pill>}
              ctx="run-7ac1 · billing-worker · ISS-211 stale invoice state"
              age="1 hr ago"
              why="Same test failure on attempts 1/2/3 — the agent can't progress. Suggested: change strategy or escalate to a senior agent."
              action={<><Btn size="sm" icon="x">Abandon</Btn><Btn size="sm" icon="loop">Restart…</Btn></>}
            />

            <InboxRow
              tone="warn"
              title="Conflict with main — rebase needed"
              sub={<Pill tone="warn" dot>blocked</Pill>}
              ctx="run-7a8c · marketing-site · feat/pricing-v2"
              age="2 hr ago"
              why="3 files conflict. Agent can attempt an automatic resolution or you can resolve in your editor."
              action={<><Btn size="sm" icon="external">Open in editor</Btn><Btn size="sm" kind="primary" icon="spark">Auto-resolve</Btn></>}
              last
            />

            {/* Group: Watching */}
            <div className="sk-row" style={{ gap: 8, padding: '20px 24px 6px', fontSize: 11,
              color: 'var(--sk-fgDim)', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 600 }}>
              <span>Updates worth a look · 3</span>
              <span style={{ flex: 1, height: 1, background: 'var(--sk-border)', marginLeft: 6 }}/>
            </div>

            <InboxRow
              tone="success"
              title="PR merged — payments-api #841"
              sub={<Pill tone="success" dot>shipped</Pill>}
              ctx="run-7a44 · 6 commits · 412 lines changed"
              age="34 min ago"
              why="Your reviewed run landed on main. Deploy is queued behind ci-prod-2143."
              action={<Btn size="sm" kind="ghost" icon="external">View PR</Btn>}
            />

            <InboxRow
              tone="info"
              title="Tests still failing after autofix"
              sub={<Pill tone="info" dot>retrying</Pill>}
              ctx="run-7a91 · 2 of 3 retries used"
              age="48 min ago"
              why="Will surface here as needs-human if next retry fails too."
              action={<Btn size="sm" kind="ghost" icon="arrowRight">Peek</Btn>}
            />

            <InboxRow
              tone="info"
              title="New issue assigned to you"
              sub={<Pill tone="info" dot>ISS-217</Pill>}
              ctx="opened by camille · severity P2"
              age="1 hr ago"
              why="Customer report: webhook signatures intermittently rejecting from us-east-2."
              action={<Btn size="sm" kind="primary" icon="zap">Launch task</Btn>}
              last
            />
          </div>
        )}
      </Page>
    </SKFrame>
  );
}

Object.assign(window, { InboxScreen });

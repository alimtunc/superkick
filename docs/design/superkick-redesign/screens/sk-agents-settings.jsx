// SK Agents — list of agent definitions. SK Settings — providers, runtimes, rules.

function AgentCard({ name, role, model, runs, success, tags, color }) {
  return (
    <div style={{
      background: 'var(--sk-surface)', border: '1px solid var(--sk-border)',
      borderRadius: 12, padding: 16,
    }}>
      <div className="sk-row" style={{ gap: 12, marginBottom: 12 }}>
        <Avatar name={name} color={color} size={36} icon="bot"/>
        <div className="sk-col" style={{ flex: 1, gap: 2 }}>
          <div className="sk-row" style={{ gap: 8 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--sk-fg)' }}>{name}</span>
            <Pill tone="info">{role}</Pill>
          </div>
          <span className="sk-mono" style={{ fontSize: 11.5, color: 'var(--sk-fgDim)' }}>{model}</span>
        </div>
        <Btn size="sm" kind="ghost" icon="more"/>
      </div>

      <div className="sk-row" style={{ gap: 14, padding: '10px 0', fontSize: 12,
        borderTop: '1px solid var(--sk-border)', borderBottom: '1px solid var(--sk-border)' }}>
        <div className="sk-col" style={{ gap: 1, flex: 1 }}>
          <span style={{ color: 'var(--sk-fgDim)', fontSize: 11 }}>RUNS · 30d</span>
          <span className="sk-mono" style={{ color: 'var(--sk-fg)', fontSize: 14, fontWeight: 600 }}>{runs}</span>
        </div>
        <div className="sk-col" style={{ gap: 1, flex: 1 }}>
          <span style={{ color: 'var(--sk-fgDim)', fontSize: 11 }}>SUCCESS</span>
          <div className="sk-row" style={{ gap: 6 }}>
            <span className="sk-mono" style={{ color: 'var(--sk-fg)', fontSize: 14, fontWeight: 600 }}>{success}%</span>
            <Spark data={[3,4,3,5,4,6,5,7,6,7,8,7]} color="var(--sk-success)" w={48}/>
          </div>
        </div>
      </div>

      <div className="sk-row" style={{ gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {tags.map(t => <Pill key={t} tone="neutral">{t}</Pill>)}
      </div>
    </div>
  );
}

function AgentsScreen({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="Agents">
      <Page
        active="agents"
        title="Agents"
        sub={<Pill tone="neutral" mono>6 active · 2 paused</Pill>}
        right={
          <div className="sk-row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="filter">All teams</Btn>
            <Btn kind="primary" size="sm" icon="plus">New agent</Btn>
          </div>
        }
      >
        <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <AgentCard name="fix-bot" role="autofix" model="claude-sonnet-4.5"
              runs={147} success={92} color="#2c5f7d"
              tags={['repos: 4', 'PR-auto', 'budget $5']}/>
            <AgentCard name="review-bot" role="reviewer" model="claude-sonnet-4.5"
              runs={241} success={87} color="#3a6f4e"
              tags={['repos: all', 'read-only', 'fast']}/>
            <AgentCard name="senior-bot" role="escalation" model="claude-opus-4.5"
              runs={28} success={75} color="#a05a3a"
              tags={['after 2 retries', 'PR-auto', 'budget $25']}/>
            <AgentCard name="docs-bot" role="docs" model="claude-haiku-4.5"
              runs={89} success={98} color="#6f5ad9"
              tags={['docs/ only', 'PR-auto', 'budget $0.50']}/>
            <AgentCard name="dep-bot" role="dependencies" model="claude-haiku-4.5"
              runs={64} success={94} color="#a08a3a"
              tags={['weekly cron', 'package.json + go.mod']}/>
            <AgentCard name="triage-bot" role="triage" model="claude-haiku-4.5"
              runs={312} success={96} color="#557799"
              tags={['inbound issues', 'read-only', 'classify only']}/>
          </div>
        </div>
      </Page>
    </SKFrame>
  );
}

function SettingsRow({ label, hint, children, last }) {
  return (
    <div className="sk-row" style={{
      padding: '16px 0', borderBottom: last ? 'none' : '1px solid var(--sk-border)',
      gap: 24, alignItems: 'flex-start',
    }}>
      <div className="sk-col" style={{ width: 260, flex: 'none', gap: 3 }}>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--sk-fg)' }}>{label}</span>
        {hint && <span style={{ fontSize: 12, color: 'var(--sk-fgDim)', lineHeight: 1.5 }}>{hint}</span>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function SettingsScreen({ theme = 'dark' }) {
  const sideItems = [
    'General', 'Providers', 'Runtimes', 'Sandboxes',
    'Rules & guardrails', 'Budgets', 'Webhooks', 'API tokens', 'Members',
  ];
  return (
    <SKFrame theme={theme} label="Settings">
      <Page active="settings" title="Settings · Rules &amp; guardrails">
        <div className="sk-row" style={{ flex: 1, minHeight: 0 }}>
          {/* Settings sidebar */}
          <div className="sk-col" style={{
            width: 200, flex: 'none', padding: '18px 12px', gap: 1,
            borderRight: '1px solid var(--sk-border)', background: 'var(--sk-surface)',
          }}>
            {sideItems.map((t, i) => {
              const on = t === 'Rules & guardrails';
              return (
                <div key={t} style={{
                  padding: '7px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer',
                  background: on ? 'var(--sk-raised)' : 'transparent',
                  color: on ? 'var(--sk-fg)' : 'var(--sk-fgMuted)',
                  fontWeight: on ? 500 : 400,
                }}>{t}</div>
              );
            })}
          </div>

          <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
            <div style={{ maxWidth: 780 }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--sk-fg)', marginBottom: 6 }}>
                Rules &amp; guardrails
              </div>
              <div style={{ fontSize: 13, color: 'var(--sk-fgMuted)', marginBottom: 22, lineHeight: 1.55 }}>
                Conditions that pause an agent and surface it in your Inbox. Defined as plain English;
                Superkick compiles them to checks per run.
              </div>

              <SettingsRow
                label="Pause on destructive SQL"
                hint="Agent halts before running DROP, TRUNCATE, or DELETE without a WHERE clause."
              >
                <div className="sk-row" style={{ gap: 8 }}>
                  <Pill tone="success" dot>on</Pill>
                  <Pill tone="neutral">applies to: 4 repos</Pill>
                  <span style={{ flex: 1 }}/>
                  <Btn size="sm" kind="ghost" icon="more"/>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Coverage drop > 1%"
                hint="If tests pass but coverage drops more than 1%, the run is sent to your Inbox before opening a PR."
              >
                <div className="sk-row" style={{ gap: 8 }}>
                  <Pill tone="success" dot>on</Pill>
                  <Pill tone="neutral">applies to: all repos</Pill>
                  <span style={{ flex: 1 }}/>
                  <Btn size="sm" kind="ghost" icon="more"/>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Touching //security tagged code"
                hint="Pause before modifying any line within a function tagged with `// security` or a file under `auth/`, `crypto/`."
              >
                <div className="sk-row" style={{ gap: 8 }}>
                  <Pill tone="success" dot>on</Pill>
                  <Pill tone="neutral">applies to: all repos</Pill>
                  <span style={{ flex: 1 }}/>
                  <Btn size="sm" kind="ghost" icon="more"/>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Loop detection — same failure 3×"
                hint="If the same test or check fails on 3 consecutive retries, escalate to senior-bot or send to Inbox."
              >
                <div className="sk-row" style={{ gap: 8 }}>
                  <Pill tone="success" dot>on</Pill>
                  <Pill tone="neutral">action: escalate to senior-bot</Pill>
                  <span style={{ flex: 1 }}/>
                  <Btn size="sm" kind="ghost" icon="more"/>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Budget exceeded"
                hint="Pause when a run consumes more than its set budget."
                last
              >
                <div className="sk-row" style={{ gap: 8 }}>
                  <Pill tone="warn" dot>off</Pill>
                  <span style={{ flex: 1 }}/>
                  <Btn size="sm" kind="ghost" icon="more"/>
                </div>
              </SettingsRow>

              <Btn size="md" kind="secondary" icon="plus" style={{ marginTop: 20 }}>Add a rule</Btn>
            </div>
          </div>
        </div>
      </Page>
    </SKFrame>
  );
}

Object.assign(window, { AgentsScreen, SettingsScreen });

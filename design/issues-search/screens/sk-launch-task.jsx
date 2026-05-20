// SK Launch Task — two surfaces.
// 1. LaunchTaskLauncher — empty composer (the "what should we work on?" page)
// 2. LaunchTaskFeed — live feed of an active task (running or needs-human)
//
// This replaces the dual launcher (header button + sidebar field) with ONE
// composer surface that lives at /tasks/new and is the destination of every
// "launch task" button in the product.

function ChipPicker({ icon, label, value, dim, ghost }) {
  return (
    <div className="sk-row" style={{
      gap: 7, padding: '6px 10px', borderRadius: 7,
      background: ghost ? 'transparent' : 'var(--sk-raised)',
      border: `1px solid ${ghost ? 'var(--sk-border)' : 'transparent'}`,
      borderStyle: ghost ? 'dashed' : 'solid',
      fontSize: 12.5, cursor: 'pointer',
    }}>
      <Icon name={icon} size={13} color={dim ? 'var(--sk-fgDim)' : 'var(--sk-fgMuted)'}/>
      <span style={{ color: 'var(--sk-fgDim)' }}>{label}</span>
      <span style={{ color: dim ? 'var(--sk-fgDim)' : 'var(--sk-fg)', fontWeight: 500 }}>{value}</span>
      <Icon name="chevDown" size={11} color="var(--sk-fgDim)"/>
    </div>
  );
}

function LaunchTaskLauncher({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="Launch Task — empty">
      <Page
        active="tasks"
        crumbs={['Tasks', 'New']}
        title="What should we work on?"
        right={
          <div className="sk-row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="history">Recent tasks</Btn>
            <Btn kind="ghost" size="sm" icon="doc">Templates</Btn>
          </div>
        }
      >
        <div className="sk-col" style={{
          flex: 1, alignItems: 'center', justifyContent: 'center',
          padding: '0 24px', gap: 18,
        }}>
          <div className="sk-col" style={{ width: '100%', maxWidth: 720, gap: 12 }}>
            {/* Composer */}
            <div style={{
              background: 'var(--sk-surface)', border: '1px solid var(--sk-border)',
              borderRadius: 14, padding: 18, boxShadow: '0 1px 0 rgba(0,0,0,.04)',
            }}>
              <div style={{
                minHeight: 80, fontSize: 16, color: 'var(--sk-fg)',
                fontWeight: 500, lineHeight: 1.5,
              }}>
                <span style={{ color: 'var(--sk-fg)' }}>Investigate the webhook signature rejection from us-east-2.</span>
                <span style={{ color: 'var(--sk-fgDim)' }}> Customer reports started yesterday around 18:00 UTC. Reproduce, find root cause, propose a fix.</span>
                <span style={{
                  display: 'inline-block', width: 1.5, height: 18, background: 'var(--sk-accent)',
                  marginLeft: 1, verticalAlign: 'middle',
                }}/>
              </div>
              <div className="sk-row" style={{
                gap: 6, paddingTop: 12, marginTop: 12, borderTop: '1px solid var(--sk-border)', flexWrap: 'wrap',
              }}>
                <ChipPicker icon="folder" label="repo" value="payments-api"/>
                <ChipPicker icon="bot" label="agent" value="fix-bot"/>
                <ChipPicker icon="branch" label="base" value="main"/>
                <ChipPicker icon="layers" label="sandbox" value="ephemeral-2"/>
                <ChipPicker icon="zap" label="budget" value="$5.00"/>
                <span style={{ flex: 1 }}/>
                <Btn size="sm" kind="ghost" icon="link"/>
                <Btn size="sm" kind="ghost" icon="doc"/>
                <Btn size="md" kind="primary" iconRight="arrowRight">Launch</Btn>
              </div>
            </div>

            {/* Hints */}
            <div className="sk-row" style={{ gap: 12, paddingLeft: 4, fontSize: 11.5, color: 'var(--sk-fgDim)' }}>
              <span><Kbd>⌘</Kbd>+<Kbd>↵</Kbd> launch</span>
              <span><Kbd>⌥</Kbd>+<Kbd>P</Kbd> pick template</span>
              <span><Kbd>@</Kbd> reference an issue, run or file</span>
              <span style={{ marginLeft: 'auto' }}>Cost estimate: <span style={{ color: 'var(--sk-fg)' }} className="sk-mono">~$0.40</span></span>
            </div>

            {/* Suggested starts */}
            <div className="sk-col" style={{ gap: 8, marginTop: 22 }}>
              <div style={{ fontSize: 11, color: 'var(--sk-fgDim)', textTransform: 'uppercase',
                letterSpacing: 0.8, fontWeight: 600, paddingLeft: 4 }}>Suggested starts</div>
              {[
                { ic: 'issue', t: 'Triage ISS-217 — webhook rejection in us-east-2', s: 'Camille opened this 1h ago · P2' },
                { ic: 'spark', t: 'Address review comments on PR #1483', s: '3 unresolved threads from senior-reviewer' },
                { ic: 'doc',   t: 'Document the new webhook retry behavior', s: 'Suggested after run-7a6c landed yesterday' },
              ].map((s, i) => (
                <div key={i} className="sk-row" style={{
                  gap: 12, padding: '11px 14px',
                  background: 'var(--sk-surface)', border: '1px solid var(--sk-border)',
                  borderRadius: 9, cursor: 'pointer',
                }}>
                  <Icon name={s.ic} size={15} color="var(--sk-fgMuted)"/>
                  <div className="sk-col" style={{ flex: 1, gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'var(--sk-fg)', fontWeight: 500 }}>{s.t}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--sk-fgDim)' }}>{s.s}</span>
                  </div>
                  <Icon name="arrowRight" size={14} color="var(--sk-fgDim)"/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Page>
    </SKFrame>
  );
}

// Evidence card — the canonical block in the feed. Variants: tool, edit, test, search, ask.
function Evidence({ kind, title, meta, body, badge, accent }) {
  const accentColor = {
    tool: 'var(--sk-info)', edit: 'var(--sk-accent)', test: 'var(--sk-success)',
    search: 'var(--sk-fgDim)', ask: 'var(--sk-warn)', stuck: 'var(--sk-danger)',
  }[kind] || 'var(--sk-fgDim)';
  return (
    <div style={{
      borderLeft: `2px solid ${accentColor}`, paddingLeft: 14, marginBottom: 18,
    }}>
      <div className="sk-row" style={{ gap: 8, marginBottom: body ? 8 : 0 }}>
        <Icon name={
          kind === 'tool' ? 'terminal' : kind === 'edit' ? 'doc' :
          kind === 'test' ? 'check' : kind === 'search' ? 'search' :
          kind === 'stuck' ? 'alert' : 'comment'
        } size={13} color={accentColor}/>
        <span style={{ fontSize: 13, color: 'var(--sk-fg)', fontWeight: 500 }}>{title}</span>
        {badge}
        <span style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: 'var(--sk-fgDim)' }} className="sk-mono">{meta}</span>
      </div>
      {body}
    </div>
  );
}

function LaunchTaskFeed({ theme = 'dark', state = 'running' }) {
  return (
    <SKFrame theme={theme} label="Launch Task — feed">
      <Page
        active="tasks"
        crumbs={['Tasks', 'run-7af2']}
        title="Investigate webhook signature rejection in us-east-2"
        sub={
          <div className="sk-row" style={{ gap: 6 }}>
            <Pill tone="info" mono>fix-bot</Pill>
            <Pill tone={state === 'needs-human' ? 'warn' : 'info'} dot pulse={state === 'running'}>
              {state === 'needs-human' ? 'paused' : 'running'}
            </Pill>
            <span style={{ fontSize: 12, color: 'var(--sk-fgDim)' }}>· 8m elapsed · 14 steps</span>
          </div>
        }
        right={
          <div className="sk-row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon={state === 'needs-human' ? 'play' : 'pause'}>
              {state === 'needs-human' ? 'Resume' : 'Pause'}
            </Btn>
            <Btn kind="ghost" size="sm" icon="stop">Stop</Btn>
            <Btn kind="ghost" size="sm" icon="more"/>
          </div>
        }
      >
        {/* Plan strip — collapsible, shows progress at a glance */}
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--sk-border)',
          background: 'var(--sk-surface)' }}>
          <div className="sk-row" style={{ gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--sk-fgDim)', textTransform: 'uppercase',
              letterSpacing: 0.8, fontWeight: 600 }}>Plan</span>
            <span style={{ flex: 1 }}/>
            <span style={{ fontSize: 11.5, color: 'var(--sk-fgMuted)' }}>3 of 5 done</span>
          </div>
          <div className="sk-row" style={{ gap: 6 }}>
            {[
              { s: 'done', t: 'Reproduce' },
              { s: 'done', t: 'Find root cause' },
              { s: 'done', t: 'Write failing test' },
              { s: state === 'needs-human' ? 'paused' : 'active', t: 'Propose fix' },
              { s: 'pending', t: 'Open PR' },
            ].map((step, i) => {
              const c = step.s === 'done' ? 'var(--sk-success)' :
                       step.s === 'active' ? 'var(--sk-info)' :
                       step.s === 'paused' ? 'var(--sk-warn)' : 'var(--sk-borderStrong)';
              return (
                <div key={i} className="sk-row" style={{
                  gap: 6, padding: '6px 10px', borderRadius: 6,
                  background: step.s !== 'pending' ? 'var(--sk-raised)' : 'transparent',
                  border: step.s !== 'pending' ? '1px solid var(--sk-border)' : '1px dashed var(--sk-border)',
                  fontSize: 12,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: c }}/>
                  <span style={{ color: step.s === 'pending' ? 'var(--sk-fgDim)' : 'var(--sk-fg)' }}>{step.t}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feed */}
        <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: '18px 24px' }}>
          <Evidence kind="search" title="Searched repo for webhook signature logic" meta="0.3s"
            body={<div style={{ fontSize: 12.5, color: 'var(--sk-fgMuted)' }}>
              4 matches across 2 files. <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>internal/webhook/verify.go</span> looks canonical.
            </div>}/>

          <Evidence kind="tool" title="Ran: go test ./internal/webhook/ -run Signature -v" meta="0.4s"
            body={<div style={{ padding: 12, background: 'var(--sk-code)', borderRadius: 6, fontFamily: SK.fontMono,
              fontSize: 11.5, color: 'var(--sk-codeFg)', lineHeight: 1.55 }}>
              === RUN   TestWebhookSignatureValid<br/>
              <span style={{ color: 'var(--sk-success)' }}>--- PASS</span>: TestWebhookSignatureValid (0.01s)<br/>
              === RUN   TestWebhookSignatureExpired<br/>
              <span style={{ color: 'var(--sk-success)' }}>--- PASS</span>: TestWebhookSignatureExpired (0.01s)<br/>
              <span style={{ color: 'var(--sk-fgDim)' }}>PASS · ok  payments-api/internal/webhook  0.04s</span>
            </div>}/>

          <Evidence kind="ask" title="No coverage for clock-skew case — should I add a failing test first?" meta="auto-decided"
            badge={<Pill tone="success">yes — proceeded</Pill>}/>

          <Evidence kind="edit" title="Wrote tests/webhook_signature_test.go" meta="+38 −0"
            body={<div className="sk-row" style={{ gap: 8 }}>
              <Btn size="sm" kind="ghost" icon="doc">View diff</Btn>
              <Btn size="sm" kind="ghost" icon="external">Open in editor</Btn>
            </div>}/>

          <Evidence kind="test" title="3,418 tests passed · 1 new failure as expected" meta="14.2s"
            body={<div style={{ fontSize: 12.5, color: 'var(--sk-fgMuted)' }}>
              <span className="sk-mono" style={{ color: 'var(--sk-danger)' }}>FAIL TestWebhookSignatureDriftedClock</span> — reproduces the customer report.
            </div>}/>

          <Evidence kind="edit" title="Edited internal/webhook/verify.go" meta="+11 −3"
            body={
              <pre style={{ margin: 0, padding: '10px 12px', background: 'var(--sk-code)',
                borderRadius: 6, fontFamily: SK.fontMono, fontSize: 11.5, color: 'var(--sk-codeFg)',
                lineHeight: 1.55, overflow: 'hidden' }}>
{`-  if math.Abs(float64(now-ts)) > 5 { return ErrSignatureTooOld }
+  skew := math.Abs(float64(now-ts))
+  metrics.WebhookSkew.Observe(skew)
+  if skew > clockSkewToleranceSeconds {
+    return fmt.Errorf("%w: skew=%fs", ErrSignatureTooOld, skew)
+  }`}
              </pre>
            }/>

          <Evidence kind="test" title="3,419 tests passed · coverage 84.6% (+0.3%)" meta="14.8s"
            badge={<Pill tone="success" dot>green</Pill>}/>

          {state === 'needs-human' ? (
            <Evidence kind="stuck"
              title="Paused — security-tagged constant changed"
              meta="3m ago"
              badge={<Pill tone="warn" dot>needs you</Pill>}
              body={
                <div style={{ padding: 14, background: 'var(--sk-warnSoft)', borderRadius: 8,
                  border: '1px solid var(--sk-warn)' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--sk-fgMuted)', marginBottom: 10, lineHeight: 1.55 }}>
                    Your team rule requires human approval before opening a PR that changes a
                    constant tagged <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>//security</span>.
                    Proposed value: <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>30s</span> (was <span className="sk-mono">5s</span>).
                  </div>
                  <div className="sk-row" style={{ gap: 8 }}>
                    <Btn size="sm" kind="danger" icon="x">Block</Btn>
                    <Btn size="sm" icon="comment">Suggest a different approach</Btn>
                    <Btn size="sm" kind="primary" icon="check">Approve, open PR</Btn>
                  </div>
                </div>
              }/>
          ) : (
            <Evidence kind="tool" title="Generating PR description…" meta="now"
              badge={<Pill tone="info" dot pulse>running</Pill>}
              body={<div style={{ fontSize: 12.5, color: 'var(--sk-fgMuted)' }}>
                Summarizing 4 commits and 2 modified files.
              </div>}/>
          )}
        </div>
      </Page>
    </SKFrame>
  );
}

Object.assign(window, { LaunchTaskLauncher, LaunchTaskFeed });

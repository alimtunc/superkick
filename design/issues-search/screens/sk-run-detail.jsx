// SK Run Detail — supervision view. Three states: running, needs-human, completed.
// Three regions: Conversation (left, primary), Workspace (right), Footer (controls).

function RunChat({ time, role, who, children }) {
  const isAgent = role === 'agent';
  const isUser = role === 'user';
  return (
    <div className="sk-row" style={{ gap: 10, alignItems: 'flex-start' }}>
      {isAgent
        ? <Avatar name="fix" color="#2c5f7d" size={24} icon="bot"/>
        : <Avatar name={who} color="#6f5ad9" size={24}/>}
      <div className="sk-col" style={{ flex: 1, gap: 4, minWidth: 0 }}>
        <div className="sk-row" style={{ gap: 8, fontSize: 12 }}>
          <span style={{ color: 'var(--sk-fg)', fontWeight: 500 }}>{who}</span>
          {isAgent && <Pill tone="info">agent</Pill>}
          <span style={{ marginLeft: 'auto', color: 'var(--sk-fgDim)', fontSize: 11 }}>{time}</span>
        </div>
        <div style={{
          fontSize: 13, color: 'var(--sk-fg)', lineHeight: 1.55,
          background: isUser ? 'var(--sk-raised)' : 'transparent',
          padding: isUser ? '10px 12px' : 0,
          borderRadius: isUser ? 8 : 0,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function RunDetail({ theme = 'dark', state = 'running' }) {
  const isCompleted = state === 'completed';
  const isNeedsHuman = state === 'needs-human';
  return (
    <SKFrame theme={theme} label="Run Detail">
      <Page
        active="runs"
        crumbs={['Runs', 'run-7af2']}
        title="run-7af2 · webhook signature investigation"
        sub={
          <div className="sk-row" style={{ gap: 6 }}>
            <Pill tone="info" mono>fix-bot</Pill>
            <Pill tone={isCompleted ? 'success' : isNeedsHuman ? 'warn' : 'info'}
              dot pulse={state === 'running'}>
              {isCompleted ? 'shipped' : isNeedsHuman ? 'needs human' : 'running'}
            </Pill>
            <span style={{ fontSize: 12, color: 'var(--sk-fgDim)' }}>· 12m elapsed · $0.42 used</span>
          </div>
        }
        right={
          <div className="sk-row" style={{ gap: 8 }}>
            {!isCompleted && <Btn kind="ghost" size="sm" icon={isNeedsHuman ? 'play' : 'pause'}>
              {isNeedsHuman ? 'Resume' : 'Pause'}</Btn>}
            <Btn kind="ghost" size="sm" icon="terminal">Shell</Btn>
            <Btn kind="ghost" size="sm" icon="external">Open sandbox</Btn>
            <Btn kind="ghost" size="sm" icon="more"/>
          </div>
        }
      >
        {/* Needs-human banner — sticky, never scrolls past */}
        {isNeedsHuman && (
          <div style={{
            padding: '12px 24px', background: 'var(--sk-warnSoft)',
            borderBottom: '1px solid var(--sk-warn)', flex: 'none',
          }}>
            <div className="sk-row" style={{ gap: 12 }}>
              <Icon name="alert" size={16} color="var(--sk-warn)"/>
              <div className="sk-col" style={{ flex: 1, gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sk-warn)' }}>
                  Paused — security-tagged constant changed
                </span>
                <span style={{ fontSize: 12, color: 'var(--sk-fgMuted)' }}>
                  Approve to continue, suggest a different approach, or block this change.
                </span>
              </div>
              <Btn size="sm" kind="danger" icon="x">Block</Btn>
              <Btn size="sm" icon="comment">Suggest…</Btn>
              <Btn size="sm" kind="primary" icon="check">Approve</Btn>
            </div>
          </div>
        )}

        {isCompleted && (
          <div style={{
            padding: '12px 24px', background: 'var(--sk-successSoft)',
            borderBottom: '1px solid var(--sk-success)', flex: 'none',
          }}>
            <div className="sk-row" style={{ gap: 12 }}>
              <Icon name="check" size={16} color="var(--sk-success)"/>
              <div className="sk-col" style={{ flex: 1, gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sk-success)' }}>
                  Merged to main · 12m end-to-end
                </span>
                <span style={{ fontSize: 12, color: 'var(--sk-fgMuted)' }}>
                  PR #1483 by fix-bot · approved by you, senior-reviewer · deploying in pipeline ci-prod-2143
                </span>
              </div>
              <Btn size="sm" kind="ghost" icon="external">View PR</Btn>
              <Btn size="sm" kind="ghost" icon="loop">Run on another branch</Btn>
            </div>
          </div>
        )}

        <div className="sk-row" style={{ flex: 1, minHeight: 0 }}>
          {/* LEFT — conversation */}
          <div className="sk-col" style={{ flex: 1, minWidth: 0,
            borderRight: '1px solid var(--sk-border)' }}>
            <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto',
              padding: '18px 24px 12px', gap: 18, display: 'flex', flexDirection: 'column' }}>

              <RunChat time="12m ago" role="user" who="Léa">
                Investigate the webhook signature rejection from us-east-2. Reproduce, find root
                cause, propose a fix. Customer reports started yesterday around 18:00 UTC.
              </RunChat>

              <RunChat time="11m ago" role="agent" who="fix-bot">
                <div style={{ marginBottom: 8 }}>
                  Here's my plan:
                </div>
                <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--sk-fgMuted)' }}>
                  <li style={{ marginBottom: 2 }}>Reproduce the failure with a test</li>
                  <li style={{ marginBottom: 2 }}>Find which code path rejects the signature</li>
                  <li style={{ marginBottom: 2 }}>Propose a minimal fix + an observability hook</li>
                  <li>Open the PR when CI is green</li>
                </ol>
              </RunChat>

              <RunChat time="10m ago" role="agent" who="fix-bot">
                Searched the repo for signature verification. The canonical path is{' '}
                <code className="sk-mono" style={{ background: 'var(--sk-raised)', padding: '1px 5px',
                  borderRadius: 4, fontSize: 12 }}>internal/webhook/verify.go</code>. Going to write
                a failing test first.
              </RunChat>

              <RunChat time="8m ago" role="agent" who="fix-bot">
                Reproduced — NTP drift &gt;5s causes the signature timestamp check to reject. Looks
                like the kernel patch on Tuesday made some worker pods drift up to 12s. Patching now.
              </RunChat>

              <RunChat time="5m ago" role="agent" who="fix-bot">
                Patch is ready. Widened tolerance to ±30s, added a histogram metric for the skew,
                and a test for the boundary. Coverage went up 0.3%.
                {isNeedsHuman && (
                  <div style={{
                    marginTop: 10, padding: 10, background: 'var(--sk-warnSoft)',
                    borderRadius: 8, fontSize: 12.5, color: 'var(--sk-warn)',
                    border: '1px solid var(--sk-warn)',
                  }}>
                    <strong>I'm pausing</strong> — the constant I touched is tagged
                    <code className="sk-mono" style={{ marginLeft: 4 }}>//security</code> so I need
                    your OK before opening the PR.
                  </div>
                )}
              </RunChat>

              {isCompleted && (
                <RunChat time="2m ago" role="agent" who="fix-bot">
                  PR #1483 is open. CI passed on the first try. Merged after your approval. Deploy
                  is now queued behind ci-prod-2143.
                </RunChat>
              )}
            </div>

            {/* Composer */}
            <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--sk-border)',
              flex: 'none', background: 'var(--sk-surface)' }}>
              <div style={{
                border: '1px solid var(--sk-border)', borderRadius: 10, padding: 10,
                background: 'var(--sk-void)',
              }}>
                <div style={{ minHeight: 38, fontSize: 13, color: 'var(--sk-fgDim)', padding: '4px 4px' }}>
                  Reply to fix-bot…
                </div>
                <div className="sk-row" style={{ gap: 6 }}>
                  <Btn size="sm" kind="ghost" icon="link"/>
                  <Btn size="sm" kind="ghost" icon="terminal"/>
                  <Btn size="sm" kind="ghost" icon="layers">/ commands</Btn>
                  <span style={{ flex: 1 }}/>
                  <Btn size="sm" kind="primary" icon="send">Send</Btn>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT — workspace */}
          <div className="sk-col" style={{ width: 360, flex: 'none', background: 'var(--sk-surface)' }}>
            {/* Tabs */}
            <div className="sk-row" style={{
              padding: '0 14px', borderBottom: '1px solid var(--sk-border)', gap: 18, flex: 'none',
            }}>
              {[
                { id: 'changes', label: 'Changes', n: 2, active: true },
                { id: 'shell', label: 'Shell', n: null },
                { id: 'tools', label: 'Tools', n: 14 },
                { id: 'context', label: 'Context', n: 7 },
              ].map(t => (
                <div key={t.id} style={{
                  padding: '11px 0', fontSize: 12, fontWeight: t.active ? 600 : 500,
                  color: t.active ? 'var(--sk-fg)' : 'var(--sk-fgMuted)',
                  borderBottom: t.active ? '2px solid var(--sk-accent)' : '2px solid transparent',
                  marginBottom: -1, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {t.label}
                  {t.n != null && <span className="sk-mono" style={{ fontSize: 10.5, color: 'var(--sk-fgDim)' }}>{t.n}</span>}
                </div>
              ))}
            </div>

            <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: 14 }}>
              {/* File list */}
              {[
                { f: 'internal/webhook/verify.go', a: '+11', d: '−3' },
                { f: 'tests/webhook_signature_test.go', a: '+38', d: '−0' },
              ].map(f => (
                <div key={f.f} style={{ marginBottom: 14 }}>
                  <div className="sk-row" style={{ gap: 8, marginBottom: 7 }}>
                    <Icon name="doc" size={13} color="var(--sk-fgDim)"/>
                    <span className="sk-mono" style={{ fontSize: 12, color: 'var(--sk-fg)', flex: 1,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.f}</span>
                    <span className="sk-mono" style={{ fontSize: 11, color: 'var(--sk-success)' }}>{f.a}</span>
                    <span className="sk-mono" style={{ fontSize: 11, color: 'var(--sk-danger)' }}>{f.d}</span>
                  </div>
                  <div style={{ height: 4, background: 'var(--sk-raised)', borderRadius: 2,
                    overflow: 'hidden', display: 'flex' }}>
                    <span style={{ width: '70%', background: 'var(--sk-success)' }}/>
                    <span style={{ width: '30%', background: 'var(--sk-danger)' }}/>
                  </div>
                </div>
              ))}

              {/* Diff preview */}
              <div style={{
                marginTop: 8, border: '1px solid var(--sk-border)', borderRadius: 8,
                background: 'var(--sk-code)', overflow: 'hidden',
              }}>
                <div className="sk-row" style={{ padding: '6px 10px', borderBottom: '1px solid var(--sk-border)',
                  fontSize: 11, color: 'var(--sk-fgDim)', fontFamily: SK.fontMono }}>
                  verify.go · L41-47
                </div>
                <pre style={{ margin: 0, padding: '8px 10px', fontFamily: SK.fontMono, fontSize: 11,
                  color: 'var(--sk-codeFg)', lineHeight: 1.6 }}>
{`  if err != nil { return err }
`}<span style={{ color: 'var(--sk-danger)', background: 'rgba(207,90,85,.08)', display: 'block' }}>{`-  if math.Abs(float64(now-ts)) > 5 {`}</span>
<span style={{ color: 'var(--sk-success)', background: 'rgba(78,166,116,.08)', display: 'block' }}>{`+  skew := math.Abs(float64(now-ts))
+  metrics.WebhookSkew.Observe(skew)
+  if skew > clockSkewToleranceSeconds {`}</span>
{`    return ErrSignatureTooOld
  }`}
                </pre>
              </div>

              <Btn size="sm" kind="ghost" icon="external" style={{ marginTop: 12 }} full>Open full diff</Btn>

              {/* Resources */}
              <div className="sk-hr" style={{ margin: '18px 0 14px' }}/>
              <div style={{ fontSize: 11, color: 'var(--sk-fgDim)', textTransform: 'uppercase',
                letterSpacing: 0.8, fontWeight: 600, marginBottom: 8 }}>Resources</div>
              <div className="sk-col" style={{ gap: 7, fontSize: 12 }}>
                {[
                  ['terminal', 'Sandbox · ephemeral-2'],
                  ['github', 'Branch · fix/webhook-skew'],
                  ['pr', isCompleted ? 'PR #1483 · merged' : 'PR not yet opened'],
                  ['zap', '$0.42 of $5.00 budget'],
                ].map(([ic, t]) => (
                  <div key={t} className="sk-row" style={{ gap: 7, color: 'var(--sk-fgMuted)' }}>
                    <Icon name={ic} size={12} color="var(--sk-fgDim)"/>{t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Page>
    </SKFrame>
  );
}

Object.assign(window, { RunDetail });

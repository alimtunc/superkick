// SK Issue Detail — recomposed.
// Single column: header → context strip → activity feed (canonical timeline).
// Right rail collapses below 1200px (not modeled here — single canonical screen).

function ActivityNode({ time, who, role, kind, children, link }) {
  const roleColor = {
    user: '#6f5ad9',
    agent: 'var(--sk-info)',
    system: 'var(--sk-fgDim)',
    success: 'var(--sk-success)',
    warn: 'var(--sk-warn)',
  }[role] || 'var(--sk-fgDim)';
  return (
    <div className="sk-row" style={{ gap: 12, alignItems: 'flex-start', position: 'relative' }}>
      <div className="sk-col" style={{ alignItems: 'center', gap: 2, flex: 'none', width: 22 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 999,
          background: 'var(--sk-surface)', border: `1.5px solid ${roleColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: roleColor,
        }}>
          {kind === 'agent' && <Icon name="bot" size={11} color={roleColor}/>}
          {kind === 'user' && <Avatar name={who} color="#6f5ad9" size={20}/>}
          {kind === 'commit' && <Icon name="branch" size={11} color={roleColor}/>}
          {kind === 'check' && <Icon name="check" size={11} color={roleColor}/>}
          {kind === 'flag' && <Icon name="alert" size={11} color={roleColor}/>}
          {kind === 'system' && <Icon name="clock" size={11} color={roleColor}/>}
          {kind === 'pr' && <Icon name="pr" size={11} color={roleColor}/>}
        </span>
        <span style={{ flex: 1, width: 1.5, background: 'var(--sk-border)', minHeight: 8 }}/>
      </div>
      <div className="sk-col" style={{ flex: 1, paddingBottom: 22, gap: 6, minWidth: 0 }}>
        <div className="sk-row" style={{ gap: 8, fontSize: 12 }}>
          <span style={{ color: 'var(--sk-fg)', fontWeight: 500 }}>{who}</span>
          <span style={{ color: 'var(--sk-fgDim)' }}>{link}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--sk-fgDim)', fontSize: 11.5 }}>{time}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function IssueDetail({ theme = 'dark', state = 'running' }) {
  return (
    <SKFrame theme={theme} label="Issue Detail">
      <Page
        active="issues"
        crumbs={['Issues', 'payments-api']}
        title="Webhook signature intermittently rejected from us-east-2"
        sub={
          <div className="sk-row" style={{ gap: 6 }}>
            <span className="sk-mono" style={{ fontSize: 12, color: 'var(--sk-fgDim)' }}>ISS-217</span>
            <Pill tone="warn" mono>P2</Pill>
            <Pill tone={state === 'needs-human' ? 'warn' : 'info'} dot>
              {state === 'needs-human' ? 'needs human' : 'in progress'}
            </Pill>
          </div>
        }
        right={
          <div className="sk-row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="external">View on GitHub</Btn>
            <Btn kind="ghost" size="sm" icon="more"/>
            <Btn kind="primary" size="sm" icon="zap">Launch task…</Btn>
          </div>
        }
      >
        {/* Context strip — facts at a glance, no decoration */}
        <div className="sk-row" style={{
          padding: '14px 24px', gap: 26, borderBottom: '1px solid var(--sk-border)',
          background: 'var(--sk-surface)', flex: 'none', fontSize: 12.5,
        }}>
          <div className="sk-col" style={{ gap: 3 }}>
            <span style={{ color: 'var(--sk-fgDim)', fontSize: 11 }}>REPO</span>
            <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>payments-api</span>
          </div>
          <div className="sk-col" style={{ gap: 3 }}>
            <span style={{ color: 'var(--sk-fgDim)', fontSize: 11 }}>OPENED BY</span>
            <div className="sk-row" style={{ gap: 6 }}>
              <Avatar name="Camille R" color="#a05a3a" size={16}/>
              <span style={{ color: 'var(--sk-fg)' }}>camille</span>
              <span style={{ color: 'var(--sk-fgDim)' }}>· 1h ago</span>
            </div>
          </div>
          <div className="sk-col" style={{ gap: 3 }}>
            <span style={{ color: 'var(--sk-fgDim)', fontSize: 11 }}>WATCHERS</span>
            <div className="sk-row" style={{ gap: -4 }}>
              <Avatar name="L M" color="#6f5ad9" size={18} style={{ marginRight: -4, border: '2px solid var(--sk-surface)' }}/>
              <Avatar name="J K" color="#3a6f4e" size={18} style={{ marginRight: -4, border: '2px solid var(--sk-surface)' }}/>
              <Avatar name="C R" color="#a05a3a" size={18} style={{ marginRight: -4, border: '2px solid var(--sk-surface)' }}/>
              <span style={{ marginLeft: 8, color: 'var(--sk-fgMuted)' }}>+2</span>
            </div>
          </div>
          <div className="sk-col" style={{ gap: 3 }}>
            <span style={{ color: 'var(--sk-fgDim)', fontSize: 11 }}>LINKED</span>
            <div className="sk-row" style={{ gap: 6 }}>
              <Icon name="github" size={13} color="var(--sk-fgMuted)"/>
              <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>#1483</span>
              <span style={{ color: 'var(--sk-fgDim)' }}>· Linear OPS-91</span>
            </div>
          </div>
          <div style={{ flex: 1 }}/>
          <div className="sk-col" style={{ gap: 3, alignItems: 'flex-end' }}>
            <span style={{ color: 'var(--sk-fgDim)', fontSize: 11 }}>LAST RUN</span>
            <div className="sk-row" style={{ gap: 6 }}>
              <Dot tone={state === 'needs-human' ? 'warn' : 'info'} pulse={state === 'running'}/>
              <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>run-7af2</span>
              <span style={{ color: 'var(--sk-fgDim)' }}>· {state === 'needs-human' ? 'paused 3m' : '2m elapsed'}</span>
            </div>
          </div>
        </div>

        {/* Feed */}
        <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
          {/* Original issue */}
          <ActivityNode time="1h ago" who="camille" link="opened the issue" kind="user" role="user">
            <div style={{
              padding: '12px 14px', background: 'var(--sk-surface)',
              border: '1px solid var(--sk-border)', borderRadius: 8,
              fontSize: 13, color: 'var(--sk-fg)', lineHeight: 1.55,
            }}>
              <p style={{ margin: '0 0 8px' }}>
                Customer support has 4 reports today of webhook signature verification failing on requests
                from us-east-2. All on payment intent succeeded events. They retry successfully ~80% of the
                time. Started yesterday around 18:00 UTC.
              </p>
              <p style={{ margin: 0, color: 'var(--sk-fgMuted)' }}>
                Suspect: clock drift on the worker pool after the kernel patch on Tue.
              </p>
            </div>
          </ActivityNode>

          <ActivityNode time="58m ago" who="superkick" link="opened run-7af2 with fix-bot" kind="agent" role="agent">
            <div className="sk-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Pill tone="info" mono>fix-bot</Pill>
              <Pill tone="neutral">claude-sonnet-4.5</Pill>
              <Pill tone="neutral">sandbox: ephemeral-2</Pill>
              <Pill tone="neutral">budget: $2.50</Pill>
            </div>
          </ActivityNode>

          <ActivityNode time="55m ago" who="fix-bot" link="reproduced the issue" kind="agent" role="agent">
            <div style={{ fontSize: 13, color: 'var(--sk-fgMuted)', lineHeight: 1.55 }}>
              Wrote a failing test in <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}>tests/webhook_signature_test.go</span>.
              Confirmed: NTP drift &gt; 5s causes signature TS check to reject.
              <div style={{ marginTop: 8, padding: 11, background: 'var(--sk-code)', borderRadius: 6,
                fontFamily: SK.fontMono, fontSize: 12, color: 'var(--sk-codeFg)' }}>
                <div style={{ color: 'var(--sk-danger)' }}>--- FAIL: TestWebhookSignatureDriftedClock (0.04s)</div>
                <div>    webhook_signature_test.go:142: signature ts 1731538121 outside ±5s window</div>
                <div style={{ marginTop: 6, color: 'var(--sk-fgDim)' }}>FAIL    payments-api/webhook  0.083s</div>
              </div>
            </div>
          </ActivityNode>

          <ActivityNode time="42m ago" who="fix-bot" link="proposed a fix" kind="agent" role="agent">
            <div style={{ fontSize: 13, color: 'var(--sk-fgMuted)', marginBottom: 8, lineHeight: 1.55 }}>
              Widen the clock-skew tolerance from ±5s to ±30s, log the skew so we can monitor it,
              and add an SLO alert if median skew exceeds 10s.
            </div>
            <div style={{
              border: '1px solid var(--sk-border)', borderRadius: 8, overflow: 'hidden',
              background: 'var(--sk-surface)',
            }}>
              <div className="sk-row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--sk-border)',
                fontSize: 11.5, fontFamily: SK.fontMono, color: 'var(--sk-fgMuted)' }}>
                <span style={{ flex: 1 }}>internal/webhook/verify.go</span>
                <span style={{ color: 'var(--sk-success)' }}>+11</span>
                <span style={{ marginLeft: 6, color: 'var(--sk-danger)' }}>−3</span>
              </div>
              <pre style={{ margin: 0, padding: '10px 12px', fontFamily: SK.fontMono, fontSize: 12,
                color: 'var(--sk-codeFg)', background: 'var(--sk-code)', lineHeight: 1.55, overflow: 'hidden' }}>
{`@@ -41,7 +41,11 @@ func Verify(payload []byte, sig string, ts int64) error {
   if err != nil { return err }
-  if math.Abs(float64(now-ts)) > 5 { return ErrSignatureTooOld }
+  skew := math.Abs(float64(now-ts))
+  metrics.WebhookSkew.Observe(skew)
+  if skew > clockSkewToleranceSeconds {
+    return fmt.Errorf("%w: skew=%fs", ErrSignatureTooOld, skew)
+  }`}
              </pre>
            </div>
          </ActivityNode>

          <ActivityNode time="38m ago" who="fix-bot" link="ran the test suite" kind="check" role="success">
            <div className="sk-row" style={{ gap: 14, padding: '10px 14px',
              background: 'var(--sk-successSoft)', borderRadius: 8, fontSize: 13 }}>
              <Icon name="check" size={15} color="var(--sk-success)"/>
              <div className="sk-col" style={{ flex: 1, gap: 2 }}>
                <span style={{ color: 'var(--sk-success)', fontWeight: 500 }}>3,418 tests passed</span>
                <span style={{ color: 'var(--sk-fgMuted)', fontSize: 12 }}>14.2s · coverage 84.6% (+0.3%) · 1 new test added</span>
              </div>
              <Btn size="sm" kind="ghost" icon="external">Logs</Btn>
            </div>
          </ActivityNode>

          {state === 'needs-human' ? (
            <ActivityNode time="3m ago" who="fix-bot" link="paused — needs your decision" kind="flag" role="warn">
              <div style={{
                padding: '14px 16px', borderRadius: 10,
                background: 'var(--sk-warnSoft)',
                border: '1px solid var(--sk-warn)',
              }}>
                <div className="sk-row" style={{ gap: 10, marginBottom: 10 }}>
                  <Icon name="alert" size={16} color="var(--sk-warn)"/>
                  <span style={{ fontSize: 13.5, color: 'var(--sk-warn)', fontWeight: 600 }}>
                    Changing a tolerance constant — needs review before opening PR
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--sk-fgMuted)', marginBottom: 12, lineHeight: 1.6 }}>
                  Your team rule says: <span style={{ color: 'var(--sk-fg)' }}>any change to security-tagged
                  constants needs a human OK before PR</span>. The constant <span className="sk-mono"
                  style={{ color: 'var(--sk-fg)' }}>clockSkewToleranceSeconds</span> is tagged
                  <span className="sk-mono" style={{ color: 'var(--sk-fg)' }}> //security</span>.
                </div>
                <div className="sk-row" style={{ gap: 8 }}>
                  <Btn size="sm" kind="danger" icon="x">Block this change</Btn>
                  <Btn size="sm" icon="comment">Ask for a different approach</Btn>
                  <Btn size="sm" kind="primary" icon="check">Approve, open PR</Btn>
                </div>
              </div>
            </ActivityNode>
          ) : (
            <ActivityNode time="now" who="fix-bot" link="is writing the PR description…" kind="agent" role="agent">
              <div className="sk-row" style={{ gap: 10, padding: '10px 14px',
                background: 'var(--sk-raised)', borderRadius: 8, fontSize: 13,
                border: '1px solid var(--sk-border)' }}>
                <Dot tone="info" pulse/>
                <span style={{ color: 'var(--sk-fgMuted)' }}>Generating PR title & body from commits…</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--sk-fgDim)' }}>~30s</span>
              </div>
            </ActivityNode>
          )}

          {/* Reply composer */}
          <div style={{ marginTop: 8 }}>
            <div style={{
              border: '1px solid var(--sk-border)', borderRadius: 10,
              background: 'var(--sk-surface)', padding: 12,
            }}>
              <div className="sk-row" style={{ gap: 8, marginBottom: 8 }}>
                <Avatar name="Léa M" color="#6f5ad9" size={20}/>
                <span style={{ fontSize: 12.5, color: 'var(--sk-fgMuted)' }}>Reply to the run…</span>
                <span style={{ flex: 1 }}/>
                <Pill tone="neutral">@ to address an agent</Pill>
              </div>
              <div style={{
                minHeight: 56, padding: '8px 4px', fontSize: 13, color: 'var(--sk-fgDim)',
              }}>
                Type your reply, or attach evidence (logs, screenshots, links)…
              </div>
              <div className="sk-row" style={{ gap: 6, paddingTop: 6, borderTop: '1px solid var(--sk-border)' }}>
                <Btn size="sm" kind="ghost" icon="link"/>
                <Btn size="sm" kind="ghost" icon="terminal"/>
                <Btn size="sm" kind="ghost" icon="doc"/>
                <span style={{ flex: 1 }}/>
                <Pill tone="neutral" mono><Kbd>⌘</Kbd>+<Kbd>↵</Kbd> send</Pill>
                <Btn size="sm" kind="primary" icon="send">Send</Btn>
              </div>
            </div>
          </div>
        </div>
      </Page>
    </SKFrame>
  );
}

Object.assign(window, { IssueDetail });

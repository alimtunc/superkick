// SK Overlays — Command bar (⌘K), Launch dialog (compact), Chat drawer.
// Plus the all-clear empty state for Run Detail.

function CommandBar({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="Command bar" width={720} height={520}>
      {/* Dimmed background hint */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }}/>
      <div style={{
        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
        width: 580, background: 'var(--sk-overlay)', borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,.55), 0 0 0 1px var(--sk-border)',
        overflow: 'hidden',
      }}>
        <div className="sk-row" style={{
          padding: '14px 18px', gap: 12, borderBottom: '1px solid var(--sk-border)',
        }}>
          <Icon name="search" size={16} color="var(--sk-fgDim)"/>
          <input style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--sk-fg)', fontSize: 15, fontFamily: 'inherit',
          }} defaultValue="webhook" placeholder="Type a command or search…"/>
          <Kbd>esc</Kbd>
        </div>

        {/* Sections */}
        <div className="sk-scrollbox" style={{ maxHeight: 380, overflow: 'auto', padding: '4px 0 8px' }}>
          {[
            { h: 'Actions', items: [
              { ic: 'zap', t: 'Launch task on webhook…', s: 'opens composer pre-filled', kbd: ['⌘','↵'] },
              { ic: 'plus', t: 'New issue: webhook…', s: 'in payments-api' },
            ]},
            { h: 'Issues', items: [
              { ic: 'issue', t: 'ISS-217 — Webhook signature intermittently rejected from us-east-2', s: 'P2 · open' },
              { ic: 'issue', t: 'ISS-206 — Webhook retries don\'t respect Retry-After', s: 'P2 · open' },
              { ic: 'issue', t: 'ISS-190 — Webhook dead-letter UI on dashboard', s: 'P2 · done · 6d' },
            ]},
            { h: 'Runs', items: [
              { ic: 'loop', t: 'run-7af2 — webhook signature investigation', s: 'fix-bot · running', selected: true },
              { ic: 'loop', t: 'run-7a44 — webhook retry fix', s: 'shipped · 34m' },
            ]},
            { h: 'Files & docs', items: [
              { ic: 'doc', t: 'internal/webhook/verify.go', s: 'payments-api · 142 lines' },
              { ic: 'doc', t: 'docs/webhooks.md', s: 'last edited 3w ago' },
            ]},
          ].map(sec => (
            <div key={sec.h}>
              <div style={{ padding: '8px 18px 2px', fontSize: 10.5, color: 'var(--sk-fgDim)',
                textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{sec.h}</div>
              {sec.items.map((it, i) => (
                <div key={i} className="sk-row" style={{
                  padding: '8px 18px', gap: 11, cursor: 'pointer',
                  background: it.selected ? 'var(--sk-raised)' : 'transparent',
                  position: 'relative',
                }}>
                  {it.selected && <span style={{
                    position: 'absolute', left: 0, top: 6, bottom: 6, width: 2,
                    background: 'var(--sk-accent)',
                  }}/>}
                  <Icon name={it.ic} size={14} color="var(--sk-fgMuted)"/>
                  <div className="sk-col" style={{ flex: 1, gap: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, color: 'var(--sk-fg)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.t}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--sk-fgDim)' }}>{it.s}</span>
                  </div>
                  {it.kbd && <div className="sk-row" style={{ gap: 3 }}>
                    {it.kbd.map(k => <Kbd key={k}>{k}</Kbd>)}
                  </div>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="sk-row" style={{
          padding: '8px 18px', borderTop: '1px solid var(--sk-border)',
          fontSize: 11, color: 'var(--sk-fgDim)', gap: 14,
        }}>
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> open</span>
          <span><Kbd>⌘</Kbd><Kbd>↵</Kbd> launch task</span>
          <span style={{ marginLeft: 'auto' }}>5 results</span>
        </div>
      </div>
    </SKFrame>
  );
}

function LaunchDialog({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="Launch dialog" width={640} height={520}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }}/>
      <div style={{
        position: 'absolute', top: 60, left: '50%', transform: 'translateX(-50%)',
        width: 540, background: 'var(--sk-overlay)', borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,.55), 0 0 0 1px var(--sk-border)',
        overflow: 'hidden',
      }}>
        <div className="sk-row" style={{ padding: '14px 18px', gap: 12,
          borderBottom: '1px solid var(--sk-border)' }}>
          <Icon name="zap" size={15} color="var(--sk-accent)"/>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--sk-fg)' }}>
            Launch task from ISS-217
          </span>
          <Kbd>esc</Kbd>
        </div>

        <div className="sk-col" style={{ padding: '16px 18px', gap: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--sk-fgMuted)', lineHeight: 1.55 }}>
            We'll start a run pre-loaded with the issue body and the linked code paths.
          </div>

          <div className="sk-col" style={{ gap: 8 }}>
            <div className="sk-row" style={{ gap: 8 }}>
              <ChipPicker icon="folder" label="repo" value="payments-api"/>
              <ChipPicker icon="bot" label="agent" value="fix-bot"/>
              <ChipPicker icon="branch" label="base" value="main"/>
            </div>
            <div className="sk-row" style={{ gap: 8 }}>
              <ChipPicker icon="layers" label="sandbox" value="ephemeral-2"/>
              <ChipPicker icon="zap" label="budget" value="$5.00"/>
              <span style={{ flex: 1 }}/>
              <Btn size="sm" kind="ghost">Open in composer →</Btn>
            </div>
          </div>

          <div style={{ background: 'var(--sk-raised)', borderRadius: 8, padding: 12 }}>
            <div className="sk-row" style={{ gap: 6, marginBottom: 6, fontSize: 11,
              color: 'var(--sk-fgDim)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>
              <Icon name="issue" size={11}/>Loaded context
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--sk-fgMuted)', lineHeight: 1.55 }}>
              ISS-217 body · 4 customer reports referenced · <span className="sk-mono">internal/webhook/</span> tree
            </div>
          </div>
        </div>

        <div className="sk-row" style={{
          padding: '12px 18px', borderTop: '1px solid var(--sk-border)', gap: 8,
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--sk-fgDim)' }}>Estimate <span className="sk-mono"
            style={{ color: 'var(--sk-fgMuted)' }}>~$0.40</span> · ~5min</span>
          <span style={{ flex: 1 }}/>
          <Btn size="sm" kind="ghost">Cancel</Btn>
          <Btn size="sm" kind="primary" icon="play">Launch</Btn>
        </div>
      </div>
    </SKFrame>
  );
}

function ChatDrawer({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="Chat drawer" width={520} height={720}>
      <div className="sk-col" style={{ height: '100%', background: 'var(--sk-surface)',
        borderLeft: '1px solid var(--sk-border)' }}>
        <div className="sk-row" style={{ padding: '12px 16px', gap: 10,
          borderBottom: '1px solid var(--sk-border)' }}>
          <Avatar name="fix-bot" color="#2c5f7d" size={26} icon="bot"/>
          <div className="sk-col" style={{ flex: 1, gap: 1 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--sk-fg)' }}>fix-bot</span>
            <div className="sk-row" style={{ gap: 5 }}>
              <Dot tone="info" pulse size={6}/>
              <span style={{ fontSize: 11.5, color: 'var(--sk-fgMuted)' }}>working on ISS-217 · run-7af2</span>
            </div>
          </div>
          <Btn size="sm" kind="ghost" icon="external"/>
          <Btn size="sm" kind="ghost" icon="x"/>
        </div>

        <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: 16,
          gap: 14, display: 'flex', flexDirection: 'column' }}>
          <RunChat time="2m ago" role="agent" who="fix-bot">
            Found it — NTP drift on the worker pool. Going to widen the tolerance to ±30s and add a skew metric.
            Will pause before opening the PR since the constant is security-tagged.
          </RunChat>
          <RunChat time="just now" role="user" who="Léa">
            Sounds good. Also can you add an alert if median skew exceeds 10s?
          </RunChat>
          <div className="sk-row" style={{ gap: 8, padding: '8px 0' }}>
            <Avatar name="fix" color="#2c5f7d" size={20} icon="bot"/>
            <Pill tone="info" dot pulse>typing…</Pill>
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--sk-border)' }}>
          <div style={{
            border: '1px solid var(--sk-border)', borderRadius: 10, padding: 10,
            background: 'var(--sk-void)',
          }}>
            <div style={{ minHeight: 36, fontSize: 13, color: 'var(--sk-fgDim)' }}>
              Reply to fix-bot…
            </div>
            <div className="sk-row" style={{ gap: 6 }}>
              <Btn size="sm" kind="ghost" icon="link"/>
              <Btn size="sm" kind="ghost" icon="layers">/ commands</Btn>
              <span style={{ flex: 1 }}/>
              <Btn size="sm" kind="primary" icon="send">Send</Btn>
            </div>
          </div>
        </div>
      </div>
    </SKFrame>
  );
}

Object.assign(window, { CommandBar, LaunchDialog, ChatDrawer });

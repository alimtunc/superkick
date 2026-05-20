// Global search / command bar — three states:
// 1. Empty: needs-you issues + quick actions
// 2. Typing "webhook": cross-type results (issues, comments, repo files, runs, actions)
// 3. Scoped: "i:" prefix or click a scope chip to narrow to issues

function SearchBox({ width = 660, height = 540, theme = 'dark', label, children }) {
  return (
    <SKFrame theme={theme} label={label} width={width} height={height}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }}/>
      <div style={{
        position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
        width: width - 80, maxHeight: height - 80,
        background: 'var(--sk-overlay)', borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,.55), 0 0 0 1px var(--sk-border)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {children}
      </div>
    </SKFrame>
  );
}

function ResultRow({ icon, iconColor, title, sub, right, selected, accent, prefix }) {
  return (
    <div className="sk-row" style={{
      padding: '7px 16px', gap: 10, cursor: 'pointer',
      background: selected ? 'var(--sk-raised)' : 'transparent',
      position: 'relative', minHeight: 32,
    }}>
      {selected && <span style={{
        position: 'absolute', left: 0, top: 6, bottom: 6, width: 2,
        background: 'var(--sk-accent)',
      }}/>}
      {prefix}
      {icon && <Icon name={icon} size={13} color={iconColor || 'var(--sk-fgMuted)'}/>}
      <div className="sk-col" style={{ flex: 1, gap: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 13, color: 'var(--sk-fg)', lineHeight: 1.35,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</span>
        {sub && <span style={{
          fontSize: 11.5, color: 'var(--sk-fgDim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{sub}</span>}
      </div>
      {right}
    </div>
  );
}

function SectionHeader({ children, count }) {
  return (
    <div className="sk-row" style={{
      padding: '10px 16px 4px', gap: 6,
      fontSize: 10.5, color: 'var(--sk-fgDim)',
      textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600,
    }}>
      <span>{children}</span>
      {count != null && <span className="sk-mono" style={{ letterSpacing: 0 }}>{count}</span>}
    </div>
  );
}

// Highlights matching substring (case-insensitive)
function Hi({ text, q }) {
  if (!q) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark style={{
        background: 'var(--sk-accentSoft)', color: 'var(--sk-fg)',
        borderRadius: 2, padding: '0 1px',
      }}>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </span>
  );
}

function SearchInput({ value, scope, onClearScope }) {
  return (
    <div className="sk-row" style={{
      padding: '13px 16px', gap: 10,
      borderBottom: '1px solid var(--sk-border)',
    }}>
      <Icon name="search" size={15} color="var(--sk-fgDim)"/>
      {scope && (
        <span className="sk-row" style={{
          gap: 5, padding: '0 7px', height: 22, borderRadius: 5,
          background: 'var(--sk-accentSoft)', color: 'var(--sk-accent)',
          fontSize: 11.5, fontWeight: 500,
        }}>
          <Icon name={scope.icon} size={10}/>
          {scope.label}
          <Icon name="x" size={10} onClick={onClearScope} style={{ cursor: 'pointer' }}/>
        </span>
      )}
      <span style={{ flex: 1, color: 'var(--sk-fg)', fontSize: 15 }}>
        {value || <span style={{ color: 'var(--sk-fgDim)' }}>Search issues, files, runs…</span>}
        <span style={{
          display: 'inline-block', width: 1.5, height: 16, background: 'var(--sk-accent)',
          verticalAlign: 'middle', marginLeft: 2, animation: 'sk-blink 1s steps(1) infinite',
        }}/>
      </span>
      <Kbd>esc</Kbd>
    </div>
  );
}

function SearchFooter({ count, hint }) {
  return (
    <div className="sk-row" style={{
      padding: '8px 16px', borderTop: '1px solid var(--sk-border)',
      fontSize: 11, color: 'var(--sk-fgDim)', gap: 14, flex: 'none',
    }}>
      <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
      <span><Kbd>↵</Kbd> open</span>
      <span><Kbd>⌘</Kbd><Kbd>↵</Kbd> launch task</span>
      <span><Kbd>tab</Kbd> scope</span>
      <span style={{ marginLeft: 'auto' }}>{count}</span>
    </div>
  );
}

// ─── State 1 — Empty input: needs-you issues + quick actions
function SearchEmpty({ theme = 'dark' }) {
  return (
    <SearchBox theme={theme} label="⌘K · empty (Quick actions + Needs you)" height={620}>
      <SearchInput value=""/>
      <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: '4px 0 6px' }}>
        <SectionHeader count={2}>Needs you</SectionHeader>
        <ResultRow
          icon="alert" iconColor="var(--sk-warn)"
          title={<span>ISS-201 · Race condition in tenant migration script</span>}
          sub="senior-bot paused · destructive migration · approve needed · 8m"
          right={<Pill tone="warn" dot>needs you</Pill>}
        />
        <ResultRow
          icon="alert" iconColor="var(--sk-warn)"
          title={<span>ISS-214 · Stripe 3DS redirect lost on Safari iOS</span>}
          sub="review-bot · reviewer flagged unsafe diff · 32m"
          right={<Pill tone="warn" dot>review me</Pill>}
        />
        <SectionHeader>Quick actions</SectionHeader>
        <ResultRow icon="zap" iconColor="var(--sk-accent)"
          title="Launch task…" sub="opens composer at /tasks/new"
          right={<div className="sk-row" style={{ gap: 3 }}><Kbd>⌘</Kbd><Kbd>↵</Kbd></div>}/>
        <ResultRow icon="plus"
          title="New issue…" sub="in current repo"
          right={<div className="sk-row" style={{ gap: 3 }}><Kbd>c</Kbd></div>}/>
        <ResultRow icon="filter"
          title="Switch view…" sub="My open work · All open · Recently shipped"/>
        <ResultRow icon="folder"
          title="Switch repo…" sub="payments-api · checkout-web · auth-service"
          right={<div className="sk-row" style={{ gap: 3 }}><Kbd>⌘</Kbd><Kbd>R</Kbd></div>}/>
        <SectionHeader>Jump to</SectionHeader>
        <ResultRow icon="inbox" title="Inbox" sub="4 need you"
          right={<Pill tone="warn" dot mono>4</Pill>}/>
        <ResultRow icon="issue" title="Issues"/>
        <ResultRow icon="task" title="Tasks"/>
      </div>
      <SearchFooter count="ready"/>
    </SearchBox>
  );
}

// ─── State 2 — Typing "webhook": cross-type results
function SearchTyping({ theme = 'dark' }) {
  const q = 'webhook';
  return (
    <SearchBox theme={theme} label='⌘K · typing "webhook"' height={620}>
      <SearchInput value={q}/>
      {/* Scope chips row */}
      <div className="sk-row" style={{
        gap: 5, padding: '6px 16px',
        borderBottom: '1px solid var(--sk-border)',
        fontSize: 11.5, flex: 'none',
      }}>
        {[
          { id: 'all', label: 'All', n: 9, on: true },
          { id: 'issues', label: 'Issues', n: 3 },
          { id: 'comments', label: 'Comments', n: 2 },
          { id: 'files', label: 'Files', n: 2 },
          { id: 'runs', label: 'Runs', n: 1 },
          { id: 'actions', label: 'Actions', n: 1 },
        ].map(s => (
          <span key={s.id} className="sk-row" style={{
            gap: 5, padding: '2px 9px', borderRadius: 999,
            background: s.on ? 'var(--sk-raised)' : 'transparent',
            color: s.on ? 'var(--sk-fg)' : 'var(--sk-fgMuted)',
            fontWeight: s.on ? 500 : 400, cursor: 'pointer',
          }}>
            {s.label}
            <span className="sk-mono" style={{ color: 'var(--sk-fgDim)', fontSize: 10.5 }}>{s.n}</span>
          </span>
        ))}
      </div>
      <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: '2px 0 6px' }}>
        <SectionHeader count={1}>Actions</SectionHeader>
        <ResultRow
          icon="zap" iconColor="var(--sk-accent)"
          title={<>Launch task on <Hi text="webhook" q={q}/>…</>}
          sub="opens composer pre-filled with the query"
          right={<div className="sk-row" style={{ gap: 3 }}><Kbd>⌘</Kbd><Kbd>↵</Kbd></div>}
          selected
        />

        <SectionHeader count={3}>Issues</SectionHeader>
        <ResultRow
          prefix={<><PriorityIcon kind="medium" size={11}/><StatusIcon kind="progress" size={12}/></>}
          title={<>ISS-217 · <Hi text="Webhook signature intermittently rejected from us-east-2" q={q}/></>}
          sub={<span>P2 · in progress · payments-api · launchable · 1h</span>}
          right={<Avatar name="Léa M" color="#6f5ad9" size={16}/>}
        />
        <ResultRow
          prefix={<><PriorityIcon kind="medium" size={11}/><StatusIcon kind="todo" size={12}/></>}
          title={<>ISS-206 · <Hi text="Webhook retries don't respect Retry-After" q={q}/></>}
          sub={<span>P2 · open · payments-api · 2d</span>}
          right={<Avatar name="Léa M" color="#6f5ad9" size={16}/>}
        />
        <ResultRow
          prefix={<><PriorityIcon kind="medium" size={11}/><StatusIcon kind="done" size={12}/></>}
          title={<>ISS-190 · <Hi text="Webhook dead-letter UI on dashboard" q={q}/></>}
          sub="P2 · done · dashboard-web · shipped 6d ago"
          right={<Avatar name="fix-bot" color="#3a6f4e" size={16} icon="bot"/>}
        />

        <SectionHeader count={2}>Comments</SectionHeader>
        <ResultRow
          icon="comment"
          title={<span style={{ color: 'var(--sk-fgMuted)' }}>
            <span style={{ color: 'var(--sk-fg)' }}>fix-bot</span> on ISS-217 · 12m ago
          </span>}
          sub={<>"…tracing the failure to NTP drift on the <Hi text="webhook" q={q}/> worker pool. Tolerance is ±5s, observed skew up to 18s…"</>}
        />
        <ResultRow
          icon="comment"
          title={<span style={{ color: 'var(--sk-fgMuted)' }}>
            <span style={{ color: 'var(--sk-fg)' }}>Camille</span> on ISS-206 · 1d ago
          </span>}
          sub={<>"Spec says we should honour Retry-After per RFC 7231 §7.1.3, our <Hi text="webhook" q={q}/> dispatcher hard-codes 60s…"</>}
        />

        <SectionHeader count={2}>Files</SectionHeader>
        <ResultRow
          icon="doc"
          title={<span className="sk-mono">internal/<Hi text="webhook" q={q}/>/verify.go</span>}
          sub="payments-api · 142 lines · last edit 3d ago"
        />
        <ResultRow
          icon="doc"
          title={<span className="sk-mono">docs/<Hi text="webhooks" q={q}/>.md</span>}
          sub="payments-api · last edit 3w ago"
        />

        <SectionHeader count={1}>Runs</SectionHeader>
        <ResultRow
          icon="loop" iconColor="var(--sk-info)"
          title={<><span className="sk-mono">run-7af2</span> · <Hi text="webhook" q={q}/> signature investigation</>}
          sub="fix-bot · implementing · 2m elapsed · ISS-217"
          right={<Pill tone="info" dot pulse>running</Pill>}
        />
      </div>
      <SearchFooter count="9 results"/>
    </SearchBox>
  );
}

// ─── State 3 — Scoped to issues, with body+comment snippets
function SearchScoped({ theme = 'dark' }) {
  const q = 'signature';
  return (
    <SearchBox theme={theme} label='⌘K · scoped to issues ("i: signature")' height={620}>
      <SearchInput value={q} scope={{ icon: 'issue', label: 'Issues only' }}/>
      <div className="sk-scrollbox" style={{ flex: 1, overflow: 'auto', padding: '2px 0 6px' }}>
        <SectionHeader>Open · 3</SectionHeader>
        <ResultRow
          prefix={<><PriorityIcon kind="medium" size={11}/><StatusIcon kind="progress" size={12}/></>}
          title={<>ISS-217 · Webhook <Hi text="signature" q={q}/> intermittently rejected from us-east-2</>}
          sub={<>match in body: "…the HMAC <Hi text="signature" q={q}/> verification path returns InvalidSig when the request originates from us-east-2 only…"</>}
          right={<Pill tone="info" dot pulse>running</Pill>}
          selected
        />
        <ResultRow
          prefix={<><PriorityIcon kind="high" size={11}/><StatusIcon kind="needs" size={12}/></>}
          title={<>ISS-214 · Stripe 3DS redirect lost on Safari iOS</>}
          sub={<>match in comment by review-bot: "…the redirect <Hi text="signature" q={q}/> nonce gets dropped between the 3DS sheet and our callback on Safari 17.4 mobile only…"</>}
          right={<Pill tone="warn" dot>needs you</Pill>}
        />
        <ResultRow
          prefix={<><PriorityIcon kind="low" size={11}/><StatusIcon kind="todo" size={12}/></>}
          title={<>ISS-198 · Add JWT <Hi text="signature" q={q}/> rotation runbook</>}
          sub="auth-service · open · 5d"
        />
        <SectionHeader>Done · 2 <span style={{ color: 'var(--sk-fgDim)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· hidden by default</span></SectionHeader>
        <ResultRow
          prefix={<><PriorityIcon kind="medium" size={11}/><StatusIcon kind="done" size={12}/></>}
          title={<>ISS-172 · Webhook <Hi text="signature" q={q}/> validation skew handling</>}
          sub="shipped 12d ago · PR #61 merged"
          right={<Pill tone="success" dot>shipped</Pill>}
        />
        <ResultRow
          prefix={<><PriorityIcon kind="low" size={11}/><StatusIcon kind="done" size={12}/></>}
          title={<>ISS-141 · Log raw <Hi text="signature" q={q}/> on verify failure (gated)</>}
          sub="shipped 4w ago"
          right={<Pill tone="success" dot>shipped</Pill>}
        />
      </div>
      <SearchFooter count="5 issues"/>
    </SearchBox>
  );
}

Object.assign(window, { SearchEmpty, SearchTyping, SearchScoped });

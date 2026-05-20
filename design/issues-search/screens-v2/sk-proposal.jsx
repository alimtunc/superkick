// Proposal / spec / non-goals — rendered as structured cards on the canvas.
// Lives at the head of the canvas so reviewers read it before the artboards.

function Block({ width = 1240, title, eyebrow, children }) {
  return (
    <div style={{
      width, padding: 24, background: 'var(--sk-surface)',
      border: '1px solid var(--sk-border)', borderRadius: 10,
    }}>
      {eyebrow && (
        <div style={{
          fontSize: 10.5, color: 'var(--sk-fgDim)', textTransform: 'uppercase',
          letterSpacing: 1, fontWeight: 600, marginBottom: 6,
        }}>{eyebrow}</div>
      )}
      <h2 style={{
        fontSize: 22, fontWeight: 500, color: 'var(--sk-fg)',
        letterSpacing: -0.2, margin: 0, marginBottom: 16,
      }}>{title}</h2>
      {children}
    </div>
  );
}

function Lede({ children }) {
  return (
    <p style={{
      fontSize: 14, lineHeight: 1.6, color: 'var(--sk-fgMuted)',
      maxWidth: 70 + 'ch', margin: 0, marginBottom: 18,
    }}>{children}</p>
  );
}

function Row3({ children }) {
  return (
    <div style={{
      display: 'grid', gap: 14, gridTemplateColumns: 'repeat(3, 1fr)',
    }}>{children}</div>
  );
}

function Row2({ children }) {
  return (
    <div style={{
      display: 'grid', gap: 14, gridTemplateColumns: 'repeat(2, 1fr)',
    }}>{children}</div>
  );
}

function Card({ tone, num, title, children }) {
  const accentColor = tone ? `var(--sk-${tone})` : 'var(--sk-fgDim)';
  return (
    <div style={{
      padding: 16, background: 'var(--sk-raised)',
      border: '1px solid var(--sk-border)', borderRadius: 8,
      borderLeft: `3px solid ${accentColor}`,
    }}>
      <div className="sk-row" style={{ gap: 8, marginBottom: 8 }}>
        {num && <span className="sk-mono" style={{
          fontSize: 11, color: 'var(--sk-fgDim)', letterSpacing: 0.5,
        }}>{num}</span>}
        <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--sk-fg)' }}>{title}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--sk-fgMuted)', lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

function List({ items, tone = 'fgDim' }) {
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {items.map((it, i) => (
        <li key={i} style={{
          fontSize: 13, color: 'var(--sk-fgMuted)', lineHeight: 1.55,
          paddingLeft: 16, position: 'relative', marginBottom: 4,
        }}>
          <span style={{
            position: 'absolute', left: 0, top: 9, width: 7, height: 1,
            background: `var(--sk-${tone})`,
          }}/>
          {it}
        </li>
      ))}
    </ul>
  );
}

function H3({ children, style }) {
  return (
    <h3 style={{
      fontSize: 11, color: 'var(--sk-fgDim)', textTransform: 'uppercase',
      letterSpacing: 1, fontWeight: 600, margin: '20px 0 10px', ...style,
    }}>{children}</h3>
  );
}

// ───────────────────────────────────────────────────────────────────
function ProposalIntro({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="01 · The brief" width={1280} height={720}>
      <div style={{ padding: 32, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Block title="Issues + Search rework" eyebrow="Superkick · May 2026 · scope: /issues + ⌘K">
          <Lede>
            Today /issues shows every Linear issue with no opinion. Search finds routes. Both are noisy.
            We rework them to put <i>your</i> open work first, prioritize what can be launched or needs a human,
            and make search find issues — not just routes. Linear-style UX patterns (filter chips, status icons,
            hover preview, tight rows), Superkick voice and tokens.
          </Lede>
          <Row3>
            <Card tone="accent" num="DEFAULT" title="My open work">
              <b style={{ color: 'var(--sk-fg)' }}>assignee = me</b>, status ≠ Done. Done is hidden behind a one-click reveal.
              "+ New view" lets the user save other slices.
            </Card>
            <Card tone="warn" num="PRIORITY" title="Lifecycle buckets">
              Group rows by <b style={{ color: 'var(--sk-fg)' }}>Needs you → Active → Launchable → Open</b>.
              Linear status stays inside the row icon — buckets are about <i>where in the task lifecycle</i>.
            </Card>
            <Card tone="info" num="SEARCH" title="Finds issues, not routes">
              ⌘K indexes issues (id, title, body), <b style={{ color: 'var(--sk-fg)' }}>comments</b>, repo files,
              past runs / PRs, plus quick actions and navigation. Empty state = "needs you" + quick actions.
            </Card>
          </Row3>
        </Block>
      </div>
    </SKFrame>
  );
}

function ProposalStructure({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="02 · Information architecture" width={1280} height={720}>
      <div style={{ padding: 32, height: '100%', overflow: 'hidden' }}>
        <Block title="UX structure">
          <Row2>
            <div>
              <H3 style={{ marginTop: 0 }}>/issues</H3>
              <div style={{
                background: 'var(--sk-void)', border: '1px solid var(--sk-border)',
                borderRadius: 8, padding: 14, fontFamily: SK.fontMono, fontSize: 12,
                color: 'var(--sk-fgMuted)', lineHeight: 1.7,
              }}>
                <div><span style={{ color: 'var(--sk-fg)' }}>Topbar</span> · title <span style={{ color: 'var(--sk-fgDim)' }}>· repo crumb · ⌘K · New issue</span></div>
                <div><span style={{ color: 'var(--sk-fg)' }}>View tabs</span> · <span style={{ color: 'var(--sk-accent)' }}>My open work</span> · All open · Recently shipped · + New view</div>
                <div><span style={{ color: 'var(--sk-fg)' }}>Filter bar</span> · + Filter · compound chips · Sort · Group · List/Board</div>
                <div><span style={{ color: 'var(--sk-fg)' }}>Body</span></div>
                <div style={{ paddingLeft: 14 }}>
                  <div>· <span style={{ color: 'var(--sk-danger)' }}>● Needs you</span> · N</div>
                  <div>· <span style={{ color: 'var(--sk-info)' }}>● Active</span> · N</div>
                  <div>· <span style={{ color: 'var(--sk-accent)' }}>● Launchable</span> · N · Launch all</div>
                  <div>· <span style={{ color: 'var(--sk-fgDim)' }}>● Open</span> · N</div>
                  <div style={{ color: 'var(--sk-fgDim)' }}>(Done hidden · "Show 12" reveal)</div>
                </div>
              </div>
            </div>
            <div>
              <H3 style={{ marginTop: 0 }}>⌘K (global search)</H3>
              <div style={{
                background: 'var(--sk-void)', border: '1px solid var(--sk-border)',
                borderRadius: 8, padding: 14, fontFamily: SK.fontMono, fontSize: 12,
                color: 'var(--sk-fgMuted)', lineHeight: 1.7,
              }}>
                <div><span style={{ color: 'var(--sk-fg)' }}>Input</span> · scope chip (optional) · esc</div>
                <div><span style={{ color: 'var(--sk-fg)' }}>Scope bar</span> · All · Issues · Comments · Files · Runs · Actions</div>
                <div><span style={{ color: 'var(--sk-fg)' }}>Sections</span></div>
                <div style={{ paddingLeft: 14 }}>
                  <div style={{ color: 'var(--sk-fgDim)' }}>(empty)</div>
                  <div>· Needs you · 2</div>
                  <div>· Quick actions (Launch · New issue · Switch view · Switch repo)</div>
                  <div>· Jump to</div>
                  <div style={{ color: 'var(--sk-fgDim)', marginTop: 4 }}>(with query)</div>
                  <div>· Actions · 1 · Launch task on "{'<q>'}"…</div>
                  <div>· Issues · N · with body + comment snippets</div>
                  <div>· Comments · N</div>
                  <div>· Files · N</div>
                  <div>· Runs · N · with status pill</div>
                </div>
              </div>
            </div>
          </Row2>
        </Block>
      </div>
    </SKFrame>
  );
}

function ProposalNotes({ theme = 'dark' }) {
  return (
    <SKFrame theme={theme} label="03 · Component notes & non-goals" width={1280} height={780}>
      <div style={{ padding: 32, height: '100%', overflow: 'hidden' }}>
        <Block title="Component notes & non-goals">
          <Row2>
            <div>
              <H3 style={{ marginTop: 0 }}>Component map (what to build)</H3>
              <List items={[
                <><b style={{ color: 'var(--sk-fg)' }}>StatusIcon · PriorityIcon</b> — Linear-style icons in Superkick tones. Replaces the colored status pill in rows.</>,
                <><b style={{ color: 'var(--sk-fg)' }}>TaskBadge</b> — Superkick-only. <span style={{ color: 'var(--sk-warn)' }}>needs you</span> · <span style={{ color: 'var(--sk-info)' }}>running</span> · <span style={{ color: 'var(--sk-accent)' }}>review</span> · <span style={{ color: 'var(--sk-success)' }}>shipped</span>. Pulse on running.</>,
                <><b style={{ color: 'var(--sk-fg)' }}>IssueRowV2</b> — 32px. Cols: priority · ID · status · title · TaskBadge · labels · project · assignee · age. Hover bg <span className="sk-mono">var(--sk-raised)</span>.</>,
                <><b style={{ color: 'var(--sk-fg)' }}>GroupHeader</b> — 32px sticky. Chev + tone dot + label + count. Optional trailing action ("Launch all").</>,
                <><b style={{ color: 'var(--sk-fg)' }}>FilterBar</b> — "+ Filter" dashed button + compound chips + sort/group/view toggle on the right. Chips use semantic tone for state filters.</>,
                <><b style={{ color: 'var(--sk-fg)' }}>ViewTabs</b> — saved views as underline tabs. Pinned default ("My open work") gets a small star.</>,
                <><b style={{ color: 'var(--sk-fg)' }}>IssueHoverCard</b> — 460px. Body excerpt (3 lines) + last comment + linked runs/PRs + Open/Launch CTAs.</>,
                <><b style={{ color: 'var(--sk-fg)' }}>KanbanCard · KCol</b> — drag-to-triage. Drop target gets <span className="sk-mono">accentSoft</span> tint, ghost placeholder shows insertion point.</>,
                <><b style={{ color: 'var(--sk-fg)' }}>SearchBox</b> — input · scope chips · sectioned results · footer with kbd hints.</>,
              ]}/>
              <H3>Bucket logic (server-side)</H3>
              <List tone="fgDim" items={[
                <><span style={{ color: 'var(--sk-danger)' }}>Needs you</span> — issue.active_run.state ∈ <span className="sk-mono">{'{needs_human, paused}'}</span></>,
                <><span style={{ color: 'var(--sk-info)' }}>Active</span> — issue.active_run.state ∈ <span className="sk-mono">{'{planning, coding, running_commands, reviewing}'}</span></>,
                <><span style={{ color: 'var(--sk-accent)' }}>Launchable</span> — linear.status ∈ <span className="sk-mono">{'{in_progress}'}</span> AND no active_run AND assignee = me</>,
                <><span style={{ color: 'var(--sk-fgDim)' }}>Open</span> — linear.status ∈ <span className="sk-mono">{'{todo, backlog}'}</span> AND assignee = me</>,
                <><span style={{ color: 'var(--sk-success)' }}>Done</span> — hidden. <span style={{ color: 'var(--sk-fg)' }}>"Show 12 done this week"</span> reveals.</>,
              ]}/>
            </div>
            <div>
              <H3 style={{ marginTop: 0 }}>Search index (server-side)</H3>
              <List items={[
                <>Issues: <span className="sk-mono">id · title · body · labels · linked PRs</span></>,
                <>Comments: <span className="sk-mono">last 90d</span>, return snippet with ±40 chars around match</>,
                <>Repo files: indexed via existing repo tree (no full-text on file body in V1)</>,
                <>Runs: <span className="sk-mono">id · linked issue · step name · status</span></>,
                <>Actions: <span className="sk-mono">launch · new-issue · switch-view · switch-repo · open-inbox</span></>,
                <>Navigation: hard-coded routes (low priority — surfaced under "Jump to")</>,
              ]}/>
              <H3>Keyboard</H3>
              <List tone="fgDim" items={[
                <><Kbd>⌘K</Kbd> open from anywhere · <Kbd>tab</Kbd> cycles scope · <Kbd>↵</Kbd> opens · <Kbd>⌘↵</Kbd> launches task on selection</>,
                <><Kbd>j</Kbd>/<Kbd>k</Kbd> through list rows · <Kbd>↵</Kbd> opens · <Kbd>l</Kbd> launches task on focused issue</>,
                <><Kbd>g</Kbd>{' '}<Kbd>i</Kbd> jump to Issues · <Kbd>g</Kbd>{' '}<Kbd>b</Kbd> jump to Inbox · <Kbd>c</Kbd> new issue · <Kbd>v</Kbd> switch view</>,
              ]}/>
              <H3>Non-goals</H3>
              <List tone="danger" items={[
                <>Issue Workspace / Issue Detail — out of scope, untouched.</>,
                <>Launch Task feed (composer + evidence cards) — out of scope.</>,
                <>Chat drawer & Terminal — out of scope.</>,
                <>Settings — out of scope.</>,
                <>No new Linear-style features that don't exist server-side (sub-issue rollup graphs, cycles, projects roadmap).</>,
                <>No emoji status, no celebratory illustrations, no toasts for non-actionable events.</>,
                <>No icon-only sidebar collapse.</>,
              ]}/>
            </div>
          </Row2>
        </Block>
      </div>
    </SKFrame>
  );
}

Object.assign(window, { ProposalIntro, ProposalStructure, ProposalNotes });

/* Superkick reference — Issue-detail section renderers.
   Composes the detail body (description → ExecutionLog → operator banner →
   activity feed → composer) and the properties rail, parameterised by state.
   Mirrors ExecutionLogState / Phase / ExecActivityRow / ExecFileChange /
   WorktreeFacts / IssueActivityItem / IssueDetailResponse shapes. */
(function () {
	var ICON = { plan: 'doc', search: 'search', tool: 'terminal', edit: 'commit', test: 'check', pr: 'pr', ask: 'comment', stuck: 'alert', note: 'dot', done: 'check' };

	function ic(name, w) { w = w || 16; return '<svg class="ic" style="width:' + w + 'px;height:' + w + 'px"><use href="#ic-' + name + '"></use></svg>'; }

	// ── Issue header ──────────────────────────────────────────────────────
	function issueHead(it) {
		var parent = it.parent ? '<span class="mono">' + it.parent + '</span>' + ic('chevRight', 12) : '';
		return '<div class="issue-head">' +
			'<div class="issue-head__crumb">' + parent + SK.statusGlyph(it.status) + '<span class="mono">' + it.id + '</span><span>·</span><span>' + it.statusLabel + '</span></div>' +
			'<h1 class="issue-title">' + it.title + '</h1>' +
		'</div>';
	}

	// ── Phase tracker (plan · implement · review) ─────────────────────────
	function phaseTracker(phases) {
		return '<div class="phases">' + phases.map(function (p, i) {
			var inner = p.status === 'done' ? ic('check', 10) : (p.status === 'active' ? '<span class="agdot agdot--running" style="width:6px;height:6px"></span>' : '');
			var bar = '';
			if (i < phases.length - 1) {
				var cls = p.status === 'done' ? 'filled' : (p.status === 'active' ? 'partial' : '');
				bar = '<span class="phase__bar ' + cls + '"></span>';
			}
			return '<div class="phase phase--' + p.status + '"><span class="phase__dot">' + inner + '</span><span class="phase__label">' + p.label + '</span>' + bar + '</div>';
		}).join('') + '</div>';
	}

	function execRow(r) {
		return '<div class="execrow' + (r.active ? ' active' : '') + '"><span class="execrow__icon">' + ic(ICON[r.kind] || 'dot', 15) + '</span>' +
			'<span class="execrow__title">' + r.title + '</span>' + (r.meta ? '<span class="execrow__meta">' + r.meta + '</span>' : '') + '</div>';
	}
	function fileRow(f) {
		var dir = f.path.replace(/\/[^/]+$/, '/');
		var name = f.path.split('/').pop();
		var stat = '';
		if (f.adds != null) stat += '<span class="add">+' + f.adds + '</span>';
		if (f.dels != null) stat += '<span class="del">−' + f.dels + '</span>';
		return '<div class="filerow"><span class="filerow__path"><span class="dir">' + dir + '</span>' + name + '</span><span class="filerow__stat">' + stat + '</span></div>';
	}

	// ── ExecutionLog (idle | running | needs | done) ──────────────────────
	function execlog(s) {
		if (s.kind === 'idle') {
			return '<div class="execlog"><div style="display:flex;align-items:center;gap:var(--space-5);padding:var(--space-7) var(--space-6)">' +
				'<div class="empty-state__icon" style="width:36px;height:36px">' + ic('zap', 18) + '</div>' +
				'<div style="flex:1"><div style="font-size:var(--text-13);font-weight:var(--fw-medium)">No agent has run yet</div>' +
				'<div style="font-size:var(--text-12);color:var(--fg-dim);margin-top:2px">Launch the plan → implement → review recipe against this issue.</div></div>' +
				'<button class="btn btn--primary btn--sm">' + ic('play', 13) + 'Launch agent</button></div></div>';
		}
		var chip = { running: ['running', 'Coding'], needs: ['needs', 'Needs you'], done: ['done', 'Completed'] }[s.kind];
		var head = '<div class="execlog__head">' + ic('zap', 15) + '<span class="execlog__run-id mono">' + s.runId + '</span>' +
			'<span class="spacer"></span>' +
			(s.mode ? '<span class="pill pill--neutral">' + s.mode + '</span>' : '') +
			'<span class="runchip runchip--' + chip[0] + '">' + (s.kind === 'running' ? '<span class="agdot agdot--running"></span>' : (s.kind === 'needs' ? ic('alert', 13) : ic('check', 13))) + chip[1] + '</span></div>';
		var rows = '<div class="execrows">' + s.rows.map(execRow).join('') + '</div>';
		var files = s.files ? '<div class="execfiles"><div style="font-size:var(--text-11);text-transform:uppercase;letter-spacing:var(--tracking-wide);color:var(--fg-dim);padding:var(--space-2) var(--space-4) var(--space-3);font-weight:600">' + s.files.length + ' files changed</div>' + s.files.map(fileRow).join('') + '</div>' : '';
		var wt = s.worktree ? '<div class="worktree">' +
			'<span class="wfact"><span class="wfact__k">branch</span>' + ic('branch', 13) + '<span class="wfact__v">' + s.worktree.branch + '</span></span>' +
			'<span class="wfact"><span class="wfact__k">worktree</span><span class="wfact__v">' + s.worktree.path + '</span></span>' +
			(s.worktree.pr ? '<span class="wfact"><span class="wfact__k">PR</span>' + ic('pr', 13) + '<span class="wfact__v"><a href="#">#' + s.worktree.pr + '</a></span></span>' : '') +
		'</div>' : '';
		return '<div class="execlog">' + head + phaseTracker(s.phases) + rows + files + wt + '</div>';
	}

	// ── Operator decision banner (lives on the issue) ─────────────────────
	function opbanner(o) {
		return '<div class="opbanner"><span class="opbanner__icon">' + ic('alert', 18) + '</span>' +
			'<div class="opbanner__body"><p class="opbanner__title">' + o.title + '</p>' +
			'<p class="opbanner__q">' + o.question + '</p>' +
			'<div class="opbanner__actions"><button class="btn btn--success btn--sm">' + ic('check', 13) + 'Approve</button>' +
			'<button class="btn btn--danger btn--sm">' + ic('x', 13) + 'Reject</button>' +
			'<button class="btn btn--ghost btn--sm">' + ic('comment', 13) + 'Comment</button></div></div></div>';
	}

	// ── Activity feed (connector links comments + system events) ──────────
	function feedItem(item) {
		var node, body;
		if (item.kind === 'comment') {
			node = '<div class="feeditem__node">' + SK.avatar(item.author) + '</div>';
			var replies = (item.replies && item.replies.length)
				? '<div class="comment-replies">' + item.replies.map(function (r) {
						return '<div class="reply"><div class="reply__node">' + SK.avatar(r.author, 'sm') + '</div>' +
							'<div class="comment-card"><div class="comment-card__head"><span class="comment-card__author">' + r.author.name + '</span><span class="comment-card__ts">' + r.ts + '</span></div><div class="comment-card__body">' + r.body + '</div></div></div>';
					}).join('') + '</div>'
				: '';
			body = '<div class="comment-card"><div class="comment-card__head"><span class="comment-card__author">' + item.author.name + '</span><span class="comment-card__ts">' + item.ts + '</span></div><div class="comment-card__body">' + item.body + '</div></div>' + replies;
		} else {
			var glyphCls = item.tone || '';
			node = '<div class="feeditem__node"><span class="node-glyph ' + glyphCls + '">' + ic(item.icon, 13) + '</span></div>';
			body = '<div class="sysevent">' + item.text + '<span class="ts">· ' + item.ts + '</span></div>';
		}
		return '<div class="feeditem">' + node + body + '</div>';
	}
	function feed(items) { return '<div class="feed">' + items.map(feedItem).join('') + '</div>'; }

	function composer(label) {
		return '<div class="composer"><div class="composer__box on-raised"><textarea class="composer__field" rows="2" placeholder="' + (label || 'Leave a comment…') + '"></textarea>' +
			'<div class="composer__bar"><button class="iconbtn" style="width:26px;height:26px">' + ic('doc', 15) + '</button>' +
			'<button class="iconbtn" style="width:26px;height:26px">' + ic('layers', 15) + '</button><span class="spacer"></span>' +
			'<button class="btn btn--primary btn--sm">' + ic('send', 13) + 'Comment</button></div></div></div>';
	}

	function sectionHead(t) { return '<div class="section-head"><span class="section-head__title">' + t + '</span><span class="section-head__line"></span></div>'; }

	// ── Properties rail — every prop ALWAYS shown (placeholder when empty) ─
	function prop(k, v, empty) {
		var val = empty ? '<span class="prop__empty">' + empty + '</span>' : '<span class="prop__v">' + v + '</span>';
		return '<div class="prop"><span class="prop__k">' + k + '</span>' + val + '</div>';
	}
	function rail(p) {
		var labels = (p.labels && p.labels.length) ? p.labels.map(SK.labelChip).join('') : null;
		var relations = p.relations ? p.relations.map(function (r) {
			return '<div class="prop"><span class="prop__k">' + r.k + '</span><span class="prop__v">' + SK.statusGlyph(r.status) + '<span class="mono" style="color:var(--fg-muted)">' + r.id + '</span><span class="truncate" style="color:var(--fg-dim);font-size:var(--text-12)">' + r.title + '</span></span></div>';
		}).join('') : '';
		return '' +
			'<div class="rail__group">' +
				prop('Status', SK.statusGlyph(p.status) + '<span>' + p.statusLabel + '</span>') +
				prop('Priority', SK.prioGlyph(p.prio) + '<span style="text-transform:capitalize">' + p.prio + '</span>') +
				prop('Assignee', p.assignee ? SK.avatar(p.assignee, 'sm') + '<span>' + p.assignee.name + '</span>' : null, p.assignee ? null : 'Unassigned') +
			'</div>' +
			'<div class="rail__group">' +
				prop('Labels', labels, labels ? null : 'Add label…') +
				prop('Project', p.project ? '<span class="row__project"><span class="dot"></span>' + p.project + '</span>' : null, p.project ? null : 'No project') +
				prop('Cycle', p.cycle, p.cycle ? null : 'No cycle') +
				prop('Estimate', p.est != null ? '<span class="mono">' + p.est + ' pts</span>' : null, p.est != null ? null : 'Add estimate…') +
				prop('Due date', p.due, p.due ? null : 'Add due date…') +
			'</div>' +
			(relations ? '<div class="rail__group">' + relations + '</div>' : '') +
			'<div class="rail__footer"><div>Created ' + p.created + '</div><div>Updated ' + p.updated + '</div></div>';
	}

	window.SK = window.SK || {};
	Object.assign(window.SK, { issueHead: issueHead, execlog: execlog, opbanner: opbanner, feed: feed, composer: composer, rail: rail, sectionHead: sectionHead });
})();

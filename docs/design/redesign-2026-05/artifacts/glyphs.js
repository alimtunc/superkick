/* Superkick reference — render helpers shared by list / board / detail.
   These document the exact glyph geometry and the data→DOM mapping once.
   Data objects mirror the real ui/src/types shapes (LinearIssueListItem,
   IssueStatus, IssuePriority, IssueLabel, IssueAssignee, IssueProject…). */
(function () {
	// ── Status glyph (StatusIconKind) — geometry matches the legend ──────
	var STATUS = {
		backlog: '<circle cx="8" cy="8" r="6" stroke="var(--status-backlog)" stroke-width="1.5" stroke-dasharray="1.6 2.2" stroke-linecap="round"/>',
		todo: '<circle cx="8" cy="8" r="6" stroke="var(--status-todo)" stroke-width="1.5"/>',
		progress: '<circle cx="8" cy="8" r="6" stroke="var(--status-progress)" stroke-width="1.5"/><circle cx="8" cy="8" r="3" stroke="var(--status-progress)" stroke-width="6" stroke-dasharray="11.3 18.85" transform="rotate(-90 8 8)"/>',
		review: '<circle cx="8" cy="8" r="6" stroke="var(--status-review)" stroke-width="1.5"/><circle cx="8" cy="8" r="3" stroke="var(--status-review)" stroke-width="6" stroke-dasharray="15.4 18.85" transform="rotate(-90 8 8)"/>',
		done: '<circle cx="8" cy="8" r="7" fill="var(--status-done)"/><path d="M5 8.2l2 2 4-4.2" stroke="#07140d" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
		cancelled: '<circle cx="8" cy="8" r="7" fill="var(--status-cancelled)"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--bg-app)" stroke-width="1.6" stroke-linecap="round"/>',
		needs: '<circle cx="8" cy="8" r="7" fill="var(--status-needs)"/><path d="M8 4.4v4.3" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="11.3" r="0.95" fill="#fff"/>'
	};
	function statusGlyph(kind, lg) {
		return '<svg class="glyph' + (lg ? ' glyph--lg' : '') + '" viewBox="0 0 16 16" fill="none">' + (STATUS[kind] || STATUS.todo) + '</svg>';
	}

	// ── Priority glyph (PriorityIconKind) ────────────────────────────────
	function prioGlyph(kind) {
		if (kind === 'urgent') return '<span class="prio urgent" title="Urgent">!</span>';
		var k = kind || 'none';
		return '<span class="prio ' + k + '" title="' + k + '"><span class="bar b1"></span><span class="bar b2"></span><span class="bar b3"></span></span>';
	}

	// ── Avatar (IssueAssignee | agent) — FIXED color via entity.av ───────
	function avatar(entity, size) {
		var cls = 'avatar';
		if (size === 'sm') cls += ' avatar--sm';
		if (size === 'lg') cls += ' avatar--lg';
		if (!entity) return '<span class="' + cls + ' avatar--empty" title="Unassigned">?</span>';
		if (entity.agent) cls += ' avatar--agent';
		cls += ' ' + entity.av;
		return '<span class="' + cls + '" title="' + entity.name + '">' + entity.initials + '</span>';
	}

	// ── Agent-state dot (TaskBadgeKind) ──────────────────────────────────
	function agentDot(kind) {
		if (!kind) return '';
		return '<span class="agdot agdot--' + kind + '" title="agent: ' + kind + '"></span>';
	}

	// ── Label chip (IssueLabel) ──────────────────────────────────────────
	function labelChip(label) {
		return '<span class="label-chip"><span class="dot" style="background:' + label.color + '"></span>' + label.name + '</span>';
	}

	window.SK = window.SK || {};
	window.SK.statusGlyph = statusGlyph;
	window.SK.prioGlyph = prioGlyph;
	window.SK.avatar = avatar;
	window.SK.agentDot = agentDot;
	window.SK.labelChip = labelChip;
})();

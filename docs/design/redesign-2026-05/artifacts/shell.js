/* Superkick reference — shared sidebar injector. Keeps surface pages DRY and
   coherent. The CANONICAL static markup is documented on app-shell.html;
   surface pages inject it as context. Call SK_SIDEBAR('issues'|'inbox'|…). */
function SK_SIDEBAR(active) {
	function item(key, icon, label, opts) {
		opts = opts || {};
		var cls = 'navitem' + (active === key ? ' navitem--active' : '');
		var trail = '';
		if (opts.count != null) trail = '<span class="navitem__count">' + opts.count + '</span>';
		if (opts.dot) trail = '<span class="navitem__dot agdot agdot--' + opts.dot + '"></span>';
		return '<div class="' + cls + '"><svg class="ic"><use href="#ic-' + icon + '"></use></svg>' + label + trail + '</div>';
	}
	return '' +
		'<div class="sidebar__brand"><div class="sidebar__logo">S</div>' +
		'<div class="sidebar__brandname">Superkick <span class="meta">· local</span></div></div>' +
		'<div class="sidebar__scroll">' +
			'<div class="navgroup">' +
				item('inbox', 'inbox', 'Inbox', { count: 3 }) +
				item('issues', 'issue', 'Issues', { count: 42 }) +
				item('agents', 'agent', 'Agents', { dot: 'running' }) +
				item('settings', 'settings', 'Settings') +
			'</div>' +
			'<div class="navgroup">' +
				'<div class="navgroup__label">Saved views</div>' +
				item('v1', 'pin', 'Needs you', { count: 2 }) +
				item('v2', 'star', 'My issues', { count: 11 }) +
				item('v3', 'pr', 'In review', { count: 4 }) +
				item('v4', 'clock', 'Shipped this week', { count: 7 }) +
			'</div>' +
		'</div>' +
		'<div class="sidebar__footer">' +
			'<div class="navitem"><span class="avatar av-1 avatar--sm">AT</span>Alim Tunç<svg class="ic" style="margin-left:auto;width:14px;height:14px"><use href="#ic-chevDown"></use></svg></div>' +
		'</div>';
}

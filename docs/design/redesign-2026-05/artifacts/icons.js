/* Superkick reference — shared icon sprite (minimal line icons, lucide-style
   geometry). Injected once into the DOM so every page can <use href="#ic-…">.
   Stroke uses currentColor; size is set by the .ic class at the call site. */
(function () {
	var SYMS = {
		inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
		issue: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
		agent: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
		settings: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
		search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
		filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
		plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
		chevDown: '<path d="m6 9 6 6 6-6"/>',
		chevRight: '<path d="m9 18 6-6-6-6"/>',
		more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
		star: '<polygon points="12 17.27 18.18 21 16.54 13.97 22 9.24 14.81 8.63 12 2 9.19 8.63 2 9.24 7.46 13.97 5.82 21"/>',
		pin: '<path d="M12 17v5"/><path d="M9 10.5V4h6v6.5l2.5 3.5h-11z"/>',
		branch: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
		pr: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9v12"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/>',
		check: '<path d="M20 6 9 17l-5-5"/>',
		x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
		clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
		comment: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
		play: '<polygon points="6 3 20 12 6 21 6 3"/>',
		pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
		terminal: '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>',
		external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
		send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
		layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
		zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
		doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M16 13H8"/><path d="M16 17H8"/>',
		folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
		arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
		history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
		alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
		user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
		cmd: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
		flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
		dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
		commit: '<circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>',
		sparkle: '<path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
		copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
		stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>'
	};
	var ns = 'http://www.w3.org/2000/svg';
	var svg = '<svg xmlns="' + ns + '" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">';
	for (var k in SYMS) {
		svg += '<symbol id="ic-' + k + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + SYMS[k] + '</symbol>';
	}
	svg += '</svg>';
	function inject() {
		var d = document.createElement('div');
		d.innerHTML = svg;
		document.body.insertBefore(d.firstChild, document.body.firstChild);
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
	else inject();
})();

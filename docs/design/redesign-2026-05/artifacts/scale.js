/* Superkick reference — scale-to-fit for full-app artboards.
   Renders a fixed-width design frame (true product proportions) and scales it
   down to the available column width. Engineering reads values from tokens.css,
   so visual scaling never affects the spec. */
(function () {
	function fit(frame) {
		var scaled = frame.querySelector('.scaled');
		if (!scaled) return;
		var natW = scaled.offsetWidth;
		var natH = scaled.offsetHeight;
		var avail = frame.clientWidth;
		var s = Math.min(1, avail / natW);
		scaled.style.transform = 'scale(' + s + ')';
		frame.style.height = (natH * s) + 'px';
	}
	function fitAll() { document.querySelectorAll('.scale-frame').forEach(fit); }
	window.addEventListener('resize', fitAll);
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(fitAll, 60); });
	else setTimeout(fitAll, 60);
	// re-fit once webfonts settle
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
	window.SK_FIT = fitAll;
})();

// Compatibility shim: load the per-app script after DOM is ready
(function(){
  try {
    if (window.__ankura_shim_vaak) return;
    window.__ankura_shim_vaak = true;
    function load() {
      try { console.debug('ankura-shim: loading vaak-smith.js'); } catch(e){}
      var s = document.createElement('script');
      s.src = 'vaak-smith.js';
      s.defer = true;
      document.body.appendChild(s);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
    else load();
  } catch (e) {
    console.error('Failed to load vaak-smith.js shim', e);
  }
})();

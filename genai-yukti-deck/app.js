// Compatibility shim: load the per-app script after DOM is ready
(function(){
  try {
    if (window.__ankura_shim_yukti) return;
    window.__ankura_shim_yukti = true;
    function load() {
      try { console.debug('ankura-shim: loading genai-yukti-deck.js'); } catch(e){}
      var s = document.createElement('script');
      s.src = 'genai-yukti-deck.js';
      s.defer = true;
      document.body.appendChild(s);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
    else load();
  } catch (e) {
    console.error('Failed to load genai-yukti-deck.js shim', e);
  }
})();

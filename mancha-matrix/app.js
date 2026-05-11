/* ═══════════════════════════════════════════════════════════════════
   Mancha-Matrix — Pinned-theater showtime comparison matrix
   ─────────────────────────────────────────────────────────
   Data flow:
     theater list (locked) → fetch per (theater, date) via Source
     → cache (10 min) → normalize → cluster (movie + format, 30 min)
     → filter (movie/lang/dim/muted theaters) → sort → render
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─── Framework init ────────────────────────────────────────────── */
  var ankura = window.AnkuraCore.init({
    backUrl: '../index.html',
    onReset: function () { resetSession(); },
    onDelete: function () { State.clearAll(); }
  });
  var State = ankura.State;

  /* ─── Constants ─────────────────────────────────────────────────── */
  var DEFAULT_PROXY = 'https://corsproxy.io/?{url}';
  var CACHE_TTL_MS = 10 * 60 * 1000;
  var CLUSTER_WINDOW_MS = 30 * 60 * 1000;

  // Bookmarklet v8 — Stable scraper with in-page overlay UI.
  //   • Extraction: same as v7 (anchor on a[href*="/movies/"] → text/alt).
  //   • UX: replaces alert() with an in-page floating card. Selectable
  //     textarea contains the JSON so user can copy by select-all/Ctrl+C
  //     OR use the Copy button. No more browser-alert OCR pain.
  //   • Envelope slimmed: drops heavy _ancestorChain, _movieLinksSample,
  //     _buyticketLinksSample, _headingsSample now that extraction works.
  //     Keeps _titleSources (first 5) for spot-checking.
  var BOOKMARKLET = "javascript:(function(){try{var T=/^\\s*(\\d{1,2}):(\\d{2})\\s*(AM|PM)?\\s*$/i,F=/\\b(2D|3D|4DX|IMAX|ScreenX|Dolby\\s*Cinema|ICE|PXL|Director's\\s*Cut)\\b/gi,L=/\\b(Hindi|English|Marathi|Tamil|Telugu|Kannada|Punjabi|Bengali|Malayalam|Gujarati)\\b/i,JUNK=/^(book|buy|cancel|close|pay|confirm|continue|select|apply|next|prev|previous|menu|search|home|back|skip|share|filter|sort|view|seats?|now|free|paid|sold|fast|few|hot|grid|list|gallery|tile|tab|info|ticket|tickets|showtimes?|schedule|all|today|tomorrow|date|time|new|popular|latest|trending|favorite|favorites|wishlist|profile|login|logout|help|about|contact|terms|privacy|cookies?|settings?|notifications?|theatres?|theaters?|cinemas?|movies?|placeholder|sign|sign\\s*in|sign\\s*up|sign\\s*out|signin|signup|signout|register|loading|error|warning|done|reset|delete|remove|edit|save|copy|paste|read\\s*more|see\\s*more|show\\s*more|view\\s*all|account|cart|wallet|offers?)$/i,UICLASS=/(^|[^a-z])(btn|button|nav|header|footer|menu|toolbar|toggle|sign|auth|login|signup|register|placeholder|input|search|dropdown|modal|popup|tooltip|spinner|loader|skeleton|cta|banner|advert|cookie|popover)([^a-z]|$)/i;function gc(el){if(!el||!el.className)return '';var c=el.className;return (typeof c==='string'?c:c.baseVal||'').toLowerCase()}function isUI(el){return UICLASS.test(gc(el))}function esc(s){return String(s).replace(/[<>&\"']/g,function(c){return{'<':'&lt;','>':'&gt;','&':'&amp;','\"':'&quot;','\\'':'&#39;'}[c]})}var els=document.querySelectorAll('a,button,span,div,p'),hits=[];for(var i=0;i<els.length;i++){var el=els[i];if(el.children.length>0)continue;var t=(el.textContent||'').trim();if(t.length<4||t.length>10)continue;if(T.test(t))hits.push({el:el,time:t})}if(!hits.length){alert('Mancha-Matrix: No showtime-shaped text found on this page. Open a cinema/showtimes page that lists times like 7:30 PM.');return}function vt(s){if(!s||typeof s!=='string')return false;var x=s.trim();if(x.length<2||x.length>150)return false;if(T.test(x))return false;if(/^[\\d:\\s]+$/.test(x))return false;if(JUNK.test(x))return false;return true}function tFromLink(a){if(!a||isUI(a))return null;var cands=[(a.textContent||'').trim(),(a.getAttribute('aria-label')||'').trim(),(a.getAttribute('title')||'').trim()];for(var i=0;i<cands.length;i++){if(vt(cands[i]))return{text:cands[i],src:'a[href*=/movies/].'+(i===0?'text':i===1?'aria':'title')}}var im=a.querySelector('img[alt]');if(im){var al=im.getAttribute('alt');if(al&&vt(al))return{text:al.trim(),src:'a[href*=/movies/] > img.alt'}}return null}function tIn(c){if(!c)return null;var mvLinks=c.querySelectorAll('a[href*=\"/movies/\"]');for(var i=0;i<mvLinks.length;i++){var r=tFromLink(mvLinks[i]);if(r)return r}var sels=['[class*=\"movie\" i]','[class*=\"event\" i]','h1','h2','h3','h4','h5','h6','[class*=\"title\" i]','[class*=\"name\" i]'];for(var i=0;i<sels.length;i++){var ns=c.querySelectorAll(sels[i]);for(var j=0;j<ns.length;j++){var el=ns[j];if(isUI(el))continue;var x=(el.textContent||'').trim();if(vt(x))return{text:x,src:el.tagName.toLowerCase()+'.'+gc(el).slice(0,40)}}}var ar=c.querySelector('[aria-label],[data-title]');if(ar&&!isUI(ar)){var at=ar.getAttribute('aria-label')||ar.getAttribute('data-title');if(at&&vt(at))return{text:at.trim(),src:'aria'}}var img=c.querySelector('img[alt]');if(img&&!isUI(img)){var alt=img.getAttribute('alt');if(alt&&vt(alt))return{text:alt.trim(),src:'img@alt'}}return null}function fT(leaf){var n=leaf;for(var d=0;d<12&&n;d++){n=n.parentElement;if(!n)break;var t=tIn(n);if(t)return t;var pv=n.previousElementSibling;if(pv){var t2=tIn(pv);if(t2)return t2}}return null}function fFL(leaf){var n=leaf,dim=null,lang=null,prem=null;for(var d=0;d<8&&n;d++){n=n.parentElement;if(!n)break;var txt=n.textContent||'',fm=txt.match(F);if(fm)fm.forEach(function(m){var u=m.toUpperCase();if(/4DX/.test(u)&&!dim)dim='4DX';else if(/IMAX/.test(u)&&!prem)prem='IMAX';else if(/DOLBY/.test(u)&&!prem)prem='Dolby Cinema';else if(/ICE/.test(u)&&!prem)prem='ICE';else if(/SCREENX/.test(u)&&!dim)dim='ScreenX';else if(/PXL/.test(u)&&!prem)prem='PXL';else if(/3D/.test(u)&&!dim)dim='3D';else if(/2D/.test(u)&&!dim)dim='2D'});var lm=txt.match(L);if(lm&&!lang)lang=lm[1];if(dim&&lang)break}return{dim:dim,lang:lang,prem:prem}}var shows=[],seen={},titleSources=[];hits.forEach(function(h){var to=fT(h.el),title=to?to.text:'(unknown)',src=to?to.src:'none',fl=fFL(h.el),url=(h.el.tagName==='A'&&h.el.href)||null,key=title+'|'+h.time+'|'+(fl.dim||'')+'|'+(fl.prem||'');titleSources.push({time:h.time,title:title,src:src});if(seen[key])return;seen[key]=true;shows.push({showTime:h.time,movieTitle:title,dimension:fl.dim||'2D',language:fl.lang||'English',premiumTech:fl.prem,bookingUrl:url})});var hasReal=shows.some(function(s){return s.movieTitle!=='(unknown)'});if(hasReal)shows=shows.filter(function(s){return s.movieTitle!=='(unknown)'});var venue={sourceUrl:location.href,pageTitle:document.title,hint:location.pathname},pp=location.pathname.split('/').filter(Boolean);for(var p=0;p<pp.length;p++){if(/^[A-Z][A-Z0-9]{2,8}$/.test(pp[p])){venue.code=pp[p];break}}var hd2=document.querySelectorAll('h1,h2,h3,h4,[class*=\"date\" i]'),dh=null;for(var hi=0;hi<hd2.length;hi++){var ht=hd2[hi].textContent.trim();if(/(\\d{1,2}\\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(ht)&&ht.length<60){dh=ht;break}}var env={_bookmarklet:'mancha-matrix-v8',_scrapeMethod:'dom',capturedAt:new Date().toISOString(),sourceUrl:location.href,pageTitle:document.title,venue:venue,dateHint:dh,shows:shows,rawCounts:{timesFound:hits.length,showsExtracted:shows.length},_titleSources:titleSources.slice(0,5)},j=JSON.stringify(env);if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(j).catch(function(){})}var old=document.getElementById('mm-ovr');if(old)old.remove();var b=document.createElement('div');b.id='mm-ovr';b.style.cssText='position:fixed;top:16px;right:16px;width:380px;max-height:85vh;background:#fff;color:#222;border:1px solid #d4a03c;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.25);padding:14px;z-index:2147483647;font:13px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;overflow:auto';var samples=titleSources.slice(0,3).map(function(s){return '<div style=\"padding:2px 0;color:#555\">'+esc(s.time)+' \\u2014 '+esc(s.title)+'</div>'}).join('');b.innerHTML='<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:8px\"><strong style=\"color:#d4a03c;font-size:15px\">\\ud83c\\udfac Mancha-Matrix v8</strong><button id=\"mm-x\" style=\"border:0;background:0;font-size:18px;cursor:pointer;color:#777;line-height:1;padding:0 4px\">\\u2715</button></div><div style=\"background:#f7f3e8;padding:10px;border-radius:4px;margin-bottom:10px\"><div style=\"color:#2ea44f;font-weight:600;margin-bottom:4px\">\\u2713 '+shows.length+' shows from '+hits.length+' time elements</div><div style=\"color:#555;font-size:12px\">JSON copied to clipboard. Switch to Mancha-Matrix \\u2192 Settings \\u2192 paste \\u2192 Import.</div></div>'+(samples?'<div style=\"background:#fafafa;padding:8px;border-radius:4px;margin-bottom:10px;font-size:12px\"><strong style=\"display:block;margin-bottom:4px\">Sample titles:</strong>'+samples+'</div>':'')+'<div style=\"display:flex;gap:8px;margin-bottom:8px\"><button id=\"mm-cp\" style=\"flex:1;padding:8px 12px;border:0;background:#d4a03c;color:#fff;border-radius:4px;cursor:pointer;font-weight:500\">\\ud83d\\udccb Copy JSON</button><button id=\"mm-tg\" style=\"flex:1;padding:8px 12px;border:1px solid #ccc;background:#fff;color:#222;border-radius:4px;cursor:pointer\">Show JSON</button></div><textarea id=\"mm-j\" readonly style=\"display:none;width:100%;height:180px;font:10px/1.4 Menlo,Consolas,monospace;padding:8px;border:1px solid #ccc;border-radius:4px;resize:vertical;background:#1a1a1a;color:#0f0;box-sizing:border-box\">'+esc(j)+'</textarea>';document.body.appendChild(b);document.getElementById('mm-x').onclick=function(){b.remove()};document.getElementById('mm-cp').onclick=function(){var ta=document.getElementById('mm-j');var wh=!ta.style.display||ta.style.display==='none';ta.style.display='block';ta.focus();ta.select();var ok=false;try{ok=document.execCommand('copy')}catch(e){}if(!ok&&navigator.clipboard){navigator.clipboard.writeText(j).catch(function(){});ok=true}if(wh)ta.style.display='none';var btn=this;btn.textContent=ok?'\\u2713 Copied':'\\u2717 Use Ctrl+C';setTimeout(function(){btn.textContent='\\ud83d\\udccb Copy JSON'},1500)};document.getElementById('mm-tg').onclick=function(){var ta=document.getElementById('mm-j');var h=!ta.style.display||ta.style.display==='none';ta.style.display=h?'block':'none';this.textContent=h?'Hide JSON':'Show JSON'}}catch(e){alert('Mancha-Matrix bookmarklet error: '+(e&&e.message?e.message:e))}})();";

  var DIMENSIONS = ['2D', '3D', '4DX', 'ScreenX'];
  var PREMIUM_TECH = ['IMAX', 'Dolby Cinema', 'ICE', 'PXL', "Director's Cut"];
  var LANGUAGES = ['HI', 'EN', 'MR', 'TA', 'TE', 'KN'];

  // Pinned theaters — real BMS venue codes (captured from each cinema's
  // BMS URL: /cinemas/pune/<slug>/buytickets/<CODE>/<date>).
  // Cinepolis (PUNB) + MovieMax (MATK) confirmed via bookmarklet capture.
  // Others still placeholders until first bookmarklet run on those pages.
  var PUNE_DEFAULT_THEATERS = [
    { name: 'Cinepolis: Seasons Mall',           bmsCode: 'PUNB', area: 'Hadapsar',     city: 'Pune', regionCode: 'PUNE' },
    { name: 'MovieMax: Amanora Town Centre',     bmsCode: 'MATK', area: 'Hadapsar',     city: 'Pune', regionCode: 'PUNE' },
    { name: 'Rajhans Cinemas: 93 Avenue Mall',   bmsCode: 'RC93', area: 'Fatima Nagar', city: 'Pune', regionCode: 'PUNE' },
    { name: 'City Pride: Nyati Plaza, Kharadi',  bmsCode: 'CPNK', area: 'Kharadi',      city: 'Pune', regionCode: 'PUNE' },
    { name: 'Bollywood Multiplex, Kharadi',      bmsCode: 'BWKH', area: 'Kharadi',      city: 'Pune', regionCode: 'PUNE' }
  ];

  /* ─── Persistent state (loaded once, written via setters) ────────── */
  var theaters     = State.load('mm_theaters', []);
  var sourceMode   = State.load('mm_source', 'paste'); // only 'paste' is valid now
  var viewMode     = State.load('mm_view', 'movie');   // 'movie' | 'theater'
  var sortDir      = State.load('mm_sort_dir', 'asc');
  var filters      = State.load('mm_filters', { movies: [], languages: [], dimensions: [], mutedTheaters: [] });
  var cache        = State.load('mm_cache', {});
  var cacheTs      = State.load('mm_cache_ts', 0);
  var lastFetchError = null;

  /* ─── Transient UI state ──────────────────────────────────────── */
  var activeTimeSlots = State.load('mm_time_slots', {}); // persisted with other filters

  /* ─── One-time migration from older MM versions ──────────────── */
  (function migrate() {
    var dirty = false;
    // Source mode: only 'paste' is valid now (was 'mock' or 'bms' before)
    if (sourceMode !== 'paste') {
      sourceMode = 'paste';
      State.save('mm_source', 'paste');
      State.clear('mm_proxy_url'); // also retired
      dirty = true;
    }
    // Theater names: replace old defaults with web-verified ones (detect by
    // old bmsCodes or the misspelled "Rajan Cinema")
    var hasOldDefaults = theaters.some(function (t) {
      return ['CPSM','MMAM','MXAM','CPNP','BMKH'].indexOf(t.bmsCode) !== -1 || /^Rajan Cinema/i.test(t.name || '');
    });
    if (hasOldDefaults) {
      theaters = PUNE_DEFAULT_THEATERS.slice();
      State.save('mm_theaters', theaters);
      dirty = true;
    }
    // Cache: old shape was nested (cache[code][date]); new is flat (cache['code|date'])
    var sampleKey = Object.keys(cache)[0];
    var oldShape = sampleKey && sampleKey.indexOf('|') === -1;
    if (oldShape || dirty) {
      cache = {};
      cacheTs = 0;
      State.clear('mm_cache');
      State.clear('mm_cache_ts');
    }
    // Filter migration: filters.movie (single string) → filters.movies (array, multi-select)
    if (filters.movie !== undefined) {
      filters.movies = filters.movie ? [filters.movie] : [];
      delete filters.movie;
      State.save('mm_filters', filters);
      dirty = true;
    }
  })();

  /* ─── Date helpers ──────────────────────────────────────────────── */
  function isoDate(d) {
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function todayISO() { return isoDate(new Date()); }
  function tomorrowISO() { var d = new Date(); d.setDate(d.getDate() + 1); return isoDate(d); }
  function fmtTime(iso) {
    try {
      var d = new Date(iso);
      var h = d.getHours(), m = d.getMinutes();
      var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
      return pad(h) + ':' + pad(m);
    } catch (e) { return '—'; }
  }
  function fmtRuntime(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return m + 'm';
    return h + 'h ' + m + 'm';
  }
  function chipSeatClass(seatsLabel) {
    if (!seatsLabel) return '';
    if (seatsLabel === 'Sold out') return ' mm-chip--sold-out';
    if (seatsLabel === 'Filling fast' || seatsLabel === 'Few left') return ' mm-chip--urgent';
    return '';
  }
  function chipSeatBadge(seatsLabel) {
    if (!seatsLabel || seatsLabel === 'Available') return '';
    return '<span class="mm-chip__seats-label">' + escapeHtml(seatsLabel) + '</span>';
  }
  function chipEndTime(show) {
    return fmtTime(new Date(new Date(show.startISO).getTime() + show.runtimeMin * 60000).toISOString());
  }
  function fmtDayLabel(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var today = todayISO();
    var tomorrow = tomorrowISO();
    var weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
    var dateBit = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (dateStr === today)    return 'Today · ' + weekday + ', ' + dateBit;
    if (dateStr === tomorrow) return 'Tomorrow · ' + weekday + ', ' + dateBit;
    return weekday + ', ' + dateBit;
  }
  function minsAgo(ts) { return Math.max(0, Math.floor((Date.now() - ts) / 60000)); }

  /* ═══════════════════════════════════════════════════════════════════
     §1  DATA SOURCES — pluggable
     ═══════════════════════════════════════════════════════════════════ */

  // Only one source mode: bookmarklet paste. Data lives in the cache after
  // importFromBmsPaste() writes it; this fetcher just reads back what's there.
  var Sources = {
    paste: {
      label: 'Bookmarklet (paste-driven)',
      fetchTheaterDate: function (theater, dateStr) {
        var cached = cache[cacheKey(theater.bmsCode, dateStr)];
        return Promise.resolve(cached || []);
      }
    }
  };

  function normalizeLang(raw) {
    if (!raw) return 'EN';
    var s = String(raw).toLowerCase();
    if (s.indexOf('hindi') !== -1) return 'HI';
    if (s.indexOf('marath') !== -1) return 'MR';
    if (s.indexOf('tamil') !== -1) return 'TA';
    if (s.indexOf('telug') !== -1) return 'TE';
    if (s.indexOf('kanna') !== -1) return 'KN';
    if (s.indexOf('engl') !== -1) return 'EN';
    return String(raw).slice(0, 2).toUpperCase();
  }
  function normalizeDim(raw) {
    if (!raw) return '2D';
    var s = String(raw).toUpperCase();
    if (s.indexOf('4DX') !== -1) return '4DX';
    if (s.indexOf('3D')  !== -1) return '3D';
    if (s.indexOf('SCREENX') !== -1 || s.indexOf('SCREEN X') !== -1) return 'ScreenX';
    return '2D';
  }
  function normalizePremium(raw) {
    if (!raw) return null;
    var s = String(raw).toUpperCase();
    if (s.indexOf('IMAX')  !== -1) return 'IMAX';
    if (s.indexOf('DOLBY') !== -1) return 'Dolby Cinema';
    if (s.indexOf('ICE')   !== -1) return 'ICE';
    if (s.indexOf('PXL')   !== -1) return 'PXL';
    if (s.indexOf('DIRECTOR') !== -1) return "Director's Cut";
    return null;
  }
  function combineDateTime(dateStr, timeStr) {
    // Accepts "10:30 AM" / "22:15" / "1030" / ISO. Builds a local-tz ISO.
    var t = String(timeStr).trim();
    var h = 0, m = 0;
    var ampmMatch = t.match(/^(\d{1,2}):?(\d{2})\s*(AM|PM)?$/i);
    if (ampmMatch) {
      h = parseInt(ampmMatch[1], 10);
      m = parseInt(ampmMatch[2], 10);
      var ampm = (ampmMatch[3] || '').toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
    } else if (t.match(/^\d{4}$/)) {
      h = parseInt(t.slice(0, 2), 10);
      m = parseInt(t.slice(2), 10);
    } else if (t.match(/^\d{4}-\d{2}-\d{2}T/)) {
      return new Date(t).toISOString();
    }
    var d = new Date(dateStr + 'T00:00:00');
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }
  function formatPrices(arr) {
    if (!arr || !arr.length) return '';
    var prices = arr.map(function (p) { return parseInt(p.price || p.Price || p.amount || 0, 10); }).filter(Boolean);
    if (!prices.length) return '';
    var min = Math.min.apply(null, prices), max = Math.max.apply(null, prices);
    return '₹' + min + (min !== max ? '–₹' + max : '');
  }
  function formatAvail(raw) {
    if (!raw) return '';
    var s = String(raw).toLowerCase();
    if (s.indexOf('sold')  !== -1) return 'Sold out';
    if (s.indexOf('fill')  !== -1) return 'Filling fast';
    if (s.indexOf('few')   !== -1) return 'Few left';
    if (s.indexOf('avail') !== -1) return 'Available';
    return String(raw);
  }

  /* ─── Bookmarklet paste import ─────────────────────────────────── */
  // Accepts the envelope copied to clipboard by BOOKMARKLET (above), validates,
  // normalizes shows to NormalizedShow shape, merges into mm_cache.
  function importFromBmsPaste(text) {
    if (!text || !text.trim()) { alert('Paste is empty.'); return; }
    var env;
    try { env = JSON.parse(text); }
    catch (e) { alert('Invalid JSON: ' + e.message); return; }

    var validVersions = ['mancha-matrix-v1', 'mancha-matrix-v2', 'mancha-matrix-v3', 'mancha-matrix-v4', 'mancha-matrix-v5', 'mancha-matrix-v6', 'mancha-matrix-v7', 'mancha-matrix-v8'];
    if (!env || validVersions.indexOf(env._bookmarklet) === -1) {
      if (!confirm('Payload doesn\'t look like a Mancha-Matrix bookmarklet capture. Try to import anyway?')) return;
    }
    if (!Array.isArray(env.shows) || !env.shows.length) {
      alert('No shows found in payload. Make sure the bookmarklet was clicked on a BMS showtimes page.');
      return;
    }

    // Resolve the date: v2 envelopes carry only HH:MM strings + a dateHint heading.
    var dateForShows = parseDateHint(env.dateHint) || todayISO();

    // Match bookmarklet's venue to a pinned theater (try venue obj + page title + URL)
    var venueName = env.venue && (env.venue.venueName || env.venue.cinemaName || env.venue.name) || env.pageTitle || '';
    var venueCode = env.venue && (env.venue.venueCode || env.venue.cinemaCode || env.venue.code) || '';
    function fuzzyMatch(t) {
      if (venueCode && t.bmsCode === venueCode) return true;
      if (venueName && t.name) {
        var a = venueName.toLowerCase(), b = t.name.toLowerCase();
        if (a.indexOf(b.split(/\s+/)[0]) !== -1) return true;
        if (b.indexOf(a.split(/\s+/)[0]) !== -1) return true;
      }
      return false;
    }
    var theater = theaters.find(fuzzyMatch);
    if (!theater) {
      var hint = (venueName || '(unknown)') + (venueCode ? ' / ' + venueCode : '');
      var choices = theaters.map(function (t, i) { return (i + 1) + '. ' + t.name + ' (' + t.bmsCode + ')'; }).join('\n');
      var pick = window.prompt(
        'Could not auto-match BMS venue to a pinned theater.\n\n' +
        'Detected: ' + hint + '\n\n' +
        'Pinned theaters:\n' + choices + '\n\n' +
        'Enter a number (1-' + theaters.length + ') to assign this paste to that theater, or Cancel.',
        '1'
      );
      var idx = parseInt(pick, 10) - 1;
      if (isNaN(idx) || idx < 0 || idx >= theaters.length) return;
      theater = theaters[idx];
    }

    // Normalize each raw show into NormalizedShow shape, group by date
    var byDate = {};
    env.shows.forEach(function (raw, i) {
      var startISO = pickStartISO(raw, dateForShows);
      if (!startISO) return;
      var dateStr = startISO.slice(0, 10);
      var movieTitle = raw.eventTitle || raw.EventTitle || raw.movieTitle || raw.MovieTitle || raw.title || raw.name || 'Unknown';
      var movieId = raw.eventCode || raw.EventCode || raw.id || raw.eventId || ('mv-' + movieTitle.toLowerCase().replace(/\s+/g, '-').slice(0, 20));
      var lang = normalizeLang(raw.language || raw.Language || raw.lang);
      var dim = normalizeDim(raw.dimension || raw.Dimension || raw.format || raw.eventDimension);
      var premium = normalizePremium(raw.experience || raw.eventGenre || raw.audi || raw.Genre || raw.eventGenres);
      var runtime = parseInt(raw.runtime || raw.Length || raw.runtimeInMinutes || raw.duration || 120, 10);
      var endISO = new Date(new Date(startISO).getTime() + runtime * 60000).toISOString();

      var show = {
        showId:      raw.sessionId || raw.SessionId || raw.showId || (theater.bmsCode + '-' + dateStr + '-' + i),
        theaterCode: theater.bmsCode,
        theaterName: theater.name,
        theaterArea: theater.area,
        movieId:     movieId,
        movieTitle:  movieTitle,
        language:    lang,
        dimension:   dim,
        premiumTech: premium,
        runtimeMin:  runtime,
        startISO:    startISO,
        endISO:      endISO,
        bookingUrl:  raw.bookingUrl || raw.URL || env.sourceUrl || 'https://in.bookmyshow.com/',
        priceRange:  formatPrices(raw.priceCategory || raw.Categories || raw.prices),
        seatsLabel:  formatAvail(raw.availability || raw.Availability || raw.seatStatus)
      };
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push(show);
    });

    if (!Object.keys(byDate).length) {
      alert(
        'Found ' + env.shows.length + ' raw show entries but couldn\'t extract any show times. ' +
        'BMS may have changed its page shape. Open the bookmarklet output and share a sample so the parser can be adjusted.'
      );
      return;
    }

    // Merge into cache + persist (FLAT key shape — readCacheAll() expects this)
    if (!cache) cache = {};
    Object.keys(byDate).forEach(function (d) { cache[cacheKey(theater.bmsCode, d)] = byDate[d]; });
    cacheTs = Date.now();
    State.save('mm_cache', cache);
    State.save('mm_cache_ts', cacheTs);

    var totalShows = 0;
    Object.keys(byDate).forEach(function (d) { totalShows += byDate[d].length; });
    var dates = Object.keys(byDate).sort().join(', ');
    alert('✓ Imported ' + totalShows + ' shows for ' + theater.name + ' (' + dates + ')');
    renderAll();
  }

  // Permissive start-time extractor — handles ISO strings, "10:30 AM", "1830", or
  // separate date+time fields. Accepts an optional fallback date for v2 (DOM-scraped)
  // shows that only carry HH:MM AM/PM strings.
  function pickStartISO(raw, fallbackDate) {
    var t = raw.showDateTime || raw.ShowDateTime || raw.startISO || raw.startDateTime || raw.sessionDateTime;
    if (t) { try { return new Date(t).toISOString(); } catch (e) {} }
    var d = raw.dateCode || raw.dateString || raw.showDate || raw.ShowDate || raw.date || fallbackDate;
    var hm = raw.showTime || raw.ShowTime || raw.startTime || raw.startTimeStr || raw.sessionTime;
    if (d && hm) {
      var iso = String(d);
      if (/^\d{8}$/.test(iso)) iso = iso.slice(0, 4) + '-' + iso.slice(4, 6) + '-' + iso.slice(6, 8);
      else if (/^\d{4}-\d{2}-\d{2}/.test(iso)) iso = iso.slice(0, 10);
      try { return combineDateTime(iso, hm); } catch (e) {}
    }
    return null;
  }

  // Parse a heading like "Sun 10 May" / "10 May 2026" / "Today, 10 May" into YYYY-MM-DD,
  // assuming the year is the current year when missing. Returns null if no match.
  function parseDateHint(s) {
    if (!s) return null;
    var months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    var m = String(s).match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:[a-z]*)?\s*(\d{4})?/i);
    if (!m) return null;
    var day = parseInt(m[1], 10);
    var mon = months[m[2].toLowerCase().slice(0,3)];
    var year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
    if (mon == null || isNaN(day)) return null;
    var d = new Date(year, mon, day);
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ═══════════════════════════════════════════════════════════════════
     §2  CACHE + FETCH ORCHESTRATION
     ═══════════════════════════════════════════════════════════════════ */

  function cacheKey(theaterCode, dateStr) { return theaterCode + '|' + dateStr; }

  function readCacheAll() {
    // Returns flat array of all shows currently cached for active theaters & today/tomorrow
    var out = [];
    var dates = [todayISO(), tomorrowISO()];
    theaters.forEach(function (t) {
      dates.forEach(function (d) {
        var entry = cache[cacheKey(t.bmsCode, d)];
        if (entry && Array.isArray(entry)) out = out.concat(entry);
      });
    });
    return out;
  }

  function isCacheFresh() {
    return cacheTs && (Date.now() - cacheTs) < CACHE_TTL_MS;
  }

  // The only data path is the bookmarklet paste-import (writes to cache directly).
  // Refresh is just a re-render trigger now — useful if filters/sorts changed
  // outside the normal event flow.
  function refresh(/* force */) {
    lastFetchError = null;
    renderAll();
    return Promise.resolve();
  }

  function clearCache() {
    cache = {};
    cacheTs = 0;
    State.clear('mm_cache');
    State.clear('mm_cache_ts');
  }

  function clearTheaterCache(bmsCode) {
    var prefix = bmsCode + '|';
    Object.keys(cache).forEach(function (k) {
      if (k.indexOf(prefix) === 0) delete cache[k];
    });
    State.save('mm_cache', cache);
  }

  /* ═══════════════════════════════════════════════════════════════════
     §3  CLUSTERING + FILTER + SORT
     ═══════════════════════════════════════════════════════════════════ */

  // clusterShows: groups by (movieId, dimension, premiumTech) within 30-min windows
  function clusterShows(shows) {
    var groups = {};
    shows.forEach(function (s) {
      var key = s.movieId + '|' + s.dimension + '|' + (s.premiumTech || 'none');
      (groups[key] = groups[key] || []).push(s);
    });
    var clusters = [];
    Object.keys(groups).forEach(function (k) {
      var arr = groups[k].slice().sort(function (a, b) { return new Date(a.startISO) - new Date(b.startISO); });
      var current = null;
      arr.forEach(function (s) {
        var t = new Date(s.startISO).getTime();
        if (!current || (t - new Date(current.shows[0].startISO).getTime()) > CLUSTER_WINDOW_MS) {
          current = {
            movieId: s.movieId, movieTitle: s.movieTitle, language: s.language,
            dimension: s.dimension, premiumTech: s.premiumTech, runtimeMin: s.runtimeMin,
            shows: [s]
          };
          clusters.push(current);
        } else {
          current.shows.push(s);
        }
      });
    });
    return clusters;
  }

  // clusterShowsByTheater: groups shows by theatre first, then clusters within each theatre
  function clusterShowsByTheater(shows) {
    var byTheater = {};
    shows.forEach(function (s) {
      if (!byTheater[s.theaterCode]) byTheater[s.theaterCode] = [];
      byTheater[s.theaterCode].push(s);
    });
    var result = [];
    theaters.forEach(function (t) {
      var tShows = byTheater[t.bmsCode] || [];
      if (!tShows.length) return;
      var clusters = clusterShows(tShows);
      var sorted = sortClusters(clusters);
      result.push({ theaterCode: t.bmsCode, theaterName: t.name, clusters: sorted });
    });
    return result;
  }

  function applyFilters(clusters) {
    var muted = filters.mutedTheaters || [];
    return clusters
      .map(function (c) {
        // Drop muted-theater shows from the cluster
        var kept = c.shows.filter(function (s) { return muted.indexOf(s.theaterCode) === -1; });
        if (!kept.length) return null;
        return Object.assign({}, c, { shows: kept });
      })
      .filter(Boolean)
      .filter(function (c) {
        if (filters.movies && filters.movies.length && filters.movies.indexOf(c.movieId) === -1) return false;
        if (filters.languages && filters.languages.length && filters.languages.indexOf(c.language) === -1) return false;
        if (filters.dimensions && filters.dimensions.length && filters.dimensions.indexOf(c.dimension) === -1) return false;
        return true;
      });
  }

  function hidePastShows(clusters) {
    var now = Date.now();
    return clusters
      .map(function (c) {
        var kept = c.shows.filter(function (s) {
          // Keep show if it hasn't ended yet
          return new Date(s.endISO).getTime() > now;
        });
        if (!kept.length) return null;
        return Object.assign({}, c, { shows: kept });
      })
      .filter(Boolean);
  }

  function clusterEarliest(c) {
    return c.shows.reduce(function (min, s) {
      var t = new Date(s.startISO).getTime();
      return t < min ? t : min;
    }, Infinity);
  }

  function sortClusters(clusters) {
    var dir = sortDir === 'desc' ? -1 : 1;
    return clusters.slice().sort(function (a, b) {
      return (clusterEarliest(a) - clusterEarliest(b)) * dir;
    });
  }

  function clustersByDate(allClusters) {
    var byDate = {};
    [todayISO(), tomorrowISO()].forEach(function (d) { byDate[d] = []; });
    allClusters.forEach(function (c) {
      // Use date of earliest show in cluster
      var d = c.shows[0].startISO.slice(0, 10);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(c);
    });
    return byDate;
  }

  /* ═══════════════════════════════════════════════════════════════════
     §4  RENDER — pinned strip, filter pills, matrix
     ═══════════════════════════════════════════════════════════════════ */


  function renderCacheAge() {
    var el = document.getElementById('mm-cache-age');
    if (!el) return;
    if (!cacheTs) { el.hidden = true; return; }
    el.hidden = false;
    var mins = minsAgo(cacheTs);
    el.textContent = mins === 0 ? 'Just refreshed' : ('Updated ' + mins + ' min ago');
    el.classList.toggle('mm-cache-age--stale', mins >= 10);
  }

  function setStatusBanner(text, isError) {
    var c = document.getElementById('mm-matrix-container');
    if (!c) return;
    var existing = c.querySelector('.mm-status-banner');
    if (existing) existing.remove();
    if (!text) return;
    var b = document.createElement('div');
    b.className = 'mm-status-banner' + (isError ? ' mm-status-banner--error' : '');
    b.textContent = text;
    c.insertBefore(b, c.firstChild);
  }

  function buildFilterPills() {
    // Movie picker — sourced from active clusters, but we use cached shows directly
    // so the dropdown survives filtering.
    var allShows = readCacheAll();
    var movies = {};
    allShows.forEach(function (s) { movies[s.movieId] = s.movieTitle; });
    var movieItems = Object.keys(movies).sort(function (a, b) {
      return movies[a].localeCompare(movies[b]);
    }).map(function (id) { return { value: id, label: movies[id] }; });
    var host = document.getElementById('mm-movie-filter-host');
    if (host) {
      host.innerHTML = '';
      var smartFilter = makeSmartFilter({
        summaryLabel: 'movies',
        allLabel: 'All movies',
        items: movieItems,
        selected: filters.movies || [],
        invertLogic: false,
        onChange: function (selected) {
          filters.movies = selected;
          State.save('mm_filters', filters);
          renderMatrix();
        }
      });
      host.appendChild(smartFilter);
    }

    // Language pills — only those present in cached data
    var langs = {};
    allShows.forEach(function (s) { langs[s.language] = true; });
    var langContainer = document.getElementById('mm-filter-lang');
    if (langContainer) {
      langContainer.innerHTML = '';
      LANGUAGES.filter(function (l) { return langs[l]; }).forEach(function (l) {
        langContainer.appendChild(makePill(l, l, (filters.languages || []).indexOf(l) !== -1, function () {
          toggleArrayFilter('languages', l);
        }));
      });
    }

    // Dimension pills — only those present
    var dims = {};
    allShows.forEach(function (s) { dims[s.dimension] = true; });
    var dimContainer = document.getElementById('mm-filter-dim');
    if (dimContainer) {
      dimContainer.innerHTML = '';
      DIMENSIONS.filter(function (d) { return dims[d]; }).forEach(function (d) {
        dimContainer.appendChild(makePill(d, d, (filters.dimensions || []).indexOf(d) !== -1, function () {
          toggleArrayFilter('dimensions', d);
        }));
      });
    }

    // Theater smart multi-select (inverse logic: selected = visible, not in mutedTheaters)
    var theaterHost = document.getElementById('mm-theater-filter-host');
    if (theaterHost && theaters.length) {
      theaterHost.innerHTML = '';
      var allTheaterCodes = theaters.map(function (t) { return t.bmsCode; });
      var visibleTheaters = allTheaterCodes.filter(function (code) {
        return (filters.mutedTheaters || []).indexOf(code) === -1;
      });
      var theaterItems = theaters.map(function (t) {
        return { value: t.bmsCode, label: t.name };
      });
      var smartFilter = makeSmartFilter({
        summaryLabel: 'theaters',
        allLabel: 'All theaters',
        items: theaterItems,
        selected: visibleTheaters,
        invertLogic: true,
        onChange: function (visible) {
          var muted = allTheaterCodes.filter(function (code) {
            return visible.indexOf(code) === -1;
          });
          filters.mutedTheaters = muted;
          State.save('mm_filters', filters);
          renderMatrix();
        }
      });
      theaterHost.appendChild(smartFilter);
    }

    // Time-slot filter pills (only shown in theater view)
    var timeSlotContainer = document.getElementById('mm-filter-timeslot');
    if (timeSlotContainer) {
      timeSlotContainer.innerHTML = '';
      if (viewMode === 'theater') {
        var slots = ['morning', 'afternoon', 'evening', 'night'];
        var slotLabels = {
          'morning': '🌅 Morning (6–12)',
          'afternoon': '☀️ Afternoon (12–17)',
          'evening': '🌆 Evening (17–21)',
          'night': '🌙 Night (21+)'
        };
        slots.forEach(function(slot) {
          timeSlotContainer.appendChild(makePill(
            slot, slotLabels[slot],
            activeTimeSlots[slot] || false,
            function() {
              activeTimeSlots[slot] = !activeTimeSlots[slot];
              State.save('mm_time_slots', activeTimeSlots);
              renderMatrix();
            }
          ));
        });
      }
    }
  }

  function updateViewToggleUI() {
    document.querySelectorAll('#mm-view-toggle button').forEach(function (btn) {
      btn.classList.toggle('mm-pill--active', btn.dataset.view === viewMode);
    });
  }

  function makePill(value, label, active, onClick) {
    var btn = document.createElement('button');
    btn.className = 'mm-pill' + (active ? ' mm-pill--active' : '');
    btn.dataset.value = value;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // Smart multi-select dropdown filter component
  function makeSmartFilter(opts) {
    var container = document.createElement('div');
    container.className = 'mm-smart-filter';
    var trigger = document.createElement('button');
    trigger.className = 'mm-smart-filter__trigger';
    var label = document.createElement('span');
    label.className = 'mm-smart-filter__trigger-label';
    var chevron = document.createElement('span');
    chevron.className = 'mm-smart-filter__trigger-chevron';
    chevron.textContent = '▾';
    trigger.appendChild(label);
    trigger.appendChild(chevron);
    var panel = document.createElement('div');
    panel.className = 'mm-smart-filter__panel';
    panel.hidden = true;
    var updateTriggerLabel = function () {
      var selected = opts.selected || [];
      if (selected.length === 0 || selected.length === opts.items.length) {
        label.textContent = opts.allLabel;
      } else if (selected.length === 1) {
        var item = opts.items.find(function (it) { return it.value === selected[0]; });
        label.textContent = item ? item.label : 'Mixed';
      } else {
        label.textContent = selected.length + ' ' + (opts.summaryLabel || '');
      }
    };
    var updatePanel = function () {
      var selected = opts.selected || [];
      // Rebuild checkboxes to reflect current state
      var items = panel.querySelector('.mm-smart-filter__list');
      if (items) {
        items.querySelectorAll('input[type="checkbox"]').forEach(function (cb, i) {
          cb.checked = selected.indexOf(opts.items[i].value) !== -1;
        });
      }
    };
    var setSelected = function (newSelected) {
      opts.selected = newSelected || [];
      updateTriggerLabel();
      updatePanel();
      if (opts.onChange) opts.onChange(opts.selected);
    };
    var actions = document.createElement('div');
    actions.className = 'mm-smart-filter__actions';
    var allBtn = document.createElement('button');
    allBtn.className = 'mm-smart-filter__action';
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', function () {
      setSelected(opts.items.map(function (it) { return it.value; }));
    });
    var noneBtn = document.createElement('button');
    noneBtn.className = 'mm-smart-filter__action';
    noneBtn.textContent = 'None';
    noneBtn.addEventListener('click', function () { setSelected([]); });
    var invertBtn = document.createElement('button');
    invertBtn.className = 'mm-smart-filter__action';
    invertBtn.textContent = 'Invert';
    invertBtn.addEventListener('click', function () {
      var selected = opts.selected || [];
      var allValues = opts.items.map(function (it) { return it.value; });
      var inverted = allValues.filter(function (v) { return selected.indexOf(v) === -1; });
      setSelected(inverted);
    });
    actions.appendChild(allBtn);
    actions.appendChild(noneBtn);
    actions.appendChild(invertBtn);
    var list = document.createElement('div');
    list.className = 'mm-smart-filter__list';
    opts.items.forEach(function (item) {
      var itemRow = document.createElement('div');
      itemRow.className = 'mm-smart-filter__item';
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = item.value;
      checkbox.checked = (opts.selected || []).indexOf(item.value) !== -1;
      checkbox.addEventListener('change', function () {
        var selected = opts.selected || [];
        if (checkbox.checked && selected.indexOf(item.value) === -1) {
          selected = selected.slice();
          selected.push(item.value);
        } else if (!checkbox.checked && selected.indexOf(item.value) !== -1) {
          selected = selected.filter(function (v) { return v !== item.value; });
        }
        setSelected(selected);
      });
      var itemLabel = document.createElement('label');
      itemLabel.className = 'mm-smart-filter__item-label';
      itemLabel.textContent = item.label;
      itemLabel.addEventListener('click', function () { checkbox.click(); });
      var onlyBtn = document.createElement('button');
      onlyBtn.className = 'mm-smart-filter__only';
      onlyBtn.textContent = 'Only';
      onlyBtn.addEventListener('click', function () { setSelected([item.value]); });
      itemRow.appendChild(checkbox);
      itemRow.appendChild(itemLabel);
      itemRow.appendChild(onlyBtn);
      list.appendChild(itemRow);
    });
    panel.appendChild(actions);
    panel.appendChild(list);
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
    });
    var closePanel = function () { panel.hidden = true; };
    document.addEventListener('mousedown', function (e) {
      if (!container.contains(e.target)) closePanel();
    });
    container.appendChild(trigger);
    container.appendChild(panel);
    updateTriggerLabel();
    return container;
  }

  function toggleArrayFilter(key, value) {
    var arr = (filters[key] || []).slice();
    var idx = arr.indexOf(value);
    if (idx === -1) arr.push(value); else arr.splice(idx, 1);
    filters[key] = arr;
    State.save('mm_filters', filters);
    renderMatrix();
    buildFilterPills();
  }

  // Show-level filter helpers (theater view bypasses clustering, so we apply
  // the same filters at the show level)
  function applyFiltersToShows(shows) {
    var muted = filters.mutedTheaters || [];
    return shows.filter(function (s) {
      if (muted.indexOf(s.theaterCode) !== -1) return false;
      if (filters.movies && filters.movies.length && filters.movies.indexOf(s.movieId) === -1) return false;
      if (filters.languages && filters.languages.length && filters.languages.indexOf(s.language) === -1) return false;
      if (filters.dimensions && filters.dimensions.length && filters.dimensions.indexOf(s.dimension) === -1) return false;
      return true;
    });
  }
  function hidePastShowsFromList(shows) {
    var now = Date.now();
    return shows.filter(function (s) { return new Date(s.endISO).getTime() > now; });
  }

  function getTimeSlot(isoString) {
    var hour = new Date(isoString).getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  function filterShowsByTimeSlot(shows, activeSlots) {
    var hasActive = Object.keys(activeSlots).some(function(k) { return activeSlots[k]; });
    if (!hasActive) return shows;
    return shows.filter(function(s) { return activeSlots[getTimeSlot(s.startISO)]; });
  }

  function computeTheaterStats(shows) {
    var movieIds = {};
    var earliest = Infinity, latest = -Infinity;
    shows.forEach(function(s) {
      movieIds[s.movieId] = true;
      var t = new Date(s.startISO).getTime();
      if (t < earliest) earliest = t;
      if (t > latest) latest = t;
    });
    return {
      movieCount: Object.keys(movieIds).length,
      showCount: shows.length,
      earliestTime: earliest === Infinity ? null : new Date(earliest).toISOString(),
      latestTime: latest === Infinity ? null : new Date(latest).toISOString()
    };
  }

  function renderMatrix() {
    var c = document.getElementById('mm-matrix-container');
    if (!c) return;

    if (!theaters.length) {
      c.innerHTML = '<div class="mm-empty"><span class="mm-empty__icon">📍</span>No theaters pinned. Go to the <strong>Theaters</strong> tab to add 3–5 nearby ones.</div>';
      return;
    }

    var allShows = readCacheAll();
    if (!allShows.length) {
      c.innerHTML = '<div class="mm-empty"><span class="mm-empty__icon">⏳</span>No data yet. Use the <strong>📌 Bookmarklet</strong> in Settings to import shows.</div>';
      return;
    }

    if (viewMode === 'theater') {
      renderTheaterView(c, allShows);
    } else {
      renderMovieView(c, allShows);
    }
  }

  function renderMovieView(c, allShows) {
    var clusters = clusterShows(allShows);
    clusters = hidePastShows(clusters);
    clusters = applyFilters(clusters);
    clusters = sortClusters(clusters);

    if (!clusters.length) {
      c.innerHTML = '<div class="mm-empty"><span class="mm-empty__icon">🔭</span>No shows match the current filters.</div>';
      return;
    }

    var byDate = clustersByDate(clusters);
    c.innerHTML = '';

    [todayISO(), tomorrowISO()].forEach(function (d) {
      var dayClusters = byDate[d] || [];
      if (!dayClusters.length) return;

      var head = document.createElement('div');
      head.className = 'mm-day-header';
      var totalShows = dayClusters.reduce(function (n, c2) { return n + c2.shows.length; }, 0);
      head.innerHTML =
        '<span class="mm-day-header__title">' + escapeHtml(fmtDayLabel(d)) + '</span>' +
        '<span class="mm-day-header__count">' + dayClusters.length + ' clusters · ' + totalShows + ' shows</span>';
      c.appendChild(head);

      var table = document.createElement('table');
      table.className = 'mm-matrix';
      table.innerHTML =
        '<thead><tr>' +
          '<th>Movie</th>' +
          '<th>Lang</th>' +
          '<th>Dim</th>' +
          '<th>Theaters · times</th>' +
        '</tr></thead><tbody></tbody>';
      var tbody = table.querySelector('tbody');

      dayClusters.forEach(function (cluster) {
        tbody.appendChild(renderClusterRow(cluster));
      });
      c.appendChild(table);
    });
  }

  function renderTheaterView(c, allShows) {
    var shows = hidePastShowsFromList(allShows);
    shows = applyFiltersToShows(shows);
    shows = filterShowsByTimeSlot(shows, activeTimeSlots);

    if (!shows.length) {
      c.innerHTML = '<div class="mm-empty"><span class="mm-empty__icon">🔭</span>No shows match the current filters.</div>';
      return;
    }

    c.innerHTML = '';

    [todayISO(), tomorrowISO()].forEach(function (d) {
      var dayShows = shows.filter(function (s) { return s.startISO.slice(0, 10) === d; });
      if (!dayShows.length) return;

      var head = document.createElement('div');
      head.className = 'mm-day-header';
      head.innerHTML =
        '<span class="mm-day-header__title">' + escapeHtml(fmtDayLabel(d)) + '</span>' +
        '<span class="mm-day-header__count">' + dayShows.length + ' shows</span>';
      c.appendChild(head);

      var theaterGroups = clusterShowsByTheater(dayShows);
      if (!theaterGroups.length) return;

      theaterGroups.forEach(function (tGroup) {
        var section = document.createElement('div');
        section.className = 'mm-theater-section';

        var allTheaterShows = tGroup.clusters.reduce(function (acc, cl) {
          return acc.concat(cl.shows);
        }, []);
        var stats = computeTheaterStats(allTheaterShows);
        var theaterArea = allTheaterShows.length > 0 ? allTheaterShows[0].theaterArea : 'Area unknown';

        var sectionHeader = document.createElement('div');
        sectionHeader.className = 'mm-theater-section__header';
        sectionHeader.innerHTML =
          '<div class="mm-theater-section__theater-name">' + escapeHtml(tGroup.theaterName) + '</div>' +
          '<div class="mm-theater-section__area">' + escapeHtml(theaterArea) + '</div>' +
          '<div class="mm-theater-section__stats">' +
            stats.movieCount + ' movies · ' +
            stats.showCount + ' shows · ' +
            (stats.earliestTime ? fmtTime(stats.earliestTime) + ' – ' + fmtTime(stats.latestTime) : '—') +
          '</div>';
        section.appendChild(sectionHeader);

        var table = document.createElement('table');
        table.className = 'mm-matrix mm-matrix--compact';
        table.innerHTML =
          '<thead><tr>' +
            '<th>Times</th>' +
            '<th>Movie</th>' +
            '<th>Lang</th>' +
            '<th>Dim</th>' +
          '</tr></thead><tbody></tbody>';
        var tbody = table.querySelector('tbody');

        tGroup.clusters.forEach(function (cluster) {
          var tr = document.createElement('tr');

          var timesTd = document.createElement('td');
          var chipsWrap = document.createElement('div');
          chipsWrap.className = 'mm-chips';
          cluster.shows
            .slice()
            .sort(function (a, b) { return new Date(a.startISO) - new Date(b.startISO); })
            .forEach(function (show) {
              chipsWrap.appendChild(makeTheaterViewChip(show));
            });
          timesTd.appendChild(chipsWrap);
          tr.appendChild(timesTd);

          var movieTd = document.createElement('td');
          movieTd.className = 'mm-cell-movie';
          var priceTag = cluster.shows[0].priceRange
            ? '<span class="mm-price-tag">' + escapeHtml(cluster.shows[0].priceRange) + '</span>' : '';
          movieTd.innerHTML =
            escapeHtml(cluster.movieTitle) +
            '<span class="mm-cell-movie__meta">' +
              '<span class="mm-runtime-badge">⏱ ' + fmtRuntime(cluster.runtimeMin) + '</span>' +
              priceTag +
            '</span>';
          tr.appendChild(movieTd);

          var langTd = document.createElement('td');
          langTd.innerHTML = '<span class="mm-lang-badge">' + escapeHtml(cluster.language) + '</span>';
          tr.appendChild(langTd);

          var dimLabel = escapeHtml(cluster.dimension) + (cluster.premiumTech ? ' · ' + escapeHtml(cluster.premiumTech) : '');
          var dimTd = document.createElement('td');
          dimTd.innerHTML = '<span class="mm-format-badge' + (cluster.premiumTech ? ' mm-format-badge--premium' : '') + '">' + dimLabel + '</span>';
          tr.appendChild(dimTd);

          tbody.appendChild(tr);
        });

        section.appendChild(table);
        c.appendChild(section);
      });
    });
  }

  function renderTheaterViewRow(show) {
    var tr = document.createElement('tr');
    var dimLabel = escapeHtml(show.dimension) + (show.premiumTech ? ' · ' + escapeHtml(show.premiumTech) : '');
    var endTime = new Date(new Date(show.startISO).getTime() + show.runtimeMin * 60000);
    var movieTitle = escapeHtml(show.movieTitle);

    // Theater name
    var theaterTd = document.createElement('td');
    theaterTd.innerHTML = escapeHtml(show.theaterName);
    tr.appendChild(theaterTd);

    // Time chip (clickable for booking, hover for popover)
    var timeTd = document.createElement('td');
    var chip = document.createElement('a');
    chip.className = 'mm-chip';
    chip.href = show.bookingUrl || '#';
    chip.target = '_blank';
    chip.rel = 'noopener noreferrer';
    chip.innerHTML = '<span class="mm-chip__time">' + fmtTime(show.startISO) + '</span>';
    chip.addEventListener('mouseenter', function (e) { showPopover(e, show); });
    chip.addEventListener('mousemove',  function (e) { positionPopover(e); });
    chip.addEventListener('mouseleave', hidePopover);
    timeTd.appendChild(chip);
    tr.appendChild(timeTd);

    // Movie title
    var movieTd = document.createElement('td');
    movieTd.className = 'mm-cell-movie';
    movieTd.title = 'Runtime: ' + show.runtimeMin + ' min\nHome by ~' + fmtTime(endTime.toISOString());
    movieTd.innerHTML = movieTitle;
    tr.appendChild(movieTd);

    // Language
    var langTd = document.createElement('td');
    langTd.innerHTML = '<span class="mm-lang-badge">' + escapeHtml(show.language) + '</span>';
    tr.appendChild(langTd);

    // Dim (+ premium)
    var dimTd = document.createElement('td');
    dimTd.innerHTML = '<span class="mm-format-badge' + (show.premiumTech ? ' mm-format-badge--premium' : '') + '">' + dimLabel + '</span>';
    tr.appendChild(dimTd);

    return tr;
  }

  function renderClusterRow(cluster) {
    var tr = document.createElement('tr');

    var movieTd = document.createElement('td');
    movieTd.className = 'mm-cell-movie';
    var priceTag = cluster.shows[0].priceRange
      ? '<span class="mm-price-tag">' + escapeHtml(cluster.shows[0].priceRange) + '</span>' : '';
    movieTd.innerHTML =
      escapeHtml(cluster.movieTitle) +
      '<span class="mm-cell-movie__meta">' +
        '<span class="mm-runtime-badge">⏱ ' + fmtRuntime(cluster.runtimeMin) + '</span>' +
        priceTag +
      '</span>';
    tr.appendChild(movieTd);

    // Language
    var langTd = document.createElement('td');
    langTd.innerHTML = '<span class="mm-lang-badge">' + escapeHtml(cluster.language) + '</span>';
    tr.appendChild(langTd);

    // Dimension (combined with premium tech if present, since Premium column is gone)
    var dimTd = document.createElement('td');
    var dimLabel = escapeHtml(cluster.dimension) + (cluster.premiumTech ? ' · ' + escapeHtml(cluster.premiumTech) : '');
    dimTd.innerHTML = '<span class="mm-format-badge' + (cluster.premiumTech ? ' mm-format-badge--premium' : '') + '">' + dimLabel + '</span>';
    tr.appendChild(dimTd);

    // Theater chips
    var chipsTd = document.createElement('td');
    var chipsWrap = document.createElement('div');
    chipsWrap.className = 'mm-chips';
    cluster.shows
      .slice()
      .sort(function (a, b) { return new Date(a.startISO) - new Date(b.startISO); })
      .forEach(function (show) {
        chipsWrap.appendChild(makeChip(show));
      });
    chipsTd.appendChild(chipsWrap);
    tr.appendChild(chipsTd);

    return tr;
  }

  function makeChip(show) {
    var a = document.createElement('a');
    a.className = 'mm-chip' + chipSeatClass(show.seatsLabel);
    a.href = show.bookingUrl || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML =
      '<span class="mm-chip__theater">' + escapeHtml(shortName(show.theaterName)) + '</span>' +
      '<span class="mm-chip__time">' + fmtTime(show.startISO) + '</span>' +
      '<span class="mm-chip__end-time">→' + chipEndTime(show) + '</span>' +
      chipSeatBadge(show.seatsLabel);
    a.dataset.showId = show.showId;
    a.addEventListener('mouseenter', function (e) { showPopover(e, show); });
    a.addEventListener('mousemove',  function (e) { positionPopover(e); });
    a.addEventListener('mouseleave', hidePopover);
    a.addEventListener('focus',      function (e) { showPopover(e, show); });
    a.addEventListener('blur',       hidePopover);
    return a;
  }

  function makeTheaterViewChip(show) {
    var a = document.createElement('a');
    a.className = 'mm-chip' + chipSeatClass(show.seatsLabel);
    a.href = show.bookingUrl || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML =
      '<span class="mm-chip__time">' + fmtTime(show.startISO) + '</span>' +
      '<span class="mm-chip__end-time">→ ' + chipEndTime(show) + '</span>' +
      chipSeatBadge(show.seatsLabel);
    a.dataset.showId = show.showId;
    a.addEventListener('mouseenter', function (e) { showPopover(e, show); });
    a.addEventListener('mousemove',  function (e) { positionPopover(e); });
    a.addEventListener('mouseleave', hidePopover);
    a.addEventListener('focus',      function (e) { showPopover(e, show); });
    a.addEventListener('blur',       hidePopover);
    return a;
  }

  function shortName(name) {
    // "Cinepolis Seasons Mall" -> "Cinepolis"; keep first 1-2 meaningful tokens
    var first = name.split(/[\s,]+/)[0];
    return first || name;
  }

  /* ═══════════════════════════════════════════════════════════════════
     §5  POPOVER
     ═══════════════════════════════════════════════════════════════════ */

  function showPopover(e, show) {
    var pop = document.getElementById('mm-popover');
    if (!pop) return;
    pop.innerHTML =
      '<div class="mm-popover__title">' + escapeHtml(show.theaterName) + '</div>' +
      '<div class="mm-popover__row"><span>Time</span><span>' + fmtTime(show.startISO) + ' → ' + fmtTime(show.endISO) + '</span></div>' +
      '<div class="mm-popover__row"><span>Format</span><span>' + escapeHtml(show.dimension) + (show.premiumTech ? ' · ' + escapeHtml(show.premiumTech) : '') + '</span></div>' +
      '<div class="mm-popover__row"><span>Language</span><span>' + escapeHtml(show.language) + '</span></div>' +
      '<div class="mm-popover__row"><span>Runtime</span><span>' + fmtRuntime(show.runtimeMin) + '</span></div>' +
      (show.priceRange ? '<div class="mm-popover__row"><span>Price</span><span>' + escapeHtml(show.priceRange) + '</span></div>' : '') +
      (show.seatsLabel  ? '<div class="mm-popover__row"><span>Seats</span><span>' + escapeHtml(show.seatsLabel) + '</span></div>'  : '') +
      (show.theaterArea ? '<div class="mm-popover__row"><span>Area</span><span>' + escapeHtml(show.theaterArea) + '</span></div>'  : '') +
      '<div class="mm-popover__hint">Click to open BookMyShow booking →</div>';
    pop.hidden = false;
    positionPopover(e);
  }
  function positionPopover(e) {
    var pop = document.getElementById('mm-popover');
    if (!pop || pop.hidden) return;
    var pad = 12;
    var x = e.clientX + pad;
    var y = e.clientY + pad;
    var rect = pop.getBoundingClientRect();
    if (x + rect.width  > window.innerWidth)  x = e.clientX - rect.width  - pad;
    if (y + rect.height > window.innerHeight) y = e.clientY - rect.height - pad;
    pop.style.left = Math.max(4, x) + 'px';
    pop.style.top  = Math.max(4, y) + 'px';
  }
  function hidePopover() {
    var pop = document.getElementById('mm-popover');
    if (pop) pop.hidden = true;
  }

  /* ═══════════════════════════════════════════════════════════════════
     §6  THEATERS TAB
     ═══════════════════════════════════════════════════════════════════ */

  function renderTheatersTab() {
    var list = document.getElementById('mm-theaters-list');
    if (!list) return;
    if (!theaters.length) {
      list.innerHTML = '<p class="mm-help-text">None yet. Use <strong>⤵ Load Pune defaults</strong> below for the 5 sample theaters, then customize.</p>';
      return;
    }
    list.innerHTML = '';
    theaters.forEach(function (t, i) {
      var row = document.createElement('div');
      row.className = 'mm-theater-row';
      row.innerHTML =
        '<div class="mm-theater-row__main">' +
          '<div class="mm-theater-row__name">' + escapeHtml(t.name) + '</div>' +
          '<div class="mm-theater-row__meta">' +
            (t.area ? escapeHtml(t.area) + ' · ' : '') +
            (t.city ? escapeHtml(t.city) + ' · ' : '') +
            '<span class="mm-theater-row__code">' + escapeHtml(t.bmsCode) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="mm-row">' +
          (i > 0 ? '<button class="btn btn--outline btn--sm" data-action="up" data-i="' + i + '" title="Move up">↑</button>' : '') +
          (i < theaters.length - 1 ? '<button class="btn btn--outline btn--sm" data-action="down" data-i="' + i + '" title="Move down">↓</button>' : '') +
          '<button class="btn btn--danger btn--sm" data-action="remove" data-i="' + i + '">Remove</button>' +
        '</div>';
      row.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-action]');
        if (!btn) return;
        var idx = parseInt(btn.dataset.i, 10);
        var action = btn.dataset.action;
        if (action === 'remove') {
          clearTheaterCache(theaters[idx].bmsCode);
          theaters.splice(idx, 1);
        }
        if (action === 'up'   && idx > 0) { var s = theaters.splice(idx,1)[0]; theaters.splice(idx-1,0,s); }
        if (action === 'down' && idx < theaters.length - 1) { var s2 = theaters.splice(idx,1)[0]; theaters.splice(idx+1,0,s2); }
        State.save('mm_theaters', theaters);
        renderAll();
      });
      list.appendChild(row);
    });
  }

  function addTheater(t) {
    if (!t || !t.name || !t.bmsCode) {
      alert('Theater needs at least a "name" and "bmsCode".');
      return false;
    }
    if (theaters.some(function (x) { return x.bmsCode === t.bmsCode; })) {
      alert('A theater with bmsCode ' + t.bmsCode + ' is already pinned.');
      return false;
    }
    theaters.push({
      name: t.name, bmsCode: t.bmsCode,
      area: t.area || '', city: t.city || '',
      regionCode: t.regionCode || (t.city ? t.city.toUpperCase() : 'PUNE')
    });
    State.save('mm_theaters', theaters);
    return true;
  }

  function bindTheatersTab() {
    var manualBtn = document.getElementById('mm-btn-add-manual');
    var manualBox = document.getElementById('mm-manual-json');
    if (manualBtn && manualBox) {
      manualBtn.addEventListener('click', function () {
        var raw = manualBox.value.trim();
        if (!raw) return;
        try {
          var t = JSON.parse(raw);
          if (addTheater(t)) { manualBox.value = ''; renderAll(); }
        } catch (e) {
          alert('Invalid JSON: ' + e.message);
        }
      });
    }

    var defaultsBtn = document.getElementById('mm-btn-load-defaults');
    if (defaultsBtn) {
      defaultsBtn.addEventListener('click', function () {
        if (theaters.length && !confirm('Replace current pinned theaters with the 5 Pune defaults?')) return;
        theaters = PUNE_DEFAULT_THEATERS.slice();
        State.save('mm_theaters', theaters);
        clearCache();
        renderAll();
      });
    }

    var searchBtn = document.getElementById('mm-btn-search');
    var searchCity = document.getElementById('mm-search-city');
    var searchQuery = document.getElementById('mm-search-query');
    var searchResults = document.getElementById('mm-search-results');
    if (searchBtn && searchResults) {
      searchBtn.addEventListener('click', function () {
        searchResults.innerHTML =
          '<p class="mm-help-text">Search wizard depends on a BMS cinema-list endpoint. ' +
          'Until <code>BMS_ENDPOINTS.md</code> documents that endpoint, please use ' +
          '<strong>manual JSON</strong> below or <strong>Load Pune defaults</strong>.<br>' +
          'Searched: <em>' + escapeHtml((searchQuery && searchQuery.value) || '(empty)') +
          '</em> in <em>' + escapeHtml((searchCity && searchCity.value) || 'Pune') + '</em></p>';
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     §7  SETTINGS TAB
     ═══════════════════════════════════════════════════════════════════ */

  function renderSettingsTab() {
    // Inject the draggable bookmarklet link (href is the bookmarklet code so
    // dragging adds it as a real bookmark; clicking is intercepted with a tip)
    var host = document.getElementById('mm-bookmarklet-host');
    if (host && !host.querySelector('a')) {
      var link = document.createElement('a');
      link.className = 'mm-bookmarklet-link';
      link.href = BOOKMARKLET;
      link.draggable = true;
      link.textContent = '📌 BMS → Mancha-Matrix';
      link.title = 'Drag me to your browser bookmarks bar';
      link.addEventListener('click', function (ev) {
        ev.preventDefault();
        alert('Drag this link to your browser bookmarks bar.\nDon\'t click it here — it needs to run on a BookMyShow page.');
      });
      host.appendChild(link);
    }

    var info = document.getElementById('mm-cache-info');
    if (info) {
      var entries = Object.keys(cache).length;
      info.textContent = entries
        ? entries + ' (theater × date) entries cached, last imported ' + (cacheTs ? minsAgo(cacheTs) + ' min ago' : 'never')
        : 'Cache empty — use the bookmarklet to import shows.';
    }
  }

  function bindSettingsTab() {
    var clearBtn = document.getElementById('mm-btn-clear-cache');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clearCache();
        renderAll();
      });
    }

    var pasteEl   = document.getElementById('mm-paste-input');
    var importBtn = document.getElementById('mm-btn-import-paste');
    var clearPaste = document.getElementById('mm-btn-clear-paste');
    if (importBtn && pasteEl) {
      importBtn.addEventListener('click', function () {
        importFromBmsPaste(pasteEl.value);
        pasteEl.value = '';
      });
    }
    if (clearPaste && pasteEl) {
      clearPaste.addEventListener('click', function () { pasteEl.value = ''; });
    }
    // Hover-to-focus so you can come from BMS → Ctrl+V without first clicking
    if (pasteEl) {
      pasteEl.addEventListener('mouseenter', function () { pasteEl.focus(); });
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     §8  TABS + GLOBAL WIRING
     ═══════════════════════════════════════════════════════════════════ */

  var TABS = ['matrix', 'theaters', 'settings'];

  function switchTab(name) {
    document.querySelectorAll('.mm-tab').forEach(function (btn) {
      var active = btn.dataset.tab === name;
      btn.classList.toggle('mm-tab--active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    TABS.forEach(function (t) {
      var pane = document.getElementById('pane-' + t);
      if (pane) pane.hidden = (t !== name);
    });
    if (name === 'theaters') renderTheatersTab();
    if (name === 'settings') renderSettingsTab();
  }

  function renderAll() {
    renderCacheAge();
    buildFilterPills();
    renderMatrix();
    renderTheatersTab();
    renderSettingsTab();
  }

  function resetSession() {
    // Reset clears filters + cache, keeps theaters and settings
    filters = { movies: [], languages: [], dimensions: [], mutedTheaters: [] };
    sortDir = 'asc';
    State.save('mm_filters', filters);
    State.save('mm_sort_dir', sortDir);
    clearCache();
    renderAll();
    switchTab('matrix');
  }

  /* ─── HTML escape util ──────────────────────────────────────────── */
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     §9  INIT
     ═══════════════════════════════════════════════════════════════════ */

  function init() {
    // Tab nav
    document.querySelectorAll('.mm-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });

    // Strip buttons
    var refreshBtn = document.getElementById('mm-btn-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      var orig = refreshBtn.textContent;
      refreshBtn.textContent = '↻ Refreshing…';
      refreshBtn.disabled = true;
      refresh(true);
      setTimeout(function () {
        refreshBtn.textContent = '✓ Refreshed';
        setTimeout(function () {
          refreshBtn.textContent = orig || '↻ Refresh';
          refreshBtn.disabled = false;
        }, 1200);
      }, 250);
    });
    var manageBtn = document.getElementById('mm-btn-manage');
    if (manageBtn) manageBtn.addEventListener('click', function () { switchTab('theaters'); });

    // Filter row
    var sortBtn = document.getElementById('mm-btn-sort');
    if (sortBtn) sortBtn.addEventListener('click', function () {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      State.save('mm_sort_dir', sortDir);
      sortBtn.textContent = sortDir === 'asc' ? '↑ Earliest first' : '↓ Latest first';
      renderMatrix();
    });
    if (sortBtn) sortBtn.textContent = sortDir === 'asc' ? '↑ Earliest first' : '↓ Latest first';

    // View toggle (movie vs theater)
    document.querySelectorAll('#mm-view-toggle button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        viewMode = btn.dataset.view;
        State.save('mm_view', viewMode);
        updateViewToggleUI();
        buildFilterPills();
        renderMatrix();
      });
    });
    updateViewToggleUI();

    var clearFiltersBtn = document.getElementById('mm-btn-clear-filters');
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', function () {
      filters = { movies: [], languages: [], dimensions: [], mutedTheaters: [] };
      State.save('mm_filters', filters);
      activeTimeSlots = {};
      State.save('mm_time_slots', activeTimeSlots);
      buildFilterPills();
      renderMatrix();
    });

    // Tab-specific bindings
    bindTheatersTab();
    bindSettingsTab();

    // First-run auto-population: load Pune defaults so the user lands on a
    // working dashboard immediately. They can edit/replace via Theaters tab.
    var firstRun = !State.load('mm_first_run_done', false);
    if (firstRun && !theaters.length) {
      theaters = PUNE_DEFAULT_THEATERS.slice();
      State.save('mm_theaters', theaters);
      State.save('mm_first_run_done', true);
    }

    // Tick the cache-age label every 30s while the tab is open
    setInterval(renderCacheAge, 30000);

    // Initial render + opportunistic refresh
    renderAll();
    if (theaters.length) refresh(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

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

  // Bookmarklet v5 — DOM scraper. Three fixes over v4:
  //   • UI-class blacklist: skip elements whose className contains
  //     btn/button/nav/header/sign/login/placeholder/input/etc., even if
  //     they otherwise match the title selectors. Stops "Sign in" /
  //     "placeholder" / nav-toggle text from being captured.
  //   • Climb depth reduced 14 → 8 so we stay near the movie card and
  //     don't reach the page header.
  //   • JUNK regex extended with placeholder/sign/sign in/loading/etc.
  //   • _debugSamples now includes the chosen title's source for each
  //     of the first 5 hits — paste the JSON back if titles still wrong.
  var BOOKMARKLET = "javascript:(function(){try{var T=/^\\s*(\\d{1,2}):(\\d{2})\\s*(AM|PM)?\\s*$/i,F=/\\b(2D|3D|4DX|IMAX|ScreenX|Dolby\\s*Cinema|ICE|PXL|Director's\\s*Cut)\\b/gi,L=/\\b(Hindi|English|Marathi|Tamil|Telugu|Kannada|Punjabi|Bengali|Malayalam|Gujarati)\\b/i,JUNK=/^(book|buy|cancel|close|pay|confirm|continue|select|apply|next|prev|previous|menu|search|home|back|skip|share|filter|sort|view|seats?|now|free|paid|sold|fast|few|hot|grid|list|gallery|tile|tab|info|ticket|tickets|showtimes?|schedule|all|today|tomorrow|date|time|new|popular|latest|trending|favorite|favorites|wishlist|profile|login|logout|help|about|contact|terms|privacy|cookies?|settings?|notifications?|theatres?|theaters?|cinemas?|movies?|placeholder|sign|sign\\s*in|sign\\s*up|sign\\s*out|signin|signup|signout|register|loading|error|warning|done|reset|delete|remove|edit|save|copy|paste|read\\s*more|see\\s*more|show\\s*more|read\\s*all|see\\s*all|show\\s*all|view\\s*all|account|cart|wallet|offers?)$/i,UICLASS=/(^|[^a-z])(btn|button|nav|header|footer|menu|toolbar|toggle|sign|auth|login|signup|register|placeholder|input|search|dropdown|modal|popup|tooltip|spinner|loader|skeleton|cta|banner|advert|cookie|popover)([^a-z]|$)/i;function gc(el){if(!el||!el.className)return '';var c=el.className;return (typeof c==='string'?c:c.baseVal||'').toLowerCase()}function isUI(el){return UICLASS.test(gc(el))}var els=document.querySelectorAll('a,button,span,div,p'),hits=[];for(var i=0;i<els.length;i++){var el=els[i];if(el.children.length>0)continue;var t=(el.textContent||'').trim();if(t.length<4||t.length>10)continue;if(T.test(t))hits.push({el:el,time:t})}if(!hits.length){alert('Mancha-Matrix: No showtime-shaped text found on this page. Open a cinema or showtimes page that lists times like 7:30 PM.');return}function vt(s){if(!s||typeof s!=='string')return false;var x=s.trim();if(x.length<2||x.length>150)return false;if(T.test(x))return false;if(/^[\\d:\\s]+$/.test(x))return false;if(JUNK.test(x))return false;return true}function tIn(c){if(!c)return null;var sels=['[class*=\"movie\" i]','[class*=\"event\" i]','h1','h2','h3','h4','h5','h6','[class*=\"title\" i]','[class*=\"name\" i]'];for(var i=0;i<sels.length;i++){var ns=c.querySelectorAll(sels[i]);for(var j=0;j<ns.length;j++){var el=ns[j];if(isUI(el))continue;var x=(el.textContent||'').trim();if(vt(x))return{text:x,src:el.tagName.toLowerCase()+'.'+gc(el).slice(0,40)}}}var ar=c.querySelector('[aria-label],[data-title]');if(ar&&!isUI(ar)){var at=ar.getAttribute('aria-label')||ar.getAttribute('data-title');if(at&&vt(at))return{text:at.trim(),src:'aria'}}var img=c.querySelector('img[alt]');if(img&&!isUI(img)){var alt=img.getAttribute('alt');if(alt&&vt(alt))return{text:alt.trim(),src:'img@alt'}}return null}function fT(leaf){var n=leaf;for(var d=0;d<8&&n;d++){n=n.parentElement;if(!n)break;var t=tIn(n);if(t)return t;var pv=n.previousElementSibling;if(pv){var t2=tIn(pv);if(t2)return t2}}return null}function fFL(leaf){var n=leaf,dim=null,lang=null,prem=null;for(var d=0;d<8&&n;d++){n=n.parentElement;if(!n)break;var txt=n.textContent||'',fm=txt.match(F);if(fm)fm.forEach(function(m){var u=m.toUpperCase();if(/4DX/.test(u)&&!dim)dim='4DX';else if(/IMAX/.test(u)&&!prem)prem='IMAX';else if(/DOLBY/.test(u)&&!prem)prem='Dolby Cinema';else if(/ICE/.test(u)&&!prem)prem='ICE';else if(/SCREENX/.test(u)&&!dim)dim='ScreenX';else if(/PXL/.test(u)&&!prem)prem='PXL';else if(/3D/.test(u)&&!dim)dim='3D';else if(/2D/.test(u)&&!dim)dim='2D'});var lm=txt.match(L);if(lm&&!lang)lang=lm[1];if(dim&&lang)break}return{dim:dim,lang:lang,prem:prem}}var shows=[],seen={},titleSources=[];hits.forEach(function(h){var to=fT(h.el),title=to?to.text:'(unknown)',src=to?to.src:'none',fl=fFL(h.el),url=(h.el.tagName==='A'&&h.el.href)||null,key=title+'|'+h.time+'|'+(fl.dim||'')+'|'+(fl.prem||'');titleSources.push({time:h.time,title:title,src:src});if(seen[key])return;seen[key]=true;shows.push({showTime:h.time,movieTitle:title,dimension:fl.dim||'2D',language:fl.lang||'English',premiumTech:fl.prem,bookingUrl:url})});var hasReal=shows.some(function(s){return s.movieTitle!=='(unknown)'});if(hasReal)shows=shows.filter(function(s){return s.movieTitle!=='(unknown)'});var dbg=hits.slice(0,3).map(function(h){var p=h.el.parentElement,p2=p&&p.parentElement;return{time:h.time,parentTag:p?p.tagName:'',parentClass:p?gc(p):'',grandTag:p2?p2.tagName:'',grandClass:p2?gc(p2):'',parentHtml:(p&&p.outerHTML||'').slice(0,400),grandHtml:(p2&&p2.outerHTML||'').slice(0,600)}});var venue={sourceUrl:location.href,pageTitle:document.title,hint:location.pathname},pp=location.pathname.split('/').filter(Boolean);for(var p=0;p<pp.length;p++){if(/^[A-Z][A-Z0-9]{2,8}$/.test(pp[p])){venue.code=pp[p];break}}var hd2=document.querySelectorAll('h1,h2,h3,h4,[class*=\"date\" i]'),dh=null;for(var hi=0;hi<hd2.length;hi++){var ht=hd2[hi].textContent.trim();if(/(\\d{1,2}\\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(ht)&&ht.length<60){dh=ht;break}}var env={_bookmarklet:'mancha-matrix-v5',_scrapeMethod:'dom',capturedAt:new Date().toISOString(),sourceUrl:location.href,pageTitle:document.title,venue:venue,dateHint:dh,shows:shows,rawCounts:{timesFound:hits.length,showsExtracted:shows.length},_debugSamples:dbg,_titleSources:titleSources.slice(0,10)},j=JSON.stringify(env),msg='Mancha-Matrix: Copied '+shows.length+' shows from '+hits.length+' time elements.\\n\\n';if(shows.length===0)msg+='No movie titles found. The JSON copied to clipboard includes debug samples \\u2014 paste it back to your dev to fix the title finder.';else msg+='Paste into MM \\u2192 Settings \\u2192 Import.';var done=function(){alert(msg)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(j).then(done,function(){window.prompt('Copy this JSON:',j)})}else{window.prompt('Copy this JSON:',j)}}catch(e){alert('Mancha-Matrix bookmarklet error: '+(e&&e.message?e.message:e))}})();";

  var DIMENSIONS = ['2D', '3D', '4DX', 'ScreenX'];
  var PREMIUM_TECH = ['IMAX', 'Dolby Cinema', 'ICE', 'PXL', "Director's Cut"];
  var LANGUAGES = ['HI', 'EN', 'MR', 'TA', 'TE', 'KN'];

  // Pinned theaters — web-verified names from BMS / cinema sites.
  // bmsCode values are placeholders until captured from the bookmarklet's
  // venue.code on first successful import.
  var PUNE_DEFAULT_THEATERS = [
    { name: 'Cinepolis: Seasons Mall',           bmsCode: 'CPSM', area: 'Hadapsar',     city: 'Pune', regionCode: 'PUNE' },
    { name: 'MovieMax: Amanora Town Centre',     bmsCode: 'MMAM', area: 'Hadapsar',     city: 'Pune', regionCode: 'PUNE' },
    { name: 'City Pride: Nyati Plaza, Kharadi',  bmsCode: 'CPNK', area: 'Kharadi',      city: 'Pune', regionCode: 'PUNE' },
    { name: 'Bollywood Multiplex, Kharadi',      bmsCode: 'BWKH', area: 'Kharadi',      city: 'Pune', regionCode: 'PUNE' },
    { name: 'Rajhans Cinemas: 93 Avenue Mall',   bmsCode: 'RC93', area: 'Fatima Nagar', city: 'Pune', regionCode: 'PUNE' }
  ];

  /* ─── Persistent state (loaded once, written via setters) ────────── */
  var theaters     = State.load('mm_theaters', []);
  var sourceMode   = State.load('mm_source', 'paste'); // only 'paste' is valid now
  var sortDir      = State.load('mm_sort_dir', 'asc');
  var filters      = State.load('mm_filters', { movie: '', languages: [], dimensions: [], mutedTheaters: [] });
  var cache        = State.load('mm_cache', {});
  var cacheTs      = State.load('mm_cache_ts', 0);
  var lastFetchError = null;

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
      return ['MXAM', 'CPNP', 'BMKH'].indexOf(t.bmsCode) !== -1 || /^Rajan Cinema/i.test(t.name || '');
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

    var validVersions = ['mancha-matrix-v1', 'mancha-matrix-v2', 'mancha-matrix-v3', 'mancha-matrix-v4', 'mancha-matrix-v5'];
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
        if (filters.movie && c.movieId !== filters.movie) return false;
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

  function renderPinnedStrip() {
    var el = document.getElementById('mm-pinned-list');
    if (!el) return;
    if (!theaters.length) {
      el.innerHTML = '<span class="mm-strip__pinned-empty">No theaters pinned — go to <strong>📍 Theaters</strong> to add some.</span>';
      return;
    }
    el.innerHTML = '';
    theaters.forEach(function (t) {
      var span = document.createElement('span');
      span.className = 'mm-theater-pill';
      span.innerHTML = '<span class="mm-theater-pill__dot"></span>' + escapeHtml(t.name);
      span.title = t.area + ' · ' + t.bmsCode;
      el.appendChild(span);
    });
  }

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
    var sel = document.getElementById('mm-filter-movie');
    if (sel) {
      var current = filters.movie || '';
      sel.innerHTML = '<option value="">All movies</option>';
      Object.keys(movies).sort(function (a, b) {
        return movies[a].localeCompare(movies[b]);
      }).forEach(function (id) {
        var o = document.createElement('option');
        o.value = id; o.textContent = movies[id];
        if (id === current) o.selected = true;
        sel.appendChild(o);
      });
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

    // Theater toggle pills — show all pinned, "muted" means filtered-out
    var theaterContainer = document.getElementById('mm-filter-theaters');
    if (theaterContainer) {
      theaterContainer.innerHTML = '';
      theaters.forEach(function (t) {
        var muted = (filters.mutedTheaters || []).indexOf(t.bmsCode) !== -1;
        var btn = makePill(t.bmsCode, t.name, !muted, function () {
          toggleArrayFilter('mutedTheaters', t.bmsCode);
        });
        if (muted) btn.classList.add('mm-pill--muted');
        theaterContainer.appendChild(btn);
      });
    }
  }

  function makePill(value, label, active, onClick) {
    var btn = document.createElement('button');
    btn.className = 'mm-pill' + (active ? ' mm-pill--active' : '');
    btn.dataset.value = value;
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
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

  function renderMatrix() {
    var c = document.getElementById('mm-matrix-container');
    if (!c) return;

    if (!theaters.length) {
      c.innerHTML = '<div class="mm-empty"><span class="mm-empty__icon">📍</span>No theaters pinned. Go to the <strong>Theaters</strong> tab to add 3–5 nearby ones.</div>';
      return;
    }

    var allShows = readCacheAll();
    if (!allShows.length) {
      c.innerHTML = '<div class="mm-empty"><span class="mm-empty__icon">⏳</span>No data yet. Click <strong>↻ Refresh</strong> to fetch shows.</div>';
      return;
    }

    var clusters = clusterShows(allShows);
    clusters = hidePastShows(clusters);
    clusters = applyFilters(clusters);
    clusters = sortClusters(clusters);

    if (!clusters.length) {
      c.innerHTML = '';
      if (lastFetchError) setStatusBanner('Fetch error: ' + lastFetchError, true);
      var empty = document.createElement('div');
      empty.className = 'mm-empty';
      empty.innerHTML = '<span class="mm-empty__icon">🔭</span>No shows match the current filters.';
      c.appendChild(empty);
      return;
    }

    var byDate = clustersByDate(clusters);
    c.innerHTML = '';
    if (lastFetchError) setStatusBanner('Fetch error (showing cached): ' + lastFetchError, true);

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
          '<th>Premium</th>' +
          '<th>Theaters · times</th>' +
        '</tr></thead><tbody></tbody>';
      var tbody = table.querySelector('tbody');

      dayClusters.forEach(function (cluster) {
        tbody.appendChild(renderClusterRow(cluster));
      });
      c.appendChild(table);
    });
  }

  function renderClusterRow(cluster) {
    var tr = document.createElement('tr');

    // Movie cell with runtime + return-time tooltip
    var movieTd = document.createElement('td');
    var earliest = new Date(clusterEarliest(cluster));
    var endTime = new Date(earliest.getTime() + cluster.runtimeMin * 60000);
    movieTd.className = 'mm-cell-movie';
    movieTd.title =
      'Runtime: ' + cluster.runtimeMin + ' min\n' +
      'Earliest start: ' + fmtTime(earliest.toISOString()) + '\n' +
      'Approx return: ' + fmtTime(endTime.toISOString());
    movieTd.innerHTML =
      escapeHtml(cluster.movieTitle) +
      '<span class="mm-cell-movie__runtime">⏱ ' + cluster.runtimeMin + ' min · home by ~' + fmtTime(endTime.toISOString()) + '</span>';
    tr.appendChild(movieTd);

    // Language
    var langTd = document.createElement('td');
    langTd.innerHTML = '<span class="mm-lang-badge">' + escapeHtml(cluster.language) + '</span>';
    tr.appendChild(langTd);

    // Dimension
    var dimTd = document.createElement('td');
    dimTd.innerHTML = '<span class="mm-format-badge">' + escapeHtml(cluster.dimension) + '</span>';
    tr.appendChild(dimTd);

    // Premium tech
    var premTd = document.createElement('td');
    if (cluster.premiumTech) {
      premTd.innerHTML = '<span class="mm-format-badge mm-format-badge--premium">' + escapeHtml(cluster.premiumTech) + '</span>';
    } else {
      premTd.innerHTML = '<span class="mm-format-badge mm-format-badge--none">—</span>';
    }
    tr.appendChild(premTd);

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
    a.className = 'mm-chip';
    a.href = show.bookingUrl || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML =
      '<span class="mm-chip__theater">' + escapeHtml(shortName(show.theaterName)) + '</span>' +
      '<span class="mm-chip__time">' + fmtTime(show.startISO) + '</span>';
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
      '<div class="mm-popover__row"><span>Runtime</span><span>' + show.runtimeMin + ' min</span></div>' +
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
        if (action === 'remove') theaters.splice(idx, 1);
        if (action === 'up'   && idx > 0) { var s = theaters.splice(idx,1)[0]; theaters.splice(idx-1,0,s); }
        if (action === 'down' && idx < theaters.length - 1) { var s2 = theaters.splice(idx,1)[0]; theaters.splice(idx+1,0,s2); }
        State.save('mm_theaters', theaters);
        // When theaters change, drop their cache entries to avoid orphan keys
        clearCache();
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
    clearCache();
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
    renderPinnedStrip();
    renderCacheAge();
    buildFilterPills();
    renderMatrix();
    renderTheatersTab();
    renderSettingsTab();
  }

  function resetSession() {
    // Reset clears filters + cache, keeps theaters and settings
    filters = { movie: '', languages: [], dimensions: [], mutedTheaters: [] };
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
    if (refreshBtn) refreshBtn.addEventListener('click', function () { refresh(true); });
    var manageBtn = document.getElementById('mm-btn-manage');
    if (manageBtn) manageBtn.addEventListener('click', function () { switchTab('theaters'); });

    // Filter row
    var movieSel = document.getElementById('mm-filter-movie');
    if (movieSel) movieSel.addEventListener('change', function () {
      filters.movie = movieSel.value;
      State.save('mm_filters', filters);
      renderMatrix();
    });
    var sortBtn = document.getElementById('mm-btn-sort');
    if (sortBtn) sortBtn.addEventListener('click', function () {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      State.save('mm_sort_dir', sortDir);
      sortBtn.textContent = sortDir === 'asc' ? '↑ Earliest first' : '↓ Latest first';
      renderMatrix();
    });
    if (sortBtn) sortBtn.textContent = sortDir === 'asc' ? '↑ Earliest first' : '↓ Latest first';

    var clearFiltersBtn = document.getElementById('mm-btn-clear-filters');
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', function () {
      filters = { movie: '', languages: [], dimensions: [], mutedTheaters: [] };
      State.save('mm_filters', filters);
      buildFilterPills();
      var sel = document.getElementById('mm-filter-movie');
      if (sel) sel.value = '';
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

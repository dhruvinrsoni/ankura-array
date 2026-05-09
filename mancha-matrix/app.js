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

  var DIMENSIONS = ['2D', '3D', '4DX', 'ScreenX'];
  var PREMIUM_TECH = ['IMAX', 'Dolby Cinema', 'ICE', 'PXL', "Director's Cut"];
  var LANGUAGES = ['HI', 'EN', 'MR', 'TA', 'TE', 'KN'];

  // Defaults from the plan — user's Pune theaters
  var PUNE_DEFAULT_THEATERS = [
    { name: 'Cinepolis Seasons Mall',         bmsCode: 'CPSM', area: 'Magarpatta',  city: 'Pune' },
    { name: 'MovieMax Amanora Town Centre',   bmsCode: 'MXAM', area: 'Hadapsar',    city: 'Pune' },
    { name: 'City Pride Nyati Plaza Kharadi', bmsCode: 'CPNP', area: 'Kharadi',     city: 'Pune' },
    { name: 'Bollywood Multiplex Kharadi',    bmsCode: 'BMKH', area: 'Kharadi',     city: 'Pune' },
    { name: 'Rajan Cinema 93 Avenue Mall',    bmsCode: 'RC93', area: 'Fatima Nagar', city: 'Pune' }
  ];

  /* ─── Persistent state (loaded once, written via setters) ────────── */
  var theaters     = State.load('mm_theaters', []);
  var proxyUrl     = State.load('mm_proxy_url', DEFAULT_PROXY);
  var sourceMode   = State.load('mm_source', 'mock'); // 'mock' | 'bms'
  var sortDir      = State.load('mm_sort_dir', 'asc');
  var filters      = State.load('mm_filters', { movie: '', languages: [], dimensions: [], mutedTheaters: [] });
  var cache        = State.load('mm_cache', {});
  var cacheTs      = State.load('mm_cache_ts', 0);
  var lastFetchError = null;

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

  // Each source exposes: fetchTheaterDate(theater, dateStr) -> Promise<NormalizedShow[]>
  var Sources = {
    mock: {
      label: 'Mock data',
      fetchTheaterDate: function (theater, dateStr) {
        return Promise.resolve(generateMockShows(theater, dateStr));
      }
    },
    bms: {
      label: 'Live (BMS via proxy)',
      fetchTheaterDate: function (theater, dateStr) {
        return fetchBmsShowtimes(theater, dateStr);
      }
    }
  };

  // Mock generator — produces plausible-looking shows so the UX is testable
  // without the BMS endpoint spike.
  var MOCK_CATALOG = [
    { id: 'mv-dune2', title: 'Dune: Part Two',         lang: 'EN', runtime: 166, dims: ['2D','3D'],  premium: ['IMAX','Dolby Cinema'] },
    { id: 'mv-pushpa', title: 'Pushpa: The Rule',      lang: 'HI', runtime: 178, dims: ['2D'],       premium: ['Dolby Cinema'] },
    { id: 'mv-fukrey', title: 'Fukrey 3',              lang: 'HI', runtime: 145, dims: ['2D'],       premium: [] },
    { id: 'mv-godzilla', title: 'Godzilla x Kong',     lang: 'EN', runtime: 115, dims: ['2D','3D','4DX'], premium: ['IMAX'] },
    { id: 'mv-vidushak', title: 'Vidushak',            lang: 'MR', runtime: 132, dims: ['2D'],       premium: [] },
    { id: 'mv-leo', title: 'Leo',                      lang: 'TA', runtime: 168, dims: ['2D','3D'],  premium: ['Dolby Cinema'] }
  ];

  function generateMockShows(theater, dateStr) {
    // Deterministic-ish seed by theater + date so reloads look consistent
    var seed = (theater.bmsCode + dateStr).split('').reduce(function (a,c) { return (a*31 + c.charCodeAt(0)) | 0; }, 7);
    function rand() { seed = (seed * 9301 + 49297) & 0x7fffffff; return seed / 0x7fffffff; }

    var shows = [];
    // Each theater gets ~6-10 shows across the day
    var slots = [10, 13, 15, 17, 19, 20, 21, 22, 23];
    var theaterPremiumPool = PREMIUM_TECH.filter(function () { return rand() < 0.5; });
    if (theaterPremiumPool.length === 0) theaterPremiumPool = ['IMAX'];

    slots.forEach(function (hour, idx) {
      // skip some shows randomly
      if (rand() < 0.35) return;
      var movie = MOCK_CATALOG[Math.floor(rand() * MOCK_CATALOG.length)];
      var dim = movie.dims[Math.floor(rand() * movie.dims.length)];
      // Premium tech: only if movie supports it AND theater offers it
      var compatPremium = movie.premium.filter(function (p) { return theaterPremiumPool.indexOf(p) !== -1; });
      var premium = (compatPremium.length && rand() < 0.6) ? compatPremium[0] : null;

      var minute = Math.floor(rand() * 4) * 15;
      var startD = new Date(dateStr + 'T00:00:00');
      startD.setHours(hour, minute, 0, 0);
      var endD = new Date(startD.getTime() + movie.runtime * 60000);

      shows.push({
        showId: theater.bmsCode + '-' + dateStr + '-' + idx,
        theaterCode: theater.bmsCode,
        theaterName: theater.name,
        theaterArea: theater.area,
        movieId: movie.id,
        movieTitle: movie.title,
        language: movie.lang,
        dimension: dim,
        premiumTech: premium,
        runtimeMin: movie.runtime,
        startISO: startD.toISOString(),
        endISO: endD.toISOString(),
        bookingUrl: 'https://in.bookmyshow.com/',
        // Popover-only data
        priceRange: '₹' + (200 + Math.floor(rand() * 6) * 50) + '–₹' + (500 + Math.floor(rand() * 5) * 100),
        seatsLabel: ['Filling fast', 'Available', 'Few left', 'Almost full'][Math.floor(rand() * 4)]
      });
    });
    return shows;
  }

  // BMS live fetch — shell awaiting the spike. See BMS_ENDPOINTS.md for the
  // contract this function must populate. Until that's filled in, this throws
  // and the user is nudged back to mock mode.
  function fetchBmsShowtimes(theater, dateStr) {
    // TODO(spike): once BMS_ENDPOINTS.md is filled in, replace this stub with
    //   1. Build BMS URL: e.g. `https://in.bookmyshow.com/serv/getData?cmd=GETSHOWTIMES&vc=${theater.bmsCode}&dt=${bmsDate}`
    //   2. Wrap with proxy: proxyUrl.replace('{url}', encodeURIComponent(bmsUrl))
    //   3. fetch + parse JSON into the NormalizedShow[] shape (see mock generator above)
    //   4. Map fields: showId, movieId, movieTitle, language, dimension, premiumTech,
    //      runtimeMin, startISO, endISO, bookingUrl, priceRange, seatsLabel
    return Promise.reject(new Error(
      'BMS live source not implemented yet. Document the endpoint in BMS_ENDPOINTS.md and wire fetchBmsShowtimes() in app.js. Falling back to mock data is recommended for now.'
    ));
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

  function refresh(force) {
    lastFetchError = null;
    if (!theaters.length) { renderAll(); return Promise.resolve(); }
    if (!force && isCacheFresh() && Object.keys(cache).length) {
      renderAll();
      return Promise.resolve();
    }
    var source = Sources[sourceMode] || Sources.mock;
    var dates = [todayISO(), tomorrowISO()];
    var jobs = [];
    theaters.forEach(function (t) {
      dates.forEach(function (d) {
        jobs.push(
          source.fetchTheaterDate(t, d)
            .then(function (shows) { cache[cacheKey(t.bmsCode, d)] = shows; })
            .catch(function (err) { lastFetchError = err.message || String(err); })
        );
      });
    });
    setStatusBanner('Fetching shows…');
    return Promise.all(jobs).then(function () {
      cacheTs = Date.now();
      State.save('mm_cache', cache);
      State.save('mm_cache_ts', cacheTs);
      renderAll();
    });
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
      area: t.area || '', city: t.city || ''
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
    var proxyInput = document.getElementById('mm-proxy-url');
    if (proxyInput) proxyInput.value = proxyUrl;

    var mockRadio = document.getElementById('mm-source-mock');
    var bmsRadio  = document.getElementById('mm-source-bms');
    if (mockRadio) mockRadio.checked = sourceMode === 'mock';
    if (bmsRadio)  bmsRadio.checked  = sourceMode === 'bms';

    var info = document.getElementById('mm-cache-info');
    if (info) {
      var entries = Object.keys(cache).length;
      info.textContent = entries
        ? entries + ' (theater × date) entries cached, last refresh ' + (cacheTs ? minsAgo(cacheTs) + ' min ago' : 'never')
        : 'Cache empty.';
    }
  }

  function bindSettingsTab() {
    document.querySelectorAll('input[name="mm-source"]').forEach(function (r) {
      r.addEventListener('change', function () {
        sourceMode = r.value;
        State.save('mm_source', sourceMode);
        clearCache();
        refresh(true);
      });
    });

    var proxyBtn = document.getElementById('mm-btn-save-proxy');
    var proxyInput = document.getElementById('mm-proxy-url');
    if (proxyBtn && proxyInput) {
      proxyBtn.addEventListener('click', function () {
        var v = (proxyInput.value || '').trim();
        if (!v) { alert('Proxy URL cannot be empty.'); return; }
        if (v.indexOf('{url}') === -1) {
          if (!confirm('URL has no {url} placeholder — the BMS URL will be appended raw. Continue?')) return;
        }
        proxyUrl = v;
        State.save('mm_proxy_url', proxyUrl);
        clearCache();
        refresh(true);
      });
    }

    var clearBtn = document.getElementById('mm-btn-clear-cache');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        clearCache();
        renderAll();
      });
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

    // Save the explicit defaults once on first run, so the user sees something useful
    if (!theaters.length) {
      // Don't auto-populate — let user opt in via "Load Pune defaults" so they
      // see the empty state and make a deliberate choice.
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

/* Gati-Grid — PDF ticket parser + grid renderer
   Minimal, offline-first parser using pdf.js
*/
(function(){
  'use strict';

  // Feature flags / DOM refs
  var uploadZone = document.getElementById('upload-zone');
  var fileInput = document.getElementById('file-input');
  var gridBody = document.getElementById('grid-body');
  var gridHead = document.getElementById('grid-head-row');
  var gridEmpty = document.getElementById('grid-empty');
  var parseLog = document.getElementById('parse-log');
  var searchInput = document.getElementById('search-input');
  var ticketCount = document.getElementById('ticket-count');
  var btnReset = document.getElementById('btn-reset');
  var btnBack = document.getElementById('btn-back');
  var btnDelete = document.getElementById('btn-delete');
  var themeSelect = document.getElementById('theme-select');
  var pasteText = document.getElementById('paste-text');
  var btnParseText = document.getElementById('btn-parse-text');
  var btnClearText = document.getElementById('btn-clear-text');
  var btnTogglePaste = document.getElementById('btn-toggle-paste');
  var pastePanel = document.getElementById('paste-panel');
  var pasteBody = document.getElementById('paste-body');
  var btnColToggle = document.getElementById('btn-col-toggle');
  var columnPanel = document.getElementById('column-panel');

  // Framework init — AnkuraCore provides instanceId, State, meta, theme, back/delete/reset buttons
  var _fw = window.AnkuraCore.init({
    backUrl: '../index.html',
    onReset: function(){ resetAll(); },
    onDelete: function(){
      tickets = []; logs = [];
      try{ State.clearAll(); }catch(e){}
      try{ localStorage.removeItem(LOG_KEY); }catch(e){}
    }
  });
  var INSTANCE_ID = _fw.instanceId;
  var State = _fw.State;
  var tickets = State.load('gati_tickets', []);
  // Migrate legacy global storage (if user previously saved without instance namespacing)
  try{
    var legacy = localStorage.getItem('gati_tickets');
    if(legacy && (!tickets || tickets.length===0)){
      try{ var parsed = JSON.parse(legacy); if(Array.isArray(parsed) && parsed.length>0){ tickets = parsed; State.save('gati_tickets', tickets); localStorage.removeItem('gati_tickets'); } }catch(e){}
    }
  }catch(e){}
  // IndexedDB helpers for large PDF storage
  var DB_NAME = 'GatiGridDB';
  var DB_STORE = 'pdfs';
  var db = null;

  function initIndexedDB(){
    return new Promise(function(resolve){
      if(!window.indexedDB){ console.warn('IndexedDB not available'); resolve(false); return; }
      var req = window.indexedDB.open(DB_NAME, 1);
      req.onerror = function(){ console.warn('IndexedDB open failed'); resolve(false); };
      req.onsuccess = function(){ db = req.result; console.log('IndexedDB ready'); resolve(true); };
      req.onupgradeneeded = function(ev){
        var idb = ev.target.result;
        if(!idb.objectStoreNames.contains(DB_STORE)){
          idb.createObjectStore(DB_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  function storePdfInIndexedDB(id, arrayBuffer){
    return new Promise(function(resolve){
      if(!db){ resolve(false); return; }
      try{
        var tx = db.transaction([DB_STORE], 'readwrite');
        var store = tx.objectStore(DB_STORE);
        store.put({ id: id, data: arrayBuffer });
        tx.oncomplete = function(){ resolve(true); };
        tx.onerror = function(){ console.warn('Failed to store PDF in IndexedDB:', tx.error); resolve(false); };
      }catch(e){ console.warn('IndexedDB store error:', e); resolve(false); }
    });
  }

  function getPdfFromIndexedDB(id){
    return new Promise(function(resolve){
      if(!db){ resolve(null); return; }
      try{
        var tx = db.transaction([DB_STORE], 'readonly');
        var store = tx.objectStore(DB_STORE);
        var req = store.get(id);
        req.onsuccess = function(){ resolve(req.result ? req.result.data : null); };
        req.onerror = function(){ resolve(null); };
      }catch(e){ resolve(null); }
    });
  }

  function deletePdfFromIndexedDB(id){
    return new Promise(function(resolve){
      if(!db){ resolve(true); return; }
      try{
        var tx = db.transaction([DB_STORE], 'readwrite');
        var store = tx.objectStore(DB_STORE);
        store.delete(id);
        tx.oncomplete = function(){ resolve(true); };
        tx.onerror = function(){ resolve(true); };
      }catch(e){ resolve(true); }
    });
  }

  // Start IndexedDB init (for persistent PDF storage)
  initIndexedDB();
  var sessionBlobs = {}; // { id: blobUrl }
  var LOG_KEY = 'gati_logs';
  var logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');

  // Ensure pdfjs is available (loader sets workerSrc before app.js runs)
  var pdfjsAvailable = typeof window.pdfjsLib !== 'undefined';
  if (pdfjsAvailable) {
    document.getElementById('pdfjs-banner') && (document.getElementById('pdfjs-banner').hidden = true);
  } else {
    var b = document.getElementById('pdfjs-banner'); if (b) b.hidden = false;
  }

  /** Utility: append parse log entries */
  function saveLogs(){ try{ localStorage.setItem(LOG_KEY, JSON.stringify(logs)); }catch(e){} }

  function renderLogs(){ if(!parseLog) return; parseLog.innerHTML=''; if(!logs || !logs.length){ parseLog.hidden = true; return; } parseLog.hidden=false; logs.forEach(function(l){ var e=document.createElement('div'); e.className='parse-log__entry parse-log__entry--'+(l.level||'info'); e.textContent = '['+l.ts+'] '+l.msg; parseLog.appendChild(e); }); }

  function log(msg, level){
    var ts = (new Date()).toISOString();
    logs = logs || [];
    logs.push({ ts: ts, level: level||'info', msg: msg });
    // keep last 500
    if(logs.length>500) logs = logs.slice(logs.length-500);
    saveLogs();
    renderLogs();
    // also console-color
    try{
      if(level==='err') console.error('%c'+msg, 'color:#ffffff;background:#c62828;padding:3px');
      else if(level==='warn') console.warn('%c'+msg, 'color:#000000;background:#ffd54f;padding:3px');
      else if(level==='ok') console.info('%c'+msg, 'color:#ffffff;background:#2e7d32;padding:3px');
      else console.log('%c'+msg, 'color:#ffffff;background:#1976d2;padding:3px');
    }catch(e){}
  }

  // init logs render
  document.addEventListener('DOMContentLoaded', function(){ renderLogs(); });

  /** Simple TicketParser using regexes over extracted text */
  function TicketParser(){ }

  TicketParser.prototype.parseText = function(text, meta){
      var out = { passengers: [] };
      try {
        var lines = text.split(/\r?\n/).map(function(s){ return s.replace(/\u00A0/g,' ').trim(); }).filter(Boolean);

        // Debug: log ALL lines so we can see exactly what pdf.js extracted
        log('[Parse] ' + lines.length + ' lines:', 'info');
        for(var dbg=0; dbg<lines.length; dbg++){
          log('  L' + (dbg+1) + ': ' + lines[dbg].slice(0,200), 'info');
        }

        // ── Helpers ──────────────────────────────────────────
        function findLabel(rx){
          for(var i=0;i<lines.length;i++){
            var m=lines[i].match(rx);
            if(m) return {line: lines[i], idx:i, match:m};
          }
          return null;
        }

        // Find the line matching labelRx, then return the valueRx match from same line
        // or next 1-2 lines (handles table layouts where label and value are separate PDF cells).
        function findLabelAndValue(labelRx, valueRx){
          for(var i=0;i<lines.length;i++){
            if(!labelRx.test(lines[i])) continue;
            var lm = lines[i].match(labelRx);
            var rest = lm ? lines[i].slice(lm.index + lm[0].length).replace(/^[\s:\-*]+/,'') : '';
            var vm = rest ? rest.match(valueRx) : null;
            if(vm) return vm;
            for(var j=1;j<=2;j++){
              if(i+j>=lines.length) break;
              var vm2 = lines[i+j].match(valueRx);
              if(vm2) return vm2;
            }
          }
          return null;
        }

        // Clean and validate a station name value. Returns cleaned string or null.
        function refineStation(val){
          if(!val) return null;
          val = val.trim();
          // Trim from first mixed-case word: station names are ALL-CAPS.
          // "PUNE JN (PUNE) Reservation Upto..." → stops at "Re" → "PUNE JN (PUNE)"
          val = val.replace(/\s+[A-Z][a-z]\S*.*$/, '').trim();
          // Remove trailing punctuation/separators
          val = val.replace(/[\s\-\/]+$/, '').trim();
          if(!val || val.length < 2) return null;
          if(/^(JN|JUNC|JCT|SF|EXP|TO|FROM|AT|ON|IN|BY|OF)$/i.test(val)) return null;
          var upper = (val.match(/[A-Z]/g) || []).length;
          var lower = (val.match(/[a-z]/g) || []).length;
          if(lower > upper || upper < 2) return null;
          if(/\b(change|please|check|correct|discrepancy|valid|note|print|carry|during)\b/i.test(val)) return null;
          return val;
        }

        // Known class values regex
        var CLASS_RX = /\b(FIRST\s*AC|SECOND\s*AC|THIRD\s*AC|SLEEPER|3E|3A|2S|2A|1A|SL|CC|EC|EV|AC\s*Chair\s*Car)\b/i;

        // ── PNR ──────────────────────────────────────────────
        var pnrResult = findLabel(/PNR\s*(?:No\.?)?\s*[:\-]?\s*(\d{10})/i);
        if(pnrResult) out.pnr = pnrResult.match[1];
        else { var pFb = text.match(/\b(\d{10})\b/); if(pFb) out.pnr = pFb[1]; }

        // ── Train No / Name ─────────────────────────────────
        // Pattern 1: "NNNNN/NAME" anywhere in text (most reliable for IRCTC)
        var trainFull = text.match(/\b(\d{5})\s*\/\s*([A-Z][A-Z0-9 \-]+)/i);
        if(!trainFull) trainFull = text.match(/\b(\d{4})\s*\/\s*([A-Z][A-Z0-9 \-]+)/i);
        if(trainFull){
          out.trainNo = trainFull[1];
          var tn = trainFull[2].trim();
          // Stop train name at known field labels
          var tnStop = tn.match(/\b(?:Class|Quota|Date|Departure|Arrival|Boarding|Reservation|PNR|Distance|Passenger|Fare|Amount|Charting|Transaction|Scheduled|Coach|Berth)\b/i);
          if(tnStop) tn = tn.slice(0, tnStop.index).trim();
          // Strip class suffix from train name (e.g. "ADI DURONTO SECOND AC" → "ADI DURONTO")
          var classInName = tn.match(/\s+(FIRST\s*AC|SECOND\s*AC|THIRD\s*AC|SLEEPER|AC\s*Chair\s*Car|3A|2A|1A|SL|CC|2S|3E)\s*$/i);
          if(classInName){
            out.class = classInName[1].trim();
            tn = tn.slice(0, classInName.index).trim();
          }
          out.trainName = tn;
        }
        // Pattern 2: label-based "Train No./Name: ..."
        if(!out.trainNo){
          for(var ti=0; ti<lines.length; ti++){
            var trainM = lines[ti].match(/Train\s*(?:No\.?\s*\/?\s*Name|No\.?|Number)\s*[:\-]?\s*(\d{4,5})\s*[\/]\s*([^\n]+)/i);
            if(trainM){
              out.trainNo = trainM[1];
              var tn2 = trainM[2].trim().split(/\s{2,}/)[0];
              var cin2 = tn2.match(/\s+(FIRST\s*AC|SECOND\s*AC|THIRD\s*AC|SLEEPER|AC\s*Chair\s*Car|3A|2A|1A|SL|CC|2S|3E)\s*$/i);
              if(cin2){ if(!out.class) out.class = cin2[1].trim(); tn2 = tn2.slice(0, cin2.index).trim(); }
              out.trainName = tn2;
              break;
            }
            var trainN = lines[ti].match(/Train\s*(?:No\.?|Number)\s*[:\-]?\s*(\d{4,5})\b/i);
            if(trainN && !out.trainNo){ out.trainNo = trainN[1]; break; }
          }
        }
        if(out.trainNo && out.trainName) out.train = out.trainNo + '/' + out.trainName;
        log('[Parse] Train: ' + (out.trainNo||'—') + ' / ' + (out.trainName||'—'), 'info');

        // ── FROM / TO ────────────────────────────────────────
        // FIELD_BOUNDARY: keywords that end a station value when encountered mid-line.
        // Crucially includes Reservation and Boarding so "Boarding Pt PUNE JN Reservation Upto ADI JN"
        // extracts correctly from a single merged line.
        var STATION_BOUNDARY = /\b(?:Class|Quota|Date|Departure|Arrival|Train|PNR|Distance|Passenger|Fare|Amount|Charting|Transaction|Scheduled|Coach|Berth|S\.?\s*No|Reservation|Boarding|Upto|Up\s*to)\b/i;

        function extractStation(labelPatterns, limitFraction){
          var limit = Math.ceil(lines.length * (limitFraction || 0.6));
          for(var lp=0; lp<labelPatterns.length; lp++){
            var pat = labelPatterns[lp];
            for(var li=0; li<limit; li++){
              var m = lines[li].match(pat);
              if(!m) continue;
              var rest = lines[li].slice(m.index + m[0].length).replace(/^[\s:\-]+/, '').trim();
              // Next-line fallback if label is alone on its line
              if(!rest && li+1 < lines.length) rest = lines[li+1].trim();
              if(!rest || rest.length < 2) continue;
              // Stop at field-boundary keywords
              var boundary = rest.match(STATION_BOUNDARY);
              if(boundary) rest = rest.slice(0, boundary.index).trim();
              // Stop at standalone "To" or "From" between spaces
              var toFrom = rest.match(/\s+(?:To|From)\s+/i);
              if(toFrom) rest = rest.slice(0, toFrom.index).trim();
              // Refine and validate
              var refined = refineStation(rest);
              if(refined) return refined;
            }
          }
          return null;
        }

        out.from = null; out.to = null;

        // Tier 0 — IRCTC ERS: "Booked from To" header → station values on next line
        // L2: "Booked from To"  →  L3: "PUNE JN (PUNE)  PUNE JN (PUNE)  AHMEDABAD JN (ADI)"
        // Three columns: [Booked-From] [From] [To] — first two are often identical.
        for(var t0i=0; t0i<Math.min(lines.length-1, 12); t0i++){
          if(!/Booked/i.test(lines[t0i]) || !/\bfrom\b/i.test(lines[t0i]) || !/\bTo\b/i.test(lines[t0i])) continue;
          var t0val = lines[t0i+1];
          var t0rx = /([A-Z][A-Z\s]{2,25}?)\s*\(([A-Z]{2,5})\)/g;
          var t0m, t0stations = [];
          while((t0m = t0rx.exec(t0val)) !== null){
            var t0full = t0m[1].trim() + ' (' + t0m[2] + ')';
            var t0ref = refineStation(t0full);
            if(t0ref && !t0stations.some(function(s){ return s===t0ref; })) t0stations.push(t0ref);
          }
          if(t0stations.length >= 2){
            // If all 3 cols unique: [BookedFrom, From, To] → use index 1,2
            // If first two same (deduped): [From, To] → use index 0,1
            out.from = t0stations.length >= 3 ? t0stations[1] : t0stations[0];
            out.to = t0stations[t0stations.length - 1];
            log('[Parse] From (ERS-header): ' + out.from, 'info');
            log('[Parse] To (ERS-header): ' + out.to, 'info');
          }
          break;
        }

        // Tier 1 — combined "From STATION To STATION" on one line (merged-column PDFs)
        if(!out.from || !out.to){
        for(var cfi=0; cfi<lines.length; cfi++){
          if(!/\bFrom\b/i.test(lines[cfi])) continue;
          var combo = lines[cfi].match(/\bFrom[\s:\-]+([A-Z][A-Z\s\-\/\(\)]{2,35}?)\s+To[\s:\-]+([A-Z][A-Z\s\-\/\(\)]{2,35}?)(?:\s|$)/i);
          if(combo){
            var cf = refineStation(combo[1]); var ct = refineStation(combo[2]);
            if(cf && ct){ out.from = cf; out.to = ct; break; }
          }
        }
        }

        // Tier 2 — individual labeled extraction (search full text, no line limit)
        if(!out.from) out.from = extractStation([
          /Boarding\s*(?:Stn\.?|Station|Pt\.?|Point|At)\s*/i,
          /\bFrom\s*[:\-]\s*/i,
          /\bFrom\s+/i
        ], 1.0);

        if(!out.to) out.to = extractStation([
          /Reservation\s*(?:Up\s*to|Upto|Station|Stn)\s*/i,
          /\bTo\s*[:\-]\s*/i,
          /\bTo\s+/i
        ], 1.0);

        // Tier 3 — label-free: scan for "STATION NAME (CODE)" pattern directly.
        // Require 3+ letter station codes (rejects "(IT)", "(GN)" etc. from disclaimers).
        // Station name must be 4+ chars to avoid short abbreviations like "GGM".
        if(!out.from || !out.to){
          var stCodes = [];
          // [A-Z]{3,5} = 3-5 uppercase letter code (ADI, PUNE, NDLS, BSB etc.)
          var stCodeRx = /\b([A-Z][A-Z\s]{3,28}?)\s*\(([A-Z]{3,5})\)/g;
          var stm2;
          var searchArea = lines.slice(0, Math.ceil(lines.length * 0.75)).join('\n');
          while((stm2 = stCodeRx.exec(searchArea)) !== null){
            var stCode = stm2[2];
            var stName = stm2[1].replace(/\s+[A-Z][a-z]\S*.*$/, '').trim();
            // Skip known non-station abbreviations from IRCTC disclaimers
            if(/^(UTS|GGM|ATM|SMS|IVR|OTP|GST|TDR|EFT|UPI|PNR|ETA|ETD|PCI|DSS|ISO|IPC|RBI|SBI|BOI|BOB|BOC|ICF|DLW|CLW|BCL|MCF|RCF|BEML|ABB|CEL|NELCO|BHEL|CONCOR|RITES|CRIS)$/i.test(stCode)) continue;
            if(stName.length < 4) continue;
            var rawName = stName + ' (' + stCode + ')';
            var refined2 = refineStation(rawName);
            if(refined2 && !stCodes.some(function(s){ return s === refined2; })){
              stCodes.push(refined2);
              log('[Parse] code-scan found: ' + refined2, 'info');
            }
          }
          if(!out.from && stCodes.length >= 1){ out.from = stCodes[0]; log('[Parse] From (code scan): ' + out.from, 'info'); }
          if(!out.to && stCodes.length >= 2){ out.to = stCodes[1]; log('[Parse] To (code scan): ' + out.to, 'info'); }
        }

        log('[Parse] From: "' + (out.from||'—') + '"', 'info');
        log('[Parse] To: "' + (out.to||'—') + '"', 'info');

        // ── Class ────────────────────────────────────────────
        // Already might be set from train name stripping above
        if(!out.class){
          // Look for lines with "Class" label
          for(var ci=0; ci<lines.length; ci++){
            if(!/Class/i.test(lines[ci])) continue;
            var classAfter = lines[ci].replace(/^.*Class\s*[:\-]?\s*/i, '');
            var classM = classAfter.match(CLASS_RX);
            if(classM){ out.class = classM[1].trim(); break; }
          }
        }
        // Fallback: search any line for class value (skip train number lines)
        if(!out.class){
          for(var ci2=0; ci2<lines.length; ci2++){
            if(/\d{4,5}\s*\//.test(lines[ci2])) continue;
            var classM2 = lines[ci2].match(CLASS_RX);
            if(classM2){ out.class = classM2[1].trim(); break; }
          }
        }

        // ── Quota ────────────────────────────────────────────
        out.quota = null;
        var QUOTA_RX = /\b(GENERAL|TATKAL|PREMIUM\s*TATKAL|LADIES|LOWER\s*BERTH|SENIOR\s*CITIZEN|DIVYANGJAN|DEFENCE|FOREIGN\s*TOURIST|GN|TQ|PT|LD|SS|HP|DF|FT)\b/i;
        for(var qi=0; qi<lines.length; qi++){
          if(!/Quota/i.test(lines[qi])) continue;
          var quotaAfter = lines[qi].replace(/^.*Quota\s*[:\-]?\s*/i, '');
          var quotaM = quotaAfter.match(QUOTA_RX);
          if(quotaM){ out.quota = quotaM[1].trim(); break; }
        }
        if(!out.quota){
          var qParen = text.match(/\((?:GN|TQ|PT|LD|SS|HP|DF|FT)\)/i);
          if(qParen) out.quota = qParen[0].replace(/[()]/g, '').trim();
        }

        // ── Date of Journey + Departure ──────────────────────
        out.dateOfJourney = null;
        out.departureTime = null;
        out.departure = null;

        // Date patterns: "DD-Mon-YYYY" or "DD/Mon/YYYY" or "DD-MM-YYYY"
        var DATE_RX = /(\d{1,2}[-\/](?:[A-Za-z]{3,9}|\d{1,2})[-\/]\d{2,4})/;

        for(var di=0; di<lines.length; di++){
          if(!/Date/i.test(lines[di]) && !/Journey/i.test(lines[di])) continue;
          var dojM = lines[di].match(DATE_RX);
          if(dojM){ out.dateOfJourney = dojM[1]; break; }
        }
        // Broader fallback: any date in first 40% of text
        if(!out.dateOfJourney){
          var firstPart = lines.slice(0, Math.ceil(lines.length * 0.4)).join(' ');
          var fpDate = firstPart.match(DATE_RX);
          if(fpDate) out.dateOfJourney = fpDate[1];
        }

        // Departure time
        for(var dti=0; dti<lines.length; dti++){
          var depM = lines[dti].match(/(?:Scheduled\s*)?Departure\s*[:\-]?\s*(\d{1,2}:\d{2})/i);
          if(depM){ out.departureTime = depM[1]; break; }
        }
        if(!out.departureTime){
          for(var dti2=0; dti2<lines.length; dti2++){
            if(!/Departure/i.test(lines[dti2])) continue;
            var timeM = lines[dti2].match(/(\d{1,2}:\d{2})/);
            if(timeM){ out.departureTime = timeM[1]; break; }
            if(dti2+1 < lines.length){
              var ntm = lines[dti2+1].match(/(\d{1,2}:\d{2})/);
              if(ntm){ out.departureTime = ntm[1]; break; }
            }
          }
        }

        out.departure = out.dateOfJourney || '';

        // ── Arrival ──────────────────────────────────────────
        var arrM = findLabelAndValue(/(?:Scheduled\s*)?Arr(?:ival)?\b/i, /(\d{1,2}:\d{2})/);
        if(arrM) out.arrival = arrM[1];
        log('[Parse] Arrival: ' + (out.arrival||'—'), 'info');

        // ── Distance ─────────────────────────────────────────
        var distM = findLabelAndValue(/\bDistance\b/i, /(\d[\d,]+)\s*(?:KM?|Kms?)\b/i);
        if(!distM) distM = findLabelAndValue(/\bDistance\b/i, /(\d{2,})/);
        if(distM) out.distance = distM[1].replace(/,/g,'') + ' KM';
        log('[Parse] Distance: ' + (out.distance||'—'), 'info');

        // ── Fare ─────────────────────────────────────────────
        var fareM = findLabelAndValue(/\bTotal\s*(?:Ticket\s*)?Fare\b/i, /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
        if(!fareM) fareM = findLabelAndValue(/\bTotal\s*(?:Ticket\s*)?Fare\b/i, /([\d,]{3,}(?:\.\d{1,2})?)/);
        if(!fareM) fareM = findLabelAndValue(/\bTicket\s*Fare\b/i, /Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
        if(!fareM) fareM = findLabelAndValue(/\bTicket\s*Fare\b/i, /([\d,]{3,}(?:\.\d{1,2})?)/);
        if(fareM) out.fare = 'Rs.' + fareM[1].replace(/,/g,'');
        log('[Parse] Fare: ' + (out.fare||'—'), 'info');

        // ── Booking Date ──────────────────────────────────────
        var bookM = findLabelAndValue(/(?:Date\s*of\s*Booking|Booking\s*Date|Booked\s*On)\b/i, /(\d{1,2}[-\/](?:[A-Za-z]{3,9}|\d{1,2})[-\/]\d{2,4})/i);
        if(bookM) out.bookingDate = bookM[1];
        log('[Parse] Booking Date: ' + (out.bookingDate||'—'), 'info');

        // ── Transaction ID ────────────────────────────────────
        var txnM = findLabelAndValue(/Transaction\s*(?:ID|No\.?)\b/i, /(\d{10,14})/);
        if(txnM) out.transactionId = txnM[1];
        log('[Parse] Transaction ID: ' + (out.transactionId||'—'), 'info');

        // ── Passengers ───────────────────────────────────────
        var PASS_STOP = /\b(?:Total|Fare|GST|Amount|Legends|This\s*ticket|clerkage|insurance|Consumer|Helpline|unauthorized|purchase|IRCTC|refund|cancellation|liability|responsibility|Important|Please\s*note|Copyright|Indian\s*Railway|contact|website|National|e-ticket|Note\s*:|charges?\s*of\s*Rs|In\s*case\s*of)/i;
        var STATUS_TOKENS = /^(CNF|CONFIRMED|RAC|WL|RLWL|PQWL|RSWL|CAN|CANCL|CANX)/i;

        // Helper: parse IRCTC status string like "CNF/A1/46/UPPER" → { status: "CNF", seat: "A1/46/UPPER" }
        function parseStatus(raw){
          if(!raw) return { status: '', seat: '' };
          var parts = raw.split('/');
          var tok = parts[0].toUpperCase();
          if(STATUS_TOKENS.test(tok)){
            return { status: tok, seat: parts.length > 1 ? parts.slice(1).join('/') : '' };
          }
          return { status: raw.toUpperCase(), seat: '' };
        }

        var passHeaderIdx = -1;
        for(var ii=0; ii<lines.length; ii++){
          if(/Passenger\s*Detail|S\.?\s*No\.?\s+Name/i.test(lines[ii])){ passHeaderIdx = ii; break; }
        }

        if(passHeaderIdx >= 0){
          log('[Parse] Passenger header at line ' + (passHeaderIdx+1) + ': ' + lines[passHeaderIdx].slice(0,80), 'info');
          var passLines = lines.slice(passHeaderIdx+1, passHeaderIdx+25);
          for(var pi2=0; pi2<passLines.length; pi2++){
            var pl = passLines[pi2];
            if(PASS_STOP.test(pl)){ log('[Parse] Passenger stop at: ' + pl.slice(0,60), 'info'); break; }
            if(pl.length < 3 || /^[\-=]+$/.test(pl)) continue;

            // Pattern A: "1 NAME AGE GENDER STATUS1 [STATUS2]"
            var pmA = pl.match(/(\d{1,2})[\.\)\s]+([A-Z][A-Za-z\s\.\'\-]+?)\s+(\d{1,3})\s+(Male|Female|M|F|Transgender)\s+([\S]+)(?:\s+([\S]+))?/i);
            if(pmA){
              // Prefer the column that starts with a known status token
              var s1 = parseStatus(pmA[5] || '');
              var s2 = pmA[6] ? parseStatus(pmA[6]) : null;
              var bestStatus, bestSeat;
              if(s2 && STATUS_TOKENS.test(s2.status)){
                bestStatus = s2.status; bestSeat = s2.seat;
              } else if(STATUS_TOKENS.test(s1.status)){
                bestStatus = s1.status; bestSeat = s1.seat;
              } else {
                bestStatus = s1.status; bestSeat = s1.seat;
              }
              // Combine seat info from both columns if needed
              if(!bestSeat && s2 && s2.seat) bestSeat = s2.seat;
              if(!bestSeat && s1.seat && s1.status !== bestStatus) bestSeat = (pmA[5]||'').replace(/^[^\/]*\/?/, '');
              out.passengers.push({ seq: pmA[1], name: pmA[2].trim(), age: pmA[3], gender: (pmA[4]||'')[0], status: bestStatus, seat: bestSeat });
              continue;
            }

            // Pattern B: "1 NAME STATUS/COACH/BERTH" (no age/gender)
            var pmB = pl.match(/(\d{1,2})[\).\s]+([A-Z][A-Za-z\s\.\'\-]{2,40}?)\s+(CNF|WL|RAC|CAN|CANCL|CANX|RLWL|PQWL|RSWL|CONFIRMED)([\S]*)/i);
            if(pmB){
              var nmB = pmB[2].trim();
              if(!PASS_STOP.test(nmB)){
                var sB = parseStatus((pmB[3]+(pmB[4]||'')));
                out.passengers.push({ seq: pmB[1], name: nmB, age: '', gender: '', status: sB.status, seat: sB.seat });
              }
              continue;
            }
          }
        }

        // Fallback: scan text for status tokens near numbered entries
        if(out.passengers.length === 0){
          log('[Parse] No passengers from primary scan, trying fallback...', 'warn');
          var statusRx = /\b(CNF|CONFIRMED|RAC|WL|RLWL|PQWL|RSWL|CANCL|CAN|CANX)((?:\/[A-Z0-9\-]+)*)/ig;
          var stMatch;
          while((stMatch = statusRx.exec(text)) !== null){
            if(stMatch.index > text.length * 0.7) break;
            var fullSt = (stMatch[1] + (stMatch[2]||'')).toUpperCase();
            var sParsed = parseStatus(fullSt);
            var back = text.slice(Math.max(0, stMatch.index-150), stMatch.index);
            var numMatch = back.match(/(\d{1,2})\.\s*([A-Z][A-Za-z\s\.]{2,35})/);
            if(numMatch && !out.passengers.some(function(p){ return p.seq===numMatch[1]; })){
              var fbName = numMatch[2].trim();
              if(!PASS_STOP.test(fbName)){
                out.passengers.push({ seq: numMatch[1], name: fbName, age: '', gender: '', status: sParsed.status, seat: sParsed.seat });
              }
            }
          }
        }

        // Derive overall status from first passenger
        if(out.passengers.length > 0) out.status = out.passengers[0].status || '';

        // Final summary log
        log('[Parse] RESULT: PNR=' + (out.pnr||'—') + ' Train=' + (out.trainNo||'—') + '/' + (out.trainName||'—') + ' From=' + (out.from||'—') + ' To=' + (out.to||'—') + ' Class=' + (out.class||'—') + ' Quota=' + (out.quota||'—') + ' Arrival=' + (out.arrival||'—') + ' Dist=' + (out.distance||'—') + ' Fare=' + (out.fare||'—') + ' Booked=' + (out.bookingDate||'—') + ' Txn=' + (out.transactionId||'—') + ' Pax=' + out.passengers.length + (out.passengers.length ? ' [' + out.passengers.map(function(p){return p.name + '(st:' + p.status + ' seat:' + p.seat + ')';}).join(', ') + ']' : ''), 'ok');

      } catch (e){ log('Parser error: '+e.message,'err'); }
      out._meta = meta || {};
      return out;
  };

  /** Read a PDF file using pdf.js and extract plain text */
  function extractTextFromPdf(file, cb){
    if(!pdfjsAvailable){ cb(new Error('pdfjs not available')); return; }
    var reader = new FileReader();
    reader.onload = function(){
      var data = new Uint8Array(reader.result);
      pdfjsLib.getDocument({data: data}).promise.then(function(pdf){
        var max = pdf.numPages; var out = [];
        var pagePromises = [];
        for(var p=1;p<=max;p++){
          (function(pageNum){
            pagePromises.push(pdf.getPage(pageNum).then(function(page){
              return page.getTextContent().then(function(tc){
                // Group text items by Y coordinate to preserve line structure
                var items = [];
                for(var k=0; k<tc.items.length; k++){
                  var it = tc.items[k];
                  if(it.str && it.str.trim()) items.push({ x: it.transform[4], y: Math.round(it.transform[5]/4)*4, str: it.str });
                }
                var yMap = {};
                for(var k2=0; k2<items.length; k2++){
                  var yk = items[k2].y;
                  if(!yMap[yk]) yMap[yk] = [];
                  yMap[yk].push(items[k2]);
                }
                var ys = Object.keys(yMap).map(Number).sort(function(a,b){ return b-a; });
                var textLines = [];
                for(var k3=0; k3<ys.length; k3++){
                  var row = yMap[ys[k3]].sort(function(a,b){ return a.x - b.x; });
                  textLines.push(row.map(function(r){ return r.str; }).join(' '));
                }
                return textLines.join('\n');
              });
            }));
          })(p);
        }
        Promise.all(pagePromises).then(function(pages){ cb(null, pages.join('\n')); }).catch(function(err){ cb(err); });
      }).catch(function(err){ cb(err); });
    };
    reader.onerror = function(e){ cb(e); };
    reader.readAsArrayBuffer(file);
  }

  /** Process uploaded files */
  function handleFiles(list){
    var files = Array.prototype.slice.call(list);
    files.forEach(function(f){
      log('Processing '+f.name, 'info');
      extractTextFromPdf(f, function(err, text){
        if(err){ log('Failed to parse '+f.name+': '+err.message,'err'); return; }
        var tp = new TicketParser();
        var parsed = tp.parseText(text, { fileName: f.name, size: f.size, uploadedAt: new Date().toISOString() });
        parsed._id = parsed.pnr || ('tmp-'+Math.random().toString(36).slice(2,9));
        // Store PDF in IndexedDB (all files big or small) + create session blob
        var reader = new FileReader();
        reader.onload = function(){
          var arrayBuffer = reader.result;
          // Store in IndexedDB for persistence
          storePdfInIndexedDB(parsed._id, arrayBuffer).then(function(ok){
            if(ok) log('Stored PDF: '+parsed._id, 'ok');
            else log('Could not store PDF to IndexedDB, will be session-only', 'warn');
            // Always create session blob for immediate access
            try{ var blob = new Blob([arrayBuffer], { type: 'application/pdf' }); sessionBlobs[parsed._id] = URL.createObjectURL(blob); }catch(e){}
            renderGrid();
          });
          // Also store small base64 in localStorage as fallback
          if(f.size < 50*1024){
            try{ parsed._pdfBase64 = btoa(String.fromCharCode.apply(null, new Uint8Array(arrayBuffer))); }catch(e){}
          }
          saveTicket(parsed);
        };
        reader.onerror = function(){ log('Failed to read file: '+f.name, 'err'); saveTicket(parsed); renderGrid(); };
        reader.readAsArrayBuffer(f);
      });
    });
  }

  // Delete All (tickets + logs)
  function deleteAll(){
    if(!confirm('Delete ALL tickets and logs?')) return;
    try{ for(var k in sessionBlobs){ URL.revokeObjectURL(sessionBlobs[k]); } sessionBlobs={}; }catch(e){}
    // Clear all PDFs from IndexedDB
    if(db && tickets.length>0){
      try{
        tickets.forEach(function(t){ deletePdfFromIndexedDB(t._id); });
      }catch(e){}
    }
    tickets=[]; logs=[];
    try{ State.clear('gati_tickets'); localStorage.removeItem(LOG_KEY); }catch(e){}
    renderGrid(); renderLogs();
  }

  function saveTicket(parsed){
    // dedupe by _id
    var idx = tickets.findIndex(function(t){ return t._id === parsed._id; });
    if(idx>=0) tickets[idx] = parsed; else tickets.push(parsed);
    try{ State.save('gati_tickets', tickets); } catch(e){ log('Save failed: '+e.message,'err'); }
  }

  /** Grid rendering */
  var defaultColumns = [
    { key: 'departure', label: 'Date / Time', sortable:true },
    { key: 'departureTime', label: 'Dep. Time', sortable:false },
    { key: 'route', label: 'From → To', sortable:false },
    { key: 'trainNo', label: 'Train No.', sortable:true },
    { key: 'trainName', label: 'Train Name', sortable:false },
    { key: 'class', label: 'Class', sortable:false },
    { key: 'quota', label: 'Quota', sortable:false },
    { key: 'passengers', label: 'Passengers', sortable:false },
    { key: 'pnr', label: 'PNR', sortable:true },
    { key: 'status', label: 'Status', sortable:false },
    { key: 'arrival', label: 'Arrival', sortable:false },
    { key: 'distance', label: 'Distance', sortable:true },
    { key: 'fare', label: 'Fare', sortable:true },
    { key: 'bookingDate', label: 'Booked On', sortable:false },
    { key: 'transactionId', label: 'Txn ID', sortable:false },
    { key: 'actions', label: '', sortable:false }
  ];
  var hiddenByDefault = ['departureTime', 'quota', 'fare', 'bookingDate', 'transactionId'];
  var visibleCols = defaultColumns.map(function(c){ return c.key; }).filter(function(k){ return hiddenByDefault.indexOf(k) === -1; });

  // Maps each column key to a function that returns the searchable text for a ticket.
  // Only columns in visibleCols are searched — add new keys here when adding new columns.
  var COL_SEARCH = {
    departure:     function(t){ return [t.dateOfJourney, t.departureDate, t.departure, t.departureTime].filter(Boolean).join(' '); },
    departureTime: function(t){ return t.departureTime || ''; },
    route:         function(t){ return [t.from, t.to].filter(Boolean).join(' '); },
    trainNo:    function(t){ return t.trainNo || ''; },
    trainName:  function(t){ return t.trainName || ''; },
    class:      function(t){ return t.class || ''; },
    quota:      function(t){ return t.quota || ''; },
    passengers: function(t){ return (t.passengers||[]).map(function(p){ return [p.name, p.seat, p.age].filter(Boolean).join(' '); }).join(' '); },
    pnr:        function(t){ return t.pnr || ''; },
    status:        function(t){ return (t.passengers||[]).map(function(p){ return p.status||''; }).join(' ') || t.status || ''; },
    arrival:       function(t){ return t.arrival || ''; },
    distance:      function(t){ return t.distance || ''; },
    fare:          function(t){ return t.fare || ''; },
    bookingDate:   function(t){ return t.bookingDate || ''; },
    transactionId: function(t){ return t.transactionId || ''; }
  };

  function buildColumnPanel() {
    if (!columnPanel) return;
    columnPanel.innerHTML = '';
    defaultColumns.forEach(function(col) {
      if (col.key === 'actions') return;
      var item = document.createElement('label');
      item.className = 'column-panel__item';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = visibleCols.indexOf(col.key) !== -1;
      cb.addEventListener('change', function() {
        if (cb.checked) {
          if (visibleCols.indexOf(col.key) === -1) visibleCols.push(col.key);
        } else {
          visibleCols = visibleCols.filter(function(k) { return k !== col.key; });
        }
        renderGrid();
      });
      item.appendChild(cb);
      item.appendChild(document.createTextNode(' ' + col.label));
      columnPanel.appendChild(item);
    });
  }

  // Extract the best short code for a station string.
  // Prefers parenthetical codes like "(ADI)" or "(PUNE)", falls back to first meaningful word.
  var SUFFIX_TOKENS = ['JN','JUNC','JCT','SF','RD','RDSTN','EXP'];
  function stationCode(str) {
    if (!str) return null;
    // Prefer explicit station code in parentheses: "AHMEDABAD JN (ADI)" → "ADI"
    var paren = str.match(/\(([A-Z]{2,5})\)/);
    if (paren) return paren[1];
    // Fall back to first non-suffix uppercase token
    var tks = str.split(/\s+/).filter(Boolean);
    for (var ti2 = 0; ti2 < tks.length; ti2++) {
      var tok = tks[ti2].replace(/[^A-Z]/gi, '').toUpperCase();
      if (tok.length >= 2 && SUFFIX_TOKENS.indexOf(tok) === -1) return tok;
    }
    return null;
  }
  function escH(s){ var d=document.createElement('div'); d.appendChild(document.createTextNode(s||'')); return d.innerHTML; }

  function renderGrid(){
    gridHead.innerHTML = '';
    defaultColumns.forEach(function(col){
      if(visibleCols.indexOf(col.key)===-1) return;
      var th = document.createElement('th'); th.textContent = col.label; if(col.sortable) th.className='sortable';
      gridHead.appendChild(th);
    });
    gridBody.innerHTML = '';
    var filtered = tickets.slice();
    var q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    if(q){ filtered = filtered.filter(function(t){ return visibleCols.some(function(key){ var fn = COL_SEARCH[key]; return fn ? fn(t).toLowerCase().indexOf(q) !== -1 : false; }); }); }

    if(filtered.length===0){ gridEmpty.style.display='block'; } else { gridEmpty.style.display='none'; }

    filtered.forEach(function(t){
      var tr = document.createElement('tr');

      // Date / Time
      if(visibleCols.indexOf('departure')!==-1){
        var td = document.createElement('td');
        var dateStr = t.dateOfJourney || t.departureDate || t.departure || '—';
        var timeStr = t.departureTime || '';
        td.innerHTML = '<div class="cell-date__date">'+escH(dateStr)+'</div>'+(timeStr ? '<div class="cell-date__time">'+escH(timeStr)+'</div>' : '');
        tr.appendChild(td);
      }

      // Departure Time (standalone)
      if(visibleCols.indexOf('departureTime')!==-1){
        var tdDepTime = document.createElement('td');
        tdDepTime.textContent = t.departureTime || '—';
        tr.appendChild(tdDepTime);
      }

      // From → To
      if(visibleCols.indexOf('route')!==-1){
        var td2 = document.createElement('td');
        var shortL = stationCode(t.from) || '—';
        var shortR = stationCode(t.to) || '—';
        var fullL = t.from || shortL;
        var fullR = t.to || shortR;
        td2.innerHTML = '<div class="cell-route__short"><span class="cell-route__code">'+escH(shortL)+'</span><span class="cell-route__dash"> → </span><span class="cell-route__code">'+escH(shortR)+'</span></div>'+
                         '<div class="cell-route__full">'+escH(fullL)+' <span class="cell-route__arrow">→</span> '+escH(fullR)+'</div>';
        tr.appendChild(td2);
      }

      // Train No.
      if(visibleCols.indexOf('trainNo')!==-1){
        var td3 = document.createElement('td'); td3.className='cell-train-no';
        td3.innerHTML = '<span class="cell-train__no">'+escH(t.trainNo||'—')+'</span>';
        tr.appendChild(td3);
      }

      // Train Name
      if(visibleCols.indexOf('trainName')!==-1){
        var td3b = document.createElement('td'); td3b.className='cell-train-name';
        td3b.innerHTML = '<span class="cell-train__name">'+escH(t.trainName||'—')+'</span>';
        tr.appendChild(td3b);
      }

      // Class
      if(visibleCols.indexOf('class')!==-1){
        var td4 = document.createElement('td'); td4.className='cell-class';
        td4.textContent = t.class || '—';
        tr.appendChild(td4);
      }

      // Quota
      if(visibleCols.indexOf('quota')!==-1){
        var tdQ = document.createElement('td'); tdQ.className='cell-quota';
        tdQ.textContent = t.quota || '—';
        tr.appendChild(tdQ);
      }

      // Passengers
      if(visibleCols.indexOf('passengers')!==-1){
        var tdP = document.createElement('td'); tdP.className='cell-passengers';
        if(t.passengers && t.passengers.length > 0){
          var pHtml = t.passengers.map(function(p){
            var parts = [escH(p.name||'?')];
            if(p.age) parts.push(escH(p.age) + (p.gender ? p.gender : ''));
            var pStatus = (p.status||'').toUpperCase();
            if(pStatus){
              var pCls = /^(CNF|CONFIRMED)$/.test(pStatus) ? 'pstatus--cnf' :
                         /^RAC$/.test(pStatus)             ? 'pstatus--rac' :
                         /WL/.test(pStatus)                ? 'pstatus--wl'  :
                         /^CAN/.test(pStatus)              ? 'pstatus--can' : 'pstatus--unknown';
              parts.push('<span class="pstatus-badge '+pCls+'">'+escH(pStatus)+'</span>');
            }
            if(p.seat) parts.push('<span class="cell-passengers__seat">'+escH(p.seat)+'</span>');
            return '<div class="cell-passengers__entry"><span class="cell-passengers__name">'+parts[0]+'</span>'+(parts.length>1 ? ' <span class="cell-passengers__detail">'+parts.slice(1).join(' · ')+'</span>' : '')+'</div>';
          }).join('');
          tdP.innerHTML = pHtml;
        } else { tdP.textContent = '—'; }
        tr.appendChild(tdP);
      }

      // PNR
      if(visibleCols.indexOf('pnr')!==-1){
        var td5 = document.createElement('td'); td5.className='cell-pnr';
        td5.textContent = t.pnr || '—';
        tr.appendChild(td5);
      }

      // Status
      if(visibleCols.indexOf('status')!==-1){
        var td6 = document.createElement('td');
        var st = (t.passengers && t.passengers[0] && t.passengers[0].status) ? t.passengers[0].status.toUpperCase() : 'UNKNOWN';
        var statusPrefix = st.match(/(CNF|RAC|WL|CAN|CANL|CANX|CONFIRMED|RLWL|PQWL|RSWL)/i);
        var displayStatus = statusPrefix ? statusPrefix[1].toUpperCase() : st;
        var cls='status--unknown';
        if(/CNF|CONFIRMED/i.test(displayStatus)) cls='status--cnf';
        else if(/WL/i.test(displayStatus)) cls='status--wl';
        else if(/RAC/i.test(displayStatus)) cls='status--rac';
        else if(/CAN/i.test(displayStatus)) cls='status--can';
        td6.innerHTML = '<span class="status-badge '+cls+'">'+escH(displayStatus)+'</span>';
        tr.appendChild(td6);
      }

      // Arrival
      if(visibleCols.indexOf('arrival')!==-1){
        var tdArr = document.createElement('td');
        tdArr.textContent = t.arrival || '—';
        tr.appendChild(tdArr);
      }

      // Distance
      if(visibleCols.indexOf('distance')!==-1){
        var tdDist = document.createElement('td'); tdDist.className='cell-distance';
        tdDist.textContent = t.distance || '—';
        tr.appendChild(tdDist);
      }

      // Fare
      if(visibleCols.indexOf('fare')!==-1){
        var tdFare = document.createElement('td'); tdFare.className='cell-fare';
        tdFare.textContent = t.fare || '—';
        tr.appendChild(tdFare);
      }

      // Booked On
      if(visibleCols.indexOf('bookingDate')!==-1){
        var tdBk = document.createElement('td');
        tdBk.textContent = t.bookingDate || '—';
        tr.appendChild(tdBk);
      }

      // Transaction ID
      if(visibleCols.indexOf('transactionId')!==-1){
        var tdTxn = document.createElement('td'); tdTxn.className='cell-pnr';
        tdTxn.textContent = t.transactionId || '—';
        tr.appendChild(tdTxn);
      }

      // Actions (View PDF, QR/Preview, Delete)
      if(visibleCols.indexOf('actions')!==-1){
        var td7 = document.createElement('td'); td7.className='cell-actions';
        var vbtn = document.createElement('button'); vbtn.className='btn btn--outline'; vbtn.textContent='PDF';
        vbtn.addEventListener('click', (function(id){ return function(){ viewPdf(id); }; })(t._id));
        var qbtn = document.createElement('button'); qbtn.className='btn btn--outline'; qbtn.textContent='QR';
        qbtn.addEventListener('click', (function(id){ return function(){ showPdfModal(id); }; })(t._id));
        var del = document.createElement('button'); del.className='btn btn--danger-outline'; del.textContent='Del';
        del.addEventListener('click', (function(id){ return function(){ deleteTicket(id); }; })(t._id));
        td7.appendChild(vbtn); td7.appendChild(qbtn); td7.appendChild(del);
        tr.appendChild(td7);
      }

      gridBody.appendChild(tr);
    });

    ticketCount.textContent = tickets.length + ' tickets';
  }

  function viewPdf(id){
    // Try session blob first (fastest)
    if(sessionBlobs[id]){ window.open(sessionBlobs[id], '_blank'); return; }
    // Try IndexedDB (persistent storage)
    getPdfFromIndexedDB(id).then(function(arrayBuffer){
      if(arrayBuffer){
        try{
          var blob = new Blob([arrayBuffer], { type: 'application/pdf' });
          var url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          return;
        }catch(e){ console.warn('Failed to open PDF from IndexedDB:', e); }
      }
      // Fall back to base64 in localStorage
      var t = tickets.find(function(x){ return x._id===id; });
      if(t && t._pdfBase64){
        try{ window.open('data:application/pdf;base64,'+t._pdfBase64, '_blank'); return; }catch(e){ log('Failed to open PDF: '+e.message,'err'); }
      }
      alert('PDF not available. Try re-uploading the file.');
    });
  }

  /** Render PDF page to canvas in a modal (shows QR code) */
  function showPdfModal(id){
    var modal = document.getElementById('pdf-modal');
    var canvas = document.getElementById('pdf-canvas');
    if(!modal || !canvas){ alert('Modal not available'); return; }

    function renderFromBuffer(arrayBuffer){
      if(!arrayBuffer){ alert('PDF not available. Try re-uploading.'); return; }
      if(!pdfjsAvailable){ alert('PDF.js not loaded'); return; }
      pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise.then(function(pdf){
        pdf.getPage(1).then(function(page){
          var scale = 1.5;
          var viewport = page.getViewport({ scale: scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          var ctx = canvas.getContext('2d');
          page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function(){
            modal.hidden = false;
            modal.style.display = 'flex';
          });
        });
      }).catch(function(err){ alert('Failed to render PDF: ' + err.message); });
    }

    // Get PDF data from IndexedDB
    getPdfFromIndexedDB(id).then(function(arrayBuffer){
      if(arrayBuffer){ renderFromBuffer(arrayBuffer); return; }
      // Fallback: base64 in ticket data
      var t = tickets.find(function(x){ return x._id === id; });
      if(t && t._pdfBase64){
        try{
          var bin = atob(t._pdfBase64);
          var bytes = new Uint8Array(bin.length);
          for(var i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
          renderFromBuffer(bytes.buffer);
        }catch(e){ alert('Failed to decode PDF'); }
      } else { alert('PDF not available. Try re-uploading.'); }
    });
  }

  function closePdfModal(){
    var modal = document.getElementById('pdf-modal');
    if(modal){ modal.hidden = true; modal.style.display = 'none'; }
  }

  function restoreSessionBlobs(){
    // Restore session blob URLs from IndexedDB (most reliable)
    try{
      var promises = [];
      tickets.forEach(function(t){
        if(!sessionBlobs[t._id]){
          promises.push(
            getPdfFromIndexedDB(t._id).then(function(arrayBuffer){
              if(arrayBuffer){
                try{
                  var blob = new Blob([arrayBuffer], { type: 'application/pdf' });
                  sessionBlobs[t._id] = URL.createObjectURL(blob);
                  log('Restored PDF from storage: '+t._id, 'ok');
                }catch(e){ console.warn('Error restoring PDF '+t._id, e); }
              } else if(t._pdfBase64){
                // Fallback: recreate from base64
                try{
                  var binary = atob(t._pdfBase64);
                  var bytes = new Uint8Array(binary.length);
                  for(var i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
                  var blob = new Blob([bytes], { type: 'application/pdf' });
                  sessionBlobs[t._id] = URL.createObjectURL(blob);
                  log('Restored PDF from base64: '+t._id, 'ok');
                }catch(e2){ console.warn('Error restoring from base64 '+t._id, e2); }
              }
            })
          );
        }
      });
      if(promises.length>0){
        Promise.all(promises).then(function(){ log('Session PDFs restored', 'ok'); });
      }
    }catch(e){ console.warn('restoreSessionBlobs error:', e); }
  }

  function deleteTicket(id){
    if(!confirm('Delete ticket?')) return;
    try{ if(sessionBlobs[id]){ URL.revokeObjectURL(sessionBlobs[id]); delete sessionBlobs[id]; } }catch(e){}
    deletePdfFromIndexedDB(id);
    tickets = tickets.filter(function(x){ return x._id !== id; });
    try{ State.save('gati_tickets', tickets); } catch(e){}
    renderGrid();
  }

  function resetAll(){ 
    if(!confirm('Clear all tickets?')) return; 
    try{ for(var k in sessionBlobs){ URL.revokeObjectURL(sessionBlobs[k]); } sessionBlobs={}; }catch(e){}
    // Clear all PDFs from IndexedDB
    if(db && tickets.length>0){
      try{
        tickets.forEach(function(t){ deletePdfFromIndexedDB(t._id); });
      }catch(e){}
    }
  }

  // wire upload/drop
  if(uploadZone){
    // Avoid double-opening the file picker when the upload area contains a <label for="file-input">.
    // If the click target is the label or the input itself, allow the native action and skip the programmatic click.
    uploadZone.addEventListener('click', function(e){
      try{
        var tg = e && e.target;
        if(tg){
          var tag = (tg.tagName||'').toUpperCase();
          if(tag === 'LABEL' && tg.getAttribute && tg.getAttribute('for') === 'file-input') return;
          if(tg.id === 'file-input') return;
        }
      }catch(err){}
      // schedule the click to the next tick to avoid interfering with native label behavior
      setTimeout(function(){ try{ fileInput && fileInput.click(); }catch(e){} }, 0);
    });
    uploadZone.addEventListener('dragover', function(e){ e.preventDefault(); uploadZone.classList.add('upload-zone--dragover'); });
    uploadZone.addEventListener('dragleave', function(e){ uploadZone.classList.remove('upload-zone--dragover'); });
    uploadZone.addEventListener('drop', function(e){ e.preventDefault(); uploadZone.classList.remove('upload-zone--dragover'); handleFiles(e.dataTransfer.files); });
  }
  if(fileInput){ fileInput.addEventListener('change', function(e){ handleFiles(e.target.files); fileInput.value=''; }); }

  // Paste-text handlers
  if(btnParseText && pasteText){ btnParseText.addEventListener('click', function(){ var txt = pasteText.value || ''; if(!txt.trim()){ alert('Paste some text first'); return; } try{ var tp = new TicketParser(); var parsed = tp.parseText(txt, { fileName: 'pasted-text', size: txt.length, uploadedAt: new Date().toISOString() }); parsed._id = parsed.pnr || ('tmp-'+Math.random().toString(36).slice(2,9)); saveTicket(parsed); try{ var u = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); sessionBlobs[parsed._id] = u; }catch(e){} renderGrid(); log('Parsed from pasted text: '+(parsed.pnr||parsed._id),'ok'); }catch(e){ log('Parse failed: '+e.message,'err'); } }); }
  if(btnClearText && pasteText){ btnClearText.addEventListener('click', function(){ pasteText.value=''; }); }
  if(btnTogglePaste && pastePanel && pasteBody){
    // initialize label according to collapsed state
    try{ var isCollapsedInit = pastePanel.classList.contains('collapsed'); btnTogglePaste.textContent = isCollapsedInit ? 'Show' : 'Hide'; btnTogglePaste.setAttribute('aria-expanded', isCollapsedInit ? 'false' : 'true'); }catch(e){}
    btnTogglePaste.addEventListener('click', function(){
      var isCollapsed = pastePanel.classList.contains('collapsed');
      if(isCollapsed){
        pastePanel.classList.remove('collapsed');
        pasteBody.hidden = false;
        btnTogglePaste.textContent = 'Hide';
        btnTogglePaste.setAttribute('aria-expanded','true');
      } else {
        pastePanel.classList.add('collapsed');
        pasteBody.hidden = true;
        btnTogglePaste.textContent = 'Show';
        btnTogglePaste.setAttribute('aria-expanded','false');
      }
    });
  }

  if(searchInput){ searchInput.addEventListener('input', function(){ renderGrid(); }); }

  if (btnColToggle && columnPanel) {
    buildColumnPanel();
    btnColToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      columnPanel.hidden = !columnPanel.hidden;
    });
    document.addEventListener('click', function(e) {
      if (!columnPanel.hidden && !columnPanel.contains(e.target) && e.target !== btnColToggle) {
        columnPanel.hidden = true;
      }
    });
  }

  // btn-back, btn-delete, btn-reset wired by AnkuraCore.init
  var btnDeleteAll = document.getElementById('btn-delete-all');
  if(btnDeleteAll){ btnDeleteAll.addEventListener('click', function(){ deleteAll(); }); }

  // Wire PDF modal close
  var modalCloseBtn = document.getElementById('pdf-modal-close');
  var modalBackdrop = document.getElementById('pdf-modal-backdrop');
  if(modalCloseBtn) modalCloseBtn.addEventListener('click', closePdfModal);
  if(modalBackdrop) modalBackdrop.addEventListener('click', closePdfModal);

  // init — theme/meta handled by AnkuraCore.init
  try{ renderGrid(); } catch(e){ console.warn('renderGrid failed', e); }
  try{ restoreSessionBlobs(); } catch(e){ console.warn('Failed to restore PDFs', e); }

  // expose for debugging
  window.GATI_DEBUG = { tickets: tickets, sessionBlobs: sessionBlobs };

})();

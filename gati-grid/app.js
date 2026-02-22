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

  var STORAGE_KEY = 'gati_tickets';
  var tickets = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  var sessionBlobs = {}; // { id: blobUrl }

  // Ensure pdfjs is available (loader sets workerSrc before app.js runs)
  var pdfjsAvailable = typeof window.pdfjsLib !== 'undefined';
  if (pdfjsAvailable) {
    document.getElementById('pdfjs-banner') && (document.getElementById('pdfjs-banner').hidden = true);
  } else {
    var b = document.getElementById('pdfjs-banner'); if (b) b.hidden = false;
  }

  /** Utility: append parse log entries */
  function log(msg, level){
    if(!parseLog) return;
    parseLog.hidden = false;
    var e = document.createElement('div'); e.className = 'parse-log__entry';
    if(level) e.className += ' parse-log__entry--' + level;
    e.textContent = msg;
    parseLog.appendChild(e);
  }

  /** Simple TicketParser using regexes over extracted text */
  function TicketParser(){ }

  TicketParser.prototype.parseText = function(text, meta){
      var out = { passengers: [] };
      try {
        var lines = text.split(/\r?\n/).map(function(s){ return s.replace(/\u00A0/g,' ').trim(); }).filter(Boolean);

        // Helper: find first matching label line and capture group
        function findLabel(rx){ for(var i=0;i<lines.length;i++){ var m=lines[i].match(rx); if(m) return {line: lines[i], idx:i, match:m}; } return null; }

        // PNR: explicit label or any 10-digit sequence
        var pLabel = findLabel(/PNR\s*[:\-]?\s*(\d{10})/i);
        var pRaw = text.match(/\b\d{10}\b/);
        if(pLabel && pLabel.match && pLabel.match[1]) out.pnr = pLabel.match[1];
        else if(pRaw && pRaw[0]) out.pnr = pRaw[0];

        // Train No / Name: look for explicit trainNo/name with pattern like 12297/PUNE DURONTO
        var trainMatch = text.match(/(\b\d{4,5})\s*\/\s*([A-Z0-9\-\s]{3,60})/i);
        if(trainMatch){ out.train = (trainMatch[1] + '/' + trainMatch[2].trim()).trim(); }
        else {
          var tln = findLabel(/Train\s*(No\.?|No\.?\/)?.*?:?\s*(\d+)(?:\s*[\/:]\s*([A-Za-z0-9\-\s]+))?/i) || findLabel(/Train\s*No\.?\/?Name\s*[:\-]?\s*(.+)/i);
          if(tln && tln.match){
            if(tln.match[2]) out.train = (tln.match[2] + (tln.match[3]?('/'+tln.match[3].trim()):'')).trim();
            else out.train = (tln.match[1]||tln.match[0]).trim();
          }
        }

        // From / To / Boarding / Reservation UpTo
        var from = findLabel(/(From|Boarding\s*At|Boarding\s*Point)\s*[:\-]?\s*([A-Za-z\s\-]+)$/i) || findLabel(/Boarding\s*Point\s*[:\-]?\s*(.+)/i);
        var to = findLabel(/(To|Reservation\s*Upto|Reservation\s*Upto\s*:)\s*[:\-]?\s*([A-Za-z\s\-]+)$/i) || findLabel(/Reservation\s*Upto\s*[:\-]?\s*(.+)/i);
        if(from && from.match) out.from = (from.match[2] || from.match[1] || from.line).trim();
        if(to && to.match) out.to = (to.match[2] || to.match[1] || to.line).trim();

        // Class
        var cl = findLabel(/Class\s*[:\-]?\s*([^\n\r]+)/i) || findLabel(/Quota\/Class\s*[:\-]?\s*([^\n\r]+)/i);
        if(cl && cl.match){
          // extracted segment may contain stray numbers (PNR) due to PDF text ordering; pick the token that looks like class
          var seg = cl.match[1].trim();
          var classMatch = seg.match(/(FIRST AC|SECOND AC|THIRD AC|SLEEPER|SECOND AC \([^\)]+\)|THIRD AC \([^\)]+\)|\b1A\b|\b2A\b|\b3A\b|\bSL\b|\bCC\b)/i);
          if(classMatch) out.class = classMatch[1].trim();
          else {
            // fallback: pick first token that's not a long number (>=6 digits)
            var toks = seg.split(/\s+/).filter(Boolean);
            for(var ti=0;ti<toks.length;ti++){ if(!/^\d{6,}$/.test(toks[ti])){ out.class = toks[ti]; break; } }
          }
        }

        // Departure / Date of Journey / Time — try labels then fallback for common date formats
        var dep = findLabel(/(Departure|Date\s*of\s*Journey)\s*[:\-]?\s*(.+)/i);
        if(dep && dep.match) {
          // prefer explicit time+date patterns
          var dseg = dep.match[2].trim();
          var dtm = dseg.match(/(\d{1,2}:\d{2})\s*(\d{1,2}[-\/]?[A-Za-z]{3,}[-\/]?\d{2,4})/);
          if(dtm) out.departure = dtm[1] + ' ' + dtm[2]; else out.departure = dseg;
        } else {
          var d2 = text.match(/(\d{1,2}:\d{2})\s*(\d{1,2}[-\/]?[A-Za-z]{3,}[-\/]?\d{2,4})/);
          if(d2) out.departure = d2[1] + ' ' + d2[2];
        }

        // First attempt: parse the block after the "Passenger Details" header if present
        var passHeaderIdx = -1;
        for(var ii=0; ii<lines.length; ii++){ if(/Passenger\s*Details/i.test(lines[ii])){ passHeaderIdx = ii+1; break; } }
        if(passHeaderIdx>=0){
          var passBlock = lines.slice(passHeaderIdx, passHeaderIdx+12).join(' ');
          var re = /(\d{1,2})\.\s*([A-Z\.\'\-\s]+?)\s+(\d{1,3})\s+([MF])\s+([A-Z0-9\/_\-\s]+)/gi;
          var mm;
          while((mm = re.exec(passBlock)) !== null){
            var seq = mm[1]; var name = mm[2].trim(); var age = mm[3]; var gender = mm[4]; var statusTok = (mm[5]||'').trim();
            var status = (statusTok.match(/(CNF|CONFIRMED|WL|RAC|CANCL|CAN|CANX)/i)||[])[1] || statusTok.split(/\s+/)[0] || '';
            out.passengers.push({ seq: seq, name: name, age: age, status: (status||'') });
          }
        }

        // Fallback: scan numbered lines anywhere and extract status-like tokens
        if(out.passengers.length===0){
          for(var i=0;i<lines.length;i++){
            var ln = lines[i];
            var pm = ln.match(/^\s*(\d{1,2})[\).\-\s]+(.+)/);
            if(pm){
              var rest = pm[2];
              var statusMatch = rest.match(/(CNF|CONFIRMED|WL|RAC|CANCL|CAN|CANX|CNF\/[A-Z0-9\-\/]+)/i);
              if(statusMatch){
                var status = statusMatch[1];
                var name = rest.split(/\s+(?:\d{1,3}y|\d{1,3}\s*Y|\d{1,3})?\s*/i)[0];
                name = name.replace(/\s{2,}/g,' ').replace(/[^A-Za-z\s\.\'\-]/g,'').trim();
                var ageMatch = rest.match(/(\d{1,3})\s*y/i) || rest.match(/\b(\d{1,3})\b/);
                var age = ageMatch?ageMatch[1]:'';
                out.passengers.push({ seq: pm[1], name: name || rest, age: age, status: status.toUpperCase() });
              }
            }
          }
        }

        // Fallback: if no passengers found, try table-like rows
        if(out.passengers.length===0){
          // find start of passenger block by header
          var start = -1;
          for(var k=0;k<lines.length;k++){
            if(/Seq\b.*Name\b.*Status\b/i.test(lines[k])){ start = k+1; break; }
          }
          if(start>=0){
            for(var j=start;j<lines.length;j++){
              var ln2 = lines[j];
              if(/Total|Fare|GST|Amount/i.test(ln2)) break;
              var parts = ln2.split(/\s{2,}/);
              if(parts.length>=3){
                var seq = (parts[0]||'').replace(/[^0-9]/g,'');
                var name = parts[1]||'';
                var status = (parts.slice(-1)[0]||'').match(/(CNF|WL|RAC|CAN|CANCL|CANX)/i);
                status = status?status[1].toUpperCase():'';
                out.passengers.push({ seq: seq, name: name, age: '', status: status });
              }
            }
          }
        }

        // derive overall status from first passenger if not explicitly set
        if(out.passengers && out.passengers.length>0){ out.status = out.passengers[0].status || ''; }

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
                return tc.items.map(function(i){ return i.str; }).join(' ');
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
      log('Processing '+f.name);
      extractTextFromPdf(f, function(err, text){
        if(err){ log('Failed to parse '+f.name+': '+err.message,'err'); return; }
        var tp = new TicketParser();
        var parsed = tp.parseText(text, { fileName: f.name, size: f.size, uploadedAt: new Date().toISOString() });
        parsed._id = parsed.pnr || ('tmp-'+Math.random().toString(36).slice(2,9));
        // keep short base64 in localStorage only if small (<100KB); else skip
        if(f.size < 100*1024){
          var r = new FileReader(); r.onload = function(){ try{ parsed._pdfBase64 = r.result.split(',')[1]; saveTicket(parsed); }catch(e){ saveTicket(parsed); } }; r.readAsDataURL(f);
        } else {
          saveTicket(parsed);
        }
        // create session blob for viewing
        try{ var url = URL.createObjectURL(f); sessionBlobs[parsed._id] = url; } catch(e){}
        renderGrid();
        log('Parsed: '+(parsed.pnr||parsed._id),'ok');
      });
    });
  }

  function saveTicket(parsed){
    // dedupe by _id
    var idx = tickets.findIndex(function(t){ return t._id === parsed._id; });
    if(idx>=0) tickets[idx] = parsed; else tickets.push(parsed);
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets)); } catch(e){ log('Save failed: '+e.message,'err'); }
  }

  /** Grid rendering */
  var defaultColumns = [
    { key: 'departure', label: 'Date / Time', sortable:true },
    { key: 'from', label: 'From → To', sortable:false },
    { key: 'train', label: 'Train', sortable:false },
    { key: 'class', label: 'Class', sortable:false },
    { key: 'pnr', label: 'PNR', sortable:true },
    { key: 'status', label: 'Status', sortable:false },
    { key: 'actions', label: 'Actions', sortable:false }
  ];
  var visibleCols = defaultColumns.map(function(c){ return c.key; });

  function renderGrid(){
    // head
    gridHead.innerHTML = '';
    defaultColumns.forEach(function(col){
      if(visibleCols.indexOf(col.key)===-1) return;
      var th = document.createElement('th'); th.textContent = col.label; if(col.sortable) th.className='sortable';
      gridHead.appendChild(th);
    });
    // body
    gridBody.innerHTML = '';
    var filtered = tickets.slice();
    var q = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';
    if(q){ filtered = filtered.filter(function(t){ return (t.pnr||'').toLowerCase().indexOf(q)!==-1 || (t.passengers||[]).some(function(p){ return (p.name||'').toLowerCase().indexOf(q)!==-1; }) || (t.from||'').toLowerCase().indexOf(q)!==-1 || (t.to||'').toLowerCase().indexOf(q)!==-1; }); }

    if(filtered.length===0){ gridEmpty.style.display='block'; } else { gridEmpty.style.display='none'; }

    filtered.forEach(function(t){
      var tr = document.createElement('tr');
      // departure
      if(visibleCols.indexOf('departure')!==-1){
        var td = document.createElement('td'); td.innerHTML = '<div class="cell-date__date">'+(t.departure||'—')+'</div>'+(t.departure?'<div class="cell-date__time">&nbsp;</div>':''); tr.appendChild(td);
      }
      // route
      if(visibleCols.indexOf('from')!==-1){ var td2 = document.createElement('td'); td2.innerHTML = '<span class="cell-route__code">'+(t.from||'—')+'</span><span class="cell-route__arrow"> → </span><span class="cell-route__code">'+(t.to||'—')+'</span><span class="cell-route__name">'+((t.train && t.train.split('/')[1])?(' '+t.train.split('/')[1].trim()):'')+'</span>'; tr.appendChild(td2); }
      // train
      if(visibleCols.indexOf('train')!==-1){ var td3 = document.createElement('td'); td3.innerHTML = '<span class="cell-train__no">'+(t.train||'—')+'</span>'; tr.appendChild(td3); }
      // class
      if(visibleCols.indexOf('class')!==-1){ var td4 = document.createElement('td'); td4.className='cell-class'; td4.textContent = (t.class||'—'); tr.appendChild(td4); }
      // pnr
      if(visibleCols.indexOf('pnr')!==-1){ var td5 = document.createElement('td'); td5.className='cell-pnr'; td5.textContent = (t.pnr||'—'); tr.appendChild(td5); }
      // status (derive from first passenger if exists)
      if(visibleCols.indexOf('status')!==-1){ var td6 = document.createElement('td'); var st = (t.passengers && t.passengers[0] && t.passengers[0].status) ? t.passengers[0].status.toUpperCase() : 'UNKNOWN'; var cls='status--unknown'; if(/CNF/i.test(st)) cls='status--cnf'; else if(/WL/i.test(st)) cls='status--wl'; else if(/RAC/i.test(st)) cls='status--rac'; else if(/CAN/i.test(st)) cls='status--can'; td6.innerHTML = '<span class="status-badge '+cls+'">'+st+'</span>'; tr.appendChild(td6); }
      // actions
      if(visibleCols.indexOf('actions')!==-1){ var td7 = document.createElement('td'); td7.className='cell-actions'; var vbtn = document.createElement('button'); vbtn.className='btn btn--outline'; vbtn.textContent='View PDF'; vbtn.addEventListener('click', function(){ viewPdf(t._id); }); var del = document.createElement('button'); del.className='btn btn--danger-outline'; del.textContent='Delete'; del.addEventListener('click', function(){ deleteTicket(t._id); }); td7.appendChild(vbtn); td7.appendChild(del); tr.appendChild(td7); }

      gridBody.appendChild(tr);
    });

    ticketCount.textContent = tickets.length + ' tickets';
  }

  function viewPdf(id){
    var url = sessionBlobs[id];
    if(url){ window.open(url, '_blank'); return; }
    var t = tickets.find(function(x){ return x._id===id; });
    if(t && t._pdfBase64){ window.open('data:application/pdf;base64,'+t._pdfBase64, '_blank'); return; }
    alert('PDF not available in this session. Re-upload the original file to view.');
  }

  function deleteTicket(id){
    if(!confirm('Delete ticket?')) return;
    tickets = tickets.filter(function(x){ return x._id !== id; });
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets)); } catch(e){}
    try{ if(sessionBlobs[id]){ URL.revokeObjectURL(sessionBlobs[id]); delete sessionBlobs[id]; } } catch(e){}
    renderGrid();
  }

  function resetAll(){ if(!confirm('Clear all tickets?')) return; tickets = []; try{ localStorage.removeItem(STORAGE_KEY);}catch(e){} renderGrid(); }

  // wire upload/drop
  if(uploadZone){
    uploadZone.addEventListener('click', function(){ fileInput.click(); });
    uploadZone.addEventListener('dragover', function(e){ e.preventDefault(); uploadZone.classList.add('upload-zone--dragover'); });
    uploadZone.addEventListener('dragleave', function(e){ uploadZone.classList.remove('upload-zone--dragover'); });
    uploadZone.addEventListener('drop', function(e){ e.preventDefault(); uploadZone.classList.remove('upload-zone--dragover'); handleFiles(e.dataTransfer.files); });
  }
  if(fileInput){ fileInput.addEventListener('change', function(e){ handleFiles(e.target.files); fileInput.value=''; }); }

  if(searchInput){ searchInput.addEventListener('input', function(){ renderGrid(); }); }
  if(btnReset){ btnReset.addEventListener('click', resetAll); }
  if(btnBack){ btnBack.addEventListener('click', function(){ window.location.href='../index.html'; }); }
  if(btnDelete){ btnDelete.addEventListener('click', function(){ try{ localStorage.removeItem('ankura_instanceId'); }catch(e){} try{ window.close(); }catch(e){ window.location.href='../index.html'; } }); }

  // init
  try{ renderGrid(); } catch(e){ console.warn('renderGrid failed', e); }

  // expose for debugging
  window.GATI_DEBUG = { tickets: tickets, sessionBlobs: sessionBlobs };

})();

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

  // Ensure pdfjs is available
  var pdfjsAvailable = typeof window.pdfjsLib !== 'undefined';
  if (pdfjsAvailable) {
    try { pdfjsLib.GlobalWorkerOptions.workerSrc = '../assets/libs/pdfjs/pdf.worker.min.js'; } catch(e){}
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
      // PNR
      var m = text.match(/\b\d{10}\b/);
      if(m) out.pnr = m[0];

      // Train No/Name
      var mt = text.match(/Train No\.?\/Name\s+([\d]+\s*\/\s*[A-Z\s\-]+)/i);
      if(mt) out.train = mt[1].trim();

      // Departure (sample pattern)
      var md = text.match(/Departure\*\s+(\d{2}:\d{2}\s+\d{2}-[A-Za-z]{3}-\d{4})/);
      if(md) out.departure = md[1];

      // Boarding At / To
      var mb = text.match(/Boarding At\s*:\s*([A-Z\s\-]+)/i);
      if(mb) out.from = mb[1].trim();
      var mt2 = text.match(/To\s*:\s*([A-Z\s\-]+)/i);
      if(mt2) out.to = mt2[1].trim();

      // Class
      var mc = text.match(/Class\s*:\s*([A-Z0-9]+)/i);
      if(mc) out.class = mc[1].trim();

      // Passenger table rows: naive approach — look for lines containing Seq and Status-like tokens
      var lines = text.split(/\r?\n/).map(function(s){ return s.trim(); }).filter(Boolean);
      // find start of passenger block by header
      var start = -1;
      for(var i=0;i<lines.length;i++){
        if(/Seq\b.*Name\b.*Status\b/i.test(lines[i])){ start = i+1; break; }
      }
      if(start>=0){
        for(var j=start;j<lines.length;j++){
          var ln = lines[j];
          // stop when line looks like end of table
          if(/Total|Fare|GST|Amount/i.test(ln)) break;
          // expect: Seq Name Age Gender Status  (split by multiple spaces)
          var parts = ln.split(/\s{2,}/);
          if(parts.length>=4){
            var seq = parts[0].replace(/[^0-9]/g,'');
            var name = parts[1];
            var rest = parts.slice(2).join(' ');
            var age = (rest.match(/(\d{1,2})y/i)||[])[1] || '';
            var status = (rest.match(/(CNF|WL|RAC|CAN|CANCL|CANX)/i)||[])[1] || rest.split(/\s+/).pop();
            out.passengers.push({ seq: seq, name: name, age: age, status: (status||'') });
          }
        }
      }

    } catch (e){ log('Parser error: '+e.message,'err'); }
    // attach metadata
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

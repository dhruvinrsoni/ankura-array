# PDF.js — Local Copy for Gati-Grid

Gati-Grid requires **Mozilla PDF.js** for offline IRCTC ticket parsing.

## Setup (one-time)

1. Visit the [PDF.js releases page](https://github.com/nicktomlin/pdfjs-dist/releases) or
   the [official CDN](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/).

2. Download **v3.11.174** (or higher 3.x):
   - `pdf.min.js`
   - `pdf.worker.min.js`

3. Place both files in **this folder** (`assets/libs/pdfjs/`).

### Quick CDN download (bash / PowerShell)

```bash
# bash
curl -L -o pdf.min.js     "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
curl -L -o pdf.worker.min.js "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
```

```powershell
# PowerShell
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js" -OutFile pdf.min.js
Invoke-WebRequest -Uri "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js" -OutFile pdf.worker.min.js
```

## Verification

After placing the files, the folder should contain:

```
assets/libs/pdfjs/
  ├── README.md          ← this file
  ├── pdf.min.js         ← ~800 KB
  └── pdf.worker.min.js  ← ~600 KB
```

Open `gati-grid/index.html` — if PDF.js loaded correctly, the upload
zone will be active. If not, a yellow banner will appear with instructions.

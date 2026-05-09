# Cloudflare Worker Proxy — 5-min setup for live BMS data

## Why this is needed

BookMyShow is behind Cloudflare's WAF, which blocks requests from public CORS
proxy services (corsproxy.io, allorigins, codetabs, cors-anywhere — all
return 403/Cloudflare challenge or "blocked through send" errors).

A Cloudflare Worker is the realistic path because:
- Cloudflare-to-Cloudflare traffic isn't typically blocked the same way
  anonymous proxies are.
- It's free up to 100,000 requests/day (you'll use ~50/day).
- You control it — you can add the right headers, tweak rate limits, and
  it'll outlive any third-party proxy's anti-abuse measures.
- Setup is genuinely 5 minutes if you already have a Cloudflare account.

## Step-by-step deploy (no CLI needed)

1. Sign in at <https://dash.cloudflare.com/> (free account is fine).
2. Left sidebar → **Workers & Pages** → **Create application** → **Create Worker**.
3. Give it a name like `mancha-bms-proxy`. Click **Deploy** to create the default
   "Hello World" worker.
4. Click **Edit code** on the deployed worker. Delete everything in the editor
   and paste the script below. Click **Save and deploy**.
5. Copy your worker URL (looks like `https://mancha-bms-proxy.<your-subdomain>.workers.dev`).
   In Mancha-Matrix → **⚙ Settings** → **Proxy URL**, paste:
   ```
   https://mancha-bms-proxy.<your-subdomain>.workers.dev/?url={url}
   ```
   Click **Save**, then change **Data source** to **Live (BMS via your Worker proxy)**.
6. Click **↻ Refresh** in the top strip. Real shows should populate.

## Worker script (copy-paste this exactly)

```js
// mancha-bms-proxy — BookMyShow CORS proxy for Mancha-Matrix
// Deploy at https://dash.cloudflare.com/ → Workers & Pages → Create Worker

const ALLOWED_HOSTS = ['in.bookmyshow.com'];

// Optional: lock down which origins can use your proxy. Replace with your
// GitHub Pages origin once you know it; '*' opens it to anyone.
const ALLOWED_ORIGIN = '*';

const BMS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://in.bookmyshow.com/',
  'Origin':  'https://in.bookmyshow.com',
  'x-app-code': 'WEB',
  'x-platform': 'AndroidApp',
  'x-platform-code': 'WEB',
  'x-bms-id':   '1.21345445.1700000000000.4567.890',
  'x-region-code': 'PUNE',
  'x-region-slug': 'pune'
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age':       '86400'
  };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('url');
    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders() });
    }
    let parsed;
    try { parsed = new URL(target); }
    catch { return new Response('Invalid url', { status: 400, headers: corsHeaders() }); }
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      return new Response('Host not allowed', { status: 403, headers: corsHeaders() });
    }

    const upstream = await fetch(parsed.toString(), {
      method:  'GET',
      headers: BMS_HEADERS,
      cf: { cacheTtl: 60, cacheEverything: false }
    });

    const body = await upstream.text();
    const out  = new Response(body, {
      status:  upstream.status,
      headers: {
        ...corsHeaders(),
        'Content-Type':       upstream.headers.get('Content-Type') || 'application/json',
        'X-Upstream-Status':  String(upstream.status)
      }
    });
    return out;
  }
};
```

## How Mancha-Matrix uses it

`fetchBmsShowtimes()` in [`app.js`](app.js) builds a BMS URL like:

```
https://in.bookmyshow.com/pwa/api/de/showtimes?regionCode=PUNE&eventType=MT&venueCode={venueCode}&dateCode={YYYYMMDD}
```

Then wraps it with your proxy template by substituting `{url}`:

```
https://mancha-bms-proxy.<your-subdomain>.workers.dev/?url=https%3A%2F%2Fin.bookmyshow.com%2Fpwa%2Fapi%2Fde%2Fshowtimes%3FregionCode%3DPUNE%26...
```

The Worker receives that request, validates the upstream host, fetches BMS
with the right headers, and returns the JSON body with CORS allowed.

## Pinning real venue codes

The five Pune defaults shipped with the app use placeholder `bmsCode` values
(`CPSM`, `MXAM`, etc.). To wire to real data, replace them with the actual
BMS venue code, which you can read from the BMS URL:

1. Open <https://in.bookmyshow.com/cinemas-list/movies-pune> in a browser.
2. Click your theater. Look at the URL: `…/cinema/<NAME>/<VENUE-CODE>/...`.
3. The `<VENUE-CODE>` is what goes into `bmsCode`.

Edit them via **📍 Theaters** → remove + re-add with manual JSON:

```json
{"name":"Cinepolis Seasons Mall","bmsCode":"CPNE","area":"Magarpatta","city":"Pune","regionCode":"PUNE"}
```

(Real venue codes I have not yet captured — the placeholder ones won't return
anything from BMS even with a working proxy.)

## Troubleshooting

| Symptom | Fix |
|---|---|
| Proxy returns 403 with "Host not allowed" | Add the hostname to `ALLOWED_HOSTS` in the worker. |
| Proxy returns 502/504 | Cloudflare hit a transient issue. Refresh in a minute. |
| BMS via proxy returns 403 (HTML) | Worker IP is now blocked. Either redeploy worker (new IP) or wait. |
| BMS returns 400 "blocked through send" | Need to add an updated `x-bms-id` header. Get it from your real browser's DevTools → Network → any BMS XHR → Request Headers. |
| BMS returns "Platform cannot be null" | Add or update the `x-platform`/`x-app-code` headers in the worker. |
| Empty matrix after refresh | Real venue codes haven't been pinned yet — see "Pinning real venue codes" above. |

## Privacy / cost

- The Worker only proxies requests to `in.bookmyshow.com`. No other hosts are
  reachable through it.
- Free tier: 100,000 requests/day. Mancha-Matrix at 5 theaters × 2 dates with
  10-min cache uses ~60 requests/hour at most → ~1,500/day worst case.
- Set `ALLOWED_ORIGIN` to your GitHub Pages origin (e.g.
  `https://dhruvinrsoni.github.io`) once you've deployed, so others can't
  use your worker as their personal proxy.

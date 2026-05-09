# BMS Endpoint Recon — Findings & Contract

This is the recorded outcome of probing BookMyShow's internal endpoints from
multiple network paths. **TL;DR: BMS is Cloudflare-protected and public CORS
proxies don't work — you need a self-hosted Worker. See [`WORKER_PROXY.md`](WORKER_PROXY.md).**

## Recon results

| Path | What I tried | Result |
|---|---|---|
| Direct `curl` from cloud env | `https://in.bookmyshow.com/api/explore/de/regions` with realistic browser UA | ✅ 200, returns full city list including Pune (`regionCode: "PUNE"`). |
| Direct `curl` | `/pwa/api/de/venues?regionCode=PUNE&eventType=MT` | ❌ 400, "blocked through send" — application-level block based on missing fingerprint. |
| Direct `curl` | `/api/v3/mobile/showtimes/byvenue` | ❌ 403, Cloudflare WAF challenge page. |
| Direct `curl` | `/api/explore/v1/discover/showtimes` | ❌ 403, Cloudflare. |
| `corsproxy.io/?{url}` | regions endpoint | ❌ 403, served Zscaler block page (proxy IP is filtered). |
| `api.allorigins.win/get?url=` | regions endpoint | ❌ 522, allorigins server can't reach BMS. |
| `proxy.cors.sh/<url>` | regions endpoint | ❌ 429, anonymous rate-limited. |
| `api.codetabs.com/v1/proxy/?quest=` | regions endpoint | ❌ 200 but body is Cloudflare HTML challenge. |
| `cors-anywhere.herokuapp.com/<url>` | regions endpoint | ❌ 403, demo locked behind opt-in. |

**Conclusion:** No public CORS proxy reaches BMS reliably. The only working
path is a Worker you deploy yourself.

## Endpoint contract (what the parser targets)

`fetchBmsShowtimes()` in [`app.js`](app.js) calls:

```
https://in.bookmyshow.com/pwa/api/de/showtimes
  ?regionCode={REGION}
  &eventType=MT
  &venueCode={BMS_VENUE_CODE}
  &dateCode={YYYYMMDD}
```

The parser is forgiving — it handles two shape variants:

```jsonc
// Variant A (PWA shape)
{
  "ShowDetails": [{
    "Event": [{
      "EventCode": "ET00xxxxxx",
      "EventTitle": "Dune: Part Two",
      "Language": "English",
      "Dimension": "3D",
      "EventGenre": "IMAX",
      "Length": "166 min",
      "ChildEvents": [
        { "SessionId": "...", "ShowTime": "19:30", "Availability": "Filling fast" }
      ]
    }]
  }]
}

// Variant B (newer explore shape)
{
  "events": [{
    "eventCode": "...",
    "eventTitle": "...",
    "language": "Hindi",
    "dimension": "2D",
    "experience": "Dolby Cinema",
    "runtime": 145,
    "sessions": [
      { "sessionId": "...", "showTime": "10:30 AM", "priceCategory": [{ "price": 240 }] }
    ]
  }]
}
```

If BMS returns a different envelope, override `parseBmsShowtimes()` in
[`app.js`](app.js) with one that matches what your worker proxies back.

## Field mapping → NormalizedShow

| Field | Source path | Notes |
|---|---|---|
| `movieId` | `eventCode` / `EventCode` | Used as cluster grouping key. |
| `movieTitle` | `eventTitle` / `EventTitle` | |
| `language` | `language` / `Language` | Mapped: "Hindi" → "HI", "English" → "EN" via `normalizeLang()`. |
| `dimension` | `dimension` / `Dimension` / `format` | Mapped to one of `2D / 3D / 4DX / ScreenX`. |
| `premiumTech` | `eventGenre` / `experience` / `audi` | Mapped to `IMAX / Dolby Cinema / ICE / PXL / Director's Cut` or `null`. |
| `runtimeMin` | `runtime` / `Length` / `runtimeInMinutes` | Stripped to integer. |
| `startISO` | `showTime` / `ShowTime` + `dateCode` | Combined via `combineDateTime()`. |
| `endISO` | `startISO + runtimeMin` | Computed locally. |
| `bookingUrl` | `eventCode` + `sessionId` | Built by `buildBookingUrl()`. |
| `priceRange` | `priceCategory[].price` | Min–max formatted as `₹nnn–₹mmm`. |
| `seatsLabel` | `availability` / `Availability` | Mapped to `Sold out / Filling fast / Few left / Available`. |

## Real venue codes

Placeholders shipped in `PUNE_DEFAULT_THEATERS` (`CPSM`, `MXAM`, etc.) are
made-up. To get the real venue code:

1. Open <https://in.bookmyshow.com/cinemas-list/movies-pune>.
2. Click a cinema.
3. The URL contains the code. Pattern varies, common forms:
   - `…/cinema/cinepolis-seasons-mall/CPNE/...`
   - `…/buytickets/…/movie-pune-CPNE-MT/…`

Update via the Theaters tab (remove + re-add with the correct `bmsCode` in
the manual JSON).

## What I did NOT capture (and why it doesn't block real-data use)

- The exact PWA showtimes path. The parser uses the most-documented URL form
  but Worker users may need to log a network request from a real BMS browser
  session and update the URL template in `fetchBmsShowtimes()`.
- The cinema-search endpoint (for the Theaters search wizard). The wizard
  shows a "manual JSON" fallback message until that's wired in. Manual JSON
  is fine for 5 fixed theaters.

## Open risks

- **BMS may rotate API paths.** If the parser stops returning data, log a real
  network call from a browser, replace the URL in `fetchBmsShowtimes()`.
- **Worker IPs may eventually get blocked.** If your Worker starts returning
  Cloudflare 403 HTML, redeploy the Worker (gets a fresh IP) or rotate to a
  different free tier provider (Vercel Edge, Deno Deploy).
- **Header fingerprint requirements may change.** If BMS responds with
  "Platform cannot be null" or similar, paste the latest `x-bms-id` /
  `x-app-code` from your real browser's DevTools into the Worker headers.

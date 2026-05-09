# BMS Endpoint Contract — Mancha-Matrix Spike

This file is the contract between the BookMyShow site's internal endpoints and
`mancha-matrix/app.js`. Until each section here is filled in, the **Live (BMS)**
data source in Settings will throw and Mock mode is the working configuration.

## How to fill this in

1. Open BookMyShow in Chrome/Edge for one of your pinned theaters
   (e.g. Cinepolis Seasons Mall, Pune).
2. Open DevTools → Network → filter `XHR/Fetch`.
3. Navigate to that theater's showtimes page for **today**.
4. Find the request that returns showtime JSON. Common candidates:
   - `https://in.bookmyshow.com/serv/getData?cmd=GETSHOWTIMESBYEVENTANDVENUE&...`
   - `https://in.bookmyshow.com/api/explore/v1/...`
   - GraphQL POST to `/api/graphql`
5. Right-click → Copy → Copy as cURL. Paste relevant pieces below.

---

## 1. Showtimes by venue + date

**Status:** ❌ not yet captured

### URL pattern

```
TODO — paste full URL with placeholders, e.g.
https://in.bookmyshow.com/serv/getData?cmd=GETSHOWTIMESBYEVENTANDVENUE&vc={venueCode}&dt={YYYYMMDD}&...
```

### Required query/path params

| Param | Source | Notes |
|---|---|---|
| `vc` (venue code) | `theater.bmsCode` in our state | TODO confirm name |
| `dt` (date) | `YYYYMMDD` ? `YYYY-MM-DD` ? | TODO confirm format |
| `regionCode` | hardcoded "PUNE" ? | TODO check if needed |

### Required headers

```
TODO — list any non-default headers (User-Agent, x-platform, etc.)
```

### Response shape (paste sanitized JSON)

```json
TODO
```

### Field mapping → NormalizedShow

| NormalizedShow field | BMS path |
|---|---|
| `showId` | TODO |
| `movieId` | TODO |
| `movieTitle` | TODO |
| `language` | TODO (map BMS code to ISO-ish: "Hindi" → "HI", etc.) |
| `dimension` | TODO (e.g. "2D" / "3D" / "4DX" / "ScreenX") |
| `premiumTech` | TODO (audi format / experience: "IMAX" / "Dolby Cinema" / null) |
| `runtimeMin` | TODO |
| `startISO` | TODO (build from date + showtime, in local tz) |
| `endISO` | TODO (start + runtime) |
| `bookingUrl` | TODO (deep-link template, see §3) |
| `priceRange` | TODO (min–max from `priceCategory[]`?) |
| `seatsLabel` | TODO ("Filling fast" / "Available" — derive from availability flags) |

---

## 2. Cinema search by city (for the Theaters search wizard)

**Status:** ❌ not yet captured

### URL pattern

```
TODO — endpoint that returns a list of cinemas for a given city + name keyword.
```

### Required params + response shape

```json
TODO
```

---

## 3. Booking deep-link

**Status:** ❌ not yet captured

The chip click in the matrix opens this URL in a new tab.

### Pattern

```
TODO — e.g. https://in.bookmyshow.com/buytickets/{movieSlug}/movie-pune-{eventCode}-MT/{YYYYMMDD}-{showTime}
```

### Inputs needed per show

- TODO (eventCode? showId? sessionId?)

---

## 4. Wiring after the spike

Once §1-§3 are filled in, edit `app.js`:

1. Replace the body of `fetchBmsShowtimes(theater, dateStr)` with a real
   implementation following the field mapping in §1.
2. Replace the search-wizard placeholder in `bindTheatersTab()` (the part that
   currently shows "Search wizard depends on a BMS cinema-list endpoint…")
   with a real fetch using §2.
3. Use `bookingUrl` from the normalized shape exactly — `makeChip` already
   wires it to the chip's `href`.

After wiring: in **Settings**, switch the Data source to **Live (BMS via
CORS proxy)**, click **↻ Refresh**, and verify the matrix populates.

---

## 5. Risks to monitor

- **Anti-bot fingerprinting**: BMS may block fetches via CORS proxy on
  repeated traffic. If responses suddenly become HTML challenge pages,
  document the trigger pattern here and consider the paste-import escape hatch.
- **Endpoint rotation**: the path may change without notice. Re-do steps 1–5
  in "How to fill this in" when traffic stops working.
- **Rate limits**: corsproxy.io is free but rate-limited. If you see 429s,
  swap to a self-hosted proxy via Settings.

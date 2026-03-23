# Performance Dates in Panel — Design Spec
Date: 2026-03-23 | Version target: 13.3 | Status: Approved by Javier

---

## What we're building
Show upcoming performance dates for each lottery inside each show card in the bwayrush.com panel. The user sees at a glance which performances they would attend if they win, before deciding which shows to enter.

---

## Visual design

Each card gets a new row below the platform/price line:

  Aladdin
  BROADWAY DIRECT · $35
  [Wed 26 · 7pm] [Thu 27 · 7pm] [Sat 28 · 2pm] [Sat 28 · 8pm] [Sun 29 · 3pm]

- One chip per performance slot
- Format: "Day DD · H:MMpm" — e.g. "Wed 26 · 7pm", "Sat 28 · 2pm"
- Show ALL available performance chips — no limit, no truncation
- Chip style: dark background (#1a1610), gold border (rgba(201,151,58,.3)), 10px font, color #8a7a60
- If no dates available: chips row does not render (silent, no empty space)
- Chips appear progressively as data loads — panel does not wait for all shows

---

## Data object shape

Each show gets: show.dates = array of objects:
  { day: "Wed", date: 26, time: "7pm" }

- day: 3-letter abbreviation (Mon/Tue/Wed/Thu/Fri/Sat/Sun)
- date: numeric day of month (1-31)
- time: 12-hour format, no leading zero, lowercase am/pm (e.g. "7pm", "2pm", "8:30pm")
- Note: no month field — if performances span a month boundary (e.g. Mar 30 + Apr 1), "1" and "2" will display without month context. Acceptable trade-off given the short lottery windows (typically 1 week).

---

## Data sources & loading strategy

Batches of 5 parallel GM_xmlhttpRequest calls when panel opens. Dates appear progressively.

| Platform       | URL to fetch                                          | Approach             |
|----------------|-------------------------------------------------------|----------------------|
| Broadway Direct| lottery.broadwaydirect.com/enter-lottery/[slug]/      | Slug comes directly from the URL stored in show.links (same as Lucky Seat). GM_xmlhttpRequest with `anonymous: false` to include browser cookies. Broadway Direct uses Cloudflare — even with cookies, the request may return 403 or a challenge page. Silent-skip is the **expected default**; date display for Broadway Direct is a best-effort bonus, not a guarantee. |
| Telecharge     | my.socialtoaster.com/lottery_select/?key=BROADWAY     | HTML — all shows on one page, 1 request total. No auth required. |
| Lucky Seat     | www.luckyseat.com/shows/[slug]/                       | GM_xmlhttpRequest with `anonymous: false`. Slug from show.links URL. Fallback to GM cache if Angular shell returned (< 5000 chars). **First-use cold start:** if the user has never run the bot for a Lucky Seat show, cache is empty and no chips appear — this is expected behavior, not a bug. |

### Lucky Seat fallback (cache)
If pre-fetch returns response body < 5000 chars (Angular shell, no content):
- Read from GM_getValue('ls_dates_' + normalizedName, '[]')
- Cache is written by runLuckySeat() runner after each successful visit
- Cache expires after 24 hours (compare timestamp stored alongside dates)
- **Cold start:** first panel open before any Lucky Seat run will show no chips — expected, not a bug

Cache key normalization: showName.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')
Both loadShowDates and runLuckySeat must use the same normalization.

Cache structure stored in GM:
  { dates: [{day, date, time}], savedAt: Date.now() }

---

## Technical implementation

### New function: loadShowDates(shows, rerenderCard)
Parallel to existing loadShowImages(). Called after panel builds with same rerenderCard callback.

Flow:
1. Collect all lottery URLs across all shows (deduplicated)
2. Split into batches of 5
3. For each batch, wrap each GM_xmlhttpRequest in a Promise (callback-based API), fire all 5 in parallel via Promise.all
4. On each response: parse dates, assign to show.dates, call rerenderCard(show)
5. Errors (network, 403, empty parse): skip silently

### rerenderCard callback update
The rerenderCard callback passed to both loadShowImages and loadShowDates is an anonymous function in build(). It handles both image and dates updates:

  (show) => {
    // update image (existing logic)
    // update dates: find .dates-row in card, create/update chips
  }

No structural refactor needed — same pattern already used for images.

### New @connect entries in script header
  // @connect      lottery.broadwaydirect.com
  // @connect      my.socialtoaster.com
  // @connect      www.luckyseat.com

### runLuckySeat() update
After successfully selecting performances, save dates to GM cache:
  const dates = parseDatesFromDOM(); // extract from rendered Angular DOM
  const key = 'ls_dates_' + normalizeShowName(showName);
  GM_setValue(key, JSON.stringify({ dates, savedAt: Date.now() }));

---

## Error handling
- Any request error (network, 403, timeout): skip silently, no chips shown
- Response received but no dates parsed: skip silently
- Lucky Seat Angular shell detected (< 5000 chars): use cache if available and < 24h old
- All failures non-blocking — panel always functional without dates

---

## Out of scope
- Filtering shows by performance date (separate future feature)
- Showing lottery open time (data not consistently available across platforms)
- Persistent cross-session date cache for Broadway Direct and Telecharge

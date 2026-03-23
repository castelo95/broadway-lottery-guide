# Performance Dates in Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show upcoming performance date chips inside each show card in the bwayrush.com panel, fetched in background batches when the panel opens.

**Architecture:** Add `loadShowDates()` parallel to the existing `loadShowImages()`. Both share the same `rerenderCard` callback pattern already in use. Chips are injected directly into DOM without re-rendering cards.

**Tech Stack:** JavaScript (Tampermonkey), GM_xmlhttpRequest, GM_setValue/GM_getValue, Shadow DOM

**Spec:** `docs/superpowers/specs/2026-03-23-performance-dates-design.md`

---

## Files

- Modify: `broadway-lottery.user.js` (single file — all changes go here)

---

### Task 1: Discover Telecharge date selectors

Telecharge (socialtoaster.com) serves full HTML — no auth needed. Fetch it with Node.js and find where performance dates live.

**Files:** none (discovery only)

- [ ] **Step 1: Fetch Telecharge page and inspect structure**

```bash
node -e "
const https = require('https');
https.get('https://my.socialtoaster.com/lottery_select/?key=BROADWAY', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  let d = ''; res.on('data', c => d += c); res.on('end', () => {
    // Find date-like patterns near lottery_show divs
    const matches = d.match(/<div class=\"lottery_show[\s\S]{0,2000}?(?=<div class=\"lottery_show|$)/g) || [];
    if (matches[0]) console.log('FIRST CARD HTML:\n', matches[0].slice(0, 800));
  });
}).on('error', e => console.log('ERROR:', e.message));
"
```

Expected: HTML of a lottery show card including date/time text. Look for selectors containing month names, time patterns (e.g. "March", "7:00 PM", "PM"), or date-related class names.

- [ ] **Step 2: Note the selector**

Record the CSS selector for the date/time element inside `.lottery_show`. Example result might be `.lottery_show_date`, `.show-date`, or a `<p>` with specific class. Write it down — needed in Task 4.

---

### Task 2: Add @connect headers to script

**Files:** Modify `broadway-lottery.user.js` lines 17–18

- [ ] **Step 1: Add the three new @connect entries**

In `broadway-lottery.user.js`, after line 17 (`// @connect      en.wikipedia.org`), add:

```javascript
// @connect      lottery.broadwaydirect.com
// @connect      my.socialtoaster.com
// @connect      www.luckyseat.com
```

Result: header block should now have 4 @connect lines.

- [ ] **Step 2: Verify header looks correct**

```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('broadway-lottery.user.js', 'utf8');
const header = src.match(/\/\/ ==UserScript==[\s\S]+?\/\/ ==\/UserScript==/)[0];
console.log(header);
"
```

Expected: 4 `@connect` lines visible in output.

---

### Task 3: Add CSS for date chips

**Files:** Modify `broadway-lottery.user.js` — Shadow DOM style block (around line 405)

- [ ] **Step 1: Add `.dates-row` and `.chip` CSS after the `.perf` rule (line 406)**

After the line `.card.sel .perf{color:#a08840;}`, add:

```javascript
        .dates-row{display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;}
        .chip{font-size:10px;color:#8a7a60;background:#1a1610;border:1px solid rgba(201,151,58,.3);border-radius:3px;padding:1px 5px;white-space:nowrap;}
```

- [ ] **Step 2: Verify no syntax error**

```bash
node -e "require('fs').readFileSync('broadway-lottery.user.js','utf8'); console.log('OK');"
```

Expected: `OK`

---

### Task 4: Add helper functions (normalizeShowName + date parsers)

**Files:** Modify `broadway-lottery.user.js` — add before `function loadShowImages` (line 274)

- [ ] **Step 1: Add normalizeShowName helper**

Before `function loadShowImages(`, insert:

```javascript
  function normalizeShowName(name) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  }

  function formatTime(raw) {
    // raw: "7:00 PM" or "8:30 PM" → "7pm" or "8:30pm"
    const m = raw.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return raw.trim().toLowerCase();
    const h = m[1], min = m[2], ampm = m[3].toLowerCase();
    return min === '00' ? `${h}${ampm}` : `${h}:${min}${ampm}`;
  }

  function parseDayAbbr(dateStr) {
    // dateStr: "Tuesday, March 24, 2026" → { day: "Tue", date: 24 }
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    try {
      const d = new Date(dateStr);
      return { day: days[d.getDay()], date: d.getDate() };
    } catch { return null; }
  }

  function parseTelechargeDate(html) {
    // Returns array of {day, date, time} from Telecharge show card HTML
    // NOTE: Update selector below based on Task 1 findings
    const dates = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // TODO: replace '.lottery_show_date' with actual selector from Task 1
    doc.querySelectorAll('.lottery_show_date, [class*="date"], [class*="time"]').forEach(el => {
      const text = el.textContent.trim();
      const dateMatch = text.match(/[A-Z][a-z]+day,\s+[A-Z][a-z]+\s+\d+/);
      const timeMatch = text.match(/\d+:\d+\s*[AP]M/i);
      if (dateMatch && timeMatch) {
        const parsed = parseDayAbbr(dateMatch[0]);
        if (parsed) dates.push({ ...parsed, time: formatTime(timeMatch[0]) });
      }
    });
    return dates;
  }

  function parseLuckySeatDates(html) {
    // Returns array of {day, date, time} from Lucky Seat show page HTML
    const dates = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // Lucky Seat shows dates in rows: "Tuesday, March 24, 2026" with time buttons "7:00 PM"
    doc.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      const row = cb.closest('li, tr, div') || cb.parentElement;
      if (!row) return;
      const text = row.textContent || '';
      const dateMatch = text.match(/[A-Z][a-z]+day,\s+[A-Z][a-z]+\s+\d+,\s+\d{4}/);
      const timeMatches = [...text.matchAll(/\d+:\d+\s*[AP]M/gi)];
      if (dateMatch) {
        const parsed = parseDayAbbr(dateMatch[0]);
        if (!parsed) return;
        if (timeMatches.length === 0) {
          dates.push({ ...parsed, time: '' });
        } else {
          timeMatches.forEach(tm => dates.push({ ...parsed, time: formatTime(tm[0]) }));
        }
      }
    });
    return dates;
  }

  function parseBroadwayDirectDates(html) {
    // Returns array of {day, date, time} from Broadway Direct lottery page HTML
    const dates = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // Broadway Direct typically shows performance date in .lottery-date, .perf-date, or similar
    doc.querySelectorAll('[class*="date"],[class*="perf"],[class*="show-time"]').forEach(el => {
      const text = el.textContent.trim();
      const dateMatch = text.match(/[A-Z][a-z]+day,\s+[A-Z][a-z]+\s+\d+/);
      const timeMatch = text.match(/\d+:\d+\s*[AP]M/i);
      if (dateMatch) {
        const parsed = parseDayAbbr(dateMatch[0]);
        if (parsed) dates.push({ ...parsed, time: timeMatch ? formatTime(timeMatch[0]) : '' });
      }
    });
    return dates;
  }
```

- [ ] **Step 2: Verify no syntax error**

```bash
node -e "require('fs').readFileSync('broadway-lottery.user.js','utf8'); console.log('OK');"
```

Expected: `OK`

- [ ] **Step 3: Quick test of formatTime and parseDayAbbr logic**

```bash
node -e "
function formatTime(raw) {
  const m = raw.trim().match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return raw.trim().toLowerCase();
  const h = m[1], min = m[2], ampm = m[3].toLowerCase();
  return min === '00' ? h+ampm : h+':'+min+ampm;
}
function parseDayAbbr(dateStr) {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  try { const d = new Date(dateStr); return { day: days[d.getDay()], date: d.getDate() }; } catch { return null; }
}
console.log(formatTime('7:00 PM'));   // → 7pm
console.log(formatTime('8:30 PM'));   // → 8:30pm
console.log(formatTime('2:00 PM'));   // → 2pm
console.log(parseDayAbbr('Tuesday, March 24, 2026')); // → { day: 'Tue', date: 24 }
console.log(parseDayAbbr('Saturday, March 28, 2026')); // → { day: 'Sat', date: 28 }
"
```

Expected: exact values shown in comments above.

---

### Task 5: Add loadShowDates function

**Files:** Modify `broadway-lottery.user.js` — add after `loadShowImages` function (after line 310)

- [ ] **Step 1: Add the function**

After the closing `}` of `loadShowImages` (line 310), insert:

```javascript
  function loadShowDates(shows, rerenderCard) {
    // Build list of {show, url, platform} to fetch — one entry per lottery URL
    const toFetch = [];
    const tcShows = []; // Telecharge: all on one page
    shows.forEach(show => {
      show.links.forEach(link => {
        if (link.platform === 'Telecharge') {
          if (!tcShows.includes(show)) tcShows.push(show);
        } else {
          toFetch.push({ show, url: link.url, platform: link.platform });
        }
      });
    });

    // Telecharge: 1 request for all shows
    if (tcShows.length) {
      new Promise(resolve => {
        GM_xmlhttpRequest({
          method: 'GET', anonymous: false,
          url: 'https://my.socialtoaster.com/lottery_select/?key=BROADWAY',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          onload(res) { resolve(res.responseText); },
          onerror() { resolve(''); }
        });
      }).then(html => {
        if (!html || html.length < 1000) return;
        // Parse all show cards at once
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        tcShows.forEach(show => {
          const card = [...doc.querySelectorAll('div.lottery_show')].find(c =>
            (c.querySelector('.lottery_show_title')?.textContent || '').toLowerCase().includes(show.name.toLowerCase().slice(0,10))
          );
          if (!card) return;
          const dates = parseTelechargeDate(card.outerHTML);
          if (dates.length) { show.dates = dates; rerenderCard(show); }
        });
      });
    }

    // Broadway Direct + Lucky Seat: batch of 5 parallel
    function gmFetch(url) {
      return new Promise(resolve => {
        GM_xmlhttpRequest({
          method: 'GET', anonymous: false,
          url,
          headers: { 'User-Agent': 'Mozilla/5.0' },
          onload(res) { resolve(res.responseText || ''); },
          onerror() { resolve(''); },
          ontimeout() { resolve(''); }
        });
      });
    }

    async function processBatches() {
      for (let i = 0; i < toFetch.length; i += 5) {
        const batch = toFetch.slice(i, i + 5);
        const results = await Promise.all(batch.map(item => gmFetch(item.url)));
        results.forEach((html, j) => {
          const { show, platform } = batch[j];
          if (!html || html.length < 1000) {
            // Lucky Seat: try cache
            if (platform === 'Lucky Seat') {
              try {
                const cached = JSON.parse(GM_getValue('ls_dates_' + normalizeShowName(show.name), '{}'));
                if (cached.dates && cached.savedAt && (Date.now() - cached.savedAt) < 86400000) {
                  show.dates = cached.dates;
                  rerenderCard(show);
                }
              } catch {}
            }
            return;
          }
          let dates = [];
          if (platform === 'Broadway Direct') dates = parseBroadwayDirectDates(html);
          if (platform === 'Lucky Seat')      dates = parseLuckySeatDates(html);
          if (dates.length) { show.dates = dates; rerenderCard(show); }
        });
      }
    }

    processBatches();
  }
```

- [ ] **Step 2: Verify no syntax error**

```bash
node -e "require('fs').readFileSync('broadway-lottery.user.js','utf8'); console.log('OK');"
```

Expected: `OK`

---

### Task 6: Update rerenderCard callback to inject chips

**Files:** Modify `broadway-lottery.user.js` lines 616–640

- [ ] **Step 1: Add dates handling inside the loadShowImages callback**

Inside the existing callback (after the `show.perf` block, before the closing `}`), add:

```javascript
        if (show.dates && show.dates.length) {
          const card = wrap.closest('.card');
          if (!card) return;
          const info = card.querySelector('.info');
          if (!info) return;
          let row = info.querySelector('.dates-row');
          if (!row) {
            row = document.createElement('div');
            row.className = 'dates-row';
            info.appendChild(row);
          }
          row.innerHTML = show.dates.map(d =>
            `<span class="chip">${d.day} ${d.date}${d.time ? ' · ' + d.time : ''}</span>`
          ).join('');
        }
```

The full callback after the edit should look like:

```javascript
      loadShowImages(shows, (show) => {
        const wrap = shadow.querySelector(`.pw[data-show="${CSS.escape(show.name)}"]`);
        if (!wrap) return;
        if (show.img) {
          let img = wrap.querySelector('.pi');
          if (!img) {
            img = document.createElement('img');
            img.className = 'pi'; img.alt = ''; img.loading = 'lazy';
            img.onerror = () => img.style.display = 'none';
            wrap.appendChild(img);
          }
          img.src = show.img;
        }
        if (show.perf) {
          const info = wrap.closest('.card')?.querySelector('.info');
          if (info && !info.querySelector('.perf')) {
            const perfEl = document.createElement('div');
            perfEl.className = 'perf';
            perfEl.textContent = `${show.perf} performances`;
            info.querySelector('.sn').after(perfEl);
          }
        }
        if (show.dates && show.dates.length) {
          const card = wrap.closest('.card');
          if (!card) return;
          const info = card.querySelector('.info');
          if (!info) return;
          let row = info.querySelector('.dates-row');
          if (!row) { row = document.createElement('div'); row.className = 'dates-row'; info.appendChild(row); }
          row.innerHTML = show.dates.map(d =>
            `<span class="chip">${d.day} ${d.date}${d.time ? ' · ' + d.time : ''}</span>`
          ).join('');
        }
      });
```

- [ ] **Step 2: Verify no syntax error**

```bash
node -e "require('fs').readFileSync('broadway-lottery.user.js','utf8'); console.log('OK');"
```

Expected: `OK`

---

### Task 7: Call loadShowDates after panel builds

**Files:** Modify `broadway-lottery.user.js` — after `loadShowImages` call (line 616)

- [ ] **Step 1: Add loadShowDates call**

The existing code ends with:
```javascript
      loadShowImages(shows, (show) => {
        ...
      });
    }
```

After the `loadShowImages(...)` block (before the closing `}` of `build()`), add:

```javascript
      loadShowDates(shows, (show) => {
        const wrap = shadow.querySelector(`.pw[data-show="${CSS.escape(show.name)}"]`);
        if (!wrap) return;
        if (show.dates && show.dates.length) {
          const card = wrap.closest('.card');
          if (!card) return;
          const info = card.querySelector('.info');
          if (!info) return;
          let row = info.querySelector('.dates-row');
          if (!row) { row = document.createElement('div'); row.className = 'dates-row'; info.appendChild(row); }
          row.innerHTML = show.dates.map(d =>
            `<span class="chip">${d.day} ${d.date}${d.time ? ' · ' + d.time : ''}</span>`
          ).join('');
        }
      });
```

- [ ] **Step 2: Verify no syntax error**

```bash
node -e "require('fs').readFileSync('broadway-lottery.user.js','utf8'); console.log('OK');"
```

Expected: `OK`

---

### Task 8: Update runLuckySeat to save dates to cache

**Files:** Modify `broadway-lottery.user.js` — inside `runLuckySeat()`, after `done = true` (around line 806)

- [ ] **Step 1: Add cache-save call after performances are selected**

Inside `tryFill()`, after `done = true` and after `selectPerformances()` succeeds, add a call to save dates. Find the line `const result = selectPerformances();` (around line 808) and add immediately after `done = true`:

```javascript
      // Save performance dates to cache for panel use
      try {
        const dateEls = [...document.querySelectorAll('input[type="checkbox"]')].map(cb => {
          const row = cb.closest('li, tr, div') || cb.parentElement;
          const text = row?.textContent || '';
          const dateMatch = text.match(/[A-Z][a-z]+day,\s+[A-Z][a-z]+\s+\d+,\s+\d{4}/);
          const timeMatches = [...text.matchAll(/\d+:\d+\s*[AP]M/gi)];
          if (!dateMatch) return [];
          const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          const d = new Date(dateMatch[0]);
          const base = { day: days[d.getDay()], date: d.getDate() };
          if (!timeMatches.length) return [{ ...base, time: '' }];
          return timeMatches.map(tm => {
            const m = tm[0].match(/(\d+):(\d+)\s*(AM|PM)/i);
            const time = m ? (m[2]==='00' ? m[1]+m[3].toLowerCase() : m[1]+':'+m[2]+m[3].toLowerCase()) : '';
            return { ...base, time };
          });
        }).flat().filter(d => d.day);
        if (dateEls.length) {
          const showNameRaw = document.querySelector('h1, .show-title, [class*="show-name"]')?.textContent?.trim() || '';
          const key = 'ls_dates_' + showNameRaw.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
          GM_setValue(key, JSON.stringify({ dates: dateEls, savedAt: Date.now() }));
        }
      } catch {}
```

- [ ] **Step 2: Verify no syntax error**

```bash
node -e "require('fs').readFileSync('broadway-lottery.user.js','utf8'); console.log('OK');"
```

Expected: `OK`

---

### Task 9: Update card HTML template for pre-loaded dates

The `render()` function builds card HTML as a string. If `show.dates` is already populated (e.g. from cache on reload), the static HTML should also include chips.

**Files:** Modify `broadway-lottery.user.js` — card template in `render()` (around line 529–532)

- [ ] **Step 1: Add dates-row to card template**

Find this section in the card template:
```javascript
                    ${s.perf ? `<div class="perf">${s.perf} performances</div>` : ''}
                    <div class="meta">...
```

After the `perf` line, add:
```javascript
                    ${s.dates && s.dates.length ? `<div class="dates-row">${s.dates.map(d=>`<span class="chip">${d.day} ${d.date}${d.time?' · '+d.time:''}</span>`).join('')}</div>` : ''}
```

- [ ] **Step 2: Verify no syntax error**

```bash
node -e "require('fs').readFileSync('broadway-lottery.user.js','utf8'); console.log('OK');"
```

Expected: `OK`

---

### Task 10: Version bump and push to GitHub

**Files:** Modify `broadway-lottery.user.js` line 3

- [ ] **Step 1: Update version to 13.3 (verify it's not already 13.3)**

```bash
node -e "
const src = require('fs').readFileSync('broadway-lottery.user.js','utf8');
console.log(src.match(/@version\s+[\d.]+/)[0]);
"
```

If already `13.3`, skip to Step 2. Otherwise update to `13.3`.

- [ ] **Step 2: Commit**

```bash
cd "C:\Users\JavierCastelló\OneDrive - Columbia Business School\Escritorio\Proyecto Broadway\broadway-lottery-guide"
git add broadway-lottery.user.js
git commit -m "feat: show performance date chips in panel cards (v13.3)"
```

- [ ] **Step 3: Push to GitHub**

```bash
git push
```

Expected: `broadway-lottery.user.js` pushed. Tampermonkey will auto-update within 24h.

---

## Manual verification checklist

After pushing, install the updated script in Tampermonkey and verify:

- [ ] Open bwayrush.com, open the panel — no errors in browser console
- [ ] After ~5–10 seconds, some cards show date chips in format `Wed 26 · 7pm`
- [ ] Cards without dates show no empty row (silent)
- [ ] Chips wrap correctly if there are many performances
- [ ] Run the bot for a Lucky Seat show — chips appear on next panel open (cache working)

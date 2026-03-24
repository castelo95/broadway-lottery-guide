# Run Log — Design Spec
Date: 2026-03-23 | Version target: 14.9 | Status: Approved by Javier

---

## What we're building

After a run completes, show a summary in the panel on bwayrush.com: one line per show with its outcome (entered, already entered, captcha pending, no match). The log persists in GM storage so it's still visible when the user comes back to the bwayrush tab.

---

## Storage

**Key:** `ap_run_log`

**Value:** JSON object:
```json
{
  "runTime": "2026-03-23T10:43:00.000Z",
  "entries": [
    { "show": "Book of Mormon", "platform": "Lucky Seat", "status": "entered", "detail": "6 performances" },
    { "show": "Hadestown", "platform": "Lucky Seat", "status": "already_entered", "detail": "" },
    { "show": "Suffs", "platform": "Broadway Direct", "status": "entered", "detail": "" },
    { "show": "Into the Woods", "platform": "Telecharge", "status": "already_entered", "detail": "" }
  ]
}
```

**Status values:**
- `entered` — successfully submitted
- `already_entered` — all performances already entered
- `captcha_pending` — bot filled form but captcha wasn't solved in time
- `no_match` — no performances matched filter (time filter or calendar)
- `error` — unexpected failure

**Cleared:** when user clicks "Run" in the bwayrush.com panel (start of a new run).

**Known limitation:** `addRunLogEntry` does a read-modify-write on GM storage. If two tabs call it within milliseconds of each other, one entry could be silently lost. In practice tabs are opened with ~800ms stagger and each runner has additional processing delays, so entries typically arrive seconds apart. This is acceptable for a personal-use script.

---

## New storage helpers

Added near the other storage helpers (`loadBlockedDays`, `saveBlockedDays`):

```javascript
function loadRunLog() {
  try { return JSON.parse(GM_getValue('ap_run_log', 'null')) || null; } catch { return null; }
}
function saveRunLog(log) { GM_setValue('ap_run_log', JSON.stringify(log)); }
function addRunLogEntry(entry) {
  const log = loadRunLog() || { runTime: new Date().toISOString(), entries: [] };
  log.entries.push(entry);
  saveRunLog(log);
}
```

---

## Runner changes

### Lucky Seat (`runLuckySeat`)

Show name from URL hash (already used in existing code):
```javascript
const showName = decodeURIComponent(location.hash.replace(/^#/, '').split('|')[0]) || 'Lucky Seat';
```

Add `addRunLogEntry` at each outcome point inside the runner:
- `result.status === 'ok'` → `{ show: showName, platform: 'Lucky Seat', status: 'entered', detail: result.selected + ' performance' + (result.selected !== 1 ? 's' : '') }`
- `result.status === 'all_entered'` → `{ show: showName, platform: 'Lucky Seat', status: 'already_entered', detail: '' }`
- `result.status === 'no_match'` → `{ show: showName, platform: 'Lucky Seat', status: 'no_match', detail: '' }`
- Captcha timeout (20s poll) → `{ show: showName, platform: 'Lucky Seat', status: 'captcha_pending', detail: '' }`
- Captcha solved + submitted → `{ show: showName, platform: 'Lucky Seat', status: 'entered', detail: ... }`

### Broadway Direct (`runBroadwayDirectForm`)

`runBroadwayDirectForm` runs inside an iframe at `/enter-lottery/...`. The iframe and the parent page are both on `lottery.broadwaydirect.com` (same origin), so the show name can be read from the parent page's DOM:

```javascript
let showName = 'Broadway Direct';
try {
  showName = window.parent.document.querySelector('h1')?.textContent?.trim() ||
             window.parent.document.title.split(/[|\-–]/)[0].trim() ||
             'Broadway Direct';
} catch(e) {}
```

This is a single-show-per-page-load runner. One log entry per invocation:
- Form submitted → `{ show: showName, platform: 'Broadway Direct', status: 'entered', detail: '' }`
- Captcha pending at submit time → `{ show: showName, platform: 'Broadway Direct', status: 'captcha_pending', detail: '' }`

### Telecharge (`runTelecharge`)

Show name from URL hash (same pattern as Lucky Seat):
```javascript
const showName = decodeURIComponent(location.hash.replace(/^#/, '').split('|')[0]) || 'Telecharge';
```

Written after the `targetCards.forEach` loop resolves:
- `entered > 0` → `{ show: showName, platform: 'Telecharge', status: 'entered', detail: entered + ' lotter' + (entered > 1 ? 'ies' : 'y') }`
- `alreadyIn > 0 && entered === 0` → `{ show: showName, platform: 'Telecharge', status: 'already_entered', detail: '' }`

### bwayrush.com panel (`runBwayRush`)

In the "Run" button click handler, before opening tabs:
```javascript
saveRunLog({ runTime: new Date().toISOString(), entries: [] });
```

---

## Panel UI

New `<details class="log">` section added to the panel template after `<details class="cfg">`.

```html
<details class="log" id="ap-log">
  <summary>
    <div class="cfg-icon">📋</div>
    <span class="cfg-label">Last Run</span>
    <span class="log-time" id="log-time"></span>
  </summary>
  <div class="log-entries" id="log-entries"></div>
</details>
```

### CSS (added to shadow DOM styles)

```css
details.log { border-bottom: 1px solid #1a1610; flex-shrink: 0; }
details.log summary { display:flex; align-items:center; gap:8px; padding:10px 20px; cursor:pointer; list-style:none; user-select:none; }
details.log summary:hover { background: #111009; }
details.log summary::after { content:'▸'; margin-left:auto; color:#2a2018; font-size:9px; transition:transform .2s; }
details.log[open] summary::after { transform: rotate(90deg); }
.log-time { font-size:9px; color:#4a4030; letter-spacing:.5px; }
.log-entries { padding: 4px 20px 12px; display:flex; flex-direction:column; gap:4px; }
.log-entry { display:flex; align-items:center; gap:8px; font-size:11px; padding:4px 0; border-bottom:1px solid #1a1610; }
.log-entry:last-child { border-bottom:none; }
.log-icon { font-size:13px; flex-shrink:0; }
.log-show { color:#c9973a; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.log-status { font-size:10px; color:#4a4030; flex-shrink:0; }
.log-detail { font-size:10px; color:#3a3020; flex-shrink:0; }
.log-empty { font-size:11px; color:#3a3020; padding:8px 0; }
```

### `renderLog()` function

Defined inside `build()` (needs access to `shadow`):

```javascript
function renderLog() {
  const entriesEl = shadow.getElementById('log-entries');
  const timeEl = shadow.getElementById('log-time');
  if (!entriesEl) return;
  const log = loadRunLog();
  if (!log || !log.entries.length) {
    entriesEl.innerHTML = '<div class="log-empty">No runs yet.</div>';
    if (timeEl) timeEl.textContent = '';
    return;
  }
  const icons = { entered:'✅', already_entered:'⏭️', captcha_pending:'⚠️', no_match:'⏭️', error:'❌' };
  const labels = { entered:'Entered', already_entered:'Already in', captcha_pending:'Captcha', no_match:'No match', error:'Error' };
  if (timeEl) {
    const d = new Date(log.runTime);
    timeEl.textContent = 'Today ' + d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
  }
  entriesEl.innerHTML = log.entries.map(e => `
    <div class="log-entry">
      <span class="log-icon">${icons[e.status] || '•'}</span>
      <span class="log-show">${e.show}</span>
      <span class="log-status">${labels[e.status] || e.status}</span>
      ${e.detail ? `<span class="log-detail">· ${e.detail}</span>` : ''}
    </div>
  `).join('');
}
```

Called from `build()` after `render()` and `renderCalendar()`.

### Auto-refresh on tab focus

Registered **once at `runBwayRush` top level** (not inside `build()`, to avoid duplicate listeners on re-renders):

```javascript
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderLog(); });
```

Note: `renderLog` is defined inside `build()`. To call it from `visibilitychange`, expose it by assigning to a variable in the outer `runBwayRush` scope:
```javascript
let renderLog = () => {}; // placeholder
// ...inside build():
renderLog = function() { ... };
```

---

## Data flow

```
User clicks Run →
  saveRunLog({ runTime: now, entries: [] })
  → tabs open for each show

Each runner tab →
  processes show →
  addRunLogEntry({ show, platform, status, detail })

User returns to bwayrush.com tab →
  visibilitychange fires → renderLog() reads GM storage →
  panel log section shows all entries written so far
```

---

## Files to modify

**Only file:** `broadway-lottery.user.js`

1. `@version` → bump to `14.9`
2. After `saveBlockedDays` (~line 56) → add `loadRunLog`, `saveRunLog`, `addRunLogEntry`
3. Shadow DOM CSS block → add `.log*` styles
4. Panel HTML template → add `<details class="log">` after `<details class="cfg">`
5. `runBwayRush()` top level → add `let renderLog = () => {};` placeholder + `visibilitychange` listener
6. `build()` function → add `renderLog` function definition (overwrites placeholder) + `renderLog()` call
7. Run button click handler in `runBwayRush` → add `saveRunLog(...)` before opening tabs
8. `runLuckySeat()` → show name extraction + `addRunLogEntry` at each outcome
9. `runBroadwayDirectForm()` → parent DOM show name + `addRunLogEntry` at submit and captcha-pending
10. `runTelecharge()` → show name extraction + `addRunLogEntry` at outcome

---

## Out of scope

- Per-performance granularity in log entries
- Run history beyond the most recent run
- FAB badge notification

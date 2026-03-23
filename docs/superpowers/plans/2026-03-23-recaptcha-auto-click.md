# reCAPTCHA Auto-Click Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically click the reCAPTCHA v2 checkbox on Lucky Seat and Broadway Direct so the bot completes entries without manual intervention.

**Architecture:** Tampermonkey injects a new function `runRecaptchaAutoClick()` directly inside the reCAPTCHA iframe (via a new `@match` for `google.com/recaptcha/api2/anchor*`). The function decodes the `co=` URL parameter to confirm the parent page is one of our target sites, then clicks the `#recaptcha-anchor` checkbox. No changes to existing runners are needed — they already check `hasPendingCaptcha()` and proceed when it resolves.

**Tech Stack:** Tampermonkey userscript, vanilla JS, no external APIs or dependencies.

---

## File Map

| File | Change |
|---|---|
| `broadway-lottery.user.js` line 4 | Bump `@version` from `14.7` to `14.8` |
| `broadway-lottery.user.js` after line 12 | Add new `@match` for reCAPTCHA anchor iframe (becomes line 13) |
| `broadway-lottery.user.js` line ~1051 | Add `runRecaptchaAutoClick()` function (before router) |
| `broadway-lottery.user.js` line ~1060 | Add router condition for `google.com/recaptcha` URLs |

---

## Task 1: Add `@match` and bump version

**Files:**
- Modify: `broadway-lottery.user.js` lines 4 and 12

- [ ] **Step 1: Open the file and locate the header block**

  The header is at the top of the file. It currently reads:
  ```
  // @version      14.7
  ```
  and ends its `@match` list with:
  ```
  // @match        https://my.socialtoaster.com/*
  ```

- [ ] **Step 2: Bump version to 14.8**

  Change line 4 from:
  ```javascript
  // @version      14.7
  ```
  to:
  ```javascript
  // @version      14.8
  ```

- [ ] **Step 3: Add the new `@match` after the socialtoaster line**

  After `// @match        https://my.socialtoaster.com/*`, add:
  ```javascript
  // @match        https://www.google.com/recaptcha/api2/anchor*
  ```

- [ ] **Step 4: Verify the header block looks correct**

  The match section should now be:
  ```javascript
  // @match        https://bwayrush.com/*
  // @match        https://lottery.broadwaydirect.com/*
  // @match        https://www.luckyseat.com/*
  // @match        https://my.socialtoaster.com/*
  // @match        https://www.google.com/recaptcha/api2/anchor*
  ```

- [ ] **Step 5: Commit**
  ```bash
  git add broadway-lottery.user.js
  git commit -m "feat: add recaptcha anchor @match, bump to v14.8"
  ```

---

## Task 2: Add `runRecaptchaAutoClick()` function

**Files:**
- Modify: `broadway-lottery.user.js` line ~1051 (between end of `runTelecharge()` and the ROUTER comment)

- [ ] **Step 1: Locate the insertion point**

  Find this block near the end of the file (around line 1051):
  ```javascript
    }

    const obs = new MutationObserver(() => { if (!done && document.querySelector('div.lottery_show')) { obs.disconnect(); setTimeout(tryFill, 500); } });
    obs.observe(document.body, { childList: true, subtree: true });
    [800, 1500, 2500, 4000].forEach(t => setTimeout(() => { if (!done) tryFill(); }, t));
  }

  // ═══ ROUTER ══════════════════════════════════════════════════════════
  ```

  Insert the new function in the blank line between the closing `}` of `runTelecharge()` and the `// ═══ ROUTER` comment.

- [ ] **Step 2: Insert the function**

  ```javascript
  function runRecaptchaAutoClick() {
    // Decode the co= parameter to verify parent page is one of our target sites
    const co = new URLSearchParams(location.search).get('co') || '';
    let origin = '';
    try {
      const padded = co.replace(/-/g, '+').replace(/_/g, '/');
      const withPadding = padded + '='.repeat((4 - padded.length % 4) % 4);
      origin = atob(withPadding);
    } catch(e) {}
    const targets = ['luckyseat.com', 'broadwaydirect.com'];
    if (!targets.some(t => origin.includes(t))) return;

    // obs is declared after tryClick but always assigned before any setTimeout fires (300ms+).
    // tryClick is only ever called asynchronously, so obs is safe to reference here.
    function tryClick() {
      const cb = document.querySelector('#recaptcha-anchor');
      if (!cb || cb.getAttribute('aria-checked') === 'true') return;
      cb.click();
      obs.disconnect(); // safe: obs is assigned before any timer can fire
    }

    // @run-at is document-idle globally — that's fine here. The iframe needs ~300ms to render
    // its checkbox regardless, so the setTimeout floor of 300ms covers the timing gap.
    const obs = new MutationObserver(tryClick);
    obs.observe(document.body, { childList: true, subtree: true });
    [300, 600, 1000, 1500, 2000].forEach(t => setTimeout(tryClick, t));
  }
  ```

- [ ] **Step 3: Verify indentation matches the file**

  The function should be at the top level inside the IIFE (same indentation as `runBwayRush`, `runLuckySeat`, etc.). Zero indentation relative to the outer `(function() { ... })()` wrapper.

- [ ] **Step 4: Commit**
  ```bash
  git add broadway-lottery.user.js
  git commit -m "feat: add runRecaptchaAutoClick function"
  ```

---

## Task 3: Add router condition

**Files:**
- Modify: `broadway-lottery.user.js` line ~1060 (router block)

- [ ] **Step 1: Locate the router block**

  Find these lines (around 1054–1060):
  ```javascript
  const h = location.hostname;
  const p = location.pathname;
  if (h.includes('bwayrush.com'))                                              runBwayRush();
  else if (h.includes('broadwaydirect.com') && p.includes('/enter-lottery'))  runBroadwayDirectForm();
  else if (h.includes('broadwaydirect.com'))                                   runBroadwayDirect();
  else if (h.includes('luckyseat.com') && p.includes('/shows/'))              runLuckySeat();
  else if (h.includes('socialtoaster.com'))                                    runTelecharge();
  ```

- [ ] **Step 2: Add the reCAPTCHA condition as the last `else if`**

  ```javascript
  else if (h.includes('google.com') && p.includes('/recaptcha/'))             runRecaptchaAutoClick();
  ```

  The router should now read:
  ```javascript
  const h = location.hostname;
  const p = location.pathname;
  if (h.includes('bwayrush.com'))                                              runBwayRush();
  else if (h.includes('broadwaydirect.com') && p.includes('/enter-lottery'))  runBroadwayDirectForm();
  else if (h.includes('broadwaydirect.com'))                                   runBroadwayDirect();
  else if (h.includes('luckyseat.com') && p.includes('/shows/'))              runLuckySeat();
  else if (h.includes('socialtoaster.com'))                                    runTelecharge();
  else if (h.includes('google.com') && p.includes('/recaptcha/'))             runRecaptchaAutoClick();
  ```

- [ ] **Step 3: Commit**
  ```bash
  git add broadway-lottery.user.js
  git commit -m "feat: route recaptcha anchor iframe to auto-click handler"
  ```

---

## Task 4: Push to GitHub Pages

- [ ] **Step 1: Push to remote**
  ```bash
  git push
  ```

- [ ] **Step 2: Verify the version on GitHub Pages**

  Open: `https://castelo95.github.io/broadway-lottery-guide/broadway-lottery.user.js`

  Confirm the first lines show `@version 14.8` and the new `@match` for `google.com/recaptcha`.

- [ ] **Step 3: Update Tampermonkey**

  In Tampermonkey dashboard → click the script → "Check for updates" (or reinstall from the URL). Confirm version shows 14.8.

---

## Verification (requires a live lottery)

These steps can only be done when a lottery is open on Lucky Seat or Broadway Direct. Note them for when that happens.

**Lucky Seat:**
- [ ] Run the bot on a Lucky Seat lottery page
- [ ] Confirm the reCAPTCHA checkbox clicks automatically (no manual action needed)
- [ ] Confirm the bot proceeds to submit the form without waiting

**Broadway Direct:**
- [ ] Open a BD lottery page in DevTools → Elements tab → find the reCAPTCHA anchor iframe
- [ ] Copy its `src` URL, find the `co=` parameter value
- [ ] In browser console (must include the `.replace()` calls — `co=` uses URL-safe base64):
  ```javascript
  atob('CO_VALUE'.replace(/-/g,'+').replace(/_/g,'/'))
  ```
- [ ] Confirm the decoded value contains `broadwaydirect.com`
- [ ] Run the bot and confirm auto-click works end-to-end

---

## Notes

- **No changes to existing runners** — `hasPendingCaptcha()` already handles the flow correctly once `g-recaptcha-response` is populated.
- **Broadway Direct nesting risk** — the form is inside a nested iframe, so `co=` encodes the form iframe's origin (not the top-level page). Empirical verification is required before declaring BD fully working.
- **Manual mode** — the auto-click fires even in Manual mode. This is intentional: clicking the checkbox is not form submission. Manual mode only controls whether the form submits automatically.

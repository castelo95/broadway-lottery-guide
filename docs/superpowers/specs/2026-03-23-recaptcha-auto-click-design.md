# reCAPTCHA Auto-Click — Design Spec
Date: 2026-03-23 | Version target: 14.8 | Status: Approved by Javier

---

## What we're building

Automatically click the reCAPTCHA v2 checkbox on Lucky Seat and Broadway Direct lottery pages so the bot can complete entries without any manual intervention. When the checkbox passes on its own (the common case), the full run is hands-free. When a visual challenge appears (rare), the user still resolves it manually.

---

## Context

reCAPTCHA v2 renders in a cross-origin iframe (`google.com/recaptcha/api2/anchor`). The parent page script cannot access the iframe's DOM directly. However, Tampermonkey can inject a script *inside* the iframe by adding a `@match` for that URL — giving full DOM access to the checkbox element.

On both Lucky Seat and Broadway Direct, clicking the checkbox is sufficient in the vast majority of cases: Google evaluates the real browser context (cookies, history, IP) and passes without requiring a visual or audio challenge. No external API is needed.

---

## Approach

**Iframe injection via `@match`**

Add `// @match https://www.google.com/recaptcha/api2/anchor*` to the script header. Tampermonkey injects a new function `runRecaptchaAutoClick()` into that iframe context.

To avoid auto-clicking reCAPTCHAs on unrelated sites the user visits, the function reads the `co` parameter from the iframe URL. Google always includes this parameter — it is the base64-encoded origin of the parent page. The function decodes it and only proceeds if it matches `luckyseat.com` or `broadwaydirect.com`.

---

## Implementation

### Header change
```
// @match   https://www.google.com/recaptcha/api2/anchor*
```

### New function: `runRecaptchaAutoClick()`

```javascript
function runRecaptchaAutoClick() {
  // Verify parent page is one of our target sites
  const co = new URLSearchParams(location.search).get('co') || '';
  let origin = '';
  try { origin = atob(co.replace(/-/g, '+').replace(/_/g, '/')); } catch(e) {}
  const targets = ['luckyseat.com', 'broadwaydirect.com'];
  if (!targets.some(t => origin.includes(t))) return;

  function tryClick() {
    const cb = document.querySelector('#recaptcha-anchor');
    if (!cb || cb.getAttribute('aria-checked') === 'true') return;
    cb.click();
  }

  const obs = new MutationObserver(tryClick);
  obs.observe(document.body, { childList: true, subtree: true });
  [300, 600, 1000, 1500, 2000].forEach(t => setTimeout(tryClick, t));
}
```

### Router addition
```javascript
else if (h.includes('google.com') && p.includes('/recaptcha/')) runRecaptchaAutoClick();
```

---

## How it integrates with existing runners

No changes needed to `runLuckySeat()` or `runBroadwayDirectForm()`. Both already call `hasPendingCaptcha()` before auto-submitting:

- When auto-click succeeds → reCAPTCHA populates `g-recaptcha-response` textarea → `hasPendingCaptcha()` returns `false` → runner auto-submits normally
- When a visual challenge appears → `g-recaptcha-response` stays empty → `hasPendingCaptcha()` returns `true` → runner shows the existing manual indicator and waits

---

## Data flow

```
Bot opens Lucky Seat / Broadway Direct
  → reCAPTCHA anchor iframe loads (google.com/recaptcha/api2/anchor?...&co=BASE64_ORIGIN...)
  → runRecaptchaAutoClick() fires inside iframe
  → decodes co= parameter → confirms parent is luckyseat.com or broadwaydirect.com
  → finds #recaptcha-anchor → clicks it
  → Google evaluates (real browser, real cookies) → passes
  → g-recaptcha-response textarea populated in parent page
  → runner detects captcha resolved → auto-submits form
```

---

## Error handling

- `co` parameter missing or undecodable → `origin` stays `''` → targets check fails → function returns silently (safe)
- Checkbox not found within 2s → silently no-ops (page may not have captcha)
- Checkbox already checked → early return, no double-click
- Visual challenge appears despite click → existing manual indicator handles it, no regression

---

## Out of scope

- Audio challenge solving (deferred — only needed for the rare visual/audio challenge case)
- Telecharge (socialtoaster.com) — does not use reCAPTCHA
- Any other sites outside the three target platforms

---

## Files to modify

**Only file:** `broadway-lottery-guide/broadway-lottery.user.js`

1. Line ~17 — add `// @match https://www.google.com/recaptcha/api2/anchor*`
2. Lines ~668+ — add `runRecaptchaAutoClick()` function before the router
3. Lines ~1056+ (router) — add condition for google.com/recaptcha URLs

# reCAPTCHA Auto-Click — Design Spec
Date: 2026-03-23 | Version target: 14.8 | Status: Approved by Javier

---

## What we're building

Automatically click the reCAPTCHA v2 checkbox on Lucky Seat and Broadway Direct lottery pages so the bot can complete entries without any manual intervention. When the checkbox passes on its own (the common case), the full run is hands-free. When a visual challenge appears (rare), the user still resolves it manually.

---

## Context

reCAPTCHA v2 renders in a cross-origin iframe (`google.com/recaptcha/api2/anchor`). The parent page script cannot access the iframe's DOM directly. However, Tampermonkey can inject a script *inside* the iframe by adding a `@match` for that URL — giving full DOM access to the checkbox element.

On both Lucky Seat and Broadway Direct, clicking the checkbox is sufficient in the vast majority of cases: Google evaluates the real browser context (cookies, history, IP) and passes without requiring a visual challenge. No external API is needed.

**Broadway Direct nesting note:** The lottery form on Broadway Direct runs inside a nested iframe. This means the reCAPTCHA anchor iframe's direct parent is the form iframe, not the top-level page. The `co=` parameter in the reCAPTCHA URL encodes the *direct parent's* origin. Before shipping, this must be verified empirically: open a Broadway Direct lottery page in DevTools → Elements → find the reCAPTCHA anchor iframe → read its `src` URL → confirm `co=` decodes to a value containing `broadwaydirect.com`. If it doesn't match, Lucky Seat will still work; Broadway Direct auto-click will silently no-op and fall back to manual.

---

## Approach

**Iframe injection via `@match`**

Add `// @match https://www.google.com/recaptcha/api2/anchor*` to the script header. Tampermonkey injects `runRecaptchaAutoClick()` into that iframe context.

To avoid auto-clicking reCAPTCHAs on unrelated sites, the function reads the `co` parameter from the iframe URL, decodes it from base64, and only proceeds if it matches `luckyseat.com` or `broadwaydirect.com`.

**Manual mode:** Auto-clicking the checkbox is correct even in Manual mode. Resolving the captcha is not the same as submitting — Manual mode controls whether the *form* is submitted automatically. The checkbox must be clicked regardless; otherwise the form can never be submitted at all.

**Limitation:** The `@match` uses `www.google.com` explicitly. If Google serves the anchor from a different subdomain or country TLD (unlikely but possible), the injection will not fire. This is acceptable for now and can be extended if it becomes an issue.

---

## Implementation

### Header change
```
// @match   https://www.google.com/recaptcha/api2/anchor*
```

### New function: `runRecaptchaAutoClick()`

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

  function tryClick() {
    const cb = document.querySelector('#recaptcha-anchor');
    if (!cb || cb.getAttribute('aria-checked') === 'true') return;
    cb.click();
    // Disconnect observer after successful click attempt
    obs.disconnect();
  }

  const obs = new MutationObserver(tryClick);
  obs.observe(document.body, { childList: true, subtree: true });
  [300, 600, 1000, 1500, 2000].forEach(t => setTimeout(tryClick, t));
}
```

**Note on timing:** `@run-at document-idle` (the current global setting) may inject after the iframe DOM is already rendered. The staggered setTimeout array (starting at 300ms) covers this case — the iframe needs time to render its UI regardless, so 300ms is a safe floor. The MutationObserver catches cases where the checkbox appears after injection.

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
  → decodes co= with proper base64 padding → confirms parent is luckyseat.com or broadwaydirect.com
  → finds #recaptcha-anchor → clicks it → disconnects MutationObserver
  → Google evaluates (real browser, real cookies) → passes
  → g-recaptcha-response textarea populated in parent page
  → runner detects captcha resolved → auto-submits form
```

---

## Error handling

- `co` parameter missing, undecodable, or non-matching domain → function returns silently (safe, no regression)
- Checkbox not found within 2s → silently no-ops
- Checkbox already checked → early return, no double-click
- Visual challenge appears despite click → existing manual indicator handles it, no regression
- Broadway Direct `co=` mismatch (nesting issue) → Lucky Seat still works; BD falls back to manual

---

## Verification steps before shipping

1. **Lucky Seat:** Open any Lucky Seat lottery page → run bot → confirm checkbox auto-clicks and bot proceeds to submit without waiting
2. **Broadway Direct:** Open DevTools on a BD lottery page → Elements tab → find reCAPTCHA anchor iframe → read `src` URL → confirm `co=` decodes to a value containing `broadwaydirect.com` → test auto-click

---

## Out of scope

- Audio challenge solving (deferred)
- Telecharge (no reCAPTCHA)
- Alternate Google domains / country TLDs

---

## Files to modify

**Only file:** `broadway-lottery-guide/broadway-lottery.user.js`

1. Line ~17 — add `// @match https://www.google.com/recaptcha/api2/anchor*`
2. Lines ~668+ — add `runRecaptchaAutoClick()` function before the router
3. Lines ~1056+ (router) — add condition for google.com/recaptcha URLs

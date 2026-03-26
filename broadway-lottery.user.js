// ==UserScript==
// @name         Broadway Lottery 🎭
// @namespace    https://bwayrush.com/
// @version      14.15
// @description  Broadway Lottery Autopilot — Broadway Direct, Lucky Seat, Telecharge (coming soon)
// @author       Javier Castello
// @updateURL    https://castelo95.github.io/broadway-lottery-guide/broadway-lottery.user.js
// @downloadURL  https://castelo95.github.io/broadway-lottery-guide/broadway-lottery.user.js
// @match        https://bwayrush.com/*
// @match        https://lottery.broadwaydirect.com/*
// @match        https://www.luckyseat.com/*
// @match        https://my.socialtoaster.com/*
// @match        https://www.google.com/recaptcha/api2/anchor*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      en.wikipedia.org
// @connect      www.luckyseat.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  function loadUser() {
    return {
      firstName: GM_getValue('u_fn', ''),
      lastName:  GM_getValue('u_ln', ''),
      email:     GM_getValue('u_em', ''),
      zip:       GM_getValue('u_zp', ''),
      phone:     GM_getValue('u_ph', ''),
      tickets:   GM_getValue('u_tk', '2'),
      dobMM:     GM_getValue('u_dmm', ''),
      dobDD:     GM_getValue('u_ddd', ''),
      dobYYYY:   GM_getValue('u_dyy', ''),
      country:   GM_getValue('u_co', 'US'),
    };
  }
  function saveUser(d) {
    GM_setValue('u_fn', d.firstName||'');
    GM_setValue('u_ln', d.lastName||'');
    GM_setValue('u_em', d.email||'');
    GM_setValue('u_zp', d.zip||'');
    GM_setValue('u_ph', d.phone||'');
    GM_setValue('u_tk', d.tickets||'2');
    GM_setValue('u_dmm', d.dobMM||'');
    GM_setValue('u_ddd', d.dobDD||'');
    GM_setValue('u_dyy', d.dobYYYY||'');
    GM_setValue('u_co', d.country||'US');
  }
  function loadDisabled() { try { return JSON.parse(GM_getValue('ap_disabled', '[]')); } catch { return []; } }
  function saveDisabled(v) { GM_setValue('ap_disabled', JSON.stringify(v)); }
  function loadLsFilter() { return GM_getValue('ls_filter', 'all'); }
  function saveLsFilter(v) { GM_setValue('ls_filter', v); }
  function loadBlockedDays() { try { return new Set(JSON.parse(GM_getValue('ap_blocked_days','[]'))); } catch { return new Set(); } }
  function saveBlockedDays(s) { GM_setValue('ap_blocked_days', JSON.stringify([...s])); }
  function loadRunLog() { try { return JSON.parse(GM_getValue('ap_run_log','null'))||null; } catch { return null; } }
  function saveRunLog(log) { GM_setValue('ap_run_log', JSON.stringify(log)); }
  function addRunLogEntry(entry) { const log=loadRunLog()||{runTime:new Date().toISOString(),entries:[]}; log.entries.push(entry); saveRunLog(log); }
  function dateToISO(dateStr) {
    const clean = dateStr.replace(/^[A-Z][a-z]+day,?\s+/,'').replace(/,?\s*\d{4}\s*$/,'').trim();
    const d = new Date(clean + ', ' + new Date().getFullYear());
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0,10);
  }

  function setVal(el, val) {
    if (!el || !val) return false;
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
    if (s) s.call(el, val); else el.value = val;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    el.dispatchEvent(new Event('blur',{bubbles:true}));
    return true;
  }

  function showBanner(msg, color) {
    const old = document.querySelector('#ap-banner');
    if (old) old.remove();
    GM_addStyle(`#ap-banner{position:fixed;top:12px;right:12px;z-index:999999;background:#111;color:#fff;padding:16px 22px;border-radius:12px;font:14px/1.6 -apple-system,sans-serif;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,.5);border-left:4px solid ${color||'#48bb78'};animation:apIn .3s ease-out}#ap-banner b{color:#e53e3e}#ap-banner .sub{color:#999;font-size:12px;margin-top:4px}@keyframes apIn{from{transform:translateX(120px);opacity:0}to{transform:translateX(0);opacity:1}}`);
    const d = document.createElement('div');
    d.id = 'ap-banner';
    d.innerHTML = `🎭 <b>Autopilot</b><br>${msg}`;
    document.body.appendChild(d);
    setTimeout(() => { d.style.transition='opacity .5s'; d.style.opacity='0'; }, 15000);
    setTimeout(() => d.remove(), 15500);
  }

  // ═══ BROADWAY DIRECT ════════════════════════════════════════════════

  function runBroadwayDirect() {
    const ud = loadUser();
    if (!ud.firstName || !ud.email) { showBanner('⚠️ Set up your data first at bwayrush.com', '#ecc94b'); return; }
    const isManual = GM_getValue('ap_auto_mode', '1') !== '1';
    let completedCount = 0, currentIndex = 0, isProcessing = false;

    function getEnterNowButtons() {
      return [...document.querySelectorAll('a.enter-button, button.enter-button, [class*="enter-now"], input[value*="ENTER NOW"]')].filter(btn => btn.offsetParent !== null);
    }
    function getSuccessModal() {
      for (const el of document.querySelectorAll('[class*="modal"],[class*="overlay"],[class*="popup"],[class*="lightbox"],[role="dialog"],.fancybox-wrap,.mfp-wrap')) {
        if (el.offsetParent !== null && /lottery entry has been received|SUCCESS/i.test(el.textContent||'')) return el;
      }
      for (const el of document.querySelectorAll('div, section')) {
        if (el.offsetParent !== null && /lottery entry has been received/i.test(el.textContent||'') && el.querySelector('button,a')) return el;
      }
      return null;
    }
    function closeSuccessModal() {
      const modal = getSuccessModal();
      if (!modal) return false;
      for (const sel of ['button[class*="close"]','a[class*="close"]','.mfp-close','.fancybox-close','[aria-label*="close" i]','button.close','.close']) {
        const btn = modal.querySelector(sel) || document.querySelector(sel);
        if (btn && btn.offsetParent !== null) { btn.click(); return true; }
      }
      for (const btn of document.querySelectorAll('button, a, [role="button"]')) {
        if (btn.offsetParent === null) continue;
        const t = btn.textContent.trim();
        if (['×','✕','X','x','✖'].includes(t) || (btn.className && /close|dismiss/i.test(btn.className))) { btn.click(); return true; }
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    }
    function isFormModalOpen() {
      if (getSuccessModal()) return false;
      for (const sel of ['[class*="modal"]','[class*="overlay"]','[class*="popup"]','[class*="lightbox"]','[role="dialog"]','.fancybox-wrap','.mfp-wrap']) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null && el.querySelector('input')) return true;
      }
      for (const f of document.querySelectorAll('form')) {
        const style = window.getComputedStyle(f.parentElement || f);
        if ((style.position === 'fixed' || style.position === 'absolute') && f.offsetParent !== null) return true;
      }
      return false;
    }
    function hasPendingCaptcha() {
      const frame = document.querySelector('iframe[src*="recaptcha"]');
      if (!frame || frame.offsetParent === null) return false;
      const resp = document.querySelector('textarea[name="g-recaptcha-response"], #g-recaptcha-response');
      return !(resp && resp.value && resp.value.length > 10);
    }
    function clickEnterButton() {
      for (const el of [...document.querySelectorAll('input[type="submit"], button[type="submit"], button')].filter(el => el.offsetParent !== null)) {
        const t = (el.value || el.textContent || '').toUpperCase().trim();
        if (t === 'ENTER' || t === 'SUBMIT' || t.includes('ENTER NOW')) { el.click(); return true; }
      }
      return false;
    }
    function fillForm() {
      let count = 0;
      document.querySelectorAll('input, select, textarea').forEach(inp => {
        if (inp.type === 'hidden' || inp.type === 'submit' || inp.type === 'button' || inp.type === 'checkbox' || inp.type === 'radio') return;
        if (inp.offsetParent === null || (inp.value && inp.value.length > 0 && inp.value !== '0')) return;
        const ctx = [inp.name, inp.id, inp.placeholder, inp.getAttribute('aria-label'), inp.closest('label')?.textContent, inp.previousElementSibling?.textContent, inp.parentElement?.previousElementSibling?.textContent, inp.parentElement?.querySelector('label')?.textContent].filter(Boolean).join(' ').toUpperCase();
        if (ctx.includes('FIRST') && ctx.includes('NAME')) { if (setVal(inp, ud.firstName)) count++; }
        else if (ctx.includes('LAST') && ctx.includes('NAME')) { if (setVal(inp, ud.lastName)) count++; }
        else if (ctx.includes('EMAIL')) { if (setVal(inp, ud.email)) count++; }
        else if (ctx.includes('ZIP')) { if (setVal(inp, ud.zip)) count++; }
        else if (ctx.includes('QTY') || (ctx.includes('TICKET') && ctx.includes('REQUEST'))) { if (setVal(inp, ud.tickets)) count++; }
        else if (ctx.includes('COUNTRY')) { if (setVal(inp, ud.country)) count++; }
        const ph = (inp.placeholder || '').toUpperCase();
        if (ph === 'MM') { if (setVal(inp, ud.dobMM)) count++; }
        if (ph === 'DD') { if (setVal(inp, ud.dobDD)) count++; }
        if (ph === 'YYYY') { if (setVal(inp, ud.dobYYYY)) count++; }
      });
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.offsetParent === null || cb.checked) return;
        if (/agree|terms|conditions/i.test((cb.name||'')+(cb.id||'')+(cb.closest('label')?.textContent||'')+(cb.parentElement?.textContent||''))) { cb.click(); count++; }
      });
      return count;
    }
    function processNext() {
      if (isProcessing) return;
      const buttons = getEnterNowButtons();
      if (currentIndex >= buttons.length || buttons.length === 0) {
        if (completedCount > 0) showBanner(`<span style="color:#48bb78">✓ ${completedCount} entr${completedCount>1?'ies':'y'} submitted.</span><div class="sub">Check your email for results.</div>`, '#48bb78');
        else showBanner(`No open "ENTER NOW" lotteries found.<div class="sub">All may be Closed/Upcoming or already entered.</div>`, '#ecc94b');
        return;
      }
      isProcessing = true;
      buttons[currentIndex].click();
      const remaining = buttons.length - currentIndex;
      let attempts = 0;
      const tryFill = setInterval(() => {
        if (++attempts > 20) { clearInterval(tryFill); isProcessing = false; return; }
        const count = fillForm();
        if (count >= 3) {
          clearInterval(tryFill);
          setTimeout(() => {
            if (!hasPendingCaptcha() && !isManual) {
              showBanner(`<span style="color:#48bb78">✓ Form ${currentIndex+1}/${buttons.length} — no captcha, sending...</span>${remaining>1?`<div class="sub">${remaining-1} more to go</div>`:''}`, '#48bb78');
              setTimeout(() => { clickEnterButton(); completedCount++; currentIndex++; watchForSuccessOrClose(); }, 600);
            } else if (isManual) {
              showBanner(`<span style="color:#48bb78">✓ Form ${currentIndex+1}/${buttons.length} filled</span><div class="sub">👆 Click ENTER when ready${remaining>1?`<br>${remaining-1} more after this`:''}</div>`, '#6a8aaa');
              completedCount++; currentIndex++; watchForSuccessOrClose();
            } else {
              showBanner(`<span style="color:#48bb78">✓ Form ${currentIndex+1}/${buttons.length} filled</span><div class="sub">👆 Solve reCAPTCHA → click ENTER${remaining>1?`<br>${remaining-1} more after this`:''}</div>`, '#48bb78');
              completedCount++; currentIndex++; watchForSuccessOrClose();
            }
          }, 1200);
        }
      }, 500);
    }
    function watchForSuccessOrClose() {
      isProcessing = false;
      let n = 0;
      const w = setInterval(() => {
        if (++n > 360) { clearInterval(w); return; }
        if (getSuccessModal()) { clearInterval(w); setTimeout(() => { closeSuccessModal(); setTimeout(processNext, 1200); }, 800); return; }
        if (!isFormModalOpen()) { clearInterval(w); setTimeout(processNext, 1200); }
      }, 800);
    }
    function start() {
      const buttons = getEnterNowButtons();
      if (!buttons.length) return;
      showBanner(`Found ${buttons.length} lottery${buttons.length>1?'s':''} available.<div class="sub">Auto-filling...</div>`, '#9f7aea');
      setTimeout(processNext, 1500);
    }

    // Try to find buttons — if none found after page fully loads, show informative message
    function tryStartOrWarn() {
      if (getEnterNowButtons().length > 0) {
        obs.disconnect();
        start();
      }
    }

    const obs = new MutationObserver(() => { if (getEnterNowButtons().length > 0) { obs.disconnect(); start(); } });
    obs.observe(document.body, { childList: true, subtree: true });
    [1000, 3000, 5000].forEach(t => setTimeout(tryStartOrWarn, t));

    // After 6 seconds, if still nothing found — show a clear message explaining why
    setTimeout(() => {
      if (getEnterNowButtons().length === 0) {
        showBanner(
          `No "ENTER NOW" buttons found on this page.` +
          `<div class="sub">Possible reasons:<br>` +
          `· All lotteries are <b>Closed</b> or <b>Upcoming</b><br>` +
          `· You have <b>already entered</b> all available lotteries<br>` +
          `· The lottery hasn't opened yet — check the schedule</div>`,
          '#ecc94b'
        );
      }
    }, 6000);
  }

  // ═══ BWAYRUSH PANEL (Shadow DOM isolated) ═══════════════════════════

  const LOTTERY_DOMAINS = ['broadwaydirect.com', 'luckyseat.com', 'socialtoaster.com'];
  const EXCLUDED_DOMAINS = ['todaytix.com', 'hamiltonmusical.com', 'instagram.com'];
  const EXCLUDED_LABELS = ['in-person', 'student', 'military', 'hiptix', 'linctix', '30 under 30', 'college', 'ponyboy', '15th anniv', 'mtc35'];

  function getPlatform(url) {
    if (url.includes('broadwaydirect.com')) return 'Broadway Direct';
    if (url.includes('luckyseat.com'))      return 'Lucky Seat';
    if (url.includes('socialtoaster.com'))  return 'Telecharge';
    return 'Otro';
  }

  function scrapeShows() {
    const shows = [];
    document.querySelectorAll('a[title]').forEach(titleLink => {
      const title = titleLink.getAttribute('title') || '';
      const name = titleLink.textContent.trim();
      if (!name || name.length < 2 || !/Theatre|Theater|Square|Venue/i.test(title) || shows.some(s => s.name === name)) return;
      const container = titleLink.closest('.table-row');
      if (!container) return;
      const lotteryLinks = [];
      container.querySelectorAll('a[href]').forEach(link => {
        const href = link.href || '';
        if (EXCLUDED_DOMAINS.some(d => href.includes(d)) || !LOTTERY_DOMAINS.some(d => href.includes(d))) return;
        if (href.includes('rush_select') || href.includes('rush_')) return; // exclude Rush links
        const linkText = link.textContent.trim().toLowerCase();
        if (EXCLUDED_LABELS.some(lbl => linkText.includes(lbl))) return;
        const priceMatch = link.textContent.match(/\$[\d.\/]+/);
        lotteryLinks.push({ url: href, price: priceMatch ? priceMatch[0] : '', platform: getPlatform(href) });
      });
      if (lotteryLinks.length > 0) {
        const tm = title.match(/at (.+)/);
        shows.push({ name, theatre: tm ? tm[1] : '', links: lotteryLinks, img: '' });
      }
    });
    return shows;
  }


  function loadShowImages(shows, rerenderCard) {
    shows.forEach(show => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(show.name + ' Broadway musical')}&srlimit=1&format=json&origin=*`,
        onload(res) {
          try {
            const title = JSON.parse(res.responseText).query?.search?.[0]?.title;
            if (!title) return;
            GM_xmlhttpRequest({
              method: 'GET',
              url: `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=600&pilicense=any&origin=*`,
              onload(res2) {
                try {
                  const page = Object.values(JSON.parse(res2.responseText).query?.pages || {})[0];
                  const img = page?.thumbnail?.source || '';
                  if (img) { show.img = img; rerenderCard(show); }
                } catch {}
              }
            });
            GM_xmlhttpRequest({
              method: 'GET',
              url: `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`,
              onload(res3) {
                try {
                  const page = Object.values(JSON.parse(res3.responseText).query?.pages || {})[0];
                  const extract = page?.extract || '';
                  const perfMatch = extract.match(/([\d,]+)\s+performances/i);
                  if (perfMatch) { show.perf = perfMatch[1]; rerenderCard(show); }
                } catch {}
              }
            });
          } catch {}
        }
      });
    });
  }


  function runBwayRush() {
    GM_addStyle(`
      #ap-fab{position:fixed;bottom:24px;right:24px;z-index:100002;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#2a1e08,#3a2a0a);border:1px solid rgba(201,151,58,.4);color:#c9973a;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;transition:all .3s;box-shadow:0 4px 20px rgba(201,151,58,.2)}
      #ap-fab:hover{transform:scale(1.08)}
      #ap-fab.panel-open{right:calc(min(820px,98vw) + 16px)}
      #ap-overlay{position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,.7);z-index:99999;display:none;backdrop-filter:blur(3px)}
      #ap-overlay.on{display:block}
    `);

    let renderLog = () => {};

    function build() {
      const shows = scrapeShows();
      const selected = new Set();
      let globalAuto = GM_getValue('ap_auto_mode', '0') === '1'; // global auto-submit toggle, persisted
      let filter = 'all';

      const fab = document.createElement('button');
      fab.id = 'ap-fab'; fab.textContent = '🎭'; document.body.appendChild(fab);
      const overlay = document.createElement('div');
      overlay.id = 'ap-overlay'; document.body.appendChild(overlay);

      // Shadow DOM — 100% isolated from bwayrush.com CSS
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:100000;pointer-events:none;';
      document.body.appendChild(host);
      const shadow = host.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,600;1,300;1,600&family=Space+Grotesk:wght@400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        #panel{position:fixed;top:0;right:0;width:min(820px,98vw);height:100vh;background:#0d0b09;color:#ccc;display:flex;flex-direction:column;font-family:'Space Grotesk',sans-serif;font-size:14px;transform:translateX(100%);transition:transform .32s cubic-bezier(.4,0,.2,1);box-shadow:-16px 0 60px rgba(0,0,0,.9);border-left:1px solid #2a2018;overflow:hidden}
        #panel.on{transform:translateX(0)}
        .hdr{background:#0d0b09;border-bottom:1px solid #1e1a14;flex-shrink:0}
        .hdr-top{display:flex;align-items:center;justify-content:space-between;padding:13px 20px 0}
        .orn{display:flex;align-items:center;gap:6px}
        .orn-line{width:18px;height:1px;background:linear-gradient(90deg,transparent,#c9973a)}
        .orn-line.r{background:linear-gradient(90deg,#c9973a,transparent)}
        .orn-diamond{width:5px;height:5px;background:#c9973a;transform:rotate(45deg)}
        .guide-link{font-size:9px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#4a3f2e;border:1px solid #2a2018;padding:4px 10px;border-radius:3px;text-decoration:none}
        .guide-link:hover{color:#c9973a}
        .hdr-main{padding:10px 20px 14px;text-align:center}
        .eyebrow{font-size:8px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#c9973a;margin-bottom:4px}
        .title{font-family:'Cormorant Garamond',serif;font-size:32px;font-weight:600;color:#f0e6d0;line-height:1}
        .title em{font-style:italic;font-weight:300;color:#c9973a}
        .byline{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#3a3020;margin-top:4px}
        .stats{display:flex;align-items:center;justify-content:center;gap:14px;padding:8px 20px 13px;border-top:1px solid #1a1610}
        .stat{text-align:center}
        .stat-n{font-family:'Cormorant Garamond',serif;font-size:20px;font-weight:600;color:#c9973a}
        .stat-l{font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#3a3020}
        .sep{width:1px;height:22px;background:#1e1a14}
        details.cfg,details.cal{border-bottom:1px solid #1a1610;flex-shrink:0}
        details.cfg summary,details.cal summary{display:flex;align-items:center;gap:8px;padding:10px 20px;cursor:pointer;list-style:none;user-select:none}
        details.cfg summary:hover,details.cal summary:hover{background:#111009}
        details.cfg summary::after,details.cal summary::after{content:'▸';margin-left:auto;color:#2a2018;font-size:9px;transition:transform .2s}
        details.cfg[open] summary::after,details.cal[open] summary::after{transform:rotate(90deg)}
        .cfg-icon{width:14px;height:14px;border:1px solid #2a2018;border-radius:2px;display:flex;align-items:center;justify-content:center;color:#c9973a;font-size:9px}
        .cfg-label{font-size:9px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;color:#4a4030}
        .cal-count{font-size:9px;color:#4a4030;letter-spacing:.5px}
        .cal-chips{display:flex;flex-wrap:wrap;gap:4px;padding:4px 20px 12px;}
        .day-chip{font-size:10px;padding:2px 7px;border-radius:3px;cursor:pointer;border:1px solid rgba(201,151,58,.15);background:#111009;color:#3a3020;transition:all .15s;user-select:none}
        .day-chip.avail{color:#c9973a;border-color:rgba(201,151,58,.5);background:#1a1610}
        .day-chip.today{font-weight:700}
        details.log{border-bottom:1px solid #1a1610;flex-shrink:0}
        details.log summary{display:flex;align-items:center;gap:8px;padding:10px 20px;cursor:pointer;list-style:none;user-select:none}
        details.log summary:hover{background:#111009}
        details.log summary::after{content:'▸';margin-left:auto;color:#2a2018;font-size:9px;transition:transform .2s}
        details.log[open] summary::after{transform:rotate(90deg)}
        .log-time{font-size:9px;color:#4a4030;letter-spacing:.5px}
        .log-entries{padding:4px 20px 12px;display:flex;flex-direction:column;gap:4px}
        .log-entry{display:flex;align-items:center;gap:8px;font-size:11px;padding:4px 0;border-bottom:1px solid #1a1610}
        .log-entry:last-child{border-bottom:none}
        .log-icon{font-size:13px;flex-shrink:0}
        .log-show{color:#c9973a;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .log-status{font-size:10px;color:#4a4030;flex-shrink:0}
        .log-detail{font-size:10px;color:#3a3020;flex-shrink:0}
        .log-empty{font-size:11px;color:#3a3020;padding:8px 0}
        .cgrid{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:4px 20px 14px}
        .f label{display:block;font-size:8px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#3a3020;margin-bottom:4px}
        .f input,.f select{width:100%;padding:7px 10px;border-radius:2px;border:1px solid #1e1a14;background:#0b0906;color:#c8b89a;font-size:12px;font-family:'Space Grotesk',sans-serif;outline:none}
        .f input:focus,.f select:focus{border-color:rgba(201,151,58,.4)}
        .f select option{background:#0d0b09}
        .dob{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:6px}
        .bar{padding:9px 20px;display:flex;align-items:center;gap:5px;border-bottom:1px solid #1a1610;flex-shrink:0;flex-wrap:wrap;background:#0b0906}
        .tag{font-size:9px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;padding:4px 11px;border-radius:2px;border:1px solid #1e1a14;color:#4a4030;background:transparent;cursor:pointer;font-family:inherit}
        .tag:hover{color:#8a7050}
        .tag.on{background:#c9973a;border-color:#c9973a;color:#0d0b09}
        .acts{margin-left:auto;display:flex;gap:4px}
        .acts button{font-size:9px;font-weight:600;padding:3px 8px;border-radius:2px;border:1px solid #1e1a14;color:#3a3020;background:transparent;cursor:pointer;font-family:inherit}
        .acts button:hover{color:#8a7050}
        .list{flex:1;overflow-y:auto;padding:10px 14px;display:grid;grid-template-columns:1fr 1fr;gap:6px;align-content:start}
        .list::-webkit-scrollbar{width:2px}
        .list::-webkit-scrollbar-thumb{background:#2a2018}

        .card{border-radius:6px;overflow:hidden;border:1px solid #1e1a14;background:#111009;cursor:pointer;transition:border-color .15s,background .15s;display:flex;flex-direction:row;height:130px;flex-shrink:0}
        .card:hover{border-color:#3a3020;background:#161209}
        .card.sel{border-color:#c9973a;background:#1a1408}
        .card.off{opacity:.3;pointer-events:none}
        .card.off .dm{pointer-events:auto}

        .pw{width:90px;height:130px;flex-shrink:0;position:relative;overflow:hidden;background:#1a1610}
        .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:26px;background:linear-gradient(160deg,#1e1a10,#0d0b09)}
        .pi{width:90px;height:130px;object-fit:contain;object-position:center center;display:block;flex-shrink:0;position:relative;z-index:1}
        .pw::after{display:none}
        .ov{display:none}
        .bk{display:none}

        .acc{width:3px;flex-shrink:0;background:transparent;transition:background .15s;align-self:stretch}
        .card.sel .acc{background:#c9973a}

        .info{flex:1;min-width:0;padding:0 10px;display:flex;flex-direction:column;justify-content:center;gap:3px;position:static;bottom:auto;left:auto;right:auto;z-index:auto}
        .sn{font-family:'Cormorant Garamond',serif;font-size:13px;font-weight:600;color:#d4c4a0;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;text-shadow:none}
        .card.sel .sn{color:#fff}
        .card:hover .sn{color:#f0e6d0}
        .perf{font-size:9px;color:#6a5a3a;letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .card.sel .perf{color:#a08840;}
.meta{font-size:8px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;display:flex;gap:4px;align-items:center}
        .pbd{color:#6a8aaa}.pls{color:#5a8a6a}.ptc{color:#8a6aaa}
        .dot{width:2px;height:2px;border-radius:50%;background:#3a3020;display:inline-block;flex-shrink:0}
        .pr{color:#c9973a;font-weight:700}

        .side{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:0 10px;flex-shrink:0}
        .chk{width:17px;height:17px;border:1.5px solid #2a2018;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#0d0b09;background:#0b0906;transition:all .12s}
        .card.sel .chk{background:#c9973a;border-color:#c9973a}
        .card.sel .chk::after{content:'✓'}
        .dm{width:17px;height:17px;border-radius:3px;border:none;background:transparent;color:#2a2018;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit;transition:color .12s;position:static;top:auto;left:auto;z-index:auto}
        .dm:hover{color:#e53e3e;background:transparent}
        .card.off .dm{color:#5a8a6a}

        .smsg{grid-column:1/-1;background:#1a1208;border:1px solid #3a2a10;border-radius:6px;padding:12px;display:flex;gap:10px}
        .smsg h4{font-size:10px;font-weight:700;color:#c9973a;text-transform:uppercase;margin-bottom:3px}
        .smsg p{font-size:11px;color:#8a7a60;line-height:1.5}
        .empty{grid-column:1/-1;padding:40px 20px;text-align:center;font-family:'Cormorant Garamond',serif;font-style:italic;color:#3a3020;font-size:18px}
        .foot{padding:13px 20px 17px;border-top:1px solid #1e1a14;background:#0b0906;flex-shrink:0}
        .go{width:100%;padding:13px;border:1px solid rgba(201,151,58,.27);background:linear-gradient(135deg,#1e1608,#2a1e08);color:#c9973a;font-family:inherit;font-size:10px;font-weight:600;letter-spacing:2px;text-transform:uppercase;border-radius:3px;cursor:pointer}
        .go:hover{background:linear-gradient(135deg,#2a1e08,#3a2a0a);border-color:rgba(201,151,58,.5)}
        .go:disabled{background:#111009;color:#2a2018;border-color:#1a1610;cursor:not-allowed}
        .sub{text-align:center;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#2a2018;margin-top:8px}
        .toast{position:fixed;bottom:100px;right:24px;background:#1a1208;color:#c8b89a;padding:10px 16px;border-radius:3px;font-size:12px;box-shadow:0 6px 24px rgba(0,0,0,.6);border-left:2px solid #c9973a;transform:translateY(12px);opacity:0;transition:all .22s;max-width:280px;line-height:1.5;pointer-events:none}
        .toast.on{transform:translateY(0);opacity:1}
      `;
      shadow.appendChild(style);

      const panel = document.createElement('div');
      panel.id = 'panel';
      shadow.appendChild(panel);

      const toastEl = document.createElement('div');
      toastEl.className = 'toast';
      shadow.appendChild(toastEl);

      function toast(msg) {
        toastEl.innerHTML = msg;
        toastEl.classList.add('on');
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(() => toastEl.classList.remove('on'), 3200);
      }

      function toggle() {
        const isOpen = panel.classList.toggle('on');
        overlay.classList.toggle('on', isOpen);
        fab.classList.toggle('panel-open', isOpen);
        host.style.pointerEvents = isOpen ? 'all' : 'none';
      }
      fab.onclick = toggle;
      overlay.onclick = toggle;

      function render() {
        const dis = loadDisabled();
        const ud = loadUser();
        const list = shows.filter(s => {
          if (filter === 'bdirect')    return s.links.some(l => l.platform === 'Broadway Direct');
          if (filter === 'lseat')      return s.links.some(l => l.platform === 'Lucky Seat');
          if (filter === 'telecharge') return s.links.some(l => l.platform === 'Telecharge');
          return true;
        });
        const active = list.filter(s => !dis.includes(s.name) && selected.has(s.name));
        const urlSet = new Set(); active.forEach(s => s.links.forEach(l => urlSet.add(l.url)));
        const linkCount = urlSet.size;
        const oldList = shadow.querySelector('.list');
        const scrollY = oldList ? oldList.scrollTop : 0;

        panel.innerHTML = `
          <div class="hdr">
            <div class="hdr-top">
              <div class="orn"><div class="orn-line"></div><div class="orn-diamond"></div><div class="orn-line r"></div></div>
              <a class="guide-link" href="https://castelo95.github.io/broadway-lottery-guide" target="_blank">📖 Guide</a>
            </div>
            <div class="hdr-main">
              <div class="eyebrow">New York · Broadway</div>
              <div class="title">Broadway <em>Lottery</em> 🎭</div>
              <div class="byline">by Javier Castello</div>
            </div>
            <div class="stats">
              <div class="stat"><div class="stat-n">${shows.length}</div><div class="stat-l">Shows</div></div>
              <div class="sep"></div>
              <div class="stat"><div class="stat-n">${active.length}</div><div class="stat-l">Selected</div></div>
              <div class="sep"></div>
              <div class="stat"><div class="stat-n">${new Date().toLocaleDateString('en-US',{weekday:'short'})}</div><div class="stat-l">${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div></div>
            </div>
          </div>
          <details class="cal">
            <summary><div class="cfg-icon">📅</div><span class="cfg-label">My Days</span><span class="cal-count" id="cal-count"></span></summary>
            <div class="cal-chips" id="cal-chips"></div>
          </details>
          <details class="cfg"${!ud.firstName?' open':''}>
            <summary><div class="cfg-icon">⚙</div><span class="cfg-label">My Data</span></summary>
            <div class="cgrid">
              <div class="f"><label>First name</label><input id="u-fn" value="${ud.firstName}" placeholder="John"></div>
              <div class="f"><label>Last name</label><input id="u-ln" value="${ud.lastName}" placeholder="Doe"></div>
              <div class="f" style="grid-column:1/-1"><label>Email</label><input id="u-em" value="${ud.email}" placeholder="john@email.com" type="email"></div>
              <div class="f"><label>Zip</label><input id="u-zp" value="${ud.zip}" placeholder="10001"></div>
              <div class="f"><label>Country</label><select id="u-co"><option value="US"${(ud.country||'US')==='US'?' selected':''}>🇺🇸 USA</option><option value="CA"${ud.country==='CA'?' selected':''}>🇨🇦 Canada</option><option value="OTHER"${ud.country==='OTHER'?' selected':''}>Otro</option></select></div>
              <div class="f"><label>Phone</label><input id="u-ph" value="${ud.phone}" placeholder="212-555-0000"></div>
              <div class="f"><label>Tickets</label><select id="u-tk"><option value="1"${ud.tickets==='1'?' selected':''}>1</option><option value="2"${ud.tickets!=='1'?' selected':''}>2</option></select></div>
              <div class="f"><label>Showtimes filter</label><select id="u-lsf"><option value="all"${loadLsFilter()==='all'?' selected':''}>🕐 All</option><option value="night"${loadLsFilter()==='night'?' selected':''}>🌙 Nights only</option><option value="morning"${loadLsFilter()==='morning'?' selected':''}>☀️ Mornings only</option></select></div>
              <div class="f" style="grid-column:1/-1"><label>Date of birth</label><div class="dob"><input id="u-dmm" value="${ud.dobMM}" placeholder="MM" maxlength="2"><input id="u-ddd" value="${ud.dobDD}" placeholder="DD" maxlength="2"><input id="u-dyy" value="${ud.dobYYYY}" placeholder="YYYY" maxlength="4"></div></div>
            </div>
          </details>
          <details class="log" id="ap-log">
            <summary><div class="cfg-icon">📋</div><span class="cfg-label">Last Run</span><span class="log-time" id="log-time"></span></summary>
            <div class="log-entries" id="log-entries"></div>
          </details>
          <div class="bar">
            <button class="tag${filter==='all'?' on':''}" data-f="all">All</button>
            <button class="tag${filter==='bdirect'?' on':''}" data-f="bdirect">B.Direct</button>
            <button class="tag${filter==='lseat'?' on':''}" data-f="lseat">LuckySeat</button>
            <button class="tag${filter==='telecharge'?' on':''}" data-f="telecharge">Telecharge</button>
            <div class="acts"><button id="btn-all">All ✓</button><button id="btn-none">×</button></div>
            <button class="tag${globalAuto?' on':''}" id="btn-auto">${globalAuto?'⚡ Auto':'◎ Manual'}</button>
          </div>
          <div class="list">
            ${list.length===0 ? '<div class="empty">No shows found</div>' : (() => {
              const msgs = [];
              active.forEach(s => { if (!s.links||s.links.length===0) msgs.push(`<b>${s.name}</b>: no open lotteries.`); });
              const statusBlock = msgs.length ? `<div class="smsg"><div><h4>Some shows can't be entered</h4><p>${msgs.join('<br>')}</p></div></div>` : '';
              const cards = list.map(s => {
                const isDis = dis.includes(s.name), isSel = selected.has(s.name) && !isDis;
                const plats = [...new Set(s.links.map(l=>l.platform))];
                const prices = [...new Set(s.links.map(l=>l.price).filter(Boolean))];
                const imgHtml = s.img ? `<img class="pi" src="${s.img}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
                return `<div class="card${isSel?' sel':''}${isDis?' off':''}" data-n="${s.name}">
                  <div class="pw" data-show="${s.name.replace(/"/g,'&quot;')}">
                    <div class="ph">🎭</div>${imgHtml}
                  </div>
                  <div class="acc"></div>
                  <div class="info">
                    <div class="sn">${s.name}</div>
                    ${s.perf ? `<div class="perf">${s.perf} performances</div>` : ''}
<div class="meta">${plats.map(p=>`<span class="${p==='Broadway Direct'?'pbd':p==='Lucky Seat'?'pls':'ptc'}">${p}</span>`).join('')}${prices.length?`<span class="dot"></span><span class="pr">${prices.join('/')}</span>`:''}</div>
                  </div>
                  <div class="side">
                    <div class="chk"></div>
                    <button class="dm" data-d="${s.name}">${isDis?'↩':'×'}</button>
                  </div>
                </div>`;
              }).join('');
              return statusBlock + cards;
            })()}
          </div>
          <div class="foot">
            <button class="go" id="btn-go"${active.length===0?' disabled':''}>
              ${active.length===0?'Select shows to enter':`🚀 Open ${linkCount} lotter${linkCount>1?'ies':'y'} · ${active.length} show${active.length>1?'s':''}`}
            </button>
            <div class="sub">${active.length>0?'B.Direct auto-fills · you only solve reCAPTCHA':'No TodayTix or Hamilton (require app)'}</div>
          </div>`;

        const newList = shadow.querySelector('.list');
        if (newList && scrollY) newList.scrollTop = scrollY;

        shadow.querySelectorAll('.tag').forEach(b => { b.onclick = e => { e.preventDefault(); filter = b.dataset.f; render(); }; });
        shadow.querySelector('#btn-all').onclick = e => { e.preventDefault(); list.forEach(s => { if (!dis.includes(s.name)) selected.add(s.name); }); render(); };
        shadow.querySelector('#btn-none').onclick = e => { e.preventDefault(); selected.clear(); render(); };
        shadow.querySelector('#btn-auto').onclick = e => { e.preventDefault(); globalAuto = !globalAuto; render(); };
        shadow.querySelectorAll('.card').forEach(card => {
          card.onclick = e => {
            e.preventDefault(); e.stopPropagation();
            if (e.target.closest('.dm')) return;
            const n = card.dataset.n; if (dis.includes(n)) return;
            selected.has(n) ? selected.delete(n) : selected.add(n); render();
          };
        });

        shadow.querySelectorAll('.dm').forEach(btn => {
          btn.onclick = e => {
            e.preventDefault(); e.stopPropagation();
            const n = btn.dataset.d; let cur = loadDisabled();
            if (cur.includes(n)) { cur = cur.filter(x=>x!==n); toast(`✓ "${n}" re-enabled`); }
            else { cur.push(n); selected.delete(n); toast(`✕ "${n}" hidden`); }
            saveDisabled(cur); render();
          };
        });

        ['u-fn','u-ln','u-em','u-zp','u-ph','u-tk','u-dmm','u-ddd','u-dyy','u-co'].forEach((id,j) => {
          const el = shadow.getElementById(id);
          if (!el) return;
          const keys = ['firstName','lastName','email','zip','phone','tickets','dobMM','dobDD','dobYYYY','country'];
          const sv = () => {
            const d = {};
            ['u-fn','u-ln','u-em','u-zp','u-ph','u-tk','u-dmm','u-ddd','u-dyy','u-co'].forEach((fid,k) => { d[keys[k]] = shadow.getElementById(fid)?.value||''; });
            saveUser(d);
          };
          el.addEventListener('input', sv);
          el.addEventListener('change', sv);
        });
        const lsfEl = shadow.getElementById('u-lsf');
        if (lsfEl) lsfEl.addEventListener('change', () => saveLsFilter(lsfEl.value));

        shadow.querySelector('#btn-go').onclick = e => {
          e.preventDefault();
          const ud2 = loadUser();
          if (!ud2.firstName || !ud2.email) { toast('⚠️ Fill in your name and email'); return; }
          if (!ud2.dobMM || !ud2.dobDD || !ud2.dobYYYY) { toast('⚠️ Fill in your date of birth'); return; }
          saveRunLog({ runTime: new Date().toISOString(), entries: [] });
          const toOpen = []; const seen = new Set();
          active.forEach(show => { show.links.forEach(link => { if (!seen.has(link.url + show.name)) { seen.add(link.url + show.name); toOpen.push({...link, showName: show.name, isAuto: globalAuto}); } }); });
          if (!toOpen.length) { toast('⚠️ No lottery links found'); return; }
          toOpen.forEach((item, i) => {
            setTimeout(() => {
              let url = item.url;
              if (item.url.includes('socialtoaster.com') || item.url.includes('luckyseat.com')) {
                url += '#' + encodeURIComponent(item.showName) + (item.isAuto ? '|auto' : '');
              }
              // Store auto/manual preference in GM storage so iframes can read it
              GM_setValue('ap_auto_mode', item.isAuto ? '1' : '0');
              window.open(url, '_blank');
            }, i * 800);
          });
          toast(`🚀 Opening ${toOpen.length} link${toOpen.length>1?'s':''}...`);
        };
        renderCalendar();
        renderLog();
      }

      function renderCalendar() {
        const blocked = loadBlockedDays();
        const today = new Date(); today.setHours(0,0,0,0);
        let changed = false;
        blocked.forEach(iso => { if (new Date(iso) < today) { blocked.delete(iso); changed = true; } });
        if (changed) saveBlockedDays(blocked);
        const chips = shadow.getElementById('cal-chips');
        const count = shadow.getElementById('cal-count');
        if (!chips) return;
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        chips.innerHTML = '';
        let available = 0;
        for (let i = 0; i < 14; i++) {
          const d = new Date(today); d.setDate(today.getDate() + i);
          const iso = d.toISOString().slice(0,10);
          const isBlocked = blocked.has(iso);
          const chip = document.createElement('span');
          chip.className = 'day-chip' + (isBlocked ? '' : ' avail') + (i===0 ? ' today' : '');
          chip.textContent = days[d.getDay()] + ' ' + d.getDate();
          chip.title = iso;
          chip.addEventListener('click', () => {
            if (blocked.has(iso)) blocked.delete(iso); else blocked.add(iso);
            saveBlockedDays(blocked);
            renderCalendar();
          });
          chips.appendChild(chip);
          if (!isBlocked) available++;
        }
        if (count) count.textContent = available + '/14 available';
      }

      renderLog = function() {
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
            <span class="log-icon">${icons[e.status]||'•'}</span>
            <span class="log-show">${e.show}</span>
            <span class="log-status">${labels[e.status]||e.status}</span>
            ${e.detail?`<span class="log-detail">· ${e.detail}</span>`:''}
          </div>
        `).join('');
      };

      render();

      loadShowImages(shows, (show) => {
        const wrap = shadow.querySelector(`.pw[data-show="${CSS.escape(show.name)}"]`);
        if (!wrap) return;
        if (show.img) {
          let img = wrap.querySelector('.pi');
          if (!img) {
            img = document.createElement('img');
            img.className = 'pi';
            img.alt = '';
            img.loading = 'lazy';
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
      });
    }

    if (document.readyState === 'complete') build();
    else window.addEventListener('load', build);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderLog(); });
  }

  // ═══ BROADWAY DIRECT IFRAME ══════════════════════════════════════════

  function runBroadwayDirectForm() {
    const ud = loadUser();
    if (!ud.firstName || !ud.email) return;
    const isManual = GM_getValue('ap_auto_mode', '1') !== '1';
    let filled = false;
    let bdShowName = 'Broadway Direct';
    try {
      bdShowName = window.parent.document.querySelector('h1')?.textContent?.trim() ||
                   window.parent.document.title.split(/[|\-–]/)[0].trim() ||
                   'Broadway Direct';
    } catch(e) {}

    function setSelect(el, val) {
      if (!el || !val) return false;
      for (let i = 0; i < el.options.length; i++) {
        if (el.options[i].value === val || el.options[i].text.trim() === val) { el.selectedIndex = i; el.dispatchEvent(new Event('change', {bubbles: true})); return true; }
      }
      return false;
    }

    function pageHasAvailableDate() {
      const blocked = loadBlockedDays();
      if (!blocked.size) return true;
      const text = document.body.textContent || '';
      const dateMatches = [...text.matchAll(/[A-Z][a-z]+day,\s+[A-Z][a-z]+\s+\d+(?:,\s+\d{4})?/g)];
      if (!dateMatches.length) return true;
      return dateMatches.some(m => { const iso = dateToISO(m[0]); return iso && !blocked.has(iso); });
    }

    function fillForm() {
      if (filled) return;
      const firstNameField = document.getElementById('dlslot_name_first');
      if (!firstNameField) return;
      if (!pageHasAvailableDate()) {
        const ind = document.createElement('div');
        ind.style.cssText = 'position:fixed;top:4px;right:4px;background:#111;color:#ecc94b;padding:8px 14px;border-radius:8px;font:13px sans-serif;z-index:99999;box-shadow:0 2px 12px rgba(0,0,0,.4)';
        ind.textContent = '⚠️ Skipped — no available performances on your selected days';
        document.body.appendChild(ind);
        setTimeout(() => ind.remove(), 10000);
        filled = true;
        return;
      }
      let count = 0;
      if (setVal(document.getElementById('dlslot_name_first'), ud.firstName)) count++;
      if (setVal(document.getElementById('dlslot_name_last'), ud.lastName)) count++;
      if (setVal(document.getElementById('dlslot_email'), ud.email)) count++;
      if (setVal(document.getElementById('dlslot_dob_month'), ud.dobMM)) count++;
      if (setVal(document.getElementById('dlslot_dob_day'), ud.dobDD)) count++;
      if (setVal(document.getElementById('dlslot_dob_year'), ud.dobYYYY)) count++;
      if (setVal(document.getElementById('dlslot_zip'), ud.zip)) count++;
      if (setSelect(document.getElementById('dlslot_ticket_qty'), ud.tickets)) count++;
      const countryMap = { 'US': 'USA', 'USA': 'USA', 'CA': 'CANADA', 'CANADA': 'CANADA', 'OTHER': 'OTHER' };
      if (setSelect(document.getElementById('dlslot_country'), countryMap[(ud.country||'US').toUpperCase()]||'USA')) count++;
      const agree = document.getElementById('dlslot_agree');
      if (agree && !agree.checked) { agree.click(); count++; }
      if (count >= 3) {
        filled = true;
        setTimeout(() => {
          const captchaFrame = document.querySelector('iframe[src*="recaptcha"]');
          const captchaResp = document.querySelector('textarea[name="g-recaptcha-response"], #g-recaptcha-response');
          const needsCaptcha = captchaFrame && captchaFrame.offsetParent !== null && !(captchaResp && captchaResp.value && captchaResp.value.length > 10);
          const ind = document.createElement('div');
          ind.style.cssText = 'position:fixed;top:4px;right:4px;background:#111;color:#48bb78;padding:8px 14px;border-radius:8px;font:13px sans-serif;z-index:99999;box-shadow:0 2px 12px rgba(0,0,0,.4)';
          function bdSubmit() {
            const btn = [...document.querySelectorAll('input[type="submit"],button[type="submit"],button')].find(b => b.offsetParent !== null && /^(ENTER|SUBMIT)$/i.test((b.value||b.textContent).trim()));
            if (btn) { setTimeout(() => btn.click(), 500); }
          }
          if (!needsCaptcha && !isManual) {
            ind.textContent = `🎭 ✓ ${count} fields — submitting...`;
            document.body.appendChild(ind);
            setTimeout(() => ind.remove(), 8000);
            bdSubmit();
            addRunLogEntry({ show: bdShowName, platform: 'Broadway Direct', status: 'entered', detail: '' });
          } else if (!isManual) {
            ind.textContent = `🎭 ✓ ${count} fields — captcha clicked, waiting...`;
            document.body.appendChild(ind);
            const bdPollStart = Date.now();
            const bdPollId = setInterval(() => {
              const resp2 = document.querySelector('textarea[name="g-recaptcha-response"],#g-recaptcha-response');
              if (resp2 && resp2.value && resp2.value.length > 10) {
                clearInterval(bdPollId);
                ind.textContent = `🎭 ✓ ${count} fields — captcha solved, submitting...`;
                setTimeout(() => ind.remove(), 8000);
                bdSubmit();
                addRunLogEntry({ show: bdShowName, platform: 'Broadway Direct', status: 'entered', detail: '' });
              } else if (Date.now() - bdPollStart > 20000) {
                clearInterval(bdPollId);
                ind.textContent = `🎭 ✓ ${count} fields — click "I'm not a robot" then click ENTER`;
                addRunLogEntry({ show: bdShowName, platform: 'Broadway Direct', status: 'captcha_pending', detail: '' });
              }
            }, 500);
          } else {
            ind.textContent = `🎭 ✓ ${count} fields — click "I'm not a robot" then click ENTER`;
            document.body.appendChild(ind);
            addRunLogEntry({ show: bdShowName, platform: 'Broadway Direct', status: 'captcha_pending', detail: '' });
            setTimeout(() => ind.remove(), 15000);
          }
        }, 1200);
      }
    }

    const obs = new MutationObserver(fillForm);
    obs.observe(document.body, { childList: true, subtree: true });
    [300, 800, 1500, 2500, 4000].forEach(t => setTimeout(fillForm, t));
  }

  // ═══ LUCKY SEAT ══════════════════════════════════════════════════════

  function runLuckySeat() {
    const ud = loadUser();
    const lsFilter = loadLsFilter();
    if (!ud.firstName || !ud.email) return;
    const isManual = GM_getValue('ap_auto_mode', '1') !== '1';
    let done = false;
    const lsShowName = decodeURIComponent(location.hash.replace(/^#/,'').split('|')[0]) || 'Lucky Seat';

    function isMorning(t) {
      const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!m) return false;
      let h = parseInt(m[1]);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return h < 17;
    }
    function isWeekend(el) { return /saturday|sunday|sábado|domingo/i.test(el?.textContent||''); }

    function selectPerformances() {
      const allCbs = [...document.querySelectorAll('input[type="checkbox"]')].filter(cb => cb.offsetParent !== null);
      if (!allCbs.length) return { selected: 0, status: 'none' };

      // Separate available vs already-entered (disabled = perfTimeDisabled)
      const available = allCbs.filter(cb => !cb.disabled);
      const alreadyEntered = allCbs.filter(cb => cb.disabled);

      const blockedDays = loadBlockedDays();
      function cbDateAvailable(row) {
        if (!blockedDays.size) return true;
        const rowText = row?.textContent || '';
        const dateMatch = rowText.match(/[A-Z][a-z]+day,\s+[A-Z][a-z]+\s+\d+,\s+\d{4}/);
        if (!dateMatch) return true;
        const iso = dateToISO(dateMatch[0]);
        return iso ? !blockedDays.has(iso) : true;
      }
      function getRow(cb) {
        return cb.closest('[class*="row"],[class*="item"],[class*="performance"],li') || cb.parentElement?.parentElement?.parentElement;
      }

      if (lsFilter === 'all') {
        if (!available.length) return { selected: 0, status: 'all_entered' };
        if (!blockedDays.size) {
          const sa = document.querySelector('input.form-select-all, input[value="Select All"]');
          if (sa && sa.offsetParent !== null) { sa.click(); return { selected: available.length, status: 'ok' }; }
        }
        const dateAvail = available.filter(cb => cbDateAvailable(getRow(cb)));
        if (!dateAvail.length) return { selected: 0, status: 'no_match' };
        dateAvail.forEach(cb => { if (!cb.checked) cb.click(); });
        return { selected: dateAvail.length, status: 'ok' };
      }

      // Filtered mode — check what's available vs what matches filter
      let sel = 0;
      let matchesFilter = 0;
      let matchesAlreadyEntered = 0;

      allCbs.forEach(cb => {
        const con = cb.closest('div, label') || cb.parentElement;
        const row = getRow(cb);
        const morning = isMorning(con?.textContent?.trim()||'');
        const weekend = isWeekend(row) || isWeekend(con);
        const matches = weekend || (lsFilter==='morning'&&morning) || (lsFilter==='night'&&!morning);

        if (matches) {
          if (cb.disabled) {
            matchesAlreadyEntered++; // already entered for this slot
          } else if (!cbDateAvailable(row)) {
            // date blocked by user — skip silently
          } else {
            matchesFilter++;
            if (!cb.checked) { cb.click(); sel++; }
          }
        } else {
          if (cb.checked && !cb.disabled) cb.click(); // deselect wrong ones
        }
      });

      if (sel === 0) {
        if (matchesAlreadyEntered > 0 && matchesFilter === 0) return { selected: 0, status: 'all_entered' };
        if (matchesFilter === 0 && matchesAlreadyEntered === 0) return { selected: 0, status: 'no_match' };
      }
      return { selected: sel, status: 'ok' };
    }

    function setTicketCount() {
      const target = parseInt(ud.tickets) || 2;
      const plusBtn = [...document.querySelectorAll('img[src*="form-number-plus"]')].map(img => img.closest('button')||img.parentElement).find(el => el && el.offsetParent !== null);
      const minusBtn = [...document.querySelectorAll('img[src*="form-number-minus"]')].map(img => img.closest('button')||img.parentElement).find(el => el && el.offsetParent !== null);
      if (!plusBtn) return false;
      const counterEl = document.querySelector('[class*="number"] span,[class*="counter"],[class*="qty"]') || plusBtn.parentElement?.querySelector('span,div:not([class*="btn"])');
      const current = counterEl ? parseInt(counterEl.textContent.trim())||0 : 0;
      if (current > 0 && minusBtn) for (let i = 0; i < current; i++) minusBtn.click();
      for (let i = 0; i < target; i++) setTimeout(() => plusBtn.click(), i * 120);
      return true;
    }

    function hasPendingCaptcha() {
      const frame = document.querySelector('iframe[src*="recaptcha"]');
      if (!frame || frame.offsetParent === null) return false;
      const resp = document.querySelector('textarea[name="g-recaptcha-response"],#g-recaptcha-response');
      return !(resp && resp.value && resp.value.length > 10);
    }

    function showIndicator(msg, color) {
      const old = document.getElementById('ls-ap-indicator');
      if (old) old.remove();
      const el = document.createElement('div');
      el.id = 'ls-ap-indicator';
      el.style.cssText = `position:fixed;top:10px;right:10px;z-index:999999;background:#111;color:${color||'#48bb78'};padding:12px 18px;border-radius:10px;font:14px/1.5 -apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);border-left:4px solid ${color||'#48bb78'};max-width:360px`;
      el.innerHTML = `🎭 <b style="color:#fff">Lucky Seat</b><br>${msg}`;
      document.body.appendChild(el);
      setTimeout(() => { el.style.transition='opacity .5s'; el.style.opacity='0'; }, 12000);
      setTimeout(() => el.remove(), 12500);
    }

    function tryFill() {
      if (done) return;
      if (!document.querySelectorAll('input[type="checkbox"]').length) return;
      if (!document.querySelector('button.c-btn--large, button[type="submit"]')) return;
      done = true;

      const result = selectPerformances();

      // Show informative message if nothing could be selected
      if (result.selected === 0) {
        const filterLabel = lsFilter === 'night' ? 'evening' : lsFilter === 'morning' ? 'matinée' : '';
        if (result.status === 'all_entered') {
          showIndicator(
            `⚠️ You've already entered all available ${filterLabel} performances for this show.<br>` +
            `<span style="font-size:12px;opacity:.8">Nothing left to do here — check your email for results.</span>`,
            '#ecc94b'
          );
          addRunLogEntry({ show: lsShowName, platform: 'Lucky Seat', status: 'already_entered', detail: '' });
        } else if (result.status === 'no_match') {
          showIndicator(
            `⚠️ No ${filterLabel} performances available for this show.<br>` +
            `<span style="font-size:12px;opacity:.8">Try changing your time filter in the bwayrush.com panel.</span>`,
            '#ecc94b'
          );
          addRunLogEntry({ show: lsShowName, platform: 'Lucky Seat', status: 'no_match', detail: '' });
        } else {
          showIndicator('⚠️ No open performances found — all may be Closed or already entered.', '#e53e3e');
          addRunLogEntry({ show: lsShowName, platform: 'Lucky Seat', status: 'no_match', detail: '' });
        }
        return;
      }
      setTimeout(() => {
        setTicketCount();
        const delay = (parseInt(ud.tickets)||2) * 150 + 500;
        setTimeout(() => {
          if (isManual) {
            showIndicator('✓ Performances selected & tickets set — click <b style="color:#fff">Submit Entry</b> when ready', '#6a8aaa');
            addRunLogEntry({ show: lsShowName, platform: 'Lucky Seat', status: 'captcha_pending', detail: '' });
          } else if (!hasPendingCaptcha()) {
            showIndicator('✓ All done — submitting automatically...', '#48bb78');
            setTimeout(() => {
              const btn = document.querySelector('button.c-btn--large, button[type="submit"]');
              if (btn) {
                addRunLogEntry({ show: lsShowName, platform: 'Lucky Seat', status: 'entered', detail: result.selected + ' performance' + (result.selected !== 1 ? 's' : '') });
                btn.click();
                // Watch for "Review Your Selection" confirmation modal and auto-confirm
                const confirmObs = new MutationObserver(() => {
                  const confirmBtn = [...document.querySelectorAll('button, a')].find(b => /confirm\s*&?\s*submit/i.test(b.textContent));
                  if (confirmBtn && confirmBtn.offsetParent !== null) { confirmObs.disconnect(); confirmBtn.click(); }
                });
                confirmObs.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => confirmObs.disconnect(), 10000);
              }
            }, 600);
          } else {
            showIndicator('✓ Captcha clicked — waiting for verification...', '#ecc94b');
            const pollStart = Date.now();
            const pollId = setInterval(() => {
              if (!hasPendingCaptcha()) {
                clearInterval(pollId);
                if (!isManual) {
                  showIndicator('✓ Captcha solved — submitting...', '#48bb78');
                  setTimeout(() => {
                    const btn = document.querySelector('button.c-btn--large, button[type="submit"]');
                    if (btn) {
                      addRunLogEntry({ show: lsShowName, platform: 'Lucky Seat', status: 'entered', detail: result.selected + ' performance' + (result.selected !== 1 ? 's' : '') });
                      btn.click();
                      const confirmObs = new MutationObserver(() => {
                        const confirmBtn = [...document.querySelectorAll('button, a')].find(b => /confirm\s*&?\s*submit/i.test(b.textContent));
                        if (confirmBtn && confirmBtn.offsetParent !== null) { confirmObs.disconnect(); confirmBtn.click(); }
                      });
                      confirmObs.observe(document.body, { childList: true, subtree: true });
                      setTimeout(() => confirmObs.disconnect(), 10000);
                    }
                  }, 400);
                } else {
                  showIndicator('✓ Captcha solved — click <b style="color:#fff">Submit Entry</b> when ready', '#6a8aaa');
                }
              } else if (Date.now() - pollStart > 20000) {
                clearInterval(pollId);
                showIndicator('✓ Performances selected & tickets set — click "I\'m not a robot" then <b style="color:#fff">Submit Entry</b>', '#ecc94b');
                addRunLogEntry({ show: lsShowName, platform: 'Lucky Seat', status: 'captcha_pending', detail: '' });
              }
            }, 500);
          }
        }, delay);
      }, 500);
    }

    const obs = new MutationObserver(() => { if (!done) tryFill(); });
    obs.observe(document.body, { childList: true, subtree: true });
    [800, 1500, 2500, 4000, 6000].forEach(t => setTimeout(() => { if (!done) tryFill(); }, t));
  }

  // ═══ TELECHARGE (socialtoaster) ══════════════════════════════════════

  function runTelecharge() {
    const ud = loadUser();
    if (!ud.email) return;

    const hashParts = location.hash ? decodeURIComponent(location.hash.slice(1)).split('|') : [];
    const targetShow = hashParts[0]?.toLowerCase().trim() || null;
    const tcShowName = hashParts[0]?.trim() || 'Telecharge';
    const isAuto = hashParts[1] === 'auto';
    function normalize(s) { return s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim(); }
    function matches(cardTitle) {
      if (!targetShow) return true;
      const t = normalize(targetShow);
      const c = normalize(cardTitle);
      // match on first 3 words of target
      const words = t.split(' ').slice(0,3).join(' ');
      return c.includes(words);
    }

    function showIndicator(msg, color) {
      const old = document.getElementById('tc-ap');
      if (old) old.remove();
      const el = document.createElement('div');
      el.id = 'tc-ap';
      el.style.cssText = `position:fixed;top:10px;right:10px;z-index:999999;background:#111;color:${color||'#48bb78'};padding:12px 18px;border-radius:10px;font:14px/1.5 -apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.5);border-left:4px solid ${color||'#48bb78'};max-width:380px`;
      el.innerHTML = `🎭 <b style="color:#fff">Telecharge</b><br>${msg}`;
      document.body.appendChild(el);
      setTimeout(() => { el.style.transition='opacity .5s'; el.style.opacity='0'; }, 14000);
      setTimeout(() => el.remove(), 14500);
    }

    let done = false;
    function tryFill() {
      if (done) return;
      const allCards = [...document.querySelectorAll('div.lottery_show')];
      if (!allCards.length) return;
      done = true;

      // Set email
      const emailField = document.querySelector('input[type="email"], input[name*="email"], input[id*="email"]');
      if (emailField && !emailField.value) setVal(emailField, ud.email);

      // Filter to target show
      const targetCards = allCards.filter(card => {
        const title = card.querySelector('.lottery_show_title')?.textContent?.trim() || '';
        return matches(title);
      });

      if (targetCards.length === 0) {
        const label = targetShow ? `<b style="color:#fff">${decodeURIComponent(location.hash.slice(1))}</b>` : 'this show';
        showIndicator(`⚠️ No lottery found for ${label} today.<br><span style="font-size:12px;opacity:.7">It may be Closed, Upcoming, or not listed.</span>`, '#ecc94b');
        return;
      }

      let entered = 0;
      let alreadyIn = 0;

      const tcBlocked = loadBlockedDays();
      function cardHasAvailableDate(card) {
        if (!tcBlocked.size) return true;
        const text = card.textContent || '';
        const dateMatches = [...text.matchAll(/[A-Z][a-z]+day,\s+[A-Z][a-z]+\s+\d+(?:,\s+\d{4})?/g)];
        if (!dateMatches.length) return true;
        return dateMatches.some(m => { const iso = dateToISO(m[0]); return iso && !tcBlocked.has(iso); });
      }

      targetCards.forEach((card, i) => {
        const enteredDiv = card.querySelector('.lottery_show_enter_bottom .entered-text');
        const isAlreadyEntered = enteredDiv && enteredDiv.offsetParent !== null && /lottery entered/i.test(enteredDiv.textContent);

        if (isAlreadyEntered) { alreadyIn++; return; }

        if (!cardHasAvailableDate(card)) { return; }

        // Set tickets
        const sel = card.querySelector('select[id^="tickets_"]');
        if (sel) {
          const target = ud.tickets || '2';
          for (let j = 0; j < sel.options.length; j++) {
            if (sel.options[j].value === target) { sel.selectedIndex = j; sel.dispatchEvent(new Event('change',{bubbles:true})); break; }
          }
        }

        const btn = card.querySelector('a.st_campaign_button');
        if (btn) {
          if (isAuto) {
            setTimeout(() => { btn.click(); entered++; }, i * 600);
          } else {
            entered++; // count as "handled" — page is open, user clicks manually
          }
        }
      });

      // Show result after all clicks
      setTimeout(() => {
        if (alreadyIn > 0 && entered === 0) {
          showIndicator(`Already entered — check your email for results.`, '#ecc94b');
          addRunLogEntry({ show: tcShowName, platform: 'Telecharge', status: 'already_entered', detail: '' });
        } else if (entered > 0) {
          if (isAuto) {
            showIndicator(`✓ Entered ${entered} lotter${entered>1?'ies':'y'} automatically.`, '#48bb78');
            addRunLogEntry({ show: tcShowName, platform: 'Telecharge', status: 'entered', detail: entered + ' lotter' + (entered > 1 ? 'ies' : 'y') });
          } else {
            showIndicator(`✓ Form ready — click <b style="color:#fff">Enter</b> when you're ready.`, '#6a8aaa');
            addRunLogEntry({ show: tcShowName, platform: 'Telecharge', status: 'entered', detail: entered + ' lotter' + (entered > 1 ? 'ies' : 'y') });
          }
        }
      }, targetCards.length * 600 + 200);
    }

    const obs = new MutationObserver(() => { if (!done && document.querySelector('div.lottery_show')) { obs.disconnect(); setTimeout(tryFill, 500); } });
    obs.observe(document.body, { childList: true, subtree: true });
    [800, 1500, 2500, 4000].forEach(t => setTimeout(() => { if (!done) tryFill(); }, t));
  }

  function runRecaptchaAutoClick() {
    // Decode the co= parameter to verify parent page is one of our target sites
    const co = (new URLSearchParams(location.search).get('co') || '').replace(/\.+$/, '');
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

  // ═══ ROUTER ══════════════════════════════════════════════════════════

  const h = location.hostname;
  const p = location.pathname;
  if (h.includes('bwayrush.com'))                                              runBwayRush();
  else if (h.includes('broadwaydirect.com') && p.includes('/enter-lottery'))  runBroadwayDirectForm();
  else if (h.includes('broadwaydirect.com'))                                   runBroadwayDirect();
  else if (h.includes('luckyseat.com') && p.includes('/shows/'))              runLuckySeat();
  else if (h.includes('socialtoaster.com'))                                    runTelecharge();
  else if (h.includes('google.com') && p.includes('/recaptcha/'))             runRecaptchaAutoClick();

})();

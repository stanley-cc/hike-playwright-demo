// 共同 helper（主檔與 step2 共用）

function normalizeForCompare(s) {
  return (s || '')
    .toString()
    .replace(/臺/g, '台')
    .replace(/\s+/g, '')
    .replace(/[()（）·・,，-]/g, '')
    .trim();
}

async function waitAspNetStable(page) {
  await page.waitForTimeout(200);
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

async function setInput(page, selector, value) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
  await page.fill(selector, '');
  await page.type(selector, String(value));
}

async function selectByValueOrText(page, selector, candidate) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 12000 });
  const value = String(candidate).trim();
  const ok = await page.$eval(
    selector,
    (el, v) => {
      const s = /** @type {HTMLSelectElement} */(el);
      const found = Array.from(s.options).some((o) => (o.value || '').trim() === v);
      if (found) {
        s.value = v;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return found;
    },
    value
  );
  if (ok) return;
  await page.$eval(
    selector,
    (el, v) => {
      const s = /** @type {HTMLSelectElement} */(el);
      let chosen = '';
      for (const o of Array.from(s.options)) {
        const text = (o.textContent || '').trim();
        if (text === v || text.includes(v)) { chosen = o.value; break; }
      }
      if (chosen) {
        s.value = chosen;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    value
  );
}

function pick(cfg, candidates, fallback = '') {
  for (const c of candidates) {
    const key = (c || '').toString().trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
    if (cfg[key] !== undefined && cfg[key] !== '') return cfg[key];
  }
  return fallback;
}

module.exports = {
  normalizeForCompare,
  waitAspNetStable,
  setInput,
  selectByValueOrText,
  pick,
};



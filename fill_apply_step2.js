// fill_apply_step2.js
// 專責步驟二（基本資料）填寫：申請人、領隊、隊員、留守人

const path = require('path');
const readline = require('readline');
const { loadHikeExcelData } = require('./fill_apply_data');
const { handleCaptchaSimplified } = require('./captcha_handler');

// 從主檔引用 helper（避免重複程式碼）
const {
  waitAspNetStable,
  setInput,
  selectByValueOrText,
  normalizeForCompare,
  pick,
} = require('./fill_apply_shared');

async function safeStep(label, fn) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[Step2] ${label} 開始`);
    const result = await fn();
    // eslint-disable-next-line no-console
    console.log(`[Step2] ${label} 完成`);
    return result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Step2] ${label} 失敗:`, err);
    throw err;
  }
}

async function clickAndExpand(page, headerButtonSelector, panelSelector) {
  const btn = page.locator(headerButtonSelector);
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  const panel = page.locator(panelSelector);
  const isOpen = await panel.evaluate(el => el.classList.contains('show')).catch(() => false);
  if (!isOpen) {
    await btn.click();
    await waitAspNetStable(page);
    await page.waitForTimeout(200);
  }
}

async function selectFirstVisible(section, valueText) {
  // 選擇區塊中的第一個可見 select，按文字模糊比對
  const sel = section.locator('select:visible').first();
  if (await sel.count() === 0) return false;
  await sel.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  try {
    await sel.evaluate((el, tRaw) => {
      const norm = (s) => (s||'').toString().replace(/\s+/g,'').replace(/[()（）·・,，-]/g,'').replace(/臺/g,'台').trim();
      const want = norm(tRaw);
      const s = /** @type {HTMLSelectElement} */(el);
      let chosen = '';
      for (const o of Array.from(s.options)) {
        const txt = (o.textContent||'').trim();
        if (txt === tRaw || txt.includes(tRaw) || norm(txt).includes(want)) { chosen = o.value; break; }
      }
      if (chosen) { s.value = chosen; s.dispatchEvent(new Event('change', { bubbles: true })); return true; }
      return false;
    }, String(valueText));
    return true;
  } catch (_) { return false; }
}

async function findSelectByOptionText(section, optionText) {
  const selects = section.locator('select:visible');
  const n = await selects.count();
  for (let i = 0; i < n; i++) {
    const s = selects.nth(i);
    const has = await s.evaluate((el, t) => {
      const norm = (s) => (s||'').toString().replace(/\s+/g,'').replace(/[()（）·・,，-]/g,'').replace(/臺/g,'台').trim();
      const want = norm(t);
      const sel = /** @type {HTMLSelectElement} */(el);
      return Array.from(sel.options).some(o => {
        const txt = (o.textContent||'').trim();
        return txt === t || txt.includes(t) || norm(txt).includes(want);
      });
    }, String(optionText));
    if (has) return s;
  }
  return null;
}

async function setSelectLocatorByText(selectLocator, text) {
  try {
    await selectLocator.waitFor({ state: 'visible', timeout: 6000 });
    await selectLocator.evaluate((el, tRaw) => {
      const norm = (s) => (s||'').toString().replace(/\s+/g,'').replace(/[()（）·・,，-]/g,'').replace(/臺/g,'台').trim();
      const want = norm(tRaw);
      const s = /** @type {HTMLSelectElement} */(el);
      let chosen = '';
      for (const o of Array.from(s.options)) {
        const txt = (o.textContent||'').trim();
        if (txt === tRaw || txt.includes(tRaw) || norm(txt).includes(want)) { chosen = o.value; break; }
      }
      if (chosen) { s.value = chosen; s.dispatchEvent(new Event('change', { bubbles:true })); }
    }, String(text));
    return true;
  } catch (e) {
    console.warn('[Step2] setSelectLocatorByText 失敗', await selectLocator.evaluate(el=>el.id).catch(()=>'<unknown>'), text);
    return false;
  }
}

async function selectMemberDropdown(page, preferredSelector, section, text, idSuffixForRow, retries = 3) {
  if (!text) return false;
  for (let i = 0; i < retries; i++) {
    // 1) 靜默嘗試用指定 selector（不輸出錯誤）
    try {
      const selExists = await page.locator(preferredSelector).count() > 0;
      if (selExists) {
        await selectByTextNormalized(page, preferredSelector, text);
        return true;
      }
    } catch (_) {}
    
    // 2) 嘗試以 id 後綴精準鎖定同一列的 select
    try {
      const byIdSuffix = section.locator(`select[id$="${idSuffixForRow}"]`).first();
      if (await byIdSuffix.count()) {
        const ok = await setSelectLocatorByText(byIdSuffix, text);
        if (ok) return true;
      }
    } catch (_) {}
    
    // 3) 後援：在 section 內找任何包含該選項的 select
    try {
      const anySel = await findSelectByOptionText(section, text);
      if (anySel) {
        const ok = await setSelectLocatorByText(anySel, text);
        if (ok) return true;
      }
    } catch (_) {}
    
    // 恢復原本的重試間隔
    await page.waitForTimeout(150);
  }
  return false;
}

async function setDateInput(page, selector, yyyyMmDd) {
  if (!yyyyMmDd) return;
  await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
  await page.$eval(
    selector,
    (el, v) => {
      el.removeAttribute('readonly');
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    },
    String(yyyyMmDd)
  );
}

async function waitSelectPopulated(page, selector, minOptions = 2, timeoutMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const count = await page.$eval(selector, el => (/** @type {HTMLSelectElement} */(el)).options.length);
      if (count >= minOptions) return true;
    } catch (_) {}
    await page.waitForTimeout(150); // 恢復原本的檢查間隔
  }
  return false;
}

async function selectByTextNormalized(page, selector, want) {
  if (!want) return;
  await page.waitForSelector(selector, { state: 'visible', timeout: 1000 });
  const raw = String(want).trim();
  const targetNorm = normalizeForCompare(raw);
  await page.$eval(
    selector,
    (el, args) => {
      const { tRaw, tNorm } = args;
      const s = /** @type {HTMLSelectElement} */(el);
      const norm = (str) => (str || '').toString().replace(/\s+/g, '').replace(/[()（）·・,，-]/g, '').replace(/臺/g,'台').trim();
      let chosen = '';
      for (const o of Array.from(s.options)) {
        const txt = (o.textContent || '').trim();
        if (txt === tRaw || txt.includes(tRaw) || norm(txt).includes(tNorm)) {
          chosen = o.value; break;
        }
      }
      if (chosen) {
        s.value = chosen;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
    },
    { tRaw: raw, tNorm: targetNorm }
  );
}

function p(cfg, names, f = '') { return pick(cfg, names, f); }

// 將各工作表（Applicant/Leader/Members/Stay）共通欄位名稱映射為統一鍵
function mapPersonCommon(row) {
  return {
    name: p(row, ['姓名', 'name']),
    nation: p(row, ['國籍', 'nation']),
    sid: p(row, ['身分證或護照號碼', 'sid', '證號', '身分證', '身分證號', '護照號碼', 'passport', '居留證']),
    sex: p(row, ['性別', 'sex']),
    birthday: p(row, ['生日(yyyy-mm-dd)', '生日', 'birthday']),
    tel: p(row, ['電話', 'tel']),
    mobile: p(row, ['手機', 'mobile']),
    email: p(row, ['Email', 'email', '電子郵件', 'e-mail']),
    county: p(row, ['縣市', 'county']),
    district: p(row, ['鄉鎮區', '區', 'district']),
    addr: p(row, ['其餘地址', '地址', 'addr']),
    emergencyName: p(row, ['緊急聯絡人', '緊急連絡人', 'emergencycontactname', 'emergencycontactperson', 'contactname']),
    emergencyTel: p(row, ['緊急聯絡電話', '緊急連絡電話', 'emergencycontacttel', 'contacttel']),
    fax: p(row, ['fax', '傳真']),
  };
}

function deriveSexFromSid(sid) {
  if (!sid) return '';
  const s = String(sid).toUpperCase();
  const ch = s.length > 1 ? s[1] : '';
  if (ch === '1' || ch === 'A' || ch === 'C') return '男';
  if (ch === '2' || ch === 'B' || ch === 'D') return '女';
  return '';
}

async function getInputValue(page, selector) {
  try { return await page.$eval(selector, el => el.value); } catch { return ''; }
}

async function waitSexAutoFillOrSet(page, sexSelector, nationSelector, sidSelector, fallbackSexText) {
  // 若國籍為中華民國且已輸入證號，前端 blur 會自動帶入性別
  const nation = await getInputValue(page, nationSelector);
  const sidVal = await getInputValue(page, sidSelector);
  if (nation === '中華民國' && sidVal) {
    // 等待自動帶入
    for (let i = 0; i < 4; i++) {
      const cur = await getInputValue(page, sexSelector);
      if (cur) return true;
      await page.waitForTimeout(200);
    }
    // 後援：依證號第二碼推斷
    const derived = deriveSexFromSid(sidVal);
    if (derived) {
      try { await page.selectOption(sexSelector, { label: derived }); return true; } catch {}
    }
  }
  // 最後才用 Excel 性別
  if (fallbackSexText) {
    try { await page.selectOption(sexSelector, { label: fallbackSexText }); return true; } catch {}
  }
  return false;
}

async function selectTextWithRetry(page, selector, text, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await selectByTextNormalized(page, selector, text);
      const ok = await page.$eval(selector, (el, want) => {
        const norm = (s) => (s||'').toString().replace(/\s+/g,'').replace(/[()（）·・,，-]/g,'').replace(/臺/g,'台').trim();
        const s = /** @type {HTMLSelectElement} */(el);
        const picked = s.options[s.selectedIndex]?.textContent?.trim() || '';
        return picked === want || picked.includes(want) || norm(picked) === norm(want);
      }, String(text));
      if (ok) return true;
    } catch (_) {}
    await page.waitForTimeout(200);
  }
  console.warn('[Step2] selectTextWithRetry 失敗:', selector, text);
  return false;
}

async function setInputWithVerify(page, selector, value, retries = 2) {
  const val = String(value);
  for (let i = 0; i < retries; i++) {
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout: 1500 });
      await page.fill(selector, '');
      await page.type(selector, val);
      const ok = await page.$eval(selector, (el, want) => (el.value || '') === want, val);
      if (ok) return true;
    } catch (_) {}
    await page.waitForTimeout(150);
  }
  console.warn('[Step2] setInputWithVerify 失敗:', selector, value);
  return false;
}

async function fillApplicant(page, cfg) {
  await clickAndExpand(page, '#heading_01 button', '#collapse_01');
  const agree = page.locator('#con_applycheck');
  if (await agree.count()) {
    const checked = await agree.isChecked().catch(() => false);
    if (!checked) { await agree.check({ force: true }); await waitAspNetStable(page); }
  }
  const { name, tel, mobile, email, nation, sid, sex, birthday, county, district, addr, emergencyName, emergencyTel } = mapPersonCommon(cfg);

  try { if (name) await setInput(page, '#con_apply_name', name); } catch (_) {}
  // 電話與手機為獨立欄位，分別填寫
  try { if (tel) await setInput(page, '#con_apply_tel', tel); } catch (_) {}
  try { if (mobile) await setInput(page, '#con_apply_mobile', mobile); } catch (_) {}
  try { if (email) await setInput(page, '#con_apply_email', email); } catch (_) {}
  // 先選國籍再填證號（採用與領隊一致的後援策略）
  if (nation) {
    let okNation = true;
    try { await selectByTextNormalized(page, '#con_apply_nation', nation); } catch { okNation = false; }
    if (!okNation) {
      const section = page.locator('#collapse_01');
      const selNat = await findSelectByOptionText(section, nation || '中華民國');
      if (selNat) {
        await selNat.evaluate((el, tRaw) => {
          const norm = (s) => (s||'').toString().replace(/\s+/g,'').replace(/[()（）·・,，-]/g,'').replace(/臺/g,'台').trim();
          const want = norm(tRaw);
          const s = /** @type {HTMLSelectElement} */(el);
          let chosen = '';
          for (const o of Array.from(s.options)) {
            const txt = (o.textContent||'').trim();
            if (txt === tRaw || txt.includes(tRaw) || norm(txt).includes(want)) { chosen = o.value; break; }
          }
          if (chosen) { s.value = chosen; s.dispatchEvent(new Event('change', { bubbles:true })); }
        }, String(nation));
      }
    }
    await waitAspNetStable(page);
    await page.waitForTimeout(200);
  }
  try { if (sid) {
    await setInputWithVerify(page, '#con_apply_sid', sid);
    // 觸發 blur 以啟動前端自動性別帶入邏輯
    await page.focus('#con_apply_sid');
    await page.keyboard.press('Tab');
  } } catch (_) {}
  // 等待自動帶入或後援
  {
    const sexText = (sex || '').toString().trim().toUpperCase();
    const sexNorm = sexText === 'M' ? '男' : sexText === 'F' ? '女' : (sex || '');
    const ok = await waitSexAutoFillOrSet(page, '#con_apply_sex', '#con_apply_nation', '#con_apply_sid', sexNorm);
    if (!ok && sexNorm) {
      // 最後的最後再嘗試一次在區塊內找性別下拉
      const section = page.locator('#collapse_01');
      const candidates = await section.locator('select:visible').all();
      for (const cand of candidates) {
        const isSex = await cand.evaluate((el) => {
          const texts = Array.from((/** @type {HTMLSelectElement} */(el)).options).map(o=> (o.textContent||'').trim());
          return texts.includes('男') && texts.includes('女');
        }).catch(()=>false);
        if (isSex) { await setSelectLocatorByText(cand, sexNorm); break; }
      }
    }
  }
  try { if (birthday) await setDateInput(page, '#con_apply_birthday', birthday); } catch (_) {
    // 後援：Wdate 輸入框
    const section = page.locator('#collapse_01');
    const wdate = section.locator('input.Wdate:visible').first();
    if (await wdate.count()) {
      await wdate.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('change', { bubbles:true })); el.dispatchEvent(new Event('input', { bubbles:true })); }, String(birthday));
    }
  }
  try {
    if (county) {
      // 主選：指定 ID；後援：申請人區塊第一個 select
      let ok = true;
      try { await selectByTextNormalized(page, '#con_ddlapply_country', county); } catch { ok = false; }
      if (!ok) {
        const section = page.locator('#collapse_01');
        await selectFirstVisible(section, county);
      }
      await waitAspNetStable(page);
      await page.waitForTimeout(300);
    }
  } catch (_) {}
  try {
    if (district) {
      let ok = true;
      try { await selectByTextNormalized(page, '#con_ddlapply_city', district); } catch { ok = false; }
      if (!ok) {
        const section = page.locator('#collapse_01');
        const selects = section.locator('select:visible');
        const count = await selects.count();
        if (count >= 2) {
          const second = selects.nth(1);
          await second.evaluate((el, tRaw) => {
            const norm = (s) => (s||'').toString().replace(/\s+/g,'').replace(/[()（）·・,，-]/g,'').replace(/臺/g,'台').trim();
            const want = norm(tRaw);
            const s = /** @type {HTMLSelectElement} */(el);
            let chosen = '';
            for (const o of Array.from(s.options)) {
              const txt = (o.textContent||'').trim();
              if (txt === tRaw || txt.includes(tRaw) || norm(txt).includes(want)) { chosen = o.value; break; }
            }
            if (chosen) { s.value = chosen; s.dispatchEvent(new Event('change', { bubbles:true })); }
          }, String(district));
        }
      }
    }
  } catch (_) {}
  try { if (addr) await setInput(page, '#con_apply_addr', addr); } catch (_) {}
  // 申請人緊急聯絡人（若頁面提供對應欄位）
  try { if (emergencyName) await setInput(page, '#con_apply_contactname', emergencyName); } catch (_) {}
  try { if (emergencyTel) await setInput(page, '#con_apply_contacttel', emergencyTel); } catch (_) {}
}

async function fillLeader(page, cfg) {
  await clickAndExpand(page, '#heading_02 button', '#collapse_02');
  const copyApply = p(cfg, ['LeaderSameAsApplicant','領隊同申請人','LeaderCopyApply']);
  if (String(copyApply).trim() === '1' || String(copyApply).trim() === 'true') {
    const cb = page.locator('#con_copyapply');
    if (await cb.count()) { await cb.check({ force: true }); await waitAspNetStable(page); }
    return;
  }

  const { name, tel, mobile, email, nation, sid, sex, birthday, county, district, addr, emergencyName, emergencyTel, fax } = mapPersonCommon(cfg);

  if (name) await setInput(page, '#con_leader_name', name);
  if (tel) await setInput(page, '#con_leader_tel', tel);

  // 先選國籍再填證號，避免之後 PostBack 清空已填欄位
  if (nation) {
    let okNation = true;
    try { await selectByTextNormalized(page, '#con_leader_nation', nation); } catch { okNation = false; }
    if (!okNation) {
      const section = page.locator('#collapse_02');
      const selNat = await findSelectByOptionText(section, nation || '中華民國');
      if (selNat) {
        await selNat.evaluate((el, tRaw) => {
          const norm = (s) => (s||'').toString().replace(/\s+/g,'').replace(/[()（）·・,，-]/g,'').replace(/臺/g,'台').trim();
          const want = norm(tRaw);
          const s = /** @type {HTMLSelectElement} */(el);
          let chosen = '';
          for (const o of Array.from(s.options)) {
            const txt = (o.textContent||'').trim();
            if (txt === tRaw || txt.includes(tRaw) || norm(txt).includes(want)) { chosen = o.value; break; }
          }
          if (chosen) { s.value = chosen; s.dispatchEvent(new Event('change', { bubbles:true })); }
        }, String(nation));
      }
    }
    await waitAspNetStable(page);
    await page.waitForTimeout(200);
  }
  if (sid) {
    await setInputWithVerify(page, '#con_leader_sid', sid);
    await page.focus('#con_leader_sid');
    await page.keyboard.press('Tab');
  }
  {
    const leaderSexText = (sex || '').toString().trim().toUpperCase();
    const leaderSexNorm = leaderSexText === 'M' ? '男' : leaderSexText === 'F' ? '女' : (sex || '');
    const ok = await waitSexAutoFillOrSet(page, '#con_leader_sex', '#con_leader_nation', '#con_leader_sid', leaderSexNorm);
    if (!ok && leaderSexNorm) {
      const section = page.locator('#collapse_02');
      const candidates = await section.locator('select:visible').all();
      for (const cand of candidates) {
        const isSex = await cand.evaluate((el) => {
          const texts = Array.from((/** @type {HTMLSelectElement} */(el)).options).map(o=> (o.textContent||'').trim());
          return texts.includes('男') && texts.includes('女');
        }).catch(()=>false);
        if (isSex) { await setSelectLocatorByText(cand, leaderSexNorm); break; }
      }
    }
  }
  if (birthday) await setDateInput(page, '#con_leader_birthday', birthday).catch(()=>{
    const section = page.locator('#collapse_02');
    const wdate = section.locator('input.Wdate:visible').first();
    return wdate.count().then(async c => { if (c) await wdate.evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event('change', { bubbles:true })); el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('blur', { bubbles:true })); }, String(birthday)); });
  });
  if (county) {
    let ok = true;
    try { await selectByTextNormalized(page, '#con_ddlleader_country', county); } catch { ok = false; }
    if (!ok) {
      const section = page.locator('#collapse_02');
      await selectFirstVisible(section, county);
    }
    await waitAspNetStable(page);
    await page.waitForTimeout(300);
  }
  if (district) {
    let ok = true;
    try { await selectByTextNormalized(page, '#con_ddlleader_city', district); } catch { ok = false; }
    if (!ok) {
      const section = page.locator('#collapse_02');
      const selects = section.locator('select:visible');
      if (await selects.count() >= 2) {
        const second = selects.nth(1);
        await second.evaluate((el, tRaw) => {
          const norm = (s) => (s||'').toString().replace(/\s+/g,'').replace(/[()（）·・,，-]/g,'').replace(/臺/g,'台').trim();
          const want = norm(tRaw);
          const s = /** @type {HTMLSelectElement} */(el);
          let chosen = '';
          for (const o of Array.from(s.options)) {
            const txt = (o.textContent||'').trim();
            if (txt === tRaw || txt.includes(tRaw) || norm(txt).includes(want)) { chosen = o.value; break; }
          }
          if (chosen) { s.value = chosen; s.dispatchEvent(new Event('change', { bubbles:true })); }
        }, String(district));
      }
    }
  }
  if (addr) await setInput(page, '#con_leader_addr', addr);
  if (mobile) await setInput(page, '#con_leader_mobile', mobile);
  if (fax) await setInput(page, '#con_leader_fax', fax);
  if (email) await setInput(page, '#con_leader_email', email);
  if (emergencyName) await setInput(page, '#con_leader_contactname', emergencyName);
  if (emergencyTel) await setInput(page, '#con_leader_contacttel', emergencyTel);
}

async function ensureMembersCount(page, want) {
  const container = page.locator('#con_pInsMember');
  await container.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
  const addBtn = page.locator('#con_lbInsMember');
  
  // 快速清點目前已存在的隊員表單行數
  let count = await container.locator('[id^="con_lisMem_member_name_"]').count();
  console.log(`[Step2] 目前隊員表單數量: ${count}, 需要: ${want}`);
  
  // 批量新增隊員，減少等待時間
  for (let i = count; i < want; i++) {
    if (!(await addBtn.count())) break;
    
    // 直接點擊，不等待ASP.NET穩定，提高速度
    await addBtn.click();
    
    // 恢復原本的等待時間
    await page.waitForTimeout(200);
  }
  
  // 最後一次性等待ASP.NET穩定
  await waitAspNetStable(page);
  
  // 展開全部隊員，確保欄位可見
  try { 
    await page.click('.member_btn_o'); 
    console.log(`[Step2] 隊員表單準備完成，共 ${want} 個`);
  } catch (_) {}
}

async function fillMemberFast(page, member, idx) {
  const idxStr = String(idx);
  const base = `#con_lisMem_member_`;
  const nameSel = `${base}name_${idxStr}`;
  const telSel = `${base}tel_${idxStr}`;
  const mobileSel = `${base}mobile_${idxStr}`;
  const emailSel = `${base}email_${idxStr}`;
  const nationSel = `${base}nation_${idxStr}`;
  const sidSel = `${base}sid_${idxStr}`;
  const sexSel = `${base}sex_${idxStr}`;
  const birthSel = `${base}birthday_${idxStr}`;
  const countrySel = `${base}country_${idxStr}`;
  const citySel = `${base}city_${idxStr}`;
  const addrSel = `${base}addr_${idxStr}`;
  const emerNameSel = `${base}contactname_${idxStr}`;
  const emerTelSel = `${base}contacttel_${idxStr}`;
  const rowSection = page.locator('#collapse_03');

  const { name, tel, mobile, email, nation, sid, sex, birthday, county, district, addr,
          emergencyName, emergencyTel } = mapPersonCommon(member);

  try { if (name) await setInputWithVerify(page, nameSel, name); } catch (_) {}
  const resolvedTelM = tel || mobile || '';
  const resolvedMobileM = mobile || tel || '';
  try { if (resolvedTelM) await setInputWithVerify(page, telSel, resolvedTelM); } catch (_) {}
  try { if (resolvedMobileM) await setInputWithVerify(page, mobileSel, resolvedMobileM); } catch (_) {}
  try { if (email) await setInputWithVerify(page, emailSel, email); } catch (_) {}

  // 國籍：若 Excel 未填但有 SID，預設中華民國，確保自動性別機制可運作
  const memberNation = (normalizeForCompare(nation) || (sid ? '中華民國' : ''));
  if (memberNation) {
    await selectByTextNormalized(page, nationSel, memberNation).catch(()=>{});
    await waitAspNetStable(page);
  }

  // SID -> 觸發自動性別（若國籍為中華民國）或後援
  if (sid) {
    await setInputWithVerify(page, sidSel, sid).catch(()=>{});
    try { await page.focus(sidSel); await page.keyboard.press('Tab'); } catch (_) {}
  }
  // 若性別仍未帶入，回退 Excel 性別值
  try { if (sex) await selectByTextNormalized(page, sexSel, sex); } catch (_) {}

  // 生日
  try {
    if (birthday) {
      await setDateInput(page, birthSel, birthday);
    }
  } catch (_) {
    // 快版忽略後援，避免額外搜尋
  }

  // 地址：縣市 -> 等待 -> 鄉鎮區 -> 其餘地址
  try {
    if (county) {
      // 直接使用已驗證成功的 selectMemberDropdown 方案
      const okCounty = await selectMemberDropdown(page, countrySel, rowSection, county, `country_${idxStr}`, 1);
      if (okCounty) {
        await waitAspNetStable(page);
        await waitSelectPopulated(page, citySel, 2, 1000);
        await page.waitForTimeout(100);
      } else {
        console.warn(`[Members] country 選取失敗 idx=${idx}, selector=${countrySel}, text=${county}`);
      }
    }
  } catch (_) {}
  try {
    if (district) {
      // 直接使用已驗證成功的 selectMemberDropdown 方案
      const okCity = await selectMemberDropdown(page, citySel, rowSection, district, `city_${idxStr}`, 1);
      if (!okCity) {
        console.warn(`[Members] city 選取失敗 idx=${idx}, selector=${citySel}, text=${district}`);
      }
    }
  } catch (_) {}
  try { if (addr) await setInputWithVerify(page, addrSel, addr); } catch (_) {}

  // 緊急連絡資訊：比照領隊，移除寫入 rel 的後援，避免誤寫其他欄
  if (emergencyName) {
    let okName = await setInputWithVerify(page, emerNameSel, emergencyName);
    if (!okName) {
      const alt = `#collapse_03 input[id$="contactname_${idxStr}"]`;
      okName = await setInputWithVerify(page, alt, emergencyName);
    }
    // 快版不主動 blur，避免被即時驗證清空；驗證延後到送出時
  }
  if (emergencyTel) {
    let okTel = await setInputWithVerify(page, emerTelSel, emergencyTel);
    if (!okTel) {
      const alt = `#collapse_03 input[id$="contacttel_${idxStr}"]`;
      okTel = await setInputWithVerify(page, alt, emergencyTel);
    }
    // 同上，不主動 blur
  }
}

async function fillMembers(page, members) {
  if (!Array.isArray(members) || members.length === 0) return;
  await clickAndExpand(page, '#heading_03 button', '#collapse_03');
  await ensureMembersCount(page, members.length);
  let ok = 0;
  for (let i = 0; i < members.length; i++) {
    try {
      await safeStep(`填寫隊員#${i+1}`, async () => {
        await fillMemberFast(page, members[i], i);
      });
      ok += 1;
    } catch (_) {}
  }
  // eslint-disable-next-line no-console
  console.log(`[Step2] Members 填寫完成 ${ok}/${members.length}`);
}

async function fillStay(page, cfg) {
  await clickAndExpand(page, '#heading_04 button', '#collapse_04');
  const copyApply = p(cfg, ['StaySameAsApplicant','留守人同申請人','StayCopyApply']);
  if (String(copyApply).trim() === '1' || String(copyApply).trim() === 'true') {
    const cb = page.locator('#con_copyapply2');
    if (await cb.count()) { await cb.check({ force: true }); await waitAspNetStable(page); }
    return;
  }

  // 重要：資料檔（除 Config 外）各分頁欄位名稱一致，直接用共用映射
  const { name, mobile, fax, email, birthday, nation, sid } = mapPersonCommon(cfg);

  if (name) await setInput(page, '#con_stay_name', name);
  // 依需求：網頁「手機(或電話)」以 Excel「手機」欄位為主
  if (mobile) await setInput(page, '#con_stay_mobile', mobile);
  if (fax) await setInput(page, '#con_stay_fax', fax);
  if (email) await setInput(page, '#con_stay_email', email);
  if (birthday) await setDateInput(page, '#con_stay_birthday', birthday);
  if (nation) { await selectByTextNormalized(page, '#con_stay_nation', nation); await waitAspNetStable(page); }
  if (sid) await setInput(page, '#con_stay_sid', sid);
}

async function clickNextStepButton(page) {
  try {
    // 等待頁面穩定
    await waitAspNetStable(page);
    
    // 嘗試多種可能的「下一步」按鈕選擇器，從最精確的開始
    const nextButtonSelectors = [
      '#con_btnToStep31',  // 最精確的 ID 選擇器
      'a[id="con_btnToStep31"]',
      'a.btn.btn-main:has-text("下一步")',
      'a[href*="btnToStep31"]',
      'input[type="submit"][value*="下一步"]',
      'input[type="button"][value*="下一步"]', 
      'button:has-text("下一步")',
      'a:has-text("下一步")',
      'input[value="下一步"]'
    ];
    
    let clicked = false;
    
    for (const selector of nextButtonSelectors) {
      try {
        const button = page.locator(selector);
        if (await button.count() > 0 && await button.isVisible()) {
          console.log(`✅ 找到「下一步」按鈕: ${selector}`);
          
          // 對於 ASP.NET __doPostBack 連結，確保點擊能正確觸發
          if (selector === '#con_btnToStep31') {
            // 直接點擊或執行 JavaScript
            await button.click({ force: true });
            // 備案：如果普通點擊無效，執行頁面中的 JavaScript
            await page.waitForTimeout(500);
            const stillOnPage = await page.locator('#con_btnToStep31').count() > 0;
            if (stillOnPage) {
              console.log('🔄 嘗試執行 ASP.NET PostBack...');
              await page.evaluate(() => {
                __doPostBack('ctl00$con$btnToStep31', '');
              });
            }
          } else {
            await button.click();
          }
          
          clicked = true;
          break;
        }
      } catch (err) {
        // 繼續嘗試下一個選擇器
      }
    }
    
    if (!clicked) {
      console.warn('⚠️ 未找到「下一步」按鈕，請手動點擊');
      return;
    }
    
    // 等待頁面跳轉
    console.log('🔄 等待頁面跳轉到下一步...');
    await waitAspNetStable(page);
    await page.waitForLoadState('networkidle');
    
    console.log('✅ 已進入下一頁');
    
    // 檢查是否進入最後送件頁面
    const isSubmitPage = await page.locator('#con_vcode').count() > 0; // 驗證碼欄位
    const submitButtonExists = await page.locator('#con_btnsave').count() > 0; // 確認送出按鈕
    
    if (isSubmitPage && submitButtonExists) {
      console.log('📋 已進入最後送件頁面，準備處理驗證碼...');
      const isDryRun = process.env.DRY_RUN === 'true';
      const success = await handleCaptchaSimplified(page, isDryRun);
      
      if (!success) {
        throw new Error('驗證碼處理失敗或申請未成功');
      }
      
      console.log('✅ 申請成功，準備進行下一步');
    } else {
      console.log('📍 已進入下一頁，程式暫停');
      console.log('📍 您可以手動檢查頁面內容或繼續下一步操作');
      console.log('⏸️ 程式已暫停，按 Ctrl+C 可中斷程式');
    }
    
  } catch (err) {
    console.error('❌ 點擊「下一步」按鈕失敗:', err);
    throw err;
  }
}







// 支援直接傳遞資料物件的版本
async function fillStep2FromData(page, data) {
  console.log('[Step2] 使用提供的資料物件');
  
  // 完全沿用原本 fillStep2FromExcel 的邏輯
  await page.waitForURL(/apply_1_4\.aspx/i, { timeout: 20000 });
  await page.waitForSelector('[data-step="1"].active, .step_bar4 [data-step="1"].active', { timeout: 15000 }).catch(() => {});

  const { applicant, leader, stay, members, __meta } = data;

  // 檢查各分頁資料是否正常（輸出警告但不阻斷）
  if (!applicant || Object.keys(applicant).length === 0) console.warn('[Step2] Applicant 分頁為空。Sheets:', __meta?.sheets);
  if (!leader || Object.keys(leader).length === 0) console.warn('[Step2] Leader 分頁為空。Sheets:', __meta?.sheets);
  if (!stay || Object.keys(stay).length === 0) console.warn('[Step2] Stay 分頁為空。Sheets:', __meta?.sheets);
  if (!Array.isArray(members) || members.length === 0) console.warn('[Step2] Members 分頁為空或未偵測。Sheets:', __meta?.sheets);

  await safeStep('申請人', async () => { await fillApplicant(page, applicant); }).catch(()=>{});
  await safeStep('領隊', async () => { await fillLeader(page, leader); }).catch(()=>{});
  await safeStep('隊員', async () => { await fillMembers(page, members); }).catch(()=>{});
  await safeStep('留守人', async () => { await fillStay(page, stay); }).catch(()=>{});

  console.log('✅ Step 2 基本資料已填入（未送出）。');

  // 點擊右下角的「下一步」按鈕進入下一頁
  console.log('🔄 準備點擊「下一步」按鈕...');
  await clickNextStepButton(page);
}

module.exports = {
  fillStep2FromData,
};



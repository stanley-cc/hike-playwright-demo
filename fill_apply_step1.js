// fill_apply_step1.js (CommonJS + Playwright)
const path = require('path');
const { loadHikeExcelData } = require('./fill_apply_data');
const {
  waitAspNetStable,
  setInput,
  selectByValueOrText,
  normalizeForCompare,
  pick,
} = require('./fill_apply_shared');

function normalizeKey(s) { return (s || '').toString().trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, ''); }

async function chooseEntryDateFromDropdown(page, desiredText) {
  const container = page.locator('#con_upApplydate');
  await container.waitFor({ state: 'visible', timeout: 10000 });
  const dateSelect = container.locator('select');
  await dateSelect.first().waitFor({ state: 'visible', timeout: 15000 });
  
  if (desiredText) {
    // 先獲取所有可用的日期選項，用於除錯
    const availableOptions = await dateSelect.first().evaluate((sel) => {
      const s = /** @type {HTMLSelectElement} */(sel);
      return Array.from(s.options)
        .filter(o => o.value && o.value.trim() !== '')
        .map(o => ({ value: o.value, text: (o.textContent || '').trim() }));
    });
    
    const success = await dateSelect.first().evaluate((sel, want) => {
      const s = /** @type {HTMLSelectElement} */(sel);
      const target = String(want).trim();
      let foundVal = '';
      for (const o of Array.from(s.options)) {
        const t = (o.textContent || '').trim();
        if (t === target || t.includes(target)) { foundVal = o.value; break; }
      }
      if (foundVal) {
        s.value = foundVal;
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }, String(desiredText));
    
    // 如果找不到指定日期，報錯並終止程式
    if (!success) {
      console.error('❌ 入園日期選擇失敗！');
      console.error(`📅 指定的入園日期: "${desiredText}"`);
      console.error('📋 下拉選單中可用的日期選項:');
      availableOptions.forEach((opt, index) => {
        console.error(`   ${index + 1}. "${opt.text}" (value: "${opt.value}")`);
      });
      console.error('');
      console.error('💡 可能的原因:');
      console.error('   - 指定的日期不在可申請的日期範圍內');
      console.error('   - 日期格式不匹配 (Excel格式 vs 網頁格式)');
      console.error('   - 該日期的名額已滿或不開放申請');
      console.error('');
      console.error('🔧 建議解決方法:');
      console.error('   - 檢查 Excel 中的入園日期是否正確');
      console.error('   - 確認該日期是否在玉山國家公園開放申請的範圍內');
      console.error('   - 嘗試選擇上方列出的其他可用日期');
      
      throw new Error(`找不到指定的入園日期 "${desiredText}"，程式已終止以避免選擇錯誤的日期。請檢查上方的詳細錯誤訊息。`);
    }
    
    console.log(`✅ 成功選擇入園日期: "${desiredText}"`);
  } else {
    // 如果沒有指定日期，選擇第一個可用選項
    await dateSelect.first().evaluate((sel) => {
      const s = /** @type {HTMLSelectElement} */(sel);
      const opt = Array.from(s.options).find((o) => o.value && o.value.trim() !== '');
      if (opt) { s.value = opt.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    console.log('⚠️ 未指定入園日期，已選擇第一個可用選項');
  }
  await waitAspNetStable(page);
}

function getRoutePlanSection(page) {
  const title = page.locator('.block_title:has-text("路線規劃")');
  return title.locator('xpath=following-sibling::*[contains(@class,"card_main")][1]');
}

async function chooseNextPointInRoute(page, pointText) {
  const section = getRoutePlanSection(page);
  await section.waitFor({ state: 'visible', timeout: 10000 });
  const target = String(pointText).trim();
  const targetNorm = normalizeForCompare(target);
  const clickedCard = await section.evaluate((root, tNorm, tRaw) => {
    const norm = (str) => (str || '').toString().replace(/\s+/g, '').replace(/[()（）·・,，-]/g, '').trim();
    const textOf = (el) => (el.innerText || el.textContent || '').trim();
    const isExcluded = (txt) => {
      const n = norm(txt);
      return n.includes('完成路線') || n.includes('完成') || n.includes('返回上個地點') || n.includes('重新規劃') || n.includes('查看') || n.includes('查詢');
    };
    const labelCandidates = Array.from(root.querySelectorAll('label'));
    for (const el of labelCandidates) {
      const txt = textOf(el);
      const n = norm(txt);
      if (!txt || isExcluded(txt)) continue;
      if (txt === tRaw || txt.includes(tRaw) || n.includes(tNorm)) { el.click(); return true; }
    }
    const btnCandidates = Array.from(root.querySelectorAll('button, a, .btn, .badge, .tag, [role="button"], .list-group-item, .option, .route_btn'));
    for (const el of btnCandidates) {
      const txt = textOf(el);
      const n = norm(txt);
      if (!txt || isExcluded(txt)) continue;
      if (txt === tRaw || txt.includes(tRaw) || n.includes(tNorm)) { el.click(); return true; }
    }
    const inputCandidates = Array.from(root.querySelectorAll('input[type="radio"], input[type="button"], input[type="submit"]'));
    for (const el of inputCandidates) {
      const txt = (el.value || '').trim();
      const n = norm(txt);
      if (!txt || isExcluded(txt)) continue;
      if (txt === tRaw || txt.includes(tRaw) || n.includes(tNorm)) { el.click(); return true; }
    }
    return false;
  }, targetNorm, target);
  if (clickedCard) { await waitAspNetStable(page); await page.waitForTimeout(300); return; }
  const candidates = await section.evaluate((root) => {
    const textOf = (el) => (el.innerText || el.textContent || '').trim();
    const els = [
      ...Array.from(root.querySelectorAll('label')),
      ...Array.from(root.querySelectorAll('button, a, .btn, .badge, .tag, [role="button"], .list-group-item, .option, .route_btn')),
      ...Array.from(root.querySelectorAll('input[type="radio"], input[type="button"], input[type="submit"]')),
    ];
    return els.map(textOf).filter(Boolean);
  });
  console.warn('⚠️ 目前可見候選（卡片/按鈕/標籤）：', candidates);
  throw new Error(`在路線規劃卡片/按鈕中找不到：「${pointText}」`);
}

async function chooseStartPointByRadio(page, labelContainsText = '排雲登山服務中心') {
  const section = getRoutePlanSection(page);
  await section.waitFor({ state: 'visible', timeout: 10000 });
  const radios = section.locator('input[type=radio]:visible');
  const radioCount = await radios.count();
  if (radioCount === 0) return false;
  const target = String(labelContainsText).trim();
  const labelLocator = section.locator('label:has(input[type=radio])', { hasText: target }).first();
  if (await labelLocator.count()) { await labelLocator.click(); await waitAspNetStable(page); return true; }
  const matched = await section.evaluate((root, targetText) => {
    const normalize = (s) => (s || '').toString().replace(/\s+/g, '').trim();
    const radios = Array.from(root.querySelectorAll('input[type="radio"]'));
    function textForInput(input) {
      if (!input) return '';
      const wrapLabel = input.closest('label');
      if (wrapLabel) return wrapLabel.innerText || wrapLabel.textContent || '';
      const id = input.id;
      if (id) {
        const label = root.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return label.innerText || label.textContent || '';
      }
      let sib = input.nextElementSibling;
      if (sib) return sib.innerText || sib.textContent || '';
      return '';
    }
    const want = normalize(targetText);
    for (const r of radios) { const txt = normalize(textForInput(r)); if (txt.includes(want)) { r.click(); return true; } }
    return false;
  }, target);
  if (matched) { await waitAspNetStable(page); return true; }
  await radios.first().click(); await waitAspNetStable(page); return true;
}

async function finishTodayRoute(page) {
  // 設置對話框處理器
  const dialogPromise = new Promise((resolve) => {
    page.once('dialog', async (dialog) => {
      try {
        await dialog.accept();
        resolve();
      } catch (error) {
        console.log('對話框已被處理或不存在:', error.message);
        resolve();
      }
    });
    // 如果 500ms 內沒有對話框，就繼續
    setTimeout(resolve, 500);
  });
  
  const btn = page.locator('#con_btnover');
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
  
  // 等待對話框處理完成
  await dialogPromise;
  await waitAspNetStable(page);
  await page.waitForTimeout(300);
}

async function planYushan2DaysRoute(page) {
  // 先檢查路線規劃區塊是否存在
  const routePlanTitle = page.locator('.block_title:has-text("路線規劃")');
  const titleExists = await routePlanTitle.count();
  console.log(`[Debug] 路線規劃標題存在: ${titleExists > 0}`);
  
  if (titleExists === 0) {
    // 檢查是否有其他相關的路線規劃元素
    const alternativeSelectors = [
      '.block_title:has-text("路線")',
      '.block_title:has-text("規劃")',
      '[class*="route"]',
      '[id*="route"]',
      '[class*="plan"]'
    ];
    
    for (const sel of alternativeSelectors) {
      const count = await page.locator(sel).count();
      console.log(`[Debug] "${sel}" 找到 ${count} 個元素`);
    }
    
    throw new Error('找不到路線規劃區塊，請檢查頁面是否正確載入');
  }
  
  const section = getRoutePlanSection(page);
  
  // 檢查路線規劃區塊是否可見
  try {
    await section.waitFor({ state: 'visible', timeout: 5000 });
    console.log(`[Debug] 路線規劃區塊已可見`);
  } catch (err) {
    console.warn(`[Debug] 路線規劃區塊等待可見失敗: ${err.message}`);
  }
  
  // 檢查區塊內有什麼元素
  const sectionContent = await section.evaluate((root) => {
    const textOf = (el) => (el.innerText || el.textContent || '').trim();
    const elements = Array.from(root.querySelectorAll('*')).slice(0, 20); // 限制前20個元素
    return elements.map(el => ({
      tag: el.tagName.toLowerCase(),
      text: textOf(el).substring(0, 50), // 限制文字長度
      class: el.className || '',
      id: el.id || ''
    })).filter(info => info.text);
  });
  console.log(`[Debug] 路線規劃區塊內容:`, sectionContent);
  
  const radioOk = await chooseStartPointByRadio(page, '排雲登山服務中心');
  if (!radioOk) {
    // 後援：有些版本直接以卡片/按鈕呈現起點，改用通用點擊法
    try {
      await chooseNextPointInRoute(page, '排雲登山服務中心');
    } catch (err) {
      throw new Error('未偵測到路線起點（radio/卡片），請確認畫面是否有變動');
    }
  }
  
  // 選擇起點後，等待路線選項載入
  await section.locator('select').first().waitFor({ state: 'visible', timeout: 15000 });
  await page.locator('#con_btnover').waitFor({ state: 'visible', timeout: 15000 });
  
  // 額外等待，確保路線選項真正載入
  await page.waitForTimeout(1000);
  await waitAspNetStable(page);
  
  // 等待路線點真正出現在頁面中
  let retryCount = 0;
  const maxRetries = 10;
  let routePointsLoaded = false;
  
  while (retryCount < maxRetries && !routePointsLoaded) {
    const hasRoutePoints = await section.evaluate((root) => {
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const candidates = [
        ...Array.from(root.querySelectorAll('label')),
        ...Array.from(root.querySelectorAll('button, a, .btn, .badge, .tag, [role="button"], .list-group-item, .option, .route_btn')),
      ];
      
      const routeWords = ['塔塔加', '排雲山莊', '玉山', '登山口'];
      return candidates.some(el => {
        const txt = textOf(el);
        return routeWords.some(word => txt.includes(word));
      });
    });
    
    if (hasRoutePoints) {
      routePointsLoaded = true;
      console.log('✅ 路線選項已載入，開始規劃路線...');
      break;
    }
    
    console.log(`⏳ 等待路線選項載入... (${retryCount + 1}/${maxRetries})`);
    await page.waitForTimeout(500);
    retryCount++;
  }
  
  if (!routePointsLoaded) {
    console.warn('⚠️ 路線選項載入超時，嘗試繼續...');
  }
  
  await chooseNextPointInRoute(page, '塔塔加登山口');
  await chooseNextPointInRoute(page, '排雲山莊');
  await finishTodayRoute(page);
  await chooseNextPointInRoute(page, '玉山主峰');
  await chooseNextPointInRoute(page, '排雲山莊');
  await chooseNextPointInRoute(page, '塔塔加登山口');
  await chooseNextPointInRoute(page, '排雲登山服務中心');
  await finishTodayRoute(page);
}

// 支援直接傳遞資料物件的版本
async function fillStep1FromData(page, data) {
  console.log('[Step1][Config] 使用提供的資料物件');
  
  // 直接重用原本成功的邏輯，只是資料來源改為傳入的 data 物件
  const { config, applicant, leader, stay, members, __meta } = data;
  
  // 完全沿用原本 fillStep1FromExcel 的邏輯
  if (!config || Object.keys(config).length === 0) {
    console.error('[Step1] 讀到的 Config 為空，工作表清單：', __meta?.sheets);
  }
  
  // 除錯輸出主要欄位值（協助判斷是否抓到正確 Config）
  try {
    const dbgTeam = pick(config, ['TeamName', '隊名', '隊伍名稱']);
    const dbgMain = pick(config, ['MainRoute', '登山主路線', '主路線', '主線']);
    const dbgSub  = pick(config, ['SubRoute', '次路線', '副路線']);
    const dbgDays = pick(config, ['TotalDays', '登山總日數', '總日數', '天數']);
    const dbgDate = pick(config, ['EntryDate', '入園日期', '入園日', 'StartDate']);
    console.log('[Step1][Config] team=', dbgTeam, ' main=', dbgMain, ' sub=', dbgSub, ' days=', dbgDays, ' entryDate=', dbgDate);
  } catch(_) {}

  await page.waitForURL(/apply_1_4\.aspx/i, { timeout: 15000 });
  const formReady = await Promise.race([
    page.waitForSelector('#con_teams_name', { timeout: 8000 }).then(() => true).catch(() => false),
    page.waitForSelector('#con_climblinemain', { timeout: 8000 }).then(() => true).catch(() => false),
    page.waitForSelector('form[action*="apply_1_4.aspx"]', { timeout: 8000 }).then(() => true).catch(() => false),
  ]);
  if (!formReady) console.warn('⚠️ 未偵測到常見欄位，仍嘗試填表。');

  const teamName  = pick(config, ['TeamName', '隊名', '隊伍名稱']);
  if (!teamName) console.warn('[Step1] Excel 未提供 TeamName/隊名。Config keys =', Object.keys(config||{}));
  const mainRoute = pick(config, ['MainRoute', '登山主路線', '主路線', '主線'], '玉山線');
  const subRoute  = pick(config, ['SubRoute', '次路線', '副路線'], '2~5天(塔塔加 - 玉山線 - 塔塔加)');
  const totalDays = pick(config, ['TotalDays', '登山總日數', '總日數', '天數'], '2');
  const entryDate = pick(config, ['EntryDate', '入園日期', '入園日', 'StartDate']);
  const seminar   = pick(config, ['Seminar', '登山行前講習'], '1');
  const gps       = pick(config, ['GPS', '是否攜帶GPS', '是否攜帶gps'], '1');
  const satPhone  = pick(config, ['SatellitePhone', '衛星電話']);
  const radioFreq = pick(config, ['RadioFrequency', '無線電頻', '頻率']);
  const note      = pick(config, ['Note', '備註']);

  // 完全沿用原本成功的填寫邏輯和順序
  if (teamName) { await setInput(page, '#con_teams_name', teamName); await waitAspNetStable(page); }
  await selectByValueOrText(page, '#con_climblinemain', String(mainRoute)); await waitAspNetStable(page);
  await selectByValueOrText(page, '#con_climbline', String(subRoute)); await waitAspNetStable(page);
  {
    const daysStr = String(totalDays).match(/\d+/)?.[0] ?? String(totalDays);
    await selectByValueOrText(page, '#con_sumday', daysStr);
    await waitAspNetStable(page);
  }
  await chooseEntryDateFromDropdown(page, entryDate);
  await planYushan2DaysRoute(page);
  await selectByValueOrText(page, '#con_seminar', String(seminar));
  await selectByValueOrText(page, '#con_gps', String(gps));
  await waitAspNetStable(page);
  if (satPhone)  await setInput(page, '#con_satellitephone', String(satPhone));
  if (radioFreq) await setInput(page, '#con_frequency', String(radioFreq));
  if (note)      await setInput(page, '#con_note_user', String(note));
  
  // NPA 相關欄位（使用預設值）
  const npaReason = pick(config, ['NpaReason', '入山事由'], '1');
  const npaPlace  = pick(config, ['NpaPlace', '前往地點'], '玉山群峰(嘉義縣-阿里山鄉)');
  const routeMap  = pick(config, ['RouteMap', '登山路線圖'], 'E00');
  const npaPlan   = pick(config, ['NpaPlan', '登山計畫書', '計畫書']);
  
  await selectByValueOrText(page, '#con_NpaReasons', String(npaReason));
  if (npaPlace) {
    await selectByValueOrText(page, '#con_NpaPlacesInfo', String(npaPlace));
    const addBtn = page.locator('#con_AddNpaPlacesInfo');
    if (await addBtn.count()) { await Promise.all([addBtn.click(), waitAspNetStable(page)]); }
  }
  if (routeMap) { await selectByValueOrText(page, '#con_NpaPaths', String(routeMap)); await waitAspNetStable(page); }
  if (npaPlan) { await page.fill('#con_NpaPlan', ''); await page.type('#con_NpaPlan', String(npaPlan)); }
  
  // 點擊下一步按鈕進入 Step 2
  const nextBtn = page.locator('#con_btnToStep21');
  await nextBtn.waitFor({ state: 'visible', timeout: 10000 });
  await nextBtn.click();
  
  // 等待 ASP.NET 處理完成
  await waitAspNetStable(page);
  
  // 確保真正進入 Step 2 頁面
  await page.waitForSelector('[data-step="1"].active, .step_bar4 [data-step="1"].active', { timeout: 20000 }).catch(() => {
    console.warn('⚠️ 未能偵測到 Step 2 頁面指示器，但繼續執行');
  });
  
  // 額外等待，確保頁面完全載入
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  
  console.log('✅ Step 1 已完成並成功進入 Step 2。');
}

module.exports = {
  fillStep1FromData,
};



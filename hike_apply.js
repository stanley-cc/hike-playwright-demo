// hike_apply.js
// Playwright script to: 
// 1) open apply_1.aspx?search=2 -> click bottom-right "進入申請 / APPLY"
// 2) on apply_1_2.aspx -> check all checkboxes -> click 同意/Agree
// 3) land on apply_1_4.aspx -> ready to fill
//
// - Headed mode (headless:false)
// - No screenshots/recordings
// - CAPTCHA handling is modular: manual first; easy to swap to solver later.

const { chromium } = require('playwright');
const readline = require('readline');


const { loadHikeExcelData, updateApplicationStatus } = require('./fill_apply_data');
const {
  navigateToNextApplication,
  waitBetweenApplications
} = require('./success_handler');
const { solveWith2Captcha } = require('./captcha_solver');


// ---------- Config ----------
const START_URL = 'https://hike.taiwan.gov.tw/apply_1.aspx?search=2';

// Toggle when you add an external captcha service later:
// { mode: 'manual' } or { mode: '2captcha', apiKey: 'XXXX' }
const CAPTCHA_CONFIG = {
  mode: process.env.CAPTCHA_MODE || 'manual',
  apiKey: process.env.CAPTCHA_API_KEY
};

// ---------- Utilities ----------
function waitForAspNetIdle(page, timeoutMs = 15000) {
  // Wait for ASP.NET UpdatePanel Ajax to finish
  return page.waitForFunction(
    `() => {
      try {
        if (!window.Sys || !Sys.WebForms) return true;
        const prm = Sys.WebForms.PageRequestManager.getInstance?.();
        return prm ? !prm.get_isInAsyncPostBack() : true;
      } catch (e) { return true; }
    }`,
    { timeout: timeoutMs }
  );
}

// 找到特定標題卡片 → 點擊該卡右側的「進入申請」
// 預設 titleText 用你指定的這條路線
async function clickCardApply(page, titleText = '2~5天(塔塔加 - 玉山線 - 塔塔加)') {
  // 確保卡片已載入
  await page.waitForSelector('.res_box2', { timeout: 15000 });

  // 在包含標題文字的卡片中，找「進入申請」按鈕
  const card = page.locator('.res_box2', { hasText: titleText }).first();
  await card.waitFor({ state: 'visible', timeout: 10000 });

  const applyBtn = card.locator('text=進入申請').first();
  await applyBtn.waitFor({ state: 'visible', timeout: 10000 });
  await applyBtn.click();

  // 這顆按鈕會觸發 OtherRoute(...)：
  // - 有時直接導頁到 apply_1_2.aspx
  // - 有時先跳 SweetAlert 問「是否需要同時申請...」
  //   這裡預設點「否」（走單一申請），對應 sweetalert 的 .cancel 按鈕
  const swal = page.locator('.sweet-alert');
  const appeared = await swal.isVisible().catch(() => false);

  if (appeared) {
    // SweetAlert 內文載入一下
    await page.waitForTimeout(300);
    // 點「否」：原始碼把取消鍵樣式改成綠色，就是 .cancel
    const cancelBtn = swal.locator('.cancel');
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    } else {
      // 防呆：若抓不到 .cancel，就退而求其次找「否」或 "No"
      const alt = swal.locator('text=否, text=No').first();
      if (await alt.count()) await alt.click();
    }
  }

  // 等待導頁到規定/告知頁（apply_1_2.aspx）
  await page.waitForURL(/apply_1_2\.aspx/i, { timeout: 15000 });
}

// 位於 apply_1_2.aspx：全選核取方塊 → 點擊「同意」→ 等待跳轉到填寫資料頁
async function agreeTermsAndProceed(page) {
  // 確認我們真的在同意條款頁
  await page.waitForURL(/apply_1_2\.aspx/i, { timeout: 15000 });
  await page.waitForSelector("input[type='checkbox'][name='chk[]']", { timeout: 10000 });

  // 把所有 name='chk[]' 的 checkbox 都勾起來（有的預設已勾，保險起見逐一檢查）
  const boxes = page.locator("input[type='checkbox'][name='chk[]']");
  const total = await boxes.count();
  for (let i = 0; i < total; i++) {
    const item = boxes.nth(i);
    if (!(await item.isChecked())) {
      await item.check({ force: true }); // 有些在視窗外，force 可避免視窗位置影響
    }
  }

  // 點擊「同意」，這顆按鈕 id 是 #con_btnagree
  const agreeBtn = page.locator("#con_btnagree");
  await agreeBtn.waitFor({ state: "visible", timeout: 10000 });
  await agreeBtn.click();

  // 若全部勾選成功，會導頁到下一步（例如 apply_1_4.aspx?RandomStr=...）
  await page.waitForURL(/apply_1_4\.aspx/i, { timeout: 15000 });
}




async function handleCaptcha(page, config = { mode: 'manual' }) {
  // Detect common captcha image presence
  const hasCaptcha =
    (await page.locator('#con_imgcode, img[alt*="驗證碼"], img[title*="驗證碼"]').count()) > 0;

  if (!hasCaptcha) return;

  if (config.mode === 'manual') {
    console.log('⚠️  偵測到驗證碼，請在瀏覽器畫面中手動輸入並提交/下一步。');
    console.log('完成後，回到終端機按 Enter 繼續。');
    await waitForEnter();
    return;
  }

  if (config.mode === '2captcha') {
    const apiKey = config.apiKey || process.env.CAPTCHA_API_KEY;
    if (!apiKey) {
      throw new Error('2Captcha API key is required when using mode="2captcha"');
    }

    const img = page.locator('#con_imgcode, img[alt*="驗證碼"], img[title*="驗證碼"]').first();
    await img.waitFor({ state: 'visible', timeout: 10000 });
    const buffer = await img.screenshot();
    const solution = await solveWith2Captcha(buffer.toString('base64'), apiKey);

    const input = page.locator('#con_txtcode, input[name*="code" i], input[placeholder*="驗證碼"]').first();
    await input.fill(solution);
    return;
  }
}

function waitForEnter() {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('按 Enter 繼續... ', () => {
      rl.close();
      resolve();
    });
  });
}

// 執行多次申請的主要函數
async function performMultipleApplications(page, browser, excelPath) {
  // 讀取 Excel 資料
  const { configs, applicant, leader, stay, members } = loadHikeExcelData(excelPath);
  
  const totalApplications = configs.length;
  console.log(`📋 共偵測到 ${totalApplications} 筆申請資料`);
  
  const isDryRun = process.env.DRY_RUN === 'true';
  if (isDryRun) {
    console.log('🧪 *** DRY RUN 模式已啟用 ***');
    console.log('📝 測試模式：在驗證碼階段會假設成功，不會真正送出申請');
  }
  
  const successfulApplications = [];
  const failedApplications = [];
  
  for (let i = 0; i < totalApplications; i++) {
    const applicationNumber = i + 1;
    const config = configs[i];
    
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`🔄 開始第 ${applicationNumber}/${totalApplications} 次申請`);
    console.log('═══════════════════════════════════════');
    
    try {
      // 如果不是第一次申請，需要重新開始流程
      if (i > 0) {
        console.log('🔄 重新開始申請流程...');
        await restartApplicationProcess(page, browser);
      }
      
      // Step 1: 使用當前 config 填寫路線資料
      await fillStep1FromExcelWithConfig(page, config);
      
      // Step 2: 使用固定的人員資料（包含驗證碼處理）
      await fillStep2FromExcelWithData(page, { applicant, leader, stay, members });
      
      // fillStep2FromExcelWithData 已經包含了完整的驗證碼處理和申請成功檢測
      // 如果到這裡沒有拋出異常，表示申請成功
      console.log(`✅ 第 ${applicationNumber}/${totalApplications} 次申請成功！`);
      
      // 更新申請狀態為 'applied'
      const isDryRun = process.env.DRY_RUN === 'true';
      if (!isDryRun) {
        // 正式模式：真的更新狀態
        const updateSuccess = updateApplicationStatus(excelPath, config);
        if (updateSuccess) {
          console.log(`📝 已更新 Excel 中的申請狀態為 'applied'`);
        } else {
          console.warn(`⚠️ 無法更新 Excel 中的申請狀態，但申請本身成功`);
        }
      } else {
        // DRY RUN 模式：只顯示會更新但不實際更新
        console.log(`🧪 DRY RUN 模式：實際執行時會更新 Excel 中的申請狀態為 'applied'`);
      }
      
      successfulApplications.push({
        applicationNumber,
        config
      });
      
      // 如果還有下一次申請，準備重新開始
      if (applicationNumber < totalApplications) {
        await waitBetweenApplications(5); // 等待 5 秒
      }
      
    } catch (err) {
      console.error(`❌ 第 ${applicationNumber} 次申請過程發生錯誤:`, err);
      failedApplications.push({
        applicationNumber,
        config,
        error: err.message
      });
      
      // 決定是否繼續下一次申請
      if (applicationNumber < totalApplications) {
        console.log('⚠️ 將嘗試進行下一次申請...');
        await waitBetweenApplications(2);
      }
    }
  }
  
  // 顯示最終統計
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`🎉 所有申請流程完成！`);
  console.log(`✅ 成功申請: ${successfulApplications.length} 筆`);
  console.log(`❌ 失敗申請: ${failedApplications.length} 筆`);
  console.log(`📊 總處理數: ${totalApplications} 筆`);
  console.log('═══════════════════════════════════════');
  
  // 顯示成功申請的詳細資訊
  if (successfulApplications.length > 0) {
    console.log('\n📝 成功申請列表:');
    successfulApplications.forEach(app => {
      console.log(`第 ${app.applicationNumber} 次申請 ✅`);
    });
  }
  
  // 顯示失敗申請的詳細資訊
  if (failedApplications.length > 0) {
    console.log('\n❌ 失敗申請詳情:');
    failedApplications.forEach(app => {
      console.log(`第 ${app.applicationNumber} 次申請: ${app.error}`);
    });
  }
}

// 重新開始申請流程（第二次及之後使用）
async function restartApplicationProcess(page, browser) {
  console.log('🔄 重新導航到申請首頁...');
  
  // 使用 navigateToNextApplication 函數
  await navigateToNextApplication(page);
  
  // 重新執行申請流程的前置步驟
  await clickCardApply(page);
  
  await page.waitForLoadState('domcontentloaded');
  await agreeTermsAndProceed(page);
  
  await handleCaptcha(page, { mode: 'manual' });
  
  await waitForAspNetIdle(page).catch(() => {});
  await page.waitForLoadState('networkidle');
  
  // 確認回到填表頁
  const formReady = await Promise.race([
    page.waitForSelector('#con_teams_name', { timeout: 8000 }).then(() => true).catch(() => false),
    page.waitForSelector('#con_climblinemain', { timeout: 8000 }).then(() => true).catch(() => false),
    page.waitForSelector('form[action*="apply_1_4.aspx"]', { timeout: 8000 }).then(() => true).catch(() => false),
  ]);
  
  if (!formReady) {
    throw new Error('無法回到填表頁面');
  }
  
  console.log('✅ 成功重新進入填表頁面');
}

// 使用指定 config 進行 Step 1 填寫
async function fillStep1FromExcelWithConfig(page, config) {
  // 直接調用現有的 fillStep1 邏輯，但使用指定的 config
  const step1Module = require('./fill_apply_step1');
  
  // 創建一個臨時的資料物件，只包含當前的 config
  const tempData = { config, applicant: {}, leader: {}, stay: {}, members: [], __meta: { sheets: [] } };
  
  // 我們需要修改 fill_apply_step1.js 來支援直接傳遞資料物件
  // 暫時使用現有函數，但需要確保它能處理這種情況
  await step1Module.fillStep1FromData(page, tempData);
}

// 使用指定人員資料進行 Step 2 填寫  
async function fillStep2FromExcelWithData(page, personData) {
  // 直接調用現有的 fillStep2 邏輯，但使用指定的人員資料
  const step2Module = require('./fill_apply_step2');
  
  // 創建完整的資料物件
  const tempData = { 
    config: {}, 
    applicant: personData.applicant, 
    leader: personData.leader, 
    stay: personData.stay, 
    members: personData.members, 
    __meta: { sheets: [] } 
  };
  
  // 我們需要修改 fill_apply_step2.js 來支援直接傳遞資料物件
  await step2Module.fillStep2FromData(page, tempData);
}

// ---------- Main ----------
(async () => {
  const browser = await chromium.launch({
    headless: false, // headed, per your request
    args: ['--window-size=1280,900']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    // 1) 首頁 -> 右下角「進入申請」
    await page.goto(START_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await clickCardApply(page);

    // 2) 規定/告知頁 -> 勾選全部 -> 同意/下一步
    await page.waitForLoadState('domcontentloaded');
    await agreeTermsAndProceed(page);

    // 若此頁或下一步前後可能出現驗證碼，先處理
    await handleCaptcha(page, CAPTCHA_CONFIG);

    // 3) 進入填表頁（apply_1_4.aspx）
    // 等 ASP.NET UpdatePanel/ScriptManager 就緒
    await waitForAspNetIdle(page).catch(() => {});
    await page.waitForLoadState('networkidle');

    // 成功標誌：嘗試等到填表頁常見欄位（例如隊名或路線選單）
    // 這些 ID 來自你提供的原始碼（可能依語系略有不同）
    const formReady = await Promise.race([
      page.waitForSelector('#con_teams_name', { timeout: 8000 }).then(() => true).catch(() => false),
      page.waitForSelector('#con_climblinemain', { timeout: 8000 }).then(() => true).catch(() => false),
      page.waitForSelector('form[action*="apply_1_4.aspx"]', { timeout: 8000 }).then(() => true).catch(() => false),
    ]);

    if (formReady) {
      console.log('✅ 已進入「填寫申請資料」頁面（apply_1_4.aspx）。準備進行多次申請...');
      try {
        const path = require('path');
        const excelPath = process.env.HIKE_EXCEL_PATH || path.resolve(__dirname, 'hike_application_data.xlsx');
        await performMultipleApplications(page, browser, excelPath);
      } catch (err) {
        console.error('❌ 多次申請流程失敗：', err);
      }
    } else {
      console.log('⚠️ 未偵測到常見的填表欄位，但應已在下一頁。請確認畫面。');
    }
    
  } catch (err) {
    console.error('❌ 發生錯誤：', err);
  } finally {
    // 建議先不自動關閉，方便你檢視結果；穩定後可改為 browser.close()
    // await browser.close();
  }
})();

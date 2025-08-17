// success_handler.js
// 處理申請成功頁面檢測和後續流程

/**
 * 檢測是否到達申請成功頁面
 * @param {Page} page - Playwright 頁面物件
 * @returns {Promise<boolean>} 是否為申請成功頁面
 */
async function isApplicationSuccessPage(page) {
  try {
    // 簡化檢測邏輯：只要有列印按鈕就認定為成功頁面
    const printButton = await page.locator('#con_btnPrint, input[value="列印本頁"], input[onclick*="print()"], button:has-text("列印")').isVisible().catch(() => false);
    
    return printButton;
    
  } catch (error) {
    console.error('檢測申請成功頁面時發生錯誤:', error);
    return false;
  }
}

// 申請資訊提取功能已移除

/**
 * 處理申請成功後的流程
 * @param {Page} page - Playwright 頁面物件
 * @param {number} applicationNumber - 當前申請次數
 * @param {number} totalApplications - 總申請次數
 */
async function handleApplicationSuccess(page, applicationNumber, totalApplications) {
  console.log(`✅ 第 ${applicationNumber}/${totalApplications} 次申請成功！`);
}

/**
 * 重新導航到申請頁面開始下一次申請
 * @param {Page} page - Playwright 頁面物件
 * @returns {Promise<void>}
 */
async function navigateToNextApplication(page) {
  const START_URL = 'https://hike.taiwan.gov.tw/apply_1.aspx?search=2';
  
  console.log('🔄 準備開始下一次申請...');
  
  // 導航回申請首頁
  await page.goto(START_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  
  console.log('✅ 已回到申請首頁，準備開始下一次申請流程');
}

/**
 * 等待指定時間（避免過於頻繁的申請）
 * @param {number} seconds - 等待秒數
 * @returns {Promise<void>}
 */
async function waitBetweenApplications(seconds = 5) {
  console.log(`⏳ 等待 ${seconds} 秒後開始下一次申請...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/**
 * 檢測並處理申請結果頁面
 * @param {Page} page - Playwright 頁面物件
 * @param {number} applicationNumber - 當前申請次數  
 * @param {number} totalApplications - 總申請次數
 * @returns {Promise<{success: boolean}>} 處理結果
 */
async function detectAndHandleApplicationResult(page, applicationNumber, totalApplications) {
  try {
    // 等待頁面穩定
    await page.waitForLoadState('networkidle');
    
    // 檢測是否為申請成功頁面
    const isSuccess = await isApplicationSuccessPage(page);
    
    if (isSuccess) {
      await handleApplicationSuccess(page, applicationNumber, totalApplications);
      return { success: true };
    } else {
      // 檢查是否有錯誤訊息
      const hasError = await page.locator('.alert-danger, .error, text=錯誤, text=失敗').isVisible().catch(() => false);
      
      if (hasError) {
        const errorMsg = await page.locator('.alert-danger, .error').textContent().catch(() => '未知錯誤');
        console.error(`❌ 申請失敗: ${errorMsg}`);
        return { success: false, error: errorMsg };
      }
      
      // 可能還在處理中，需要等待
      return { success: false, pending: true };
    }
    
  } catch (error) {
    console.error('檢測申請結果時發生錯誤:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  isApplicationSuccessPage,
  handleApplicationSuccess,
  navigateToNextApplication,
  waitBetweenApplications,
  detectAndHandleApplicationResult
};

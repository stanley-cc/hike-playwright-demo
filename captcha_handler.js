// captcha_handler.js
// 簡化版驗證碼處理邏輯

const readline = require('readline');

/**
 * 簡化版驗證碼處理流程
 * @param {Page} page - Playwright 頁面物件
 * @param {boolean} isDryRun - 是否為測試模式
 * @returns {Promise<boolean>} 是否申請成功
 */
async function handleCaptchaSimplified(page, isDryRun = false) {
  try {
    console.log('🔍 檢查驗證碼和送出按鈕...');
    
    // 等待驗證碼圖片載入
    await page.waitForSelector('#con_imgcode', { timeout: 5000 });
    await page.waitForTimeout(1000); // 確保圖片完全載入
    
    if (isDryRun) {
      console.log('');
      console.log('🧪 *** DRY RUN 模式 ***');
      console.log('📝 這是測試模式，將模擬申請成功');
    } else {
      console.log('📸 驗證碼圖片已載入');
    }
    
    let submitSuccess = false;
    let attemptCount = 0;
    const maxAttempts = 3; // 最多嘗試3次
    
    while (!submitSuccess && attemptCount < maxAttempts) {
      attemptCount++;
      
      console.log('');
      console.log('═══════════════════════════════════════');
      console.log('🔐 請查看瀏覽器中的驗證碼圖片');
      console.log('📝 請在下方輸入您看到的驗證碼：');
      console.log('═══════════════════════════════════════');
      
      // 顯示嘗試次數
      if (attemptCount > 1) {
        console.log(`🔄 第 ${attemptCount} 次嘗試 (共可嘗試 ${maxAttempts} 次)`);
      }
      
      // 等待用戶輸入驗證碼
      const captcha = await getUserInputCaptcha();
      
      console.log(`✅ 收到驗證碼: ${captcha}`);
      
      if (isDryRun) {
        console.log('🧪 DRY RUN 模式：模擬申請成功');
        return true;
      }
      
      // 填入驗證碼
      console.log('🔄 正在填入驗證碼...');
      await page.fill('#con_vcode', '');
      await page.fill('#con_vcode', captcha);
      await page.waitForTimeout(500);
      
      // 尋找確認送出按鈕
      const submitButton = page.locator('#con_btnsave');
      const submitButtonExists = await submitButton.count() > 0;
      
      if (!submitButtonExists) {
        console.log('❌ 找不到確認送出按鈕');
        return false;
      }
      
      console.log('✅ 找到確認送出按鈕，準備點擊...');
      
      // 檢查送出按鈕狀態並啟用
      const isDisabled = await submitButton.getAttribute('class');
      if (isDisabled && isDisabled.includes('aspNetDisabled')) {
        console.log('🔧 啟用送出按鈕...');
        await page.evaluate(() => {
          const btn = document.querySelector('#con_btnsave');
          if (btn) {
            btn.classList.remove('aspNetDisabled', 'btn-secondary');
            btn.classList.add('btn-primary');
            btn.removeAttribute('disabled');
          }
        });
      }
      
      // 點擊確認送出按鈕
      console.log('📤 點擊「確認送出」按鈕...');
      await submitButton.click({ force: true });
      
      // 等待 10 秒讓系統處理
      console.log('⏳ 等待 10 秒讓系統處理申請...');
      await page.waitForTimeout(10000);
      
      // 檢查是否有列印按鈕（申請成功標誌）
      console.log('🔍 檢查是否有列印按鈕（申請成功標誌）...');
      const printButtonExists = await page.locator('#con_btnPrint, input[value="列印本頁"], input[onclick*="print()"], button:has-text("列印")').isVisible().catch(() => false);
      
      if (printButtonExists) {
        console.log('✅ 發現列印按鈕，申請成功！');
        submitSuccess = true;
        return true;
      } else {
        console.log(`❌ 未發現列印按鈕，可能是驗證碼錯誤`);
        
        if (attemptCount < maxAttempts) {
          console.log('🔄 將重新要求輸入驗證碼...');
          
          // 刷新驗證碼圖片
          await page.evaluate(() => {
            const btn = document.querySelector('.btn.btn-primary[onclick="changevcode();"]');
            if (btn) btn.click();
          });
          await page.waitForTimeout(1000); // 等待新驗證碼載入
        } else {
          console.log(`❌ 已達到最大嘗試次數 (${maxAttempts} 次)，申請失敗`);
        }
      }
    }
    
    return false; // 如果跳出迴圈還沒成功，表示失敗
    
  } catch (error) {
    console.error('❌ 驗證碼處理過程發生錯誤:', error);
    return false;
  }
}

/**
 * 獲取用戶輸入的驗證碼
 * @returns {Promise<string>} 驗證碼
 */
async function getUserInputCaptcha() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question('🔤 驗證碼: ', (answer) => {
      rl.close();
      const trimmedAnswer = answer.trim();
      // 如果用戶沒有輸入任何值，自動使用 "0000"
      resolve(trimmedAnswer === '' ? '0000' : trimmedAnswer);
    });
  });
}

module.exports = {
  handleCaptchaSimplified
};

# 玉山國家公園入園申請自動化工具

這是一個使用 Playwright 開發的自動化工具，用於協助填寫玉山國家公園的入園申請表單。本工具僅供學習和作品集展示使用。

## 功能特點

- 支援多次申請自動化
- 從 Excel 檔案讀取申請資料
- 自動填寫申請表單
- 支援驗證碼手動輸入
- 自動追蹤申請狀態
- 支援「台」和「臺」的模糊比對

## 系統需求

- Node.js >= 14.0.0
- npm 或 yarn

## 安裝步驟

1. 克隆專案：
```bash
git clone https://github.com/stanley-cc/hike-playwright-demo.git
cd hike-playwright-demo
```

2. 安裝依賴：
```bash
npm install
```

## 使用方法

1. 準備申請資料：
   - 使用提供的 Excel 範本填寫申請資料
   - 或執行 `node create_fake_data.js` 生成測試用的假資料

2. 執行申請程式：
```bash
node hike_apply.js
```

3. 測試模式（不會實際送出申請）：
```bash
npm run test
```

## 驗證碼設定

預設為手動輸入驗證碼。如欲透過 2Captcha 自動解碼，可使用環境變數設定：

```bash
export CAPTCHA_MODE=2captcha
export CAPTCHA_API_KEY=你的2Captcha_API_key
node hike_apply.js
```

若未提供 `CAPTCHA_API_KEY` 或無法成功解析，程式會拋出錯誤。

## Excel 檔案格式

Excel 檔案需包含以下工作表：
- Config：申請設定（路線、日期等）
- Applicant：申請人資料
- Leader：領隊資料
- Members：隊員資料
- StayBehind：留守人員資料

詳細格式請參考 `create_fake_data.js`。

## 注意事項

- 本工具僅供學習和展示用途
- 請勿用於實際大量申請
- 驗證碼預設需手動輸入，可透過 2Captcha 自動解碼
- 建議在正式申請前先使用測試模式

## 授權

ISC License
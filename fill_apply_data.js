// 載入 Excel 的共用模組，供主檔與 step2 使用
const XLSX = require('xlsx');
const fs = require('fs');

function normalizeKey(s) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, '').replace(/_/g, '');
}

function sheetToObjects(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map((r) => {
    const obj = {};
    for (const [k, v] of Object.entries(r)) obj[normalizeKey(k)] = v;
    return obj;
  });
}

function loadHikeExcelData(excelPath) {
  if (!fs.existsSync(excelPath)) {
    throw new Error(`[Excel] 找不到檔案：${excelPath}`);
  }
  const wb = XLSX.readFile(excelPath, { cellDates: true });
  const sheetNames = wb.SheetNames;

  const getSheetBy = (...candidates) =>
    sheetNames.find((n) => {
      const k = normalizeKey(n);
      return candidates.some((c) => k === normalizeKey(c) || k.includes(normalizeKey(c)));
    });

  // Config：優先用分頁名；找不到則用欄位特徵偵測
  let configSheetName = getSheetBy('config');
  if (!configSheetName) {
    // 以欄位特徵判斷：包含 TeamName/MainRoute/SubRoute/TotalDays/EntryDate 等任 2-3 欄
    for (const n of sheetNames) {
      const rows = sheetToObjects(wb.Sheets[n]);
      if (!rows.length) continue;
      const keys = Object.keys(rows[0] || {}).map(normalizeKey);
      const marks = ['teamname','mainroute','subroute','totaldays','entrydate'];
      const hit = marks.filter(m => keys.includes(m)).length;
      if (hit >= 2) { configSheetName = n; break; }
    }
  }
  if (!configSheetName) {
    const list = sheetNames.join(', ');
    throw new Error(`[Excel] 找不到 Config 工作表（或無法由欄位特徵辨識）。目前檔內工作表：${list}`);
  }
  const configRows = sheetToObjects(wb.Sheets[configSheetName]);
  if (!configRows.length) throw new Error(`[Excel] Config 表（${configSheetName}）是空的`);
  
  // 支援多列 Config 資料（多次申請），過濾空白列和缺少必要資料的列
  const configs = configRows.filter((row, index) => {
    // 檢查關鍵欄位是否有值
    const teamName = (row.teamname || row['隊名'] || row['隊伍名稱'] || '').toString().trim();
    const mainRoute = (row.mainroute || row['登山主路線'] || row['主路線'] || row['主線'] || '').toString().trim();
    const entryDate = (row.entrydate || row['入園日期'] || row['入園日'] || row.startdate || '').toString().trim();
    const subRoute = (row.subroute || row['次路線'] || row['副路線'] || '').toString().trim();
    
    // 檢查申請狀態（多種可能的欄位名稱）
    const applicationStatus = (row.applicationstatus || row['申請狀態'] || row['申請状态'] || row.status || row['狀態'] || '').toString().trim().toLowerCase();
    
    // 檢查是否為完全空白列（所有重要欄位都空白）
    const isEmpty = teamName === '' && mainRoute === '' && entryDate === '' && subRoute === '';
    
    if (isEmpty) {
      console.log(`⏭️ 略過空白列 (第 ${index + 1} 列)`);
      return false;
    }
    
    // 檢查是否已申請完成
    if (applicationStatus === 'applied' || applicationStatus === '已申請') {
      console.log(`⏭️ 略過已申請的列 (第 ${index + 1} 列: 隊名="${teamName}", 入園日期="${entryDate}", 狀態="${applicationStatus}")`);
      return false;
    }
    
    // 檢查是否缺少入園日期（必要欄位）
    if (entryDate === '') {
      console.log(`⏭️ 略過缺少入園日期的列 (第 ${index + 1} 列: 隊名="${teamName}")`);
      return false;
    }
    
    // 檢查是否缺少隊名（建議有但非必須）
    if (teamName === '') {
      console.warn(`⚠️ 第 ${index + 1} 列缺少隊名，但有入園日期，將保留並使用預設隊名`);
    }
    
    return true; // 有入園日期且未申請的列都保留
  });
  
  if (configs.length === 0) {
    throw new Error(`[Excel] Config 表（${configSheetName}）沒有有效的申請資料列`);
  }
  
  console.log(`📋 過濾後的有效申請資料: ${configs.length} 筆 (原始資料: ${configRows.length} 筆)`);
  
  const config = configs[0]; // 保持向後相容，使用第一筆有效資料

  // Applicant / Leader / Stay
  const applicantSheetName = getSheetBy('applicant', 'apply', '申請人');
  const leaderSheetName = getSheetBy('leader', '領隊');

  const staySheetName = getSheetBy('stay', '留守', '留守人', 'staybehind', '留守人員', '留守人資料', 'staybehind資料', 'staybehind表');

  const applicant = applicantSheetName ? (sheetToObjects(wb.Sheets[applicantSheetName])[0] || {}) : {};
  const leader = leaderSheetName ? (sheetToObjects(wb.Sheets[leaderSheetName])[0] || {}) : {};
  const stay = staySheetName ? (sheetToObjects(wb.Sheets[staySheetName])[0] || {}) : {};

  // Members：集中在 Members 分頁多列
  const membersSheet = sheetNames.find(n => normalizeKey(n) === 'members');
  let members = [];
  if (membersSheet) {
    members = sheetToObjects(wb.Sheets[membersSheet]);
  } else {
    console.warn('[Excel] 找不到 Members 工作表，將使用空的隊員列表');
  }

  return { config, configs, applicant, leader, stay, members, __meta: { sheets: sheetNames, configSheetName, originalConfigRows: configRows } };
}

/**
 * 更新 Excel 檔案中特定申請的狀態為 'applied'
 * @param {string} excelPath - Excel 檔案路徑
 * @param {Object} completedConfig - 已完成申請的 config 物件
 * @returns {Promise<boolean>} 更新是否成功
 */
function updateApplicationStatus(excelPath, completedConfig) {
  try {
    if (!fs.existsSync(excelPath)) {
      console.error(`[updateApplicationStatus] 找不到檔案：${excelPath}`);
      return false;
    }

    // 讀取 Excel 檔案
    const wb = XLSX.readFile(excelPath, { cellDates: true });
    const sheetNames = wb.SheetNames;
    
    const getSheetBy = (...candidates) =>
      sheetNames.find((n) => {
        const k = normalizeKey(n);
        return candidates.some((c) => k === normalizeKey(c) || k.includes(normalizeKey(c)));
      });

    // 找到 Config 工作表
    let configSheetName = getSheetBy('config');
    if (!configSheetName) {
      // 以欄位特徵判斷
      for (const n of sheetNames) {
        const rows = sheetToObjects(wb.Sheets[n]);
        if (!rows.length) continue;
        const keys = Object.keys(rows[0] || {}).map(normalizeKey);
        const marks = ['teamname','mainroute','subroute','totaldays','entrydate'];
        const hit = marks.filter(m => keys.includes(m)).length;
        if (hit >= 2) { configSheetName = n; break; }
      }
    }

    if (!configSheetName) {
      console.error('[updateApplicationStatus] 找不到 Config 工作表');
      return false;
    }

    // 取得原始工作表
    const configSheet = wb.Sheets[configSheetName];
    const range = XLSX.utils.decode_range(configSheet['!ref']);
    
    // 找到申請狀態欄位的位置，如果不存在則新增
    let statusColumnIndex = -1;
    const statusColumnNames = ['ApplicationStatus', '申請狀態', 'Status', '狀態', 'status'];
    
    // 檢查第一列（標題列）找到申請狀態欄位
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = configSheet[cellAddress];
      if (cell && cell.v) {
        const normalizedValue = normalizeKey(cell.v);
        if (statusColumnNames.some(name => normalizedValue === normalizeKey(name))) {
          statusColumnIndex = col;
          break;
        }
      }
    }
    
    // 如果沒有找到申請狀態欄位，在最後一欄新增
    if (statusColumnIndex === -1) {
      statusColumnIndex = range.e.c + 1;
      const statusHeaderCell = XLSX.utils.encode_cell({ r: 0, c: statusColumnIndex });
      configSheet[statusHeaderCell] = { v: 'Status', t: 's' };
      
      // 更新範圍
      range.e.c = statusColumnIndex;
      configSheet['!ref'] = XLSX.utils.encode_range(range);
    }

    // 找到要更新的資料列
    const configRows = sheetToObjects(wb.Sheets[configSheetName]);
    let targetRowIndex = -1;
    
    // 比對關鍵欄位找到對應的列
    for (let i = 0; i < configRows.length; i++) {
      const row = configRows[i];
      const teamName = (row.teamname || row['隊名'] || row['隊伍名稱'] || '').toString().trim();
      const entryDate = (row.entrydate || row['入園日期'] || row['入園日'] || row.startdate || '').toString().trim();
      const mainRoute = (row.mainroute || row['登山主路線'] || row['主路線'] || row['主線'] || '').toString().trim();
      
      const completedTeamName = (completedConfig.teamname || completedConfig['隊名'] || completedConfig['隊伍名稱'] || completedConfig.TeamName || '').toString().trim();
      const completedEntryDate = (completedConfig.entrydate || completedConfig['入園日期'] || completedConfig['入園日'] || completedConfig.startdate || completedConfig.EntryDate || '').toString().trim();
      const completedMainRoute = (completedConfig.mainroute || completedConfig['登山主路線'] || completedConfig['主路線'] || completedConfig['主線'] || completedConfig.MainRoute || '').toString().trim();
      
      // 使用入園日期作為主要比對條件（最可靠），並搭配其他欄位確認
      if (entryDate === completedEntryDate) {
        // 如果有隊名也要比對
        if (teamName && completedTeamName && teamName !== completedTeamName) {
          continue;
        }
        // 如果有主路線也要比對
        if (mainRoute && completedMainRoute && mainRoute !== completedMainRoute) {
          continue;
        }
        
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      console.warn('[updateApplicationStatus] 找不到對應的申請資料列進行狀態更新');
      return false;
    }

    // 更新申請狀態（+1 因為第一列是標題）
    const targetCellAddress = XLSX.utils.encode_cell({ r: targetRowIndex + 1, c: statusColumnIndex });
    configSheet[targetCellAddress] = { v: 'applied', t: 's' };

    // 寫回檔案
    XLSX.writeFile(wb, excelPath);
    
    console.log(`✅ 已更新申請狀態為 'applied' (第 ${targetRowIndex + 2} 列)`);
    return true;
    
  } catch (error) {
    console.error('[updateApplicationStatus] 更新申請狀態時發生錯誤:', error);
    return false;
  }
}

module.exports = {
  loadHikeExcelData,
  updateApplicationStatus,
};



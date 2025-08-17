/*
  生成作品集用的假資料 Excel 檔案
  完全替換真實個人資訊為虛擬假資料
*/
const path = require('path');
const XLSX = require('xlsx');

const output = path.resolve(__dirname, 'hike_application_data.xlsx');

// 生成符合規則的中華民國身分證字號
function generateFakeID() {
  // 縣市代碼對照表（英文字母對應的數字）
  const cityCode = {
    A: 10, // 臺北市
    B: 11, // 臺中市
    C: 12, // 基隆市
    D: 13, // 臺南市
    E: 14, // 高雄市
    F: 15, // 新北市
    G: 16, // 宜蘭縣
    H: 17, // 桃園市
    I: 34, // 嘉義市
    J: 18, // 新竹縣
    K: 19, // 苗栗縣
    L: 20, // 臺中縣
    M: 21, // 南投縣
    N: 22, // 彰化縣
    O: 35, // 新竹市
    P: 23, // 雲林縣
    Q: 24, // 嘉義縣
    R: 25, // 臺南縣
    S: 26, // 高雄縣
    T: 27, // 屏東縣
    U: 28, // 花蓮縣
    V: 29, // 臺東縣
    W: 32, // 金門縣
    X: 30, // 澎湖縣
    Y: 31, // 陽明山
    Z: 33  // 連江縣
  };

  // 隨機選擇一個英文字母
  const letters = Object.keys(cityCode);
  const letter = letters[Math.floor(Math.random() * letters.length)];
  
  // 隨機生成性別碼（1或2）
  const gender = Math.random() < 0.5 ? 1 : 2;
  
  // 隨機生成後7碼（不含檢查碼）
  const numbers = Array.from({length: 7}, () => Math.floor(Math.random() * 10));
  
  // 計算檢查碼
  // 1. 英文字母對應的數字，分成十位數和個位數
  const code = cityCode[letter];
  const n1 = Math.floor(code / 10);
  const n2 = code % 10;
  
  // 2. 依照規則計算總和
  // 權重依序為 1,9,8,7,6,5,4,3,2,1,1
  const weights = [1, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  let sum = n1 * weights[0] + n2 * weights[1] + gender * weights[2];
  
  // 加上後7碼的權重計算
  for (let i = 0; i < 7; i++) {
    sum += numbers[i] * weights[i + 3];
  }
  
  // 3. 計算檢查碼：用10減去總和除以10的餘數
  const checkCode = (10 - (sum % 10)) % 10;
  
  // 組合身分證字號：英文字母 + 性別碼 + 7位數字 + 檢查碼
  return letter + gender + numbers.join('') + checkCode;
}

// 隨機生成假的手機號碼
function generateFakePhone() {
  const prefixes = ['09']; // 臺灣手機號碼都是09開頭
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const numbers = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  return prefix + numbers;
}

// 隨機生成假的email
function generateFakeEmail(name) {
  const domains = ['example.com', 'test.com', 'demo.com', 'sample.com'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const randomNum = Math.floor(Math.random() * 1000);
  return `${name.toLowerCase()}${randomNum}@${domain}`;
}

// 隨機生成假的生日（必須年滿18歲）
function generateFakeBirthday() {
  const currentYear = new Date().getFullYear();
  const year = currentYear - 40 + Math.floor(Math.random() * 22); // 18-40歲
  const month = (1 + Math.floor(Math.random() * 12)).toString().padStart(2, '0');
  const day = (1 + Math.floor(Math.random() * 28)).toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 假的地址資料
const fakeAddresses = [
  { county: '台北市', district: '中正區', address: '中山南路100號1樓' },
  { county: '台北市', district: '大安區', address: '信義路二段200號2樓' },
  { county: '新北市', district: '板橋區', address: '中山路一段300號3樓' },
  { county: '新北市', district: '新莊區', address: '新泰路400號4樓' },
  { county: '桃園市', district: '中壢區', address: '中正路500號5樓' },
  { county: '台中市', district: '西區', address: '台灣大道600號6樓' },
];

// 假的姓名資料
const fakeNames = [
  { name: '王小明', emergency: '王大華' },
  { name: '李美玲', emergency: '李志強' },
  { name: '陳建國', emergency: '陳淑芬' },
  { name: '張雅婷', emergency: '張明德' },
  { name: '林志偉', emergency: '林秀珍' },
  { name: '黃文龍', emergency: '黃麗華' },
];

function normalizeDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toISOString().split('T')[0];
}

function deriveSexFromSid(sid) {
  const secondChar = sid?.charAt(1);
  return (secondChar === '1') ? '男' : '女';
}

// Config：測試用多筆申請資料
const Config = [
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-08-25',
    Status: 'applied', // 已申請
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-08-26',
    Status: 'applied', // 已申請
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-08-27',
    Status: 'applied', // 已申請
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-08-28',
    Status: 'applied', // 已申請
  },
  // 空白列（會被過濾）
  {
    TeamName: '',
    MainRoute: '',
    SubRoute: '',
    TotalDays: '',
    EntryDate: '',
    Status: '',
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-09-01',
    Status: '', // 未申請
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-09-02',
    Status: '', // 未申請
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '', // 缺少入園日期（會被過濾）
    Status: '',
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-09-03',
    Status: '', // 未申請
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-09-04',
    Status: '', // 未申請
  },
  {
    TeamName: '玉山體驗隊',
    MainRoute: '玉山線',
    SubRoute: '2~5天(塔塔加 - 玉山線 - 塔塔加)',
    TotalDays: '共2天',
    EntryDate: '2025-09-05',
    Status: '', // 未申請
  },
];

// 建立假的申請人資料
const fakeApplicant = fakeNames[0];
const applicantAddr = fakeAddresses[0];
const applicantID = generateFakeID();
const applicantPhone = generateFakePhone();

const Applicant = {
  姓名: fakeApplicant.name,
  國籍: '中華民國',
  身分證或護照號碼: applicantID,
  性別: deriveSexFromSid(applicantID),
  '生日(yyyy-mm-dd)': generateFakeBirthday(),
  電話: applicantPhone,
  手機: applicantPhone,
  Email: generateFakeEmail(fakeApplicant.name),
  縣市: applicantAddr.county,
  鄉鎮區: applicantAddr.district,
  其餘地址: applicantAddr.address,
  緊急聯絡人: fakeApplicant.emergency,
  緊急聯絡電話: generateFakePhone(),
  傳真: ''
};

// 建立假的領隊資料
const fakeLeader = fakeNames[1];
const leaderAddr = fakeAddresses[1];
const leaderID = generateFakeID();
const leaderPhone = generateFakePhone();

const Leader = {
  姓名: fakeLeader.name,
  國籍: '中華民國',
  身分證或護照號碼: leaderID,
  性別: deriveSexFromSid(leaderID),
  '生日(yyyy-mm-dd)': generateFakeBirthday(),
  電話: leaderPhone,
  手機: leaderPhone,
  Email: generateFakeEmail(fakeLeader.name),
  縣市: leaderAddr.county,
  鄉鎮區: leaderAddr.district,
  其餘地址: leaderAddr.address,
  緊急聯絡人: fakeLeader.emergency,
  緊急聯絡電話: generateFakePhone(),
  傳真: ''
};

// 建立假的隊員資料
const fakeMembers = [];
for (let i = 2; i < 5; i++) {
  const fakeMember = fakeNames[i];
  const memberAddr = fakeAddresses[i];
  const memberID = generateFakeID();
  const memberPhone = generateFakePhone();
  
  fakeMembers.push({
    姓名: fakeMember.name,
    國籍: '中華民國',
    身分證或護照號碼: memberID,
    性別: deriveSexFromSid(memberID),
    '生日(yyyy-mm-dd)': generateFakeBirthday(),
    電話: memberPhone,
    手機: memberPhone,
    Email: generateFakeEmail(fakeMember.name),
    縣市: memberAddr.county,
    鄉鎮區: memberAddr.district,
    其餘地址: memberAddr.address,
    緊急聯絡人: fakeMember.emergency,
    緊急聯絡電話: generateFakePhone(),
    傳真: ''
  });
}

// 建立假的留守人員資料
const fakeStayBehind = fakeNames[5];
const stayAddr = fakeAddresses[5];
const stayID = generateFakeID();
const stayPhone = generateFakePhone();

const StayBehind = {
  姓名: fakeStayBehind.name,
  國籍: '中華民國',
  身分證或護照號碼: stayID,
  性別: deriveSexFromSid(stayID),
  '生日(yyyy-mm-dd)': generateFakeBirthday(),
  電話: stayPhone,
  手機: stayPhone,
  Email: generateFakeEmail(fakeStayBehind.name),
  縣市: stayAddr.county,
  鄉鎮區: stayAddr.district,
  其餘地址: stayAddr.address,
  緊急聯絡人: fakeStayBehind.emergency,
  緊急聯絡電話: generateFakePhone(),
  傳真: ''
};

// 建立工作簿
const wb = XLSX.utils.book_new();

// 新增各個工作表
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Config), 'Config');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([Applicant]), 'Applicant');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([Leader]), 'Leader');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fakeMembers), 'Members');
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([StayBehind]), 'StayBehind');

// 寫入檔案
XLSX.writeFile(wb, output);

console.log('✅ 已生成作品集用的假資料 Excel 檔案：', output);
console.log('📝 所有個人資訊均為虛擬假資料，可安全用於作品集展示');

// 顯示生成的假資料摘要
console.log('\n📋 生成的假資料摘要：');
console.log('申請人：', Applicant.姓名, '|', Applicant.身分證或護照號碼, '|', Applicant.手機);
console.log('領隊：', Leader.姓名, '|', Leader.身分證或護照號碼, '|', Leader.手機);
console.log('隊員1：', fakeMembers[0].姓名, '|', fakeMembers[0].身分證或護照號碼, '|', fakeMembers[0].手機);
console.log('隊員2：', fakeMembers[1].姓名, '|', fakeMembers[1].身分證或護照號碼, '|', fakeMembers[1].手機);
console.log('隊員3：', fakeMembers[2].姓名, '|', fakeMembers[2].身分證或護照號碼, '|', fakeMembers[2].手機);
console.log('留守人員：', StayBehind.姓名, '|', StayBehind.身分證或護照號碼, '|', StayBehind.手機);
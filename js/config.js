// 薬剤原価管理アプリ - 設定ファイル
// APIキーとスプレッドシートIDを設定してください
const CONFIG = {
  // Google Gemini API
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY',
  GEMINI_MODEL: 'gemini-2.0-flash',
  get GEMINI_API_URL() {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.GEMINI_MODEL}:generateContent?key=${this.GEMINI_API_KEY}`;
  },

  // Google Sheets API
  SHEETS_API_KEY: 'YOUR_SHEETS_API_KEY',
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
  get SHEETS_BASE_URL() {
    return `https://sheets.googleapis.com/v4/spreadsheets/${this.SPREADSHEET_ID}`;
  },

  // Google Apps Script Web App (書き込み用)
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxHsYZEjiSYvy6c341qh0hSVFPOkIJT0D9l8iuY0RQ2vcjlgHY-QFY69w9QJCqUn9WRBQ/exec',

  // シート名
  SHEET_NAMES: {
    MEDICINES: '薬品マスター',
    VENDORS: '業者マスター',
    PRICES: '価格テーブル',
    GROUPS: '成分グループ',
  },

  // 画像設定
  MAX_IMAGE_WIDTH: 1600,
  MAX_IMAGE_HEIGHT: 1600,
  IMAGE_QUALITY: 0.85,
};

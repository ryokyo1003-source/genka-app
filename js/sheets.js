// Google Sheets API v4 (読み取り) + GAS Web App (書き込み) ラッパー
const SheetsAPI = {
  // シートからデータを読み取る (Sheets API)
  async readSheet(sheetName, range) {
    const encodedRange = encodeURIComponent(range ? `${sheetName}!${range}` : sheetName);
    const url = `${CONFIG.SHEETS_BASE_URL}/values/${encodedRange}?key=${CONFIG.SHEETS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Sheets API読み取りエラー: ${err.error?.message || res.statusText}`);
    }
    const data = await res.json();
    return data.values || [];
  },

  // 複数シートを一括読み取り (Sheets API)
  async batchGet(sheetNames) {
    const ranges = sheetNames.map(name => encodeURIComponent(name)).join('&ranges=');
    const url = `${CONFIG.SHEETS_BASE_URL}/values:batchGet?ranges=${ranges}&key=${CONFIG.SHEETS_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Sheets API一括読み取りエラー: ${err.error?.message || res.statusText}`);
    }
    const data = await res.json();
    const result = {};
    data.valueRanges?.forEach((vr, i) => {
      result[sheetNames[i]] = vr.values || [];
    });
    return result;
  },

  // GAS Web Appへのリクエスト (リダイレクト対応)
  async _gasRequest(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      redirect: 'follow',
    });
    // GAS Web Appはリダイレクトで最終的にJSONを返す
    if (!res.ok) {
      throw new Error(`GASリクエストエラー: ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('GASレスポンスのパースエラー:', text.substring(0, 200));
      throw new Error('GASレスポンスのパースに失敗しました');
    }
  },

  // 行を末尾に追加 (GAS Web App経由 - POSTをGET化)
  async appendRows(sheetName, rows) {
    const payload = JSON.stringify({
      action: 'append',
      sheet: sheetName,
      rows: rows,
    });
    const url = `${CONFIG.GAS_WEB_APP_URL}?action=append&payload=${encodeURIComponent(payload)}`;

    // まずGET方式を試行 (CORS問題回避)
    try {
      const data = await this._gasRequest(url);
      if (data.error) throw new Error(`GAS追加エラー: ${data.error}`);
      return data;
    } catch (getErr) {
      // GET失敗時、POST方式で再試行
      console.warn('GET方式失敗、POST方式で再試行:', getErr.message);
      const data = await this._gasRequest(CONFIG.GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: payload,
      });
      if (data.error) throw new Error(`GAS追加エラー: ${data.error}`);
      return data;
    }
  },

  // セルを更新 (GAS Web App経由)
  async updateRange(sheetName, range, values) {
    const payload = JSON.stringify({
      action: 'update',
      sheet: sheetName,
      range: range,
      values: values,
    });
    const url = `${CONFIG.GAS_WEB_APP_URL}?action=update&payload=${encodeURIComponent(payload)}`;

    try {
      const data = await this._gasRequest(url);
      if (data.error) throw new Error(`GAS更新エラー: ${data.error}`);
      return data;
    } catch (getErr) {
      console.warn('GET方式失敗、POST方式で再試行:', getErr.message);
      const data = await this._gasRequest(CONFIG.GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: payload,
      });
      if (data.error) throw new Error(`GAS更新エラー: ${data.error}`);
      return data;
    }
  },

  // 全データを初期ロード
  // まずGAS経由を試行し、失敗したらSheets API経由
  async loadAllData() {
    try {
      // GAS Web App経由で全データ取得
      const url = `${CONFIG.GAS_WEB_APP_URL}?action=readAll`;
      const data = await this._gasRequest(url);
      if (data.error) throw new Error(data.error);
      return data;
    } catch (gasErr) {
      console.warn('GAS経由の読み込み失敗、Sheets APIで再試行:', gasErr.message);
      // Sheets API batchGetで代替
      const sheetNames = Object.values(CONFIG.SHEET_NAMES);
      return await this.batchGet(sheetNames);
    }
  },
};

// Google Sheets API v4 (読み取り) + GAS Web App (書き込み) ラッパー
const SheetsAPI = {
  // タイムアウト付きfetch（モバイル回線・GASコールド対策）
  async _fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error(`タイムアウト (${Math.round(timeoutMs/1000)}秒)`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  // シートからデータを読み取る (Sheets API)
  async readSheet(sheetName, range) {
    const encodedRange = encodeURIComponent(range ? `${sheetName}!${range}` : sheetName);
    const url = `${CONFIG.SHEETS_BASE_URL}/values/${encodedRange}?key=${CONFIG.SHEETS_API_KEY}`;
    const res = await this._fetchWithTimeout(url, {}, 10000);
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
    const res = await this._fetchWithTimeout(url, {}, 10000);
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
  // timeoutMs: 読取は短め (5s) でフォールバックを早める、書込は長め (30s)
  async _gasRequest(url, options = {}, timeoutMs = 30000) {
    const res = await this._fetchWithTimeout(url, {
      ...options,
      redirect: 'follow',
    }, timeoutMs);
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

  // GAS経由で単一シートを読み取る
  // （Sheets APIキーが使えない環境向け。アラートシートの読み込みに使用）
  async readSheetViaGAS(sheetName) {
    const url = `${CONFIG.GAS_WEB_APP_URL}?action=read&sheet=${encodeURIComponent(sheetName)}`;
    const data = await this._gasRequest(url, {}, 20000);
    if (data?.error) throw new Error(`GAS読み取りエラー: ${data.error}`);
    if (!Array.isArray(data)) throw new Error('GAS読み取りエラー: 想定外のレスポンス');
    return data;
  },

  // 全データを初期ロード
  // GAS経由（実測: データ2,300件で6〜10秒。コールドスタート時はさらに遅い）。
  // ★ タイムアウトを短くしすぎるとデータ増加とともに毎回失敗するようになるので注意。
  //   フォールバックのSheets API直読みはキー制限で使えない環境があるため、GASを主経路とする。
  async loadAllData() {
    try {
      const url = `${CONFIG.GAS_WEB_APP_URL}?action=readAll`;
      const data = await this._gasRequest(url, {}, 45000);
      if (data.error) throw new Error(data.error);
      return data;
    } catch (gasErr) {
      console.warn('GAS経由の読み込み失敗、Sheets APIで再試行:', gasErr.message);
      const sheetNames = Object.values(CONFIG.SHEET_NAMES);
      return await this.batchGet(sheetNames);
    }
  },
};

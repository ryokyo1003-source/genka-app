// アプリ状態管理
const AppState = {
  medicines: [],
  vendors: [],
  prices: [],
  groups: [],
  alerts: [],
  currentOcrResult: null,
  currentView: 'upload',
};

// メインアプリケーション
const App = {
  views: {
    'upload': UploadView,
    'ocr-result': OcrResultView,
    'medicines': MedicineView,
    'prices': PriceView,
    'compare': CompareView,
    'order': OrderView,
    'inventory': InventoryListView,
    'pricelist': PriceListView,
  },

  async init() {
    // 設定チェック
    if (CONFIG.GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY' ||
        CONFIG.SHEETS_API_KEY === 'YOUR_SHEETS_API_KEY' ||
        CONFIG.SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID') {
      this.showSetup();
      return;
    }

    // ★ キャッシュ即時起動: 前回取得したデータがあれば即座に画面を出し、
    //    最新データは裏で取得する（GASが遅くても「ぐるぐる」で待たせない）
    const cached = this._loadCache();
    if (cached) {
      this.applyData(cached);
      this.renderNavigation();
      this.navigateTo('upload');
      this.refreshInBackground();
      return;
    }

    // キャッシュなし（初回のみ）: 通常ロード
    try {
      UI.showLoading('データを読み込み中...\n（初回は20秒ほどかかることがあります）');
      await this.loadData();
      this.renderNavigation();
      this.navigateTo('upload');
      UI.showToast('データを読み込みました', 'success');
    } catch (err) {
      console.error('[App] 初期化エラー:', err);
      this.showInitError(err);
    } finally {
      UI.hideLoading();
    }
  },

  // ===== データキャッシュ（起動高速化・オフライン耐性） =====
  CACHE_KEY: 'yakuzai_data_cache_v1',

  _loadCache() {
    try {
      const raw = localStorage.getItem(this.CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached?.data || !cached.data[CONFIG.SHEET_NAMES.MEDICINES]) return null;
      return cached;
    } catch { return null; }
  },

  _saveCache(fetched) {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify({
        ts: new Date().toISOString(),
        data: fetched.data,
        alertRows: fetched.alertRows,
      }));
    } catch (e) {
      // 容量超過などは致命的ではないので警告のみ
      console.warn('[App] キャッシュ保存に失敗:', e.message);
    }
  },

  // 裏で最新データを取得して反映する
  async refreshInBackground() {
    try {
      const fetched = await this.fetchAll();
      this.applyData(fetched);
      this._saveCache(fetched);
      // ユーザーが操作を始めていなければ画面を最新化（入力中の画面は壊さない）
      if (AppState.currentView === 'upload' && !AppState.currentOcrResult) {
        this.navigateTo('upload');
      }
      UI.showToast('最新データに更新しました', 'success');
    } catch (err) {
      console.warn('[App] バックグラウンド更新失敗:', err.message);
      UI.showToast('最新データの取得に失敗しました（前回のデータを表示中）', 'warning');
    }
  },

  // 初期化失敗時のリトライ画面（ログイン詰まり対策）
  showInitError(err) {
    const msg = (err && err.message) || String(err);
    document.getElementById('main-content').innerHTML = `
      <div class="view-content">
        <div class="card" style="text-align:center;">
          <h2>読み込みに失敗しました</h2>
          <p style="color:#d33; margin: 12px 0;">${msg}</p>
          <p style="font-size: 13px; color:#666; margin-bottom: 16px;">
            通信状態をご確認のうえ、もう一度お試しください。<br>
            （しばらく使っていないとサーバーの起動に時間がかかることがあります）
          </p>
          <button class="btn btn-primary btn-large" id="btn-retry-init">再読み込み</button>
          <button class="btn btn-secondary" id="btn-open-settings" style="margin-top:8px;">設定を確認</button>
        </div>
      </div>`;
    document.getElementById('btn-retry-init')?.addEventListener('click', () => this.init());
    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      this.renderNavigation();
      this.showSettings();
    });
  },

  // 初回設定画面
  showSetup() {
    document.getElementById('main-content').innerHTML = `
      <div class="setup-screen">
        <h2>初期設定</h2>
        <p>APIキーとスプレッドシートIDを設定してください。</p>
        <div class="form-group">
          <label>Gemini APIキー</label>
          <input type="text" class="form-input" id="setup-gemini-key" placeholder="AIza...">
        </div>
        <div class="form-group">
          <label>Google Sheets APIキー</label>
          <input type="text" class="form-input" id="setup-sheets-key" placeholder="AIza...">
          <small>※ Geminiと同じキーでOKです（同じプロジェクトでSheets APIも有効化した場合）</small>
        </div>
        <div class="form-group">
          <label>スプレッドシートID</label>
          <input type="text" class="form-input" id="setup-sheet-id" placeholder="1b9fnHs86d...">
          <small>※ スプレッドシートURLの /d/ と /edit の間の文字列</small>
        </div>
        <button class="btn btn-primary btn-large" id="btn-save-setup">設定を保存して開始</button>
        <div class="setup-help">
          <h3>スプレッドシートの準備</h3>
          <p>以下の5つのシートを作成してください:</p>
          <ol>
            <li><strong>薬品マスター</strong> - 1行目にヘッダー: ID, 薬品名, 成分名, 規格, カテゴリ, 単位, 登録日, 備考</li>
            <li><strong>業者マスター</strong> - 1行目にヘッダー: ID, 業者名, 電話番号, 担当者名, 備考</li>
            <li><strong>価格テーブル</strong> - 1行目にヘッダー: ID, 薬品ID, 業者ID, 単価, 税込フラグ, 有効開始日, 登録日, ソース, 備考</li>
            <li><strong>成分グループ</strong> - 1行目にヘッダー: 成分名, 薬品IDリスト</li>
            <li><strong>アラート</strong> - 1行目にヘッダー: ID, 種別, 薬品ID, 業者ID, 基準価格, 新価格, 上昇率, 代替候補, 適用日, 作成日時, 確認済み, 確認日時</li>
          </ol>
          <p>スプレッドシートの共有設定を「リンクを知っている全員」→「編集者」に変更してください。</p>
        </div>
      </div>`;

    document.getElementById('btn-save-setup')?.addEventListener('click', () => {
      const geminiKey = document.getElementById('setup-gemini-key')?.value?.trim();
      const sheetsKey = document.getElementById('setup-sheets-key')?.value?.trim();
      const sheetId = document.getElementById('setup-sheet-id')?.value?.trim();

      if (!geminiKey || !sheetsKey || !sheetId) {
        UI.showToast('全ての項目を入力してください', 'error');
        return;
      }

      // localStorageに保存
      localStorage.setItem('yakuzai_gemini_key', geminiKey);
      localStorage.setItem('yakuzai_sheets_key', sheetsKey);
      localStorage.setItem('yakuzai_sheet_id', sheetId);

      CONFIG.GEMINI_API_KEY = geminiKey;
      CONFIG.SHEETS_API_KEY = sheetsKey;
      CONFIG.SPREADSHEET_ID = sheetId;

      this.init();
    });
  },

  // 全データの取得（ネットワークのみ、AppStateには触らない）
  async fetchAll() {
    const data = await SheetsAPI.loadAllData();

    // アラート（全端末同期）
    // readAllに含まれない場合はGAS経由で読む（Sheets API直読みはキー制限がある環境向けの最終手段）
    let alertRows = data[CONFIG.ALERTS_SHEET] || null;
    if (!alertRows) {
      try {
        alertRows = await SheetsAPI.readSheetViaGAS(CONFIG.ALERTS_SHEET);
      } catch (e1) {
        try {
          alertRows = await SheetsAPI.readSheet(CONFIG.ALERTS_SHEET);
        } catch (e2) {
          console.warn('[App] アラートシートを読み込めません（シート「アラート」の作成を確認）:', e1.message, '/', e2.message);
          alertRows = [];
        }
      }
    }
    return { data, alertRows };
  },

  // 取得済みデータをAppStateへ反映
  applyData({ data, alertRows }) {
    AppState.medicines = MedicineService.parseRows(data[CONFIG.SHEET_NAMES.MEDICINES]);
    AppState.prices = PriceService.parseRows(data[CONFIG.SHEET_NAMES.PRICES]);

    // 業者マスター
    const vendorRows = data[CONFIG.SHEET_NAMES.VENDORS] || [];
    AppState.vendors = vendorRows.length > 1
      ? vendorRows.slice(1).map(row => ({
          id: row[0] || '',
          name: row[1] || '',
          tel: row[2] || '',
          contact: row[3] || '',
          notes: row[4] || '',
        }))
      : [];

    // 成分グループ
    const groupRows = data[CONFIG.SHEET_NAMES.GROUPS] || [];
    AppState.groups = groupRows.length > 1
      ? groupRows.slice(1).map(row => ({
          ingredient: row[0] || '',
          medicineIds: (row[1] || '').split(',').map(s => s.trim()).filter(Boolean),
        }))
      : [];

    // アラート
    AppState.alerts = PriceAlertService.parseRows(alertRows || []);
  },

  // データ読み込み（取得 → 反映 → キャッシュ保存）
  async loadData() {
    const fetched = await this.fetchAll();
    this.applyData(fetched);
    this._saveCache(fetched);
  },

  // ナビゲーション描画
  renderNavigation() {
    const nav = document.getElementById('bottom-nav');
    nav.innerHTML = `
      <button class="nav-btn active" data-view="upload">
        <span class="nav-icon">📷</span>
        <span class="nav-label">読取り</span>
      </button>
      <button class="nav-btn" data-view="medicines">
        <span class="nav-icon">💊</span>
        <span class="nav-label">薬品</span>
      </button>
      <button class="nav-btn" data-view="prices">
        <span class="nav-icon">💰</span>
        <span class="nav-label">価格</span>
      </button>
      <button class="nav-btn" data-view="compare">
        <span class="nav-icon">📊</span>
        <span class="nav-label">比較</span>
      </button>
      <button class="nav-btn" data-view="order" id="nav-btn-order">
        <span class="nav-icon">📋</span>
        <span class="nav-label">発注</span>
      </button>
      <button class="nav-btn" data-view="inventory">
        <span class="nav-icon">🗂️</span>
        <span class="nav-label">在庫一覧</span>
      </button>
      <button class="nav-btn" data-view="pricelist">
        <span class="nav-icon">🖨</span>
        <span class="nav-label">価格表</span>
      </button>
      <button class="nav-btn" data-view="settings">
        <span class="nav-icon">⚙️</span>
        <span class="nav-label">設定</span>
      </button>`;

    nav.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.view === 'settings') {
          this.showSettings();
        } else {
          this.navigateTo(btn.dataset.view);
        }
      });
    });
  },

  // 画面遷移
  navigateTo(viewName) {
    const view = this.views[viewName];
    if (!view) return;

    AppState.currentView = viewName;
    const container = document.getElementById('main-content');
    container.innerHTML = view.render();
    view.init();

    // ナビゲーションのアクティブ状態更新
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // 発注タブに未確認アラートバッジを表示
    const alertCount = PriceAlertService.activeCount();
    const orderBtn = document.getElementById('nav-btn-order');
    if (orderBtn) {
      const existing = orderBtn.querySelector('.nav-alert-badge');
      if (existing) existing.remove();
      if (alertCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'nav-alert-badge';
        badge.textContent = alertCount;
        orderBtn.appendChild(badge);
      }
    }
  },

  // データリロード
  async reloadData() {
    try {
      UI.showLoading('データを再読み込み中...');
      await this.loadData();
      this.navigateTo(AppState.currentView);
      UI.showToast('データを再読み込みしました', 'success');
    } catch (err) {
      UI.showToast(`再読み込みエラー: ${err.message}`, 'error');
    } finally {
      UI.hideLoading();
    }
  },

  // 設定画面
  showSettings() {
    const container = document.getElementById('main-content');
    container.innerHTML = `
      <div class="view-content">
        <h2>設定</h2>
        <div class="card">
          <button class="btn btn-secondary btn-block" id="btn-reload">データ再読み込み</button>
        </div>
        <div class="card">
          <h3>API設定</h3>
          <div class="form-group">
            <label>Gemini APIキー</label>
            <input type="password" class="form-input" id="setting-gemini-key" value="${CONFIG.GEMINI_API_KEY}">
          </div>
          <div class="form-group">
            <label>Sheets APIキー</label>
            <input type="password" class="form-input" id="setting-sheets-key" value="${CONFIG.SHEETS_API_KEY}">
          </div>
          <div class="form-group">
            <label>スプレッドシートID</label>
            <input type="text" class="form-input" id="setting-sheet-id" value="${CONFIG.SPREADSHEET_ID}">
          </div>
          <button class="btn btn-primary" id="btn-save-settings">設定を保存</button>
        </div>
        <div class="card">
          <h3>データ概要</h3>
          <p>薬品: ${AppState.medicines.length}件</p>
          <p>業者: ${AppState.vendors.length}件</p>
          <p>価格データ: ${AppState.prices.length}件</p>
        </div>
      </div>`;

    document.getElementById('btn-reload')?.addEventListener('click', () => this.reloadData());
    document.getElementById('btn-save-settings')?.addEventListener('click', () => {
      const gk = document.getElementById('setting-gemini-key')?.value?.trim();
      const sk = document.getElementById('setting-sheets-key')?.value?.trim();
      const si = document.getElementById('setting-sheet-id')?.value?.trim();
      if (gk) { CONFIG.GEMINI_API_KEY = gk; localStorage.setItem('yakuzai_gemini_key', gk); }
      if (sk) { CONFIG.SHEETS_API_KEY = sk; localStorage.setItem('yakuzai_sheets_key', sk); }
      if (si) { CONFIG.SPREADSHEET_ID = si; localStorage.setItem('yakuzai_sheet_id', si); }
      UI.showToast('設定を保存しました', 'success');
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === 'settings');
    });
  },
};

// localStorageから設定を復元
(function restoreConfig() {
  const gk = localStorage.getItem('yakuzai_gemini_key');
  const sk = localStorage.getItem('yakuzai_sheets_key');
  const si = localStorage.getItem('yakuzai_sheet_id');
  if (gk) CONFIG.GEMINI_API_KEY = gk;
  if (sk) CONFIG.SHEETS_API_KEY = sk;
  if (si) CONFIG.SPREADSHEET_ID = si;
})();

// DOMContentLoaded で初期化
document.addEventListener('DOMContentLoaded', () => App.init());

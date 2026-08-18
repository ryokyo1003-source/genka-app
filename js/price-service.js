// 価格サービス
const PriceService = {
  getAll() {
    return AppState.prices;
  },

  // 薬品IDで価格一覧を取得（日付降順）
  getByMedicine(medicineId) {
    return AppState.prices
      .filter(p => p.medicineId === medicineId)
      .sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''));
  },

  // 業者IDで価格一覧を取得
  getByVendor(vendorId) {
    return AppState.prices.filter(p => p.vendorId === vendorId);
  },

  // ===== キャンペーン関連 =====

  // キャンペーン情報を取得
  // source が 'キャンペーン' を含む場合、notes に 'end:YYYY-MM-DD' で終了日を格納
  getCampaignInfo(price) {
    if (!price.source || !price.source.includes('キャンペーン')) return null;
    const match = (price.notes || '').match(/end:(\d{4}-\d{2}-\d{2})/);
    const endDate = match ? match[1] : null;
    const today = FormatUtils.today();
    const isActive = !endDate || endDate >= today;
    // 7日以内に終了
    const isExpiringSoon = isActive && endDate && endDate <= this._addDays(today, 7);
    return { endDate, isActive, isExpiringSoon };
  },

  _addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  },

  // キャンペーン終了日のデフォルト（当月末。端末のタイムゾーン基準）
  defaultCampaignEndDate() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  // ===== 価格取得 =====

  // 薬品の最新有効価格（期限切れキャンペーンは除外）
  // 各業者の最新かつ有効な価格のみ返す
  getLatestPrices(medicineId) {
    const byVendor = {};
    this.getByMedicine(medicineId).forEach(p => {
      const campaign = this.getCampaignInfo(p);
      // 期限切れキャンペーンはスキップ → その業者の前の定価が使われる
      if (campaign && !campaign.isActive) return;
      if (!byVendor[p.vendorId] ||
          (p.effectiveDate || '') > (byVendor[p.vendorId].effectiveDate || '')) {
        byVendor[p.vendorId] = p;
      }
    });
    return Object.values(byVendor);
  },

  // 全価格履歴（期限切れキャンペーン含む、推移表示用）
  getAllLatestByVendor(medicineId) {
    const byVendor = {};
    this.getByMedicine(medicineId).forEach(p => {
      if (!byVendor[p.vendorId] ||
          (p.effectiveDate || '') > (byVendor[p.vendorId].effectiveDate || '')) {
        byVendor[p.vendorId] = p;
      }
    });
    return Object.values(byVendor);
  },

  // 薬品の最安値を取得（有効価格のみ）
  getCheapest(medicineId) {
    const prices = this.getLatestPrices(medicineId);
    if (prices.length === 0) return null;
    return prices.reduce((min, p) => p.price < min.price ? p : min);
  },

  // 価格の異常チェック（入力・読み取り・数量/入数ミスの検知）
  // 既存の有効価格に対し、候補価格が2倍以上 or 半額以下なら anomaly=true
  priceAnomaly(medicineId, candidatePrice) {
    const price = parseFloat(candidatePrice);
    if (!medicineId || !price || isNaN(price) || price <= 0) return { anomaly: false };
    const prices = this.getLatestPrices(medicineId).map(p => p.price).filter(v => v > 0);
    if (prices.length === 0) return { anomaly: false };
    const refMin = Math.min(...prices);
    const refMax = Math.max(...prices);
    let anomaly = false, kind = null, ratio = 1;
    if (price >= refMax * 2)      { anomaly = true; kind = 'high'; ratio = price / refMax; }
    else if (price <= refMin / 2) { anomaly = true; kind = 'low';  ratio = refMin / price; }
    return { anomaly, kind, ratio, refMin, refMax };
  },

  // 全薬品の最安値マップ
  buildCheapestMap() {
    const map = {};
    const medicineIds = [...new Set(AppState.prices.map(p => p.medicineId))];
    medicineIds.forEach(mid => {
      const cheapest = this.getCheapest(mid);
      if (cheapest) map[mid] = cheapest;
    });
    return map;
  },

  // パッケージ情報をnotesから復元
  parsePkgInfo(price) {
    const match = (price.notes || '').match(/pkg:(\d+)@([\d.]+)/);
    if (!match) return { pkg_qty: 1, pkg_price: price.price };
    return { pkg_qty: parseInt(match[1]), pkg_price: parseFloat(match[2]) };
  },

  // 価格を登録
  // item に isCampaign: true, campaignEndDate: 'YYYY-MM-DD' → キャンペーン登録
  // item に pkg_qty: N, pkg_price: P → パッケージ情報を notes に保存
  async addPrices(items) {
    const existingIds = AppState.prices.map(p => p.id);
    const rows = items.map(item => {
      const id = FormatUtils.generateId('PRC', existingIds);
      existingIds.push(id);

      let source = item.source || '';
      let notes  = item.notes  || '';

      // キャンペーン情報
      if (item.isCampaign) {
        source = 'キャンペーン';
        if (item.campaignEndDate) {
          notes = `end:${item.campaignEndDate}${notes ? ' ' + notes : ''}`;
        }
      }

      // パッケージ情報（入数 > 1 の場合のみ保存）
      if (item.pkg_qty && item.pkg_qty > 1) {
        const pkgNote = `pkg:${item.pkg_qty}@${item.pkg_price || Math.round(item.price * item.pkg_qty)}`;
        notes = notes ? `${pkgNote} ${notes}` : pkgNote;
      }

      return [
        id,
        item.medicineId,
        item.vendorId,
        item.price,
        item.taxIncluded ? 'TRUE' : 'FALSE',
        item.effectiveDate || '',
        FormatUtils.today(),
        source,
        notes,
      ];
    });

    await SheetsAPI.appendRows(CONFIG.SHEET_NAMES.PRICES, rows);

    // 新行のシート行番号を割り当て（削除時にこの行番号で更新する）
    rows.forEach((row) => {
      const obj = this.rowToObject(null, row);
      this._lastRowIndex = (this._lastRowIndex || 1) + 1;
      obj._rowIndex = this._lastRowIndex;
      AppState.prices.push(obj);
    });

    return rows.length;
  },

  // 価格データを削除（ソフト削除: source列に "DELETED" を書く）
  // → 次回読込で除外される。スプレッドシートの行自体は残るため復元可能
  async deletePrice(priceId) {
    const idx = AppState.prices.findIndex(p => p.id === priceId);
    if (idx < 0) throw new Error('価格データが見つかりません');
    const price = AppState.prices[idx];
    if (!price._rowIndex) {
      throw new Error('行番号が不明です。データを再読み込みしてください');
    }

    // source列(H列)を "DELETED" に上書き
    await SheetsAPI.updateRange(
      CONFIG.SHEET_NAMES.PRICES,
      `H${price._rowIndex}`,
      [['DELETED']]
    );

    // ローカル状態からも除去
    AppState.prices.splice(idx, 1);
  },

  // 行データをオブジェクトに変換
  // ★ GAS経由の読み込みではセル値が数値・真偽値・日付のまま届くため、
  //   ここで文字列に正規化する（備考欄が数値だと .match() が落ちて画面が固まる）
  rowToObject(headers, row) {
    const s = v => (v == null ? '' : String(v));
    return {
      id: s(row[0]),
      medicineId: s(row[1]),
      vendorId: s(row[2]),
      price: parseFloat(row[3]) || 0,
      taxIncluded: row[4] === true || row[4] === 'TRUE',
      effectiveDate: FormatUtils.toDateOnly(row[5]),
      registeredDate: FormatUtils.toDateOnly(row[6]),
      source: s(row[7]),
      notes: s(row[8]),
    };
  },

  // 行配列をオブジェクト配列に変換
  // - DELETED な行を除外
  // - 元のシート行番号 (_rowIndex) を保持 → 削除時に使用
  parseRows(rows) {
    if (!rows || rows.length < 2) {
      this._lastRowIndex = rows?.length || 1;
      return [];
    }
    this._lastRowIndex = rows.length; // ヘッダー込みの末尾行
    return rows.slice(1)
      .map((row, i) => {
        const obj = this.rowToObject(rows[0], row);
        obj._rowIndex = i + 2; // 1=ヘッダー、2以降がデータ
        return obj;
      })
      .filter(p => p.id && p.source !== 'DELETED');
  },
};

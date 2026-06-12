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

  // キャンペーン終了日のデフォルト（当月末）
  defaultCampaignEndDate() {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
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

    rows.forEach(row => {
      AppState.prices.push(this.rowToObject(null, row));
    });

    return rows.length;
  },

  // 行データをオブジェクトに変換
  rowToObject(headers, row) {
    return {
      id: row[0] || '',
      medicineId: row[1] || '',
      vendorId: row[2] || '',
      price: parseFloat(row[3]) || 0,
      taxIncluded: row[4] === 'TRUE',
      effectiveDate: row[5] || '',
      registeredDate: row[6] || '',
      source: row[7] || '',
      notes: row[8] || '',
    };
  },

  parseRows(rows) {
    if (!rows || rows.length < 2) return [];
    return rows.slice(1).map(row => this.rowToObject(rows[0], row));
  },
};

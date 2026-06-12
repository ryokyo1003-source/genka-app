// 値上がり / 最安値より高く購入 アラートサービス
// 「問い合わせ済み」にするまで消えない永続アラートを管理する。
// ★ スプレッドシートの「アラート」シートに保存し、全端末で同期される。
//   列: A:ID B:種別 C:薬品ID D:業者ID E:基準価格 F:新価格 G:上昇率
//       H:代替候補(JSON) I:適用日 J:作成日時 K:確認済み L:確認日時
const PriceAlertService = {

  // シート行 → アラートオブジェクト（app.jsの初期ロードから呼ばれる）
  parseRows(rows) {
    if (!rows || rows.length < 2) return [];
    return rows.slice(1).map((row, i) => {
      let alternatives = [];
      try { alternatives = JSON.parse(row[7] || '[]'); } catch { /* 壊れたJSONは無視 */ }
      return {
        id:             row[0] || '',
        type:           row[1] || 'increase',
        medicineId:     row[2] || '',
        vendorId:       row[3] || '',
        oldPrice:       parseFloat(row[4]) || 0,
        newPrice:       parseFloat(row[5]) || 0,
        pctIncrease:    parseFloat(row[6]) || 0,
        alternatives,
        effectiveDate:  row[8] || '',
        createdAt:      row[9] || '',
        acknowledged:   row[10] === 'TRUE',
        acknowledgedAt: row[11] || '',
        key:            `${row[2]}_${row[3]}`,
        _row:           i + 2, // シート上の行番号（1行目はヘッダー）
      };
    }).filter(a => a.id);
  },

  // アラートオブジェクト → シート行
  _toRow(a) {
    return [
      a.id, a.type || 'increase', a.medicineId, a.vendorId,
      a.oldPrice, a.newPrice, a.pctIncrease,
      JSON.stringify((a.alternatives || []).slice(0, 5)),
      a.effectiveDate || '', a.createdAt || '',
      a.acknowledged ? 'TRUE' : 'FALSE', a.acknowledgedAt || '',
    ];
  },

  // 全アラートを取得（AppState.alerts は初期ロードでシートから読み込まれる）
  getAll() {
    return AppState.alerts || [];
  },

  // 未確認アラートのみ
  getActive() {
    return this.getAll().filter(a => !a.acknowledged);
  },

  // 特定薬品の未確認アラートを取得
  getForMedicine(medicineId) {
    return this.getAll().filter(a => a.medicineId === medicineId && !a.acknowledged);
  },

  // 未確認アラート件数
  activeCount() {
    return this.getActive().length;
  },

  // 値上がり検出 + 代替候補の検索
  // OCRで読み取った新価格 vs システム内の現在価格を比較する
  detectIncrease(medicineId, vendorId, newPrice) {
    const currentPrices = PriceService.getLatestPrices(medicineId);
    const sameVendorCurrent = currentPrices.find(p => p.vendorId === vendorId);

    // 同一業者の現在価格より値上がりしているか確認
    const isIncrease = sameVendorCurrent && newPrice > sameVendorCurrent.price;
    if (!isIncrease) return null;

    const medicine = MedicineService.findById(medicineId);
    const alternatives = [];

    // 同一薬品の他業者でnewPriceより安いもの
    currentPrices
      .filter(p => p.vendorId !== vendorId && p.price < newPrice)
      .forEach(p => {
        const vendor = AppState.vendors.find(v => v.id === p.vendorId);
        alternatives.push({
          type: 'same_medicine',
          medicineName: medicine?.name || '',
          medicineId,
          vendorName: vendor?.name || p.vendorId,
          price: p.price,
          diff: newPrice - p.price,
          diffPct: Math.round((newPrice - p.price) / newPrice * 100),
        });
      });

    // 同一成分の代替品（ジェネリック/後発品）でnewPriceより安いもの
    if (medicine?.ingredient) {
      MedicineService.findByIngredient(medicine.ingredient)
        .filter(m => m.id !== medicineId)
        .forEach(altMed => {
          PriceService.getLatestPrices(altMed.id)
            .filter(p => p.price < newPrice)
            .forEach(p => {
              const vendor = AppState.vendors.find(v => v.id === p.vendorId);
              alternatives.push({
                type: 'equivalent',
                medicineName: altMed.name,
                medicineId: altMed.id,
                vendorName: vendor?.name || p.vendorId,
                price: p.price,
                diff: newPrice - p.price,
                diffPct: Math.round((newPrice - p.price) / newPrice * 100),
              });
            });
        });
    }

    alternatives.sort((a, b) => a.price - b.price);

    return {
      type: 'increase',
      oldPrice: sameVendorCurrent.price,
      newPrice,
      pctIncrease: Math.round((newPrice - sameVendorCurrent.price) / sameVendorCurrent.price * 100),
      alternatives,
    };
  },

  // 最安値より高く購入したことを検出（納品書モード用）
  // 納品書で読み取った購入単価 vs 全業者の現在最安値を比較する。
  // ★ addPrices で今回の購入を登録する「前」に呼ぶこと（自分自身を最安に含めないため）
  detectOverpay(medicineId, vendorId, paidPrice) {
    if (!medicineId || !paidPrice || isNaN(paidPrice)) return null;

    const cheapest = PriceService.getCheapest(medicineId);
    if (!cheapest) return null;                  // 比較できる既存価格がない
    if (paidPrice <= cheapest.price) return null; // 最安値以下で購入できている → OK

    const medicine = MedicineService.findById(medicineId);
    const alternatives = [];

    // 同一薬品で購入単価より安い全業者
    PriceService.getLatestPrices(medicineId)
      .filter(p => p.price < paidPrice)
      .forEach(p => {
        const vendor = AppState.vendors.find(v => v.id === p.vendorId);
        alternatives.push({
          type: 'same_medicine',
          medicineName: medicine?.name || '',
          medicineId,
          vendorName: vendor?.name || p.vendorId,
          price: p.price,
          diff: paidPrice - p.price,
          diffPct: Math.round((paidPrice - p.price) / paidPrice * 100),
        });
      });

    // 同一成分の代替品（ジェネリック/後発品）で購入単価より安いもの
    if (medicine?.ingredient) {
      MedicineService.findByIngredient(medicine.ingredient)
        .filter(m => m.id !== medicineId)
        .forEach(altMed => {
          PriceService.getLatestPrices(altMed.id)
            .filter(p => p.price < paidPrice)
            .forEach(p => {
              const vendor = AppState.vendors.find(v => v.id === p.vendorId);
              alternatives.push({
                type: 'equivalent',
                medicineName: altMed.name,
                medicineId: altMed.id,
                vendorName: vendor?.name || p.vendorId,
                price: p.price,
                diff: paidPrice - p.price,
                diffPct: Math.round((paidPrice - p.price) / paidPrice * 100),
              });
            });
        });
    }

    alternatives.sort((a, b) => a.price - b.price);

    return {
      type: 'overpay',
      oldPrice: cheapest.price,   // 既知の最安値（参照値）
      newPrice: paidPrice,        // 今回の購入単価
      pctIncrease: Math.round((paidPrice - cheapest.price) / cheapest.price * 100),
      alternatives,
    };
  },

  // アラートを保存（同一薬品+業者+種別の既存アラートは上書き）
  // ★ シートへ書き込むため async。呼び出し側は await すること
  async saveAlert({ type, medicineId, vendorId, oldPrice, newPrice, pctIncrease, alternatives, effectiveDate }) {
    const alerts = this.getAll();
    const key = `${medicineId}_${vendorId}`;
    const alertType = type || 'increase';
    const existingIdx = alerts.findIndex(a => a.key === key && (a.type || 'increase') === alertType);
    const existing = existingIdx >= 0 ? alerts[existingIdx] : null;

    const alert = {
      id: existing
        ? existing.id
        : `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      key,
      type: alertType,
      medicineId,
      vendorId,
      oldPrice,
      newPrice,
      pctIncrease,
      alternatives: (alternatives || []).slice(0, 5),
      effectiveDate: effectiveDate || '',
      createdAt: new Date().toISOString(),
      acknowledged: false,
      acknowledgedAt: '',
    };

    const row = this._toRow(alert);
    if (existing) {
      // 既存行を上書き（再アラート: 確認済みでも未確認に戻す）
      alert._row = existing._row;
      await SheetsAPI.updateRange(CONFIG.ALERTS_SHEET, `A${alert._row}:L${alert._row}`, [row]);
      alerts[existingIdx] = alert;
    } else {
      // 末尾に追加（行番号 = 既知の最大行 + 1。1行目はヘッダー）
      alert._row = alerts.reduce((max, a) => Math.max(max, a._row || 1), 1) + 1;
      await SheetsAPI.appendRows(CONFIG.ALERTS_SHEET, [row]);
      alerts.push(alert);
    }
    return alert;
  },

  // 問い合わせ済み（アラートを解除）
  // ★ シートへ書き込むため async。呼び出し側は await すること
  async acknowledge(alertId) {
    const alert = this.getAll().find(a => a.id === alertId);
    if (!alert) return;
    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    await SheetsAPI.updateRange(
      CONFIG.ALERTS_SHEET,
      `K${alert._row}:L${alert._row}`,
      [['TRUE', alert.acknowledgedAt]]
    );
  },

  // アラートの警告HTML（OCR確認画面 / 価格一覧で共用）
  renderAlertBanner(alert, showAckButton = true) {
    const best = alert.alternatives[0];
    const vendorName = UI.vendorName(alert.vendorId);
    const medicineName = MedicineService.findById(alert.medicineId)?.name || '';

    const alternativeHtml = best
      ? `<div class="alert-alternative">
          <span class="alert-alt-label">${best.type === 'equivalent' ? '代替品' : '他社'}</span>
          <strong>${best.medicineName}</strong>（${best.vendorName}）
          ${FormatUtils.formatCurrency(best.price)}
          <span class="alert-diff">▼ ${FormatUtils.formatCurrency(best.diff)} (-${best.diffPct}%)</span>
        </div>`
      : `<div class="alert-alternative">他社の価格データがまだ登録されていません</div>`;

    const ackBtn = showAckButton
      ? `<button class="btn btn-acknowledge" data-alert-id="${alert.id}">問い合わせ済み</button>`
      : '';

    const isOverpay = alert.type === 'overpay';
    const title = isOverpay ? '最安値より高く購入' : '値上がり検知';
    const detail = isOverpay
      ? `最安 ${FormatUtils.formatCurrency(alert.oldPrice)} → 購入 ${FormatUtils.formatCurrency(alert.newPrice)}（+${alert.pctIncrease}%）`
      : `+${alert.pctIncrease}%（${FormatUtils.formatCurrency(alert.oldPrice)} → ${FormatUtils.formatCurrency(alert.newPrice)}）`;

    return `
      <div class="price-alert-banner ${isOverpay ? 'alert-overpay' : ''}" data-alert-id="${alert.id}">
        <div class="alert-header">
          <span class="alert-icon">⚠️</span>
          <span class="alert-title">${title}</span>
          <span class="alert-increase">${detail}</span>
        </div>
        ${alternativeHtml}
        ${ackBtn}
      </div>`;
  },
};

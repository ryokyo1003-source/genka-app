// 値上がりアラートサービス
// 「問い合わせ済み」にするまで消えない永続アラートを管理する
const PriceAlertService = {
  STORAGE_KEY: 'yakuzai_price_alerts',

  // 全アラートを取得
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch { return []; }
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

  // アラートを保存（同一薬品+業者の既存アラートは上書き）
  saveAlert({ type, medicineId, vendorId, oldPrice, newPrice, pctIncrease, alternatives, effectiveDate }) {
    const alerts = this.getAll();
    const key = `${medicineId}_${vendorId}`;
    const existingIdx = alerts.findIndex(a => a.key === key);
    const alert = {
      id: existingIdx >= 0
        ? alerts[existingIdx].id
        : `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      key,
      type: type || 'increase',
      medicineId,
      vendorId,
      oldPrice,
      newPrice,
      pctIncrease,
      alternatives: alternatives || [],
      effectiveDate: effectiveDate || '',
      createdAt: new Date().toISOString(),
      acknowledged: false,
      acknowledgedAt: null,
    };

    if (existingIdx >= 0) {
      alerts[existingIdx] = alert;
    } else {
      alerts.push(alert);
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
    return alert;
  },

  // 問い合わせ済み（アラートを解除）
  acknowledge(alertId) {
    const alerts = this.getAll();
    const alert = alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(alerts));
    }
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

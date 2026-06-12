// 価格一覧画面
const PriceView = {
  currentFilter: { vendor: '', category: '' },

  render() {
    return `
      <div class="view-content">
        <h2>価格一覧</h2>
        <div class="filter-bar">
          <select class="form-select" id="price-filter-vendor">
            <option value="">全業者</option>
          </select>
          <select class="form-select" id="price-filter-category">
            <option value="">全カテゴリ</option>
          </select>
        </div>
        <div id="price-alerts-summary"></div>
        <div id="price-list" class="card-list"></div>
      </div>`;
  },

  init() {
    this.populateFilters();
    this.renderAlertsSummary();
    this.renderList();

    document.getElementById('price-filter-vendor')?.addEventListener('change', (e) => {
      this.currentFilter.vendor = e.target.value;
      this.renderList();
    });
    document.getElementById('price-filter-category')?.addEventListener('change', (e) => {
      this.currentFilter.category = e.target.value;
      this.renderList();
    });
  },

  populateFilters() {
    const vendorSelect = document.getElementById('price-filter-vendor');
    AppState.vendors.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.name;
      vendorSelect?.appendChild(opt);
    });

    const catSelect = document.getElementById('price-filter-category');
    const categories = [...new Set(AppState.medicines.map(m => m.category).filter(Boolean))];
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      catSelect?.appendChild(opt);
    });
  },

  // 未確認アラートのサマリーバナー
  renderAlertsSummary() {
    const container = document.getElementById('price-alerts-summary');
    const activeAlerts = PriceAlertService.getActive();
    if (activeAlerts.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div class="alerts-summary-banner">
        <span>⚠️ <strong>${activeAlerts.length}件</strong>の値上がり未確認アラートがあります</span>
        <span class="alerts-hint">各薬品の下の「問い合わせ済み」を押すと解除されます</span>
      </div>`;
  },

  renderList() {
    const container = document.getElementById('price-list');
    const cheapestMap = PriceService.buildCheapestMap();

    let medicines = MedicineService.getAll();
    if (this.currentFilter.category) {
      medicines = medicines.filter(m => m.category === this.currentFilter.category);
    }

    // 価格があるもののみ
    medicines = medicines.filter(m => PriceService.getByMedicine(m.id).length > 0);

    if (medicines.length === 0) {
      container.innerHTML = '<p class="empty-message">価格データがありません</p>';
      return;
    }

    container.innerHTML = medicines.map(med => {
      let latestPrices = PriceService.getLatestPrices(med.id);
      if (this.currentFilter.vendor) {
        latestPrices = latestPrices.filter(p => p.vendorId === this.currentFilter.vendor);
      }
      if (latestPrices.length === 0) return '';

      const cheapest = cheapestMap[med.id];
      const priceRows = latestPrices
        .sort((a, b) => a.price - b.price)
        .map(p => {
          const isCheapest = cheapest && p.price === cheapest.price;
          return `
            <div class="price-row ${isCheapest ? 'price-cheapest' : ''}">
              <span class="price-vendor-name">${UI.vendorName(p.vendorId)}</span>
              <span class="price-amount">${FormatUtils.formatCurrency(p.price)}${p.taxIncluded ? ' (税込)' : ''}</span>
              ${isCheapest ? '<span class="badge badge-cheapest">最安</span>' : ''}
            </div>`;
        }).join('');

      // この薬品の未確認アラート
      const alerts = PriceAlertService.getForMedicine(med.id);
      const alertsHtml = alerts.map(alert => {
        const vendorName = UI.vendorName(alert.vendorId);
        const best = alert.alternatives[0];
        const alternativeHtml = best
          ? `<div class="alert-alternative">
              <span class="alert-alt-label">${best.type === 'equivalent' ? '代替品' : '他社'}</span>
              <strong>${best.medicineName}</strong>（${best.vendorName}）
              ${FormatUtils.formatCurrency(best.price)}
              <span class="alert-diff">▼ ${FormatUtils.formatCurrency(best.diff)} (-${best.diffPct}%)</span>
             </div>`
          : `<div class="alert-alternative">他社の価格データがまだ登録されていません</div>`;

        return `
          <div class="price-alert-banner" data-alert-id="${alert.id}">
            <div class="alert-header">
              <span class="alert-icon">⚠️</span>
              <span class="alert-title">値上がり検知</span>
              <span class="alert-increase">
                ${vendorName}: +${alert.pctIncrease}%（${FormatUtils.formatCurrency(alert.oldPrice)} → ${FormatUtils.formatCurrency(alert.newPrice)}）
              </span>
            </div>
            ${alternativeHtml}
            <button class="btn btn-acknowledge" data-alert-id="${alert.id}">問い合わせ済み</button>
          </div>`;
      }).join('');

      return `
        <div class="card price-card-wrap">
          <div class="price-card-main">
            <div class="card-title">${med.name}</div>
            <div class="card-subtitle">${med.specification || ''} ${med.category ? `[${med.category}]` : ''}</div>
            <div class="price-rows">${priceRows}</div>
          </div>
          ${alertsHtml}
        </div>`;
    }).filter(Boolean).join('');

    // 「問い合わせ済み」ボタンのイベント
    container.querySelectorAll('.btn-acknowledge').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const alertId = btn.dataset.alertId;
        PriceAlertService.acknowledge(alertId);
        UI.showToast('アラートを解除しました', 'success');
        this.renderAlertsSummary();
        this.renderList();
      });
    });
  },
};

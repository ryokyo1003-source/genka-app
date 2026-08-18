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
          // 最安値の3倍超は業者間の価格差ではありえない → 単位取り違えの疑い
          const unitSuspect = cheapest && p.price > cheapest.price * 3;
          // この業者×薬品の登録履歴件数（2件以上なら履歴ボタンを出す）
          const historyCount = AppState.prices.filter(
            x => x.medicineId === med.id && x.vendorId === p.vendorId
          ).length;
          const historyBtn = historyCount > 1
            ? `<button class="btn-price-history" data-medicine-id="${med.id}" data-vendor-id="${p.vendorId}" title="登録履歴を見る (${historyCount}件)">📋</button>`
            : '';
          return `
            <div class="price-row ${isCheapest ? 'price-cheapest' : ''}">
              <span class="price-vendor-name">${UI.vendorName(p.vendorId)}</span>
              <span class="price-amount">${FormatUtils.formatCurrency(p.price)}${p.taxIncluded ? ' (税込)' : ''}</span>
              ${isCheapest ? '<span class="badge badge-cheapest">最安</span>' : ''}
              ${unitSuspect ? '<span class="badge badge-unit-warn" title="最安値の3倍超 — 1箱と1錠の取り違えの可能性。誤りなら🗑で削除してください">⚠️ 単位確認</span>' : ''}
              ${historyBtn}
              <button class="btn-price-delete" data-price-id="${p.id}" title="この価格を削除">🗑</button>
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
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        btn.disabled = true;
        try {
          await PriceAlertService.acknowledge(btn.dataset.alertId);
          UI.showToast('アラートを解除しました', 'success');
          this.renderAlertsSummary();
          this.renderList();
        } catch (err) {
          btn.disabled = false;
          UI.showToast(`解除に失敗しました: ${err.message}`, 'error');
        }
      });
    });

    // 価格削除ボタン
    container.querySelectorAll('.btn-price-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleDeletePrice(btn.dataset.priceId, btn);
      });
    });

    // 履歴ボタン
    container.querySelectorAll('.btn-price-history').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showPriceHistory(btn.dataset.medicineId, btn.dataset.vendorId);
      });
    });
  },

  // 価格データを削除（確認ダイアログ付き）
  async handleDeletePrice(priceId, btn) {
    const price = AppState.prices.find(p => p.id === priceId);
    if (!price) return;
    const med = MedicineService.findById(price.medicineId);
    const vendorName = UI.vendorName(price.vendorId);
    const dateStr = price.effectiveDate ? `（${FormatUtils.formatDate(price.effectiveDate)}）` : '';

    const ok = await UI.confirm(
      `「${med?.name || '?'}」${dateStr}<br>` +
      `業者: ${vendorName}<br>` +
      `価格: ${FormatUtils.formatCurrency(price.price)}<br><br>` +
      `この価格データを削除します。よろしいですか？`
    );
    if (!ok) return;

    if (btn) btn.disabled = true;
    UI.showLoading('削除中...');
    try {
      await PriceService.deletePrice(priceId);
      UI.showToast('価格データを削除しました', 'success');
      this.renderAlertsSummary();
      this.renderList();
    } catch (err) {
      if (btn) btn.disabled = false;
      UI.showToast(`削除に失敗: ${err.message}`, 'error');
    } finally {
      UI.hideLoading();
    }
  },

  // 同一業者×薬品の全登録履歴をモーダルで表示（履歴からも削除可能）
  showPriceHistory(medicineId, vendorId) {
    const allPrices = AppState.prices
      .filter(p => p.medicineId === medicineId && p.vendorId === vendorId)
      .sort((a, b) => (b.effectiveDate || b.registeredDate || '')
        .localeCompare(a.effectiveDate || a.registeredDate || ''));

    const med = MedicineService.findById(medicineId);
    const vendorName = UI.vendorName(vendorId);

    const rowsHtml = allPrices.map((p, i) => {
      const isLatest = i === 0;
      return `
        <div class="price-history-row">
          <div class="price-history-info">
            <span class="price-history-amount">${FormatUtils.formatCurrency(p.price)}${p.taxIncluded ? ' (税込)' : ''}</span>
            ${isLatest ? '<span class="badge badge-latest">最新</span>' : ''}
            ${p.source ? `<span class="price-history-source">${p.source}</span>` : ''}
          </div>
          <div class="price-history-meta">
            <span class="price-history-date">適用: ${FormatUtils.formatDate(p.effectiveDate)}</span>
            <span class="price-history-reg">登録: ${FormatUtils.formatDate(p.registeredDate)}</span>
          </div>
          <button class="btn btn-danger btn-small btn-history-delete" data-price-id="${p.id}">削除</button>
        </div>`;
    }).join('');

    UI.showModal(
      `登録履歴 (${allPrices.length}件)`,
      `<p class="modal-subtitle"><strong>${med?.name || ''}</strong><br>業者: ${vendorName}</p>
       <div class="price-history-list">${rowsHtml}</div>`,
      [{ label: '閉じる', action: 'close', class: 'btn-secondary' }]
    );

    // モーダル内の削除ボタンをバインド
    document.querySelectorAll('.btn-history-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const priceId = btn.dataset.priceId;
        if (!(await UI.confirm('この価格データを削除しますか？'))) return;
        btn.disabled = true;
        UI.showLoading('削除中...');
        try {
          await PriceService.deletePrice(priceId);
          UI.closeModal();
          UI.showToast('価格データを削除しました', 'success');
          this.renderAlertsSummary();
          this.renderList();
        } catch (err) {
          btn.disabled = false;
          UI.showToast(`削除に失敗: ${err.message}`, 'error');
        } finally {
          UI.hideLoading();
        }
      });
    });
  },
};

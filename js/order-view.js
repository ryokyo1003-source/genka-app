// 発注管理画面
// ・発注推奨リスト（最安業者別グループ + テキスト出力）
// ・コスト削減試算
// ・問い合わせリスト（未確認アラート）
// ・キャンペーン価格の有効期限警告
const OrderView = {
  currentTab: 'recommend',

  render() {
    return `
      <div class="view-content">
        <h2>発注管理</h2>
        <div class="compare-tabs">
          <button class="tab-btn active" data-tab="recommend">発注推奨</button>
          <button class="tab-btn" data-tab="savings">削減試算</button>
          <button class="tab-btn" data-tab="inquiries">問い合わせ</button>
        </div>
        <div id="order-tab-recommend" class="order-panel"></div>
        <div id="order-tab-savings" class="order-panel hidden"></div>
        <div id="order-tab-inquiries" class="order-panel hidden"></div>
      </div>`;
  },

  init() {
    this.currentTab = 'recommend';
    document.querySelectorAll('.compare-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.compare-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('.order-panel').forEach(p => p.classList.add('hidden'));
        const tab = e.target.dataset.tab;
        document.getElementById(`order-tab-${tab}`)?.classList.remove('hidden');
        this.currentTab = tab;
        if (tab === 'recommend') this.renderRecommend();
        if (tab === 'savings') this.renderSavings();
        if (tab === 'inquiries') this.renderInquiries();
      });
    });
    this.renderRecommend();
    this.renderCampaignAlerts();
  },

  // ===== キャンペーン有効期限警告 =====
  renderCampaignAlerts() {
    const today = FormatUtils.today();
    const warnings = [];

    AppState.medicines.forEach(med => {
      PriceService.getAllLatestByVendor(med.id).forEach(p => {
        const campaign = PriceService.getCampaignInfo(p);
        if (!campaign) return;
        if (campaign.isExpiringSoon) {
          const vendor = AppState.vendors.find(v => v.id === p.vendorId);
          warnings.push({
            type: 'expiring',
            medicineName: med.name,
            vendorName: vendor?.name || p.vendorId,
            price: p.price,
            endDate: campaign.endDate,
          });
        } else if (!campaign.isActive) {
          const vendor = AppState.vendors.find(v => v.id === p.vendorId);
          warnings.push({
            type: 'expired',
            medicineName: med.name,
            vendorName: vendor?.name || p.vendorId,
            price: p.price,
            endDate: campaign.endDate,
          });
        }
      });
    });

    if (warnings.length === 0) return;

    const container = document.getElementById('order-tab-recommend');
    const banner = document.createElement('div');
    banner.className = 'campaign-alert-block';
    banner.innerHTML = `
      <div class="campaign-alert-header">🎯 キャンペーン価格の有効期限警告</div>
      ${warnings.map(w => `
        <div class="campaign-alert-row ${w.type}">
          <span class="campaign-alert-icon">${w.type === 'expired' ? '⛔' : '⏰'}</span>
          <span class="campaign-alert-body">
            <strong>${w.medicineName}</strong>（${w.vendorName}）
            ${FormatUtils.formatCurrency(w.price)}
            ${w.type === 'expired'
              ? `キャンペーン終了（${FormatUtils.formatDate(w.endDate)}）— 現在の実勢価格を要確認`
              : `キャンペーン終了間近（${FormatUtils.formatDate(w.endDate)}）`}
          </span>
        </div>`).join('')}`;
    container.prepend(banner);
  },

  // ===== 発注推奨リスト =====
  renderRecommend() {
    const container = document.getElementById('order-tab-recommend');
    container.innerHTML = '';
    this.renderCampaignAlerts();

    const cheapestMap = PriceService.buildCheapestMap();
    if (Object.keys(cheapestMap).length === 0) {
      container.innerHTML += '<p class="empty-message">価格データがありません</p>';
      return;
    }

    // 業者別にグループ化
    const byVendor = {};
    Object.entries(cheapestMap).forEach(([medicineId, price]) => {
      const med = MedicineService.findById(medicineId);
      if (!med) return;
      if (!byVendor[price.vendorId]) byVendor[price.vendorId] = [];
      byVendor[price.vendorId].push({ med, price });
    });

    const vendorBlocks = Object.entries(byVendor).map(([vendorId, items]) => {
      const vendor = AppState.vendors.find(v => v.id === vendorId);
      const vendorName = vendor?.name || vendorId;
      const campaign = items.some(({ price }) => PriceService.getCampaignInfo(price)?.isActive);

      const rows = items.map(({ med, price }) => {
        const campaignInfo = PriceService.getCampaignInfo(price);
        const campaignBadge = campaignInfo?.isActive
          ? `<span class="badge badge-campaign">🎯 キャンペーン〜${FormatUtils.formatDate(campaignInfo.endDate)}</span>`
          : '';
        return `
          <div class="order-item-row">
            <span class="order-item-name">${med.name}</span>
            <span class="order-item-spec">${med.specification || ''}</span>
            <span class="order-item-price">${FormatUtils.formatCurrency(price.price)}${price.taxIncluded ? '(税込)' : ''}</span>
            ${campaignBadge}
          </div>`;
      }).join('');

      return `
        <div class="card order-vendor-card">
          <div class="order-vendor-header">
            <span class="order-vendor-name">${vendorName}</span>
            <span class="order-count">${items.length}品目</span>
            ${campaign ? '<span class="badge badge-campaign-sm">🎯キャンペーン含む</span>' : ''}
          </div>
          ${rows}
        </div>`;
    }).join('');

    container.innerHTML += `
      ${vendorBlocks}
      <button class="btn btn-secondary btn-block" id="btn-export-order">テキスト出力（コピー用）</button>`;

    document.getElementById('btn-export-order')?.addEventListener('click', () => {
      this.exportOrderText(byVendor);
    });
  },

  exportOrderText(byVendor) {
    const today = FormatUtils.formatDate(FormatUtils.today());
    let text = `=== 最安発注リスト (${today}) ===\n\n`;

    Object.entries(byVendor).forEach(([vendorId, items]) => {
      const vendor = AppState.vendors.find(v => v.id === vendorId);
      text += `■ ${vendor?.name || vendorId}\n`;
      items.forEach(({ med, price }) => {
        const campaign = PriceService.getCampaignInfo(price);
        const tag = campaign?.isActive ? ` [🎯キャンペーン〜${price.notes?.match(/end:(\S+)/)?.[1] || ''}]` : '';
        text += `  - ${med.name}${med.specification ? ' ' + med.specification : ''}: ${FormatUtils.formatCurrency(price.price)}${tag}  × ___\n`;
      });
      text += '\n';
    });
    text += '=== 以上 ===';

    // クリップボードにコピー
    navigator.clipboard.writeText(text).then(() => {
      UI.showToast('発注リストをコピーしました', 'success');
    }).catch(() => {
      UI.showModal('発注リスト', `<pre class="export-text">${text}</pre>`, [
        { label: '閉じる', action: 'close', class: 'btn-secondary' },
      ]);
    });
  },

  // ===== コスト削減試算 =====
  renderSavings() {
    const container = document.getElementById('order-tab-savings');

    const cheapestMap = PriceService.buildCheapestMap();
    const rows = [];
    let totalSavingsPerUnit = 0;

    AppState.medicines.forEach(med => {
      const allLatest = PriceService.getAllLatestByVendor(med.id);
      if (allLatest.length < 2) return;

      const cheapest = cheapestMap[med.id];
      if (!cheapest) return;

      const mostExpensive = allLatest.reduce((max, p) => p.price > max.price ? p : max);
      if (cheapest.price >= mostExpensive.price) return;

      const savings = mostExpensive.price - cheapest.price;
      const savingsPct = Math.round(savings / mostExpensive.price * 100);
      totalSavingsPerUnit += savings;

      const cheapestVendor = AppState.vendors.find(v => v.id === cheapest.vendorId);
      const expensiveVendor = AppState.vendors.find(v => v.id === mostExpensive.vendorId);
      const campaignInfo = PriceService.getCampaignInfo(cheapest);

      rows.push({ med, cheapest, cheapestVendor, mostExpensive, expensiveVendor, savings, savingsPct, campaignInfo });
    });

    if (rows.length === 0) {
      container.innerHTML = `
        <div class="savings-summary-card card">
          <p>複数の業者に価格データが登録されている薬品がありません。<br>同一薬品を複数業者から登録すると試算できます。</p>
        </div>`;
      return;
    }

    const tableRows = rows.sort((a, b) => b.savings - a.savings).map(r => `
      <tr>
        <td>
          <div class="savings-med-name">${r.med.name}</div>
          <div class="savings-med-spec">${r.med.specification || ''}</div>
        </td>
        <td class="savings-vendor">${r.expensiveVendor?.name || r.mostExpensive.vendorId}<br><span class="savings-price-high">${FormatUtils.formatCurrency(r.mostExpensive.price)}</span></td>
        <td class="savings-vendor">${r.cheapestVendor?.name || r.cheapest.vendorId}<br><span class="savings-price-low">${FormatUtils.formatCurrency(r.cheapest.price)}</span>
          ${r.campaignInfo?.isActive ? `<br><span class="badge badge-campaign-sm">🎯〜${FormatUtils.formatDate(r.campaignInfo.endDate)}</span>` : ''}
        </td>
        <td class="savings-diff"><strong>▼ ${FormatUtils.formatCurrency(r.savings)}</strong><br>(-${r.savingsPct}%)</td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="savings-summary-card card">
        <div class="savings-summary-title">単価ベース 最大削減可能額</div>
        <div class="savings-summary-amount">${FormatUtils.formatCurrency(totalSavingsPerUnit)}</div>
        <div class="savings-summary-note">（全品を最安業者に切り替えた場合、1単位あたりの合計）</div>
        <p class="savings-campaign-note">⚠️ キャンペーン価格（🎯）は期間終了後に変動する可能性があります</p>
      </div>
      <div class="card">
        <table class="data-table savings-table">
          <thead>
            <tr>
              <th>薬品名</th>
              <th>現在最高<br>（業者）</th>
              <th>最安値<br>（業者）</th>
              <th>差額/単位</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;
  },

  // ===== 問い合わせリスト =====
  renderInquiries() {
    const container = document.getElementById('order-tab-inquiries');
    const alerts = PriceAlertService.getActive();

    if (alerts.length === 0) {
      container.innerHTML = `
        <div class="card">
          <p class="empty-message">未確認の値上がりアラートはありません</p>
        </div>`;
      return;
    }

    // 業者別にグループ化
    const byVendor = {};
    alerts.forEach(alert => {
      if (!byVendor[alert.vendorId]) byVendor[alert.vendorId] = [];
      byVendor[alert.vendorId].push(alert);
    });

    const blocks = Object.entries(byVendor).map(([vendorId, vendorAlerts]) => {
      const vendor = AppState.vendors.find(v => v.id === vendorId);
      const vendorName = vendor?.name || vendorId;

      const rows = vendorAlerts.map(alert => {
        const med = MedicineService.findById(alert.medicineId);
        const best = alert.alternatives[0];
        const isOverpay = alert.type === 'overpay';
        const label = isOverpay
          ? `最安より高く購入: 最安 ${FormatUtils.formatCurrency(alert.oldPrice)} → 購入 ${FormatUtils.formatCurrency(alert.newPrice)} (+${alert.pctIncrease}%)`
          : `値上がり: ${FormatUtils.formatCurrency(alert.oldPrice)} → ${FormatUtils.formatCurrency(alert.newPrice)} (+${alert.pctIncrease}%)`;
        return `
          <div class="inquiry-row">
            <div class="inquiry-med">
              <strong>${med?.name || alert.medicineId}</strong>
              <span class="inquiry-increase">${label}</span>
              ${best ? `<span class="inquiry-alt">${best.type === 'equivalent' ? '代替品' : '他社'}: ${best.medicineName}（${best.vendorName}）${FormatUtils.formatCurrency(best.price)}</span>` : ''}
            </div>
            <button class="btn btn-acknowledge btn-small" data-alert-id="${alert.id}">確認済み</button>
          </div>`;
      }).join('');

      return `
        <div class="card inquiry-vendor-card">
          <div class="inquiry-vendor-name">📞 ${vendorName}</div>
          ${rows}
        </div>`;
    }).join('');

    container.innerHTML = `
      ${blocks}
      <button class="btn btn-secondary btn-block" id="btn-export-inquiry">問い合わせリストをコピー</button>`;

    container.querySelectorAll('.btn-acknowledge').forEach(btn => {
      btn.addEventListener('click', () => {
        PriceAlertService.acknowledge(btn.dataset.alertId);
        UI.showToast('アラートを解除しました', 'success');
        this.renderInquiries();
      });
    });

    document.getElementById('btn-export-inquiry')?.addEventListener('click', () => {
      this.exportInquiryText(byVendor);
    });
  },

  exportInquiryText(byVendor) {
    const today = FormatUtils.formatDate(FormatUtils.today());
    let text = `=== 価格問い合わせリスト (${today}) ===\n\n`;

    Object.entries(byVendor).forEach(([vendorId, alerts]) => {
      const vendor = AppState.vendors.find(v => v.id === vendorId);
      text += `■ ${vendor?.name || vendorId}\n`;
      if (vendor?.tel) text += `  TEL: ${vendor.tel}\n`;
      alerts.forEach(alert => {
        const med = MedicineService.findById(alert.medicineId);
        const best = alert.alternatives[0];
        const head = alert.type === 'overpay' ? '最安より高く購入' : '値上がり';
        text += `  - ${med?.name || ''}: ${head} +${alert.pctIncrease}%（${FormatUtils.formatCurrency(alert.oldPrice)}→${FormatUtils.formatCurrency(alert.newPrice)}）\n`;
        if (best) text += `    → ${best.type === 'equivalent' ? '代替品' : '他社'} ${best.medicineName}（${best.vendorName}）${FormatUtils.formatCurrency(best.price)} の確認を推奨\n`;
      });
      text += '\n';
    });
    text += '=== 以上 ===';

    navigator.clipboard.writeText(text).then(() => {
      UI.showToast('問い合わせリストをコピーしました', 'success');
    }).catch(() => {
      UI.showModal('問い合わせリスト', `<pre class="export-text">${text}</pre>`, [
        { label: '閉じる', action: 'close', class: 'btn-secondary' },
      ]);
    });
  },
};

// 薬品マスター一覧画面
const MedicineView = {
  render() {
    return `
      <div class="view-content">
        <div class="view-header">
          <h2>薬品マスター</h2>
          <button class="btn btn-primary btn-small" id="btn-add-medicine">+ 追加</button>
        </div>
        <div class="search-bar">
          <input type="text" class="form-input" id="medicine-search" placeholder="薬品名・成分名で検索...">
        </div>
        <div id="medicine-list" class="card-list"></div>
      </div>`;
  },

  init() {
    this.renderList();
    document.getElementById('medicine-search')?.addEventListener('input', (e) => {
      this.renderList(e.target.value);
    });
    document.getElementById('btn-add-medicine')?.addEventListener('click', () => {
      this.showAddModal();
    });
  },

  renderList(query = '') {
    const medicines = query ? MedicineService.search(query) : MedicineService.getAll();
    const cheapestMap = PriceService.buildCheapestMap();
    const container = document.getElementById('medicine-list');

    if (medicines.length === 0) {
      container.innerHTML = '<p class="empty-message">薬品が登録されていません</p>';
      return;
    }

    container.innerHTML = medicines.map(med => {
      const cheapest = cheapestMap[med.id];
      const priceCount = PriceService.getByMedicine(med.id).length;
      return `
        <div class="card medicine-card" data-id="${med.id}">
          <div class="card-main">
            <div class="card-title">${med.name}</div>
            <div class="card-subtitle">${med.ingredient || ''} ${med.specification || ''}</div>
            <div class="card-tags">
              ${med.category ? `<span class="tag">${med.category}</span>` : ''}
              ${med.unit ? `<span class="tag">${med.unit}</span>` : ''}
            </div>
          </div>
          <div class="card-right">
            ${cheapest ? `
              <div class="price-display">${FormatUtils.formatCurrency(cheapest.price)}</div>
              <div class="price-vendor">${UI.vendorName(cheapest.vendorId)}</div>
            ` : '<div class="price-display">-</div>'}
            <div class="price-count">${priceCount}件</div>
          </div>
        </div>`;
    }).join('');

    // カードクリックで詳細
    container.querySelectorAll('.medicine-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showDetail(card.dataset.id);
      });
    });
  },

  showDetail(medicineId) {
    const med = MedicineService.findById(medicineId);
    if (!med) return;

    const prices = PriceService.getLatestPrices(medicineId);
    const history = PriceService.getByMedicine(medicineId);
    const sameIngredient = med.ingredient ? MedicineService.findByIngredient(med.ingredient) : [];

    // 現在の有効価格（最安ハイライト・キャンペーンバッジ）
    const cheapest = prices.length > 0 ? prices.reduce((min, pp) => pp.price < min.price ? pp : min) : null;
    const pricesHtml = prices.length > 0
      ? `<table class="data-table">
          <thead><tr><th>業者</th><th>単価</th><th>適用日</th></tr></thead>
          <tbody>${prices.map(p => {
            const campaign = PriceService.getCampaignInfo(p);
            return `<tr class="${cheapest && p.id === cheapest.id ? 'row-cheapest' : ''}">
              <td>${UI.vendorName(p.vendorId)}</td>
              <td>
                ${FormatUtils.formatCurrency(p.price)}${p.taxIncluded ? ' (税込)' : ''}
                ${campaign?.isActive ? `<span class="badge badge-campaign-sm">🎯〜${FormatUtils.formatDate(campaign.endDate)}</span>` : ''}
                ${cheapest && p.id === cheapest.id ? '<span class="recommend-label">推奨</span>' : ''}
              </td>
              <td>${FormatUtils.formatDate(p.effectiveDate)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`
      : '<p>価格情報なし</p>';

    // 価格推移表（直近10件）
    const recentHistory = history.slice(0, 10);
    const historyHtml = recentHistory.length > 1
      ? `<h4>価格推移（直近${recentHistory.length}件）</h4>
         <table class="data-table price-history-table">
           <thead><tr><th>適用日</th><th>業者</th><th>単価</th><th>前回比</th></tr></thead>
           <tbody>
             ${recentHistory.map((p, i) => {
               const prev = recentHistory.find((pp, j) => j > i && pp.vendorId === p.vendorId);
               const campaign = PriceService.getCampaignInfo(p);
               let trendHtml = '-';
               if (prev) {
                 const diff = p.price - prev.price;
                 if (diff > 0) trendHtml = `<span class="trend-up">▲ +${FormatUtils.formatCurrency(diff)}</span>`;
                 else if (diff < 0) trendHtml = `<span class="trend-down">▼ ${FormatUtils.formatCurrency(Math.abs(diff))}</span>`;
                 else trendHtml = '<span class="trend-flat">→</span>';
               }
               return `<tr>
                 <td>${FormatUtils.formatDate(p.effectiveDate)}</td>
                 <td>${UI.vendorName(p.vendorId)}</td>
                 <td>
                   ${FormatUtils.formatCurrency(p.price)}
                   ${campaign?.isActive ? '<span class="badge badge-campaign-sm">🎯</span>' : ''}
                   ${campaign && !campaign.isActive ? '<span class="badge badge-expired">終了</span>' : ''}
                 </td>
                 <td>${trendHtml}</td>
               </tr>`;
             }).join('')}
           </tbody>
         </table>`
      : '';

    // 同一成分の代替品（価格付き）
    const relatedMeds = sameIngredient.filter(m => m.id !== medicineId);
    const relatedHtml = relatedMeds.length > 0
      ? `<h4>同一成分の代替品</h4>
         <div class="related-medicines-list">
           ${relatedMeds.map(m => {
             const altCheapest = PriceService.getCheapest(m.id);
             const altVendor = altCheapest ? AppState.vendors.find(v => v.id === altCheapest.vendorId) : null;
             const altCampaign = altCheapest ? PriceService.getCampaignInfo(altCheapest) : null;
             return `<div class="related-med-row">
               <span class="tag">${m.name}</span>
               ${altCheapest
                 ? `<span class="related-price">${FormatUtils.formatCurrency(altCheapest.price)}（${altVendor?.name || ''}）${altCampaign?.isActive ? ' 🎯' : ''}</span>`
                 : '<span class="related-price-none">価格未登録</span>'}
             </div>`;
           }).join('')}
         </div>`
      : '';

    UI.showModal(med.name, `
      <div class="medicine-detail">
        <div class="detail-info">
          <p><strong>成分:</strong> ${med.ingredient || '-'}</p>
          <p><strong>規格:</strong> ${med.specification || '-'}</p>
          <p><strong>カテゴリ:</strong> ${med.category || '-'}</p>
          <p><strong>単位:</strong> ${med.unit || '-'}</p>
        </div>
        <h4>現在の最新価格</h4>
        ${pricesHtml}
        ${historyHtml}
        ${relatedHtml}
      </div>
    `, [{ label: '閉じる', action: 'close', class: 'btn-secondary' }]);
  },

  showAddModal() {
    UI.showModal('新規薬品追加', `
      <div class="form-group"><label>薬品名 *</label><input type="text" class="form-input" id="add-med-name"></div>
      <div class="form-group"><label>有効成分</label><input type="text" class="form-input" id="add-med-ingredient"></div>
      <div class="form-group"><label>規格</label><input type="text" class="form-input" id="add-med-spec"></div>
      <div class="form-group"><label>カテゴリ</label>
        <select class="form-select" id="add-med-category">
          <option value="">選択...</option>
          <option>抗生物質</option><option>消炎鎮痛</option><option>ワクチン</option>
          <option>麻酔</option><option>輸液</option><option>サプリメント</option><option>その他</option>
        </select>
      </div>
      <div class="form-group"><label>単位</label><input type="text" class="form-input" id="add-med-unit" placeholder="錠, 本, mL..."></div>
    `, [
      { label: 'キャンセル', action: 'close', class: 'btn-secondary' },
      { label: '追加', action: 'add', class: 'btn-primary', onClick: async () => {
        const name = document.getElementById('add-med-name')?.value;
        if (!name) { UI.showToast('薬品名を入力してください', 'error'); return; }
        await MedicineService.add({
          name,
          ingredient: document.getElementById('add-med-ingredient')?.value || '',
          specification: document.getElementById('add-med-spec')?.value || '',
          category: document.getElementById('add-med-category')?.value || '',
          unit: document.getElementById('add-med-unit')?.value || '',
        });
        UI.closeModal();
        UI.showToast(`「${name}」を追加しました`, 'success');
        this.renderList();
      }},
    ]);
  },
};

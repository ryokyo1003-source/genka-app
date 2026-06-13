// 比較画面（強化版）
const CompareView = {
  render() {
    return `
      <div class="view-content">
        <h2>価格比較</h2>
        <div class="compare-tabs">
          <button class="tab-btn active" data-tab="medicine">薬品別比較</button>
          <button class="tab-btn" data-tab="ingredient">成分別比較</button>
        </div>
        <div id="compare-tab-medicine" class="compare-panel">
          <div class="search-bar">
            <input type="text" class="form-input" id="compare-medicine-search" placeholder="薬品名で検索...">
          </div>
          <div id="compare-medicine-results"></div>
          <div id="compare-medicine-detail"></div>
        </div>
        <div id="compare-tab-ingredient" class="compare-panel hidden">
          <p class="ingredient-hint">同一成分の薬品を横断比較します。<strong>代替品への切り替え</strong>でコスト削減できます。</p>
          <div id="ingredient-groups"></div>
          <div id="compare-ingredient-detail"></div>
        </div>
      </div>`;
  },

  init() {
    document.querySelectorAll('.compare-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        document.querySelectorAll('.compare-panel').forEach(p => p.classList.add('hidden'));
        document.getElementById(`compare-tab-${e.target.dataset.tab}`)?.classList.remove('hidden');
      });
    });

    document.getElementById('compare-medicine-search')?.addEventListener('input', (e) => {
      this.searchMedicine(e.target.value);
    });

    this.renderIngredientGroups();
  },

  searchMedicine(query) {
    const container = document.getElementById('compare-medicine-results');
    if (!query) { container.innerHTML = ''; return; }

    const results = MedicineService.search(query).slice(0, 10);
    container.innerHTML = results.map(m => `
      <div class="search-result-item" data-id="${m.id}">
        <span>${m.name}</span>
        <span class="search-result-spec">${m.specification || ''}</span>
      </div>
    `).join('');

    container.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        this.showMedicineComparison(item.dataset.id);
      });
    });
  },

  showMedicineComparison(medicineId) {
    const comparison = CompareService.comparePricesByMedicine(medicineId);
    if (!comparison) return;

    const container = document.getElementById('compare-medicine-detail');

    if (comparison.prices.length === 0) {
      container.innerHTML = `<div class="card"><p>${comparison.medicine.name}の価格データがありません</p></div>`;
      return;
    }

    // 価格差が極端（最高が最安の2倍以上）なら注意を促す
    const _vals = comparison.prices.map(p => p.price).filter(v => v > 0);
    const _spread = _vals.length >= 2 ? Math.max(..._vals) / Math.min(..._vals) : 1;
    const spreadWarn = _spread >= 2 ? `
        <div class="spread-warning">
          ⚠️ 業者間で価格が<strong>約${Math.round(_spread * 10) / 10}倍</strong>違います。
          単位・入数の違いや、読み取り・数量の取り違えが含まれている可能性があります。元の書類をご確認ください。
        </div>` : '';

    container.innerHTML = `
      <div class="card comparison-card">
        <h3>${comparison.medicine.name}</h3>
        <p class="card-subtitle">${comparison.medicine.ingredient || ''} ${comparison.medicine.specification || ''}</p>
        ${spreadWarn}
        <table class="data-table">
          <thead>
            <tr><th>業者</th><th>単価</th><th>差額</th><th>適用日</th></tr>
          </thead>
          <tbody>
            ${comparison.prices.map(p => {
              const campaign = PriceService.getCampaignInfo(p);
              return `
                <tr class="${p.isCheapest ? 'row-cheapest' : ''}">
                  <td>${p.vendorName}</td>
                  <td>
                    ${FormatUtils.formatCurrency(p.price)}${p.taxIncluded ? ' (税込)' : ''}
                    ${campaign?.isActive ? `<br><span class="badge badge-campaign-sm">🎯〜${FormatUtils.formatDate(campaign.endDate)}</span>` : ''}
                  </td>
                  <td>${p.isCheapest ? '<span class="recommend-label">推奨</span>' : '+' + FormatUtils.formatCurrency(p.diffFromCheapest)}</td>
                  <td>${FormatUtils.formatDate(p.effectiveDate)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },

  // 成分グループカード（価格付き・最安ハイライト）
  renderIngredientGroups() {
    const groups = CompareService.getIngredientGroupsWithPrices();
    const container = document.getElementById('ingredient-groups');

    if (groups.length === 0) {
      container.innerHTML = '<p class="empty-message">同一成分の薬品グループがありません<br><small>薬品マスターの有効成分を揃えると代替比較ができます</small></p>';
      return;
    }

    container.innerHTML = groups.map(g => {
      const cheapest = g.cheapest;
      const campaignInfo = cheapest ? PriceService.getCampaignInfo(cheapest.price) : null;
      return `
        <div class="card ingredient-group-card" data-ingredient="${g.ingredient}">
          <div class="card-main">
            <div class="card-title">${g.ingredient}</div>
            <div class="card-subtitle">${g.medicines.map(m => m.name).join(' / ')}</div>
          </div>
          <div class="card-right ingredient-card-right">
            ${cheapest ? `
              <div class="ingredient-best-price">${FormatUtils.formatCurrency(cheapest.price.price)}</div>
              <div class="ingredient-best-vendor">${cheapest.medicineName}</div>
              ${campaignInfo?.isActive ? `<span class="badge badge-campaign-sm">🎯</span>` : ''}
            ` : ''}
            <span class="badge">${g.medicines.length}品目</span>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.ingredient-group-card').forEach(card => {
      card.addEventListener('click', () => {
        this.showIngredientComparison(card.dataset.ingredient);
      });
    });
  },

  showIngredientComparison(ingredient) {
    const comparison = CompareService.compareByIngredient(ingredient);
    if (!comparison) return;

    const container = document.getElementById('compare-ingredient-detail');

    if (comparison.prices.length === 0) {
      container.innerHTML = `<div class="card"><p>価格データがありません</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="card comparison-card">
        <h3>${comparison.ingredient} — 代替品横断比較</h3>
        <p class="ingredient-switch-note">同一成分の最安品への切り替えを検討してください</p>
        <table class="data-table">
          <thead>
            <tr><th>薬品名</th><th>規格</th><th>業者</th><th>単価</th><th>差額</th></tr>
          </thead>
          <tbody>
            ${comparison.prices.map(p => {
              const campaign = PriceService.getCampaignInfo(p);
              return `
                <tr class="${p.isCheapest ? 'row-cheapest' : ''}">
                  <td>
                    ${p.medicineName}
                    ${p.isCheapest ? '<br><span class="recommend-label">推奨</span>' : ''}
                  </td>
                  <td>${p.medicineSpec || '-'}</td>
                  <td>${p.vendorName}</td>
                  <td>
                    ${FormatUtils.formatCurrency(p.price)}${p.taxIncluded ? ' (税込)' : ''}
                    ${campaign?.isActive ? `<br><span class="badge badge-campaign-sm">🎯〜${FormatUtils.formatDate(campaign.endDate)}</span>` : ''}
                  </td>
                  <td>${p.isCheapest ? '-' : '+' + FormatUtils.formatCurrency(p.diffFromCheapest)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },
};

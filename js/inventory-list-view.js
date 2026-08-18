// 在庫一覧ビュー — 登録済み価格データを一覧表示・検索・フィルタ・CSV出力
const InventoryListView = {
  _sortCol: 'medicineName',
  _sortDir: 1,          // 1=昇順, -1=降順
  _searchTerm: '',
  _filterVendor: '',
  _filterCategory: '',

  render() {
    return `
      <div class="view-content">
        <h2>📋 在庫一覧</h2>
        <div id="inventory-list-content">
          <div class="loading-content"><div class="spinner"></div><p>準備中...</p></div>
        </div>
      </div>`;
  },

  init() {
    // 状態リセット（タブ切り替えのたびに初期化）
    this._sortCol     = 'medicineName';
    this._sortDir     = 1;
    this._searchTerm  = '';
    this._filterVendor   = '';
    this._filterCategory = '';
    this._renderTable();
  },

  // ── データ構築 ──────────────────────────────────────────────────────────

  // 全薬品×全業者の最新有効価格を1行ずつの配列に展開
  _buildRows() {
    const rows = [];
    const cheapestMap = PriceService.buildCheapestMap();

    AppState.medicines.forEach(med => {
      const prices = PriceService.getLatestPrices(med.id);
      if (prices.length === 0) return;

      prices.forEach(price => {
        const vendor     = AppState.vendors.find(v => v.id === price.vendorId);
        const pkg        = PriceService.parsePkgInfo(price);
        const campaign   = PriceService.getCampaignInfo(price);
        const isCheapest = cheapestMap[med.id]?.id === price.id;

        rows.push({
          priceId:      price.id,
          medicineId:   med.id,
          medicineName: med.name,
          specification: med.specification || '',
          unit:         med.unit || '',
          category:     med.category || '',
          ingredient:   med.ingredient || '',
          vendorId:     price.vendorId,
          vendorName:   vendor?.name || price.vendorId,
          price:        price.price,
          taxIncluded:  price.taxIncluded,
          effectiveDate: price.effectiveDate || '',
          source:       price.source || '',
          pkg_qty:      pkg.pkg_qty,
          pkg_price:    pkg.pkg_price,
          isCheapest,
          isCampaign:   campaign !== null,
          campaignExpiringSoon: campaign?.isExpiringSoon || false,
          campaignEndDate: campaign?.endDate || '',
        });
      });
    });

    return rows;
  },

  // 検索・フィルタ・ソートを適用
  _applyFilters(rows) {
    let filtered = rows;

    // テキスト検索（薬品名・成分・業者名）
    if (this._searchTerm) {
      const q = this._searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        r.medicineName.toLowerCase().includes(q) ||
        r.ingredient.toLowerCase().includes(q)   ||
        r.vendorName.toLowerCase().includes(q)
      );
    }

    // 業者フィルタ
    if (this._filterVendor) {
      filtered = filtered.filter(r => r.vendorId === this._filterVendor);
    }

    // カテゴリフィルタ
    if (this._filterCategory) {
      filtered = filtered.filter(r => r.category === this._filterCategory);
    }

    // ソート
    filtered.sort((a, b) => {
      const av = a[this._sortCol] ?? '';
      const bv = b[this._sortCol] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * this._sortDir;
      }
      return String(av).localeCompare(String(bv), 'ja') * this._sortDir;
    });

    return filtered;
  },

  // ── レンダリング ─────────────────────────────────────────────────────────

  // 描画中に例外が起きてもスピナーのまま固まらないようにするラッパー
  _renderTable() {
    try {
      this._renderTableInner();
    } catch (err) {
      console.error('[InventoryList] 描画エラー:', err);
      const el = document.getElementById('inventory-list-content');
      if (!el) return;
      el.innerHTML = `
        <div class="card" style="text-align:center;">
          <p style="color:#d33; font-weight:600;">一覧の表示中にエラーが発生しました</p>
          <p style="font-size:12px; color:#666; margin:8px 0 16px;">${err.message}</p>
          <button class="btn btn-primary" id="inv-error-reload">データを再読み込み</button>
        </div>`;
      document.getElementById('inv-error-reload')?.addEventListener('click', () => App.reloadData());
    }
  },

  _renderTableInner() {
    const allRows  = this._buildRows();
    const filtered = this._applyFilters(allRows);

    // カテゴリ一覧（ユニーク・ソート済み）
    const categories = [...new Set(allRows.map(r => r.category).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ja')
    );

    // フィルタ UI HTML
    const vendorOpts = AppState.vendors
      .filter(v => allRows.some(r => r.vendorId === v.id))
      .map(v => `<option value="${v.id}" ${this._filterVendor === v.id ? 'selected' : ''}>${v.name}</option>`)
      .join('');

    const catOpts = categories
      .map(c => `<option value="${c}" ${this._filterCategory === c ? 'selected' : ''}>${c}</option>`)
      .join('');

    // ソートヘッダーのHTMLを生成するヘルパー
    const th = (col, label) => {
      const isSorted = this._sortCol === col;
      const arrow    = isSorted ? (this._sortDir > 0 ? ' ▲' : ' ▼') : '';
      return `<th class="inv-th ${isSorted ? 'inv-th-sorted' : ''}" data-col="${col}">${label}${arrow}</th>`;
    };

    // テーブル行HTML
    const tableBodyHtml = filtered.map(r => {
      const pkgHtml = r.pkg_qty > 1
        ? `<span class="pkg-chip">📦 ${r.pkg_qty}入り ¥${Math.round(r.pkg_price).toLocaleString()}</span>`
        : '';

      const campaignHtml = r.isCampaign
        ? `<span class="inv-campaign-badge${r.campaignExpiringSoon ? ' inv-campaign-soon' : ''}">
             🎯${r.campaignEndDate ? ' 〜' + r.campaignEndDate : ''}
           </span>`
        : '';

      const cheapestHtml = r.isCheapest
        ? '<span class="inv-cheapest-badge">最安</span>'
        : '';

      return `
        <tr class="${r.isCheapest ? 'inv-row-cheapest' : ''}${r.campaignExpiringSoon ? ' inv-row-expiring' : ''}">
          <td class="inv-col-name">
            <div class="inv-med-name">${r.medicineName}</div>
            <div class="inv-med-sub">${r.specification}${r.unit ? ' / ' + r.unit : ''}</div>
            ${pkgHtml}
          </td>
          <td class="inv-col-vendor">${r.vendorName}</td>
          <td class="inv-col-price">
            <div class="inv-price-row">
              ${cheapestHtml}
              <strong>¥${r.price.toLocaleString()}</strong>
              ${r.taxIncluded ? '<span class="inv-tax-badge">税込</span>' : ''}
              ${campaignHtml}
            </div>
          </td>
          <td class="inv-col-date">${r.effectiveDate || '-'}</td>
          <td class="inv-col-cat">${r.category || '-'}</td>
        </tr>`;
    }).join('');

    const summaryHtml = `
      <div class="inv-summary">
        <span>${filtered.length}件 / 全${allRows.length}件</span>
        ${filtered.length > 0
          ? `<button class="btn btn-secondary btn-small" id="inv-export-btn">⬇️ CSVエクスポート</button>
             <button class="btn btn-secondary btn-small" id="inv-export-dose-btn">💊 薬用量計算用CSV</button>`
          : ''}
        <button class="btn btn-secondary btn-small" id="inv-reload-btn">🔄 再読み込み</button>
      </div>`;

    document.getElementById('inventory-list-content').innerHTML = `
      <div class="inv-controls">
        <input type="search" class="form-input inv-search-input" id="inv-search"
               placeholder="薬品名・成分・業者で検索..." value="${this._searchTerm || ''}">
        <div class="inv-filters">
          <select class="form-select" id="inv-filter-vendor">
            <option value="">全業者</option>
            ${vendorOpts}
          </select>
          <select class="form-select" id="inv-filter-cat">
            <option value="">全カテゴリ</option>
            ${catOpts}
          </select>
        </div>
      </div>

      ${summaryHtml}

      ${allRows.length === 0
        ? '<p class="empty-message">価格データがありません。読取りタブからPDFを読み込んでください。</p>'
        : filtered.length === 0
        ? '<p class="empty-message">該当するデータがありません。検索条件を変更してください。</p>'
        : `<div class="inv-table-wrap">
            <table class="inv-table">
              <thead>
                <tr>
                  ${th('medicineName', '薬品名')}
                  ${th('vendorName', '業者')}
                  ${th('price', '単価')}
                  ${th('effectiveDate', '適用日')}
                  <th class="inv-th">カテゴリ</th>
                </tr>
              </thead>
              <tbody>${tableBodyHtml}</tbody>
            </table>
          </div>`
      }`;

    this._bindEvents(filtered);
  },

  _bindEvents(filteredRows) {
    // 検索
    document.getElementById('inv-search')?.addEventListener('input', (e) => {
      this._searchTerm = e.target.value;
      this._renderTable();
    });

    // 業者フィルタ
    document.getElementById('inv-filter-vendor')?.addEventListener('change', (e) => {
      this._filterVendor = e.target.value;
      this._renderTable();
    });

    // カテゴリフィルタ
    document.getElementById('inv-filter-cat')?.addEventListener('change', (e) => {
      this._filterCategory = e.target.value;
      this._renderTable();
    });

    // ソートヘッダークリック
    document.querySelectorAll('.inv-th[data-col]').forEach(thEl => {
      thEl.style.cursor = 'pointer';
      thEl.addEventListener('click', () => {
        const col = thEl.dataset.col;
        if (this._sortCol === col) {
          this._sortDir = -this._sortDir;
        } else {
          this._sortCol = col;
          this._sortDir = 1;
        }
        this._renderTable();
      });
    });

    // CSVエクスポート
    document.getElementById('inv-export-btn')?.addEventListener('click', () => {
      this._exportCsv(filteredRows);
    });

    // 薬用量計算アプリ用CSVエクスポート
    document.getElementById('inv-export-dose-btn')?.addEventListener('click', () => {
      this._exportDosageCsv(filteredRows);
    });

    // データ再読み込み
    document.getElementById('inv-reload-btn')?.addEventListener('click', () => {
      App.reloadData();
    });
  },

  // ── CSV エクスポート ──────────────────────────────────────────────────────

  _exportCsv(rows) {
    const headers = ['薬品名', '規格', '単位', 'カテゴリ', '成分', '業者', '単価', '税込',
                     '入数', 'パッケージ合計金額', 'キャンペーン', 'キャンペーン終了日', '適用日'];
    const csvRows = rows.map(r => [
      r.medicineName,
      r.specification,
      r.unit,
      r.category,
      r.ingredient,
      r.vendorName,
      r.price,
      r.taxIncluded ? '税込' : '税抜',
      r.pkg_qty > 1 ? r.pkg_qty : '',
      r.pkg_qty > 1 ? Math.round(r.pkg_price) : '',
      r.isCampaign ? 'あり' : '',
      r.campaignEndDate || '',
      r.effectiveDate,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));

    const csv  = '\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `薬剤原価一覧_${FormatUtils.today()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.showToast(`${rows.length}件のCSVをダウンロードしました`, 'success');
  },

  // 薬用量計算アプリ用CSV（薬剤名,剤型,単価（仕入）,含有量（mg/錠））
  // 表示中（検索・フィルタ適用後）の薬品ごとに最安値を1行ずつ出力する
  _exportDosageCsv(rows) {
    const medicineIds = [...new Set(rows.map(r => r.medicineId))];
    const lines = ['薬剤名,剤型,単価（仕入）,含有量（mg/錠）'];
    let count = 0;

    medicineIds.forEach(mid => {
      const med = MedicineService.findById(mid);
      const cheapest = PriceService.getCheapest(mid);
      if (!med || !cheapest || !(cheapest.price > 0)) return;

      // 薬用量計算アプリのCSV解析は単純なカンマ区切り（引用符非対応）のため、
      // 名前中のカンマ・引用符・改行は全角カンマや空白に置換する
      const name = String(med.name).replace(/,/g, '，').replace(/["\r\n]/g, ' ').trim();
      const mg   = PriceListView._parseMgContent(med.name, med.specification);
      const form = PriceListView._parseDosageForm(med.name, med.unit);
      const price = Math.round(cheapest.price * 1000000) / 1000000;

      lines.push([name, form, price, mg == null ? '' : mg].join(','));
      count++;
    });

    if (count === 0) {
      UI.showToast('出力対象がありません', 'error');
      return;
    }

    const csv  = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `薬剤データ_${FormatUtils.today()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    UI.showToast(`薬用量計算用CSV ${count}品目をダウンロードしました`, 'success');
  },
};

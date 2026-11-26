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
        const retailPrice = PriceService.parseMsrp(price);
        const isCheapest = cheapestMap[med.id]?.id === price.id;
        // 最安値の3倍超は業者間の価格差ではありえない → 単位取り違えの疑い
        const unitSuspect = !isCheapest && cheapestMap[med.id] &&
                            price.price > cheapestMap[med.id].price * 3;

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
          retail_price: retailPrice,
          isCheapest,
          unitSuspect,
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
      // 1箱あたり: 何錠（何個）入りか + 箱価格を表示
      const unitLabel = this._esc(r.unit || '');
      const pkgHtml = r.pkg_qty > 1
        ? `<span class="pkg-chip">📦 1箱 ${r.pkg_qty}${unitLabel}入り ¥${Math.round(r.pkg_price).toLocaleString()}</span>`
        : '';

      const retailHtml = r.retail_price
        ? `<span class="retail-chip">🏷 希望小売 ¥${Math.round(r.retail_price).toLocaleString()}</span>`
        : '';

      const campaignHtml = r.isCampaign
        ? `<span class="inv-campaign-badge${r.campaignExpiringSoon ? ' inv-campaign-soon' : ''}">
             🎯${r.campaignEndDate ? ' 〜' + r.campaignEndDate : ''}
           </span>`
        : '';

      const cheapestHtml = r.isCheapest
        ? '<span class="inv-cheapest-badge">最安</span>'
        : '';

      const unitWarnHtml = r.unitSuspect
        ? '<span class="badge badge-unit-warn" title="最安値の3倍超 — 1箱と1錠の取り違えの可能性">⚠️ 単位確認</span>'
        : '';

      return `
        <tr class="${r.isCheapest ? 'inv-row-cheapest' : ''}${r.campaignExpiringSoon ? ' inv-row-expiring' : ''}">
          <td class="inv-col-name">
            <div class="inv-med-name">${this._esc(r.medicineName)}</div>
            <div class="inv-med-sub">${this._esc(r.specification)}${r.unit ? ' / ' + this._esc(r.unit) : ''}</div>
            ${pkgHtml}
            ${retailHtml}
          </td>
          <td class="inv-col-vendor">${this._esc(r.vendorName)}</td>
          <td class="inv-col-price">
            <div class="inv-price-row">
              ${cheapestHtml}
              <strong>¥${r.price.toLocaleString()}</strong>${r.unit ? `<span class="inv-unit-label">/${this._esc(r.unit)}</span>` : ''}
              ${r.taxIncluded ? '<span class="inv-tax-badge">税込</span>' : ''}
              ${unitWarnHtml}
              ${campaignHtml}
              <button class="inv-edit-btn" data-price-id="${r.priceId}" title="薬品名・業者・単価などを編集">✏️</button>
            </div>
          </td>
          <td class="inv-col-date">${r.effectiveDate || '-'}</td>
          <td class="inv-col-cat">${this._esc(r.category) || '-'}</td>
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
        <div class="inv-search-row">
          <input type="search" class="form-input inv-search-input" id="inv-search"
                 placeholder="薬品名・成分・業者で検索 → Enter" value="${this._searchTerm || ''}"
                 enterkeyhint="search">
          <button class="btn btn-primary btn-small" id="inv-search-btn">🔍 検索</button>
        </div>
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
    // 検索は Enter または「🔍 検索」ボタンで実行する。
    // 入力のたびに表を作り直すと、検索窓ごと再生成されてIME変換中の入力
    // （「く」= k + u など）が途切れてしまうため、確定後にまとめて検索する。
    const applySearch = () => {
      const input = document.getElementById('inv-search');
      this._searchTerm = input?.value || '';
      this._renderTable();
      // 再描画で検索窓が作り直されるので、フォーカスを戻して続けて検索できるようにする
      const newInput = document.getElementById('inv-search');
      if (newInput) {
        try {
          newInput.focus();
          const len = newInput.value.length;
          newInput.setSelectionRange(len, len);
        } catch { /* setSelectionRange非対応ブラウザは無視 */ }
      }
    };
    const searchInput = document.getElementById('inv-search');
    searchInput?.addEventListener('keydown', (e) => {
      // IME変換確定のEnter（isComposing）では検索しない
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        applySearch();
      }
    });
    // ×ボタンでクリアしたときも反映（Enterでの発火分は値が同じなのでスキップ）
    searchInput?.addEventListener('search', () => {
      const v = document.getElementById('inv-search')?.value || '';
      if (v !== this._searchTerm) applySearch();
    });
    document.getElementById('inv-search-btn')?.addEventListener('click', applySearch);

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

    // 単価・入数・1箱価格の編集
    document.querySelectorAll('.inv-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showEditModal(btn.dataset.priceId);
      });
    });
  },

  // ── 登録内容の編集（薬品情報 + この業者の価格） ──────────────────────────

  _esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  _showEditModal(priceId) {
    const p = AppState.prices.find(x => x.id === priceId);
    if (!p) {
      UI.showToast('価格データが見つかりません。再読み込みしてください', 'error');
      return;
    }
    const med  = MedicineService.findById(p.medicineId);
    if (!med) {
      UI.showToast('薬品データが見つかりません。再読み込みしてください', 'error');
      return;
    }
    const pkg  = PriceService.parsePkgInfo(p);
    const unit = med.unit || '錠';
    const esc  = this._esc;

    const vendorOpts = AppState.vendors
      .map(v => `<option value="${esc(v.id)}" ${v.id === p.vendorId ? 'selected' : ''}>${esc(v.name)}</option>`)
      .join('');
    const categories = [...new Set(AppState.medicines.map(m => m.category).filter(Boolean))].sort();
    const catList = categories.map(c => `<option value="${esc(c)}">`).join('');
    const vendorCount = PriceService.getLatestPrices(med.id).length;

    const body = `
      <p class="inv-edit-section">薬品の情報</p>
      ${vendorCount > 1
        ? `<p class="inv-edit-note">※ ここの変更は、この薬品の全業者（${vendorCount}社）の行に反映されます</p>`
        : ''}
      <div class="form-group">
        <label>薬品名</label>
        <input type="text" class="form-input" id="inv-edit-name" value="${esc(med.name)}">
      </div>
      <div class="form-group">
        <label>規格（例: 100mg、500g×4袋）</label>
        <input type="text" class="form-input" id="inv-edit-spec" value="${esc(med.specification)}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>単位（錠・本・袋など）</label>
          <input type="text" class="form-input" id="inv-edit-unit" value="${esc(med.unit)}">
        </div>
        <div class="form-group">
          <label>カテゴリ</label>
          <input type="text" class="form-input" id="inv-edit-category" list="inv-edit-category-list" value="${esc(med.category)}">
          <datalist id="inv-edit-category-list">${catList}</datalist>
        </div>
      </div>
      <div class="form-group">
        <label>成分名</label>
        <input type="text" class="form-input" id="inv-edit-ingredient" value="${esc(med.ingredient)}">
      </div>

      <p class="inv-edit-section">この業者の価格</p>
      <div class="form-group">
        <label>業者</label>
        <select class="form-input" id="inv-edit-vendor">${vendorOpts}</select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>1${esc(unit)}あたり単価 (¥)</label>
          <input type="number" step="0.01" min="0" class="form-input" id="inv-edit-price" value="${p.price}">
        </div>
        <div class="form-group">
          <label>税区分</label>
          <select class="form-input" id="inv-edit-tax">
            <option value="0" ${p.taxIncluded ? '' : 'selected'}>税抜</option>
            <option value="1" ${p.taxIncluded ? 'selected' : ''}>税込</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>入数（バラ売りは1）</label>
          <input type="number" step="1" min="1" class="form-input" id="inv-edit-pkg-qty"
                 value="${pkg.pkg_qty > 1 ? pkg.pkg_qty : 1}">
        </div>
        <div class="form-group">
          <label>1箱あたり価格 (¥)</label>
          <input type="number" step="1" min="0" class="form-input" id="inv-edit-pkg-price"
                 value="${pkg.pkg_qty > 1 ? Math.round(pkg.pkg_price) : ''}" placeholder="例: 10000">
        </div>
      </div>
      <p class="inv-edit-calc" id="inv-edit-calc">入数と1箱価格を入れると1${esc(unit)}あたりの単価を自動計算します</p>
      <div class="form-row">
        <div class="form-group">
          <label>希望小売価格 (¥・任意)</label>
          <input type="number" step="1" min="0" class="form-input" id="inv-edit-msrp"
                 value="${PriceService.parseMsrp(p) || ''}" placeholder="空欄なら未設定">
        </div>
        <div class="form-group">
          <label>適用日</label>
          <input type="date" class="form-input" id="inv-edit-date" value="${esc(p.effectiveDate || '')}">
        </div>
      </div>`;

    UI.showModal(
      `登録内容の編集<br><small>${esc(med.name)}（${esc(UI.vendorName(p.vendorId))}）</small>`,
      body,
      [
        { label: 'キャンセル', action: 'cancel', class: 'btn-secondary', onClick: () => UI.closeModal() },
        { label: '保存', action: 'save', class: 'btn-primary', onClick: () => this._saveEditModal(priceId, unit) },
      ]
    );

    // 入数 × 1箱価格 → 単価の自動計算
    const recalc = () => {
      const qty = parseInt(document.getElementById('inv-edit-pkg-qty')?.value) || 0;
      const box = parseFloat(document.getElementById('inv-edit-pkg-price')?.value) || 0;
      const note = document.getElementById('inv-edit-calc');
      if (qty > 1 && box > 0) {
        const unitPrice = Math.round(box / qty * 100) / 100;
        const priceEl = document.getElementById('inv-edit-price');
        if (priceEl) priceEl.value = unitPrice;
        if (note) note.textContent = `¥${box.toLocaleString()} ÷ ${qty}${unit} = 1${unit}あたり ¥${unitPrice.toLocaleString()}`;
      } else if (note) {
        note.textContent = `入数と1箱価格を入れると1${unit}あたりの単価を自動計算します`;
      }
    };
    document.getElementById('inv-edit-pkg-qty')?.addEventListener('input', recalc);
    document.getElementById('inv-edit-pkg-price')?.addEventListener('input', recalc);
  },

  async _saveEditModal(priceId, unit) {
    const val = id => (document.getElementById(id)?.value ?? '').trim();
    const p   = AppState.prices.find(x => x.id === priceId);
    const med = p && MedicineService.findById(p.medicineId);
    if (!p || !med) {
      UI.showToast('データが見つかりません。再読み込みしてください', 'error');
      return;
    }

    // 確認ダイアログを出すと編集画面が閉じるため、先に全ての入力値を読み取る
    const medInput = {
      name:          val('inv-edit-name'),
      specification: val('inv-edit-spec'),
      unit:          val('inv-edit-unit'),
      category:      val('inv-edit-category'),
      ingredient:    val('inv-edit-ingredient'),
    };
    const price    = parseFloat(val('inv-edit-price'));
    const pkgQty   = parseInt(val('inv-edit-pkg-qty')) || 1;
    const pkgPrice = parseFloat(val('inv-edit-pkg-price')) || 0;
    const msrp     = parseFloat(val('inv-edit-msrp')) || 0;
    const priceInput = {
      price, pkgQty, pkgPrice, msrp,
      vendorId:      val('inv-edit-vendor') || p.vendorId,
      taxIncluded:   val('inv-edit-tax') === '1',
      effectiveDate: val('inv-edit-date'),
    };

    if (!medInput.name) {
      UI.showToast('薬品名を入力してください', 'error');
      return;
    }
    if (!price || isNaN(price) || price <= 0) {
      UI.showToast('単価を入力してください', 'error');
      return;
    }
    if (pkgQty > 1 && pkgPrice > 0 && pkgPrice < price) {
      UI.showToast(`1箱価格（¥${pkgPrice.toLocaleString()}）が1${unit}の単価より安くなっています。入力をご確認ください`, 'error');
      return;
    }

    const medChanged = ['name', 'specification', 'unit', 'category', 'ingredient']
      .some(k => medInput[k] !== (med[k] || ''));

    // 修正後の名前が別の薬品として既に登録されている場合は、二重登録にせず既存の薬品にまとめる
    let mergeTarget = null;
    if (medInput.name !== med.name) {
      const key = FormatUtils.normalize(medInput.name);
      mergeTarget = AppState.medicines.find(m => m.id !== med.id && FormatUtils.normalize(m.name) === key) || null;
    }
    if (mergeTarget) {
      const ok = await UI.confirm(
        `「${this._esc(mergeTarget.name)}」は既に登録されています。<br>` +
        `この価格（${this._esc(UI.vendorName(priceInput.vendorId))}）を、既存の「${this._esc(mergeTarget.name)}」にまとめますか？<br>` +
        `<small>規格・単位・カテゴリ・成分名は既存の薬品のものが使われます。</small>`
      );
      if (!ok) {
        this._showEditModal(priceId);
        return;
      }
    }

    try {
      UI.showLoading('保存中...');
      if (mergeTarget) {
        await PriceService.updatePriceDetails(priceId, { ...priceInput, medicineId: mergeTarget.id });
      } else {
        if (medChanged) await MedicineService.update(med.id, medInput);
        await PriceService.updatePriceDetails(priceId, priceInput);
      }
      UI.closeModal();
      UI.showToast(mergeTarget ? `「${mergeTarget.name}」にまとめました` : '登録内容を更新しました', 'success');
      this._renderTable();
    } catch (err) {
      UI.showToast(`保存エラー: ${err.message}`, 'error');
    } finally {
      UI.hideLoading();
    }
  },

  // ── CSV エクスポート ──────────────────────────────────────────────────────

  _exportCsv(rows) {
    const headers = ['薬品名', '規格', '単位', 'カテゴリ', '成分', '業者', '単価', '税込',
                     '入数', 'パッケージ合計金額', '希望小売価格', 'キャンペーン', 'キャンペーン終了日', '適用日'];
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
      r.retail_price ? Math.round(r.retail_price) : '',
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

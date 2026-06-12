// OCR結果プレビュー・修正画面
const OcrResultView = {
  // 品目ごとに業者を選ぶモード（在庫一覧・納品書）か
  _isItemMode(result) {
    const dt = result?.docType;
    return dt === 'inventory' || dt === 'delivery';
  },

  render() {
    const dt = AppState.currentOcrResult?.docType;
    const title = dt === 'inventory' ? '在庫・価格一覧の確認'
      : dt === 'delivery' ? '納品書の確認'
      : '読み取り結果の確認';
    return `
      <div class="view-content">
        <h2>${title}</h2>
        <div id="ocr-result-content"></div>
      </div>`;
  },

  init() {
    this.renderResult();
  },

  // 業者リスト（重複排除済み）を返す内部メソッド
  _getUniqueVendors() {
    const seen = new Set();
    return AppState.vendors.filter(v => {
      const key = FormatUtils.normalize(v.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  // 業者selectのHTML生成（selectedId: pre-selectするID）
  _buildVendorOptions(selectedId, selectedName) {
    const uniqueVendors = this._getUniqueVendors();

    // OCR読み取り名で自動マッチング（selectedIdが未指定の場合）
    let autoId = selectedId || '';
    if (!autoId && selectedName) {
      const found = OcrService.findVendor(selectedName, uniqueVendors);
      if (found) autoId = found.id;
    }

    const opts = uniqueVendors.map(v =>
      `<option value="${v.id}" ${autoId === v.id ? 'selected' : ''}>${v.name}</option>`
    ).join('');

    return `<option value="">-- 選択 --</option><option value="__new__">+ 新規業者を追加</option>${opts}`;
  },

  renderResult() {
    const result = AppState.currentOcrResult;
    if (!result) {
      document.getElementById('ocr-result-content').innerHTML =
        '<p class="empty-message">読み取り結果がありません。読取りタブから画像をアップロードしてください。</p>';
      return;
    }

    // ── 在庫一覧・納品書モード（品目ごとに業者を選択）──
    if (this._isItemMode(result)) {
      this._renderInventoryResult(result);
    } else {
      // ── 値上げ通知書モード（単一業者）の場合 ──
      this._renderPriceNoticeResult(result);
    }
  },

  // ── 値上げ通知書モード ──
  _renderPriceNoticeResult(result) {
    const vendorOpts = this._buildVendorOptions(result.vendorMatch?.id, result.vendor_name);
    const itemsHtml  = result.items.map((item, i) => this.renderItemRow(item, i, false)).join('');

    document.getElementById('ocr-result-content').innerHTML = `
      <div class="ocr-meta">
        <div class="form-group">
          <label>業者名</label>
          <div class="input-with-action">
            <select id="ocr-vendor" class="form-select">
              ${vendorOpts}
            </select>
            <span class="ocr-original">読取り: ${result.vendor_name || '不明'}</span>
          </div>
        </div>
        <div class="form-group">
          <label>適用日</label>
          <input type="date" id="ocr-date" class="form-input" value="${result.effective_date || ''}">
        </div>
        <div class="confidence-badge confidence-${result.confidence || 'low'}">
          読取り精度: ${result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低'}
        </div>
      </div>

      <h3>薬品リスト (${result.items.length}件)</h3>
      <div class="ocr-items">${itemsHtml}</div>

      ${result.notes ? `<div class="ocr-notes"><strong>備考:</strong> ${result.notes}</div>` : ''}

      <div class="ocr-actions">
        <button class="btn btn-secondary" id="btn-ocr-back">戻る</button>
        <button class="btn btn-primary btn-large" id="btn-ocr-save">登録する</button>
      </div>`;

    this._bindCommonEvents(result, false);
  },

  // ── 在庫一覧モード（複数業者対応）──
  _renderInventoryResult(result) {
    const vendorCount   = result.vendor_names?.length || 0;
    const isMultiVendor = result.hasMultipleVendors || vendorCount > 1;

    // 読み取り業者サマリー
    const vendorSummary = isMultiVendor
      ? `<div class="inventory-vendor-summary">
          <strong>📦 読み取り業者 (${vendorCount}社):</strong>
          ${result.vendor_names.map(n => `<span class="vendor-chip">${n || '不明'}</span>`).join('')}
         </div>`
      : '';

    // 適用日（在庫一覧は通常「今日」）
    const today = new Date().toISOString().split('T')[0];

    const itemsHtml = result.items.map((item, i) =>
      this.renderItemRow(item, i, true)
    ).join('');

    const isDelivery = result.docType === 'delivery';
    const modeBanner = isDelivery
      ? `<div class="inventory-mode-banner banner-delivery">📥 納品書モード — 仕入れた単価を登録し、最安値より高い品目を警告します</div>`
      : `<div class="inventory-mode-banner">📋 在庫一覧モード — 読み取った価格がベースラインとして登録されます</div>`;
    const dateLabel = isDelivery ? '仕入日' : '適用日（基準日）';

    document.getElementById('ocr-result-content').innerHTML = `
      ${modeBanner}
      ${vendorSummary}

      <div class="ocr-meta">
        <div class="form-group">
          <label>${dateLabel}</label>
          <input type="date" id="ocr-date" class="form-input" value="${today}">
        </div>
        <div class="confidence-badge confidence-${result.confidence || 'low'}">
          読取り精度: ${result.confidence === 'high' ? '高' : result.confidence === 'medium' ? '中' : '低'}
          &nbsp;|&nbsp; ${result.items.length}件
        </div>
      </div>

      <div class="ocr-items-toolbar">
        <h3>薬品リスト (${result.items.length}件)</h3>
        ${isMultiVendor ? `<span class="multi-vendor-badge">🏢 複数業者モード</span>` : ''}
      </div>
      <div class="ocr-items">${itemsHtml}</div>

      ${result.notes ? `<div class="ocr-notes"><strong>備考:</strong> ${result.notes}</div>` : ''}

      <div class="ocr-actions">
        <button class="btn btn-secondary" id="btn-ocr-back">戻る</button>
        <button class="btn btn-primary btn-large" id="btn-ocr-save">
          一括登録する (${result.items.length}件)
        </button>
      </div>`;

    this._bindCommonEvents(result, true);
  },

  // 共通イベントバインド
  _bindCommonEvents(result, isInventory) {
    document.getElementById('btn-ocr-back')?.addEventListener('click', () => {
      App.navigateTo('upload');
    });
    document.getElementById('btn-ocr-save')?.addEventListener('click', () => {
      this.saveResults();
    });

    // 値上げ通知書モードの業者変更
    if (!isInventory) {
      document.getElementById('ocr-vendor')?.addEventListener('change', (e) => {
        if (e.target.value === '__new__') this.showNewVendorModal();
      });
    }

    // 各アイテムのイベント
    result.items.forEach((item, i) => {
      // 薬品選択
      document.getElementById(`med-select-${i}`)?.addEventListener('change', (e) => {
        if (e.target.value === '__new__') this.showNewMedicineModal(i, item);
      });

      // 在庫モード: 品目ごとの業者変更
      if (isInventory) {
        document.getElementById(`item-vendor-${i}`)?.addEventListener('change', (e) => {
          if (e.target.value === '__new__') this.showNewVendorModal(i);
        });
      }

      // キャンペーンチェックボックス
      document.getElementById(`med-campaign-${i}`)?.addEventListener('change', () => {
        const cb   = document.getElementById(`med-campaign-${i}`);
        const wrap = document.getElementById(`med-campaign-date-wrap-${i}`);
        wrap?.classList.toggle('hidden', !cb?.checked);
      });

      // パッケージ自動計算（在庫モードのみ）
      if (isInventory) {
        const updatePkgCalc = () => {
          const qty      = parseInt(document.getElementById(`pkg-qty-${i}`)?.value) || 1;
          const pkgPrice = parseFloat(document.getElementById(`pkg-price-${i}`)?.value) || 0;
          const calcEl   = document.getElementById(`pkg-calc-${i}`);
          const priceInp = document.getElementById(`med-new-${i}`);
          if (qty > 1 && pkgPrice > 0) {
            const unit = Math.round(pkgPrice / qty);
            if (calcEl) calcEl.textContent = `📦 ${qty}個入り ¥${pkgPrice.toLocaleString()} → 単価 ¥${unit.toLocaleString()}/個`;
            if (priceInp) priceInp.value = unit;
          } else {
            if (calcEl) calcEl.textContent = '入数が2以上の場合、単価が自動計算されます';
          }
        };
        document.getElementById(`pkg-qty-${i}`)?.addEventListener('input', updatePkgCalc);
        document.getElementById(`pkg-price-${i}`)?.addEventListener('input', updatePkgCalc);
      }
    });
  },

  // OCRの新価格でシステム内の安い代替候補を検索（業者問わず）
  getWarningForItem(item) {
    const medicineId = item.matchedMedicineId;
    const newPrice   = parseFloat(item.new_price);
    if (!medicineId || !newPrice || isNaN(newPrice)) return null;

    const medicine     = MedicineService.findById(medicineId);
    const alternatives = [];

    // 同一薬品の全業者でnewPriceより安いもの
    PriceService.getLatestPrices(medicineId)
      .filter(p => p.price < newPrice)
      .forEach(p => {
        const vendor = AppState.vendors.find(v => v.id === p.vendorId);
        alternatives.push({
          type:        'same_medicine',
          medicineName: medicine?.name || '',
          vendorName:  vendor?.name || p.vendorId,
          price:       p.price,
          diff:        newPrice - p.price,
          diffPct:     Math.round((newPrice - p.price) / newPrice * 100),
        });
      });

    // 同一成分の代替品でnewPriceより安いもの
    if (medicine?.ingredient) {
      MedicineService.findByIngredient(medicine.ingredient)
        .filter(m => m.id !== medicineId)
        .forEach(altMed => {
          PriceService.getLatestPrices(altMed.id)
            .filter(p => p.price < newPrice)
            .forEach(p => {
              const vendor = AppState.vendors.find(v => v.id === p.vendorId);
              alternatives.push({
                type:         'equivalent',
                medicineName: altMed.name,
                vendorName:   vendor?.name || p.vendorId,
                price:        p.price,
                diff:         newPrice - p.price,
                diffPct:      Math.round((newPrice - p.price) / newPrice * 100),
              });
            });
        });
    }

    if (alternatives.length === 0) return null;
    alternatives.sort((a, b) => a.price - b.price);
    return alternatives[0];
  },

  // 品目行レンダリング
  // isInventoryMode=true → 品目ごとに業者セレクターを表示
  renderItemRow(item, index, isInventoryMode) {
    const candidatesOptions = (item.medicineCandidates || []).map(c =>
      `<option value="${c.id}" ${c.id === item.matchedMedicineId ? 'selected' : ''}>${c.name} (${c.specification || ''}) [${c.score}%]</option>`
    ).join('');

    const warning     = this.getWarningForItem(item);
    const warningHtml = warning ? `
      <div class="ocr-price-warning">
        <span class="warning-icon">⚠️</span>
        <span class="warning-text">
          ${warning.type === 'equivalent' ? `代替品「${warning.medicineName}」` : `他社`}
          （${warning.vendorName}）が
          <strong>${FormatUtils.formatCurrency(warning.price)}</strong> で
          <strong>${FormatUtils.formatCurrency(warning.diff)} (-${warning.diffPct}%) 安い</strong>可能性
        </span>
      </div>` : '';

    // 在庫一覧モード: 品目ごとの業者セレクター
    const vendorRowHtml = isInventoryMode ? (() => {
      const opts = this._buildVendorOptions(item.vendorMatch?.id, item.vendor_name);
      const readLabel = item.vendor_name
        ? `<span class="ocr-original">読取り: ${item.vendor_name}</span>`
        : `<span class="ocr-original ocr-original-warn">業者名なし</span>`;
      return `
        <div class="form-group">
          <label>仕入先業者</label>
          <div class="input-with-action">
            <select class="form-select" id="item-vendor-${index}">
              ${opts}
            </select>
            ${readLabel}
          </div>
        </div>`;
    })() : '';

    // パッケージ情報HTML（在庫モードのみ）
    const pkgSectionHtml = isInventoryMode ? (() => {
      const initQty   = item.pkg_qty > 1 ? item.pkg_qty : 1;
      const initPrice = item.pkg_qty > 1 ? Math.round(item.pkg_price || 0) : '';
      const initCalc  = item.pkg_qty > 1 && item.pkg_price
        ? `📦 ${item.pkg_qty}個入り ¥${Math.round(item.pkg_price).toLocaleString()} → 単価 ¥${Math.round(item.pkg_price / item.pkg_qty).toLocaleString()}/個`
        : '入数が2以上の場合、単価が自動計算されます';
      return `
        <div class="pkg-section" id="pkg-section-${index}">
          <div class="pkg-header">📦 パッケージ情報（入数と合計価格から単価を自動計算）</div>
          <div class="form-row">
            <div class="form-group">
              <label>入数（個売りは1）</label>
              <input type="number" class="form-input" id="pkg-qty-${index}" value="${initQty}" min="1">
            </div>
            <div class="form-group">
              <label>パッケージ合計金額 (¥)</label>
              <input type="number" class="form-input" id="pkg-price-${index}" value="${initPrice}" placeholder="例: 10000">
            </div>
          </div>
          <div class="pkg-calc-result" id="pkg-calc-${index}">${initCalc}</div>
        </div>`;
    })() : '';

    return `
      <div class="ocr-item ${item.isNew ? 'ocr-item-new' : ''}" data-index="${index}">
        <div class="ocr-item-header">
          <span class="item-number">#${index + 1}</span>
          ${item.isNew ? '<span class="badge badge-new">新規</span>' : '<span class="badge badge-matched">一致</span>'}
          ${warning ? '<span class="badge badge-warning">要確認</span>' : ''}
          ${isInventoryMode && item.vendor_name ? `<span class="badge badge-vendor">${item.vendor_name}</span>` : ''}
        </div>
        ${warningHtml}
        <div class="form-group">
          <label>薬品名</label>
          <input type="text" class="form-input" id="med-name-${index}" value="${item.medicine_name || ''}">
        </div>
        <div class="form-group">
          <label>マスター照合</label>
          <select class="form-select" id="med-select-${index}">
            <option value="__new__">+ 新規薬品として追加</option>
            ${candidatesOptions}
          </select>
        </div>
        ${vendorRowHtml}
        <div class="form-row">
          <div class="form-group">
            <label>規格</label>
            <input type="text" class="form-input" id="med-spec-${index}" value="${item.specification || ''}">
          </div>
          <div class="form-group">
            <label>単位</label>
            <input type="text" class="form-input" id="med-unit-${index}" value="${item.unit || ''}">
          </div>
        </div>
        <div class="form-row">
          ${!isInventoryMode ? `
          <div class="form-group">
            <label>旧価格</label>
            <input type="number" class="form-input" id="med-old-${index}" value="${item.old_price || ''}" placeholder="-">
          </div>` : ''}
          <div class="form-group">
            <label>${isInventoryMode ? '単価' : '新価格'}</label>
            <input type="number" class="form-input price-input" id="med-new-${index}" value="${item.new_price || ''}">
          </div>
        </div>
        ${item.tax_included ? '<span class="badge badge-tax">税込</span>' : ''}
        ${pkgSectionHtml}
        <div class="form-group">
          <label>カテゴリ</label>
          <input type="text" class="form-input" id="med-cat-${index}" value="${item.category || ''}">
        </div>
        <div class="campaign-row">
          <label class="campaign-label">
            <input type="checkbox" id="med-campaign-${index}" class="campaign-checkbox">
            <span class="campaign-badge-label">🎯 キャンペーン価格</span>
          </label>
          <div id="med-campaign-date-wrap-${index}" class="campaign-date-wrap hidden">
            <label class="campaign-end-label">キャンペーン終了日</label>
            <input type="date" class="form-input campaign-end-input" id="med-campaign-end-${index}" value="${PriceService.defaultCampaignEndDate()}">
          </div>
        </div>
        <button class="btn btn-danger btn-small btn-remove-item" data-index="${index}">削除</button>
      </div>`;
  },

  showNewVendorModal(itemIndex = null) {
    const ocrName = itemIndex !== null
      ? (AppState.currentOcrResult?.items?.[itemIndex]?.vendor_name || '')
      : (AppState.currentOcrResult?.vendor_name || '');

    UI.showModal('新規業者追加', `
      <div class="form-group">
        <label>業者名</label>
        <input type="text" class="form-input" id="new-vendor-name" value="${ocrName}">
      </div>
      <div class="form-group">
        <label>電話番号</label>
        <input type="tel" class="form-input" id="new-vendor-tel">
      </div>
    `, [
      { label: 'キャンセル', action: 'close', class: 'btn-secondary' },
      {
        label: '追加', action: 'add', class: 'btn-primary',
        onClick: () => this.addNewVendor(itemIndex),
      },
    ]);
  },

  async addNewVendor(itemIndex = null) {
    const name = document.getElementById('new-vendor-name')?.value?.trim();
    const tel  = document.getElementById('new-vendor-tel')?.value;
    if (!name) { UI.showToast('業者名を入力してください', 'error'); return; }

    // 重複チェック
    const normalizedName = FormatUtils.normalize(name);
    const existing = AppState.vendors.find(v => FormatUtils.normalize(v.name) === normalizedName);
    if (existing) {
      UI.closeModal();
      UI.showToast(`「${existing.name}」は既に登録済みです`, 'warning');
      this.renderResult();
      // 対象のセレクターに選択を反映
      const targetSel = itemIndex !== null
        ? document.getElementById(`item-vendor-${itemIndex}`)
        : document.getElementById('ocr-vendor');
      if (targetSel) targetSel.value = existing.id;
      return;
    }

    const existingIds = AppState.vendors.map(v => v.id);
    const id  = FormatUtils.generateId('VND', existingIds);
    const row = [id, name, tel || '', '', ''];
    await SheetsAPI.appendRows(CONFIG.SHEET_NAMES.VENDORS, [row]);
    AppState.vendors.push({ id, name, tel: tel || '', contact: '', notes: '' });

    UI.closeModal();
    UI.showToast(`業者「${name}」を追加しました`);
    this.renderResult();
    const targetSel = itemIndex !== null
      ? document.getElementById(`item-vendor-${itemIndex}`)
      : document.getElementById('ocr-vendor');
    if (targetSel) targetSel.value = id;
  },

  showNewMedicineModal(index, item) {
    UI.showModal('新規薬品追加', `
      <div class="form-group">
        <label>薬品名</label>
        <input type="text" class="form-input" id="new-med-name" value="${item.medicine_name || ''}">
      </div>
      <div class="form-group">
        <label>有効成分</label>
        <input type="text" class="form-input" id="new-med-ingredient" value="${item.active_ingredient || ''}">
      </div>
      <div class="form-group">
        <label>規格</label>
        <input type="text" class="form-input" id="new-med-spec" value="${item.specification || ''}">
      </div>
      <div class="form-group">
        <label>カテゴリ</label>
        <input type="text" class="form-input" id="new-med-cat" value="${item.category || ''}">
      </div>
      <div class="form-group">
        <label>単位</label>
        <input type="text" class="form-input" id="new-med-unit" value="${item.unit || ''}">
      </div>
    `, [
      { label: 'キャンセル', action: 'close', class: 'btn-secondary' },
      {
        label: '追加', action: 'add', class: 'btn-primary',
        onClick: () => this.addNewMedicine(index),
      },
    ]);
  },

  async addNewMedicine(index) {
    const name = document.getElementById('new-med-name')?.value;
    if (!name) { UI.showToast('薬品名を入力してください', 'error'); return; }

    const newMed = await MedicineService.add({
      name,
      ingredient:    document.getElementById('new-med-ingredient')?.value || '',
      specification: document.getElementById('new-med-spec')?.value || '',
      category:      document.getElementById('new-med-cat')?.value || '',
      unit:          document.getElementById('new-med-unit')?.value || '',
    });

    UI.closeModal();
    UI.showToast(`薬品「${name}」を追加しました`);
    const select = document.getElementById(`med-select-${index}`);
    if (select) {
      const option      = document.createElement('option');
      option.value      = newMed.id;
      option.textContent = `${newMed.name} (${newMed.specification || ''})`;
      option.selected   = true;
      select.insertBefore(option, select.firstChild.nextSibling);
    }
  },

  async saveResults() {
    const result = AppState.currentOcrResult;
    if (!result) return;

    const isInventory  = result.docType === 'inventory';
    const isDelivery   = result.docType === 'delivery';
    const isItemMode   = this._isItemMode(result);
    const effectiveDate = document.getElementById('ocr-date')?.value;

    // 値上げ通知書モード: グローバル業者チェック
    if (!isItemMode) {
      const vendorId = document.getElementById('ocr-vendor')?.value;
      if (!vendorId || vendorId === '' || vendorId === '__new__') {
        UI.showToast('業者を選択してください', 'error');
        return;
      }
    }

    // ボタン無効化
    const saveBtn = document.getElementById('btn-ocr-save');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="btn-spinner"></span> 登録中...';
      saveBtn.classList.add('btn-loading');
    }
    UI.showLoading('データを準備中...');

    try {
      const pricesToSave = [];

      for (let i = 0; i < result.items.length; i++) {
        const medSelect = document.getElementById(`med-select-${i}`);
        let medicineId  = medSelect?.value;
        const newPrice  = parseFloat(document.getElementById(`med-new-${i}`)?.value);

        if (!newPrice || isNaN(newPrice)) continue;

        // 業者IDの決定
        // 在庫一覧: 品目ごとのセレクターから取得
        // 値上げ通知書: グローバルセレクターから取得
        let vendorId;
        if (isItemMode) {
          vendorId = document.getElementById(`item-vendor-${i}`)?.value;
          if (!vendorId || vendorId === '' || vendorId === '__new__') {
            // 業者未選択の品目はスキップ（警告を出す）
            console.warn(`品目${i + 1}(${result.items[i].medicine_name}): 業者未選択のためスキップ`);
            continue;
          }
        } else {
          vendorId = document.getElementById('ocr-vendor')?.value;
        }

        // 新規薬品の場合は自動追加
        if (!medicineId || medicineId === '__new__') {
          const name = document.getElementById(`med-name-${i}`)?.value;
          if (!name) continue;
          UI.showLoading(`新規薬品を登録中... (${i + 1}/${result.items.length})`);
          const newMed = await MedicineService.add({
            name,
            ingredient:    result.items[i].active_ingredient || '',
            specification: document.getElementById(`med-spec-${i}`)?.value || '',
            category:      document.getElementById(`med-cat-${i}`)?.value || '',
            unit:          document.getElementById(`med-unit-${i}`)?.value || '',
          });
          medicineId = newMed.id;
        }

        const isCampaign      = document.getElementById(`med-campaign-${i}`)?.checked || false;
        const campaignEndDate = isCampaign
          ? document.getElementById(`med-campaign-end-${i}`)?.value || ''
          : '';

        // パッケージ情報の取得（品目モードのみ）
        const pkgQty   = isItemMode ? (parseInt(document.getElementById(`pkg-qty-${i}`)?.value) || 1) : 1;
        const pkgPrice = isItemMode && pkgQty > 1
          ? (parseFloat(document.getElementById(`pkg-price-${i}`)?.value) || 0) : 0;

        // 納品書モード: 登録（addPrices）前に「最安値より高く購入」を判定する
        const overpay = isDelivery
          ? PriceAlertService.detectOverpay(medicineId, vendorId, newPrice)
          : null;

        pricesToSave.push({
          medicineId,
          vendorId,
          price:         newPrice,
          taxIncluded:   result.items[i].tax_included || false,
          effectiveDate: effectiveDate || '',
          source:        isCampaign ? 'キャンペーン' : (isDelivery ? '納品書' : 'OCR読取り'),
          isCampaign,
          campaignEndDate,
          pkg_qty:   pkgQty,
          pkg_price: pkgPrice,
          _overpay:  overpay,
        });
      }

      if (pricesToSave.length === 0) {
        UI.showToast('登録できる価格データがありません（業者が未選択の品目は除外されます）', 'error');
        return;
      }

      UI.showLoading(`価格データを登録中... (${pricesToSave.length}件)`);
      const count = await PriceService.addPrices(pricesToSave);

      // アラートを検出・保存
      let alertCount = 0;
      if (isDelivery) {
        // 納品書: 登録前に判定済みの「最安値より高く購入」アラートを保存
        for (const item of pricesToSave) {
          if (item._overpay) {
            PriceAlertService.saveAlert({
              ...item._overpay,
              medicineId:    item.medicineId,
              vendorId:      item.vendorId,
              effectiveDate: item.effectiveDate,
            });
            alertCount++;
          }
        }
      } else {
        // 在庫一覧・値上げ通知書: 同一業者の前回価格との値上がりを検出
        for (const item of pricesToSave) {
          const detected = PriceAlertService.detectIncrease(item.medicineId, item.vendorId, item.price);
          if (detected) {
            PriceAlertService.saveAlert({
              ...detected,
              medicineId:    item.medicineId,
              vendorId:      item.vendorId,
              effectiveDate: item.effectiveDate,
            });
            alertCount++;
          }
        }
      }

      if (alertCount > 0) {
        const msg = isDelivery
          ? `${count}件登録 ⚠️ ${alertCount}件が最安値より高い購入です`
          : `${count}件登録 ⚠️ ${alertCount}件の値上がりアラートを記録しました`;
        UI.showToast(msg, 'warning');
      } else {
        const okMsg = isDelivery
          ? `${count}件登録 ✓ すべて最安値以下で購入できています`
          : `${count}件の価格データを登録しました`;
        UI.showToast(okMsg, 'success');
      }

      AppState.currentOcrResult = null;
      App.navigateTo(isDelivery ? 'order' : (isInventory ? 'inventory' : 'prices'));

    } catch (err) {
      UI.showToast(`登録エラー: ${err.message}`, 'error');
      console.error(err);
    } finally {
      UI.hideLoading();
      if (saveBtn) {
        saveBtn.disabled  = false;
        saveBtn.innerHTML = '登録する';
        saveBtn.classList.remove('btn-loading');
      }
    }
  },
};

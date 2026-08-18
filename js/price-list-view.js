// 最安値価格表ビュー（印刷→PDF出力）
// 全薬品の最安値を一覧化し、ブラウザの印刷機能でPDF保存する。
const PriceListView = {
  CLINIC_NAME: '上桂動物病院',
  search: '',
  category: '',

  render() {
    const categories = [...new Set(
      AppState.medicines.map(m => m.category).filter(Boolean)
    )].sort();
    const catOptions = categories.map(c => `<option value="${c}">${c}</option>`).join('');

    return `
      <div class="view-content price-list-view">
        <div class="no-print">
          <h2>最安値価格表</h2>
          <p class="view-desc">全品目の最安値を一覧表示します。「PDF出力」で印刷→PDF保存できます（iPhoneは共有→ファイルに保存）。</p>
          <div class="price-list-toolbar">
            <input type="search" id="pl-search" class="form-input" placeholder="🔍 薬品名で絞り込み" value="${this.search}">
            <select id="pl-category" class="form-select">
              <option value="">全カテゴリ</option>
              ${catOptions}
            </select>
            <button class="btn btn-primary" id="pl-print">🖨 PDF出力</button>
            <button class="btn btn-secondary" id="pl-csv">📥 CSV出力（薬用量計算用）</button>
          </div>
        </div>

        <div id="pl-print-area" class="print-area">
          <div class="print-header print-only">
            <span class="print-title">${this.CLINIC_NAME}　最安値価格表</span>
            <span class="print-date">出力日: ${FormatUtils.formatDate(FormatUtils.today())}</span>
          </div>
          <div id="pl-table-wrap"></div>
        </div>
      </div>`;
  },

  init() {
    this.renderTable();
    document.getElementById('pl-search')?.addEventListener('input', (e) => {
      this.search = e.target.value;
      this.renderTable();
    });
    document.getElementById('pl-category')?.addEventListener('change', (e) => {
      this.category = e.target.value;
      this.renderTable();
    });
    document.getElementById('pl-print')?.addEventListener('click', () => window.print());
    document.getElementById('pl-csv')?.addEventListener('click', () => this.exportCsv());
  },

  // ===== CSV出力（薬用量計算アプリ用） =====
  // フォーマット: 薬剤名,剤型,単価（仕入）,含有量（mg/錠）
  // 画面の絞り込み（検索・カテゴリ）がそのまま反映される

  // 名前・規格から含有量（mg）を抽出。μg/ngはmgに換算。ml等は対象外
  _parseMgContent(name, spec) {
    const re = /([0-9]+(?:[.][0-9]+)?)\s*(mg|㎎|ｍｇ|μg|µg|ug|ng)/i;
    for (const text of [name || '', spec || '']) {
      const normalized = text.replace(/[０-９．]/g,
        c => c === '．' ? '.' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const m = normalized.match(re);
      if (m) {
        const value = parseFloat(m[1]);
        const unit = m[2].toLowerCase();
        if (unit === 'ng') return value / 1000000;
        if (unit === 'μg' || unit === 'µg' || unit === 'ug') return value / 1000;
        return value; // mg
      }
    }
    return null;
  },

  // 名前・単位から剤型を推定（判定できなければ空欄）
  _parseDosageForm(name, unit) {
    const text = `${name || ''} ${unit || ''}`;
    if (/チュアブル/.test(text)) return 'チュアブル';
    if (/カプセル/.test(text)) return 'カプセル';
    if (/散|顆粒|パウダー|原末|[^錠]粉/.test(text) || unit === '粉') return '粉';
    if (/錠/.test(text)) return '錠';
    return '';
  },

  exportCsv() {
    let rows = this.buildRows();
    if (this.category) rows = rows.filter(r => r.category === this.category);
    if (this.search) {
      const q = FormatUtils.normalize(this.search);
      rows = rows.filter(r => FormatUtils.normalize(r.name).includes(q));
    }
    if (rows.length === 0) {
      UI.showToast('出力対象がありません', 'error');
      return;
    }

    const lines = ['薬剤名,剤型,単価（仕入）,含有量（mg/錠）'];
    rows.forEach(r => {
      const med = AppState.medicines.find(m => m.name === r.name && (m.specification || '') === r.spec);
      const mg = this._parseMgContent(r.name, r.spec);
      // 単価は元データの精度を維持（最大6桁で丸め）
      const price = Math.round(r.price * 1000000) / 1000000;
      // 薬用量計算アプリのCSV解析は単純なカンマ区切り（引用符非対応）のため、
      // 名前中のカンマ・引用符・改行は全角カンマや空白に置換する
      const name = String(r.name).replace(/,/g, '，').replace(/["\r\n]/g, ' ').trim();
      lines.push([
        name,
        this._parseDosageForm(r.name, med?.unit),
        price,
        mg == null ? '' : mg,
      ].join(','));
    });

    // Excel/Numbersで文字化けしないようBOM付きUTF-8
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const d = new Date();
    const filename = `薬剤データ_${this.CLINIC_NAME}${d.getFullYear()}年${d.getMonth() + 1}月.csv`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);

    UI.showToast(`${rows.length}品目をCSV出力しました（${filename}）`, 'success');
  },

  // 最安値の行データを構築（薬品ごと）
  buildRows() {
    const cheapestMap = PriceService.buildCheapestMap();
    const rows = [];
    Object.entries(cheapestMap).forEach(([medicineId, price]) => {
      const med = MedicineService.findById(medicineId);
      if (!med) return;
      const vendorCount = PriceService.getLatestPrices(medicineId).length;
      rows.push({
        name: med.name,
        spec: med.specification || '',
        category: med.category || '',
        price: price.price,
        taxIncluded: price.taxIncluded,
        vendorName: UI.vendorName(price.vendorId),
        vendorCount,
        campaign: PriceService.getCampaignInfo(price)?.isActive || false,
      });
    });
    // カテゴリ → 薬品名 でソート
    rows.sort((a, b) =>
      (a.category || '').localeCompare(b.category || '', 'ja') ||
      a.name.localeCompare(b.name, 'ja'));
    return rows;
  },

  renderTable() {
    const wrap = document.getElementById('pl-table-wrap');
    if (!wrap) return;

    let rows = this.buildRows();

    // 絞り込み
    if (this.category) rows = rows.filter(r => r.category === this.category);
    if (this.search) {
      const q = FormatUtils.normalize(this.search);
      rows = rows.filter(r => FormatUtils.normalize(r.name).includes(q));
    }

    if (rows.length === 0) {
      wrap.innerHTML = '<p class="empty-message">該当する価格データがありません。</p>';
      return;
    }

    const body = rows.map(r => `
      <tr>
        <td class="pl-name">${r.name}${r.campaign ? ' <span class="badge badge-campaign-sm">🎯</span>' : ''}</td>
        <td class="pl-spec">${r.spec}</td>
        <td class="pl-cat">${r.category}</td>
        <td class="pl-price">${FormatUtils.formatCurrency(r.price)}${r.taxIncluded ? '<span class="pl-tax">税込</span>' : ''}</td>
        <td class="pl-vendor">${r.vendorName}${r.vendorCount > 1 ? `<span class="pl-vcount">他${r.vendorCount - 1}社</span>` : ''}</td>
      </tr>`).join('');

    wrap.innerHTML = `
      <div class="pl-count no-print">${rows.length}品目</div>
      <table class="data-table price-list-table">
        <thead>
          <tr>
            <th>薬品名</th>
            <th>規格</th>
            <th>カテゴリ</th>
            <th>最安単価</th>
            <th>最安業者</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>`;
  },
};

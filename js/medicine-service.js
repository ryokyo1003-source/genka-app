// 薬品マスターサービス
const MedicineService = {
  // キャッシュからパース済みデータを取得
  getAll() {
    return AppState.medicines;
  },

  // IDで検索
  findById(id) {
    return AppState.medicines.find(m => m.id === id);
  },

  // あいまい検索
  search(query) {
    if (!query) return this.getAll();
    return this.getAll()
      .map(m => ({
        ...m,
        score: Math.max(
          FormatUtils.matchScore(query, m.name),
          FormatUtils.matchScore(query, m.ingredient || ''),
          FormatUtils.matchScore(query, m.category || '')
        ),
      }))
      .filter(m => m.score >= 40)
      .sort((a, b) => b.score - a.score);
  },

  // 新規薬品を追加
  async add(medicine) {
    const existingIds = AppState.medicines.map(m => m.id);
    const id = FormatUtils.generateId('MED', existingIds);
    const row = [
      id,
      medicine.name,
      medicine.ingredient || '',
      medicine.specification || '',
      medicine.category || '',
      medicine.unit || '',
      FormatUtils.today(),
      medicine.notes || '',
    ];
    await SheetsAPI.appendRows(CONFIG.SHEET_NAMES.MEDICINES, [row]);
    const newMed = this.rowToObject([row[0], ...row.slice(1)], row);
    this._lastRowIndex = (this._lastRowIndex || 1) + 1;
    newMed._rowIndex = this._lastRowIndex;
    AppState.medicines.push(newMed);
    return newMed;
  },

  // 薬品マスターの項目を修正する（薬品名・成分名・規格・カテゴリ・単位 = B〜F列）
  // この薬品に紐づく全業者の価格行の表示に反映される
  async update(id, { name, ingredient, specification, category, unit }) {
    const m = this.findById(id);
    if (!m) throw new Error('薬品データが見つかりません');
    if (!m._rowIndex) throw new Error('行番号が不明です。データを再読み込みしてください');
    if (!name || !name.trim()) throw new Error('薬品名を入力してください');

    const next = {
      name: name.trim(),
      ingredient: (ingredient ?? m.ingredient).trim(),
      specification: (specification ?? m.specification).trim(),
      category: (category ?? m.category).trim(),
      unit: (unit ?? m.unit).trim(),
    };
    await SheetsAPI.updateRange(
      CONFIG.SHEET_NAMES.MEDICINES,
      `B${m._rowIndex}:F${m._rowIndex}`,
      [[next.name, next.ingredient, next.specification, next.category, next.unit]]
    );
    Object.assign(m, next);
    return m;
  },

  // 行データをオブジェクトに変換
  // ★ GAS経由の読み込みではセル値が数値のまま届くことがある（規格 "100" など）ため
  //   文字列に正規化する
  rowToObject(headers, row) {
    const s = v => (v == null ? '' : String(v));
    return {
      id: s(row[0]),
      name: s(row[1]),
      ingredient: s(row[2]),
      specification: s(row[3]),
      category: s(row[4]),
      unit: s(row[5]),
      registeredDate: FormatUtils.toDateOnly(row[6]),
      notes: s(row[7]),
    };
  },

  // 生データからオブジェクト配列を作成
  // 元のシート行番号 (_rowIndex) を保持 → 修正時にこの行を書き換える
  parseRows(rows) {
    if (!rows || rows.length < 2) {
      this._lastRowIndex = rows?.length || 1;
      return [];
    }
    this._lastRowIndex = rows.length; // ヘッダー込みの末尾行
    return rows.slice(1).map((row, i) => {
      const obj = this.rowToObject(rows[0], row);
      obj._rowIndex = i + 2; // 1=ヘッダー、2以降がデータ
      return obj;
    });
  },

  // 成分名で同一成分グループを取得
  findByIngredient(ingredient) {
    if (!ingredient) return [];
    const norm = FormatUtils.normalize(ingredient);
    return this.getAll().filter(m =>
      FormatUtils.normalize(m.ingredient) === norm
    );
  },
};

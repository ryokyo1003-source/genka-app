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
    AppState.medicines.push(newMed);
    return newMed;
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
  parseRows(rows) {
    if (!rows || rows.length < 2) return [];
    return rows.slice(1).map(row => this.rowToObject(rows[0], row));
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

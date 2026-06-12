// OCRサービス - 読み取り結果の処理・マスターマッチング
const OcrService = {
  // OCR結果を既存マスターとマッチングする
  // ★ 複数業者対応: 品目ごとの vendor_name をマスターとマッチング
  matchWithMasters(ocrResult, medicines, vendors) {
    // 全業者名のマスターマッチングマップを先に構築
    const vendorMatchMap = {}; // vendor_name (文字列) → vendor オブジェクト

    // ドキュメント全体の業者名（単一業者 or プライマリー）
    let primaryVendorMatch = null;
    if (ocrResult.vendor_name) {
      primaryVendorMatch = this.findVendor(ocrResult.vendor_name, vendors);
    }

    // 複数業者名リスト（parsePipeFormatが返す vendor_names）
    const vendorNames = ocrResult.vendor_names ||
      [...new Set((ocrResult.items || []).map(i => i.vendor_name).filter(Boolean))];

    for (const vName of vendorNames) {
      if (vName && !vendorMatchMap[vName]) {
        vendorMatchMap[vName] = this.findVendor(vName, vendors);
      }
    }

    // 各薬品アイテムのマッチング
    const matchedItems = (ocrResult.items || []).map(item => {
      const candidates = this.findMedicineCandidates(item.medicine_name, medicines);

      // 品目ごとの業者マッチ（品目に vendor_name がある場合はそれを優先）
      let itemVendorMatch = primaryVendorMatch;
      if (item.vendor_name) {
        itemVendorMatch = vendorMatchMap[item.vendor_name] || null;
      }

      return {
        ...item,
        matchedMedicineId:  candidates.length > 0 ? candidates[0].id : null,
        medicineCandidates: candidates,
        isNew:              candidates.length === 0,
        vendorMatch:        itemVendorMatch,  // 品目ごとの業者マッチ結果
      };
    });

    return {
      vendor_name:        ocrResult.vendor_name,
      vendor_names:       vendorNames,
      hasMultipleVendors: ocrResult.hasMultipleVendors || vendorNames.length > 1,
      vendorMatch:        primaryVendorMatch,
      vendorMatchMap,
      effective_date:     ocrResult.effective_date,
      items:              matchedItems,
      notes:              ocrResult.notes,
      confidence:         ocrResult.confidence,
    };
  },

  // 業者をあいまい検索（スコア60%以上）
  findVendor(name, vendors) {
    if (!name) return null;
    let bestMatch = null;
    let bestScore = 0;
    vendors.forEach(v => {
      const score = FormatUtils.matchScore(name, v.name);
      if (score > bestScore && score >= 60) {
        bestScore = score;
        bestMatch = v;
      }
    });
    return bestMatch;
  },

  // 薬品候補をあいまい検索（スコア順）
  findMedicineCandidates(name, medicines) {
    if (!name) return [];
    return medicines
      .map(m => ({
        ...m,
        score: Math.max(
          FormatUtils.matchScore(name, m.name),
          FormatUtils.matchScore(name, m.ingredient || '')
        ),
      }))
      .filter(m => m.score >= 65)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  },
};

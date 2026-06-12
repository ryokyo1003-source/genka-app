// 比較サービス
const CompareService = {
  // 同一薬品の業者間比較
  comparePricesByMedicine(medicineId) {
    const medicine = MedicineService.findById(medicineId);
    if (!medicine) return null;

    const latestPrices = PriceService.getLatestPrices(medicineId);
    const cheapest = latestPrices.length > 0
      ? latestPrices.reduce((min, p) => p.price < min.price ? p : min)
      : null;

    return {
      medicine,
      prices: latestPrices.map(p => {
        const vendor = AppState.vendors.find(v => v.id === p.vendorId);
        return {
          ...p,
          vendorName: vendor?.name || p.vendorId,
          isCheapest: cheapest && p.id === cheapest.id,
          diffFromCheapest: cheapest ? p.price - cheapest.price : 0,
        };
      }).sort((a, b) => a.price - b.price),
    };
  },

  // 同一成分の横断比較（ジェネリック vs 先発品）
  compareByIngredient(ingredient) {
    const medicines = MedicineService.findByIngredient(ingredient);
    if (medicines.length === 0) return null;

    const allPrices = [];
    medicines.forEach(med => {
      const latestPrices = PriceService.getLatestPrices(med.id);
      latestPrices.forEach(p => {
        const vendor = AppState.vendors.find(v => v.id === p.vendorId);
        allPrices.push({
          ...p,
          medicineName: med.name,
          medicineSpec: med.specification,
          vendorName: vendor?.name || p.vendorId,
        });
      });
    });

    allPrices.sort((a, b) => a.price - b.price);
    const cheapestPrice = allPrices.length > 0 ? allPrices[0].price : 0;
    allPrices.forEach(p => {
      p.isCheapest = p.price === cheapestPrice;
      p.diffFromCheapest = p.price - cheapestPrice;
    });

    return {
      ingredient,
      medicines,
      prices: allPrices,
    };
  },

  // 全成分グループの一覧を取得
  getIngredientGroups() {
    const groups = {};
    AppState.medicines.forEach(m => {
      if (!m.ingredient) return;
      const key = FormatUtils.normalize(m.ingredient);
      if (!groups[key]) {
        groups[key] = { ingredient: m.ingredient, medicines: [] };
      }
      groups[key].medicines.push(m);
    });
    return Object.values(groups).filter(g => g.medicines.length >= 2);
  },

  // 成分グループ一覧に最安値情報付きで返す（compare-view.js で使用）
  getIngredientGroupsWithPrices() {
    return this.getIngredientGroups().map(g => {
      const allPrices = [];
      g.medicines.forEach(med => {
        PriceService.getLatestPrices(med.id).forEach(p => {
          const vendor = AppState.vendors.find(v => v.id === p.vendorId);
          allPrices.push({
            medicineName: med.name,
            vendorName: vendor?.name || p.vendorId,
            price: p,
          });
        });
      });
      allPrices.sort((a, b) => a.price.price - b.price.price);
      return { ...g, cheapest: allPrices[0] || null };
    });
  },
};

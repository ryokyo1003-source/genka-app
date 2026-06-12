// フォーマット・バリデーションユーティリティ
const FormatUtils = {
  // 通貨フォーマット
  formatCurrency(value) {
    if (value == null || isNaN(value)) return '-';
    return '¥' + Number(value).toLocaleString('ja-JP');
  },

  // 日付フォーマット（YYYY-MM-DD → YYYY/MM/DD）
  formatDate(dateStr) {
    if (!dateStr) return '-';
    return dateStr.replace(/-/g, '/');
  },

  // 今日の日付をYYYY-MM-DD形式で
  today() {
    return new Date().toISOString().slice(0, 10);
  },

  // ID生成（プレフィックス + 連番）
  generateId(prefix, existingIds) {
    let maxNum = 0;
    existingIds.forEach(id => {
      const match = id.match(new RegExp(`^${prefix}-(\\d+)$`));
      if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
    });
    const next = String(maxNum + 1).padStart(prefix === 'PRC' ? 5 : 4, '0');
    return `${prefix}-${next}`;
  },

  // テキスト正規化（あいまい検索用）
  normalize(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/\s+/g, '')
      // 全角英数を半角に
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      // カタカナをひらがなに
      .replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
      // 長音記号の統一
      .replace(/[ー－—]/g, '-');
  },

  // 薬品名の核心部分を抽出（数量・記号を除去）
  extractCoreName(text) {
    if (!text) return '';
    return this.normalize(text)
      .replace(/[*×・\\/]/g, '')        // 記号除去
      .replace(/\d+(錠|枚入|本入|ml|mg|g|テスト入|包|袋|個|缶|瓶|管|本)$/g, '')  // 末尾の数量除去
      .replace(/\d+(錠|枚入|本入|ml|mg|g|テスト入|包|袋|個|缶|瓶|管|本)/g, '')   // 途中の数量も除去
      .replace(/\d+/g, '');             // 残った数字を除去
  },

  // あいまいマッチスコア（0-100）
  matchScore(query, target) {
    const nq = this.normalize(query);
    const nt = this.normalize(target);
    if (!nq || !nt) return 0;
    if (nq === nt) return 100;

    // 核心部分（製品名）で比較
    const cq = this.extractCoreName(query);
    const ct = this.extractCoreName(target);
    if (cq && ct && cq === ct) return 95;
    if (cq && ct && (ct.startsWith(cq) || cq.startsWith(ct))) return 85;
    if (cq && ct && (ct.includes(cq) || cq.includes(ct))) {
      const shorter = Math.min(cq.length, ct.length);
      const longer = Math.max(cq.length, ct.length);
      if (shorter >= 3) return Math.round(80 * (shorter / longer));
    }

    // 正規化テキストでの先頭一致
    if (nt.startsWith(nq) || nq.startsWith(nt)) return 85;

    // LCSベースのスコア（核心部分で）
    if (cq.length >= 2 && ct.length >= 2) {
      const lcsLen = this._lcsLength(cq, ct);
      const longer = Math.max(cq.length, ct.length);
      return Math.round((lcsLen / longer) * 60);
    }

    return 0;
  },

  // 最長共通部分文字列の長さ
  _lcsLength(a, b) {
    const m = a.length, n = b.length;
    let prev = new Array(n + 1).fill(0);
    let curr = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          curr[j] = prev[j - 1] + 1;
        } else {
          curr[j] = Math.max(prev[j], curr[j - 1]);
        }
      }
      [prev, curr] = [curr, prev];
      curr.fill(0);
    }
    return prev[n];
  },

  // 変動率計算
  changeRate(oldPrice, newPrice) {
    if (!oldPrice || !newPrice) return null;
    return ((newPrice - oldPrice) / oldPrice * 100).toFixed(1);
  },
};

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

  // 今日の日付をYYYY-MM-DD形式で（端末のタイムゾーン基準。
  // toISOString はUTCのため朝9時前だと前日になってしまう）
  today() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  // セル値を YYYY-MM-DD に正規化
  // GAS経由の読み込みでは日付セルが "2026-06-11T15:00:00.000Z" のような
  // ISO文字列で届くため、端末のタイムゾーン（JST）で日付部分だけ取り出す
  toDateOnly(value) {
    if (value == null || value === '') return '';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (isNaN(d)) return s.slice(0, 10);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return s;
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

  // 業者名のコア部分を抽出
  // "株式会社アスコ 一宮物流センター" → "あすこ"（株式会社/拠点情報を除去して正規化）
  extractVendorCore(text) {
    if (!text) return '';
    let s = String(text);

    // 会社種別を除去（前後問わず）
    s = s.replace(/株式会社|（株）|\(株\)|㈱|有限会社|（有）|\(有\)|㈲|合同会社|合資会社|医療法人|社団法人|財団法人|農業協同組合/g, '');

    // スペース以降を除去（"アスコ 一宮物流センター" → "アスコ"）
    const firstSeg = s.split(/[\s　]/).filter(Boolean)[0];
    if (firstSeg && firstSeg.length >= 2) s = firstSeg;

    // 末尾の拠点情報を1段階だけ除去（"アスコ営業所" → "アスコ"）
    // ※greedy prefix で本体を消さないよう、suffix そのものだけ削る
    s = s.replace(/(物流センター|配送センター|営業所|事業所|支店|支社|本店|本社|デポ|支部)$/, '');

    return this.normalize(s.trim());
  },

  // 業者名専用のあいまいマッチスコア（0-100）
  // 「株式会社アスコ 一宮物流センター」⇔「アスコ」のような正式名⇔略称マッチに対応
  vendorMatchScore(query, target) {
    const qc = this.extractVendorCore(query);
    const tc = this.extractVendorCore(target);
    if (!qc || !tc) return 0;
    if (qc === tc) return 100;

    // 先頭一致は強く評価（master "あすこ" がOCR "あすこ一宮物流せんたー" の先頭にある）
    if (tc.length >= 2 && qc.startsWith(tc)) return 90;
    if (qc.length >= 2 && tc.startsWith(qc)) return 90;

    // 包含
    if (qc.includes(tc) || tc.includes(qc)) {
      const shorter = Math.min(qc.length, tc.length);
      if (shorter >= 2) return 75;
    }

    // 通常のmatchScoreにフォールバック
    return this.matchScore(query, target);
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

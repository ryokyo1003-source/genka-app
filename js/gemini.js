// Gemini Vision API - OCR読み取り
const GeminiAPI = {

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // プロンプト生成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // 在庫一覧・価格表解析用プロンプト
  // ★ JSON形式ではなくパイプ区切り形式を使用 → 出力トークンを約70%削減
  // ★ 複数業者対応: VENDOR行でセクションを区切る
  buildInventoryPrompt() {
    return `あなたは動物病院の在庫管理システムのデータ入力アシスタントです。
この書類（PDF・画像）は薬剤・試薬・医療材料の在庫一覧または価格表です。
複数の仕入先・メーカー・業者が含まれている場合があります。

全品目を漏れなく読み取り、以下のパイプ(|)区切り形式のみで返してください。
JSONや説明文は一切出力しないでください。

【出力形式】
VENDOR|仕入先名・業者名・メーカー名
薬品名|規格|単位|単価|税込(0=税抜/1=税込)|有効成分|カテゴリ|入数|パッケージ価格

【★ 単価の計算ルール - 必ず守ること】
書類の価格が「1箱・1パック・1ケース」あたりの場合は、1単位(錠・mL・本)あたりの単価を計算して記入する。
- 例: 100錠入り 10,000円 → 単価=100(10000÷100)、入数=100、パッケージ価格=10000
- 例: 10本セット 15,000円 → 単価=1500(15000÷10)、入数=10、パッケージ価格=15000
- 例: 500mLバッグ×5袋 22,500円 → 単価=4500(22500÷5)、入数=5、パッケージ価格=22500
- 例: 1本 5,678円（単品販売） → 単価=5678、入数・パッケージ価格フィールドは省略OK

【例 - 複数業者が混在する場合】
VENDOR|ビルバック
アモキシシリン250mg錠|250mg|錠|100|0|アモキシシリン|抗生物質|100|10000
バイトリル2.5%液|50mL|本|5678|0|エンロフロキサシン|抗生物質
VENDOR|インターベット
ノバックス50mg|50mg|錠|890|0||消炎鎮痛
VENDOR|共立製薬
ソルラクト輸液|500mL|袋|4500|0||輸液|5|22500
VENDOR|不明
その他薬品|100mg|錠|789|0||その他

【ルール】
- 仕入先・メーカー・業者が変わるたびに必ず新しい「VENDOR|業者名」行を挿入する
- 業者が1社のみなら先頭に1行だけ挿入する
- 書類に「仕入先」「メーカー」「業者」「販売元」等の列や表示がある場合はそれを使う
- 業者名が読み取れない品目は「VENDOR|不明」とする
- 単価は税抜を優先。税込のみの場合は税込値を入れて税込フィールドを1にする
- 有効成分・カテゴリが不明の場合は空欄のまま（|の区切りは維持する）
- 価格は数値のみ（¥や円の記号は不要）
- 全ページ・全品目を漏れなく含めること
- 上記形式以外のテキストは一切出力しないこと`;
  },

  // 納品書（仕入れ）解析用プロンプト
  // ★ 在庫一覧と同じパイプ(|)区切り形式 → parsePipeFormat で共通処理
  buildDeliveryNotePrompt() {
    return `あなたは動物病院の仕入れ管理システムのデータ入力アシスタントです。
この書類（PDF・画像）は薬剤卸・メーカーからの「納品書」です。実際に仕入れた品目と単価が記載されています。
一般的な納品書のレイアウト: 商品コード / 商品名 / ロット / 有効期限 / 数量 / 単価(税抜) / 金額(税抜)。

納品書を発行した仕入先（納品元の業者名）と、全ての納品品目を漏れなく読み取り、
以下のパイプ(|)区切り形式のみで返してください。JSONや説明文は一切出力しないでください。

【出力形式】
VENDOR|仕入先名（納品書を発行した業者名）
薬品名|規格|単位|単価|税込(0=税抜/1=税込)|有効成分|カテゴリ|数量|金額

【★ 単価のルール - 必ず守ること】
- 「単価」列がある場合はその値（1個・1本・1箱あたりの税抜単価）をそのまま「単価」に入れる。
- 単価列が無く金額と数量だけの場合は、単価 = 金額 ÷ 数量 を計算して入れる。
- 価格は数値のみ（¥・円・カンマは不要）。税抜を優先し、税込のみなら税込値を入れて税込フィールドを1にする。

【例】
VENDOR|シグニ
オプティミューン眼軟膏|3.5g|箱|3480|0||点眼薬|5|17400
セレニア錠16mg|16mg|錠|250|0||制吐|100|25000

【ルール】
- 仕入先（納品元の業者名）を必ず先頭のVENDOR行に入れる。読み取れない場合は「VENDOR|不明」とする。
- 商品名は納品書に記載されている通りに記入する。
- 規格（容量・mg等）が商品名に含まれる場合は規格列にも切り出す。不明なら空欄。
- 有効成分・カテゴリが不明な場合は空欄のまま（|の区切りは維持する）。
- 小計・消費税・合計などの集計行や、品目でない行は出力しない。
- 全ページ・全品目を漏れなく含めること。
- 上記形式以外のテキストは一切出力しないこと。`;
  },

  // 値上げ通知書解析用プロンプト
  buildOcrPrompt() {
    return `あなたは動物病院で使用する薬剤の価格通知書を解析するアシスタントです。
以下の画像は薬剤卸業者からの価格通知書（紙をスキャンまたは撮影したもの）です。

この画像から以下の情報を読み取り、JSON形式で返してください。

出力フォーマット:
{
  "vendor_name": "業者名（株式会社等も含む）",
  "effective_date": "YYYY-MM-DD形式の適用日（不明ならnull）",
  "items": [
    {
      "medicine_name": "薬品名（商品名）",
      "active_ingredient": "有効成分名（わかる場合、不明ならnull）",
      "specification": "規格（例: 50mg, 100mL）",
      "unit": "単位（例: 錠, 本, mL, 箱, バイアル）",
      "old_price": 1000,
      "new_price": 1234,
      "category": "カテゴリ（抗生物質, 消炎鎮痛, ワクチン, 麻酔, 輸液, サプリメント, その他）"
    }
  ],
  "notes": "その他の備考情報",
  "confidence": "high/medium/low"
}

注意事項:
- 価格は税抜きで読み取ってください。税込みしかない場合はその値を入れ、各itemに"tax_included": trueを付与してください
- 読み取れない項目はnullにしてください
- 表形式でも文章中でも価格情報を抽出してください
- 薬品名は画像に記載されている通りに記載してください
- 旧価格がない場合はold_priceはnullにしてください
- JSON以外の文字列は出力しないでください
- 必ず有効なJSONのみを返してください（マークダウンのコードブロックで囲まないでください）`;
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ファイルアップロード (Gemini Files API)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // PDFをGemini Files APIにアップロードしてURIを返す
  async uploadPdfToFilesAPI(file) {
    const apiKey = CONFIG.GEMINI_API_KEY;
    const boundary = 'gc0p4Jq0M2Yt08j34c0p';

    const metadata = JSON.stringify({ file: { display_name: file.name } });
    const fileBuffer = await file.arrayBuffer();

    const encoder = new TextEncoder();
    const metaBlock = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n`
    );
    const fileBlock = encoder.encode(
      `--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`
    );
    const fileBytes  = new Uint8Array(fileBuffer);
    const endBlock   = encoder.encode(`\r\n--${boundary}--`);

    const body = new Uint8Array(
      metaBlock.length + fileBlock.length + fileBytes.length + endBlock.length
    );
    let pos = 0;
    body.set(metaBlock,  pos); pos += metaBlock.length;
    body.set(fileBlock,  pos); pos += fileBlock.length;
    body.set(fileBytes,  pos); pos += fileBytes.length;
    body.set(endBlock,   pos);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}&uploadType=multipart`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body: body.buffer,
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`FilesAPIアップロード失敗: ${errData.error?.message || res.statusText}`);
    }

    const data = await res.json();
    if (!data.file?.uri) throw new Error('Files API: URIを取得できませんでした');
    console.log('[GeminiAPI] Files APIアップロード成功:', data.file.uri);
    return data.file.uri;
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Gemini API 呼び出し
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Gemini API を呼び出してテキストを返す共通メソッド
  async callGeminiAPI(prompt, contentPart) {
    const body = {
      contents: [{
        parts: [{ text: prompt }, contentPart],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    };

    const res = await fetch(CONFIG.GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || res.statusText;
      throw new Error(`Gemini APIエラー (${res.status}): ${msg}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      // finish_reason を確認
      const reason = data.candidates?.[0]?.finishReason || '不明';
      throw new Error(`Gemini APIから応答がありませんでした (finishReason: ${reason})`);
    }

    console.log(`[GeminiAPI] レスポンス長: ${text.length}文字`);
    return text;
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // メイン解析エントリーポイント
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // パイプ区切り形式で解析するドキュメント種別か
  _usesPipeFormat(docType) {
    return docType === 'inventory' || docType === 'delivery';
  },

  _promptFor(docType) {
    if (docType === 'inventory') return this.buildInventoryPrompt();
    if (docType === 'delivery') return this.buildDeliveryNotePrompt();
    return this.buildOcrPrompt();
  },

  // ファイルを解析（uploadViewから呼ばれるメインメソッド）
  async analyzeFile(file, docType = 'price_notice') {
    const prompt = this._promptFor(docType);

    let contentPart;

    if (file.type === 'application/pdf') {
      // PDFはFiles APIを試みる（失敗したらBase64にフォールバック）
      try {
        console.log('[GeminiAPI] PDFをFiles APIでアップロード中...');
        const fileUri = await this.uploadPdfToFilesAPI(file);
        contentPart = { file_data: { mime_type: 'application/pdf', file_uri: fileUri } };
      } catch (uploadErr) {
        console.warn('[GeminiAPI] Files API失敗 → Base64にフォールバック:', uploadErr.message);
        const { base64, mimeType } = await ImageUtils.fileToBase64(file);
        contentPart = { inline_data: { mime_type: mimeType, data: base64 } };
      }
    } else {
      // 画像はBase64に変換
      const { base64, mimeType } = await ImageUtils.fileToBase64(file);
      contentPart = { inline_data: { mime_type: mimeType, data: base64 } };
    }

    const responseText = await this.callGeminiAPI(prompt, contentPart);

    if (this._usesPipeFormat(docType)) {
      // 在庫一覧・納品書: パイプ区切り形式でパース（トークン効率が高い）
      const pipeResult = this.parsePipeFormat(responseText);
      if (pipeResult.items.length > 0) {
        console.log(`[GeminiAPI] パイプ形式パース成功: ${pipeResult.items.length}件`);
        return pipeResult;
      }
      // パイプ形式が失敗した場合はJSONとして試みる（フォールバック）
      console.warn('[GeminiAPI] パイプ形式失敗 → JSON解析にフォールバック');
      return this.parseResponse(responseText);
    }

    return this.parseResponse(responseText);
  },

  // 後方互換用（Base64を直接渡す旧来のAPI）
  async analyzeImage(base64Data, mimeType, docType = 'price_notice') {
    const prompt = this._promptFor(docType);

    const contentPart = { inline_data: { mime_type: mimeType, data: base64Data } };
    const responseText = await this.callGeminiAPI(prompt, contentPart);

    if (this._usesPipeFormat(docType)) {
      const pipeResult = this.parsePipeFormat(responseText);
      if (pipeResult.items.length > 0) return pipeResult;
    }
    return this.parseResponse(responseText);
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // レスポンス解析
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // ★ パイプ区切り形式のレスポンスをパース（在庫一覧専用）
  // 形式: 薬品名|規格|単位|単価|税込(0/1)|有効成分|カテゴリ
  // ★ 複数業者対応: VENDOR行でセクションを区切り、品目ごとに vendor_name を持たせる
  parsePipeFormat(text) {
    const lines = text.trim().split('\n');
    let currentVendorName = null;
    const items = [];
    let skipped = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // パイプを含まない行はスキップ（説明文・区切り線など）
      if (!line.includes('|')) continue;

      // 区切り線・コメント行をスキップ
      if (/^[-=*#]{2,}/.test(line)) continue;

      const parts = line.split('|');

      // VENDOR行の処理（業者が変わるたびに更新）
      if (parts[0].trim().toUpperCase() === 'VENDOR') {
        const vName = parts[1]?.trim();
        currentVendorName = (vName && vName !== '不明' && vName !== 'なし') ? vName : null;
        continue;
      }

      // ヘッダー行をスキップ
      const firstPart = parts[0].trim();
      if (['薬品名', '品名', '商品名', '製品名', '品目名'].includes(firstPart)) continue;

      // 品目行（最低: 薬品名|規格|単位|単価）
      if (parts.length < 4) { skipped++; continue; }

      const nameRaw     = parts[0]?.trim();
      const specRaw     = parts[1]?.trim();
      const unitRaw     = parts[2]?.trim();
      const priceRaw    = parts[3]?.trim();
      const taxRaw      = parts[4]?.trim();
      const ingRaw      = parts[5]?.trim();
      const catRaw      = parts[6]?.trim();
      const pkgQtyRaw   = parts[7]?.trim();   // 入数（パッケージ内の単品数）
      const pkgPriceRaw = parts[8]?.trim();   // パッケージ価格（入数×単価の元の値）

      // 価格のクリーニング（¥, 円, カンマ, スペースを除去）
      const cleanNum = (s) => parseFloat((s || '').replace(/[¥円,\s]/g, '').replace(/[^\d.]/g, ''));
      const new_price   = cleanNum(priceRaw);   // 単価（すでに1単位あたりに計算済み）
      const pkg_qty     = pkgQtyRaw   ? Math.max(1, parseInt(pkgQtyRaw) || 1) : 1;
      const pkg_price   = pkgPriceRaw ? cleanNum(pkgPriceRaw) : (pkg_qty > 1 ? new_price * pkg_qty : new_price);

      // 薬品名が空 or 価格が無効な行はスキップ
      if (!nameRaw || isNaN(new_price) || new_price <= 0) {
        skipped++;
        continue;
      }

      items.push({
        medicine_name:     nameRaw,
        active_ingredient: ingRaw  || null,
        specification:     specRaw || null,
        unit:              unitRaw || null,
        old_price:         null,
        new_price,                            // 単価（1単位あたり）
        tax_included:      taxRaw === '1',
        category:          catRaw  || null,
        vendor_name:       currentVendorName, // 品目ごとの業者名（複数業者対応）
        pkg_qty,                              // 入数（1なら単品販売）
        pkg_price,                            // パッケージ価格（入数×単価）
      });
    }

    if (skipped > 0) {
      console.log(`[GeminiAPI] ${skipped}行をスキップ（不正フォーマット）`);
    }

    // ユニークな業者名リストを収集
    const vendorNames = [...new Set(items.map(i => i.vendor_name).filter(Boolean))];
    const primaryVendor = vendorNames.length === 1 ? vendorNames[0] : null;

    console.log(`[GeminiAPI] 読み取り業者: ${vendorNames.length}社 [${vendorNames.join(', ')}]`);

    return {
      vendor_name:         primaryVendor,    // 後方互換（1社の場合のみ）
      vendor_names:        vendorNames,      // 全業者名リスト
      hasMultipleVendors:  vendorNames.length > 1,
      effective_date:      null,
      items,
      notes: items.length > 0
        ? `${items.length}品目 / 業者${vendorNames.length}社を読み取りました`
        : '品目を読み取れませんでした（フォーマット確認が必要）',
      confidence: items.length > 10 ? 'high' : items.length > 0 ? 'medium' : 'low',
    };
  },

  // コンパクト形式のアイテムを標準形式に展開（後方互換）
  expandCompactItems(items) {
    return items.map(item => ({
      medicine_name:     item.n || item.medicine_name || '',
      active_ingredient: item.a || item.active_ingredient || null,
      specification:     item.s || item.specification || null,
      unit:              item.u || item.unit || null,
      old_price:         null,
      new_price:         (item.p !== undefined ? item.p : item.new_price) ?? null,
      tax_included:      item.t || item.tax_included || false,
      category:          item.c || item.category || null,
    }));
  },

  // JSON形式のレスポンスをパース（値上げ通知書 + フォールバック用）
  parseResponse(text) {
    let cleaned = text.trim();

    // マークダウンコードブロックを除去
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let parsed = null;

    // 通常のJSONパース
    try {
      parsed = JSON.parse(cleaned);
    } catch (e1) {
      // JSONブロックの抽出を試みる
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (_) {}
      }

      // トークン切断によるJSON不完全の救出
      if (!parsed) {
        const rescued = this.rescueTruncatedJson(cleaned);
        if (rescued) {
          console.warn(`[GeminiAPI] JSON切断を救出: ${rescued.items.length}件`);
          parsed = rescued;
        }
      }

      if (!parsed) {
        throw new Error(
          `OCR結果のJSON解析に失敗しました。\n` +
          `原因: ${e1.message}\n` +
          `AIの応答が期待形式と異なります。再度お試しください。`
        );
      }
    }

    // コンパクト形式（短いフィールド名）を標準形式に展開
    if (parsed.items?.length > 0) {
      const first = parsed.items[0];
      if (('n' in first) || ('p' in first && !('new_price' in first))) {
        parsed.items = this.expandCompactItems(parsed.items);
      }
    }

    return parsed;
  },

  // 途中で切断されたJSONから完成済みアイテムを救出
  rescueTruncatedJson(text) {
    try {
      const vendorMatch     = text.match(/"vendor_name"\s*:\s*"([^"]*?)"/);
      const dateMatch       = text.match(/"effective_date"\s*:\s*"([^"]*?)"/);
      const confidenceMatch = text.match(/"confidence"\s*:\s*"([^"]*?)"/);

      const items = [];
      const itemSection = text.match(/"items"\s*:\s*\[([\s\S]*)/);
      if (itemSection) {
        const itemsText = itemSection[1];
        let depth = 0;
        let start = -1;
        for (let i = 0; i < itemsText.length; i++) {
          const ch = itemsText[i];
          if (ch === '{') {
            if (depth === 0) start = i;
            depth++;
          } else if (ch === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
              try {
                const obj = JSON.parse(itemsText.slice(start, i + 1));
                items.push(obj);
              } catch (_) {}
              start = -1;
            }
          }
        }
      }

      if (items.length === 0) return null;

      return {
        vendor_name:    vendorMatch?.[1] || '',
        effective_date: dateMatch?.[1] || null,
        items,
        notes: `⚠️ 応答が途中で切断されました。${items.length}件を救出済み。一部品目が欠けている可能性があります。`,
        confidence: confidenceMatch?.[1] || 'low',
      };
    } catch (_) {
      return null;
    }
  },
};

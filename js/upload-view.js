// 画像アップロード画面
const UploadView = {
  docType: 'delivery', // 'delivery' | 'price_notice' | 'inventory'
  selectedFiles: [],

  render() {
    return `
      <div class="view-content">
        <h2>書類の読み取り</h2>

        <div class="doc-type-selector">
          <button class="doc-type-btn active" data-type="delivery">
            <span class="doc-type-icon">📥</span>
            <span class="doc-type-label">納品書</span>
            <span class="doc-type-desc">仕入れた品目と単価</span>
          </button>
          <button class="doc-type-btn" data-type="price_notice">
            <span class="doc-type-icon">📄</span>
            <span class="doc-type-label">値上げ通知書</span>
            <span class="doc-type-desc">価格変更の通知</span>
          </button>
          <button class="doc-type-btn" data-type="inventory">
            <span class="doc-type-icon">📋</span>
            <span class="doc-type-label">在庫・価格一覧</span>
            <span class="doc-type-desc">現在の価格リスト</span>
          </button>
        </div>

        <div class="upload-area" id="upload-area">
          <div class="upload-icon" id="upload-icon">📷</div>
          <p class="upload-text" id="upload-text">タップして写真を撮影<br>またはファイルを選択</p>
          <p class="upload-subtext">複数枚まとめて選択できます（納品書・在庫一覧）</p>
          <!-- capture属性なし: PDFはファイル選択、画像は撮影・選択どちらも可 -->
          <!-- multiple: 複数ファイルの一括読み取りに対応 -->
          <input type="file" id="file-input" accept="image/*,application/pdf" multiple hidden>
        </div>
        <div id="preview-area" class="preview-area hidden">
          <img id="preview-image" alt="プレビュー">
          <div id="preview-filename" class="preview-filename"></div>
          <div class="preview-actions">
            <button class="btn btn-secondary" id="btn-reselect">やり直す</button>
            <button class="btn btn-primary btn-large" id="btn-analyze">
              🤖 AI読み取り開始
            </button>
          </div>
        </div>

        <!-- デバッグ情報パネル（エラー発生時に詳細を表示） -->
        <div id="debug-panel" class="debug-panel hidden">
          <div class="debug-header">
            <span>⚠️ 読み取り情報</span>
            <button class="debug-close" onclick="document.getElementById('debug-panel').classList.add('hidden')">×</button>
          </div>
          <pre id="debug-content"></pre>
        </div>
      </div>`;
  },

  init() {
    this.docType = 'delivery';
    this.selectedFiles = [];
    const uploadArea = document.getElementById('upload-area');
    const fileInput  = document.getElementById('file-input');

    // ドキュメント種類の切り替え
    document.querySelectorAll('.doc-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.doc-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.docType = btn.dataset.type;
        this.updateUploadAreaUI();
      });
    });

    uploadArea.addEventListener('click', () => fileInput.click());

    // ドラッグ&ドロップ
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFiles(e.target.files);
      }
    });

    document.getElementById('btn-reselect')?.addEventListener('click', () => {
      this.resetUpload();
    });

    document.getElementById('btn-analyze')?.addEventListener('click', () => {
      this.startAnalysis();
    });
  },

  // ドキュメント種類に応じてアップロードエリアのUIを更新
  updateUploadAreaUI() {
    const icon = document.getElementById('upload-icon');
    const text = document.getElementById('upload-text');
    const sub  = document.querySelector('.upload-subtext');
    if (!icon || !text) return;

    if (this.docType === 'inventory') {
      icon.textContent = '📋';
      text.innerHTML = 'PDFまたは画像をドロップ<br>またはタップして選択';
      if (sub) sub.style.display = '';
    } else if (this.docType === 'delivery') {
      icon.textContent = '📥';
      text.innerHTML = '納品書を撮影またはPDFを選択<br>（iPhoneは写真撮影でOK）';
      if (sub) sub.style.display = '';
    } else {
      icon.textContent = '📷';
      text.innerHTML = 'タップして写真を撮影<br>またはファイルを選択';
      // 値上げ通知書は1枚ずつ
      if (sub) sub.style.display = 'none';
    }
  },

  // 複数ファイルの受け取り
  handleFiles(fileList) {
    const files = Array.from(fileList).filter(
      f => f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    if (files.length === 0) {
      UI.showToast('画像ファイルまたはPDFを選択してください', 'error');
      return;
    }

    this.selectedFiles = files;

    const previewArea     = document.getElementById('preview-area');
    const uploadArea      = document.getElementById('upload-area');
    const previewImage    = document.getElementById('preview-image');
    const previewFilename = document.getElementById('preview-filename');

    if (files.length === 1) {
      // ── 1枚: 従来通りのプレビュー ──
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          previewImage.src = e.target.result;
          previewImage.style.display = 'block';
          if (previewFilename) previewFilename.textContent = '';
          previewArea.classList.remove('hidden');
          uploadArea.classList.add('hidden');
        };
        reader.readAsDataURL(file);
      } else {
        previewImage.src = '';
        previewImage.style.display = 'none';
        if (previewFilename) {
          const sizeMB = (file.size / 1024 / 1024).toFixed(1);
          previewFilename.innerHTML = `
            <div class="pdf-preview-info">
              <span class="pdf-icon">📄</span>
              <span class="pdf-name">${file.name}</span>
              <span class="pdf-size">${sizeMB} MB</span>
            </div>`;
        }
        previewArea.classList.remove('hidden');
        uploadArea.classList.add('hidden');
      }
    } else {
      // ── 複数枚: ファイル一覧を表示 ──
      previewImage.src = '';
      previewImage.style.display = 'none';
      const rows = files.map(f => {
        const sizeMB = (f.size / 1024 / 1024).toFixed(1);
        const ico = f.type === 'application/pdf' ? '📄' : '🖼';
        return `<div class="multi-file-row"><span class="mf-ico">${ico}</span><span class="mf-name">${f.name}</span><span class="mf-size">${sizeMB} MB</span></div>`;
      }).join('');
      if (previewFilename) {
        previewFilename.innerHTML = `
          <div class="multi-file-list">
            <div class="multi-file-head">📚 ${files.length}枚を読み取ります（1枚ずつ順番に処理）</div>
            ${rows}
          </div>`;
      }
      previewArea.classList.remove('hidden');
      uploadArea.classList.add('hidden');
    }

    // デバッグパネルを隠す
    document.getElementById('debug-panel')?.classList.add('hidden');
  },

  resetUpload() {
    this.selectedFiles = [];
    document.getElementById('file-input').value = '';
    document.getElementById('preview-area').classList.add('hidden');
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('debug-panel')?.classList.add('hidden');
  },

  async startAnalysis() {
    const files = this.selectedFiles;
    if (!files || files.length === 0) return;

    // 値上げ通知書は単一業者モデルのため1枚ずつ処理
    if (files.length > 1 && this.docType === 'price_notice') {
      UI.showToast('値上げ通知書は1枚ずつ処理します。先頭の1枚を読み取ります', 'warning');
      return this._analyzeSingle(files[0]);
    }

    if (files.length === 1) {
      return this._analyzeSingle(files[0]);
    }

    return this._analyzeBatch(files);
  },

  // ── 1枚処理（従来の挙動）──
  async _analyzeSingle(file) {
    const isPdf = file.type === 'application/pdf';
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    let loadingMsg;
    if (this.docType === 'inventory') {
      loadingMsg = isPdf && file.size > 500 * 1024
        ? `大きいPDFを解析中... (${sizeMB}MB)\nしばらくお待ちください`
        : '在庫一覧を解析中...';
    } else if (this.docType === 'delivery') {
      loadingMsg = '納品書を解析中...';
    } else {
      loadingMsg = '通知書を解析中...';
    }

    try {
      // 推定プログレスバー（1枚なので 1/1）
      UI.showProgress(loadingMsg, 1, 1, isPdf && file.size > 500 * 1024 ? 25 : 15);

      const ocrResult = await GeminiAPI.analyzeFile(file, this.docType);

      if (!ocrResult.items || ocrResult.items.length === 0) {
        throw new Error(
          '品目を読み取れませんでした。\n' +
          'ファイルが鮮明か、正しい種類（在庫一覧/値上げ通知書）を選択しているか確認してください。'
        );
      }
      UI.completeProgressStep(1, 1);

      console.log('[UploadView] OCR結果:', {
        vendor: ocrResult.vendor_name,
        itemCount: ocrResult.items.length,
        confidence: ocrResult.confidence,
        notes: ocrResult.notes,
      });

      if (ocrResult.notes?.startsWith('⚠️') || ocrResult.confidence === 'low') {
        this.showDebugInfo(`業者: ${ocrResult.vendor_name || '不明'}
品目数: ${ocrResult.items.length}件
信頼度: ${ocrResult.confidence}
備考: ${ocrResult.notes || 'なし'}`);
      }

      const matched = OcrService.matchWithMasters(
        ocrResult,
        AppState.medicines,
        AppState.vendors
      );
      matched.docType = this.docType;

      AppState.currentOcrResult = matched;
      App.navigateTo('ocr-result');

    } catch (err) {
      console.error('[UploadView] 解析エラー:', err);
      UI.showToast(`読み取りエラー: ${err.message}`, 'error');
      this.showDebugInfo(`エラー: ${err.message}\n\nファイル: ${file.name} (${sizeMB}MB)\n種類: ${this.docType}`);
    } finally {
      UI.hideLoading();
    }
  },

  // ── 複数枚処理（順次→結果を統合して一覧確認へ）──
  async _analyzeBatch(files) {
    const results = [];
    const errors  = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isPdf = file.type === 'application/pdf';
        UI.showProgress(
          `読み取り中: ${file.name}`,
          i + 1, files.length,
          isPdf && file.size > 500 * 1024 ? 25 : 15
        );

        try {
          const ocrResult = await GeminiAPI.analyzeFile(file, this.docType);
          if (!ocrResult.items || ocrResult.items.length === 0) {
            errors.push(`${file.name}: 品目を読み取れませんでした`);
          } else {
            const matched = OcrService.matchWithMasters(
              ocrResult, AppState.medicines, AppState.vendors
            );
            results.push(matched);
          }
        } catch (e) {
          console.error(`[UploadView] ${file.name} 解析エラー:`, e);
          errors.push(`${file.name}: ${e.message}`);
        }

        UI.completeProgressStep(i + 1, files.length);
      }

      const allItems = results.flatMap(r => r.items);
      if (allItems.length === 0) {
        UI.showToast('どのファイルからも品目を読み取れませんでした', 'error');
        this.showDebugInfo('エラー詳細:\n' + errors.join('\n'));
        return;
      }

      // 全ファイルの品目を1つのリストに統合（品目ごとに業者情報を保持）
      const vendorNames = [...new Set(allItems.map(it => it.vendor_name).filter(Boolean))];
      const merged = {
        vendor_name:        results[0]?.vendor_name,
        vendor_names:       vendorNames,
        hasMultipleVendors: vendorNames.length > 1,
        vendorMatch:        results[0]?.vendorMatch,
        vendorMatchMap:     Object.assign({}, ...results.map(r => r.vendorMatchMap || {})),
        effective_date:     results[0]?.effective_date,
        items:              allItems,
        notes:              errors.length
          ? `⚠️ ${errors.length}件のファイルでエラー: ${errors.join(' / ')}`
          : `📚 ${files.length}ファイルを統合（計${allItems.length}品目）`,
        confidence:         'medium',
        docType:            this.docType,
      };

      AppState.currentOcrResult = merged;

      if (errors.length) {
        UI.showToast(`${results.length}/${files.length}ファイルを読み取りました（${errors.length}件エラー）`, 'warning');
      } else {
        UI.showToast(`${files.length}ファイル・計${allItems.length}品目を読み取りました`, 'success');
      }

      App.navigateTo('ocr-result');

    } catch (err) {
      console.error('[UploadView] バッチ解析エラー:', err);
      UI.showToast(`読み取りエラー: ${err.message}`, 'error');
    } finally {
      UI.hideLoading();
    }
  },

  // デバッグ情報パネルを表示
  showDebugInfo(text) {
    const panel   = document.getElementById('debug-panel');
    const content = document.getElementById('debug-content');
    if (!panel || !content) return;
    content.textContent = text;
    panel.classList.remove('hidden');
  },
};

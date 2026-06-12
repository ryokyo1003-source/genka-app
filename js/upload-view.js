// 画像アップロード画面
const UploadView = {
  docType: 'delivery', // 'delivery' | 'price_notice' | 'inventory'

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
          <!-- capture属性なし: PDFはファイル選択、画像は撮影・選択どちらも可 -->
          <input type="file" id="file-input" accept="image/*,application/pdf" hidden>
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
        this.handleFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
      }
    });

    document.getElementById('btn-reselect')?.addEventListener('click', () => {
      this.resetUpload();
    });

    document.getElementById('btn-analyze')?.addEventListener('click', () => {
      this.startAnalysis();
    });
  },

  selectedFile: null,

  // ドキュメント種類に応じてアップロードエリアのUIを更新
  updateUploadAreaUI() {
    const icon = document.getElementById('upload-icon');
    const text = document.getElementById('upload-text');
    if (!icon || !text) return;

    if (this.docType === 'inventory') {
      icon.textContent = '📋';
      text.innerHTML = 'PDFまたは画像をドロップ<br>またはタップして選択';
    } else if (this.docType === 'delivery') {
      icon.textContent = '📥';
      text.innerHTML = '納品書を撮影またはPDFを選択<br>（iPhoneは写真撮影でOK）';
    } else {
      icon.textContent = '📷';
      text.innerHTML = 'タップして写真を撮影<br>またはファイルを選択';
    }
  },

  handleFile(file) {
    // ファイル種類チェック
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      UI.showToast('画像ファイルまたはPDFを選択してください', 'error');
      return;
    }

    this.selectedFile = file;
    const previewArea    = document.getElementById('preview-area');
    const uploadArea     = document.getElementById('upload-area');
    const previewImage   = document.getElementById('preview-image');
    const previewFilename = document.getElementById('preview-filename');

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
      // PDF
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

    // デバッグパネルを隠す
    document.getElementById('debug-panel')?.classList.add('hidden');
  },

  resetUpload() {
    this.selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('preview-area').classList.add('hidden');
    document.getElementById('upload-area').classList.remove('hidden');
    document.getElementById('debug-panel')?.classList.add('hidden');
  },

  async startAnalysis() {
    if (!this.selectedFile) return;

    const file = this.selectedFile;
    const isPdf = file.type === 'application/pdf';
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);

    // ローディングメッセージ（ファイルサイズに応じて変える）
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
      UI.showLoading(loadingMsg);

      // ★ analyzeFile() を使用 (PDF → Files API優先、フォールバックあり)
      const ocrResult = await GeminiAPI.analyzeFile(file, this.docType);

      // 読み取り結果の検証
      if (!ocrResult.items || ocrResult.items.length === 0) {
        throw new Error(
          '品目を読み取れませんでした。\n' +
          'ファイルが鮮明か、正しい種類（在庫一覧/値上げ通知書）を選択しているか確認してください。'
        );
      }

      // デバッグ情報を表示（開発時のみ）
      console.log('[UploadView] OCR結果:', {
        vendor: ocrResult.vendor_name,
        itemCount: ocrResult.items.length,
        confidence: ocrResult.confidence,
        notes: ocrResult.notes,
      });

      // notesに警告がある場合はデバッグパネルに表示
      if (ocrResult.notes?.startsWith('⚠️') || ocrResult.confidence === 'low') {
        this.showDebugInfo(`業者: ${ocrResult.vendor_name || '不明'}
品目数: ${ocrResult.items.length}件
信頼度: ${ocrResult.confidence}
備考: ${ocrResult.notes || 'なし'}`);
      }

      // マスターとマッチング
      const matched = OcrService.matchWithMasters(
        ocrResult,
        AppState.medicines,
        AppState.vendors
      );

      // 在庫一覧モードのフラグを付与
      matched.docType = this.docType;

      // OCR結果画面に遷移
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

  // デバッグ情報パネルを表示
  showDebugInfo(text) {
    const panel   = document.getElementById('debug-panel');
    const content = document.getElementById('debug-content');
    if (!panel || !content) return;
    content.textContent = text;
    panel.classList.remove('hidden');
  },
};

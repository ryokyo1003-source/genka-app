// 画像ユーティリティ
const ImageUtils = {
  // ファイルを読み込んでBase64に変換（リサイズ付き）
  async fileToBase64(file) {
    const mimeType = file.type;
    if (!mimeType.startsWith('image/') && mimeType !== 'application/pdf') {
      throw new Error('画像ファイルまたはPDFを選択してください');
    }

    // PDFはそのままBase64に
    if (mimeType === 'application/pdf') {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      return { base64, mimeType };
    }

    // 画像はリサイズしてBase64に
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const { base64, mimeType: outMime } = this.resizeImage(img);
          resolve({ base64, mimeType: outMime });
        };
        img.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
      reader.readAsDataURL(file);
    });
  },

  // 画像をリサイズしてBase64を返す
  resizeImage(img) {
    let { width, height } = img;
    const maxW = CONFIG.MAX_IMAGE_WIDTH;
    const maxH = CONFIG.MAX_IMAGE_HEIGHT;

    if (width > maxW || height > maxH) {
      const ratio = Math.min(maxW / width, maxH / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY);
    const base64 = dataUrl.split(',')[1];
    return { base64, mimeType: 'image/jpeg' };
  },
};

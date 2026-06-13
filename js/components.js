// 共通UIコンポーネント
const UI = {
  // トースト通知
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // モーダル表示
  showModal(title, contentHtml, actions = []) {
    const container = document.getElementById('modal-container');
    const actionsHtml = actions.map(a =>
      `<button class="btn ${a.class || 'btn-secondary'}" data-action="${a.action}">${a.label}</button>`
    ).join('');

    container.innerHTML = `
      <div class="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <h3>${title}</h3>
            <button class="modal-close" data-action="close">&times;</button>
          </div>
          <div class="modal-body">${contentHtml}</div>
          <div class="modal-actions">${actionsHtml}</div>
        </div>
      </div>`;

    container.querySelector('.modal-overlay').addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'close') this.closeModal();
      else if (action) {
        const handler = actions.find(a => a.action === action);
        if (handler?.onClick) handler.onClick();
      }
    });
  },

  closeModal() {
    document.getElementById('modal-container').innerHTML = '';
  },

  // ローディング表示（スピナーのみ）
  showLoading(message = '処理中...') {
    this._clearProgressTimer();
    document.getElementById('loading-overlay').innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>`;
    document.getElementById('loading-overlay').classList.add('show');
  },

  // 進捗バー付きローディング表示
  // current/total: 何枚中何枚目か（1始まり）。estSeconds: 1枚あたりの想定秒数。
  showProgress(label, current, total, estSeconds = 15) {
    this._clearProgressTimer();
    const t = total || 1;
    const pctStart = Math.round((current - 1) / t * 100);
    const pctEnd   = Math.round(current / t * 100);
    const countHtml = total > 1
      ? `<p class="progress-count">${current} / ${total} 枚目を読み取り中</p>` : '';
    document.getElementById('loading-overlay').innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <p id="loading-label">${label}</p>
        ${countHtml}
        <div class="progress-bar-track">
          <div class="progress-bar-fill" id="progress-bar-fill" style="width:${pctStart}%"></div>
        </div>
        <p class="progress-hint">通常 1枚あたり10〜20秒ほどかかります</p>
      </div>`;
    document.getElementById('loading-overlay').classList.add('show');

    // 1枚の処理中は、想定時間に合わせてバーを推定で伸ばす（最大90%まで）
    const startTs = Date.now();
    this._progressTimer = setInterval(() => {
      const elapsed = (Date.now() - startTs) / 1000;
      const frac = Math.min(0.9, 1 - Math.exp(-elapsed / (estSeconds * 0.5)));
      const pct  = pctStart + (pctEnd - pctStart) * frac;
      const fill = document.getElementById('progress-bar-fill');
      if (fill) fill.style.width = pct + '%';
    }, 200);
  },

  // 1ステップ完了時にバーを確定位置へスナップ
  completeProgressStep(current, total) {
    this._clearProgressTimer();
    const fill = document.getElementById('progress-bar-fill');
    if (fill && total) fill.style.width = Math.round(current / total * 100) + '%';
  },

  _progressTimer: null,
  _clearProgressTimer() {
    if (this._progressTimer) { clearInterval(this._progressTimer); this._progressTimer = null; }
  },

  hideLoading() {
    this._clearProgressTimer();
    document.getElementById('loading-overlay').classList.remove('show');
  },

  // 確認ダイアログ
  confirm(message) {
    return new Promise(resolve => {
      this.showModal('確認', `<p>${message}</p>`, [
        { label: 'キャンセル', action: 'cancel', class: 'btn-secondary', onClick: () => { this.closeModal(); resolve(false); } },
        { label: 'OK', action: 'ok', class: 'btn-primary', onClick: () => { this.closeModal(); resolve(true); } },
      ]);
    });
  },

  // 業者名を取得するヘルパー
  vendorName(vendorId) {
    const v = AppState.vendors.find(v => v.id === vendorId);
    return v?.name || vendorId;
  },
};

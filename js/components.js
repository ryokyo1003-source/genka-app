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

  // ローディング表示
  showLoading(message = '処理中...') {
    document.getElementById('loading-overlay').innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>`;
    document.getElementById('loading-overlay').classList.add('show');
  },

  hideLoading() {
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

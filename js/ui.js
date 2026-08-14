/**
 * 共用的畫面小工具：頂部列、提示訊息、確認視窗、圖示、HTML 逸出。
 */

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const subtitleEl = document.getElementById('page-subtitle');
const backBtn = document.getElementById('back-btn');
const actionsEl = document.getElementById('topbar-actions');
const toastEl = document.getElementById('toast');

/** 把使用者輸入的內容安全地放進 innerHTML。 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------------- 圖示 ---------------- */

const PATHS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M5 3h3.5l1.8 4.5-2.2 1.6a12 12 0 0 0 5.8 5.8l1.6-2.2L20 14.5V18a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4 6.2 2 2 0 0 1 5 3z"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  up: '<path d="M12 19V6M6 12l6-6 6 6"/>',
  down: '<path d="M12 5v13M6 12l6 6 6-6"/>',
  login: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l4-4-4-4M14 12H3"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M17 16l4-4-4-4M21 12H9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name, className = '') {
  const cls = className ? ` class="${className}"` : '';
  return `<svg${cls} viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ''}</svg>`;
}

/* ---------------- 頂部列 ---------------- */

/**
 * 設定頂部列。
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}   [opts.subtitle]
 * @param {Function} [opts.onBack]  有給就顯示返回鍵
 * @param {string}   [opts.actionsHtml] 右側按鈕的 HTML
 */
export function setTopbar({ title, subtitle = '', onBack = null, actionsHtml = '' }) {
  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;
  document.title = title === '晚餐大全' ? '晚餐大全' : `${title} · 晚餐大全`;

  backBtn.hidden = !onBack;
  backBtn.onclick = onBack;

  actionsEl.innerHTML = actionsHtml;
}

/** 換頁時把內容放進主要區域，並捲回頂端。 */
export function render(html) {
  viewEl.innerHTML = html;
  return viewEl;
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

/* ---------------- 提示訊息 ---------------- */

let toastTimer = null;

export function toast(message, { error = false, duration = 2600 } = {}) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.toggle('is-error', error);
  toastEl.hidden = false;
  // 重新觸發進場動畫
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, duration);
}

/* ---------------- 確認視窗 ---------------- */

/**
 * 取代 window.confirm，樣式一致且在手機上比較好按。
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message = '', confirmText = '確定', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'dialog';
    dialog.innerHTML = `
      <div class="dialog-body">
        <h2 class="dialog-title">${esc(title)}</h2>
        ${message ? `<p class="dialog-hint">${esc(message)}</p>` : ''}
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" data-answer="no">取消</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-answer="yes">${esc(confirmText)}</button>
        </div>
      </div>`;

    document.body.appendChild(dialog);

    const finish = (answer) => {
      dialog.close();
      dialog.remove();
      resolve(answer);
    };

    dialog.querySelector('[data-answer="no"]').onclick = () => finish(false);
    dialog.querySelector('[data-answer="yes"]').onclick = () => finish(true);
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });

    dialog.showModal();
  });
}

/* ---------------- 常見畫面狀態 ---------------- */

export function skeletonList(count = 4) {
  return `<div class="card-grid">${'<div class="skeleton-card"></div>'.repeat(count)}</div>`;
}

export function stateBox({ emoji, title, desc = '', actionHtml = '' }) {
  return `
    <div class="state-box">
      <span class="state-emoji">${emoji}</span>
      <p class="state-title">${esc(title)}</p>
      ${desc ? `<p class="state-desc">${esc(desc)}</p>` : ''}
      ${actionHtml}
    </div>`;
}

/**
 * 菜單畫面：單一店家的資訊、一週營業時間與菜單。
 */

import { fetchStoreWithMenu } from '../db.js';
import { isLoggedIn } from '../auth.js';
import { photoUrl } from '../photos.js';
import { getStoreStatus, formatDayHours, DAY_NAMES } from '../hours.js';
import { esc, icon, setTopbar, render, skeletonList, stateBox, scrollToTop } from '../ui.js';

function hoursTable(hours, today) {
  const rows = DAY_NAMES.map((dayName, day) => {
    const text = formatDayHours(hours?.[String(day)]);
    const isRest = text === '公休';
    return `
      <tr class="${day === today ? 'is-today' : ''}">
        <td>${dayName}</td>
        <td class="${isRest ? 'is-rest' : ''}">${esc(text)}${day === today ? '　（今天）' : ''}</td>
      </tr>`;
  }).join('');

  return `<table class="hours-table"><tbody>${rows}</tbody></table>`;
}

function menuItemRow(item) {
  const price = item.price === null || item.price === undefined
    ? '<span class="menu-item-price is-unset">時價</span>'
    : `<span class="menu-item-price">$${item.price}</span>`;

  return `
    <li class="menu-item ${item.is_sold_out ? 'is-sold-out' : ''}">
      <div class="menu-item-main">
        <div class="menu-item-name">${esc(item.name)}${item.is_sold_out ? '<span class="sold-out-tag">售完</span>' : ''}</div>
        ${item.note ? `<div class="menu-item-note">${esc(item.note)}</div>` : ''}
      </div>
      ${price}
    </li>`;
}

function photosSection(paths) {
  if (paths.length === 0) return '';
  return `
    <div class="menu-photos">
      ${paths.map((path, i) => `
        <button type="button" class="menu-photo-btn" data-photo="${esc(photoUrl(path))}">
          <img src="${esc(photoUrl(path))}" alt="菜單照片 ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}">
        </button>`).join('')}
    </div>`;
}

/** 點照片開全螢幕檢視，再點一下或按返回鍵關閉。 */
function openPhotoViewer(src) {
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-viewer';
  dialog.innerHTML = `
    <img src="${esc(src)}" alt="菜單照片">
    <button type="button" class="photo-viewer-close" aria-label="關閉">×</button>`;

  document.body.appendChild(dialog);
  const close = () => { dialog.close(); dialog.remove(); };
  dialog.addEventListener('click', close);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
}

function menuSection(items, photoCount) {
  if (items.length === 0) {
    // 有照片的話，菜單本身就是照片，不需要再喊一次「還沒有菜單」
    if (photoCount > 0) return '';
    return stateBox({
      emoji: '📝',
      title: '還沒有菜單',
      desc: isLoggedIn() ? '按右上角的編輯按鈕，拍一張菜單照片就好。' : '',
    });
  }

  // 依 category 分組，順序沿用資料庫的 sort_order（第一次出現的分類排前面）
  const groups = new Map();
  for (const item of items) {
    const key = item.category?.trim() || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  const onlyUncategorised = groups.size === 1 && groups.has('');

  return [...groups.entries()]
    .map(([category, list]) => `
      <div class="menu-group">
        ${category && !onlyUncategorised ? `<div class="menu-group-title">${esc(category)}</div>` : ''}
        <ul class="menu-list">${list.map(menuItemRow).join('')}</ul>
      </div>`)
    .join('');
}

export async function show(storeId) {
  const goBack = () => { location.hash = '#/'; };

  setTopbar({ title: '載入中…', onBack: goBack });
  render(skeletonList(3));
  scrollToTop();

  let store;
  let items;
  try {
    ({ store, items } = await fetchStoreWithMenu(storeId));
  } catch (err) {
    setTopbar({ title: '載入失敗', onBack: goBack });
    render(stateBox({ emoji: '⚠️', title: '載入失敗', desc: err.message }));
    return;
  }

  if (!store) {
    setTopbar({ title: '找不到店家', onBack: goBack });
    render(stateBox({
      emoji: '🤔',
      title: '找不到這家店',
      desc: '可能已經被刪除了。',
      actionHtml: '<a class="btn btn-ghost" href="#/">回主畫面</a>',
    }));
    return;
  }

  const now = new Date();
  const status = getStoreStatus(store.hours, store.temp_closed, now);
  const photos = Array.isArray(store.menu_photos) ? store.menu_photos : [];

  setTopbar({
    title: store.name,
    subtitle: status.label,
    onBack: goBack,
    actionsHtml: isLoggedIn()
      ? `<button id="edit-store" class="icon-btn" type="button" aria-label="編輯店家">${icon('edit')}</button>`
      : '',
  });

  render(`
    <div class="detail-header">
      <div class="detail-title-row">
        <div>
          <div class="detail-name">${esc(store.name)}</div>
          ${store.category ? `<span class="tag">${esc(store.category)}</span>` : ''}
        </div>
        <span class="badge is-${status.state}">${esc(status.label)}</span>
      </div>

      ${store.phone ? `
        <div class="detail-meta">
          <a class="meta-link" href="tel:${esc(store.phone.replace(/[^\d+#*,]/g, ''))}">
            ${icon('phone')}${esc(store.phone)}
          </a>
        </div>` : ''}

      ${store.note ? `<div class="note-box">${esc(store.note)}</div>` : ''}
    </div>

    <details class="collapse">
      <summary>${icon('clock')}一週營業時間</summary>
      <div class="collapse-body">${hoursTable(store.hours, now.getDay())}</div>
    </details>

    ${photosSection(photos)}
    ${menuSection(items, photos.length)}
  `);

  document.getElementById('edit-store')?.addEventListener('click', () => {
    location.hash = `#/store/${store.id}/edit`;
  });

  // #view 這個容器不會隨換頁重建，離開時要把監聽器收掉，否則會越疊越多
  const viewEl = document.getElementById('view');
  const onPhotoClick = (e) => {
    const btn = e.target.closest('[data-photo]');
    if (btn) openPhotoViewer(btn.dataset.photo);
  };
  viewEl.addEventListener('click', onPhotoClick);

  return () => viewEl.removeEventListener('click', onPhotoClick);
}

/**
 * 主畫面：所有店家依「營業中 / 休息中」分成兩區。
 */

import { fetchStores } from '../db.js';
import { isLoggedIn } from '../auth.js';
import { getStoreStatus, formatDayHours, DAY_NAMES } from '../hours.js';
import { esc, icon, setTopbar, render, skeletonList, stateBox, scrollToTop } from '../ui.js';

let allStores = [];
let keyword = '';
let tickTimer = null;

/** 頂部列副標：今天星期幾、現在幾點。 */
function subtitleNow(now = new Date()) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${DAY_NAMES[now.getDay()]} ${hh}:${mm} · 現在的營業狀況`;
}

function matchesKeyword(store) {
  if (!keyword) return true;
  const k = keyword.toLowerCase();
  return (
    (store.name || '').toLowerCase().includes(k) ||
    (store.category || '').toLowerCase().includes(k)
  );
}

function storeCard(store, status, now) {
  const todayHours = formatDayHours(store.hours?.[String(now.getDay())]);
  const hoursLine = todayHours === '公休' ? '今天公休' : `今天 ${todayHours}`;

  return `
    <button type="button" class="store-card ${status.isOpen ? '' : 'is-closed'}" data-store-id="${esc(store.id)}">
      <div class="store-main">
        <div class="store-name-row">
          <span class="store-name">${esc(store.name)}</span>
          ${store.category ? `<span class="tag">${esc(store.category)}</span>` : ''}
        </div>
        <div class="store-meta-row">
          <span class="badge is-${status.state}">${esc(status.label)}</span>
          <span class="store-hours-line">${esc(hoursLine)}</span>
        </div>
      </div>
      ${icon('chevron', 'store-chevron')}
    </button>`;
}

function section({ title, dotClass, stores, statuses, now }) {
  if (stores.length === 0) return '';
  return `
    <section class="section">
      <div class="section-head">
        <span class="section-dot ${dotClass}"></span>
        <h2>${title}</h2>
        <span class="section-count">${stores.length}</span>
      </div>
      <div class="card-grid">
        ${stores.map((s) => storeCard(s, statuses.get(s.id), now)).join('')}
      </div>
    </section>`;
}

/** 只重畫清單本體，搜尋與每分鐘更新都走這裡，不動搜尋框避免打斷輸入。 */
function paintList() {
  const listEl = document.getElementById('store-list');
  if (!listEl) return;

  const now = new Date();
  const visible = allStores.filter(matchesKeyword);
  const statuses = new Map(
    visible.map((s) => [s.id, getStoreStatus(s.hours, s.temp_closed, now)])
  );

  const open = visible.filter((s) => statuses.get(s.id).isOpen);
  const closed = visible.filter((s) => !statuses.get(s.id).isOpen);

  if (visible.length === 0) {
    listEl.innerHTML = keyword
      ? stateBox({ emoji: '🔍', title: '找不到符合的店家', desc: `沒有店名或分類包含「${keyword}」` })
      : stateBox({
          emoji: '🍱',
          title: '還沒有任何店家',
          desc: isLoggedIn() ? '按右下角的「新增店家」開始建立。' : '登入後就可以新增店家。',
        });
    return;
  }

  listEl.innerHTML =
    section({ title: '營業中', dotClass: 'is-open', stores: open, statuses, now }) +
    section({ title: '休息中', dotClass: 'is-closed', stores: closed, statuses, now });
}

function refreshSubtitle() {
  const sub = document.getElementById('page-subtitle');
  if (sub) sub.textContent = subtitleNow();
}

export async function show() {
  setTopbar({
    title: '晚餐大全',
    subtitle: subtitleNow(),
    actionsHtml: isLoggedIn()
      ? `<button class="icon-btn" type="button" data-auth="logout" aria-label="登出">${icon('logout')}</button>`
      : `<button class="icon-btn" type="button" data-auth="login" aria-label="登入以編輯">${icon('login')}</button>`,
  });

  render(`
    <div class="search-wrap">
      ${icon('search')}
      <input id="search" class="search-input" type="search" inputmode="search"
             placeholder="搜尋店名或分類" autocomplete="off" value="${esc(keyword)}">
      <button id="search-clear" class="search-clear" type="button" aria-label="清除搜尋" ${keyword ? '' : 'hidden'}>×</button>
    </div>
    <div id="store-list">${skeletonList()}</div>
    ${isLoggedIn() ? `<button id="add-store" class="fab" type="button">${icon('plus')}新增店家</button>` : ''}
  `);
  scrollToTop();

  // ---- 事件 ----
  const searchInput = document.getElementById('search');
  const clearBtn = document.getElementById('search-clear');

  searchInput.addEventListener('input', () => {
    keyword = searchInput.value.trim();
    clearBtn.hidden = keyword === '';
    paintList();
  });

  clearBtn.addEventListener('click', () => {
    keyword = '';
    searchInput.value = '';
    clearBtn.hidden = true;
    searchInput.focus();
    paintList();
  });

  document.getElementById('store-list').addEventListener('click', (e) => {
    const card = e.target.closest('[data-store-id]');
    if (card) location.hash = `#/store/${card.dataset.storeId}`;
  });

  document.getElementById('add-store')?.addEventListener('click', () => {
    location.hash = '#/new';
  });

  // ---- 載入資料 ----
  try {
    allStores = await fetchStores();
    paintList();
  } catch (err) {
    document.getElementById('store-list').innerHTML = stateBox({
      emoji: '⚠️',
      title: '載入失敗',
      desc: err.message,
      actionHtml: '<button class="btn btn-ghost" onclick="location.reload()">重新載入</button>',
    });
    return () => {};
  }

  // 每分鐘重算一次營業狀態，畫面放著不動也不會顯示過期的資訊
  tickTimer = setInterval(() => {
    refreshSubtitle();
    paintList();
  }, 60_000);

  return () => {
    clearInterval(tickTimer);
    tickTimer = null;
  };
}

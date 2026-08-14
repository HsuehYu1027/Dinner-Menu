/**
 * 啟動與路由。
 *
 * 用 hash 路由（#/、#/store/xxx、#/store/xxx/edit、#/new）：
 * GitHub Pages 不需要任何伺服器設定，手機的返回鍵行為也正確。
 */

import { isConfigured } from './config.js';
import { initAuth, isLoggedIn, signIn, signOut, onAuthChange, currentEmail } from './auth.js';
import { setTopbar, render, toast, stateBox, confirmDialog } from './ui.js';
import * as storeList from './views/store-list.js';
import * as storeDetail from './views/store-detail.js';
import * as storeEditor from './views/store-editor.js';

/** 上一個畫面留下的清理函式（例如主畫面每分鐘更新的計時器）。 */
let cleanup = null;

/* ---------------- 路由 ---------------- */

function parseRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';

  let m = hash.match(/^\/store\/([^/]+)\/edit\/?$/);
  if (m) return { name: 'edit', id: decodeURIComponent(m[1]) };

  m = hash.match(/^\/store\/([^/]+)\/?$/);
  if (m) return { name: 'detail', id: decodeURIComponent(m[1]) };

  if (hash === '/new') return { name: 'edit', id: null };

  return { name: 'list' };
}

async function route() {
  if (typeof cleanup === 'function') {
    cleanup();
    cleanup = null;
  }

  const r = parseRoute();

  // 編輯畫面需要登入。直接貼網址進來也要擋，不能只靠隱藏按鈕。
  if (r.name === 'edit' && !isLoggedIn()) {
    toast('請先登入才能編輯', { error: true });
    location.replace(`#${r.id ? `/store/${r.id}` : '/'}`);
    return;
  }

  try {
    if (r.name === 'detail') {
      cleanup = await storeDetail.show(r.id);
    } else if (r.name === 'edit') {
      cleanup = await storeEditor.show(r.id);
    } else {
      cleanup = await storeList.show();
    }
  } catch (err) {
    console.error(err);
    setTopbar({ title: '出錯了' });
    render(stateBox({
      emoji: '⚠️',
      title: '畫面載入失敗',
      desc: err.message,
      actionHtml: '<button class="btn btn-ghost" onclick="location.reload()">重新載入</button>',
    }));
  }
}

/* ---------------- 登入 ---------------- */

const loginDialog = document.getElementById('login-dialog');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginSubmit = document.getElementById('login-submit');

function openLogin() {
  loginError.hidden = true;
  loginForm.reset();
  loginDialog.showModal();
}

loginDialog.querySelector('[data-close-dialog]').addEventListener('click', () => {
  loginDialog.close();
});

loginForm.addEventListener('submit', async (e) => {
  // dialog 內的 form method="dialog" 預設會直接關閉視窗，這裡自己控制
  e.preventDefault();

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  loginSubmit.disabled = true;
  loginSubmit.textContent = '登入中…';
  loginError.hidden = true;

  try {
    await signIn(email, password);
    loginDialog.close();
    toast('已登入，現在可以編輯了');
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = '登入';
  }
});

/** 頂部列的登入／登出按鈕由各畫面渲染，這裡統一接事件。 */
document.getElementById('topbar-actions').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-auth]');
  if (!btn) return;

  if (btn.dataset.auth === 'login') {
    openLogin();
    return;
  }

  const ok = await confirmDialog({
    title: '要登出嗎？',
    message: `目前登入的是 ${currentEmail() || ''}。登出後仍然看得到店家與菜單，只是不能編輯。`,
    confirmText: '登出',
  });
  if (!ok) return;

  try {
    await signOut();
    toast('已登出');
  } catch (err) {
    toast(err.message, { error: true });
  }
});

/* ---------------- 啟動 ---------------- */

async function start() {
  if (!isConfigured()) {
    setTopbar({ title: '晚餐大全' });
    render(stateBox({
      emoji: '🔌',
      title: '還沒接上資料庫',
      desc: '請打開 js/config.js，把 SUPABASE_URL 與 SUPABASE_ANON_KEY 換成你自己 Supabase 專案的值。詳細步驟在 SETUP.md。',
    }));
    return;
  }

  try {
    await initAuth();
  } catch (err) {
    // 讀不到登入狀態不該擋住瀏覽，當成未登入繼續
    console.warn('讀取登入狀態失敗：', err);
  }

  // 登入狀態改變時重畫目前畫面，讓編輯按鈕即時出現或消失
  onAuthChange(() => { route(); });

  window.addEventListener('hashchange', route);
  await route();
}

start();

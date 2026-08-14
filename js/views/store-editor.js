/**
 * 編輯畫面：新增或修改店家資料、營業時間與菜單。
 *
 * 幾個為了手機操作特別處理的地方：
 *   - 時間用 <input type="time">，手機會叫出原生的時間滾輪，比自己刻好按也好對
 *   - 營業時間有「複製到平日 / 每天」與常用範本，不用在小螢幕上重複填七次
 *   - 菜單排序用上下箭頭而不是拖曳，手指拖曳在長清單上很容易誤觸
 *   - 存檔列固定在底部，捲到哪裡都按得到
 */

import { fetchStoreWithMenu, saveStoreWithMenu, deleteStore } from '../db.js';
import { uploadPhoto, deletePhoto, photoUrl } from '../photos.js';
import { DAY_NAMES, validateHours, normalizeHours } from '../hours.js';
import {
  esc, icon, setTopbar, render, toast, stateBox, confirmDialog, scrollToTop,
} from '../ui.js';

const EMPTY_HOURS = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
const DEFAULT_SEGMENT = ['17:00', '20:30'];

const PRESETS = {
  weekday: {
    label: '平日午晚兩段',
    build: () => ({
      0: [],
      1: [['11:00', '14:00'], ['17:00', '20:30']],
      2: [['11:00', '14:00'], ['17:00', '20:30']],
      3: [['11:00', '14:00'], ['17:00', '20:30']],
      4: [['11:00', '14:00'], ['17:00', '20:30']],
      5: [['11:00', '14:00'], ['17:00', '20:30']],
      6: [['17:00', '20:30']],
    }),
  },
  dinner: {
    label: '每天 17:00–21:00',
    build: () => {
      const h = {};
      for (let d = 0; d < 7; d += 1) h[d] = [['17:00', '21:00']];
      return h;
    },
  },
  clear: { label: '全部清空', build: () => structuredClone(EMPTY_HOURS) },
};

let draft = null;   // 店家草稿
let items = [];     // 打字菜單草稿
let dirty = false;

// 照片是「上傳當下就進 Storage」，但資料庫要按了儲存才會更新，
// 所以要記住這次編輯期間發生了什麼，取消時才收得乾淨：
let sessionUploads = new Set(); // 這次新上傳的，放棄修改時要刪掉
let photosToDeleteOnSave = [];  // 原本已存檔的照片被移除，存檔成功後才真的刪
let uploadingCount = 0;

/* ---------------- 營業時間編輯器 ---------------- */

/**
 * 時間一律用 24 小時制的下拉選單，不用 <input type="time">。
 *
 * 原生時間欄位的 12/24 小時顯示是跟著瀏覽器或作業系統語系走的，
 * 英文語系的裝置會變成 05:00 PM，沒辦法從網頁這邊強制。改成自己出選項
 * 就保證每台裝置看到的都是 17:00 這種格式，跟畫面其他地方一致。
 */
const MINUTE_STEP = 5;

function timeOptions(current, count, step) {
  const values = [];
  for (let v = 0; v < count; v += step) values.push(String(v).padStart(2, '0'));
  // 舊資料若不在間隔上（例如 20:07），把它補進選項，才不會一打開就被改掉
  if (current && !values.includes(current)) {
    values.push(current);
    values.sort();
  }
  return values
    .map((v) => `<option value="${v}"${v === current ? ' selected' : ''}>${v}</option>`)
    .join('');
}

function timePicker(value, kind, label) {
  const [hh = '00', mm = '00'] = String(value || '').split(':');
  return `
    <span class="time-picker">
      <select data-field="${kind}-h" aria-label="${esc(label)}（時）">${timeOptions(hh, 24, 1)}</select>
      <span class="time-colon">:</span>
      <select data-field="${kind}-m" aria-label="${esc(label)}（分）">${timeOptions(mm, 60, MINUTE_STEP)}</select>
    </span>`;
}

function segRow(day, index, seg) {
  const which = `${DAY_NAMES[day]}第 ${index + 1} 段`;
  return `
    <div class="seg-row" data-seg="${index}">
      ${timePicker(seg[0], 'open', `${which}開始時間`)}
      <span class="seg-dash">–</span>
      ${timePicker(seg[1], 'close', `${which}結束時間`)}
      <button type="button" class="seg-remove" data-act="remove-seg" aria-label="刪除這個時段">×</button>
    </div>`;
}

function dayRow(day) {
  const segs = draft.hours[day] || [];
  const isRest = segs.length === 0;

  return `
    <div class="day-row" data-day="${day}">
      <div class="day-row-head">
        <span class="day-name">${DAY_NAMES[day]}</span>
        <label class="day-rest-toggle">
          <input type="checkbox" data-act="toggle-rest" ${isRest ? 'checked' : ''}>
          公休
        </label>
      </div>

      ${isRest ? '' : `<div class="seg-list">${segs.map((s, i) => segRow(day, i, s)).join('')}</div>`}

      <div class="day-actions">
        ${!isRest && segs.length < 2 ? '<button type="button" class="chip-btn" data-act="add-seg">＋ 增加時段</button>' : ''}
        ${isRest ? '' : `
          <button type="button" class="chip-btn" data-act="copy-weekdays">複製到週一～週五</button>
          <button type="button" class="chip-btn" data-act="copy-all">複製到每天</button>`}
      </div>
    </div>`;
}

function hoursEditorHtml() {
  return `
    <div class="form-card">
      <div class="form-card-title">營業時間</div>
      <div class="day-actions" style="margin: 0 0 10px;">
        ${Object.entries(PRESETS)
          .map(([key, p]) => `<button type="button" class="chip-btn" data-preset="${key}">${esc(p.label)}</button>`)
          .join('')}
      </div>
      <div id="hours-editor">${[0, 1, 2, 3, 4, 5, 6].map(dayRow).join('')}</div>
      <p class="field-hint">時間是 24 小時制：中午 12 點半填 12:30，晚上 8 點半填 20:30。
        收店時間比開店早（例如 17:00–02:00）代表營業到隔天凌晨。</p>
    </div>`;
}

function repaintHours() {
  const el = document.getElementById('hours-editor');
  if (el) el.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(dayRow).join('');
}

function bindHoursEditor() {
  const card = document.getElementById('hours-editor').closest('.form-card');

  // 範本
  card.addEventListener('click', (e) => {
    const presetBtn = e.target.closest('[data-preset]');
    if (!presetBtn) return;
    draft.hours = PRESETS[presetBtn.dataset.preset].build();
    dirty = true;
    repaintHours();
  });

  const editor = document.getElementById('hours-editor');

  // 選了時間就更新資料，不重畫畫面（重畫會把下拉選單收起來）
  editor.addEventListener('input', (e) => {
    const select = e.target.closest('select[data-field]');
    if (!select) return;

    const row = select.closest('.seg-row');
    const day = Number(select.closest('.day-row').dataset.day);
    const segIndex = Number(row.dataset.seg);
    const read = (name) => row.querySelector(`[data-field="${name}"]`).value;

    draft.hours[day][segIndex] = [
      `${read('open-h')}:${read('open-m')}`,
      `${read('close-h')}:${read('close-m')}`,
    ];
    dirty = true;
  });

  // 公休勾選
  editor.addEventListener('change', (e) => {
    const box = e.target.closest('[data-act="toggle-rest"]');
    if (!box) return;
    const day = Number(box.closest('.day-row').dataset.day);
    draft.hours[day] = box.checked ? [] : [[...DEFAULT_SEGMENT]];
    dirty = true;
    repaintHours();
  });

  // 增加 / 刪除時段、複製到其他天
  editor.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.dataset.act === 'toggle-rest') return;

    const day = Number(btn.closest('.day-row').dataset.day);
    const act = btn.dataset.act;

    if (act === 'add-seg') {
      draft.hours[day].push([...DEFAULT_SEGMENT]);
    } else if (act === 'remove-seg') {
      const segIndex = Number(btn.closest('.seg-row').dataset.seg);
      draft.hours[day].splice(segIndex, 1);
    } else if (act === 'copy-weekdays') {
      const source = structuredClone(draft.hours[day]);
      for (let d = 1; d <= 5; d += 1) draft.hours[d] = structuredClone(source);
      toast('已複製到週一～週五');
    } else if (act === 'copy-all') {
      const source = structuredClone(draft.hours[day]);
      for (let d = 0; d < 7; d += 1) draft.hours[d] = structuredClone(source);
      toast('已複製到每天');
    } else {
      return;
    }

    dirty = true;
    repaintHours();
  });
}

/* ---------------- 菜單照片 ---------------- */

function photoTile(path, index, total) {
  return `
    <figure class="photo-thumb" data-path="${esc(path)}">
      <img src="${esc(photoUrl(path))}" alt="菜單照片 ${index + 1}" loading="lazy">
      <figcaption class="photo-tools">
        <span class="item-index">${index + 1}</span>
        ${total > 1 ? `
          <button type="button" class="tool-btn" data-act="photo-up" ${index === 0 ? 'disabled' : ''} aria-label="往前移">${icon('up')}</button>
          <button type="button" class="tool-btn" data-act="photo-down" ${index === total - 1 ? 'disabled' : ''} aria-label="往後移">${icon('down')}</button>` : ''}
        <button type="button" class="tool-btn is-danger" data-act="photo-remove" aria-label="刪除這張照片">${icon('trash')}</button>
      </figcaption>
    </figure>`;
}

function photosHtml() {
  const photos = draft.menu_photos;
  const tiles = photos.map((p, i) => photoTile(p, i, photos.length)).join('');
  const pending = '<div class="photo-thumb is-uploading">上傳中…</div>'.repeat(uploadingCount);

  if (!tiles && !pending) {
    return '<p class="field-hint" style="padding:2px 0 10px">還沒有照片。拍一張店家的菜單，比一項一項打字快得多。</p>';
  }
  return `<div class="photo-grid">${tiles}${pending}</div>`;
}

function photoEditorHtml() {
  return `
    <div class="form-card">
      <div class="form-card-title">菜單照片</div>
      <div id="photo-area">${photosHtml()}</div>
      <input id="photo-input" type="file" accept="image/*" multiple hidden>
      <button type="button" id="add-photo" class="btn btn-ghost btn-block">＋ 拍照或從相簿選</button>
      <p class="field-hint">上傳前會自動壓縮到適合手機看的大小，一張大約 300KB。可以放多張（菜單正反面、價目表）。</p>
    </div>`;
}

function repaintPhotos() {
  const el = document.getElementById('photo-area');
  if (el) el.innerHTML = photosHtml();
}

function bindPhotoEditor() {
  const input = document.getElementById('photo-input');

  document.getElementById('add-photo').addEventListener('click', () => input.click());

  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = ''; // 清掉才能連續選同一張
    if (files.length === 0) return;

    uploadingCount += files.length;
    repaintPhotos();

    for (const file of files) {
      try {
        const path = await uploadPhoto(file);
        draft.menu_photos.push(path);
        sessionUploads.add(path);
        dirty = true;
      } catch (err) {
        toast(err.message, { error: true, duration: 4000 });
      } finally {
        uploadingCount -= 1;
        repaintPhotos();
      }
    }
  });

  document.getElementById('photo-area').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    const path = btn.closest('[data-path]').dataset.path;
    const index = draft.menu_photos.indexOf(path);
    if (index < 0) return;

    const act = btn.dataset.act;
    if (act === 'photo-up' && index > 0) {
      [draft.menu_photos[index - 1], draft.menu_photos[index]] = [draft.menu_photos[index], draft.menu_photos[index - 1]];
    } else if (act === 'photo-down' && index < draft.menu_photos.length - 1) {
      [draft.menu_photos[index + 1], draft.menu_photos[index]] = [draft.menu_photos[index], draft.menu_photos[index + 1]];
    } else if (act === 'photo-remove') {
      draft.menu_photos.splice(index, 1);
      if (sessionUploads.has(path)) {
        // 這張是剛剛才上傳、還沒存進資料庫的，直接從 Storage 移掉
        sessionUploads.delete(path);
        deletePhoto(path);
      } else {
        // 已經存過檔的照片，等按下儲存成功才真的刪，取消就還原得回來
        photosToDeleteOnSave.push(path);
      }
    } else {
      return;
    }

    dirty = true;
    repaintPhotos();
  });
}

/* ---------------- 打字的品項清單 ---------------- */

function itemEditor(item, index, total) {
  return `
    <div class="item-editor" data-item="${index}">
      <div class="item-editor-top">
        <input class="item-name-input" type="text" data-field="name"
               placeholder="品項名稱" value="${esc(item.name)}" aria-label="第 ${index + 1} 項名稱">
        <input class="item-price-input" type="number" inputmode="numeric" min="0" step="1"
               data-field="price" placeholder="價格"
               value="${item.price === null || item.price === undefined ? '' : esc(item.price)}"
               aria-label="第 ${index + 1} 項價格">
      </div>
      <div class="item-editor-mid">
        <input type="text" data-field="category" placeholder="分類（可留白）" value="${esc(item.category ?? '')}">
        <input type="text" data-field="note" placeholder="備註（可留白）" value="${esc(item.note ?? '')}">
      </div>
      <div class="item-editor-bottom">
        <span class="item-index">${index + 1}</span>
        <div class="item-tools">
          <button type="button" class="chip-btn ${item.is_sold_out ? 'is-active' : ''}"
                  data-act="toggle-sold" aria-pressed="${item.is_sold_out ? 'true' : 'false'}">售完</button>
          <button type="button" class="tool-btn" data-act="move-up" ${index === 0 ? 'disabled' : ''} aria-label="上移">${icon('up')}</button>
          <button type="button" class="tool-btn" data-act="move-down" ${index === total - 1 ? 'disabled' : ''} aria-label="下移">${icon('down')}</button>
          <button type="button" class="tool-btn is-danger" data-act="remove-item" aria-label="刪除這一項">${icon('trash')}</button>
        </div>
      </div>
    </div>`;
}

function menuEditorHtml() {
  // 有照片就夠了，這一區預設收起來；已經打過品項的店家才自動展開
  return `
    <details class="collapse" ${items.length > 0 ? 'open' : ''}>
      <summary>自己打的品項清單${items.length > 0 ? `（${items.length} 項）` : ''}</summary>
      <div class="collapse-body">
        <p class="field-hint">店家沒有菜單可拍的時候用。有菜單照片的話這裡可以留空。</p>
        <div id="menu-editor">${itemsHtml()}</div>
        <button type="button" id="add-item" class="btn btn-ghost btn-block">＋ 新增品項</button>
      </div>
    </details>`;
}

function itemsHtml() {
  if (items.length === 0) {
    return '<p class="store-hours-line" style="padding: 6px 2px 12px;">還沒有品項，按下面的按鈕新增。</p>';
  }
  return items.map((item, i) => itemEditor(item, i, items.length)).join('');
}

function repaintItems() {
  const el = document.getElementById('menu-editor');
  if (el) el.innerHTML = itemsHtml();
}

function bindMenuEditor() {
  const editor = document.getElementById('menu-editor');

  // 文字輸入：只更新資料不重畫
  editor.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const index = Number(input.closest('[data-item]').dataset.item);
    items[index][input.dataset.field] = input.value;
    dirty = true;
  });

  editor.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;

    const index = Number(btn.closest('[data-item]').dataset.item);
    const act = btn.dataset.act;

    if (act === 'toggle-sold') {
      items[index].is_sold_out = !items[index].is_sold_out;
    } else if (act === 'move-up' && index > 0) {
      [items[index - 1], items[index]] = [items[index], items[index - 1]];
    } else if (act === 'move-down' && index < items.length - 1) {
      [items[index + 1], items[index]] = [items[index], items[index + 1]];
    } else if (act === 'remove-item') {
      items.splice(index, 1);
    } else {
      return;
    }

    dirty = true;
    repaintItems();
  });

  document.getElementById('add-item').addEventListener('click', () => {
    items.push({ name: '', price: '', category: '', note: '', is_sold_out: false });
    dirty = true;
    repaintItems();
    // 捲到新加的那一列並直接聚焦，手機上不用自己找
    const last = document.querySelector('#menu-editor .item-editor:last-of-type .item-name-input');
    last?.focus();
    last?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

/* ---------------- 存檔 ---------------- */

function readBasicFields() {
  draft.name = document.getElementById('f-name').value;
  draft.category = document.getElementById('f-category').value;
  draft.phone = document.getElementById('f-phone').value;
  draft.note = document.getElementById('f-note').value;
  draft.temp_closed = document.getElementById('f-temp-closed').checked;
}

function showErrors(list) {
  const box = document.getElementById('form-errors');
  if (list.length === 0) {
    box.hidden = true;
    return;
  }
  box.innerHTML = `<ul>${list.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
  box.hidden = false;
  box.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

async function handleSave(saveBtn) {
  readBasicFields();

  if (uploadingCount > 0) {
    toast('照片還在上傳，等一下再存', { error: true });
    return;
  }

  const errors = [];
  if (!draft.name.trim()) errors.push('店名不能空白');
  errors.push(...validateHours(draft.hours));
  if (items.some((item) => item.name.trim() && item.price !== '' && Number.isNaN(Number(item.price)))) {
    errors.push('價格只能填數字');
  }
  if (errors.length > 0) {
    showErrors(errors);
    return;
  }
  showErrors([]);

  // 只留下真的填了時間的時段
  const cleanHours = normalizeHours(draft.hours);

  saveBtn.disabled = true;
  saveBtn.textContent = '儲存中…';

  try {
    const storeId = await saveStoreWithMenu({ ...draft, hours: cleanHours }, items);

    // 資料庫更新成功了，這時候才把被移除的舊照片從 Storage 刪掉
    photosToDeleteOnSave.forEach((path) => deletePhoto(path));
    photosToDeleteOnSave = [];
    sessionUploads.clear();

    dirty = false;
    toast('已儲存');
    location.hash = `#/store/${storeId}`;
  } catch (err) {
    showErrors([err.message]);
    saveBtn.disabled = false;
    saveBtn.textContent = '儲存';
  }
}

async function handleDelete() {
  const ok = await confirmDialog({
    title: `刪除「${draft.name}」？`,
    message: '這家店和它的整份菜單都會被刪除，而且沒辦法復原。',
    confirmText: '刪除',
    danger: true,
  });
  if (!ok) return;

  try {
    await deleteStore(draft.id);
    dirty = false;
    toast('已刪除');
    location.hash = '#/';
  } catch (err) {
    toast(err.message, { error: true });
  }
}

async function leave(target) {
  if (dirty) {
    const ok = await confirmDialog({
      title: '要放棄這次的修改嗎？',
      message: '還沒儲存的內容會不見。',
      confirmText: '放棄修改',
      danger: true,
    });
    if (!ok) return;

    // 這次上傳的照片沒有進資料庫，留在 Storage 只是佔空間
    sessionUploads.forEach((path) => deletePhoto(path));
    sessionUploads.clear();
    photosToDeleteOnSave = [];
  }
  dirty = false;
  location.hash = target;
}

/* ---------------- 進入畫面 ---------------- */

export async function show(storeId) {
  dirty = false;
  sessionUploads = new Set();
  photosToDeleteOnSave = [];
  uploadingCount = 0;

  const isNew = !storeId;
  const backTarget = isNew ? '#/' : `#/store/${storeId}`;

  setTopbar({ title: isNew ? '新增店家' : '載入中…', onBack: () => leave(backTarget) });
  scrollToTop();

  if (isNew) {
    draft = {
      id: null, name: '', category: '', phone: '', note: '',
      temp_closed: false, sort_order: 0, hours: structuredClone(EMPTY_HOURS),
      menu_photos: [],
    };
    items = [];
  } else {
    render('<div class="skeleton-card" style="height:200px"></div>');
    try {
      const { store, items: loaded } = await fetchStoreWithMenu(storeId);
      if (!store) {
        setTopbar({ title: '找不到店家', onBack: () => leave('#/') });
        render(stateBox({ emoji: '🤔', title: '找不到這家店', desc: '可能已經被刪除了。' }));
        return;
      }
      draft = {
        id: store.id,
        name: store.name ?? '',
        category: store.category ?? '',
        phone: store.phone ?? '',
        note: store.note ?? '',
        temp_closed: Boolean(store.temp_closed),
        sort_order: store.sort_order ?? 0,
        hours: { ...structuredClone(EMPTY_HOURS), ...normalizeHours(store.hours) },
        menu_photos: Array.isArray(store.menu_photos) ? [...store.menu_photos] : [],
      };
      items = loaded.map((item) => ({
        id: item.id,
        name: item.name ?? '',
        price: item.price ?? '',
        category: item.category ?? '',
        note: item.note ?? '',
        is_sold_out: Boolean(item.is_sold_out),
      }));
    } catch (err) {
      setTopbar({ title: '載入失敗', onBack: () => leave('#/') });
      render(stateBox({ emoji: '⚠️', title: '載入失敗', desc: err.message }));
      return;
    }
  }

  setTopbar({ title: isNew ? '新增店家' : `編輯 ${draft.name}`, onBack: () => leave(backTarget) });

  render(`
    <div class="form-card">
      <div class="form-card-title">基本資料</div>

      <label class="field">
        <span class="field-label">店名（必填）</span>
        <input id="f-name" type="text" value="${esc(draft.name)}" placeholder="例：阿姨古早味便當" enterkeyhint="next">
      </label>

      <div class="field-row">
        <label class="field">
          <span class="field-label">分類</span>
          <input id="f-category" type="text" value="${esc(draft.category)}" placeholder="便當 / 麵食 / 飲料">
        </label>
        <label class="field">
          <span class="field-label">電話</span>
          <input id="f-phone" type="tel" inputmode="tel" value="${esc(draft.phone)}" placeholder="02-1234-5678">
        </label>
      </div>

      <label class="field">
        <span class="field-label">備註</span>
        <textarea id="f-note" placeholder="外送門檻、公休公告…">${esc(draft.note)}</textarea>
      </label>

      <label class="switch">
        <input id="f-temp-closed" type="checkbox" ${draft.temp_closed ? 'checked' : ''}>
        <span class="switch-track"></span>
        <span class="switch-text">臨時公休
          <small>打開後，不管營業時間怎麼設定都會顯示休息中</small>
        </span>
      </label>
    </div>

    ${hoursEditorHtml()}
    ${photoEditorHtml()}
    ${menuEditorHtml()}

    <p id="form-errors" class="form-error" hidden></p>

    <div class="save-bar">
      <button type="button" id="cancel" class="btn btn-ghost">取消</button>
      <button type="button" id="save" class="btn btn-primary">儲存</button>
    </div>

    ${isNew ? '' : `
      <button type="button" id="delete" class="btn btn-danger btn-block" style="margin-top:8px">
        刪除這家店
      </button>`}
  `);

  bindHoursEditor();
  bindPhotoEditor();
  bindMenuEditor();

  // 基本資料只要有動過就標記為未存檔
  document.querySelectorAll('#f-name, #f-category, #f-phone, #f-note, #f-temp-closed')
    .forEach((el) => el.addEventListener('input', () => { dirty = true; }));

  document.getElementById('save').addEventListener('click', (e) => handleSave(e.currentTarget));
  document.getElementById('cancel').addEventListener('click', () => leave(backTarget));
  document.getElementById('delete')?.addEventListener('click', handleDelete);

  // 手機上誤觸「關閉分頁 / 重新整理」時提醒一下
  const warnUnload = (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', warnUnload);

  return () => window.removeEventListener('beforeunload', warnUnload);
}

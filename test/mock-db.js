/**
 * 假的資料層，只給 test/preview.html 用。
 *
 * 介面跟 js/db.js 一模一樣，但資料存在瀏覽器的 localStorage，
 * 所以不需要 Supabase 也能把整個網站點過一遍。正式站不會載入這個檔案。
 */

const KEY = 'dinner-preview-data';
const AUTH_KEY = 'dinner-preview-auth';
const DELAY = 180; // 假裝有網路延遲，才看得到載入中的畫面

const SEED = {
  stores: [
    {
      id: 's1', name: '阿姨古早味便當', category: '便當', phone: '02-2345-6789',
      note: '滿 300 元免外送費', temp_closed: false, sort_order: 1,
      hours: {
        0: [], 1: [['11:00', '14:00'], ['17:00', '20:30']],
        2: [['11:00', '14:00'], ['17:00', '20:30']],
        3: [['11:00', '14:00'], ['17:00', '20:30']],
        4: [['11:00', '14:00'], ['17:00', '20:30']],
        5: [['11:00', '14:00'], ['17:00', '21:00']],
        6: [['17:00', '21:00']],
      },
    },
    {
      id: 's2', name: '深夜食堂麵館', category: '麵食', phone: '02-8765-4321',
      note: '營業到凌晨，宵夜首選', temp_closed: false, sort_order: 2,
      hours: {
        0: [['17:00', '02:00']], 1: [], 2: [['17:00', '02:00']], 3: [['17:00', '02:00']],
        4: [['17:00', '02:00']], 5: [['17:00', '03:00']], 6: [['17:00', '03:00']],
      },
    },
    {
      id: 's3', name: '清心小舖', category: '飲料', phone: '02-1111-2222',
      note: null, temp_closed: false, sort_order: 3,
      hours: {
        0: [['10:00', '22:00']], 1: [['10:00', '22:00']], 2: [['10:00', '22:00']],
        3: [['10:00', '22:00']], 4: [['10:00', '22:00']], 5: [['10:00', '23:00']],
        6: [['10:00', '23:00']],
      },
    },
    {
      id: 's4', name: '轉角鹽酥雞', category: '炸物', phone: null,
      note: '過年期間休息', temp_closed: true, sort_order: 4,
      hours: { 0: [], 1: [['17:00', '23:00']], 2: [['17:00', '23:00']], 3: [['17:00', '23:00']], 4: [['17:00', '23:00']], 5: [['17:00', '00:30']], 6: [['17:00', '00:30']] },
    },
  ],
  items: [
    { id: 'i1', store_id: 's1', name: '排骨飯', price: 90, category: '主餐', note: null, is_sold_out: false, sort_order: 1 },
    { id: 'i2', store_id: 's1', name: '雞腿飯', price: 100, category: '主餐', note: '限量', is_sold_out: true, sort_order: 2 },
    { id: 'i3', store_id: 's1', name: '滷肉飯', price: 45, category: '主餐', note: null, is_sold_out: false, sort_order: 3 },
    { id: 'i4', store_id: 's1', name: '貢丸湯', price: 25, category: '湯品', note: null, is_sold_out: false, sort_order: 4 },
    { id: 'i5', store_id: 's1', name: '紫菜蛋花湯', price: 25, category: '湯品', note: null, is_sold_out: false, sort_order: 5 },
    { id: 'i6', store_id: 's2', name: '牛肉麵', price: 150, category: '麵食', note: '招牌', is_sold_out: false, sort_order: 1 },
    { id: 'i7', store_id: 's2', name: '陽春麵', price: 60, category: '麵食', note: null, is_sold_out: false, sort_order: 2 },
    { id: 'i8', store_id: 's2', name: '滷味拼盤', price: null, category: '小菜', note: '看當天進貨', is_sold_out: false, sort_order: 3 },
    { id: 'i9', store_id: 's3', name: '珍珠奶茶', price: 55, category: null, note: null, is_sold_out: false, sort_order: 1 },
    { id: 'i10', store_id: 's3', name: '冬瓜檸檬', price: 45, category: null, note: null, is_sold_out: false, sort_order: 2 },
  ],
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* 壞掉就用預設資料 */ }
  return structuredClone(SEED);
}

let data = load();

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

const wait = () => new Promise((r) => setTimeout(r, DELAY));
const uid = () => `x${Math.random().toString(36).slice(2, 10)}`;

export function describeError(error) {
  return String(error?.message || error || '發生未知的錯誤');
}

/* ---------------- 假的登入 ---------------- */

const listeners = [];
let session = localStorage.getItem(AUTH_KEY) ? { user: { email: localStorage.getItem(AUTH_KEY) } } : null;

/* ---------------- 假的 Storage ---------------- */
// 照片轉成 data URL 存在 localStorage，重新整理也還在。
const PHOTO_KEY = 'dinner-preview-photos';
let photoStore = JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}');

function savePhotos() {
  try {
    localStorage.setItem(PHOTO_KEY, JSON.stringify(photoStore));
  } catch {
    throw new Error('預覽模式的照片空間滿了（瀏覽器限制約 5MB），按上方「重設資料」清空。');
  }
}

const mockStorage = {
  from() {
    return {
      async upload(path, blob) {
        await wait();
        if (!session) return { error: { message: '沒有權限，請先登入。' } };
        try {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          photoStore[path] = dataUrl;
          savePhotos();
          return { data: { path }, error: null };
        } catch (err) {
          return { error: { message: String(err.message || err) } };
        }
      },
      getPublicUrl(path) {
        return { data: { publicUrl: photoStore[path] || '' } };
      },
      async remove(paths) {
        await wait();
        paths.forEach((p) => { delete photoStore[p]; });
        savePhotos();
        return { data: null, error: null };
      },
    };
  },
};

export const supabase = {
  storage: mockStorage,
  auth: {
    async getSession() {
      return { data: { session }, error: null };
    },
    onAuthStateChange(fn) {
      listeners.push(fn);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signInWithPassword({ email, password }) {
      await wait();
      if (password !== 'demo') {
        return { error: { message: '預覽模式的密碼固定是 demo' } };
      }
      session = { user: { email } };
      localStorage.setItem(AUTH_KEY, email);
      listeners.forEach((fn) => fn('SIGNED_IN', session));
      return { error: null };
    },
    async signOut() {
      session = null;
      localStorage.removeItem(AUTH_KEY);
      listeners.forEach((fn) => fn('SIGNED_OUT', null));
      return { error: null };
    },
  },
};

/* ---------------- 資料存取 ---------------- */

export async function fetchStores() {
  await wait();
  return structuredClone(data.stores).sort(
    (a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'zh-Hant')
  );
}

export async function fetchStore(id) {
  await wait();
  return structuredClone(data.stores.find((s) => s.id === id) ?? null);
}

export async function fetchMenuItems(storeId) {
  await wait();
  return structuredClone(data.items.filter((i) => i.store_id === storeId))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function fetchStoreWithMenu(id) {
  const [store, items] = await Promise.all([fetchStore(id), fetchMenuItems(id)]);
  return { store, items };
}

export async function saveStoreWithMenu(store, items) {
  await wait();
  if (!session) throw new Error('沒有權限做這個操作，請先登入。');

  const payload = {
    name: store.name.trim(),
    category: store.category?.trim() || null,
    phone: store.phone?.trim() || null,
    note: store.note?.trim() || null,
    hours: store.hours || {},
    menu_photos: Array.isArray(store.menu_photos) ? store.menu_photos : [],
    temp_closed: Boolean(store.temp_closed),
    sort_order: Number(store.sort_order) || 0,
  };

  let storeId = store.id;
  if (storeId) {
    const idx = data.stores.findIndex((s) => s.id === storeId);
    data.stores[idx] = { ...data.stores[idx], ...payload };
  } else {
    storeId = uid();
    data.stores.push({ id: storeId, ...payload });
  }

  const cleaned = items.filter((i) => i.name && i.name.trim());
  const keep = new Set(cleaned.map((i) => i.id).filter(Boolean));
  data.items = data.items.filter((i) => i.store_id !== storeId || keep.has(i.id));

  cleaned.forEach((item, index) => {
    const row = {
      store_id: storeId,
      name: item.name.trim(),
      price: item.price === '' || item.price === null || item.price === undefined ? null : Number(item.price),
      category: item.category?.trim() || null,
      note: item.note?.trim() || null,
      is_sold_out: Boolean(item.is_sold_out),
      sort_order: index + 1,
    };
    if (item.id) {
      const idx = data.items.findIndex((i) => i.id === item.id);
      data.items[idx] = { ...data.items[idx], ...row };
    } else {
      data.items.push({ id: uid(), ...row });
    }
  });

  save();
  return storeId;
}

export async function deleteStore(id) {
  await wait();
  if (!session) throw new Error('沒有權限做這個操作，請先登入。');
  data.stores = data.stores.filter((s) => s.id !== id);
  data.items = data.items.filter((i) => i.store_id !== id);
  save();
}

export async function setTempClosed(id, tempClosed) {
  await wait();
  const store = data.stores.find((s) => s.id === id);
  if (store) store.temp_closed = tempClosed;
  save();
}

/** 預覽頁的「重設資料」按鈕用。 */
export function resetPreviewData() {
  data = structuredClone(SEED);
  photoStore = {};
  localStorage.removeItem(PHOTO_KEY);
  save();
}

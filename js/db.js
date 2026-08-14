/**
 * Supabase 連線與所有資料存取。
 *
 * 畫面層只呼叫這裡的函式，不直接碰 Supabase API，
 * 之後要換資料來源或調整查詢，改這一個檔案就好。
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

/**
 * Supabase 後台顯示的網址有時會帶著 /rest/v1 這類路徑，
 * 但 client 會自己接上路徑，直接用會變成 /rest/v1/rest/v1/... 而報
 * 「Invalid path specified in request URL」。這裡先把路徑削掉只留根網址。
 */
function projectUrl(raw) {
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

export const supabase = createClient(projectUrl(SUPABASE_URL), SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,      // 登入狀態存在 localStorage，手機登入一次就記住
    autoRefreshToken: true,
    detectSessionInUrl: false, // 沒用到 OAuth 轉址，關掉避免動到網址列的 hash 路由
  },
});

/** 把 Supabase 的錯誤訊息換成看得懂的中文。 */
export function describeError(error) {
  if (!error) return '發生未知的錯誤';
  const msg = String(error.message || error);

  if (/Failed to fetch|NetworkError|ERR_NAME_NOT_RESOLVED/i.test(msg)) {
    return '連不上伺服器。檢查網路，或確認 js/config.js 的網址是否正確。';
  }
  if (/Invalid login credentials/i.test(msg)) {
    return 'Email 或密碼不正確。';
  }
  if (/Email not confirmed/i.test(msg)) {
    return '這個帳號還沒完成驗證。請到 Supabase 後台把使用者刪掉重建，並勾選 Auto Confirm User。';
  }
  if (/row-level security|violates row-level/i.test(msg)) {
    return '沒有權限做這個操作，請先登入。';
  }
  if (/JWT expired|invalid claim/i.test(msg)) {
    return '登入已過期，請重新登入。';
  }
  if (/menu_photos/i.test(msg)) {
    return '資料庫還沒有菜單照片的欄位。請把 supabase/add-menu-photos.sql 貼到 SQL Editor 執行一次。';
  }
  if (/relation .* does not exist|schema cache/i.test(msg)) {
    return '找不到資料表。請把 supabase/schema.sql 貼到 Supabase 的 SQL Editor 執行一次。';
  }
  if (/Bucket not found/i.test(msg)) {
    return '找不到放照片的空間。請把 supabase/add-menu-photos.sql 貼到 SQL Editor 執行一次。';
  }
  if (/exceeded the maximum allowed size|Payload too large/i.test(msg)) {
    return '照片檔案太大，換一張或重拍一次。';
  }
  if (/mime type .* is not supported/i.test(msg)) {
    return '這個圖片格式不支援，請用 JPG 或 PNG。';
  }
  return msg;
}

function unwrap({ data, error }) {
  if (error) throw new Error(describeError(error));
  return data;
}

/* ---------------- 讀取 ---------------- */

/** 取得所有店家。營業狀態在前端依 hours 計算，不需要資料庫參與。 */
export async function fetchStores() {
  return unwrap(
    await supabase
      .from('stores')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
  );
}

export async function fetchStore(id) {
  return unwrap(await supabase.from('stores').select('*').eq('id', id).maybeSingle());
}

export async function fetchMenuItems(storeId) {
  return unwrap(
    await supabase
      .from('menu_items')
      .select('*')
      .eq('store_id', storeId)
      .order('sort_order', { ascending: true })
  );
}

/** 菜單頁一次要店家與菜單，併發拿比較快。 */
export async function fetchStoreWithMenu(id) {
  const [store, items] = await Promise.all([fetchStore(id), fetchMenuItems(id)]);
  return { store, items };
}

/* ---------------- 寫入 ---------------- */

function storePayload(store) {
  return {
    name: store.name.trim(),
    category: store.category?.trim() || null,
    phone: store.phone?.trim() || null,
    note: store.note?.trim() || null,
    hours: store.hours || {},
    menu_photos: Array.isArray(store.menu_photos) ? store.menu_photos : [],
    temp_closed: Boolean(store.temp_closed),
    sort_order: Number(store.sort_order) || 0,
  };
}

function itemPayload(item, storeId, index) {
  return {
    store_id: storeId,
    name: item.name.trim(),
    price: item.price === '' || item.price === null || item.price === undefined
      ? null
      : Number(item.price),
    category: item.category?.trim() || null,
    note: item.note?.trim() || null,
    is_sold_out: Boolean(item.is_sold_out),
    sort_order: index + 1,
  };
}

/**
 * 一次存好店家與整份菜單。
 *
 * 菜單採「差異更新」：畫面上被刪掉的品項要從資料庫移除，
 * 保留的更新內容與順序，新增的則插入。
 *
 * @returns {string} 店家 id（新增時會是資料庫產生的新 id）
 */
export async function saveStoreWithMenu(store, items) {
  let storeId = store.id;

  if (storeId) {
    unwrap(await supabase.from('stores').update(storePayload(store)).eq('id', storeId));
  } else {
    const created = unwrap(
      await supabase.from('stores').insert(storePayload(store)).select('id').single()
    );
    storeId = created.id;
  }

  const cleaned = items.filter((item) => item.name && item.name.trim());

  // 刪掉畫面上已經被移除的品項
  const keepIds = cleaned.map((item) => item.id).filter(Boolean);
  let del = supabase.from('menu_items').delete().eq('store_id', storeId);
  if (keepIds.length > 0) {
    del = del.not('id', 'in', `(${keepIds.join(',')})`);
  }
  unwrap(await del);

  // 更新既有品項
  const existing = cleaned
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.id)
    .map(({ item, index }) => ({ id: item.id, ...itemPayload(item, storeId, index) }));
  if (existing.length > 0) {
    unwrap(await supabase.from('menu_items').upsert(existing));
  }

  // 新增品項
  const fresh = cleaned
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.id)
    .map(({ item, index }) => itemPayload(item, storeId, index));
  if (fresh.length > 0) {
    unwrap(await supabase.from('menu_items').insert(fresh));
  }

  return storeId;
}

/** 刪除店家。菜單靠資料表的 on delete cascade 一起被刪掉。 */
export async function deleteStore(id) {
  unwrap(await supabase.from('stores').delete().eq('id', id));
}

/** 只切換臨時公休，供主畫面快速操作用。 */
export async function setTempClosed(id, tempClosed) {
  unwrap(await supabase.from('stores').update({ temp_closed: tempClosed }).eq('id', id));
}

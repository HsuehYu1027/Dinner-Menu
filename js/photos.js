/**
 * 菜單照片的上傳、壓縮與刪除。
 *
 * 手機拍的照片動輒 3–5MB，直接上傳既慢又很快吃掉免費方案的空間，
 * 所以上傳前先在瀏覽器裡用 canvas 縮到長邊 1600px、轉成 JPEG 82%，
 * 一張菜單大約會落在 200–400KB，看起來仍然清楚。
 *
 * 檔案放在 Storage 的 menu-photos bucket，資料庫的 stores.menu_photos
 * 只存路徑（例如 "a1b2c3d4/1718000000.jpg"），要顯示時才組出公開網址。
 * 這樣之後換 bucket 名稱或網域都不用改資料。
 */

import { supabase, describeError } from './db.js';

export const BUCKET = 'menu-photos';

const MAX_EDGE = 1600;      // 長邊上限
const JPEG_QUALITY = 0.82;
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 超過 25MB 的原始檔直接擋掉

/** 讀成可以畫到 canvas 的圖。優先用 createImageBitmap，它會自己套用 EXIF 方向。 */
async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, release: () => bitmap.close?.() };
    } catch {
      // 舊版 Safari 不支援第二個參數，往下走備援
    }
  }

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, release: () => URL.revokeObjectURL(url) };
}

/** 壓縮成 JPEG Blob。 */
export async function compressImage(file) {
  const { source, release } = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // 菜單多半是白底，先鋪白色避免 PNG 透明區轉成 JPEG 後變黑
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });
    if (!blob) throw new Error('照片轉檔失敗，換一張試試看。');
    return blob;
  } finally {
    release();
  }
}

function randomFolder() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * 上傳一張照片，回傳它在 Storage 裡的路徑。
 * 路徑不綁店家 id，因為新增店家時還沒有 id。
 */
export async function uploadPhoto(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`「${file.name}」不是圖片檔`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error(`「${file.name}」太大了（超過 25MB）`);
  }

  const blob = await compressImage(file);
  const path = `${randomFolder()}/${Date.now()}.jpg`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) throw new Error(describeError(error));
  return path;
}

/** 刪除照片。刪不掉不該擋住使用者存檔，所以失敗只回 false。 */
export async function deletePhoto(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.warn('刪除照片失敗：', path, error);
    return false;
  }
  return true;
}

/** 組出可以直接放進 <img src> 的公開網址。 */
export function photoUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

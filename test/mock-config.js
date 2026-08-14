/** 預覽模式用的假設定，讓 app.js 的「還沒接上資料庫」檢查通過。 */
export const SUPABASE_URL = 'https://preview.local';
export const SUPABASE_ANON_KEY = 'preview-mode-no-real-key-needed';
export function isConfigured() {
  return true;
}

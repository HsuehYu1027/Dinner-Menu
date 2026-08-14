/**
 * Supabase 連線設定。
 *
 * ⬇⬇ 下面兩行的值都是「示範用的假值」，一定要換成你自己專案的值，否則網站連不上資料庫。
 *
 * 到 Supabase 後台 → Project Settings → API Keys 抄這兩個：
 *   Project URL   → 貼到 SUPABASE_URL
 *   anon public   → 貼到 SUPABASE_ANON_KEY（絕對不要用 service_role 那把）
 *
 * 只換單引號中間的內容，引號和分號保留。詳細步驟看 SETUP.md 的步驟 5。
 *
 * 這兩個值會公開在網頁原始碼裡，這是正常的。真正的防護在資料庫的 RLS 權限規則：
 * 沒登入的人無論如何都改不了資料。
 */

export const SUPABASE_URL = 'https://imvtirgahfxgmhoxtggk.supabase.co';

export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltdnRpcmdhaGZ4Z21ob3h0Z2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MDYxNTgsImV4cCI6MjEwMjI4MjE1OH0.ebPiBNpPct8tPyq3XBZJzT7n4XSpPGQXTtlfLVotfWo';


/** 設定看起來還是預設假值時，前端會顯示提示而不是一直轉圈。 */
export function isConfigured() {
  return (
    !SUPABASE_URL.includes('xkqmvbtzrlfephdaugnc') &&
    !SUPABASE_ANON_KEY.includes('PASTE_YOUR_OWN_ANON_KEY_HERE') &&
    SUPABASE_URL.startsWith('https://') &&
    SUPABASE_ANON_KEY.length > 40
  );
}

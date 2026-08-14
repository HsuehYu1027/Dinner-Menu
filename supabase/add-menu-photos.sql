-- =============================================================
-- 加入「菜單照片」功能
--
-- 給已經跑過 schema.sql 的資料庫用的。整份複製貼進 Supabase 的
-- SQL Editor 按 Run 即可，不會動到你已經建好的店家與菜單資料。
--
-- （如果是第一次設定、還沒跑過任何 SQL，直接跑 schema.sql 就好，
--   那份裡面已經包含這些內容，不需要再跑這一份。）
-- =============================================================


-- ---------- 1. stores 加一個存照片路徑的欄位 ----------
alter table public.stores
  add column if not exists menu_photos jsonb not null default '[]'::jsonb;

comment on column public.stores.menu_photos is
  '菜單照片在 Storage 裡的路徑陣列，例如 ["a1b2c3/1718000000.jpg"]';


-- ---------- 2. 建立放照片的 Storage bucket ----------
-- public = true：照片網址任何人都能開，網站才顯示得出來
-- file_size_limit 5MB：上傳前前端會先壓縮，正常不會碰到這個上限
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-photos', 'menu-photos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];


-- ---------- 3. 照片的存取權限 ----------
-- 跟店家資料同一套規則：任何人可以看，只有登入者能上傳與刪除。
drop policy if exists "menu-photos 任何人可看"   on storage.objects;
drop policy if exists "menu-photos 登入者可上傳" on storage.objects;
drop policy if exists "menu-photos 登入者可覆蓋" on storage.objects;
drop policy if exists "menu-photos 登入者可刪除" on storage.objects;

create policy "menu-photos 任何人可看"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-photos');

create policy "menu-photos 登入者可上傳"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-photos');

create policy "menu-photos 登入者可覆蓋"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'menu-photos')
  with check (bucket_id = 'menu-photos');

create policy "menu-photos 登入者可刪除"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu-photos');


-- =============================================================
-- 如果第 3 段出現 "must be owner of table objects" 之類的錯誤，
-- 代表這個專案不允許用 SQL 改 Storage 權限。改用後台點選的方式：
--
--   1. 左側 Storage → 確認有一個叫 menu-photos 的 bucket
--      （沒有的話按 New bucket 建立，名稱打 menu-photos，
--        並把 Public bucket 打開）
--   2. 進入該 bucket → Policies → New policy
--   3. 用範本建三條，target roles 如下：
--        SELECT → anon, authenticated
--        INSERT → authenticated
--        DELETE → authenticated
--
-- 第 1、2 段（欄位與 bucket）不受影響，照樣會成功。
-- =============================================================

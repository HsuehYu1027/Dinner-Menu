-- =============================================================
-- 晚餐大全 — Supabase 資料庫結構
-- 使用方式：整份複製，貼進 Supabase 後台的 SQL Editor，按 Run。
-- 可重複執行（會先刪除舊表，注意：重跑會清空既有資料）。
-- =============================================================

-- ---------- 清除舊結構（第一次執行時這兩行不會有作用） ----------
drop table if exists public.menu_items cascade;
drop table if exists public.stores cascade;


-- ---------- 店家 ----------
create table public.stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                          -- 便當 / 麵食 / 飲料…，主畫面顯示成小標籤
  phone       text,                          -- 手機上會變成可直接撥號的連結
  note        text,                          -- 備註：外送門檻、公休公告…
  hours       jsonb not null default '{}'::jsonb,
  menu_photos jsonb not null default '[]'::jsonb, -- 菜單照片在 Storage 裡的路徑
  temp_closed boolean not null default false, -- 臨時公休，會蓋過自動判斷
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- hours 欄位格式說明：
--   key 為 "0"–"6"，對應 JavaScript 的 Date.getDay()，0 = 週日、6 = 週六
--   value 為當天的營業時段陣列，每天最多兩段（午餐、晚餐）
--   空陣列 [] 代表當天公休
--   收店時間小於開店時間 = 跨夜營業（例：["17:00","02:00"] 是營業到隔天凌晨兩點）
--
--   {
--     "0": [],
--     "1": [["11:00","14:00"], ["17:00","20:30"]],
--     "2": [["17:00","02:00"]]
--   }

comment on column public.stores.hours is
  'key "0"-"6" 對應 Date.getDay()，value 為 [["HH:MM","HH:MM"], ...]，空陣列代表公休';


-- ---------- 菜單品項 ----------
create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.stores(id) on delete cascade,
  name        text not null,
  price       integer,                        -- 允許 null，代表時價或未定
  category    text,                           -- 主餐 / 湯品 / 飲料，菜單分組用
  note        text,
  is_sold_out boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index menu_items_store_id_idx on public.menu_items (store_id);


-- ---------- 自動更新 updated_at ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_set_updated_at
  before update on public.stores
  for each row execute function public.set_updated_at();


-- =============================================================
-- 權限（Row Level Security）
--
-- 重要：網頁上的 anon key 是公開的，任何人都拿得到。
-- 因此「誰能改資料」必須由這裡的政策決定，不能只靠前端把按鈕藏起來。
--
--   任何人（含未登入訪客）→ 只能讀
--   已登入的使用者         → 可以新增 / 修改 / 刪除
--
-- 搭配 SETUP.md 步驟 4：務必在後台關閉 Email 註冊功能，
-- 否則任何人都能自己註冊帳號，就取得寫入權限了。
-- =============================================================

alter table public.stores     enable row level security;
alter table public.menu_items enable row level security;

-- 讀：所有人
create policy "stores 任何人可讀"
  on public.stores for select
  to anon, authenticated
  using (true);

create policy "menu_items 任何人可讀"
  on public.menu_items for select
  to anon, authenticated
  using (true);

-- 寫：僅限已登入
create policy "stores 登入者可新增"
  on public.stores for insert
  to authenticated
  with check (true);

create policy "stores 登入者可修改"
  on public.stores for update
  to authenticated
  using (true) with check (true);

create policy "stores 登入者可刪除"
  on public.stores for delete
  to authenticated
  using (true);

create policy "menu_items 登入者可新增"
  on public.menu_items for insert
  to authenticated
  with check (true);

create policy "menu_items 登入者可修改"
  on public.menu_items for update
  to authenticated
  using (true) with check (true);

create policy "menu_items 登入者可刪除"
  on public.menu_items for delete
  to authenticated
  using (true);


-- =============================================================
-- 菜單照片的 Storage 設定
--
-- 照片檔案放在 Storage 的 menu-photos bucket，stores.menu_photos
-- 只存路徑。權限跟店家資料同一套：任何人可看，只有登入者能上傳與刪除。
-- =============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-photos', 'menu-photos', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

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

-- 上面這段若出現 "must be owner of table objects" 的錯誤，
-- 表示這個專案不允許用 SQL 改 Storage 權限，改到後台 Storage →
-- menu-photos → Policies 用範本手動建三條（SELECT 給 anon 與
-- authenticated，INSERT 與 DELETE 給 authenticated）。


-- =============================================================
-- 範例資料（想先看看畫面長怎樣可以留著，之後在網站上直接刪掉即可）
-- 不需要的話，把下面整段刪掉再執行。
-- =============================================================

insert into public.stores (name, category, phone, note, hours, sort_order) values
(
  '阿姨古早味便當', '便當', '02-2345-6789', '滿 300 元免外送費',
  '{"0":[],"1":[["11:00","14:00"],["17:00","20:30"]],"2":[["11:00","14:00"],["17:00","20:30"]],"3":[["11:00","14:00"],["17:00","20:30"]],"4":[["11:00","14:00"],["17:00","20:30"]],"5":[["11:00","14:00"],["17:00","21:00"]],"6":[["17:00","21:00"]]}'::jsonb,
  1
),
(
  '深夜食堂麵館', '麵食', '02-8765-4321', '營業到凌晨，宵夜首選',
  '{"0":[["17:00","02:00"]],"1":[],"2":[["17:00","02:00"]],"3":[["17:00","02:00"]],"4":[["17:00","02:00"]],"5":[["17:00","03:00"]],"6":[["17:00","03:00"]]}'::jsonb,
  2
),
(
  '清心小舖', '飲料', '02-1111-2222', null,
  '{"0":[["10:00","22:00"]],"1":[["10:00","22:00"]],"2":[["10:00","22:00"]],"3":[["10:00","22:00"]],"4":[["10:00","22:00"]],"5":[["10:00","23:00"]],"6":[["10:00","23:00"]]}'::jsonb,
  3
);

insert into public.menu_items (store_id, name, price, category, note, sort_order)
select id, v.name, v.price, v.category, v.note, v.sort_order
from public.stores, (values
  ('排骨飯',   90, '主餐', null,      1),
  ('雞腿飯',  100, '主餐', '限量',     2),
  ('鱈魚飯',  110, '主餐', null,      3),
  ('滷肉飯',   45, '主餐', null,      4),
  ('貢丸湯',   25, '湯品', null,      5),
  ('紫菜蛋花湯', 25, '湯品', null,     6)
) as v(name, price, category, note, sort_order)
where public.stores.name = '阿姨古早味便當';

insert into public.menu_items (store_id, name, price, category, note, sort_order)
select id, v.name, v.price, v.category, v.note, v.sort_order
from public.stores, (values
  ('牛肉麵',   150, '麵食', '招牌',    1),
  ('陽春麵',    60, '麵食', null,     2),
  ('餛飩麵',    85, '麵食', null,     3),
  ('滷味拼盤',  120, '小菜', null,     4),
  ('燙青菜',    40, '小菜', null,     5)
) as v(name, price, category, note, sort_order)
where public.stores.name = '深夜食堂麵館';

insert into public.menu_items (store_id, name, price, category, note, sort_order)
select id, v.name, v.price, v.category, v.note, v.sort_order
from public.stores, (values
  ('珍珠奶茶',  55, '奶茶', null,     1),
  ('紅茶拿鐵',  50, '奶茶', null,     2),
  ('冬瓜檸檬',  45, '茶類', null,     3),
  ('四季春',    35, '茶類', null,     4)
) as v(name, price, category, note, sort_order)
where public.stores.name = '清心小舖';

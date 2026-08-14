# 晚餐大全

自己用的晚餐店家清單。主畫面看得到哪幾家還在營業、哪幾家打烊了，點進去看菜單，
登入後可以直接在網頁上（手機也行）新增與修改店家。

- 菜單直接拍照上傳，不用一項一項打字（沒菜單可拍的店家也可以自己打）
- 手機優先設計，加到主畫面後像 App 一樣全螢幕開啟
- 資料存在 Supabase，手機和電腦看到的是同一份
- 只有你（登入者）能編輯，其他人打開只能看
- 純靜態網頁，沒有 build 步驟，丟到 GitHub Pages 就能用

## 先看看長什麼樣

不用先設定資料庫。在這個資料夾裡執行：

```bash
python -m http.server 8000
```

然後開 <http://localhost:8000/test/preview.html>。

這是預覽模式，資料存在瀏覽器本機、可以隨便亂改，右上角登入的密碼固定是 `demo`。
按上方的「重設資料」可以還原成範例資料。

## 正式開始用

看 [SETUP.md](SETUP.md)，從註冊 Supabase 到部署上 GitHub Pages 都有逐步說明，大約 15 分鐘。

簡單講就三件事：
1. 開一個 Supabase 免費專案，把 `supabase/schema.sql` 貼進去執行
2. 把專案網址與金鑰填進 `js/config.js`
3. 傳上 GitHub 並開啟 Pages

## 檔案說明

```
index.html              網站本體（正式使用開這個）
manifest.json           加到主畫面的設定
icons/                  App 圖示
css/style.css           全部樣式，含深色模式與手機安全區域處理

js/
  config.js             ★ 要填 Supabase 網址與金鑰的地方
  db.js                 所有資料存取，畫面層只透過這裡碰資料庫
  auth.js               登入狀態
  photos.js             菜單照片的壓縮與上傳
  hours.js              營業時間計算（純函式，沒有畫面相依）
  ui.js                 頂部列、提示訊息、確認視窗等共用小工具
  app.js                hash 路由與啟動
  views/
    store-list.js       主畫面
    store-detail.js     菜單畫面
    store-editor.js     新增／編輯畫面

supabase/
  schema.sql            資料表、Storage 與權限設定，第一次設定跑這份
  add-menu-photos.sql   已經跑過舊版 schema.sql 的人，補照片功能用這份
test/
  hours.test.html       營業時間邏輯的測試，開起來全綠就是通過
  preview.html          不接資料庫的預覽模式
  mock-db.js            預覽模式用的假資料層
```

## 菜單照片怎麼存的

照片檔案放在 Supabase Storage 的 `menu-photos` bucket，資料庫的 `stores.menu_photos`
只存路徑陣列（例如 `["a1b2c3/1718000000.jpg"]`），要顯示時才組出公開網址。

上傳前會先在瀏覽器裡壓縮：長邊縮到 1600px、轉成 JPEG 82%，一張菜單大約 200–400KB。
手機直接拍的原圖動輒 3–5MB，不壓縮的話免費方案的 1GB 很快就會用完，載入也慢。

照片的刪除時機有刻意處理：編輯時移除「已經存過檔」的照片，要等按下儲存成功才真的從
Storage 刪除，中途按取消就完整還原；反之這次剛上傳、還沒存檔的照片，按取消時會直接
清掉，不會留下沒人用的檔案。

## 營業時間怎麼存的

每家店的 `hours` 是一個 JSON，key 是 `"0"`–`"6"`（對應星期日到星期六），
value 是當天的時段陣列，每天最多兩段：

```json
{
  "0": [],
  "1": [["11:00", "14:00"], ["17:00", "20:30"]],
  "2": [["17:00", "02:00"]]
}
```

- 空陣列 `[]` 代表當天公休
- 收店時間比開店時間早（像上面週二的 `17:00`–`02:00`）代表營業到隔天凌晨，
  程式會正確判斷「週三凌晨一點仍在營業中」
- 另外有「臨時公休」開關，打開後不管時間怎麼設都顯示休息中

改動 `js/hours.js` 之後，記得開 `test/hours.test.html` 確認還是全綠。

## 注意

`js/config.js` 裡的 anon key 會公開在網頁原始碼裡，這是 Supabase 的正常用法。
真正擋住別人亂改資料的是資料庫的 RLS 權限規則，加上 SETUP.md 步驟 4 的「關閉公開註冊」。
這兩件事都做了，別人就只能看不能改。

不要把 `service_role` 那把金鑰放進來，那把會繞過所有權限檢查。

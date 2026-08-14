# 晚餐大全 — 設定與部署說明

> **想先看看網站長什麼樣，再決定要不要設定？**
> 在這個資料夾執行 `python -m http.server 8000`，開 <http://localhost:8000/test/preview.html>。
> 那是預覽模式，用假資料跑，不需要下面任何設定，登入密碼是 `demo`。

整份照著做大約 15 分鐘。分成三部分：

1. **建立資料庫**（Supabase，免費）— 讓手機和電腦看到同一份資料
2. **接上網站**（改一個檔案的兩行）
3. **放上網路**（GitHub Pages，免費）— 拿到一個手機隨時能開的網址

---

## 第一部分：建立資料庫

### 步驟 1 — 註冊 Supabase 並建立專案

1. 開 <https://supabase.com>，點右上角 **Start your project**，用 GitHub 帳號或 Email 註冊
2. 登入後點 **New project**
3. 填寫：
   - **Name**：`dinner`（隨便取，只有你會看到）
   - **Database Password**：按 **Generate a password** 產生一組，**先複製存到記事本**
     （這是資料庫本身的密碼，網站不會用到，但之後想直接操作資料庫時會需要）
   - **Region**：選 `Northeast Asia (Tokyo)`，離台灣最近、速度最快
4. 按 **Create new project**，等大約 2 分鐘讓它建置完成

### 步驟 2 — 建立資料表

1. 左側選單點 **SQL Editor**（圖示是 `>_`）
2. 點 **New query**
3. 打開本專案的 `supabase/schema.sql`，**整份複製**貼進去
4. 按右下角 **Run**（或 Ctrl + Enter）
5. 看到 `Success. No rows returned` 就完成了

> `schema.sql` 最後面有三家範例店家的資料，讓你一接上就看得到畫面。
> 不想要的話，之後在網站上直接刪掉即可，不用回來改 SQL。

> **已經跑過舊版 schema.sql 的人看這裡**
> 菜單照片是後來才加的功能。如果你的資料庫是在那之前建立的，
> 不要重跑 `schema.sql`（會清空你已經輸入的店家），
> 改成把 **`supabase/add-menu-photos.sql`** 貼進 SQL Editor 執行一次就好，
> 它只會補上照片需要的欄位與存放空間，不動既有資料。

### 步驟 3 — 建立你的登入帳號

網站上「新增店家、修改菜單」需要登入才能做，這裡建立你自己的帳號。

1. 左側選單點 **Authentication** → **Users**
2. 點 **Add user** → **Create new user**
3. 填入你的 Email 和一組密碼（這組密碼就是之後在網站上登入用的，請記住）
4. **把 `Auto Confirm User` 打勾** — 沒勾的話會需要收信驗證，很麻煩
5. 按 **Create user**

### 步驟 4 — 關閉公開註冊（重要，不要跳過）

網站是公開網址，任何人都連得到。如果註冊功能開著，別人可以自己註冊一個帳號，
就變成「已登入使用者」，然後把你的店家資料全改掉或刪光。

1. 左側選單點 **Authentication** → **Sign In / Providers**
2. 找到 **Email** 這一項展開
3. 把 **Allow new users to sign up** 關掉
4. 按 **Save**

這樣一來，全世界只有你步驟 3 建立的那個帳號能編輯，其他人打開網站只能看。

### 步驟 5 — 取得網站要用的兩個值

1. 左側選單最下方點 **Project Settings**（齒輪）→ **API Keys**（有些版本叫 **Data API**）
2. 抄下這兩個值：
   - **Project URL** — 長得像 `https://xkqmvbtzrlfephdaugnc.supabase.co`
   - **anon public** key — 一長串以 `eyJ` 開頭的文字

> 這兩個值會寫進網頁原始碼、公開在網路上，這是正常且安全的設計。
> 真正的防護在步驟 2 建立的資料庫權限規則（RLS），未登入者無論如何都改不了資料。
>
> 但**千萬不要**用 `service_role` 那把 key —— 那把會繞過所有權限檢查。只用 `anon public`。

---

## 第二部分：接上網站

打開 `js/config.js`，把裡面兩行的值換成你自己的。

檔案原本長這樣（**下面這兩個值是假的示範值，一定要換掉**）：

```js
export const SUPABASE_URL = 'https://xkqmvbtzrlfephdaugnc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.PASTE_YOUR_OWN_ANON_KEY_HERE';
```

把 `SUPABASE_URL` 換成步驟 5 抄下的 **Project URL**，
把 `SUPABASE_ANON_KEY` 換成步驟 5 抄下的 **anon public** key。
兩邊的單引號要保留，只換引號中間的內容。

### 在自己電腦上先試跑

因為網站用了 ES Modules，**不能直接雙擊 `index.html`**（瀏覽器會擋），要起一個小伺服器：

```bash
python -m http.server 8000
```

在 `晚餐大全` 資料夾裡執行上面這行，然後瀏覽器開 <http://localhost:8000>。

看得到店家清單就代表資料庫接通了。點右上角登入，用步驟 3 建立的帳號密碼登入後，
就會出現「新增店家」和編輯按鈕。

---

## 第三部分：放上網路（GitHub Pages）

### 步驟 6 — 把檔案放上 GitHub

1. 開 <https://github.com>，登入（沒帳號就註冊一個）
2. 右上角 **+** → **New repository**
3. 填寫：
   - **Repository name**：`dinner`
   - 選 **Public**（GitHub Pages 免費方案需要公開；資料在 Supabase，這裡只有網頁程式碼）
   - 其他都不用勾
4. 按 **Create repository**
5. 在新頁面點 **uploading an existing file**
6. 把 `晚餐大全` 資料夾裡的所有東西拖進去
   （`index.html`、`manifest.json`、`css`、`js`、`icons` 這些都要，
   `supabase` 和 `test` 資料夾傳不傳都可以）
7. 下方按 **Commit changes**

### 步驟 7 — 開啟 GitHub Pages

1. 在這個 repository 裡點上方的 **Settings**
2. 左側選單點 **Pages**
3. **Source** 選 `Deploy from a branch`
4. **Branch** 選 `main`、資料夾選 `/ (root)`，按 **Save**
5. 等 1–2 分鐘，重新整理這頁，上方會出現你的網址

網址格式是 `https://你的GitHub帳號.github.io/dinner/`，
例如帳號叫 `chenwei1027`，網址就是 `https://chenwei1027.github.io/dinner/`。

### 步驟 8 — 手機加到主畫面

用手機瀏覽器開上面那個網址，然後：

- **iPhone（Safari）**：點下方分享鈕 → 往下滑選「加入主畫面」
- **Android（Chrome）**：點右上角 ⋮ → 「加到主畫面」

之後從主畫面圖示開啟，會是全螢幕、沒有網址列，用起來跟一般 App 一樣。

---

## 之後想改東西

**改店家資料** — 直接在網站上改，登入後就有編輯按鈕，手機也能改。改完馬上同步到所有裝置。

**改網站程式** — 在電腦上改完檔案，回到 GitHub repository 頁面把檔案重新上傳一次
（點 **Add file** → **Upload files** → 拖進去 → **Commit changes**），
等 1–2 分鐘 GitHub Pages 就會自動更新。

---

## 遇到問題

**畫面一直轉圈或顯示「載入失敗」**
`js/config.js` 的兩個值可能沒換或貼錯。按 F12 打開開發者工具看 Console 的錯誤訊息。

**登入時說帳號密碼錯誤**
確認步驟 3 建立使用者時有勾 `Auto Confirm User`。沒勾的話回後台 Authentication → Users
把該使用者刪掉重建一次。

**看得到店家但存檔失敗**
代表沒登入成功，或 `schema.sql` 的權限政策沒跑到。回 SQL Editor 把 `schema.sql` 整份重跑一次。

**別人也能編輯**
步驟 4 沒做。回 Authentication → Sign In / Providers → Email，把 `Allow new users to sign up` 關掉。

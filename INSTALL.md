# 安裝指引

## 系統需求

- Microsoft Edge（Chromium 核心）
- 或任何 Chromium 瀏覽器（Chrome、Brave、Opera 等）
- Mozilla Firefox 142 以上
- Firefox Developer Edition 或 Nightly（適用手動安裝方式）

## 安裝步驟

### 1. 下載原始碼

```bash
git clone https://github.com/TwhomeGH/adFixTools.git
```

或直接下載 ZIP → 解壓縮。

### 2. 開啟擴充功能管理頁

在 Edge 網址列輸入：

```
edge://extensions
```

### 3. 開啟開發人員模式

點選左上角的 **「開發人員模式」** 開關。

### 4. 載入擴充功能

點選 **「載入解壓縮」**，選取 `skipads` 資料夾。

### 5. 確認啟用

確認 SkipAds 出現在列表中且開關為開啟狀態。

---

## Firefox 安裝

### 方式一：直接從附加元件商店安裝（推薦）

SkipAds 已在 Firefox 附加元件商店（AMO）上架中。上架完成後，你可以在 Firefox 的附加元件管理員搜尋 **"SkipAds"** 或直接前往商店頁面安裝，安裝後會自動永久保留，重開 Firefox 也不會消失。

🔗 商店連結：（上架後補上）

### 方式二：使用 Firefox Developer Edition（手動永久安裝）

如果你不想等待上架審核，可改用 Firefox Developer Edition（與正式版可並存）來永久安裝：

1. 下載 [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/)
2. 安裝完成後，在網址列輸入 `about:config`
3. 搜尋 `xpinstall.signatures.required`，點兩下設為 **`false`**
4. 執行以下指令從專案目錄產出 Firefox 專用資料夾：

```powershell
.\switch-browser.ps1 -Target firefox
```

5. 將 `adFixTools-firefox/` 整個資料夾壓縮為 `.xpi` 檔：

```powershell
Compress-Archive -Path adFixTools-firefox\* -DestinationPath skipads-firefox.zip -Force
Rename-Item skipads-firefox.zip skipads-firefox.xpi -Force
```

或直接使用已產好的 `E:\adFixTools-firefox.xpi`（若在專案目錄內）。
6. 在 Firefox Developer Edition 網址列輸入 `about:addons`
7. 點選齒輪圖示 → **「從檔案安裝附加元件」** → 選取 `.xpi` 檔
8. 確認 SkipAds 出現在列表中

完成後就是永久安裝，關閉瀏覽器也不會消失。

### 方式三：暫時載入（開發測試用）

正式版 Firefox 也可用此方式載入，但重開瀏覽器後會消失：

1. 先執行 `.\switch-browser.ps1 -Target firefox` 切換為 Firefox manifest
2. 在網址列輸入 `about:debugging#/runtime/this-firefox`
3. 點選 **「暫時載入附加元件」**
4. 選取 `adFixTools-firefox` 中的 `manifest.json`
5. 確認 SkipAds 出現在列表中

---

## 驗證安裝

開啟 YouTube 影片，如果出現廣告：

- 影片會自動加速（預設 2x）並靜音
- 可略過廣告出現時會自動點擊跳過
- 跳過時右下角會顯示 Toast 通知

---

## 已知限制：CSP 政策

YouTube 近期開始套用 **Content Security Policy（CSP）**，會封鎖插件透過 `<script>` 注入的方式模擬可信點擊。

**影響範圍：**
- 有跳過按鈕的廣告（如 `ytp-video-interstitial-buttoned-centered-layout` 格式）無法自動點擊跳過
- 聊天室自動關閉功能也可能受影響

**解決方式：**

安裝可關閉 CSP 的瀏覽器擴充功能，例如：

- **[Disable CSP](https://chromewebstore.google.com/detail/disable-csp/ceipbakplhfdlpdnlbgijndekkohpjoo)**（Chromium 瀏覽器）

安裝後，插件即可繞過 CSP 限制正常跳過廣告。若不安裝也**不影響核心功能**——加速、靜音、首頁廣告封鎖等仍正常運作，有跳過按鈕的廣告只需手動點一下略過（約 1 秒即可點擊）。

## 快捷鍵

`Ctrl+Shift+X` — 快速開關擴充功能。

---

## 解除安裝

**Edge / Chrome：** `edge://extensions` 或 `chrome://extensions` → 找到 SkipAds → 點選 **「移除」**。

**Firefox（AMO 安裝）：** `about:addons` → 找到 SkipAds → 點選 **「移除」**。

**Firefox（Developer Edition 手動安裝）：** 同上，從 `about:addons` 移除。

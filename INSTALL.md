# 安裝指引

## 系統需求

- Microsoft Edge（Chromium 核心）
- 或任何 Chromium 瀏覽器（Chrome、Brave、Opera 等）
- Mozilla Firefox 113 以上（需切換為 Firefox 專用 manifest）

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

### Firefox 前置步驟

Firefox 使用不同的背景執行架構，需先切換 manifest 再載入。

如果要在 Edge 和 Firefox **同時**安裝，用 `-Target all` 一次產生兩個資料夾：

```powershell
# 在專案目錄執行，產生 adFixTools-chrome/ 與 adFixTools-firefox/
.\switch-browser.ps1 -Target all
```

- `adFixTools-chrome/` → 載入 Edge
- `adFixTools-firefox/` → 載入 Firefox

如果只想單一資料夾輪流切換：

```powershell
.\switch-browser.ps1 -Target firefox   # 切換為 Firefox manifest
.\switch-browser.ps1 -Target chrome    # 切回 Chrome/Edge manifest
```

切換後 `manifest.json` 會改用對應的背景執行架構（Firefox 用 `background.scripts` 持久頁面，Chrome 用 `service_worker`），
Firefox 版本會自動帶入 AMO 所需的 `browser_specific_settings`。

### Firefox 安裝步驟

1. 在網址列輸入 `about:debugging#/runtime/this-firefox`
2. 點選 **「暫時載入附加元件」**
3. 選取 `adFixTools-firefox` 中的 `manifest.json`
4. 確認 SkipAds 出現在列表中

---

## 驗證安裝

開啟 YouTube 影片，如果出現廣告：

- 影片會自動加速（預設 2x）並靜音
- 可略過廣告出現時會自動點擊跳過
- 跳過時右下角會顯示 Toast 通知

---

## 快捷鍵

`Ctrl+Shift+X` — 快速開關擴充功能。

---

## 解除安裝

`edge://extensions` → 找到 SkipAds → 點選 **「移除」**。

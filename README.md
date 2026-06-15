# SkipAds — YouTube Ad Skipper

輕量級 Edge 擴充功能，自動跳過 YouTube 廣告，支援加速、靜音、首頁廣告封鎖。

## 理念

廣告可以存在，但不該影響觀看體驗。

我們理解平台需要廣告收益，但**不應強迫用戶看完固定時長**才能略過。有些時候看到廣告標題就已經知道內容了，剩下的只是等待時間。

這個工具不是要完全消滅廣告，而是把選擇權還給用戶——讓廣告「出現」，但不要「強迫」。加速、靜音、跳過，都是為了同一個目的：**廣告可以顯示，但不該強迫我看那麼久。**

## 功能

- **自動跳過廣告** — 偵測跳過按鈕並自動點擊，無需等待
- **加速播放** — 廣告期間加速播放（預設 2x），減少等待時間
- **遞增加速** — 無法跳過的廣告自動遞增速度 (2x→4x→6x→8x→16x→24x...)，越播越快
- **自動靜音** — 廣告期間自動靜音（含獨立廣告影片元素），結束後恢復原本狀態
- **收納廣告面板** — 自動收合影片下方的贊助商廣告面板
- **首頁廣告封鎖** — 隱藏 YouTube 首頁與搜尋結果的推廣內容
- **隱藏聊天室** — 直播頁面自動隱藏聊天室；用戶手動開啟後暫停自動隱藏（可設定冷卻時間）
- **Toast 通知** — 跳過廣告時顯示短暫通知（含廣告標題）
- **統計資料** — 記錄總跳過次數、節省時間、平均廣告長度與最近跳過紀錄（最多 50 筆）
- **主題切換** — 設定頁支援跟隨系統、淺色、深色三種模式
- **快捷鍵** — `Ctrl+Shift+X` 快速開關
- **多語言** — 支援繁體中文與 English

## 安裝

詳細步驟請見 [INSTALL.md](INSTALL.md)。

快速版：
1. 開啟 Edge，前往 `edge://extensions`
2. 開啟左上角 **開發人員模式**
3. 點選 **載入解壓縮**，選取 `skipads` 資料夾
4. 確認 SkipAds 出現在列表中且已啟用

## 設定

點選工具列擴充圖示 → 齒輪圖示，或右鍵 → 選項：

| 設定 | 說明 |
|------|------|
| 廣告速度 | 廣告播放時的倍率 (2x / 4x / 8x / 16x) |
| 遞增加速 | 無法跳過的廣告自動遞增速度，越播越快 |
| 靜音廣告 | 廣告期間自動靜音（含獨立廣告影片元素） |
| 顯示通知 | 跳過廣告時顯示 Toast 通知 |
| 封鎖首頁廣告 | 隱藏首頁與搜尋推廣內容 |
| 收納廣告面板 | 自動收合影片下方的贊助商廣告面板 |
| 收合冷卻 | 手動展開後暫停自動收合時間 (0 = 不暫停) |
| 啟用 | 開關擴充功能（快捷鍵 Ctrl+Shift+X） |
| 隱藏聊天室 | 直播頁面自動隱藏聊天室 |
| 聊天室自動隱藏冷卻 | 用戶手動開啟後暫停自動隱藏的時間 (0 = 永不恢復) |
| 除錯模式 | 輸出廣告 DOM 資訊至主控台 |
| 主題 | 設定頁色彩：跟隨系統 / 淺色 / 深色 |

## 贊助支持

如果你覺得這個工具對你有幫助，歡迎透過以下方式贊助一杯咖啡 ☕

- [PayPal](https://paypal.me/coffeelatte0709)
- [TikTok](https://www.tiktok.com/@coffeelatte0709?_r=1&_t=ZS-914gBZGkAKO)
- [街口支付](https://service.jkopay.com/r/transfer?j=Transfer:911210964)
- [Twitch 贈送訂閱](https://www.twitch.tv/coffeelatte0709)

你的支持是持續開發的動力，感謝！

## 技術說明

- Manifest V3，僅需 `storage` 權限
- 支援 Chrome / Edge（Chromium）與 Firefox 113+
- 只作用於 `youtube.com`，不讀取其他網站
- **無遠端設定**、**無追蹤**、**無唯一識別碼**
- 使用 `timeupdate` 事件偵測廣告狀態（影片播放時觸發，每秒檢查一次），廣告面板用 2 秒輪詢
- 廣告標題從 `.ytp-ad-avatar-lockup-card__headline`、`ad-simple-attributed-string` 等取得
- 跳過按鈕模擬完整滑鼠事件序列（pointerdown → mousedown → pointerup → mouseup → click）含座標
- 統計資料儲存在本地 `chrome.storage.local`

## 檔案結構

```
skipads/
├── manifest.json          # 擴充功能資訊（依瀏覽器切換）
├── manifest-chrome.json   # Chrome/Edge 專用 manifest
├── manifest-firefox.json  # Firefox 專用 manifest
├── switch-browser.ps1     # 瀏覽器切換腳本
├── _locales/
│   ├── en/messages.json   # English 翻譯
│   └── zh/messages.json   # 繁體中文翻譯
├── icons/
│   └── icon128.png        # 擴充圖示 (128x128)
├── script/
│   ├── background.js      # Service Worker
│   └── content-script.js  # 主要廣告偵測與跳過邏輯
└── options/
    ├── options.html       # 設定頁面
    └── options.js         # 設定邏輯
```

## 版本紀錄

**v2.2** — Firefox 上架、統計修復、安全性優化
- Firefox 版本送審 AMO（支援 Firefox 142+）
- 新增 Firefox Developer Edition 手動安裝指南
- 新增 `build-firefox.ps1` XPI 打包工具
- 修復選項統計數據的渲染與設定的預設值（[#1](https://github.com/TwhomeGH/adFixTools/pull/1)）
- 修復 AMO 審查：補齊 `data_collection_permissions`、移除 `innerHTML`
- 統計歷史紀錄標題可點擊展開／收合
- 新增 `docs/build-firefox.md` 打包文件
- 新增捐款贊助資訊（PayPal / TikTok / 街口支付 / Twitch）

**v2.1** — 遞增加速 & 廣告面板收納
- 新增遞增加速模式：無法跳過的廣告自動加速 (2x→4x→6x→8x→16x→24x...)
- 新增自動收納廣告面板：收合影片下方的贊助商廣告區塊
- 更新設定頁面，支援新功能開關

**v2.0** — 完整重寫
- 移除所有遠端設定與追蹤程式碼
- 重構為 Manifest V3
- 新增多語言支援
- 新增 Toast 通知（含廣告標題）
- 精簡權限至最低需求

# Firefox XPI 打包工具

## 簡介

`build-firefox.ps1` 是一鍵打包腳本，將專案轉換為 Firefox 格式並壓縮成 `.xpi` 檔，用於上傳至 AMO 或手動安裝。

## 使用方式

```powershell
# 完整打包（切換 manifest + 複製資料夾 + 壓縮）
.\build-firefox.ps1

# 只壓縮（已執行過 switch-browser，不重新複製資料夾）
.\build-firefox.ps1 -SkipSwitch
```

## 輸出位置

執行後在專案**上一層**產生：

- `adFixTools-firefox/` — Firefox 專用資料夾
- `adFixTools-firefox.xpi` — 可直接上傳 AMO 的套件檔

## 注意事項

- 需要 PowerShell 5.1+（Windows 內建即可）
- XPI 內部路徑使用正斜線 `/`（AMO 不接受反斜線 `\`）
- 產出後可直接上傳至 [addons.mozilla.org](https://addons.mozilla.org/developers/)

# 全教網資訊科技線上課程

Vite 靜態前端讀取 Firestore 課程，以 Google 登入及 `admins/{email}` 判斷管理員。管理員可將課程加入既有 Notion 資料庫，寫入由 CF1 Worker 執行。

## 開發與測試

```powershell
npm ci
npm test
npm run dev
npm run build
```

將 `.env.example` 的設定加入本機 `.env.local`，不要覆蓋既有 Firebase 設定。開發 API 使用預覽 Worker，正式 API 使用正式 Worker。未設定 `VITE_NOTION_API_URL` 時仍可使用日曆，加入 Notion 會顯示尚未設定。

GitHub Actions 使用 repository variable `VITE_NOTION_API_URL`，Firebase 公開 Web API key 沿用 secret `VITE_FIREBASE_API_KEY`。`VITE_*` 都會進入公開前端，絕不能填入 Notion token 或服務帳戶金鑰。

## 行為

- 訪客不顯示 Notion 與刪除按鈕，登入登出立即同步已開啟視窗。
- 每次加入使用 Firebase SDK 取得當下 token，只傳課程代碼給 Worker。
- Worker 重新查驗管理員並讀取 Firestore 課程；詳見 `plan.md` 的 API 與欄位約定。
- 操作中防止連點；相同開始時間與 URL 已存在則提供該頁連結，不覆蓋。
- 不自動重送新增請求。逾時或連線中斷時，先確認 Notion 是否已新增，再手動重試。

## 發布與回復

先確認 CF1 預覽／回歸測試通過及正式後端已部署，再設定正式 API 網址與發布前端。`main` push 會啟動 GitHub Pages workflow。

回復時以 Git revert 建立新提交，重跑測試及 Pages workflow；不使用 force push。若需停用新入口，可先清空 API variable 並重建前端。CF1 後端版本回復步驟见該專案 `NOTION_EXPORT.md`。

計畫及尚未完成的部署門檻見 [plan.md](plan.md)。

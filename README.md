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
- Worker 重新查驗管理員並讀取 Firestore 課程；詳見 `docs/notion-course-export-plan.md` 的 API 與欄位約定。
- Copy 預設勾選；按 Notion 時，若勾選則同時複製課程資訊。
- 操作中防止連點；新增成功、課程已存在或失敗均以彈框告知，不在按鈕旁顯示結果或頁面連結。相同開始時間與 URL 已存在則不新增、不覆蓋。
- 不自動重送新增請求。逾時或連線中斷時，先確認 Notion 是否已新增，再手動重試。

## Firestore 課程上傳

網站直接讀取 Firestore 的 `courses` 集合，不再讀取 repository 中的 Markdown。資料擷取與上傳可獨立執行，不需要重新部署網站。

本專案的手動上傳入口為 `scripts/upload_courses.py`，支援課程 JSON 陣列或 Markdown 表格。每筆以課程 `id` 作為文件 ID，使用 merge 寫入並更新 `updatedAt`；不會刪除輸入檔未列出的課程。

在專案根目錄使用 Python 3.10 以上建立環境並安裝依賴（以下為 PowerShell）：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`requirements.txt` 固定 Firebase Admin SDK 為本機已安裝的 7.5.0；Markdown 轉換器只使用 Python 標準函式庫。`.venv/` 已排除於 Git 追蹤。

準備具有目標 Firestore 寫入權限的服務帳戶 JSON，透過 `FIREBASE_KEY_PATH` 指定位置；未指定時，上傳工具會讀取根目錄的 `firebase_key.json`。此憑證只供管理端上傳使用，不可放入 `VITE_*`、前端或 Git。

```powershell
$env:FIREBASE_KEY_PATH = 'D:\private\inspage-firebase-key.json'
.\.venv\Scripts\python.exe scripts/upload_courses.py 'D:\Jeff\myStudy\antigravity\inservicef\outputs\courselist_YYYYMMDD.json'
```

請將範例的憑證位置及 `YYYYMMDD` 換成實際值，並確認憑證所屬專案為 `inspage-a0109`。工具使用服務帳戶設定連線，不使用瀏覽器的 Firebase ID token。這個管理端上傳流程與 CF1 Worker 以管理員 ID token 讀取課程的流程不同。

如需先檢查 Markdown 轉換結果，再上傳 JSON：

```powershell
.\.venv\Scripts\python.exe scripts/parse_markdown_to_json.py 'D:\Jeff\myStudy\antigravity\inservicef\outputs\courselist_YYYYMMDD.md' 'D:\Jeff\myStudy\antigravity\inservicef\outputs\courselist_YYYYMMDD.json'
```

也可直接把 Markdown 路徑傳給 `scripts/upload_courses.py`。上傳成功後重新整理網頁即可載入資料。

## 課程輸出與歷史資料

目前課程擷取排程在另一個專案 `D:/Jeff/myStudy/antigravity/inservicef` 執行，Markdown／JSON 輸出存放於該專案的 `outputs/`，完成後上傳 Firestore。

本專案原有 `data/` 下 41 份 Markdown 已從工作目錄移除，沒有另行搬移；歷史副本仍保留在 Git 提交中，可用以下指令查看：

```powershell
git ls-tree -r --name-only 8efb695 -- data
git show 8efb695:data/courselist_20261002.md
```

這些清單是歷史查詢結果，不是完整 Firestore 備份。舊 `inservice-fetch` skill 與 `automation/Inservice_Course_Automation.ipynb` 仍有將 Markdown 發布到 `data/` 的流程，尚未改寫；目前排程已使用 Firestore 上傳流程。

`scripts/migrate_to_firestore.py` 保留為歷史遷移工具，預設讀取已移除的 `data/` 根目錄最新 10 份清單，不掃描 archive。一般更新請使用 `scripts/upload_courses.py`，不要重跑歷史遷移，以免重新加入已刪除課程或覆寫目前欄位。

## 發布與回復

依 [Notion 課程匯出計畫](docs/notion-course-export-plan.md) 的完成紀錄，前端、Worker、預覽整合、正式發布與憑證輪替均已完成；該文件保留實作計畫、歷次部署及驗證結果。

先確認 CF1 預覽／回歸測試通過及正式後端已部署，再設定正式 API 網址與發布前端。`main` push 會啟動 GitHub Pages workflow。

回復時以 Git revert 建立新提交，重跑測試及 Pages workflow；不使用 force push。若需停用新入口，可先清空 API variable 並重建前端。CF1 後端版本回復步驟見該專案 `NOTION_EXPORT.md`。

計畫及部署紀錄見 [Notion 課程匯出計畫](docs/notion-course-export-plan.md)。

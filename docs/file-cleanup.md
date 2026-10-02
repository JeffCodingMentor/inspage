# inspage 檔案整理清單

檢查日期：2026-10-02。以下清單記錄整理前的用途與建議。使用者後續授權的整理已完成：刪除 data 下 41 份受 Git 追蹤的 Markdown，將 plan.md 搬到 docs/notion-course-export-plan.md，並更新 README 連結。未刪除遷移腳本，未提交或部署。本文件末尾保留被刪除檔案的完整清單供查閱。

## Firestore 遷移後的結論

目前網站由 `main.js` 直接從 Firestore `courses` 集合讀取課程，沒有 Markdown 檔案載入或 `data/` 回退機制。GitHub Pages workflow 執行 npm 安裝、測試與 Vite 建置，只發布 `dist/`；現有建置輸出只有 HTML、JavaScript、CSS。

因此，**網站運行與部署已不需要 `data/`**。但課程擷取、歷史存檔與資料庫備份是不同用途，不能因網站不用，就認定所有歷史課程已在 Firestore 中完整保存。

已確認的外部引用：

- 目前啟用的「Inservice Fetch 每5天」排程，在 `D:/Jeff/myStudy/antigravity/inservicef` 執行 `fetch-insrvc-json-c`，產生 Markdown/JSON 並上傳 Firestore；其設定不要求寫入本專案 `data/`。
- 舊 `inservice-fetch` skill 仍明確要求將 Markdown 提交到本 GitHub repository 的 `data/`。日後若手動使用舊 skill，仍可能重新建立這個目錄。
- 本機 `automation/Inservice_Course_Automation.ipynb` 仍使用 Colab 舊流程，把 Markdown 複製到 `inspage/data/` 並推送 main；沒有確認是否還有人在 Colab 執行這份 notebook。
- 最新 `data/courselist_20261002.md` 的 Git 提交為 `8efb695`。存在近期輸出，不能把整個目錄說成長期未使用；僅由提交不能確定是哪個流程產生。

建議把歷史 Markdown 移到資料擷取專案或獨立存檔位置，再從前端 repository 移除 `data/`。同步停止使用舊發布流程，避免日後又把檔案加回來。這次未修改 skill 或排程。

## 可以清除的本機產物

以下目前均不在 Git 追蹤中，不影響已發布網站。刪除後若需本機開發，可能要重新安裝或建置。

| 路徑 | 用途 | 建議 |
| --- | --- | --- |
| `dist/` | Vite 建置輸出 | 可刪；`npm run build` 重建。GitHub Actions 自行建置，不依賴本機副本。 |
| `node_modules/` | npm 安裝依賴 | 可刪；`npm ci` 重建。若仍在開發，保留可省安裝時間。 |
| `scripts/__pycache__/` | Python 快取 | 可刪。 |
| `automation/__pycache__/` | Python 快取 | 可刪。 |

## 歷史資料及一次性程式

| 路徑 | 用途與限制 | 建議 |
| --- | --- | --- |
| `data/*.md` | 10 份課程清單 | 可移出前端 repository，先保存歷史副本。 |
| `data/archive/*.md` | 31 份較早課程清單 | 同上。全部 41 份共 119,667 bytes；不是完整 Firestore 備份。 |
| `scripts/migrate_to_firestore.py` | 一次性遷移；預設只讀 `data/` 根目錄最新 10 份，未遍歷 archive | 可移到歷史工具存檔，或在確定不再遷移後刪除。若移除 data，不能再沿用其預設輸入路徑。 |
| `automation/Inservice_Course_Automation.ipynb` | Colab 舊 GitHub Markdown 發布流程 | 若已完全採用新的 Firestore 擷取流程，可移到資料擷取專案的歷史存檔。 |
| `plan.md` | Notion 串接規劃及完成紀錄 | 不影響運行，但有交接價值；建議移到 `docs/`，更新 README 連結與完成狀態。 |

不建議重新執行歷史遷移來「確認備份」：上傳使用 merge，可能重新加入已刪除的課程或覆寫目前欄位。

## automation 目錄中的本次開發產物

2026-10-02 已依使用者指示刪除以下歷史材料與 Worker 維運工具，共 38 個檔案，包含 `worker-stage/` 內的檔案；未另外存檔。僅保留 `Inservice_Course_Automation.ipynb`。下表保留整理前的檔名供查閱；計畫中的本機 automation 截圖路徑現已不存在。

整個 `automation/` 已被 `.gitignore` 忽略，不屬於前端 runtime 或 Pages 建置。除了上面單獨列出的 notebook，其餘主要是 CF1 部署、憑證輪替與 UI 驗證留下的本機材料。

| 類型 | 完整檔案清單 | 建議 |
| --- | --- | --- |
| 舊 Worker 副本／測試 | `production-worker-snapshot.txt`、`production-worker.mjs`、`production-baseline.test.mjs`、`worker-stage/` | 移出 inspage 或刪除。CF1 才是 Worker 正式版控位置；基準測試引用的是這裡的舊副本。刪除快照前如需歷史證據，先存檔。 |
| 一次性部署／輪替工具 | `deploy-production-worker.py`、`install-worker-stage.py`、`migrate-worker-secrets.py`、`prepare-preview.py`、`rotate-line-secret.py`、`rotate-provider-token.py`、`update-worker-docs.py` | 可存檔或刪除；若需要維運用途，應先整理到 CF1 並檢查設定，不應直接重跑。 |
| 正式環境檢查 | `check-production.py`、`check-after-rotation.py` | 前者仍期待舊憑證成功，輪替後已過時。後者可留作歷史驗證，但依賴舊值與既有環境；如需長期檢查，改寫後移到 CF1。 |
| 預覽狀態 | `preview-state.json` | 本機測試狀態紀錄，可存檔或刪除；刪除此檔不會刪除 Cloudflare 預覽 Worker 或 Notion 測試資料庫。 |
| PR 文字草稿 | `ci-fix-pr-body.md`、`notion-properties-pr-body.md`、`pr-body.md`、`pr-progress-body.md`、`rotation-pr-body.md`、`ui-deploy-pr-body.md` | 可刪，或與開發紀錄一起存檔。 |
| 登入及驗證截圖 | `cloudflare-login-handoff.png`、`groq-login-handoff.png`、`groq-rotation-list.png`、`line-channel-handoff.png`、`line-rotation-handoff.png`、`line-webhook-rotation-verified.png`、`notion-actions-row-verified.png`、`notion-copy-checkbox-verified.png`、`notion-login-handoff.png`、`notion-preview-verified.png`、`notion-production-visitor.png`、`notion-rotation-verified.png`、`notion-token-handoff.png` | 可刪，或按需要保存驗證證據。 |

## 仍需保留

| 路徑 | 理由 |
| --- | --- |
| `index.html`、`main.js`、`style.css` | 網站入口、日曆、Firestore 讀取、登入及介面。 |
| `notion-actions.js` | 管理員 Notion 操作及 Copy 選項。 |
| `package.json`、`package-lock.json`、`vite.config.js` | 開發、可重現安裝、測試與 Pages 建置。Firebase 套件仍供登入使用。 |
| `.github/workflows/deploy.yml` | 正式 GitHub Pages 發布。 |
| `tests/calendar.test.js`、`tests/notion-actions.test.js` | 現行日曆與 Notion 操作回歸測試。 |
| `.gitignore`、`.env.example` | 避免提交本機產物／憑證，並提供開發設定範例。 |
| `.env.local` | 本機 Firebase／Notion API 設定，已忽略；不要當暫存檔直接刪。 |
| `scripts/upload_courses.py` | 目前可用的 Firestore 課程匯入工具，支援 JSON 或 Markdown；改用 Firestore 後仍有用途。 |
| `scripts/parse_markdown_to_json.py` | Markdown 轉 Firestore 課程 JSON；來源仍是 Markdown 時有用途，不因網站換資料庫就失效。 |
| `firebase_key.json` | Python 管理端上傳使用的服務帳戶憑證；前端不需要。可移到專用憑證位置並設定 `FIREBASE_KEY_PATH`，不可提交 Git。未讀取其內容。 |
| `README.md` | 專案說明；應更新，不應刪。 |
| `.git/` | 本機版控歷史與設定，必須保留。 |

兩個 Python 檔案各有 Markdown 解析函式，屬於重複邏輯；建議保留一個共同解析實作，讓上傳工具引用它。尚不能僅因重複就直接刪除其中一個 CLI。

## 文件與註解修正完成

- `main.js:376` 已改為從 Firestore 動態讀取課程。
- README 已說明 Notion 操作結果使用彈框、Copy 預設勾選，不提供按鈕旁的頁面連結。
- README 已對照 `docs/notion-course-export-plan.md` 說明實作、整合、發布與憑證輪替已完成。
- README 已補上 Firestore 上傳入口、Python 虛擬環境安裝、憑證設定、課程擷取輸出位置與 Git 歷史清單查閱方式；新增 `requirements.txt`，並忽略 `.venv/`。

## 建議整理順序

1. 已清除 `dist/`、`scripts/__pycache__/`、`automation/__pycache__/`；保留 `node_modules/` 供本機開發使用。
2. 已刪除 automation 歷史材料與 Worker 維運工具，共 38 個檔案；保留課程擷取 notebook，未另外保存截圖或快照。
3. 保存 data 全部歷史清單，處理仍會提交 data 的舊 skill／notebook，再從前端 repository 移除 data 與一次性遷移工具。
4. 合併 Python 重複解析邏輯，整理 README、plan 位置及過期註解。

這些建議未涉及刪除 Firestore 文件、Notion 資料、Cloudflare Worker 或任何 Git 歷史。

## data 完整檔案清單（41 份）

- `data/archive/courselist_20260408_final_report.md`
- `data/archive/courselist_20260411_final_report.md`
- `data/archive/courselist_20260413_final_report.md`
- `data/archive/courselist_20260414_final_report.md`
- `data/archive/courselist_20260416_final_report.md`
- `data/archive/courselist_20260426_final_report.md`
- `data/archive/courselist_20260429_final_report.md`
- `data/archive/courselist_20260504_final_report.md`
- `data/archive/courselist_20260507_final_report.md`
- `data/archive/courselist_20260509_final_report.md`
- `data/archive/courselist_20260513_final_report.md`
- `data/archive/courselist_20260518_final_report.md`
- `data/archive/courselist_20260523_final_report.md`
- `data/archive/courselist_20260528_final_report.md`
- `data/archive/courselist_20260602_final_report.md`
- `data/archive/courselist_20260607_final_report.md`
- `data/archive/courselist_20260611_final_report.md`
- `data/archive/courselist_20260616_final_report.md`
- `data/archive/courselist_20260621_final_report.md`
- `data/archive/courselist_20260625_final_report.md`
- `data/archive/courselist_20260630_final_report.md`
- `data/archive/courselist_20260706_final_report.md`
- `data/archive/courselist_20260711_final_report.md`
- `data/archive/courselist_20260715_final_report.md`
- `data/archive/courselist_20260719_final_report.md`
- `data/archive/courselist_20260723_final_report.md`
- `data/archive/courselist_20260728_final_report.md`
- `data/archive/courselist_20260802_final_report.md`
- `data/archive/courselist_20260806_final_report.md`
- `data/archive/courselist_20260811_final_report.md`
- `data/archive/courselist_20260815_final_report.md`
- `data/courselist_20260819_final_report.md`
- `data/courselist_20260823_final_report.md`
- `data/courselist_20260828.md`
- `data/courselist_20260902.md`
- `data/courselist_20260907.md`
- `data/courselist_20260912.md`
- `data/courselist_20260917.md`
- `data/courselist_20260922.md`
- `data/courselist_20260927.md`
- `data/courselist_20261002.md`

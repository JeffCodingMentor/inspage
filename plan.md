# 管理員新增課程至 Notion 實作計畫

## 目標與版本管理

將課程視窗 Copy 改為管理員限定「加入 Notion」，沿用 CF1 Worker 與既有「線上研習」資料庫，不啟用 Firebase 計費、不增加 Notion 欄位。

- 兩個 repository 各建立 `codex/notion-course-export` 分支，各階段獨立 commit。
- 第一階段保留既有 LINE 與排程行為；第二階段獨立處理安全修正。
- 每階段記錄測試結果；不把測試通過視為正式部署完成。

## 共用 API

`POST /api/notion/courses`，`Authorization: Bearer <Firebase ID token>`，JSON body `{ "courseId": "5484466" }`。

新增成功：HTTP 201 `{ "status": "created", "pageUrl": "https://www.notion.so/..." }`。
已存在：HTTP 200 `{ "status": "exists", "pageUrl": "https://www.notion.so/..." }`，不更新紀錄。
錯誤：`{ "error": { "code": "permission_denied", "message": "您沒有管理員權限。" } }`。
HTTP 400 請求或課程資料錯誤、401 登入無效、403 非管理員、404 課程不存在、502 外部服務失敗、503 設定或服務暫時不可用。

## A. 前端任務（inspage）

目錄：`D:/Jeff/myStudy/antigravity/inspage`

- [x] A1：Copy 改為「加入 Notion」，僅管理員顯示；登入登出同步已開啟視窗，保留收藏／課程切換／刪除。
- [x] A2：每次操作使用 `getIdToken()`，只傳 courseId；以 `VITE_NOTION_API_URL` 設定端點，未設定有明確提示。
- [x] A3：操作中禁止連點；顯示新增／已存在與 Notion 連結；失敗可手動重試、不自動重送；切換視窗後不更新錯誤課程。
- [x] A4：GitHub Actions 注入公開 API 網址；新增環境設定範例與啟動說明。
- [x] A5：測試訪客／管理員／登入登出、各種 API 結果、視窗切換、既有功能；通過 production build。

## B. Worker 任務（CF1）

目錄：`D:/Jeff/myStudy/antigravity/CF1/line-gemini-bot`

- [x] B1：先建立回歸測試，模擬外部 API；涵蓋 ping、公開 @next、LINE 授權、文字／圖片、查重與失敗、08:30／12:30／17:30 及非目標時間排程。
- [x] B2：獨立模組精確處理新 API POST／OPTIONS，其他方法 405；舊路由及函式不改行為；CORS 僅允許設定 origin，開發 origin 另外設定。
- [x] B3：驗證 token 簽章、時效、issuer、audience、已驗證 email；專案固定 inspage-a0109；email 從 token 取小寫。
- [x] B4：帶同一 token 讀取 admins/{email} 和 courses/{courseId}；非管理員拒絕，外部錯誤 fail closed；不新增服務帳戶私鑰。
- [x] B5：確認 Firestore 規則允許必要讀取，且不允許一般使用者修改管理員文件。
- [x] B6：固定 Notion 資料庫；課程＝完整名稱、時間＝台灣起訖／全天日期、URL＝線上連結或官方頁、主講＝講師、主辦＝教師研習；其他欄位不寫入。
- [x] B7：頁面內文保存課程代碼、來源、原始時間；支援 ~、～、–、—、-；時段不明只寫日期，日期無效停止寫入；URL 限 http/https，不用假網址。
- [x] B8：開始時間＋URL 去重，全天為日期＋URL；處理分頁，查詢失敗不新增；不覆蓋既有資料、不自動重試 create；日誌不含 token／金鑰。
- [x] B9：測試偽造／過期／錯專案 token、非管理員、課程不存在、分頁查重、全天與缺連結、限流及外部失敗；原回歸測試全過。

限制：相同時間／URL 的不同課程可能被判重，跨裝置同時提交仍有競態；首版不承諾全域原子去重。

## C. 整合與部署

- [x] 先完成 B1 與 Firestore 規則確認；依介面分別實作前後端。
- [x] 預覽 Worker 不綁正式 webhook、不啟用 Cron；使用相同欄位的測試 Notion 資料庫及 Secrets。
- [x] 預覽實測登入、權限、新增、重複與錯誤情境。
- [ ] 保留 Worker／前端版本，先部署後端驗證既有功能，再發布前端。
- [x] 記錄回復方式；回復程式不撤銷已寫入資料或已送出訊息，不自動刪除正式紀錄。

## D. 第二階段：CF1 安全修正（分開測試與部署）

- [ ] LINE 簽章失敗回 401，合法事件仍成功。
- [ ] 停用公開手動排程入口，正常 Cron 不變。
- [ ] 金鑰移至 Worker Secrets，驗證 LINE／Groq／Notion；輪替受 Git 追蹤過的金鑰，不重寫歷史。

第一階段的新路由驗證不會修復既有路由問題。

## 階段紀錄

- 初始狀態：兩個專案工作目錄乾淨，分支均為 main；尚未執行新功能或正式部署。


### 2026-10-01：第一階段實作與預覽

- inspage：計畫提交 `98e59ca`、前端提交 `0a2c628`；15 項 Node/jsdom 測試及 Vite production build 通過。
- CF1：原功能基準提交 `f690f1d`（16 項測試）、新 API 提交 `bf34f77`（合計 36 項測試）、預覽及文件提交 `eb537ba`。
- 從 Cloudflare 下載的正式 Worker 程式另行通過同一套 16 項基準測試；未改正式 Worker。
- 正式 Worker 回復基準版本：`39fafc41-0075-4aa3-81b0-49d7ed55c170`。
- Firestore 正式規則已唯讀確認：courses 公開讀取；admins 僅本人可讀、用戶端不可寫。
- 預覽 API：`https://inspage-notion-preview.jefffang-edu.workers.dev/api/notion/courses`。
- 預覽僅新 API，沒有 LINE 入口或 Cron。線上 OPTIONS 204、未登入 401、錯誤 origin 403、偽造 token 401、/test 404 均符合預期。
- 已經使用者明確授權，建立隔離測試資料庫並將 Notion 金鑰與測試 database ID 設為預覽 Worker Secrets。
- 測試資料庫：`https://app.notion.com/p/3ec3e0d38baf81b2aeeaf2155a912d3f`（正式資料庫未測試寫入）。
- 瀏覽器已確認訪客課程視窗不顯示 Notion／刪除按鈕；127.0.0.1 未獲 Firebase 授權，經使用者明確同意切換 localhost 測試。
- 尚待：實際 Google 管理員登入與完整新增／重複驗證、正式發布、第二階段獨立安全修正與金鑰輪替。

- 瀏覽器實際 Google 管理員登入通過。已修正 Cloudflare 不支援 redirect:error 的問題，改用 manual 並拒絕 3xx；新增回歸測試後 Worker 共 38 項通過。
- 隔離資料庫新增與再次查重通過，API readback 確認僅一筆、時間 2026-10-02 09:00–12:00 +08:00、講師與 URL 及內文來源正確。
- 預覽相容日期已與正式環境 2023-12-01 對齊，實際查重仍通過。畫面證據保存在本機忽略目錄 automation/notion-preview-verified.png。

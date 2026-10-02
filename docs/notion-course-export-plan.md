# 管理員新增課程至 Notion 實作計畫

## 目標與版本管理

在課程視窗加入管理員限定 Notion 寫入功能，Copy 選項預設勾選，沿用 CF1 Worker 與既有「線上研習」資料庫，不啟用 Firebase 計費、不增加 Notion 欄位。

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

- [x] A1：Notion 寫入按鈕與預設勾選的 Copy 選項僅管理員顯示；登入登出同步已開啟視窗，保留收藏／課程切換／刪除。
- [x] A2：每次操作使用 `getIdToken()`，只傳 courseId；以 `VITE_NOTION_API_URL` 設定端點，未設定以彈框提示。
- [x] A3：操作中禁止連點；以彈框顯示新增／已存在及錯誤結果，不在按鈕旁顯示狀態；失敗可手動重試、不自動重送；切換視窗後不彈出錯誤課程結果。
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
- [x] B7：支援 ~、～、–、—、-；時段不明只寫日期，日期無效停止寫入；URL 限 http/https，不用假網址。Notion 頁面只寫資料庫 properties，不加課程代碼、來源或原始時間內文。
- [x] B8：開始時間＋URL 去重，全天為日期＋URL；處理分頁，查詢失敗不新增；不覆蓋既有資料、不自動重試 create；日誌不含 token／金鑰。
- [x] B9：測試偽造／過期／錯專案 token、非管理員、課程不存在、分頁查重、全天與缺連結、限流及外部失敗；原回歸測試全過。

限制：相同時間／URL 的不同課程可能被判重，跨裝置同時提交仍有競態；首版不承諾全域原子去重。

## C. 整合與部署

- [x] 先完成 B1 與 Firestore 規則確認；依介面分別實作前後端。
- [x] 預覽 Worker 不綁正式 webhook、不啟用 Cron；使用相同欄位的測試 Notion 資料庫及 Secrets。
- [x] 預覽實測登入、權限、新增、重複與錯誤情境。
- [x] 保留 Worker／前端版本，先部署後端驗證既有功能，再發布前端。
- [x] 記錄回復方式；回復程式不撤銷已寫入資料或已送出訊息，不自動刪除正式紀錄。

## D. 第二階段：CF1 安全修正（分開測試與部署）

- [x] LINE 簽章失敗回 401，合法事件仍成功。
- [x] 停用公開手動排程入口，正常 Cron 不變。
- [x] 金鑰移至 Worker Secrets，驗證 LINE／Groq／Notion。
- [x] 輪替受 Git 追蹤過的金鑰，不重寫歷史；提供者控制台的新憑證操作需帳號擁有者接手完成。

輪替進度：

- [x] LINE_CHANNEL_SECRET：帳號擁有者重新發行；更新正式 Secrets 後，新簽章 200、舊簽章 401，LINE 控制台 Verify 顯示 Success。暫存憑證已刪除。
- [x] LINE_CHANNEL_ACCESS_TOKEN：帳號擁有者重新發行後更新正式 Secrets；新 token 正確對應 Bot @201mqjsx，讀取資訊 200。以 LINE 官方撤銷 API 停用舊 token 後，舊值 401、新值仍 200，暫存憑證已刪除。
- [x] GROQ_API_KEY：新金鑰 CF1-LineBot-20261001 已更新正式 Secrets，唯讀 API 回 200；帳號擁有者停用舊金鑰後，已確認 Git 歷史中的舊值回 401。暫存憑證已刪除。
- [x] NOTION_API_KEY：帳號擁有者在 LineBot 整合輪替新值；正式／隔離資料庫唯讀驗證均 200，Git 舊值 401。透過外部瀏覽器完成縮限權限的 Wrangler OAuth 後，已同步正式與預覽 Worker Secrets，暫存金鑰檔已刪除。管理員預覽新增課程 5684991 成功，再次加入顯示已存在並指向相同 Notion 頁面。

第一階段的新路由驗證不會修復既有路由問題。

## 階段紀錄

- 初始狀態：兩個專案工作目錄乾淨，分支均為 main；尚未執行新功能或正式部署。


### 2026-10-01：第一階段實作與預覽

- inspage：計畫提交 `98e59ca`、前端提交 `0a2c628`；15 項 Node/jsdom 測試及 Vite production build 通過。
- CF1：原功能基準提交 `f690f1d`（16 項測試）、新 API 提交 `bf34f77`（合計 36 項測試）、預覽及文件提交 `eb537ba`。
- 部署前從 Cloudflare 下載的正式 Worker 程式另行通過同一套 16 項基準測試。
- 正式 Worker 回復基準版本：`39fafc41-0075-4aa3-81b0-49d7ed55c170`。
- Firestore 正式規則已唯讀確認：courses 公開讀取；admins 僅本人可讀、用戶端不可寫。
- 預覽 API：`https://inspage-notion-preview.jefffang-edu.workers.dev/api/notion/courses`。
- 預覽僅新 API，沒有 LINE 入口或 Cron。線上 OPTIONS 204、未登入 401、錯誤 origin 403、偽造 token 401、/test 404 均符合預期。
- 已經使用者明確授權，建立隔離測試資料庫並將 Notion 金鑰與測試 database ID 設為預覽 Worker Secrets。
- 測試資料庫：`https://app.notion.com/p/3ec3e0d38baf81b2aeeaf2155a912d3f`（正式資料庫未測試寫入）。
- 瀏覽器已確認訪客課程視窗不顯示 Notion／刪除按鈕；127.0.0.1 未獲 Firebase 授權，經使用者明確同意切換 localhost 測試。
- 當時待辦的 Google 管理員登入與完整新增／重複驗證已完成，結果如下。

- 瀏覽器實際 Google 管理員登入通過。已修正 Cloudflare 不支援 redirect:error 的問題，改用 manual 並拒絕 3xx；新增回歸測試後 Worker 共 38 項通過。
- 隔離資料庫新增與再次查重通過，API readback 確認僅一筆、時間 2026-10-02 09:00–12:00 +08:00、講師與 URL 及內文來源正確。
- 預覽相容日期已與正式環境 2023-12-01 對齊，實際查重仍通過。畫面證據保存在本機忽略目錄 automation/notion-preview-verified.png。

### 2026-10-01：第一階段發布與第二階段準備

- CF1 提交 `3570a41` 已部署為正式 Worker 版本 `5f827270-ce17-473e-aa29-1d61cf007a88`；原 Cron 保留。正式端點健康檢查、允許 origin 的 OPTIONS 204、未登入 POST 401 通過。
- 前端提交 `be02771` 已透過 PR https://github.com/JeffCodingMentor/inspage/pull/1 合併；GitHub Actions 變數已設定正式 API 網址。其後已確認合併提交 `137c6c7` 的 Pages 工作流程 https://github.com/JeffCodingMentor/inspage/actions/runs/36838496234 成功，正式 JS 使用正式 API、未含預覽端點。
- 第二階段僅在隔離副本準備修正：LINE 簽章失敗在解析與背景工作之前回 401；原含 test 路徑的手動排程入口回 404；平台 Cron 與新課程 API 路由保留。
- 修正前 16 項針對入口的測試中，15 項失敗、合法空事件驗證通過；修正後新增至 22 項入口測試，加上原 38 項測試，共 60 項通過。`node --check src/worker.js` 通過；所有外部服務在此階段均使用 mock。
- 候選 patch 與測試紀錄保存於 `C:/Users/jcfan/.codex/state/plugins/codex-security/scans/line-gemini-bot/artifacts-0927c7c5dd0846ca3b831042fc1e386e675e955f4fb6b7831bbf5bd547161797/artifacts/phase2/`。
- 獨立唯讀審查未發現具體繞過或回歸；審查者另行重跑 60 項測試全部通過。
- 自動核准審查曾因用量額度不足而中斷；使用者再次要求繼續後已恢復，後續發布與驗證如下。

### 2026-10-01：第二階段正式部署

- CF1 `84e3764`：恢復 LINE 簽章拒絕並停用手動排程；套用後完整 60 項測試與語法檢查通過。部署版本 `670dcac9-05cc-437c-bbe5-356d34e762e7`。
- CF1 `7728112`：將 LINE_CHANNEL_ACCESS_TOKEN、LINE_CHANNEL_SECRET、GROQ_API_KEY、NOTION_API_KEY 移至 Cloudflare Secrets；移除 wrangler.toml 明文值、忽略本機憑證檔、更新操作與回復文件。工作目錄乾淨。
- 使用清理後設定重新部署成功，正式版本 `e8523224-01d1-438b-b7c6-65b286b0ef62`；Cron 仍為 `30 * * * *`。部署後 API readback 確認四組 secret_text 與兩組非敏感 vars，沒有遺失 Secrets。
- 正式線上檢查通過：健康頁 200、無簽章與未授權課程請求 401、簽章合法空事件 200、原手動入口 GET／POST 404、正式 CORS 204、本機 origin 403。沒有送出 LINE 訊息或測試寫入正式 Notion。
- LINE bot info、Groq models、Notion 正式 database 的唯讀金鑰驗證均 200；目前 Git 追蹤檔案已不含這四組完整金鑰值，但歷史仍保留，尚須輪替。
- 正式網站瀏覽器訪客視窗確認不顯示 Notion 與刪除按鈕，畫面保存在本機忽略目錄 automation/notion-production-visitor.png。
- 此階段當時未完成項目（已於下方輪替紀錄完成）：輪替提供者端既有金鑰，更新正式 Secrets 及預覽的 NOTION_API_KEY，驗證新值並停用舊值。瀏覽器操作規則要求帳號擁有者接手憑證變更；新值不要貼到聊天或提交 Git。


### 2026-10-01：憑證輪替完成與最終驗證

- LINE channel secret、LINE access token、Groq、Notion 四組憑證均已輪替並更新正式 Worker；Notion 同時更新隔離預覽 Worker。舊 HMAC 與三項提供者 API 憑證均再次確認 401；新值先前分別通過提供者驗證。LINE 平台 webhook Verify 已確認 Success。
- Cloudflare 原登入過期，內置瀏覽器無法登入；改由系統預設外部瀏覽器完成 Wrangler OAuth。僅申請 account:read、user:read、workers_scripts:write，Wrangler 自動加入 offline_access。兩個 Worker 的 NOTION_API_KEY 更新皆成功，服務已恢復；無待同步金鑰。
- 新 Notion token 讀取正式及隔離資料庫均 200。隔離预覽管理員新增課程 5684991 成功，再次點擊顯示「此課程已存在」，兩次結果為同一頁面 3ec3e0d3-8baf-8136-9b71-d1b23577097b。測試只寫隔離資料庫。畫面：automation/notion-rotation-verified.png（本機忽略）。
- 最終線上檢查通過：健康頁 200；無簽章／舊簽章／未登入課程請求 401；原手動入口 404；正式 origin OPTIONS 204、本機 origin 403；發布 JS 使用正式 API。Cloudflare 唯讀確認正式四組憑證及預覽 Notion 憑證均為 secret_text，Cron 保持 30 * * * *。
- 前端 15 項測試及 production build、Worker 60 項測試均已通過；此收尾階段僅更新 Secrets 與文件，沒有改動程式碼。未實際發送 LINE 訊息；完整 LINE／Groq 流程由 mock 回歸測試涵蓋，線上以簽章空事件與提供者唯讀 API 驗證。
- 所有輪替暫存憑證檔已刪除；Git 歷史保留但其中舊值已失效。保留隔離測試資料庫與測試紀錄供追溯。

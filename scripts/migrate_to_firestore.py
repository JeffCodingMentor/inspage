"""
migrate_to_firestore.py
一次性歷史遷移腳本：
掃描 data/ 目錄中最新的 10 份 Markdown 檔案，解析後批次匯入 Firestore 的 courses 集合。
"""

import os
import sys
import glob
from upload_courses import parse_markdown_to_json, upload_courses_to_firestore, DEFAULT_KEY_PATH

# 確保在 Windows 環境下的終端機輸出能正確支援 UTF-8
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def run_migration(data_dir: str = "data", max_files: int = 10, key_path: str = DEFAULT_KEY_PATH):
    print("=" * 60)
    print("🚀 開始執行歷史課程資料遷移至 Firebase Firestore...")
    print("=" * 60)

    # 1. 取得 data/ 下的 markdown 檔案並排序（最新優先）
    md_files = sorted(glob.glob(os.path.join(data_dir, "*.md")), reverse=True)
    if not md_files:
        print(f"❌ 在 {data_dir} 中找不到任何 .md 檔案！")
        return

    target_files = md_files[:max_files]
    print(f"📁 預計處理最新 {len(target_files)} 份檔案：")
    for f in target_files:
        print(f"  - {os.path.basename(f)}")

    # 2. 解析並彙整（同一課程以最新出現為主去重）
    courses_map = {}
    total_parsed = 0

    # 由舊到新讀取，這樣較新的檔案資料會覆蓋較舊的
    for file_path in reversed(target_files):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        courses = parse_markdown_to_json(content)
        total_parsed += len(courses)
        for c in courses:
            courses_map[c["id"]] = c

    deduped_courses = list(courses_map.values())
    print("-" * 60)
    print(f"📊 解析總筆數：{total_parsed} 筆，去重後獨立課程數：{len(deduped_courses)} 筆")
    print("-" * 60)

    # 3. 檢查金鑰並上傳
    if not os.path.exists(key_path):
        print(f"⚠️ 找不到金鑰檔案：{key_path}")
        print("請將 Firebase Service Account 金鑰放置於專案根目錄（或指定 FIREBASE_KEY_PATH）後再執行。")
        return

    print("📤 正在將課程寫入 Firestore 'courses' 集合...")
    upload_courses_to_firestore(deduped_courses, key_path=key_path)
    print("=" * 60)
    print("✅ 歷史資料遷移作業完成！")
    print("=" * 60)

if __name__ == "__main__":
    run_migration()

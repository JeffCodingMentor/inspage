"""
upload_courses.py
提供課程資料解析與 Firestore 批次上傳之通用模組。
可由外部排程腳本直接 import 使用，或以 CLI 模式執行。
"""

import os
import re
import sys
import json
import firebase_admin
from firebase_admin import credentials, firestore

DEFAULT_KEY_PATH = os.environ.get("FIREBASE_KEY_PATH", "firebase_key.json")

def init_firestore(key_path: str = DEFAULT_KEY_PATH):
    """初始化 Firebase Admin SDK 並回傳 Firestore 客戶端實例"""
    if not firebase_admin._apps:
        if not os.path.exists(key_path):
            raise FileNotFoundError(
                f"找不到 Firebase 金鑰檔案：{key_path}\n"
                "請確認金鑰已放置於該路徑，或設定環境變數 FIREBASE_KEY_PATH。"
            )
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()

def parse_markdown_to_json(md_content: str) -> list[dict]:
    """
    解析全國教師在職進修資訊網 Markdown 格式課程表格為結構化字典列表。
    
    :param md_content: Markdown 格式文本內容
    :return: 課程字典列表 [ { "id": "...", "name": "...", "dateStr": "...", ... }, ... ]
    """
    courses = []
    lines = md_content.splitlines()
    in_table = False
    
    for line in lines:
        trimmed = line.strip()
        if not trimmed:
            in_table = False
            continue
        
        # 1. 偵測表格標頭
        if "課程代碼" in trimmed and "|" in trimmed:
            in_table = True
            continue
            
        # 2. 跳過 Markdown 表格分隔線
        if in_table and ("---" in trimmed):
            continue
            
        # 3. 解析表格資料列
        if in_table and trimmed.startswith("|"):
            parts = [c.strip() for c in trimmed.strip("|").split("|")]
            if len(parts) >= 5:
                col_id, col_name, col_time, col_link, col_speaker = parts[:5]
                col_name = col_name.replace("**", "").strip()
                col_time = col_time.replace("**", "").strip()
                
                # 萃取課程代碼 (id) 與官方頁面連結 (sourceUrl)
                id_match = re.search(r"\[(\d+)\](?:\((https?://[^\)]+)\))?", col_id)
                if id_match:
                    course_id = id_match.group(1)
                    source_url = id_match.group(2) or f"https://www2.inservice.edu.tw/NAPP/CourseView.aspx?cid={course_id}"
                else:
                    digits = re.search(r"(\d{6,8})", col_id)
                    if not digits:
                        continue
                    course_id = digits.group(1)
                    source_url = f"https://www2.inservice.edu.tw/NAPP/CourseView.aspx?cid={course_id}"
                
                # 正規化日期為 YYYY/MM/DD 格式
                date_str = ""
                date_match = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", col_time)
                if date_match:
                    yyyy, mm, dd = date_match.groups()
                    date_str = f"{yyyy}/{int(mm):02d}/{int(dd):02d}"
                
                # 萃取時段與開始時間
                time_range_match = re.search(r"(\d{1,2}:\d{2}\s*~\s*\d{1,2}:\d{2})", col_time)
                time_range = time_range_match.group(1).strip() if time_range_match else ""
                
                start_time_match = re.search(r"(\d{1,2}:\d{2})", time_range or col_time)
                start_time = ""
                if start_time_match:
                    sh, sm = start_time_match.group(1).split(":")
                    start_time = f"{int(sh):02d}:{sm}"
                
                # 萃取 Google Meet 視訊連結
                raw_link = ""
                link_match = re.search(r"\((https?://[^\)]+)\)", col_link) or re.search(r"(https?://[^\s\)]+)", col_link)
                if link_match:
                    raw_link = link_match.group(1)
                elif "meet.google.com" in col_link:
                    meet_m = re.search(r"(meet\.google\.com/[a-z0-9-]+)", col_link)
                    if meet_m:
                        raw_link = f"https://{meet_m.group(1)}"
                
                courses.append({
                    "id": course_id,
                    "name": col_name,
                    "rawTime": col_time,
                    "dateStr": date_str,
                    "startTime": start_time,
                    "timeRange": time_range,
                    "meetLink": col_link,
                    "rawLink": raw_link,
                    "speaker": col_speaker,
                    "sourceUrl": source_url
                })
                
    return courses

def upload_courses_to_firestore(courses: list[dict], key_path: str = DEFAULT_KEY_PATH) -> int:
    """
    將課程字典列表批量寫入/更新至 Firestore 的 'courses' 集合中。
    以 course['id'] 作為 Document ID 進行 Merge Upsert，天然去重。
    
    :param courses: 課程字典列表 [ { "id": "...", "name": "...", ... }, ... ]
    :param key_path: Service Account JSON 金鑰檔案路徑
    :return: 成功處理的課程筆數
    """
    if not courses:
        print("ℹ️ 沒有任何課程資料需要上傳。")
        return 0

    db = init_firestore(key_path)
    batch = db.batch()
    count = 0
    total = len(courses)

    for course in courses:
        course_id = str(course.get("id", "")).strip()
        if not course_id:
            continue
        
        doc_ref = db.collection("courses").document(course_id)
        # 合併伺服端更新時間戳記
        data = {**course, "updatedAt": firestore.SERVER_TIMESTAMP}
        batch.set(doc_ref, data, merge=True)
        count += 1

        # Firestore Batch 單次寫入上限 500 筆
        if count % 500 == 0:
            batch.commit()
            batch = db.batch()

    if count % 500 != 0:
        batch.commit()

    print(f"🎉 成功寫入/更新 {count} / {total} 筆課程至 Firestore！")
    return count

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_path = sys.argv[1]
        if not os.path.exists(target_path):
            print(f"❌ 找不到目標檔案：{target_path}")
            sys.exit(1)
        
        with open(target_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        if target_path.endswith(".json"):
            courses_data = json.loads(content)
        else:
            courses_data = parse_markdown_to_json(content)
            
        print(f"成功解析 {len(courses_data)} 門課程，正在上傳至 Firestore...")
        upload_courses_to_firestore(courses_data)
    else:
        print("使用方式：python upload_courses.py <markdown_or_json_file>")

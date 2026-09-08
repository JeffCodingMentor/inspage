"""
parse_markdown_to_json.py
專門負責解析全國教師在職進修資訊網 Markdown 格式課程表格為標準 JSON / 字典列表的獨立模組。
可直接以 CLI 執行進行檔案轉換，或由其他自動化排程腳本 import 使用。
"""

import re
import sys
import json
import os

# 確保在 Windows 環境下的終端機輸出能正確支援 UTF-8
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def parse_markdown_to_json(md_content: str) -> list[dict]:
    """
    解析 Markdown 格式課程表格為結構化字典列表。
    
    :param md_content: Markdown 文本字串
    :return: 結構化課程列表 [ { "id": ..., "name": ..., "dateStr": ... }, ... ]
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
            
        # 2. 跳過分隔線 (| :--- | :--- | ...)
        if in_table and ("---" in trimmed):
            continue
            
        # 3. 解析表格資料列
        if in_table and trimmed.startswith("|"):
            parts = [c.strip() for c in trimmed.strip("|").split("|")]
            if len(parts) >= 5:
                col_id, col_name, col_time, col_link, col_speaker = parts[:5]
                
                # 清理 Markdown 加粗標記 (**)
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
                        continue  # 非有效課程代碼列，略過
                    course_id = digits.group(1)
                    source_url = f"https://www2.inservice.edu.tw/NAPP/CourseView.aspx?cid={course_id}"
                
                # 正規化日期為 YYYY/MM/DD 格式
                date_str = ""
                date_match = re.search(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", col_time)
                if date_match:
                    yyyy, mm, dd = date_match.groups()
                    date_str = f"{yyyy}/{int(mm):02d}/{int(dd):02d}"
                
                # 萃取時段 (如 08:45~12:00) 與開始時間 (如 08:45)
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

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("使用方式：python parse_markdown_to_json.py <輸入 markdown 檔案路徑> [輸出 json 檔案路徑]")
        print("範例：python parse_markdown_to_json.py data/courselist_20260927.md output.json")
        sys.exit(0)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(input_file):
        print(f"❌ 找不到輸入檔案：{input_file}")
        sys.exit(1)

    with open(input_file, "r", encoding="utf-8") as f:
        md_text = f.read()

    result = parse_markdown_to_json(md_text)
    print(f"✅ 成功解析 {len(result)} 門課程！")

    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"📁 已將 JSON 結果儲存至：{output_file}")
    else:
        # 印出第 1 筆預覽
        if result:
            print("\n--- 預覽第 1 筆資料結構 ---")
            print(json.dumps(result[0], ensure_ascii=False, indent=2))

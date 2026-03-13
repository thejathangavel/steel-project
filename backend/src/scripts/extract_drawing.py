import sys
import os
import json
import argparse
import re
import traceback
from typing import Optional, Dict, Any, List

# --- Dependency handling ---
try:
    from pydantic import BaseModel, Field
except ImportError:
    class Field:
        def __init__(self, default=None, **kwargs): self.default = default
    class BaseModel:
        def __init__(self, **kwargs):
            for k, v in kwargs.items(): setattr(self, k, v)
        @classmethod
        def parse_obj(cls, obj): return cls(**obj)

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

# --- Minimal Helpers (No large hardcoded keyword lists) ---

def normalize_date(d: Any) -> str:
    if not d: return ""
    ds = str(d).strip().replace("/", "-").replace(".", "-")
    
    # Textual MMM DD YYYY
    m1 = re.search(r'([A-Z]{3,})\s+(\d{1,2})[\s,]+(\d{4})', ds, re.I)
    if m1:
        months = {'JAN':'01','FEB':'02','MAR':'03','APR':'04','MAY':'05','JUN':'06',
                  'JUL':'07','AUG':'08','SEP':'09','OCT':'10','NOV':'11','DEC':'12'}
        ma = m1.group(1)[:3].upper()
        if ma in months:
            try: return f"{int(m1.group(2)):02d}-{months[ma]}-{m1.group(3)}"
            except: pass
    
    # DD MMM YYYY
    m2 = re.search(r'(\d{1,2})\s+([A-Z]{3,})[\s,]+(\d{4})', ds, re.I)
    if m2:
        months = {'JAN':'01','FEB':'02','MAR':'03','APR':'04','MAY':'05','JUN':'06',
                  'JUL':'07','AUG':'08','SEP':'09','OCT':'10','NOV':'11','DEC':'12'}
        ma = m2.group(2)[:3].upper()
        if ma in months:
            try: return f"{int(m2.group(1)):02d}-{months[ma]}-{m2.group(3)}"
            except: pass

    # Numeric DD-MM-YYYY
    m3 = re.search(r'(\d{1,2})[-/\.](\d{1,2})[-/\.](\d{2,4})', ds)
    if m3:
        p1, p2, p3 = m3.group(1), m3.group(2), m3.group(3)
        if len(p3) == 2: p3 = "20" + p3
        try: return f"{int(p1):02d}-{int(p2):02d}-{p3}"
        except: pass

    return ds

def get_date_score(d: str) -> str:
    """Standardizes date to YYYYMMDD for sorting."""
    if not d: return "00000000"
    m = re.search(r'(\d+)[-/](\d+)[-/](\d+)', d)
    if not m: return "00000000"
    try:
        p1, p2, p3 = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if p1 > 1900: y, mo, da = p1, p2, p3 # YYYY-MM-DD
        elif p3 > 1900:
            y = p3
            if p2 > 12: mo, da = p1, p2 # p1=MM, p2=DD
            else: mo, da = p2, p1 # default to DD-MM (international)
        else:
            y = p3 + 2000
            if p2 > 12: mo, da = p1, p2
            else: mo, da = p2, p1
        return f"{y:04d}{int(mo):02d}{int(da):02d}"
    except: return "00000000"

def clean_text(t: Any) -> str:
    if not t: return ""
    return re.sub(r'\s+', ' ', str(t)).strip()

def is_date_pattern(t: str) -> bool:
    """Checks if a string contains a date-like pattern (handles numeric and MMM DD YYYY)."""
    if not t: return False
    s_val = str(t).strip()
    if len(s_val) > 40: return False
    # Numeric dates: DD-MM-YYYY, YYYY-MM-DD, etc.
    p1 = r'\b(?:\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})\b'
    p2 = r'\b(?:\d{4}[-/\.]\d{1,2}[-/\.]\d{1,2})\b'
    # Textual dates: Jun 11 2025, 11 Jun 2025
    p3 = r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b'
    p4 = r'\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b'
    return bool(re.search(p1, s_val) or re.search(p2, s_val) or 
                re.search(p3, s_val, re.I) or re.search(p4, s_val, re.I))

# --- Core logic ---
def extract_locally(pdf_path: str, hint_fn: str = "") -> Dict[str, Any]:
    res: Dict[str, Any] = {
        "drawingNumber": "", "drawingTitle": "", "description": "Local",
        "drawingDescription": "", "revision": "0", "date": "", "remarks": "",
        "revisionHistory": []
    }
    
    try: import fitz
    except ImportError: fitz = None

    full_text = ""
    blocks: List[Any] = []
    w, h = 800.0, 600.0
    
    if fitz:
        try:
            with fitz.open(pdf_path) as doc:
                if len(doc) > 0:
                    p = doc[0]
                    full_text = p.get_text("text")
                    blocks = p.get_text("blocks")
                    w, h = float(p.rect.width), float(p.rect.height)
        except: pass

    if (not full_text or len(full_text) < 50) and pdfplumber:
        try:
            with pdfplumber.open(pdf_path) as pdf_doc: # type: ignore
                if pdf_doc.pages:
                    page = pdf_doc.pages[0]
                    full_text = page.extract_text(layout=True) or ""
                    w, h = float(page.width), float(page.height)
        except: pass

    if not full_text: return res

    # 1. Sheet Number - Prioritize Filename and Proximity
    fn = hint_fn or os.path.basename(pdf_path)
    fn_body = re.sub(r'\.pdf$', '', fn, flags=re.I)
    
    # Heuristic for sheet number in filename
    if re.search(r'[A-Z0-9]{3,}', fn_body):
        # Handle prepended timestamp (e.g. 123456789_06C1012_0)
        potential_parts = [p for p in fn_body.split('_') if not p.isdigit() or len(p) < 10]
        if potential_parts:
            res["drawingNumber"] = potential_parts[0].strip()
            if len(potential_parts) > 1 and 1 <= len(potential_parts[1]) <= 3: 
                res["revision"] = potential_parts[1].strip()
        else:
            res["drawingNumber"] = fn_body

    # Text-based labels (dynamic, not hardcoded list)
    m_dn = re.search(r'(?:DWG|Sheet|Drawing|Number)\s*(?:NO|#)?\s*[:.\s]*([A-Z0-9\-_]{2,20})', full_text, re.I)
    if m_dn:
        val = m_dn.group(1).strip()
        if not is_date_pattern(val):
            res["drawingNumber"] = val

    # 1b. Remarks/Status in title block area
    m_rem_tb = re.search(r'(?:REMARKS|STATUS|NOTE[S]?)\s*[:.\s]*([A-Z\s0-9\-_]{2,50})', full_text, re.I)
    if m_rem_tb:
        rem_val = m_rem_tb.group(1).strip()
        if len(rem_val) > 1 and not is_date_pattern(rem_val):
            res["remarks"] = rem_val

    # 2. Drawing Title - Look for prominent text in title block area
    if blocks:
        # Title block is usually bottom-right, but can be larger
        candidates = []
        for blk in blocks:
            if len(blk) < 5: continue
            x0, y0, x1, y1, txt = blk[0], blk[1], blk[2], blk[3], blk[4]
            # Expanding heuristic: title is often in the bottom-right half
            if x0 > w * 0.2 and y0 > h * 0.3:
                ct = clean_text(txt)
                if len(ct) > 4 and not is_date_pattern(ct):
                    # Blacklist for labels and noise
                    blacklist = [r'^NO[\s\.:]*PROJ', r'NOT\s+FOR\s+CONSTRUCTION', r'DRAWING\s*NO', r'PROJECT\s*NAME', r'CLIENT\s*NAME']
                    if any(re.search(b, ct, re.I) for b in blacklist): continue
                    
                    # Exclude common labels and short codes
                    if not re.match(r'^[A-Z\s]{3,20}:$', ct):
                        # Multi-part titles usually have spaces
                        score = (float(y1)/h) + (float(x1)/w)
                        # Preference for text with spaces (titles) over single words (ids)
                        if ' ' in ct: score += 1.2
                        # Preference for mostly alphabetic over numeric
                        if re.search(r'[A-Z]{4,}', ct): score += 0.8
                        # Length preference (most titles are 8-30 chars)
                        if 8 < len(ct) < 40: score += 0.5
                        
                        candidates.append({"v": ct, "s": score})
        
        if candidates:
            # Sort by score (bottom-right-ness + heuristic)
            candidates.sort(key=lambda x: x["s"], reverse=True)
            res["drawingTitle"] = candidates[0]["v"]

    # 3. Revision History - Dynamic detection by column content
    rh: List[Dict[str, str]] = []
    
    def _add(m: str, d: str, r: str):
        mk = re.sub(r'^REV[\s\-_]*', '', str(m).strip(), flags=re.I).strip().upper()
        if not mk or len(mk) > 3: return
        nd = normalize_date(d)
        nr = clean_text(r)
        if any(h["mark"] == mk and h["date"] == nd and h["remarks"] == nr for h in rh): return
        rh.append({"mark": mk, "date": nd, "remarks": nr})

    if pdfplumber:
        try:
            with pdfplumber.open(pdf_path) as pdf_doc: # type: ignore
                p0 = pdf_doc.pages[0]
                tbls = p0.extract_tables() or []
                
                best_tbl = None
                best_score = -1
                best_cols = (-1, -1, -1) # mark, date, desc

                # best_tbls = [] # This variable was not used in the original snippet, keeping it commented out.
                for tbl in tbls:
                    if not tbl or len(tbl) < 2 or not tbl[0]: continue
                    num_cols = len(tbl[0])
                    
                    # 1. Broad header & content analysis
                    col_dates = [0] * num_cols
                    col_marks = [0] * num_cols
                    col_descs = [0] * num_cols
                    col_htypes = [""] * num_cols
                    
                    for row in tbl:
                        for j in range(min(num_cols, len(row))):
                            cell_val = row[j]
                            v = str(cell_val or '').strip().upper()
                            if not v: continue
                            if is_date_pattern(v): col_dates[j] += 1
                            elif len(v) <= 3: col_marks[j] += 1
                            elif len(v) > 3: col_descs[j] += 1
                            
                            # Header detection (can be in any row)
                            if any(x == v for x in ["REV", "REV.", "REV#", "REVISION", "MK", "REV-NO"]): col_htypes[j] = "mark"
                            elif "DATE" in v and len(v) < 15: col_htypes[j] = "date"
                            elif "REMARKS" in v: col_htypes[j] = "rem"
                            elif any(x in v for x in ["DESCRIPTION", "DESC", "REVISIONS"]): col_htypes[j] = "desc"

                    # 2. Score the table
                    has_rev_headers = any(t in ["mark", "date"] for t in col_htypes)
                    tbl_score: int = sum(col_dates) * 10
                    if any(t == "mark" for t in col_htypes): tbl_score += 30
                    if any(t == "date" for t in col_htypes): tbl_score += 30
                    
                    # Penalize BOM only if no revision headers
                    if not has_rev_headers:
                        has_bom = False
                        for r_idx in range(min(5, len(tbl))):
                            r = tbl[r_idx]
                            for c in r:
                                v_bom = str(c or '').upper()
                                if any(bk in v_bom for bk in ["WEIGHT", "MATERIAL", "LENGTH", "QTY", "BOM", "PIECE"]):
                                    has_bom = True; break
                        if has_bom: tbl_score -= 100
                    else:
                        tbl_score += 20 # Bonus for having headers

                    if tbl_score > 40:
                        # 3. Identify best columns
                        c_date: int = -1
                        for j in range(num_cols):
                            if col_htypes[j] == "date": c_date = j; break
                        if c_date < 0:
                            max_dates = -1
                            for j in range(num_cols):
                                if col_dates[j] > max_dates and col_dates[j] > 0:
                                    max_dates = col_dates[j]; c_date = j
                        
                        c_mark: int = -1
                        for j in range(num_cols):
                            if col_htypes[j] == "mark": c_mark = j; break
                        if c_mark < 0 and c_date >= 0:
                            max_marks = -1
                            for j in range(num_cols):
                                if j != c_date and col_marks[j] > max_marks:
                                    max_marks = col_marks[j]; c_mark = j
                                    
                        c_desc: int = -1
                        # Prioritize 'REMARKS' column over 'DESCRIPTION'
                        for j in range(num_cols):
                            if col_htypes[j] == "rem": c_desc = j; break
                        if c_desc < 0:
                            for j in range(num_cols):
                                if col_htypes[j] == "desc": c_desc = j; break
                        
                        if c_desc < 0 and c_date >= 0:
                            max_descs = -1
                            for j in range(num_cols):
                                if j not in [c_date, c_mark] and col_descs[j] > max_descs:
                                    max_descs = col_descs[j]; c_desc = j

                        if c_date >= 0:
                            for row in tbl:
                                if 0 <= c_date < len(row):
                                    val_d = str(row[c_date] or '').strip()
                                    if is_date_pattern(val_d):
                                        val_m = str(row[c_mark] or '').strip() if 0 <= c_mark < len(row) else ""
                                        val_r = str(row[c_desc] or '').strip() if 0 <= c_desc < len(row) else ""
                                        if is_date_pattern(val_m): val_m = ""
                                        if val_m.upper() in ["REV", "MK", "REV.", "DATE", "REV#"]: val_m = ""
                                        _add(val_m, val_d, val_r)
        except: pass

    if rh:
        rh.sort(key=lambda x: get_date_score(x["date"]))
        latest = rh[-1]
        res["revision"], res["date"], res["remarks"] = latest["mark"], latest["date"], latest["remarks"]
    
    res["revisionHistory"] = rh

    # Final fallbacks
    if not res["drawingNumber"]: res["drawingNumber"] = fn_body
    if not res["drawingTitle"]: res["drawingTitle"] = res["drawingNumber"]
    res["drawingDescription"] = res["drawingTitle"]
    
    # --- Approval Detection Enhancement ---
    # If the word 'APPROVED' or 'APPROVAL' is found anywhere in the text (e.g. as a stamp),
    # ensure it's reflected in the remarks/description so the dashboard can pick it up.
    approval_keywords = [r'\bAPPROVED\b', r'\bAPPROVAL\b', r'\bAPPRD\b', r'\bAPPR\b']
    if any(re.search(kw, full_text.upper()) for kw in approval_keywords):
        existing_text = (res["remarks"] + " " + res["drawingDescription"]).upper()
        if not any(re.search(kw, existing_text) for kw in approval_keywords):
            if not res["remarks"]:
                res["remarks"] = "APPROVED"
            else:
                res["remarks"] += " (APPROVED)"

    return res

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--original_filename", default="")
    args = parser.parse_args()
    try:
        raw_out = extract_locally(args.pdf_path, args.original_filename)
        print(json.dumps({"success": True, "fields": raw_out}))
    except:
        print(json.dumps({"success": False, "error": traceback.format_exc()}))
        sys.exit(1)

if __name__ == "__main__":
    main()

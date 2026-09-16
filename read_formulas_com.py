"""分析进度款申请完整列结构 和 工程量确认表"""
import win32com.client
import pythoncom

pythoncom.CoInitialize()
EXCEL_PATH = r"f:\kaifa\OMI\DOC\智能工地设备用量、费用确认表（升级合同）.xls"

excel = win32com.client.Dispatch("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
wb = excel.Workbooks.Open(EXCEL_PATH)

for ws in wb.Worksheets:
    name = ws.Name
    used = ws.UsedRange
    rows = used.Rows.Count
    cols = used.Columns.Count
    print(f"\n{'#'*80}")
    print(f"# Sheet: {name} ({rows} rows x {cols} cols)")
    print(f"{'#'*80}")

    if name == "进度款申请":
        # Print ALL headers (first 10 rows) showing all columns
        print("--- ROWS 1-10 (ALL 36 COLS) ---")
        for r in range(1, 11):
            parts = []
            for c in range(1, cols+1):
                cell = ws.Cells(r, c)
                val = cell.Value
                if val is not None:
                    parts.append(f"C{c}={val}")
            if parts:
                print(f"  R{r}: {' | '.join(parts)}")

        # Print a few data rows to understand the full column usage
        print("\n--- ROWS 11-30 (FULL COLS) ---")
        for r in range(11, min(31, rows+1)):
            parts = []
            for c in range(1, cols+1):
                cell = ws.Cells(r, c)
                val = cell.Value
                formula = str(cell.Formula) if cell.HasFormula else ""
                if val is not None and str(val).strip():
                    alt = f" [F={formula}]" if formula and formula != str(val) else ""
                    parts.append(f"C{c}={val}{alt}")
            if parts:
                print(f"  R{r}: {' | '.join(parts)}")

        # Check summary rows and total rows around row 192
        print("\n--- ROWS 185-194 ---")
        for r in range(185, min(195, rows+1)):
            parts = []
            for c in range(1, cols+1):
                cell = ws.Cells(r, c)
                val = cell.Value
                formula = str(cell.Formula) if cell.HasFormula else ""
                if val is not None and (str(val).strip() or formula):
                    alt = f" [F={formula}]" if formula and formula != str(val) else ""
                    parts.append(f"C{c}={val}{alt}")
            if parts:
                print(f"  R{r}: {' | '.join(parts)}")

        # Spot-check: rows where C12 has formulas (the "结算金额" for current period)
        print("\n--- ROWS WITH FORMULAS IN C12,C13,C15,C16 ---")
        count = 0
        for r in range(1, min(rows+1, 200)):
            for c in [12, 13, 15, 16]:
                cell = ws.Cells(r, c)
                if cell.HasFormula and str(cell.Value or '').strip():
                    parts = []
                    for cc in range(1, 19):
                        cv = ws.Cells(r, cc)
                        val = cv.Value
                        formula = str(cv.Formula) if cv.HasFormula else ""
                        if val is not None:
                            alt = f" [F={formula}]" if formula and formula != str(val) else ""
                            parts.append(f"C{cc}={val}{alt}")
                    print(f"  R{r}: {' | '.join(parts)}")
                    count += 1
                    if count >= 10:
                        break
            if count >= 10:
                break
    
    elif name == "工程量确认":
        print("--- ROWS 1-20 ---")
        for r in range(1, 21):
            parts = []
            for c in range(1, min(cols+1, 41)):
                cell = ws.Cells(r, c)
                val = cell.Value
                formula = str(cell.Formula) if cell.HasFormula else ""
                if val is not None:
                    alt = f" [F={formula}]" if formula and formula != str(val) else ""
                    parts.append(f"C{c}={val}{alt}")
            if parts:
                print(f"  R{r}: {' | '.join(parts)}")
        
        # Bottom rows
        print(f"\n--- BOTTOM ROWS (from {max(1,rows-15)}) ---")
        for r in range(max(1, rows-15), rows+1):
            parts = []
            for c in range(1, min(cols+1, 41)):
                cell = ws.Cells(r, c)
                val = cell.Value
                formula = str(cell.Formula) if cell.HasFormula else ""
                if val is not None:
                    alt = f" [F={formula}]" if formula and formula != str(val) else ""
                    parts.append(f"C{c}={val}{alt}")
            if parts:
                print(f"  R{r}: {' | '.join(parts)}")

wb.Close(False)
excel.Quit()
pythoncom.CoUninitialize()
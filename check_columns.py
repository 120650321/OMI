"""检查进度款申请的完整列结构，找到所有有数据的列"""
import win32com.client
import pythoncom

pythoncom.CoInitialize()
EXCEL_PATH = r"f:\kaifa\OMI\DOC\智能工地设备用量、费用确认表（升级合同）.xls"

excel = win32com.client.Dispatch("Excel.Application")
excel.Visible = False
excel.DisplayAlerts = False
wb = excel.Workbooks.Open(EXCEL_PATH)

ws = wb.Worksheets("进度款申请")
used = ws.UsedRange
rows = used.Rows.Count
cols = used.Columns.Count

print(f"进度款申请: {rows} rows x {cols} cols\n")

# Show column usage heatmap - which columns have data in which rows
print("--- FIRST EQUIPMENT ROW with ALL columns (R8-R16) ---")
for r in range(8, 17):
    parts = []
    for c in range(1, cols+1):
        cell = ws.Cells(r, c)
        val = cell.Value
        formula = str(cell.Formula) if cell.HasFormula else ""
        if val is not None and (str(val).strip() or formula):
            alt = f"[F={formula}]" if formula and formula != str(val) else ""
            parts.append(f"C{c}={val}{alt}")
    if parts:
        print(f"  R{r}: {' | '.join(parts)}")

# Check columns 18-36 for any data
print("\n--- COLUMNS 18-36 in rows with data ---")
for r in range(1, min(rows+1, 200)):
    has_data = False
    for c in range(18, 37):
        cell = ws.Cells(r, c)
        if cell.Value is not None and str(cell.Value or '').strip():
            has_data = True
            break
    if has_data:
        parts = []
        for c in range(1, cols+1):
            cell = ws.Cells(r, c)
            val = cell.Value
            formula = str(cell.Formula) if cell.HasFormula else ""
            if val is not None and (str(val).strip() or formula):
                alt = f"[F={formula}]" if formula and formula != str(val) else ""
                parts.append(f"C{c}={val}{alt}")
        print(f"  R{r}: {' | '.join(parts)}")

wb.Close(False)
excel.Quit()
pythoncom.CoUninitialize()
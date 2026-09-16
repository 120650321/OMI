"""读取Excel中的所有公式和结构信息"""
import xlrd

EXCEL_PATH = r"f:\kaifa\OMI\DOC\智能工地设备用量、费用确认表（升级合同）.xls"

wb = xlrd.open_workbook(EXCEL_PATH, formatting_info=True)

for sheet_name in wb.sheet_names():
    ws = wb.sheet_by_name(sheet_name)
    print(f"\n{'='*80}")
    print(f"Sheet: {sheet_name}  ({ws.nrows} rows x {ws.ncols} cols)")
    print(f"{'='*80}")

    for row_idx in range(min(ws.nrows, 100)):
        row_data = []
        for col_idx in range(ws.ncols):
            cell = ws.cell(row_idx, col_idx)
            ctype = cell.ctype
            if ctype == 0:  # empty
                continue
            val = cell.value
            # Determine type string
            if ctype == 1:  # text
                pass
            elif ctype == 2:  # number
                pass
            elif ctype == 3:  # date
                import datetime
                try:
                    dt = xlrd.xldate_as_datetime(val, wb.datemode)
                    val = dt.strftime('%Y-%m-%d')
                except:
                    pass
            elif ctype == 4:  # boolean
                pass
            row_data.append(f"[C{col_idx}={ctype}]={val}")
        if row_data:
            print(f"  R{row_idx}: {' | '.join(row_data)}")

print("\n\n===== Done =====")
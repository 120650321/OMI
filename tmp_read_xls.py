import xlrd
wb = xlrd.open_workbook(r'f:\kaifa\OMI\DOC\智能工地设备用量、费用确认表（升级合同）.xls')
ws = wb.sheet_by_index(0)
print("=== Merged cells ===")
for mc in ws.merged_cells:
    print(f"  rows={mc[0]}-{mc[1]-1}, cols={mc[2]}-{mc[3]-1}")
print("\n=== Rows 0-20 ===")
for r in range(min(ws.nrows, 20)):
    row = [str(ws.cell_value(r, c))[:60] for c in range(ws.ncols)]
    print(f"  R{r}: {row}")
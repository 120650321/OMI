import pandas as pd
pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', None)
pd.set_option('display.width', 800)
pd.set_option('display.max_colwidth', 50)

# Read 进度款申请
df = pd.read_excel(r'f:\kaifa\OMI\DOC\智能工地设备用量、费用确认表（升级合同）.xls', sheet_name='进度款申请', header=None)
print('=== 进度款申请 ===')
print(f'Shape: {df.shape}')
for i in range(min(8, len(df))):
    row = df.iloc[i]
    print(f'Row {i}: {[str(v)[:50] if pd.notna(v) else "NaN" for v in row]}')
print('--- middle rows ---')
for i in range(84, min(110, len(df))):
    row = df.iloc[i]
    print(f'Row {i}: {[str(v)[:40] if pd.notna(v) else "NaN" for v in row]}')
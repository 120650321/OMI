# 批量导出（Word/PDF）实现计划

> **Goal:** 为安装记录表格添加批量导出功能，支持多选、单选、全选，同时导出 Word 或 PDF 文件到 ZIP 压缩包。

**Architecture:** 后端新增两个 POST 端点接收 ID 数组，批量生成文档并打包为 ZIP 返回；前端为"已录入记录"表格添加 rowSelection，新增批量导出按钮和 select-all 支持。

**Tech Stack:** FastAPI + python-docx + docx2pdf + zipfile（后端），React + Ant Design Table + axios blob download（前端）

---

### Task 1: 后端 — 批量导出 Word ZIP

**Files:**
- Modify: `f:\kaifa\OMI\backend\main.py`（在 export_pdf 之后插入）

在 `export_pdf` 端点之后，`# ========================================== 图片管理` 之前插入：

```python
@app.post("/api/installation/export-word/batch")
def export_word_batch(data: dict, db: Session = Depends(database.get_db)):
    """批量导出安装记录为Word文档ZIP压缩包"""
    from fastapi.responses import Response
    from io import BytesIO
    from urllib.parse import quote
    import zipfile

    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(400, "请提供要导出的记录ID列表")

    records = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id.in_(ids)
    ).all()
    if not records:
        raise HTTPException(404, "未找到匹配的记录")

    try:
        from docx import Document
    except ImportError:
        raise HTTPException(500, "请安装 python-docx: pip install python-docx")

    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for record in records:
            doc = _build_docx(record)
            buf = BytesIO()
            doc.save(buf)
            buf.seek(0)
            filename = f"安装记录_{record.record_no}.docx"
            zf.writestr(filename, buf.getvalue())

    zip_buf.seek(0)
    safe_name = quote(f"安装记录_批量导出_{len(records)}份.zip")
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"}
    )
```

---

### Task 2: 后端 — 批量导出 PDF ZIP

**Files:**
- Modify: `f:\kaifa\OMI\backend\main.py`（紧跟 Task 1 之后）

```python
@app.post("/api/installation/export-pdf/batch")
def export_pdf_batch(data: dict, db: Session = Depends(database.get_db)):
    """批量导出安装记录为PDF文档ZIP压缩包"""
    from fastapi.responses import Response
    from io import BytesIO
    from urllib.parse import quote
    import zipfile
    import tempfile

    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(400, "请提供要导出的记录ID列表")

    records = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id.in_(ids)
    ).all()
    if not records:
        raise HTTPException(404, "未找到匹配的记录")

    try:
        from docx2pdf import convert
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp:
            pass
    except ImportError:
        raise HTTPException(500, "请安装 docx2pdf: pip install docx2pdf")

    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for record in records:
            doc = _build_docx(record)
            with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp:
                doc.save(tmp.name)
                pdf_path = tmp.name.replace('.docx', '.pdf')
            try:
                convert(tmp.name, pdf_path)
                with open(pdf_path, 'rb') as f:
                    pdf_data = f.read()
                filename = f"安装记录_{record.record_no}.pdf"
                zf.writestr(filename, pdf_data)
            except Exception as e:
                filename = f"安装记录_{record.record_no}.pdf"
                zf.writestr(f"{filename}.error.txt", f"转换失败: {str(e)}")
            finally:
                if os.path.exists(tmp.name):
                    os.unlink(tmp.name)
                if os.path.exists(pdf_path):
                    os.unlink(pdf_path)

    zip_buf.seek(0)
    safe_name = quote(f"安装记录_批量导出_{len(records)}份_PDF.zip")
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"}
    )
```

---

### Task 3: 前端 — API 层新增批量导出方法

**Files:**
- Modify: `f:\kaifa\OMI\frontend\src\api\index.ts`（在 exportPdfUrl 下方插入）

```typescript
  exportWordBatch: (ids: number[]) =>
    api.post('/installation/export-word/batch', { ids }, { responseType: 'blob' }).then(r => r.data),
  exportPdfBatch: (ids: number[]) =>
    api.post('/installation/export-pdf/batch', { ids }, { responseType: 'blob' }).then(r => r.data),
```

---

### Task 4: 前端 — 表格添加 rowSelection + 批量导出按钮

**Files:**
- Modify: `f:\kaifa\OMI\frontend\src\pages\InstallationRecords.tsx`

#### 4a. 新增 state

在现有的 `selectedRowKeys` 之后添加一条新的 state（用于记录表格的选择）：

```typescript
const [selectedRecordKeys, setSelectedRecordKeys] = useState<React.Key[]>([])
```

#### 4b. 新增批量导出处理函数

在 `handleDelete` 之后添加：

```typescript
const handleBatchExportWord = async () => {
  if (selectedRecordKeys.length === 0) { message.warning('请先勾选记录'); return }
  const loadingMsg = message.loading(`正在导出 ${selectedRecordKeys.length} 份Word文档...`, 0)
  try {
    const blob = await installationApi.exportWordBatch(selectedRecordKeys as number[])
    const url = window.URL.createObjectURL(new Blob([blob]))
    const a = document.createElement('a')
    a.href = url
    a.download = `安装记录_Word批量导出_${selectedRecordKeys.length}份.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    message.success('导出完成')
  } catch (err: any) {
    message.error('导出失败')
  } finally {
    loadingMsg()
  }
}

const handleBatchExportPdf = async () => {
  if (selectedRecordKeys.length === 0) { message.warning('请先勾选记录'); return }
  const loadingMsg = message.loading(`正在导出 ${selectedRecordKeys.length} 份PDF文档...`, 0)
  try {
    const blob = await installationApi.exportPdfBatch(selectedRecordKeys as number[])
    const url = window.URL.createObjectURL(new Blob([blob]))
    const a = document.createElement('a')
    a.href = url
    a.download = `安装记录_PDF批量导出_${selectedRecordKeys.length}份.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
    message.success('导出完成')
  } catch (err: any) {
    message.error('导出失败')
  } finally {
    loadingMsg()
  }
}
```

#### 4c. 修改 records 表格，添加 rowSelection

将 `<Table dataSource={records} columns={recordColumns} .../>` 改为：

```tsx
<Table
  dataSource={records}
  columns={recordColumns}
  rowKey="id"
  size="small"
  scroll={{ x: 1200 }}
  locale={{ emptyText: '暂无安装记录，可点击"从进度自动生成"或"手动新建记录"创建' }}
  rowSelection={{
    selectedRowKeys: selectedRecordKeys,
    onChange: (keys: React.Key[]) => setSelectedRecordKeys(keys),
  }}
/>
```

#### 4d. 在记录表格上方添加批量导出工具栏

在 `<Table` 之前插入批量导出按钮栏：

```tsx
{selectedRecordKeys.length > 0 && (
  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
    <Tag color="orange">已选 {selectedRecordKeys.length} 条记录</Tag>
    <Button size="small" type="primary" icon={<FileWordOutlined />} onClick={handleBatchExportWord}>
      批量导出 Word
    </Button>
    <Button size="small" type="primary" icon={<FilePdfOutlined />} onClick={handleBatchExportPdf}>
      批量导出 PDF
    </Button>
    <Button size="small" onClick={() => setSelectedRecordKeys([])}>取消选择</Button>
  </div>
)}
```

---

### 验证步骤

1. 重启后端：`f:\kaifa\OMI\.venv_py311\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000`
2. 访问 `http://localhost:3000/installation`
3. 在"已录入记录"标签页，勾选记录 → 出现批量导出按钮 → 点击导出 Word/PDF
4. 验证下载的 ZIP 包含所有选中记录的文档
5. 测试全选（表头 checkbox）功能
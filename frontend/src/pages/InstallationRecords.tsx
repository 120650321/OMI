import React, { useEffect, useState, useMemo } from 'react'
import { Table, Button, Card, Space, Popconfirm, message, Tabs, Tag, Badge, Select, Drawer, Descriptions, Image, Empty, InputNumber, Checkbox, Input, Modal, Divider } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined, DownloadOutlined, FileWordOutlined, FilePdfOutlined, SettingOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { installationApi, progressApi, useUnitApi, equipmentApi, exportApi, installSkipApi } from '../api'
import { useAuth } from '../components/AuthContext'
import { useContract } from '../components/ContractContext'

export default function InstallationRecords() {
  const [records, setRecords] = useState<any[]>([])
  const [unrecorded, setUnrecorded] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | undefined>(undefined)
  const [activeTab, setActiveTab] = useState('records')
  const [generating, setGenerating] = useState(false)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [selectedRecordKeys, setSelectedRecordKeys] = useState<React.Key[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [recordSearch, setRecordSearch] = useState('')
  const [unrecordedSearch, setUnrecordedSearch] = useState('')
  const [unrecordedCategoryFilter, setUnrecordedCategoryFilter] = useState<number | undefined>()
  const [categories, setCategories] = useState<any[]>([])
  const [previewDevice, setPreviewDevice] = useState<any>(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [unitAllocations, setUnitAllocations] = useState<Record<string, { use_unit: string; allocated_qty: number }[]>>({})
  const [useUnits, setUseUnits] = useState<string[]>(['C1', 'C2', 'C3', 'C4', 'EPC'])
  const [unitObjects, setUnitObjects] = useState<any[]>([])
  const [unitManageOpen, setUnitManageOpen] = useState(false)
  const [unitManageSaving, setUnitManageSaving] = useState(false)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportUnit, setExportUnit] = useState<string>('')
  const [exportDocNo, setExportDocNo] = useState<string>('')
  const [exportLoading, setExportLoading] = useState(false)
  const [editingAllocItemId, setEditingAllocItemId] = useState<number | null>(null)
  const [editAllocValues, setEditAllocValues] = useState<Record<string, number>>({})
  // 合并分配弹窗
  const [mergeAllocModalOpen, setMergeAllocModalOpen] = useState(false)
  const [mergeAllocValues, setMergeAllocValues] = useState<Record<number, Record<string, number>>>({})
  const [mergeAllocSaving, setMergeAllocSaving] = useState(false)
  const [skippedIds, setSkippedIds] = useState<Set<number>>(new Set())
  const navigate = useNavigate()
  const { canEdit } = useAuth()
  const { currentContractId } = useContract()

  const loadPeriods = async () => {
    try {
      const data = await progressApi.periods(currentContractId)
      setPeriods(data || [])
      if (data && data.length > 0) {
        setSelectedPeriodId(data[0].id)
      } else {
        setSelectedPeriodId(undefined)
      }
    } catch { /* ignore */ }
  }

  const load = () => {
    installationApi.list(currentContractId).then(setRecords)
    installationApi.unrecordedItems(currentContractId, selectedPeriodId).then(setUnrecorded)
  }

  const loadAll = () => {
    load()
    useUnitApi.list(currentContractId).then((data: any[]) => {
      setUseUnits(data.map((u: any) => u.name))
      setUnitObjects(data)
    }).catch(() => { /* use defaults */ })
    installationApi.unitAllocations(currentContractId).then(setUnitAllocations).catch(() => {})
  }

  useEffect(() => { loadPeriods() }, [currentContractId])
  useEffect(() => {
    loadAll()
    equipmentApi.categories(currentContractId).then(setCategories).catch(() => {})
    if (selectedPeriodId) {
      installSkipApi.list(currentContractId, selectedPeriodId).then((ids: number[]) => {
        setSkippedIds(new Set(ids))
      }).catch(() => setSkippedIds(new Set()))
    } else {
      setSkippedIds(new Set())
    }
  }, [selectedPeriodId, currentContractId])

  const handleDelete = async (id: number) => {
    await installationApi.delete(id)
    message.success('删除成功')
    load()
  }

  const handleToggleSkip = async (itemId: number) => {
    if (!selectedPeriodId) return
    const isSkipped = skippedIds.has(itemId)
    try {
      if (isSkipped) {
        await installSkipApi.unmark([itemId], currentContractId, selectedPeriodId)
        setSkippedIds(prev => { const next = new Set(prev); next.delete(itemId); return next })
        message.success('已取消暂不录入')
      } else {
        await installSkipApi.mark([itemId], currentContractId, selectedPeriodId)
        setSkippedIds(prev => { const next = new Set(prev); next.add(itemId); return next })
        message.success('已标记为暂不录入')
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    }
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(new Blob([blob]))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const handleExportWord = async (id: number) => {
    const loadingMsg = message.loading('正在导出Word...', 0)
    try {
      const blob = await installationApi.exportWord(id)
      downloadBlob(blob, `安装记录_${id}.docx`)
      message.success('导出完成')
    } catch {
      message.error('导出失败')
    } finally {
      loadingMsg()
    }
  }

  const handleExportPdf = async (id: number) => {
    const loadingMsg = message.loading('正在导出PDF...', 0)
    try {
      const blob = await installationApi.exportPdf(id)
      downloadBlob(blob, `安装记录_${id}.pdf`)
      message.success('导出完成')
    } catch {
      message.error('导出失败')
    } finally {
      loadingMsg()
    }
  }

  const handleBatchExportWord = async () => {
    if (selectedRecordKeys.length === 0) { message.warning('请先勾选记录'); return }
    const loadingMsg = message.loading('正在批量导出Word...', 0)
    try {
      const blob = await installationApi.exportWordBatch(selectedRecordKeys as number[])
      downloadBlob(blob, `安装记录_Word批量导出_${selectedRecordKeys.length}份.zip`)
      message.success('导出完成')
    } catch {
      message.error('导出失败')
    } finally {
      loadingMsg()
    }
  }

  const handleBatchExportPdf = async () => {
    if (selectedRecordKeys.length === 0) { message.warning('请先勾选记录'); return }
    const loadingMsg = message.loading('正在批量导出PDF...', 0)
    try {
      const blob = await installationApi.exportPdfBatch(selectedRecordKeys as number[])
      downloadBlob(blob, `安装记录_PDF批量导出_${selectedRecordKeys.length}份.zip`)
      message.success('导出完成')
    } catch {
      message.error('导出失败')
    } finally {
      loadingMsg()
    }
  }

  const handleBatchDelete = async () => {
    if (selectedRecordKeys.length === 0) { message.warning('请先勾选记录'); return }
    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRecordKeys.length} 条安装记录吗？删除后不可恢复。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await installationApi.batchDelete(selectedRecordKeys as number[])
          message.success(`已删除 ${result.deleted} 条记录`)
          setSelectedRecordKeys([])
          loadAll()
        } catch (err: any) {
          message.error(err?.response?.data?.detail || '删除失败')
        }
      },
    })
  }

  // 使用单位管理
  const openUnitManage = () => {
    setUnitManageOpen(true)
  }

  const handleAddUnit = () => {
    setUnitObjects(prev => [...prev, { id: -Date.now(), name: '', sort_order: prev.length }])
  }

  const handleUnitNameChange = (id: number, name: string) => {
    setUnitObjects(prev => prev.map(u => u.id === id ? { ...u, name } : u))
  }

  const handleDeleteUnit = (id: number) => {
    setUnitObjects(prev => prev.filter(u => u.id !== id))
  }

  const handleSaveUnits = async () => {
    const emptyName = unitObjects.find(u => !u.name.trim())
    if (emptyName) { message.warning('使用单位名称不能为空'); return }
    const duplicates = unitObjects.filter((u, i, arr) =>
      arr.findIndex(x => x.name.trim() === u.name.trim()) !== i
    )
    if (duplicates.length > 0) { message.warning(`使用单位名称重复: ${duplicates.map(u => u.name).join(', ')}`); return }
    setUnitManageSaving(true)
    try {
      await useUnitApi.save(
        unitObjects.map(u => ({ id: u.id > 0 ? u.id : undefined, name: u.name.trim(), sort_order: u.sort_order })),
        currentContractId
      )
      message.success('使用单位已保存')
      setUnitManageOpen(false)
      useUnitApi.list(currentContractId).then((data: any[]) => {
        setUseUnits(data.map((u: any) => u.name))
        setUnitObjects(data)
      })
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '保存失败')
    } finally {
      setUnitManageSaving(false)
    }
  }

  const handleExportConfirmation = async () => {
    if (!exportUnit) { message.warning('请选择使用单位'); return }
    setExportLoading(true)
    try {
      await exportApi.confirmationSheet(currentContractId, exportUnit, exportDocNo)
      message.success(`确认单（${exportUnit}）导出成功`)
      setExportModalOpen(false)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '导出失败')
    } finally {
      setExportLoading(false)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await installationApi.generateFromProgress(currentContractId, selectedPeriodId)
      message.success(`自动生成成功！记录编号: ${result.record_no}，包含 ${result.item_count} 项设备`)
      load()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const openAllocEditor = (itemId: number) => {
    const existing = unitAllocations[String(itemId)] || []
    const vals: Record<string, number> = {}
    useUnits.forEach(u => { vals[u] = 0 })
    existing.forEach((a: any) => { vals[a.use_unit] = a.allocated_qty })
    setEditAllocValues(vals)
    setEditingAllocItemId(itemId)
  }

  const closeAllocEditor = () => {
    setEditingAllocItemId(null)
    setEditAllocValues({})
  }

  const saveAllocEditor = async (itemId: number) => {
    const allocations = useUnits
      .map(u => ({ use_unit: u, allocated_qty: editAllocValues[u] || 0 }))
      .filter(a => a.allocated_qty > 0)
    await installationApi.saveUnitAllocations({ equipment_item_id: itemId, allocations }, currentContractId)
    message.success('分配已保存')
    setEditingAllocItemId(null)
    setEditAllocValues({})
    installationApi.unitAllocations(currentContractId).then(setUnitAllocations).catch(() => {})
  }

  // 打开合并分配弹窗
  const openMergeAllocModal = () => {
    if (selectedRowKeys.length === 0) { message.warning('请先勾选设备'); return }
    const vals: Record<number, Record<string, number>> = {}
    selectedRowKeys.forEach((itemId: number) => {
      const existing = unitAllocations[String(itemId)] || []
      vals[itemId] = {}
      useUnits.forEach(u => { vals[itemId][u] = 0 })
      existing.forEach((a: any) => { vals[itemId][a.use_unit] = a.allocated_qty })
    })
    setMergeAllocValues(vals)
    setMergeAllocModalOpen(true)
  }

  // 保存合并分配并可选生成
  const saveMergeAlloc = async (andGenerate = false) => {
    setMergeAllocSaving(true)
    try {
      const batchData = Object.entries(mergeAllocValues).map(([itemId, allocs]) => ({
        equipment_item_id: Number(itemId),
        allocations: useUnits
          .map(u => ({ use_unit: u, allocated_qty: allocs[u] || 0 }))
          .filter(a => a.allocated_qty > 0)
      }))
      await installationApi.saveUnitAllocationsBatch(batchData, currentContractId)
      await installationApi.unitAllocations(currentContractId).then(setUnitAllocations).catch(() => {})
      if (andGenerate) {
        const result = await installationApi.generateByUnit(
          { item_ids: selectedRowKeys as number[] },
          currentContractId,
          selectedPeriodId
        )
        message.success(`已按使用单位生成 ${result.total} 条安装记录`)
        setSelectedRowKeys([])
        loadAll()
      } else {
        message.success('批量分配已保存')
      }
      setMergeAllocModalOpen(false)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    } finally {
      setMergeAllocSaving(false)
    }
  }

  const handleGenerateByUnit = async () => {
    if (selectedRowKeys.length === 0) { message.warning('请先勾选设备'); return }
    setGenerating(true)
    try {
      const result = await installationApi.generateByUnit(
        { item_ids: selectedRowKeys as number[] },
        currentContractId,
        selectedPeriodId
      )
      message.success(`已按使用单位生成 ${result.total} 条安装记录`)
      setSelectedRowKeys([])
      loadAll()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '生成失败，请先为设备分配使用单位')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateSelected = async () => {
    if (selectedRowKeys.length === 0) { message.warning('请先勾选设备'); return }
    setGenerating(true)
    try {
      const result = await installationApi.generateSelected(selectedRowKeys as number[], currentContractId, selectedPeriodId)
      message.success(`已生成安装记录: ${result.record_no}，包含 ${result.item_count} 项设备`)
      setSelectedRowKeys([])
      load()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateIndividual = async () => {
    if (selectedRowKeys.length === 0) { message.warning('请先勾选设备'); return }
    setGenerating(true)
    try {
      const result = await installationApi.generateIndividual(selectedRowKeys as number[], currentContractId, selectedPeriodId)
      message.success(`已逐项生成 ${result.total} 张独立安装记录`)
      setSelectedRowKeys([])
      load()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateByUnitMerged = async () => {
    if (selectedRowKeys.length === 0) { message.warning('请先勾选设备'); return }
    setGenerating(true)
    try {
      const result = await installationApi.generateByUnitMerged(
        { item_ids: selectedRowKeys as number[] },
        currentContractId,
        selectedPeriodId
      )
      message.success(`已按使用单位生成 ${result.total} 条合并安装记录`)
      setSelectedRowKeys([])
      loadAll()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '生成失败，请先为设备分配使用单位')
    } finally {
      setGenerating(false)
    }
  }

  const selectedPeriod = periods.find((p: any) => p.id === selectedPeriodId)
  const periodLabel = selectedPeriod ? `第${selectedPeriod.period_no}期` : '全部期次'

  // 为设备加载已录入的安装记录编号
  const unrecordedWithRecords = useMemo(() => {
    return unrecorded.map((u: any) => {
      const deviceRecordNos = records
        .filter((r: any) => r.items?.some((it: any) => it.equipment_item_id === u.item_id))
        .map((r: any) => r.record_no)
      return { ...u, record_nos: deviceRecordNos }
    })
  }, [unrecorded, records])

  // 按状态筛选设备
  const filteredUnrecorded = useMemo(() => {
    let data = unrecordedWithRecords
    // 状态筛选
    if (statusFilter !== 'all') {
      data = data.filter((u: any) => {
        if (!u.progress_quantity) return statusFilter === 'no_progress'
        if (skippedIds.has(u.item_id)) return statusFilter === 'skipped'
        if (u.uninstalled_quantity <= 0) return statusFilter === 'recorded'
        return statusFilter === 'pending'
      })
    }
    // 大类筛选
    if (unrecordedCategoryFilter) {
      data = data.filter((u: any) => u.category_id === unrecordedCategoryFilter)
    }
    // 关键词搜索
    if (unrecordedSearch) {
      const kw = unrecordedSearch.toLowerCase()
      data = data.filter((u: any) =>
        (u.item_name || '').toLowerCase().includes(kw) ||
        (u.specification || '').toLowerCase().includes(kw) ||
        (u.category_name || '').toLowerCase().includes(kw)
      )
    }
    return data
  }, [unrecordedWithRecords, statusFilter, unrecordedCategoryFilter, unrecordedSearch])

  // 已录入记录筛选
  const filteredRecords = useMemo(() => {
    if (!recordSearch) return records
    const kw = recordSearch.toLowerCase()
    return records.filter((r: any) =>
      (r.record_no || '').toLowerCase().includes(kw) ||
      (r.equipment_type || '').toLowerCase().includes(kw) ||
      (r.install_personnel || '').toLowerCase().includes(kw) ||
      (r.use_unit || '').toLowerCase().includes(kw) ||
      (r.install_content || '').toLowerCase().includes(kw)
    )
  }, [records, recordSearch])

  // 分页配置
  const recordPagination = useMemo(() => ({
    defaultPageSize: 10,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (total: number) => `共 ${total} 条`,
  }), [])

  const unrecordedPagination = useMemo(() => ({
    defaultPageSize: 50,
    showSizeChanger: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (total: number) => `共 ${total} 条`,
  }), [])

  // 根据设备名称查找对应的安装记录
  const deviceRecords = useMemo(() => {
    if (!previewDevice) return []
    return records.filter((r: any) =>
      r.items?.some((it: any) => it.equipment_item_id === previewDevice.item_id)
    )
  }, [records, previewDevice])

  // 打开设备安装记录预览
  const handlePreviewDevice = (device: any) => {
    setPreviewDevice(device)
    setPreviewVisible(true)
  }

  const recordColumns = [
    { title: '编号', dataIndex: 'record_no', width: 100, sorter: (a: any, b: any) => (a.record_no || '').localeCompare(b.record_no || '') },
    { title: '关联期次', dataIndex: 'period_label', width: 90, sorter: (a: any, b: any) => (a.period_label || '').localeCompare(b.period_label || ''), render: (v: string) => v ? <Tag color="purple">{v}</Tag> : <Tag>--</Tag> },
    { title: '设备类型', dataIndex: 'equipment_type', width: 120 },
    { title: '安装人员', dataIndex: 'install_personnel', width: 200, render: (v: string) => {
      if (!v) return '-'
      const names = v.split(',').filter(Boolean)
      return (
        <Space size={[2, 2]} wrap>
          {names.map((n, i) => <Tag key={i} color="cyan">{n.trim()}</Tag>)}
        </Space>
      )
    }},
    { title: '安装日期', dataIndex: 'install_date', width: 110, sorter: (a: any, b: any) => new Date(a.install_date || 0).getTime() - new Date(b.install_date || 0).getTime(), render: (v: string) => v?.split('T')[0] },
    { title: '创建时间', dataIndex: 'created_at', width: 160, sorter: (a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime(), render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
    { title: '使用单位', dataIndex: 'use_unit', width: 150 },
    { title: '设备数', width: 80, render: (_: any, r: any) => (
      <Tag color="blue">{r.items?.length || 0}项</Tag>
    )},
    { title: '安装内容', dataIndex: 'install_content', ellipsis: true },
    { title: '操作', width: 280, render: (_: any, r: any) => (
      <Space>
        {canEdit && (
          <>
            <Button type="link" icon={<EditOutlined />} onClick={() => navigate(`/installation/${r.id}/edit`)}>编辑</Button>
            <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
              <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          </>
        )}
        <Button type="link" icon={<FileWordOutlined />}
          onClick={() => handleExportWord(r.id)}>
          Word
        </Button>
        <Button type="link" icon={<FilePdfOutlined />}
          onClick={() => handleExportPdf(r.id)}>
          PDF
        </Button>
      </Space>
    )},
  ]

  const unrecordedColumns = [
    { title: '设备名称', dataIndex: 'item_name', width: 200,
      render: (v: string, r: any) => (
        <a onClick={() => handlePreviewDevice(r)} style={{ cursor: 'pointer' }}>
          {v}
        </a>
      )
    },
    { title: '规格型号', dataIndex: 'specification', width: 150 },
    { title: '单位', dataIndex: 'unit', width: 50 },
    { title: '合同量', dataIndex: 'contract_quantity', width: 70 },
    { title: '进度核定', dataIndex: 'progress_quantity', width: 80, render: (v: number) => (
      <Tag color="blue">{v}</Tag>
    )},
    { title: '已安装', dataIndex: 'installed_quantity', width: 80, render: (v: number) => (
      <Tag color={v > 0 ? 'green' : 'default'}>{v}</Tag>
    )},
    { title: '待安装', dataIndex: 'uninstalled_quantity', width: 80, render: (v: number) => (
      <Tag color={v > 0 ? 'red' : 'green'}>{v}</Tag>
    )},
    { title: '状态', width: 100, render: (_: any, r: any) => {
      if (!r.progress_quantity) return <Tag>无进度</Tag>
      if (skippedIds.has(r.item_id)) return <Tag color="orange">暂不录入</Tag>
      if (r.uninstalled_quantity <= 0) return <Tag color="green">已录入</Tag>
      return <Tag color="red">待录入</Tag>
    }},
    { title: '安装记录编号', dataIndex: 'record_nos', width: 130, render: (nos: string[]) => {
      if (!nos || nos.length === 0) return <Tag color="default">--</Tag>
      return (
        <Space size={[2, 2]} wrap>
          {nos.map((no: string) => <Tag key={no} color="purple">{no}</Tag>)}
        </Space>
      )
    }},
    { title: '使用单位分配', width: 170, render: (_: any, r: any) => {
      const allocs = unitAllocations[String(r.item_id)] || []
      if (allocs.length === 0) return <Tag color="default">未分配</Tag>
      return (
        <Space size={[2, 2]} wrap>
          {allocs.map((a: any) => (
            <Tag key={a.use_unit} color="blue">{a.use_unit}:{a.allocated_qty}</Tag>
          ))}
        </Space>
      )
    }},
    { title: '操作', width: 140, render: (_: any, r: any) => (
      canEdit ? (
        <Space size={0}>
          <Button size="small" icon={<SettingOutlined />}
            onClick={() => openAllocEditor(r.item_id)}>
            分配
          </Button>
          <Popconfirm
            title={skippedIds.has(r.item_id) ? '确定取消暂不录入？' : '确定标记为暂不录入？'}
            onConfirm={() => handleToggleSkip(r.item_id)}
          >
            <Button size="small"
              type={skippedIds.has(r.item_id) ? 'default' : 'dashed'}
              style={skippedIds.has(r.item_id) ? { color: '#fa8c16', borderColor: '#fa8c16' } : {}}
            >
              {skippedIds.has(r.item_id) ? '恢复' : '暂不录入'}
            </Button>
          </Popconfirm>
        </Space>
      ) : null
    )},
    { title: '分类', dataIndex: 'category_name', width: 120 },
  ]

  const totalUnrecorded = unrecorded.filter(u => u.progress_quantity > 0 && u.uninstalled_quantity > 0 && !skippedIds.has(u.item_id)).length
  const selectableUnrecorded = filteredUnrecorded.filter(u => u.progress_quantity > 0 && u.uninstalled_quantity > 0 && !skippedIds.has(u.item_id))

  return (
    <Card title="设备安装记录" extra={
      <Space>
        <Select
          value={selectedPeriodId}
          onChange={setSelectedPeriodId}
          style={{ width: 140 }}
          options={periods.map((p: any) => ({ label: `第${p.period_no}期`, value: p.id }))}
          placeholder="选择期次"
        />
        {canEdit && (
          <>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={handleGenerate} loading={generating}
              disabled={totalUnrecorded === 0}>
              从{periodLabel}自动生成
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => navigate('/installation/new')}>
              手动新建记录
            </Button>
            <Button icon={<SettingOutlined />} onClick={openUnitManage}>
              管理使用单位
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={() => { setExportUnit(''); setExportDocNo(''); setExportModalOpen(true) }}>
              导出确认单
            </Button>
          </>
        )}
      </Space>
    }>
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <Tabs.TabPane tab={`已录入记录 (${records.length})`} key="records">
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Space>
              <Input
                placeholder="搜索编号/类型/人员/单位"
                prefix={<SearchOutlined />}
                allowClear
                style={{ width: 220 }}
                value={recordSearch}
                onChange={(e) => setRecordSearch(e.target.value)}
              />
              {selectedRecordKeys.length > 0 && (
                <>
                  <Tag color="orange">已选 {selectedRecordKeys.length} 条</Tag>
                  <Button size="small" type="primary" icon={<FileWordOutlined />} onClick={handleBatchExportWord}>
                    批量导出 Word
                  </Button>
                  <Button size="small" type="primary" icon={<FilePdfOutlined />} onClick={handleBatchExportPdf}>
                    批量导出 PDF
                  </Button>
                  <Popconfirm
                    title={`确认删除选中的 ${selectedRecordKeys.length} 条安装记录？`}
                    description="删除后不可恢复"
                    okText="确认删除"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={handleBatchDelete}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      批量删除
                    </Button>
                  </Popconfirm>
                  <Button size="small" onClick={() => setSelectedRecordKeys([])}>取消选择</Button>
                </>
              )}
            </Space>
          </div>
          <Table
            dataSource={filteredRecords}
            columns={recordColumns}
            rowKey="id"
            size="small"
            scroll={{ x: 1400 }}
            locale={{ emptyText: '暂无安装记录，可点击"从进度自动生成"或"手动新建记录"创建' }}
            rowSelection={{
              selectedRowKeys: selectedRecordKeys,
              onChange: (keys: React.Key[]) => setSelectedRecordKeys(keys),
            }}
            pagination={recordPagination}
          />
        </Tabs.TabPane>
        <Tabs.TabPane tab={
          <Space>
            设备安装状态
            <Badge count={totalUnrecorded} overflowCount={999} />
          </Space>
        } key="unrecorded">
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Space>
              <Input
                placeholder="搜索设备名称/规格"
                prefix={<SearchOutlined />}
                allowClear
                style={{ width: 200 }}
                value={unrecordedSearch}
                onChange={(e) => setUnrecordedSearch(e.target.value)}
              />
              <Select
                allowClear
                placeholder="筛选大类"
                style={{ width: 160 }}
                value={unrecordedCategoryFilter}
                onChange={setUnrecordedCategoryFilter}
                options={categories.map((c: any) => ({ label: c.name, value: c.id }))}
              />
              <Tag color="blue">{periodLabel}设备: {unrecorded.length}项</Tag>
              <Tag color="red" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('pending')}>
                待录入安装: {totalUnrecorded}项
              </Tag>
              <Tag color="green" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('recorded')}>
                已录入安装: {unrecorded.filter(u => u.is_recorded).length}项
              </Tag>
              <Tag color="default" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('no_progress')}>
                无进度数据: {unrecorded.filter(u => !u.progress_quantity).length}项
              </Tag>
              <Tag color="orange" style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('skipped')}>
                暂不录入: {unrecorded.filter(u => skippedIds.has(u.item_id)).length}项
              </Tag>
              <Select
                placeholder="状态筛选"
                style={{ width: 120 }}
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { label: '全部', value: 'all' },
                  { label: '待录入', value: 'pending' },
                  { label: '已录入', value: 'recorded' },
                  { label: '无进度', value: 'no_progress' },
                  { label: '暂不录入', value: 'skipped' },
                ]}
              />
            </Space>
            <Space>
              {selectedRowKeys.length > 0 && <Tag color="orange">已选 {selectedRowKeys.length} 项</Tag>}
              {canEdit && (
                <>
                  <Button size="small" type="primary" icon={<ThunderboltOutlined />}
                    onClick={handleGenerateSelected} loading={generating}
                    disabled={selectedRowKeys.length === 0}>
                    合并生成一张表
                  </Button>
                  <Button size="small" icon={<ThunderboltOutlined />}
                    onClick={handleGenerateIndividual} loading={generating}
                    disabled={selectedRowKeys.length === 0}>
                    逐项生成独立表
                  </Button>
                  <Button size="small" icon={<SettingOutlined />}
                    onClick={openMergeAllocModal} loading={generating}
                    disabled={selectedRowKeys.length === 0}
                    style={{ background: '#722ed1', borderColor: '#722ed1', color: '#fff' }}>
                    多选合并分配生成
                  </Button>
                  <Button size="small" type="primary" icon={<ThunderboltOutlined />}
                    onClick={handleGenerateByUnitMerged} loading={generating}
                    disabled={selectedRowKeys.length === 0}
                    style={{ background: '#389e0d', borderColor: '#389e0d' }}>
                    按使用单位合并生成
                  </Button>
                </>
              )}
            </Space>
          </div>
          <Table
            dataSource={filteredUnrecorded}
            columns={unrecordedColumns}
            rowKey="item_id"
            size="small"
            scroll={{ x: 1400 }}
            pagination={unrecordedPagination}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
              getCheckboxProps: (record: any) => ({
                disabled: !record.progress_quantity || record.uninstalled_quantity <= 0,
              }),
            }}
            locale={{ emptyText: '加载中...' }}
            expandable={{
              expandedRowRender: (record: any) => {
                if (editingAllocItemId !== record.item_id) return null
                const allocs = unitAllocations[String(record.item_id)] || []
                const totalAllocated = useUnits.reduce((sum, u) => sum + (editAllocValues[u] || 0), 0)
                const remaining = record.uninstalled_quantity - totalAllocated
                return (
                  <div style={{ padding: '12px 16px', background: '#fafafa', borderRadius: 6 }}>
                    <div style={{ fontWeight: 500, marginBottom: 8 }}>
                      分配使用单位 — {record.item_name}（待安装: {record.uninstalled_quantity}）
                    </div>
                    <Space wrap size={[12, 8]} style={{ marginBottom: 8 }}>
                      {useUnits.map(u => (
                        <Space key={u} size={4}>
                          <Checkbox
                            checked={(editAllocValues[u] || 0) > 0}
                            onChange={e => {
                              setEditAllocValues(prev => ({
                                ...prev,
                                [u]: e.target.checked ? (prev[u] || 1) : 0
                              }))
                            }}
                          />
                          <Tag>{u}</Tag>
                          <InputNumber
                            size="small"
                            min={0}
                            max={record.uninstalled_quantity}
                            style={{ width: 80 }}
                            value={editAllocValues[u] || 0}
                            disabled={!editAllocValues[u]}
                            onChange={v => setEditAllocValues(prev => ({ ...prev, [u]: v || 0 }))}
                          />
                          台
                        </Space>
                      ))}
                    </Space>
                    <div>
                      <Tag color="blue">已分配: {totalAllocated}</Tag>
                      <Tag color={remaining < 0 ? 'red' : remaining === 0 ? 'green' : 'orange'}>
                        剩余: {remaining}
                      </Tag>
                      <Button size="small" type="primary" style={{ marginLeft: 16 }}
                        onClick={() => saveAllocEditor(record.item_id)}>
                        确认分配
                      </Button>
                      <Button size="small" style={{ marginLeft: 8 }}
                        onClick={closeAllocEditor}>
                        取消
                      </Button>
                    </div>
                  </div>
                )
              },
              expandedRowKeys: editingAllocItemId ? [editingAllocItemId] : [],
              onExpand: (expanded, record) => {
                if (expanded) {
                  openAllocEditor(record.item_id)
                } else {
                  closeAllocEditor()
                }
              },
              showExpandColumn: false,
            }}
          />
        </Tabs.TabPane>
      </Tabs>

      <Drawer
        title={`${previewDevice?.item_name || ''} - 安装记录预览`}
        width={900}
        open={previewVisible}
        onClose={() => { setPreviewVisible(false); setPreviewDevice(null) }}
      >
        {previewDevice && (
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Tag color="blue">{previewDevice.item_name}</Tag>
              <Tag>{previewDevice.specification}</Tag>
              <Tag>{previewDevice.unit}</Tag>
            </Space>
          </div>
        )}
        {deviceRecords.length === 0 ? (
          <Empty description="该设备暂无关联的安装记录" />
        ) : (
          deviceRecords.map((record: any) => (
            <Card
              key={record.id}
              size="small"
              style={{ marginBottom: 16 }}
              title={<Space>{record.record_no} {record.period_label && <Tag color="purple">{record.period_label}</Tag>}</Space>}
            >
              <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="项目名称">{record.project_name || 'CX项目智能工地建设'}</Descriptions.Item>
                <Descriptions.Item label="设备类型">{record.equipment_type}</Descriptions.Item>
                <Descriptions.Item label="安装单位">{record.install_unit}</Descriptions.Item>
                <Descriptions.Item label="安装人员">{record.install_personnel}</Descriptions.Item>
                <Descriptions.Item label="安装日期">{record.install_date?.split('T')[0]}</Descriptions.Item>
                <Descriptions.Item label="使用单位">{record.use_unit}</Descriptions.Item>
              </Descriptions>

              <Descriptions bordered size="small" column={1} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="安装内容">{record.install_content}</Descriptions.Item>
                <Descriptions.Item label="安装结论">{record.install_conclusion || '设备已安装调试开通正常投入运行。'}</Descriptions.Item>
              </Descriptions>

              <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="安装单位签字">
                  {record.install_sign_date ? record.install_sign_date.split('T')[0] : <Tag>未签</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="客户签字">
                  {record.client_sign_date ? record.client_sign_date.split('T')[0] : <Tag>未签</Tag>}
                </Descriptions.Item>
                <Descriptions.Item label="本次安装量">
                  <Tag color="green">
                    {record.items?.find((it: any) => it.equipment_item_id === previewDevice.item_id)?.quantity || 0}
                  </Tag>
                </Descriptions.Item>
              </Descriptions>

              {record.items?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>设备明细</div>
                  <Table
                    dataSource={record.items}
                    rowKey="_key"
                    size="small"
                    pagination={false}
                    columns={[
                      { title: '设备名称', dataIndex: 'equipment_name', width: 180 },
                      { title: '规格型号', dataIndex: 'specification', width: 130 },
                      { title: '单位', dataIndex: 'unit', width: 50 },
                      { title: '数量', dataIndex: 'quantity', width: 60 },
                      { title: '安装位置', dataIndex: 'location', width: 100, render: (v: string) => v || '--' },
                      { title: '备注', dataIndex: 'remark', width: 100, render: (v: string) => v || '--' },
                    ]}
                  />
                </div>
              )}

              {record.images && (
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>安装现场图片</div>
                  <Space wrap>
                    {record.images.split(',').filter(Boolean).map((filename: string, idx: number) => (
                      <Image
                        key={idx}
                        src={`/uploads/${filename}`}
                        width={140}
                        height={140}
                        style={{ objectFit: 'cover', borderRadius: 4 }}
                        fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTQwIiBoZWlnaHQ9IjE0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTQwIiBoZWlnaHQ9IjE0MCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjcwIiB5PSI3MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiNiZmJmYmYiIGZvbnQtc2l6ZT0iMTIiPuWbvueJh+WKoOi9veWksei0pTwvdGV4dD48L3N2Zz4="
                      />
                    ))}
                  </Space>
                </div>
              )}
            </Card>
          ))
        )}
      </Drawer>

      <Modal
        title="多选设备合并分配使用单位"
        open={mergeAllocModalOpen}
        onCancel={() => setMergeAllocModalOpen(false)}
        width={960}
        footer={[
          <Button key="cancel" onClick={() => setMergeAllocModalOpen(false)}>取消</Button>,
          <Button key="save" type="default" loading={mergeAllocSaving}
            onClick={() => saveMergeAlloc(false)}>
            仅保存分配
          </Button>,
          <Button key="generate" type="primary" loading={mergeAllocSaving}
            onClick={() => saveMergeAlloc(true)}
            style={{ background: '#722ed1', borderColor: '#722ed1' }}>
            保存并生成记录
          </Button>,
        ]}
      >
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          <Table
            dataSource={unrecordedWithRecords.filter((u: any) => selectedRowKeys.includes(u.item_id))}
            rowKey="item_id"
            size="small"
            pagination={false}
            columns={[
              { title: '设备名称', dataIndex: 'item_name', width: 160, ellipsis: true },
              { title: '规格', dataIndex: 'specification', width: 120, ellipsis: true },
              {
                title: '待安装', width: 70, render: (_: any, r: any) =>
                  <Tag color="orange">{r.uninstalled_quantity}</Tag>
              },
              ...useUnits.map(u => ({
                title: u, width: 95,
                render: (_: any, record: any) => (
                  <InputNumber
                    size="small"
                    min={0}
                    max={record.uninstalled_quantity}
                    style={{ width: 72 }}
                    value={mergeAllocValues[record.item_id]?.[u] || 0}
                    onChange={v => setMergeAllocValues(prev => ({
                      ...prev,
                      [record.item_id]: { ...(prev[record.item_id] || {}), [u]: v || 0 }
                    }))}
                  />
                ),
              })),
              {
                title: '已分配', width: 70,
                render: (_: any, record: any) => {
                  const total = Object.values(mergeAllocValues[record.item_id] || {}).reduce((s: number, v: any) => s + (v || 0), 0)
                  return <Tag color={total === record.uninstalled_quantity ? 'green' : total > record.uninstalled_quantity ? 'red' : 'blue'}>{total}</Tag>
                }
              },
            ]}
          />
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <Space>
          <Tag color="blue">已选设备: {selectedRowKeys.length} 项</Tag>
          <Tag color="purple">生成后将按使用单位创建多条安装记录</Tag>
        </Space>
      </Modal>

      <Modal
        title="管理使用单位"
        open={unitManageOpen}
        onCancel={() => setUnitManageOpen(false)}
        width={560}
        footer={[
          <Button key="cancel" onClick={() => setUnitManageOpen(false)}>取消</Button>,
          <Button key="save" type="primary" loading={unitManageSaving}
            onClick={handleSaveUnits}>
            保存
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 12 }}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddUnit} block>
            添加使用单位
          </Button>
        </div>
        <Table
          dataSource={unitObjects}
          rowKey={(r: any) => r.id}
          size="small"
          pagination={false}
          columns={[
            { title: '序号', width: 60, render: (_: any, __: any, idx: number) => idx + 1 },
            {
              title: '单位名称', render: (_: any, r: any) => (
                <Input
                  value={r.name}
                  placeholder="输入使用单位名称"
                  onChange={(e) => handleUnitNameChange(r.id, e.target.value)}
                  status={!r.name.trim() ? 'error' : undefined}
                />
              ),
            },
            {
              title: '操作', width: 80, render: (_: any, r: any) => (
                <Popconfirm
                  title={`确定删除使用单位「${r.name}」？`}
                  description="删除后已分配的数据将保留，但不能再新增分配"
                  onConfirm={() => handleDeleteUnit(r.id)}
                  okText="删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button type="link" danger icon={<DeleteOutlined />} size="small">删除</Button>
                </Popconfirm>
              ),
            },
          ]}
          locale={{ emptyText: '暂无使用单位，点击上方按钮添加' }}
        />
      </Modal>

      <Modal
        title="导出安装设备确认单"
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        onOk={handleExportConfirmation}
        confirmLoading={exportLoading}
        okText="导出Excel"
        cancelText="取消"
        width={420}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>选择使用单位</div>
          <Select
            value={exportUnit || undefined}
            onChange={(v) => setExportUnit(v)}
            placeholder="请选择使用单位"
            style={{ width: '100%' }}
            options={useUnits.map(u => ({ label: u, value: u }))}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>文档编号（可选）</div>
          <Input
            value={exportDocNo}
            onChange={(e) => setExportDocNo(e.target.value)}
            placeholder="例：CX-ZNGD-AZQRD-DX-0005"
          />
        </div>
      </Modal>
    </Card>
  )
}
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Card, Button, Select, DatePicker, InputNumber, Space, message, Modal, Form, Table, Tag, Popconfirm, Input } from 'antd'
import { PlusOutlined, CalculatorOutlined, DeleteOutlined, SyncOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons'
import { progressApi, equipmentApi, exportApi } from '../api'
import dayjs from 'dayjs'
import { useAuth } from '../components/AuthContext'
import { useContract } from '../components/ContractContext'

const { RangePicker } = DatePicker

export default function ProgressEntry() {
  const [periods, setPeriods] = useState<any[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [entries, setEntries] = useState<Record<number, any>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchInputText, setSearchInputText] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [loadingEntries, setLoadingEntries] = useState(false)
  const entriesRef = useRef<Record<number, any>>({})
  const loadedEntryIdsRef = useRef<Set<number>>(new Set())
  const itemsRef = useRef<any[]>([])
  const categoriesRef = useRef<any[]>([])
  const { canEdit } = useAuth()
  const { currentContractId } = useContract()

  // 使用 ref 保持最新 items 和 categories，避免 updateField 等回调的闭包过期
  itemsRef.current = items
  categoriesRef.current = categories

  useEffect(() => {
    progressApi.periods(currentContractId).then(setPeriods)
    equipmentApi.list(currentContractId).then(setItems)
    equipmentApi.categories(currentContractId).then(setCategories)
  }, [currentContractId])

  useEffect(() => {
    if (selectedPeriod) {
      setLoadingEntries(true)
      progressApi.getEntries(selectedPeriod).then((data: any[]) => {
        const map: Record<number, any> = {}
        const loadedIds = new Set<number>()
        data.forEach((e: any) => {
          map[e.item_id] = e
          loadedIds.add(e.item_id)
        })
        setEntries(map)
        entriesRef.current = map
        loadedEntryIdsRef.current = loadedIds
      }).finally(() => setLoadingEntries(false))
    } else {
      setEntries({})
      entriesRef.current = {}
      loadedEntryIdsRef.current = new Set()
    }
  }, [selectedPeriod])

  // 保持 ref 始终指向最新的 entries，避免 handleSave 中的闭包过期问题
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  // 清理搜索定时器
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }
    }
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setSearchInputText(value)
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    searchTimerRef.current = setTimeout(() => {
      setSearchText(value)
    }, 300)
  }, [])

  // updateField 通过 ref 访问 items，避免闭包过期导致依赖变化
  const updateField = useCallback((itemId: number, field: string, value: number) => {
    setEntries(prev => {
      const existing = prev[itemId] || { item_id: itemId }
      const item = itemsRef.current.find(i => i.id === itemId)
      const unitPrice = item?.unit_price || 0
      const updated = { ...existing, [field]: value }

      if (field === 'contractor_prev_cumulative' || field === 'contractor_current') {
        updated.contractor_total_cumulative =
          (updated.contractor_prev_cumulative || 0) + (updated.contractor_current || 0)
        if (existing.settlement_amount === undefined || existing.settlement_amount === 0 ||
            field === 'contractor_current') {
          updated.settlement_amount = (updated.contractor_current || 0) * unitPrice
        }
        if (field === 'contractor_prev_cumulative') {
          updated.dept_prev_cumulative = value
          updated.dept_total_cumulative =
            value + (updated.dept_current || 0)
        }
        if (field === 'contractor_current') {
          updated.dept_current = value
          updated.dept_total_cumulative =
            (updated.dept_prev_cumulative || 0) + value
        }
        if (!existing.payment_amount || field === 'contractor_current') {
          updated.payment_amount = updated.settlement_amount || (updated.dept_current || 0) * unitPrice
        }
      }
      if (field === 'dept_prev_cumulative' || field === 'dept_current') {
        updated.dept_total_cumulative =
          (updated.dept_prev_cumulative || 0) + (updated.dept_current || 0)
        if (!existing.payment_amount || field === 'dept_current') {
          updated.payment_amount = updated.settlement_amount || (updated.dept_current || 0) * unitPrice
        }
      }
      return { ...prev, [itemId]: updated }
    })
  }, [])

  const handleSave = async () => {
    if (!selectedPeriod) return
    setSaving(true)
    try {
      const currentEntries = entriesRef.current
      const loadedIds = loadedEntryIdsRef.current
      const allValues = Object.values(currentEntries)
      const data = allValues.filter((e: any) =>
        e.contractor_current > 0 || e.dept_current > 0 ||
        e.contractor_prev_cumulative > 0 || e.dept_prev_cumulative > 0 ||
        e.contractor_total_cumulative > 0 || e.dept_total_cumulative > 0 ||
        e.settlement_amount > 0 || e.payment_amount > 0
      )
      // 确保从 API 加载过的条目始终被包含，允许用户将值清零
      const savedIds = new Set(data.map((e: any) => e.item_id))
      loadedIds.forEach((itemId: number) => {
        if (!savedIds.has(itemId) && currentEntries[itemId]) {
          data.push(currentEntries[itemId])
        }
      })
      // 清理多余字段，只发送后端需要的字段
      const cleanData = data.map((e: any) => ({
        item_id: e.item_id,
        contractor_prev_cumulative: e.contractor_prev_cumulative || 0,
        contractor_current: e.contractor_current || 0,
        contractor_total_cumulative: e.contractor_total_cumulative || 0,
        dept_prev_cumulative: e.dept_prev_cumulative || 0,
        dept_current: e.dept_current || 0,
        dept_total_cumulative: e.dept_total_cumulative || 0,
        settlement_amount: e.settlement_amount || 0,
        payment_amount: e.payment_amount || 0,
      }))
      await progressApi.batchUpdate(cleanData, selectedPeriod)
      message.success('保存成功')
    } catch (err: any) {
      console.error('保存进度失败:', err)
      message.error('保存失败: ' + (err?.response?.data?.detail || err?.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  const handleCreatePeriod = async () => {
    try {
      const values = await form.validateFields()
      await progressApi.createPeriod({
        period_no: values.period_no,
        start_date: values.date_range[0].format('YYYY-MM-DD'),
        end_date: values.date_range[1].format('YYYY-MM-DD'),
        entries: []
      }, currentContractId)
      message.success('期次创建成功')
      setModalOpen(false)
      form.resetFields()
      progressApi.periods(currentContractId).then(setPeriods)
    } catch { /* form validation */ }
  }

  const handleDeletePeriod = async () => {
    if (!selectedPeriod) return
    try {
      await progressApi.deletePeriod(selectedPeriod)
      message.success('期次已删除')
      setSelectedPeriod(null)
      setEntries({})
      entriesRef.current = {}
      loadedEntryIdsRef.current = new Set()
      progressApi.periods(currentContractId).then(setPeriods)
    } catch (err: any) {
      message.error('删除失败: ' + (err?.response?.data?.detail || err?.message || '未知错误'))
    }
  }

  const handleExport = async () => {
    if (!selectedPeriod) return
    setExporting(true)
    try {
      await exportApi.quantityVerification(selectedPeriod)
      message.success('导出成功')
    } catch (err: any) {
      message.error('导出失败')
    } finally {
      setExporting(false)
    }
  }

  const handleSyncAll = useCallback(() => {
    const currentItems = itemsRef.current
    setEntries(prev => {
      const next = { ...prev }
      currentItems.forEach(item => {
        const existing = next[item.id] || { item_id: item.id }
        if (!existing.contractor_prev_cumulative && !existing.contractor_current) return
        const unitPrice = item.unit_price || 0
        const updated = { ...existing }
        let changed = false

        if (existing.contractor_prev_cumulative !== existing.dept_prev_cumulative) {
          updated.dept_prev_cumulative = existing.contractor_prev_cumulative || 0
          changed = true
        }
        if (existing.contractor_current !== existing.dept_current) {
          updated.dept_current = existing.contractor_current || 0
          changed = true
        }
        if (changed) {
          updated.dept_total_cumulative =
            (updated.dept_prev_cumulative || 0) + (updated.dept_current || 0)
          if (existing.payment_amount === undefined || existing.payment_amount === 0) {
            updated.payment_amount = existing.settlement_amount || (updated.dept_current || 0) * unitPrice
          }
          next[item.id] = updated
        }
      })
      return next
    })
    message.success('项目部核定数据已同步')
  }, [])

  const handleDeptFocus = useCallback((itemId: number, field: string) => {
    const currentItems = itemsRef.current
    setEntries(prev => {
      const existing = prev[itemId]
      if (!existing) return prev
      const item = currentItems.find(i => i.id === itemId)
      const unitPrice = item?.unit_price || 0
      const updated = { ...existing }
      let changed = false

      if (field === 'dept_prev_cumulative' && existing.dept_prev_cumulative !== existing.contractor_prev_cumulative) {
        updated.dept_prev_cumulative = existing.contractor_prev_cumulative || 0
        changed = true
      }
      if (field === 'dept_current' && existing.dept_current !== existing.contractor_current) {
        updated.dept_current = existing.contractor_current || 0
        changed = true
      }

      if (changed) {
        updated.dept_total_cumulative =
          (updated.dept_prev_cumulative || 0) + (updated.dept_current || 0)
        if (existing.payment_amount === undefined || existing.payment_amount === 0) {
          updated.payment_amount = existing.settlement_amount || (updated.dept_current || 0) * unitPrice
        }
        return { ...prev, [itemId]: updated }
      }
      return prev
    })
  }, [])

  const getCatName = useCallback((item: any) => {
    const cat = categoriesRef.current.find((c: any) => c.id === item.category_id)
    return cat?.name || ''
  }, [])

  const getTaxRate = useCallback((item: any) => {
    const cat = categoriesRef.current.find((c: any) => c.id === item.category_id)
    return cat?.tax_rate ? `${(cat.tax_rate * 100).toFixed(0)}%` : '13%'
  }, [])

  const filteredItems = useMemo(() => {
    let data = items
    if (categoryFilter != null) {
      data = data.filter((it: any) => it.category_id === categoryFilter)
    }
    if (searchText) {
      const kw = searchText.toLowerCase()
      data = data.filter((it: any) =>
        (it.name || '').toLowerCase().includes(kw) ||
        (it.specification || '').toLowerCase().includes(kw)
      )
    }
    return data
  }, [items, categoryFilter, searchText])

  const columns = useMemo(() => [
    { title: '大类', width: 140, render: (_: any, r: any) => {
      const name = getCatName(r)
      return name ? <Tag color={getTaxRate(r) === '6%' ? 'purple' : 'blue'}>{name}</Tag> : ''
    }},
    { title: '序号', dataIndex: 'seq_no', width: 55 },
    { title: '设备名称', dataIndex: 'name', width: 180, fixed: 'left' as const },
    { title: '规格', dataIndex: 'specification', width: 130, ellipsis: true },
    { title: '单位', dataIndex: 'unit', width: 45 },
    { title: '合同量', dataIndex: 'contract_quantity', width: 65 },
    { title: '单价', dataIndex: 'unit_price', width: 80, render: (v: number) => v ? `¥${v}` : '-' },
    {
      title: '承包商', key: 'contractor', children: [
        { title: '至上期累计', width: 90,
          render: (_: any, r: any) => (
            <InputNumber size="small" style={{ width: '100%' }} min={0}
              value={entries[r.id]?.contractor_prev_cumulative || 0}
              onChange={(v) => updateField(r.id, 'contractor_prev_cumulative', v || 0)}
              disabled={!canEdit} />
          )
        },
        { title: '本期完成', width: 90,
          render: (_: any, r: any) => (
            <InputNumber size="small" style={{ width: '100%' }} min={0}
              value={entries[r.id]?.contractor_current || 0}
              onChange={(v) => updateField(r.id, 'contractor_current', v || 0)}
              disabled={!canEdit} />
          )
        },
        { title: '至本期累计', width: 85,
          render: (_: any, r: any) => (
            <Tag>{(entries[r.id]?.contractor_prev_cumulative || 0) + (entries[r.id]?.contractor_current || 0)}</Tag>
          )
        },
      ]
    },
    { title: '项目部核定', key: 'dept', children: [
        { title: '至上期累计', width: 90,
          render: (_: any, r: any) => (
            <InputNumber size="small" style={{ width: '100%' }} min={0}
              value={entries[r.id]?.dept_prev_cumulative || 0}
              onChange={(v) => updateField(r.id, 'dept_prev_cumulative', v || 0)}
              onFocus={() => handleDeptFocus(r.id, 'dept_prev_cumulative')}
              disabled={!canEdit} />
          )
        },
        { title: '本期核定', width: 90,
          render: (_: any, r: any) => (
            <InputNumber size="small" style={{ width: '100%' }} min={0}
              value={entries[r.id]?.dept_current || 0}
              onChange={(v) => updateField(r.id, 'dept_current', v || 0)}
              onFocus={() => handleDeptFocus(r.id, 'dept_current')}
              disabled={!canEdit} />
          )
        },
        { title: '至本期累计', width: 85,
          render: (_: any, r: any) => (
            <Tag color="green">{(entries[r.id]?.dept_prev_cumulative || 0) + (entries[r.id]?.dept_current || 0)}</Tag>
          )
        },
      ]
    },
    { title: '结算金额', width: 105,
      render: (_: any, r: any) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} precision={2}
          value={entries[r.id]?.settlement_amount || 0}
          onChange={(v) => updateField(r.id, 'settlement_amount', v || 0)}
          disabled={!canEdit} />
      )
    },
    { title: '结算应支付金额', width: 105,
      render: (_: any, r: any) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} precision={2}
          value={entries[r.id]?.payment_amount || 0}
          onChange={(v) => updateField(r.id, 'payment_amount', v || 0)}
          disabled={!canEdit} />
      )
    },
  ], [entries, canEdit, updateField, handleDeptFocus, getCatName, getTaxRate])

  return (
    <Card title="进度录入（基于EXCEL表结构）" extra={
      <Space>
        <Select
          placeholder="选择期次"
          style={{ width: 280 }}
          value={selectedPeriod}
          onChange={setSelectedPeriod}
          allowClear
          options={periods.map((p: any) => ({
            label: `第${p.period_no}期 (${p.start_date} ~ ${p.end_date})`,
            value: p.id
          }))}
        />
        {canEdit && (
          <>
            <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新建期次</Button>
            <Popconfirm
              title="确定要删除该期次吗？将同时删除该期次的进度和结算数据，关联的安装记录将保留但解绑期次。"
              onConfirm={handleDeletePeriod}
              okText="确定" cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />} disabled={!selectedPeriod}>删除期次</Button>
            </Popconfirm>
            <Button icon={<SyncOutlined />} onClick={handleSyncAll} disabled={!selectedPeriod}>
              一键同步
            </Button>
            <Button type="primary" icon={<CalculatorOutlined />} onClick={handleSave} loading={saving} disabled={!selectedPeriod}>
              保存进度
            </Button>
            <Button icon={<FileExcelOutlined />} onClick={handleExport} loading={exporting} disabled={!selectedPeriod}>
              导出核对表
            </Button>
          </>
        )}
        {!canEdit && selectedPeriod && <Tag color="blue">只读模式</Tag>}
      </Space>
    }>
      {selectedPeriod ? (
        <>
          <div style={{ marginBottom: 8, color: '#666' }}>
            公式: 至本期累计 = 至上期累计 + 本期完成 &nbsp;|&nbsp;
            结算金额 = 本期完成 × 综合单价 &nbsp;|&nbsp;
            <Tag color="purple" style={{ marginLeft: 8 }}>紫标=6%税率</Tag>
            <Tag color="blue">蓝标=13%税率</Tag>
          </div>
          <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Input
              placeholder="搜索设备名称/规格"
              prefix={<SearchOutlined />}
              allowClear
              style={{ width: 220 }}
              value={searchInputText}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
            <Select
              allowClear
              placeholder="筛选大类"
              style={{ width: 180 }}
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c: any) => ({ label: c.name, value: c.id }))}
            />
          </div>
          <Table
            dataSource={filteredItems}
            columns={columns}
            rowKey="id"
            size="small"
            scroll={{ x: 1600 }}
            pagination={{ pageSize: 50 }}
            loading={loadingEntries}
          />
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          请选择或创建一个期次来录入进度数据
        </div>
      )}

      <Modal
        title="新建期次"
        open={modalOpen}
        onOk={handleCreatePeriod}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        okText="创建" cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item label="期次编号" name="period_no" rules={[{ required: true, message: '请输入期次编号' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="如：1" />
          </Form.Item>
          <Form.Item label="日期范围" name="date_range" rules={[{ required: true, message: '请选择日期范围' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
import React, { useEffect, useState, useMemo } from 'react'
import { Card, Table, Select, Tag, Space, Input } from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import { progressApi, equipmentApi } from '../api'
import { useContract } from '../components/ContractContext'

export default function Verification() {
  const [periods, setPeriods] = useState<any[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [diffFilter, setDiffFilter] = useState<string>('all')
  const [categories, setCategories] = useState<any[]>([])
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>()
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(false)
  const { currentContractId } = useContract()

  useEffect(() => {
    progressApi.periods(currentContractId).then(setPeriods)
    equipmentApi.list(currentContractId).then(setItems)
    equipmentApi.categories(currentContractId).then(setCategories).catch(() => {})
  }, [currentContractId])

  useEffect(() => {
    if (selectedPeriod) {
      setLoading(true)
      progressApi.getEntries(selectedPeriod).then((data: any[]) => {
        setEntries(data || [])
      }).finally(() => setLoading(false))
    } else {
      setEntries([])
    }
  }, [selectedPeriod])

  // 将全部设备清单与进度数据合并，确保所有设备都显示
  const mergedData = useMemo(() => {
    const entryMap = new Map<number, any>()
    entries.forEach((e: any) => entryMap.set(e.item_id, e))

    return items.map((item: any) => {
      const entry = entryMap.get(item.id)
      const base = {
        id: item.id,
        item_id: item.id,
        seq_no: item.seq_no || '-',
      }
      if (entry) {
        return { ...entry, ...base }
      }
      return {
        ...base,
        item_name: item.name,
        item_spec: item.specification,
        item_unit: item.unit,
        item_contract_qty: item.contract_quantity,
        contractor_prev_cumulative: 0,
        contractor_current: 0,
        dept_prev_cumulative: 0,
        dept_current: 0,
      }
    })
  }, [items, entries])

  // 按差异状态、大类、关键词筛选
  const filteredData = useMemo(() => {
    let data = mergedData
    // 差异筛选
    if (diffFilter !== 'all') {
      data = data.filter((e: any) => {
        const contractQty = e.item_contract_qty || 0
        const contractorCum = (e.contractor_prev_cumulative || 0) + (e.contractor_current || 0)
        if (diffFilter === 'match') return contractorCum === contractQty
        if (diffFilter === 'over') return contractorCum > contractQty
        if (diffFilter === 'under') return contractorCum < contractQty
        if (diffFilter === 'diff') return contractorCum !== contractQty
        return true
      })
    }
    // 大类筛选
    if (categoryFilter) {
      const catItems = items.filter((it: any) => it.category_id === categoryFilter)
      const catItemIds = new Set(catItems.map((it: any) => it.id))
      data = data.filter((e: any) => catItemIds.has(e.item_id))
    }
    // 关键词搜索
    if (searchText) {
      const kw = searchText.toLowerCase()
      data = data.filter((e: any) =>
        (e.item_name || '').toLowerCase().includes(kw) ||
        (e.item_spec || '').toLowerCase().includes(kw)
      )
    }
    return data
  }, [mergedData, diffFilter, categoryFilter, searchText, items])

  const diffColumns = useMemo(() => [
    { title: '序号', dataIndex: 'seq_no', width: 60 },
    { title: '设备名称', dataIndex: 'item_name', width: 200 },
    { title: '规格型号', dataIndex: 'item_spec', width: 140 },
    { title: '单位', dataIndex: 'item_unit', width: 50 },
    { title: '合同量', dataIndex: 'item_contract_qty', width: 80 },
    {
      title: '承包商上报量', key: 'contractor', width: 250, children: [
        { title: '至上期累计', dataIndex: 'contractor_prev_cumulative', width: 80 },
        { title: '本期完成', dataIndex: 'contractor_current', width: 80 },
        { title: '至本期累计', width: 80, render: (_: any, r: any) =>
          (r.contractor_prev_cumulative || 0) + (r.contractor_current || 0)
        },
      ]
    },
    {
      title: '项目部核定', key: 'dept', width: 250, children: [
        { title: '至上期累计', dataIndex: 'dept_prev_cumulative', width: 80 },
        { title: '本期完成', dataIndex: 'dept_current', width: 80 },
        { title: '至本期累计', width: 80, render: (_: any, r: any) =>
          (r.dept_prev_cumulative || 0) + (r.dept_current || 0)
        },
      ]
    },
    {
      title: '差异', key: 'diff', width: 100,
      render: (_: any, r: any) => {
        const contractQty = r.item_contract_qty || 0
        const contractorCum = (r.contractor_prev_cumulative || 0) + (r.contractor_current || 0)
        if (contractorCum === contractQty) return <Tag color="green">一致</Tag>
        if (contractorCum > contractQty) return <Tag color="red">+{contractorCum - contractQty}</Tag>
        return <Tag color="orange">-{contractQty - contractorCum}</Tag>
      }
    },
  ], [])

  const summaryData = useMemo(() => {
    let totalContractQty = 0
    let totalContractor = 0
    let overCount = 0
    let underCount = 0
    let matchCount = 0
    mergedData.forEach((e: any) => {
      const contractQty = e.item_contract_qty || 0
      const contractorCum = (e.contractor_prev_cumulative || 0) + (e.contractor_current || 0)
      totalContractQty += contractQty
      totalContractor += contractorCum
      if (contractorCum > contractQty) overCount++
      else if (contractorCum < contractQty) underCount++
      else matchCount++
    })
    const diffCount = overCount + underCount
    return { totalContractQty, totalContractor, overCount, underCount, matchCount, diffCount }
  }, [mergedData])

  const summary = summaryData

  return (
    <Card title="工程量核对" extra={
      <Space wrap>
        <Input
          placeholder="搜索设备名称/规格"
          prefix={<SearchOutlined />}
          allowClear
          style={{ width: 200 }}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Select
          allowClear
          placeholder="筛选大类"
          style={{ width: 150 }}
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categories.map((c: any) => ({ label: c.name, value: c.id }))}
        />
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
        <Select
          placeholder="差异筛选"
          style={{ width: 120 }}
          value={diffFilter}
          onChange={setDiffFilter}
          options={[
            { label: '全部', value: 'all' },
            { label: '一致', value: 'match' },
            { label: '超量', value: 'over' },
            { label: '缺量', value: 'under' },
            { label: '差异', value: 'diff' },
          ]}
        />
      </Space>
    }>
      {selectedPeriod && (
        <div style={{ marginBottom: 16 }}>
          <Tag color="default">合同量合计: {summary.totalContractQty}</Tag>
          <Tag color="blue">承包商上报合计: {summary.totalContractor}</Tag>
          <Tag color="green" style={{ cursor: 'pointer' }} onClick={() => setDiffFilter('match')}>一致: {summary.matchCount}项</Tag>
          <Tag color="red" style={{ cursor: 'pointer' }} onClick={() => setDiffFilter('over')}>超量: {summary.overCount}项</Tag>
          {summary.underCount > 0 && <Tag color="orange" style={{ cursor: 'pointer' }} onClick={() => setDiffFilter('under')}>缺量: {summary.underCount}项</Tag>}
          <Tag color={summary.diffCount > 0 ? 'red' : 'green'} style={{ cursor: 'pointer' }} onClick={() => setDiffFilter('diff')}>
            差异项数: {summary.diffCount}
          </Tag>
        </div>
      )}
      <Table
        dataSource={filteredData}
        columns={diffColumns}
        rowKey="item_id"
        size="small"
        scroll={{ x: 1000 }}
        pagination={{ pageSize: 50 }}
        loading={loading}
        locale={{ emptyText: '请先选择期次查看核对数据' }}
      />
    </Card>
  )
}
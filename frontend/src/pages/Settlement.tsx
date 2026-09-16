import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { Card, Table, Statistic, Row, Col, Tag, Select, Descriptions, Button, InputNumber, Space, message } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { settlementApi, progressApi } from '../api'
import { useAuth } from '../components/AuthContext'
import { useContract } from '../components/ContractContext'

export default function Settlement() {
  const [summary, setSummary] = useState<any>({})
  const [detail, setDetail] = useState<any[]>([])
  const [periods, setPeriods] = useState<any[]>([])
  const [periodId, setPeriodId] = useState<number | undefined>()
  const [actualPaidMap, setActualPaidMap] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const { canEdit } = useAuth()
  const { currentContractId } = useContract()

  const loadDetail = useCallback(() => {
    setLoading(true)
    settlementApi.detail(currentContractId, periodId).then((data: any[]) => {
      setDetail(data)
      const map: Record<number, number> = {}
      data.forEach((d: any) => {
        map[d.item_id] = d.actual_paid || 0
      })
      setActualPaidMap(map)
    }).finally(() => setLoading(false))
  }, [periodId, currentContractId])

  useEffect(() => {
    settlementApi.summary(currentContractId).then(setSummary)
    progressApi.periods(currentContractId).then(setPeriods)
  }, [currentContractId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const handleSaveActualPaid = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      const entries = Object.entries(actualPaidMap).map(([itemId, amount]) => ({
        item_id: parseInt(itemId),
        actual_paid_amount: amount || 0,
      }))
      await settlementApi.updateActualPaid(entries, periodId, currentContractId)
      message.success('实际支付金额保存成功')
      settlementApi.summary(currentContractId).then(setSummary)
      loadDetail()
    } catch (err: any) {
      message.error('保存失败: ' + (err?.response?.data?.detail || err?.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  const updateActualPaid = (itemId: number, value: number | null) => {
    setActualPaidMap(prev => ({ ...prev, [itemId]: value || 0 }))
    // 同步更新 detail 以实时显示待支付
    setDetail(prev => prev.map(d => {
      if (d.item_id === itemId) {
        return { ...d, actual_paid: value || 0, unpaid: Math.round(((d.total_settlement || 0) - (value || 0)) * 100) / 100 }
      }
      return d
    }))
  }

  const columns = useMemo(() => [
    { title: '设备名称', dataIndex: 'item_name', width: 200, fixed: 'left' as const },
    { title: '规格型号', dataIndex: 'specification', width: 150 },
    { title: '单位', dataIndex: 'unit', width: 50 },
    { title: '合同量', dataIndex: 'contract_quantity', width: 70 },
    { title: '单价', dataIndex: 'unit_price', width: 90, render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '合同金额', dataIndex: 'contract_amount', width: 110, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '税率', dataIndex: 'tax_rate', width: 60, render: (v: number) => `${(v * 100).toFixed(0)}%` },
    { title: '核定累计', dataIndex: 'dept_verified_cumulative', width: 80 },
    { title: '完成率', dataIndex: 'completion_rate', width: 80, render: (v: number) => (
      <Tag color={v >= 100 ? 'green' : v > 0 ? 'blue' : 'default'}>{v}%</Tag>
    )},
    { title: '累计结算', dataIndex: 'total_settlement', width: 110, render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '结算应支付', dataIndex: 'total_paid', width: 110, render: (v: number) => `¥${v.toLocaleString()}` },
    { title: '实际支付', dataIndex: 'actual_paid', width: 110,
      render: (_: any, r: any) => (
        canEdit ? (
          <InputNumber
            size="small"
            style={{ width: '100%' }}
            min={0}
            precision={2}
            value={actualPaidMap[r.item_id] ?? 0}
            onChange={(v) => updateActualPaid(r.item_id, v)}
          />
        ) : (
          <span>{`¥${(r.actual_paid || 0).toLocaleString()}`}</span>
        )
      )
    },
    { title: '待支付', dataIndex: 'unpaid', width: 110, render: (v: number) => (
      <span style={{ color: v > 0 ? '#ff4d4f' : '#52c41a' }}>¥{v.toLocaleString()}</span>
    )},
  ], [canEdit, actualPaidMap])

  const totalSettlement = detail.reduce((s: number, d: any) => s + (d.total_settlement || 0), 0)
  const totalSettlementTax = detail.reduce((s: number, d: any) => s + (d.total_settlement_tax || 0), 0)
  const totalPaid = detail.reduce((s: number, d: any) => s + (d.total_paid || 0), 0)
  const totalActualPaid = Object.values(actualPaidMap).reduce((s: number, v: number) => s + (v || 0), 0)
  const totalUnpaid = detail.reduce((s: number, d: any) => s + (d.unpaid || 0), 0)

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card><Statistic title="合同金额" value={summary.contract_amount || 0} prefix="¥" precision={2} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="累计结算(不含税)" value={summary.total_settlement || 0} prefix="¥" precision={2} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="实际支付" value={summary.total_actual_paid || 0} prefix="¥" precision={2} /></Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card><Statistic title="待支付" value={summary.unpaid || 0} prefix="¥" precision={2}
            valueStyle={{ color: (summary.unpaid || 0) > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions title="结算审批计算（基于EXCEL公式）" bordered size="small" column={3}>
          <Descriptions.Item label="含税结算合计">¥{summary.total_settlement_tax?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="税金">¥{summary.tax_amount?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="不含税结算">¥{summary.total_settlement?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="预付款扣抵">¥{summary.deduction_prepayment?.toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="质保金(10%)">
            <Tag color="orange">¥{summary.deduction_warranty?.toLocaleString()}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="结算应支付金额">
            <Tag color="green" style={{ fontSize: 14 }}>¥{summary.payment_amount?.toLocaleString()}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="支付比例" span={2}>
            <Tag color="blue">{(summary.payment_ratio * 100)?.toFixed(2)}%</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="完成比例">
            <Tag color={summary.completion_rate >= 100 ? 'green' : 'blue'}>{summary.completion_rate}%</Tag>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="结算明细" extra={
        <Space>
          <Select
            allowClear
            placeholder="按期次筛选"
            style={{ width: 250 }}
            value={periodId}
            onChange={setPeriodId}
            options={periods.map((p: any) => ({
              label: `第${p.period_no}期 (${p.start_date} ~ ${p.end_date})`,
              value: p.id
            }))}
          />
          {canEdit && (
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSaveActualPaid}
              loading={saving}
            >
              保存实际支付
            </Button>
          )}
        </Space>
      }>
        <div style={{ marginBottom: 16 }}>
          <Tag color="blue">结算合计（不含税）: ¥{totalSettlement.toLocaleString()}</Tag>
          <Tag color="purple">结算合计（含税）: ¥{totalSettlementTax.toLocaleString()}</Tag>
          <Tag color="orange">结算应支付合计: ¥{totalPaid.toLocaleString()}</Tag>
          <Tag color="green">实际支付合计: ¥{totalActualPaid.toLocaleString()}</Tag>
          <Tag color="red">待支付合计: ¥{totalUnpaid.toLocaleString()}</Tag>
        </div>
        <Table
          dataSource={detail}
          columns={columns}
          rowKey="item_id"
          size="small"
          scroll={{ x: 1550 }}
          pagination={{ pageSize: 50 }}
          loading={loading}
          locale={{ emptyText: '暂无结算数据，请先在进度录入中录入数据' }}
        />
      </Card>
    </div>
  )
}
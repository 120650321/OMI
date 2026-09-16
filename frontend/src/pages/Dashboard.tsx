import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Statistic, Table, Button, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { settlementApi, installationApi, importApi } from '../api'
import { useAuth } from '../components/AuthContext'
import { useContract } from '../components/ContractContext'

export default function Dashboard() {
  const [summary, setSummary] = useState<any>({})
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { canEdit } = useAuth()
  const { currentContractId } = useContract()

  const load = () => {
    settlementApi.summary(currentContractId).then(setSummary).catch(() => {})
    installationApi.list(currentContractId).then((d: any) => setRecords(d || [])).catch(() => {})
  }

  useEffect(() => { load() }, [currentContractId])

  const handleImport = async () => {
    setLoading(true)
    try {
      await importApi.fromExcel(currentContractId)
      message.success('数据导入成功')
      load()
    } catch {
      message.error('导入失败，请确认Excel文件存在')
    } finally {
      setLoading(false)
    }
  }

  const recentColumns = [
    { title: '编号', dataIndex: 'record_no', key: 'record_no', width: 100 },
    { title: '设备类型', dataIndex: 'equipment_type', key: 'equipment_type', width: 150 },
    { title: '安装人员', dataIndex: 'install_personnel', key: 'install_personnel', width: 200 },
    { title: '安装日期', dataIndex: 'install_date', key: 'install_date', width: 120, render: (v: string) => v?.split('T')[0] },
    { title: '使用单位', dataIndex: 'use_unit', key: 'use_unit', width: 150 },
  ]

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="合同金额" value={summary.contract_amount || 0} prefix="¥" precision={2} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="累计结算" value={summary.total_settlement || 0} prefix="¥" precision={2} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="累计支付" value={summary.total_paid || 0} prefix="¥" precision={2} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="完成比例" value={summary.completion_rate || 0} suffix="%" precision={2} />
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="快速操作">
            {canEdit && (
              <>
                <Button type="primary" onClick={handleImport} loading={loading} style={{ marginRight: 8 }}>
                  从Excel导入合同数据
                </Button>
                <Button onClick={() => navigate('/installation/new')} style={{ marginRight: 8 }}>
                  新建安装记录
                </Button>
                <Button onClick={() => navigate('/progress')}>录入进度数据</Button>
              </>
            )}
            {!canEdit && <span style={{ color: '#999' }}>当前为观察员角色，仅有查看权限</span>}
          </Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="最近安装记录">
            <Table
              dataSource={records?.slice(0, 10)}
              columns={recentColumns}
              rowKey="id"
              size="small"
              pagination={false}
              locale={{ emptyText: '暂无安装记录，请先创建' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
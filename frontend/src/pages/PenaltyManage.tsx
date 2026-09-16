import React, { useEffect, useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, InputNumber, DatePicker, Space, message, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { penaltyApi } from '../api'
import dayjs from 'dayjs'
import { useAuth } from '../components/AuthContext'
import { useContract } from '../components/ContractContext'

export default function PenaltyManage() {
  const [penalties, setPenalties] = useState<any[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const { canEdit } = useAuth()
  const { currentContractId } = useContract()

  const load = () => penaltyApi.list(currentContractId).then(setPenalties)
  useEffect(() => { load() }, [currentContractId])

  const handleCreate = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      await penaltyApi.create({
        doc_no: values.doc_no,
        doc_name: values.doc_name,
        penalty_date: values.penalty_date?.format('YYYY-MM-DD'),
        project_penalty: values.project_penalty || 0,
        personal_penalty: values.personal_penalty || 0,
        total_penalty: (values.project_penalty || 0) + (values.personal_penalty || 0),
        unit: values.unit || '中国电信股份有限公司楚雄分公司',
        category: values.category || '',
      }, currentContractId)
      message.success('添加成功')
      setModalOpen(false)
      form.resetFields()
      load()
    } catch { /* validation */ }
    finally { setLoading(false) }
  }

  const columns = [
    { title: '文件编号', dataIndex: 'doc_no', width: 200 },
    { title: '文件名称', dataIndex: 'doc_name', width: 250 },
    { title: '时间', dataIndex: 'penalty_date', width: 120, render: (v: string) => v?.split('T')[0] },
    { title: '项目罚款', dataIndex: 'project_penalty', width: 120, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '个人罚款', dataIndex: 'personal_penalty', width: 120, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '合计', dataIndex: 'total_penalty', width: 120, render: (v: number) => <Tag color="red">¥{v?.toLocaleString()}</Tag> },
    { title: '单位', dataIndex: 'unit', width: 200, ellipsis: true },
  ]

  const totalPenalty = penalties.reduce((s: number, p: any) => s + (p.total_penalty || 0), 0)

  return (
    <Card title="罚款管理" extra={
      <Space>
        <Tag color="red" style={{ fontSize: 14, padding: '4px 12px' }}>
          罚款合计: ¥{totalPenalty.toLocaleString()}
        </Tag>
        {canEdit && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            添加罚款记录
          </Button>
        )}
      </Space>
    }>
      <Table
        dataSource={penalties}
        columns={columns}
        rowKey="id"
        size="small"
        locale={{ emptyText: '暂无罚款记录' }}
      />

      <Modal
        title="添加罚款记录"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => { setModalOpen(false); form.resetFields() }}
        okText="添加"
        cancelText="取消"
        confirmLoading={loading}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="文件编号" name="doc_no" rules={[{ required: true, message: '请输入文件编号' }]}>
            <Input placeholder="如：CXGCLH-ZNGD-CFTZ-012" />
          </Form.Item>
          <Form.Item label="文件名称" name="doc_name" rules={[{ required: true, message: '请输入文件名称' }]}>
            <Input placeholder="如：关于问题整改不及时的处罚通知" />
          </Form.Item>
          <Form.Item label="时间" name="penalty_date" rules={[{ required: true, message: '请选择时间' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item label="项目罚款" name="project_penalty" initialValue={0}>
              <InputNumber min={0} precision={2} prefix="¥" style={{ width: 180 }} />
            </Form.Item>
            <Form.Item label="个人罚款" name="personal_penalty" initialValue={0}>
              <InputNumber min={0} precision={2} prefix="¥" style={{ width: 180 }} />
            </Form.Item>
          </Space>
          <Form.Item label="处罚单位" name="unit" initialValue="中国电信股份有限公司楚雄分公司">
            <Input />
          </Form.Item>
          <Form.Item label="类别" name="category">
            <Input placeholder="如：安全" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
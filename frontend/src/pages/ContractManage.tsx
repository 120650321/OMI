import React, { useEffect, useState, useRef } from 'react'
import { Card, Table, Button, Space, Popconfirm, message, Modal, Form, Input, InputNumber, DatePicker, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons'
import { contractApi, penaltyApi, importApi } from '../api'
import { useAuth } from '../components/AuthContext'
import { useContract } from '../components/ContractContext'
import dayjs from 'dayjs'

export default function ContractManage() {
  const [contracts, setContracts] = useState<any[]>([])
  const [penalties, setPenalties] = useState<any[]>([])
  const [modalVisible, setModalVisible] = useState(false)
  const [editingContract, setEditingContract] = useState<any>(null)
  const [form] = Form.useForm()
  const { canEdit } = useAuth()
  const { currentContractId } = useContract()

  const load = () => {
    contractApi.list().then(setContracts)
    penaltyApi.list(currentContractId).then(setPenalties)
  }

  useEffect(() => { load() }, [currentContractId])

  const handleCreate = () => {
    setEditingContract(null)
    form.resetFields()
    setModalVisible(true)
  }

  const handleEdit = (record: any) => {
    setEditingContract(record)
    form.setFieldsValue({
      ...record,
      start_date: record.start_date ? dayjs(record.start_date) : null,
      end_date: record.end_date ? dayjs(record.end_date) : null,
    })
    setModalVisible(true)
  }

  const handleDelete = async (id: number) => {
    await contractApi.delete(id)
    message.success('删除成功')
    load()
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const data = {
      ...values,
      start_date: values.start_date ? values.start_date.format('YYYY-MM-DD') : null,
      end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : null,
    }
    if (editingContract) {
      await contractApi.update(editingContract.id, data)
      message.success('更新成功')
    } else {
      await contractApi.create(data)
      message.success('创建成功')
    }
    setModalVisible(false)
    load()
  }

  const [importLoading, setImportLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImport = async (contractId: number) => {
    const input = fileInputRef.current
    if (!input) return
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      setImportLoading(true)
      try {
        const result = await importApi.upload(contractId, file)
        message.success(`导入成功！设备 ${result.item_count} 项，罚款 ${result.penalty_count} 条，分类 ${result.category_count} 个`)
        load()
      } catch {
        message.error('导入失败，请检查Excel文件格式')
      } finally {
        setImportLoading(false)
        input.value = ''
      }
    }
    input.click()
  }

  const contractColumns = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '项目名称', dataIndex: 'project_name', width: 220, ellipsis: true },
    { title: '合同编号', dataIndex: 'contract_no', width: 200 },
    { title: '合同金额', dataIndex: 'contract_amount', width: 130, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '预付款', dataIndex: 'prepayment', width: 120, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '甲方', dataIndex: 'party_a', width: 180, ellipsis: true },
    { title: '乙方', dataIndex: 'party_b', width: 180, ellipsis: true },
    { title: '创建时间', dataIndex: 'created_at', width: 110, render: (v: string) => v?.split('T')[0] },
    ...(canEdit ? [{ title: '操作', width: 220, render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<UploadOutlined />} loading={importLoading} onClick={() => handleImport(r.id)}>导入</Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除？关联数据也将被删除" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }] : []),
  ]

  const penaltyColumns = [
    { title: '文件编号', dataIndex: 'doc_no', width: 200 },
    { title: '文件名称', dataIndex: 'doc_name', width: 250 },
    { title: '时间', dataIndex: 'penalty_date', width: 120, render: (v: string) => v?.split('T')[0] },
    { title: '项目罚款', dataIndex: 'project_penalty', width: 120, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '个人罚款', dataIndex: 'personal_penalty', width: 120, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '合计', dataIndex: 'total_penalty', width: 120, render: (v: number) => <Tag color="red">¥{v?.toLocaleString()}</Tag> },
  ]

  return (
    <div>
      <Card
        title="合同信息"
        extra={canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新建合同</Button>}
        style={{ marginBottom: 16 }}
      >
        <Table
          dataSource={contracts}
          columns={contractColumns}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: '暂无合同数据' }}
        />
      </Card>

      <Card title="罚款记录">
        <Table dataSource={penalties} columns={penaltyColumns} rowKey="id" size="small"
          locale={{ emptyText: '暂无罚款记录' }} />
      </Card>

      <Modal
        title={editingContract ? '编辑合同' : '新建合同'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="project_name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contract_no" label="合同编号" rules={[{ required: true, message: '请输入合同编号' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="contract_amount" label="合同金额" rules={[{ required: true, message: '请输入合同金额' }]}>
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item name="prepayment" label="预付款">
            <InputNumber style={{ width: '100%' }} min={0} precision={2} />
          </Form.Item>
          <Form.Item name="party_a" label="甲方">
            <Input />
          </Form.Item>
          <Form.Item name="party_b" label="乙方">
            <Input />
          </Form.Item>
          <Form.Item name="start_date" label="开始日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="end_date" label="结束日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".xls,.xlsx"
      />
    </div>
  )
}
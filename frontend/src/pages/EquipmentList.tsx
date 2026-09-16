import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Table, Select, Card, Tag, Button, Space, Modal, Form, Input, InputNumber, Popconfirm, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, AppstoreOutlined, SearchOutlined } from '@ant-design/icons'
import { equipmentApi } from '../api'
import { useAuth } from '../components/AuthContext'
import { useContract } from '../components/ContractContext'

export default function EquipmentList() {
  const [categories, setCategories] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [categoryId, setCategoryId] = useState<number | undefined>()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [searchInputText, setSearchInputText] = useState('')
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { canEdit } = useAuth()
  const { currentContractId } = useContract()

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<any>(null)
  const [catFormVisible, setCatFormVisible] = useState(false)
  const [catForm] = Form.useForm()
  const [catLoading, setCatLoading] = useState(false)

  const loadItemsRef = useRef<() => void>(() => {})
  const loadCategoriesRef = useRef<() => void>(() => {})

  const loadCategories = useCallback(() => {
    equipmentApi.categories(currentContractId).then(setCategories)
  }, [currentContractId])

  const loadItems = useCallback(() => {
    equipmentApi.list(currentContractId, categoryId).then(setItems)
  }, [currentContractId, categoryId])

  loadItemsRef.current = loadItems
  loadCategoriesRef.current = loadCategories

  useEffect(() => { loadCategories() }, [currentContractId])
  useEffect(() => { loadItems() }, [categoryId, currentContractId])

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

  const filteredItems = useMemo(() => {
    if (!searchText) return items
    const kw = searchText.toLowerCase()
    return items.filter((it: any) =>
      (it.name || '').toLowerCase().includes(kw) ||
      (it.specification || '').toLowerCase().includes(kw) ||
      (it.category_name || '').toLowerCase().includes(kw) ||
      (it.unit || '').toLowerCase().includes(kw)
    )
  }, [items, searchText])

  const handleAdd = () => {
    setEditingItem(null)
    form.resetFields()
    form.setFieldsValue({
      contract_id: currentContractId,
      contract_quantity: 0,
      unit_price: 0,
      contract_amount: 0,
    })
    setModalOpen(true)
  }

  const handleEdit = (record: any) => {
    setEditingItem(record)
    form.setFieldsValue({
      contract_id: currentContractId,
      seq_no: record.seq_no,
      name: record.name,
      specification: record.specification,
      unit: record.unit,
      contract_quantity: record.contract_quantity,
      unit_price: record.unit_price,
      contract_amount: record.contract_amount,
      category_id: record.category_id,
      remark: record.remark,
    })
    setModalOpen(true)
  }

  const handleDelete = useCallback(async (id: number) => {
    await equipmentApi.delete(id)
    message.success('删除成功')
    loadItemsRef.current()
  }, [])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      if (editingItem) {
        const { contract_id, ...updateData } = values
        await equipmentApi.update(editingItem.id, updateData)
        message.success('更新成功')
      } else {
        await equipmentApi.create(values)
        message.success('添加成功')
      }
      setModalOpen(false)
      loadItems()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAddCat = () => {
    setEditingCat(null)
    setCatFormVisible(true)
    catForm.resetFields()
    catForm.setFieldsValue({ contract_id: currentContractId, sort_order: categories.length, tax_rate: 0.13 })
  }

  const handleEditCat = (record: any) => {
    setEditingCat(record)
    setCatFormVisible(true)
    catForm.setFieldsValue({
      seq_no: record.seq_no,
      name: record.name,
      sort_order: record.sort_order,
      tax_rate: record.tax_rate,
    })
  }

  const handleDeleteCat = async (id: number) => {
    await equipmentApi.deleteCategory(id)
    message.success('大类已删除')
    loadCategories()
    loadItems()
  }

  const handleCatSubmit = async () => {
    try {
      const values = await catForm.validateFields()
      setCatLoading(true)
      if (editingCat) {
        await equipmentApi.updateCategory(editingCat.id, values)
        message.success('大类已更新')
      } else {
        await equipmentApi.createCategory({ ...values, contract_id: currentContractId })
        message.success('大类已添加')
      }
      setCatFormVisible(false)
      loadCategories()
      loadItems()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('操作失败')
    } finally {
      setCatLoading(false)
    }
  }

  const resetCatForm = () => {
    setEditingCat(null)
    setCatFormVisible(false)
    catForm.resetFields()
  }

  const columns = useMemo(() => [
    { title: '序号', dataIndex: 'seq_no', width: 60 },
    { title: '设备名称', dataIndex: 'name', width: 200 },
    { title: '规格型号', dataIndex: 'specification', width: 180 },
    { title: '单位', dataIndex: 'unit', width: 50 },
    { title: '合同量', dataIndex: 'contract_quantity', width: 80 },
    { title: '单价', dataIndex: 'unit_price', width: 100, render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '合同价', dataIndex: 'contract_amount', width: 120, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '大类', dataIndex: 'category_name', width: 180, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '' },
    ...(canEdit ? [{
      title: '操作', width: 120, render: (_: any, r: any) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>编辑</Button>
          <Popconfirm title="确定删除该设备？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }] : []),
  ], [canEdit, handleDelete])

  return (
    <Card title="设备清单" extra={
      <Space>
        <Input
          placeholder="搜索名称/规格/大类"
          prefix={<SearchOutlined />}
          allowClear
          style={{ width: 200 }}
          value={searchInputText}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
        <Select
          allowClear
          placeholder="筛选大类"
          style={{ width: 250 }}
          value={categoryId}
          onChange={setCategoryId}
          options={categories.map((c: any) => ({ label: c.name, value: c.id }))}
        />
        {canEdit && (
          <>
            <Button icon={<AppstoreOutlined />} onClick={() => { loadCategories(); resetCatForm(); setCatModalOpen(true) }}>
              管理大类
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
              添加设备
            </Button>
          </>
        )}
      </Space>
    }>
      <Table dataSource={filteredItems} columns={columns} rowKey="id" size="small" scroll={{ x: 1100 }}
        pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 项` }}
        locale={{ emptyText: '暂无设备数据' }} />

      <Modal
        title={editingItem ? '编辑设备' : '添加设备'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={loading}
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="contract_id" hidden><Input /></Form.Item>
          <Form.Item name="seq_no" label="序号">
            <Input placeholder="如：1、2、3" />
          </Form.Item>
          <Form.Item name="name" label="设备名称" rules={[{ required: true, message: '请输入设备名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="specification" label="规格型号">
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="unit" label="单位" style={{ width: 120 }}>
              <Input placeholder="如：台、套" />
            </Form.Item>
            <Form.Item name="contract_quantity" label="合同量" style={{ width: 140 }}>
              <InputNumber style={{ width: '100%' }} min={0} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size="middle">
            <Form.Item name="unit_price" label="单价" style={{ width: 160 }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
            </Form.Item>
            <Form.Item name="contract_amount" label="合同价" style={{ width: 160 }}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} prefix="¥" />
            </Form.Item>
          </Space>
          <Form.Item name="category_id" label="所属大类">
            <Select
              allowClear
              placeholder="选择大类"
              options={categories.map((c: any) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="管理大类"
        open={catModalOpen}
        onCancel={() => { setCatModalOpen(false); resetCatForm() }}
        footer={null}
        width={640}
      >
        {catFormVisible ? (
          <>
            <Form form={catForm} layout="vertical" style={{ marginTop: 8 }}>
              <Form.Item name="seq_no" label="序号">
                <Input placeholder="如：A、B、C" />
              </Form.Item>
              <Form.Item name="name" label="大类名称" rules={[{ required: true, message: '请输入大类名称' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="tax_rate" label="税率">
                <InputNumber style={{ width: '100%' }} min={0} max={1} step={0.01} />
              </Form.Item>
              <Form.Item name="sort_order" label="排序">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Form>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={resetCatForm}>取消</Button>
              <Button type="primary" loading={catLoading} onClick={handleCatSubmit}>保存</Button>
            </div>
          </>
        ) : (
          <>
            {canEdit && (
              <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddCat} style={{ marginBottom: 12 }}>
                添加大类
              </Button>
            )}
            <Table dataSource={categories} rowKey="id" size="small" pagination={false}
              columns={[
                { title: '序号', dataIndex: 'seq_no', width: 60 },
                { title: '大类名称', dataIndex: 'name', width: 180 },
                { title: '税率', dataIndex: 'tax_rate', width: 80, render: (v: number) => `${(v * 100).toFixed(0)}%` },
                { title: '排序', dataIndex: 'sort_order', width: 60 },
                ...(canEdit ? [{
                  title: '操作', width: 100, render: (_: any, r: any) => (
                    <Space>
                      <Button size="small" icon={<EditOutlined />} onClick={() => handleEditCat(r)} />
                      <Popconfirm title="确定删除？" onConfirm={() => handleDeleteCat(r.id)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </Space>
                  )
                }] : []),
              ]}
            />
          </>
        )}
      </Modal>
    </Card>
  )
}
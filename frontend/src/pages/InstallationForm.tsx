import React, { useEffect, useState } from 'react'
import { Form, Input, DatePicker, Button, Card, Space, message, Divider, InputNumber, Table, Select, Upload, Image, Tag, Modal, Checkbox } from 'antd'
import { PlusOutlined, DeleteOutlined, ThunderboltOutlined, UploadOutlined, SettingOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { installationApi, equipmentApi, personnelApi } from '../api'
import dayjs from 'dayjs'
import { useAuth } from '../components/AuthContext'
import { useContract } from '../components/ContractContext'

const { TextArea } = Input

export default function InstallationForm() {
  const [form] = Form.useForm()
  const [items, setItems] = useState<any[]>([])
  const [equipmentOpts, setEquipmentOpts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [personnelList, setPersonnelList] = useState<any[]>([])
  const [categoryOpts, setCategoryOpts] = useState<{ label: string; value: string }[]>([])
  const [personnelModalOpen, setPersonnelModalOpen] = useState(false)
  const [newPersonnelName, setNewPersonnelName] = useState('')
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id
  const recordId = id ? Number(id) : undefined
  const { canEdit } = useAuth()
  const { currentContractId } = useContract()

  useEffect(() => {
    equipmentApi.list(currentContractId).then((data: any[]) => {
      setEquipmentOpts(data.map((e: any) => ({
        label: `${e.name}${e.specification ? ` (${e.specification})` : ''}`,
        value: e.name,
        spec: e.specification || '',
        unit: e.unit || '',
        id: e.id,
      })))
    })
    equipmentApi.categories(currentContractId).then((data: any[]) => {
      setCategoryOpts(data.map((c: any) => ({ label: c.name, value: c.name })))
    })
    personnelApi.list(currentContractId).then((data: any[]) => {
      setPersonnelList(data)
      if (!isEdit) {
        const defaults = data.filter((p: any) => p.is_default).map((p: any) => p.name)
        if (defaults.length > 0) {
          form.setFieldsValue({ install_personnel: defaults })
        }
      }
    }).catch(() => {})
    if (isEdit) {
      installationApi.list(currentContractId).then((records: any[]) => {
        const record = records.find((r: any) => r.id === Number(id))
        if (record) {
          form.setFieldsValue({
            ...record,
            install_date: record.install_date ? dayjs(record.install_date) : undefined,
            install_sign_date: record.install_sign_date ? dayjs(record.install_sign_date) : undefined,
            client_sign_date: record.client_sign_date ? dayjs(record.client_sign_date) : undefined,
            install_personnel: record.install_personnel ? record.install_personnel.split(',').filter(Boolean) : [],
          })
          setItems((record.items || []).map((it: any) => ({ ...it, _key: Math.random() })))
          if (record.images) {
            setImages(record.images.split(',').filter(Boolean))
          }
        }
      })
    }
  }, [id])

  const addItem = () => {
    setItems([...items, {
      equipment_name: '', specification: '', unit: '', quantity: 0, location: '', remark: '', _key: Math.random()
    }])
  }

  const removeItem = (key: number) => {
    setItems(items.filter(it => it._key !== key))
  }

  const handleFillUnrecorded = async () => {
    try {
      const unrecorded = await installationApi.unrecordedItems(currentContractId)
      const todo = unrecorded.filter((u: any) => u.progress_quantity > 0 && u.uninstalled_quantity > 0)
      if (todo.length === 0) {
        message.warning('没有待录入安装的设备')
        return
      }
      const newItems = todo.map((u: any) => ({
        equipment_item_id: u.item_id,
        equipment_name: u.item_name,
        specification: u.specification,
        unit: u.unit,
        quantity: u.uninstalled_quantity,
        location: '',
        remark: '',
        _key: Math.random()
      }))
      setItems([...items, ...newItems])
      message.success(`已填充 ${newItems.length} 项待安装设备`)
    } catch {
      message.error('获取待安装设备失败')
    }
  }

  const handleUploadImage = async (file: File) => {
    if (!recordId) return
    setUploading(true)
    try {
      const result = await installationApi.uploadImage(recordId, file)
      setImages(prev => [...prev, result.filename])
      message.success('图片上传成功')
    } catch {
      message.error('图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteImage = async (filename: string) => {
    if (!recordId) return
    try {
      await installationApi.deleteImage(recordId, filename)
      setImages(prev => prev.filter(f => f !== filename))
      message.success('图片已删除')
    } catch {
      message.error('删除失败')
    }
  }

  const updateItem = (key: number, field: string, value: any) => {
    setItems(items.map(it => {
      if (it._key !== key) return it
      const updated = { ...it, [field]: value }
      if (field === 'equipment_name' && value) {
        const eq = equipmentOpts.find((e: any) => e.value === value)
        if (eq) {
          updated.specification = eq.spec
          updated.unit = eq.unit
          updated.equipment_item_id = eq.id
        }
      }
      return updated
    }))
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      const data = {
        ...values,
        install_date: values.install_date?.format('YYYY-MM-DD'),
        install_sign_date: values.install_sign_date?.format('YYYY-MM-DD') || null,
        client_sign_date: values.client_sign_date?.format('YYYY-MM-DD') || null,
        install_personnel: Array.isArray(values.install_personnel) ? values.install_personnel.join(',') : values.install_personnel,
        items: items.map(({ _key, ...rest }) => rest),
      }
      if (isEdit) {
        await installationApi.update(Number(id), data)
        message.success('更新成功')
        navigate('/installation')
      } else {
        const result = await installationApi.create(data)
        message.success('创建成功，请上传安装图片')
        navigate(`/installation/${result.id}/edit`)
      }
    } catch (err: any) {
      if (err?.errorFields) return
      message.error('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const refreshPersonnel = async () => {
    try {
      const data = await personnelApi.list(currentContractId)
      setPersonnelList(data)
    } catch { /* ignore */ }
  }

  const handleAddPersonnel = async () => {
    const name = newPersonnelName.trim()
    if (!name) { message.warning('请输入人员姓名'); return }
    try {
      await personnelApi.create({ name }, currentContractId)
      message.success(`已添加: ${name}`)
      setNewPersonnelName('')
      await refreshPersonnel()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '添加失败')
    }
  }

  const handleToggleDefault = async (personnelId: number, isDefault: boolean) => {
    try {
      await personnelApi.update(personnelId, { is_default: isDefault }, currentContractId)
      await refreshPer设备安装记录sonnel()
    } catch {
      message.error('更新失败')
    }
  }

  const handleDeletePersonnel = async (personnelId: number, name: string) => {
    try {
      await personnelApi.delete(personnelId, currentContractId)
      message.success(`已删除: ${name}`)
      await refreshPersonnel()
    } catch {
      message.error('删除失败')
    }
  }

  return (
    <>
    <Card title={isEdit ? '编辑安装记录' : '新建安装记录'} extra={
      <Space>
        {!isEdit && canEdit && (
          <Button icon={<ThunderboltOutlined />} onClick={handleFillUnrecorded}>
            从进度填充待安装设备
          </Button>
        )}
        {!canEdit && <Tag color="blue">只读模式</Tag>}
        <span style={{ color: '#999', fontSize: 12 }}>参照《设备安装记录表》模板</span>
      </Space>
    }>
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Form.Item label="项目名称" name="project_name" initialValue="CX项目智能工地建设">
            <Input disabled={!canEdit} />
          </Form.Item>
          <Form.Item label="设备类型" name="equipment_type" rules={[{ required: true, message: '请选择设备分类' }]}>
            <Select placeholder="选择设备大类" options={categoryOpts} disabled={!canEdit} showSearch
              filterOption={(input, option) => (option?.label as string || '').includes(input)}
            />
          </Form.Item>
          <Form.Item label="安装单位" name="install_unit" initialValue="中国电信股份有限公司楚雄分公司">
            <Input disabled={!canEdit} />
          </Form.Item>
          <Form.Item label="安装人员" name="install_personnel" rules={[{ required: true, message: '请选择安装人员' }]}>
            <Select mode="multiple" placeholder="选择安装人员" disabled={!canEdit}
              options={personnelList.map((p: any) => ({ label: p.name, value: p.name }))}
              dropdownRender={(menu) => (
                <>
                  {menu}
                  <Divider style={{ margin: '8px 0' }} />
                  <Space style={{ padding: '4px 8px' }}>
                    <Button type="link" size="small" icon={<SettingOutlined />}
                      onClick={() => setPersonnelModalOpen(true)}
                    >
                      管理人员
                    </Button>
                  </Space>
                </>
              )}
            />
          </Form.Item>
          <Form.Item label="安装时间" name="install_date" rules={[{ required: true, message: '请选择安装时间' }]}>
            <DatePicker style={{ width: '100%' }} placeholder="选择安装日期" disabled={!canEdit} />
          </Form.Item>
          <Form.Item label="使用单位" name="use_unit">
            <Input placeholder="如：C1/C2/C3/C4" disabled={!canEdit} />
          </Form.Item>
        </div>
        <Form.Item label="安装内容" name="install_content" rules={[{ required: true, message: '请输入安装内容' }]}>
          <TextArea rows={3} placeholder="如：厂区出入口人行闸机安装：单机芯摆闸2套、双机芯摆闸1套、人脸识别机2套及其他附属安装（布线、电源、支架等）" disabled={!canEdit} />
        </Form.Item>
        <Form.Item label="安装结论" name="install_conclusion" initialValue="设备已安装调试开通正常投入运行。">
          <TextArea rows={2} disabled={!canEdit} />
        </Form.Item>

        <Form.Item label="安装现场图片">
          {isEdit ? (
            <>
              {canEdit && (
                <Upload
                  listType="picture-card"
                  showUploadList={false}
                  customRequest={({ file }) => handleUploadImage(file as File)}
                  accept="image/*"
                >
                  <div>
                    <PlusOutlined />
                    <div style={{ marginTop: 8 }}>上传图片</div>
                  </div>
                </Upload>
              )}
              {images.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {images.map((filename, idx) => (
                    <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                      <Image
                        src={`/uploads/${filename}`}
                        width={104}
                        height={104}
                        style={{ objectFit: 'cover', borderRadius: 4 }}
                        preview={{ mask: null }}
                      />
                      {canEdit && (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          style={{ position: 'absolute', top: -8, right: -8, background: '#fff', borderRadius: '50%' }}
                          onClick={() => handleDeleteImage(filename)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <span style={{ color: '#999' }}>保存记录后即可上传安装图片</span>
          )}
        </Form.Item>

        <Divider>安装设备明细</Divider>
        <Table
          dataSource={items}
          rowKey="_key"
          size="small"
          pagination={false}
          columns={[
            {
              title: '设备名称', dataIndex: 'equipment_name', width: 200,
              render: (_: any, r: any) => (
                <Select
                  value={r.equipment_name || undefined}
                  style={{ width: '100%' }}
                  showSearch
                  placeholder="选择设备"
                  onChange={(v) => updateItem(r._key, 'equipment_name', v)}
                  options={equipmentOpts}
                  allowClear
                  disabled={!canEdit}
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                />
              )
            },
            {
              title: '规格型号', dataIndex: 'specification', width: 140,
              render: (_: any, r: any) => (
                <Input value={r.specification} onChange={(e) => updateItem(r._key, 'specification', e.target.value)} disabled={!canEdit} />
              )
            },
            {
              title: '单位', dataIndex: 'unit', width: 60,
              render: (_: any, r: any) => (
                <Input value={r.unit} onChange={(e) => updateItem(r._key, 'unit', e.target.value)} disabled={!canEdit} />
              )
            },
            {
              title: '数量', dataIndex: 'quantity', width: 80,
              render: (_: any, r: any) => (
                <InputNumber value={r.quantity} min={0} style={{ width: '100%' }}
                  onChange={(v) => updateItem(r._key, 'quantity', v || 0)} disabled={!canEdit} />
              )
            },
            {
              title: '安装位置', dataIndex: 'location', width: 120,
              render: (_: any, r: any) => (
                <Input value={r.location} onChange={(e) => updateItem(r._key, 'location', e.target.value)} disabled={!canEdit} />
              )
            },
            {
              title: '备注', dataIndex: 'remark', width: 120,
              render: (_: any, r: any) => (
                <Input value={r.remark} onChange={(e) => updateItem(r._key, 'remark', e.target.value)} disabled={!canEdit} />
              )
            },
            ...(canEdit ? [{
              title: '操作', width: 60, fixed: 'right' as const,
              render: (_: any, r: any) => (
                <Button type="link" danger icon={<DeleteOutlined />} onClick={() => removeItem(r._key)} />
              )
            }] : []),
          ]}
          footer={() => canEdit ? (
            <Button type="dashed" onClick={addItem} icon={<PlusOutlined />} block>
              添加设备
            </Button>
          ) : undefined}
          scroll={{ x: 880 }}
        />

        <Divider>签字确认</Divider>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Form.Item label="安装单位负责人（签字）" name="install_signatory">
            <Input placeholder="负责人姓名" disabled={!canEdit} />
          </Form.Item>
          <Form.Item label="日期" name="install_sign_date">
            <DatePicker style={{ width: '100%' }} placeholder="签字日期" disabled={!canEdit} />
          </Form.Item>
          <Form.Item label="委托单位负责人（签字）" name="client_signatory">
            <Input placeholder="负责人姓名" disabled={!canEdit} />
          </Form.Item>
          <Form.Item label="日期" name="client_sign_date">
            <DatePicker style={{ width: '100%' }} placeholder="签字日期" disabled={!canEdit} />
          </Form.Item>
        </div>
      </Form>
      {canEdit && (
        <Space style={{ marginTop: 16 }}>
          <Button type="primary" onClick={handleSubmit} loading={loading}>保存</Button>
          <Button onClick={() => navigate('/installation')}>取消</Button>
        </Space>
      )}
      {!canEdit && (
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate('/installation')}>返回</Button>
        </div>
      )}
    </Card>
      <Modal
        title="管理人员"
        open={personnelModalOpen}
        onCancel={() => setPersonnelModalOpen(false)}
        footer={null}
        width={420}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          <Space>
            <Input
              placeholder="输入人员姓名"
              value={newPersonnelName}
              onChange={(e) => setNewPersonnelName(e.target.value)}
              onPressEnter={handleAddPersonnel}
              style={{ width: 200 }}
            />
            <Button type="primary" onClick={handleAddPersonnel}>添加</Button>
          </Space>
          {personnelList.length === 0 ? (
            <div style={{ color: '#999', padding: '16px 0' }}>暂无人员，请添加</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {personnelList.map((p: any) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span>{p.name}</span>
                  <Space size="small">
                    <Checkbox
                      checked={p.is_default}
                      onChange={(e) => handleToggleDefault(p.id, e.target.checked)}
                    >
                      默认
                    </Checkbox>
                    <Button type="link" danger size="small" onClick={() => handleDeletePersonnel(p.id, p.name)}>删除</Button>
                  </Space>
                </div>
              ))}
            </div>
          )}
        </Space>
      </Modal>
    </>
  )
}
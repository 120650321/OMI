import React, { useEffect, useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Select, Space, message, Popconfirm, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { userApi } from '../api'

interface UserRecord {
  id: number
  username: string
  fullname: string
  role: string
  role_label: string
}

const ROLE_OPTIONS = [
  { value: 'admin', label: '系统管理员' },
  { value: 'operator', label: '操作员' },
  { value: 'viewer', label: '观察员' },
]

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  operator: 'blue',
  viewer: 'green',
}

export default function UserManage() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const loadUsers = async () => {
    setLoading(true)
    try {
      const data = await userApi.list()
      setUsers(data || [])
    } catch {
      message.error('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleAdd = () => {
    setEditingUser(null)
    form.resetFields()
    form.setFieldsValue({ role: 'viewer' })
    setModalOpen(true)
  }

  const handleEdit = (record: UserRecord) => {
    setEditingUser(record)
    form.setFieldsValue({
      username: record.username,
      fullname: record.fullname,
      role: record.role,
      password: '',
    })
    setModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await userApi.delete(id)
      message.success('用户已删除')
      loadUsers()
    } catch (err: any) {
      message.error('删除失败: ' + (err?.response?.data?.detail || err?.message || '未知错误'))
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      if (editingUser) {
        const payload: any = {}
        if (values.username !== editingUser.username) payload.username = values.username
        if (values.fullname !== editingUser.fullname) payload.fullname = values.fullname
        if (values.role !== editingUser.role) payload.role = values.role
        if (values.password) payload.password = values.password
        if (Object.keys(payload).length === 0) {
          message.info('未做任何修改')
          setSubmitting(false)
          setModalOpen(false)
          return
        }
        await userApi.update(editingUser.id, payload)
        message.success('用户更新成功')
      } else {
        await userApi.create(values)
        message.success('用户创建成功')
      }
      setModalOpen(false)
      loadUsers()
    } catch (err: any) {
      if (err?.response?.data?.detail) {
        message.error(err.response.data.detail)
      } else if (err?.errorFields) {
        // form validation error, do nothing
      } else {
        message.error('操作失败')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', width: 140 },
    { title: '姓名', dataIndex: 'fullname', width: 140 },
    {
      title: '角色', dataIndex: 'role', width: 100,
      render: (_: string, r: UserRecord) => (
        <Tag color={ROLE_COLORS[r.role] || 'default'}>{r.role_label || r.role}</Tag>
      ),
    },
    {
      title: '操作', key: 'action', width: 160,
      render: (_: unknown, record: UserRecord) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />}
            onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定要删除该用户吗？" onConfirm={() => handleDelete(record.id)}
            okText="确定" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="用户管理"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>新增用户</Button>}
    >
      <Table
        dataSource={users}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={false}
        locale={{ emptyText: '暂无用户' }}
      />
      <Modal
        title={editingUser ? '编辑用户' : '新增用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="username" label="用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 2, max: 50, message: '用户名2-50位' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '仅允许字母、数字、下划线' },
            ]}>
            <Input placeholder="英文字母、数字、下划线" maxLength={50} disabled={!!editingUser} />
          </Form.Item>
          <Form.Item name="password" label={editingUser ? '新密码（留空不修改）' : '密码'}
            rules={editingUser ? [] : [{ required: true, message: '请输入密码' }, { min: 4, message: '密码至少4位' }]}>
            <Input.Password placeholder={editingUser ? '留空则不修改密码' : '请输入密码'} maxLength={50} />
          </Form.Item>
          <Form.Item name="fullname" label="姓名">
            <Input placeholder="真实姓名" maxLength={50} />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
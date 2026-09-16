import React from 'react'
import { Layout, Menu, Button, Space, Typography, Select } from 'antd'
import {
  DashboardOutlined, FileTextOutlined, UnorderedListOutlined,
  FormOutlined, EditOutlined, CheckCircleOutlined,
  DollarOutlined, WarningOutlined, LogoutOutlined, UserOutlined, TeamOutlined
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { useContract } from './ContractContext'

const { Sider, Content, Header, Footer } = Layout
const { Text } = Typography

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const { currentContractId, setCurrentContractId, contracts, currentContract } = useContract()
  const isAdmin = user?.role === 'admin'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/contract', icon: <FileTextOutlined />, label: '合同管理' },
    { key: '/equipment', icon: <UnorderedListOutlined />, label: '设备清单' },
    { key: '/installation', icon: <FormOutlined />, label: '安装记录' },
    { key: '/progress', icon: <EditOutlined />, label: '进度录入' },
    { key: '/verification', icon: <CheckCircleOutlined />, label: '工程量核对' },
    { key: '/settlement', icon: <DollarOutlined />, label: '结算管理' },
    { key: '/penalty', icon: <WarningOutlined />, label: '罚款管理' },
    ...(isAdmin ? [{ key: '/users', icon: <TeamOutlined />, label: '用户管理' }] : []),
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="dark" style={{ position: 'fixed', left: 0, top: 0, bottom: 0, overflow: 'auto' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>壹众工程智能结算系统</h2>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout style={{ marginLeft: 220 }}>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>
            {menuItems.find(m => m.key === location.pathname)?.label || '智能工地结算安装记录核对系统'}
          </h3>
          <Space>
            <Select
              value={currentContractId}
              onChange={setCurrentContractId}
              style={{ width: 240 }}
              placeholder="选择项目"
              loading={contracts.length === 0}
              options={contracts.map((c: any) => ({
                label: c.project_name || `合同 #${c.id}`,
                value: c.id
              }))}
              optionLabelProp="label"
            />
            <Space size={4}>
              <UserOutlined />
              <Text>{user?.fullname || user?.username || ''}</Text>
            </Space>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8, minHeight: 'calc(100vh - 160px)' }}>
          {children}
        </Content>
        <Footer style={{ textAlign: 'center', padding: '12px 50px', background: '#fafafa', borderTop: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            云南壹众科技有限责任公司
          </Text>
        </Footer>
      </Layout>
    </Layout>
  )
}
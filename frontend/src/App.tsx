import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider, useAuth } from './components/AuthContext'
import { ContractProvider } from './components/ContractContext'
import ErrorBoundary from './components/ErrorBoundary'
import AppLayout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import ContractManage from './pages/ContractManage'
import EquipmentList from './pages/EquipmentList'
import InstallationRecords from './pages/InstallationRecords'
import InstallationForm from './pages/InstallationForm'
import ProgressEntry from './pages/ProgressEntry'
import Verification from './pages/Verification'
import Settlement from './pages/Settlement'
import PenaltyManage from './pages/PenaltyManage'
import UserManage from './pages/UserManage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return null
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAdmin) {
    return <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>权限不足，仅系统管理员可访问此页面</div>
  }
  return <>{children}</>
}

function WriteRoute({ children }: { children: React.ReactNode }) {
  const { canEdit, loading } = useAuth()
  if (loading) return null
  if (!canEdit) {
    return <div style={{ textAlign: 'center', padding: 80, color: '#999' }}>权限不足，观察员仅有查看权限</div>
  }
  return <>{children}</>
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  )
}

function AppRoutes() {
  const withError = (el: React.ReactNode) => <ErrorBoundary>{el}</ErrorBoundary>

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedLayout>{withError(<Dashboard />)}</ProtectedLayout>} />
      <Route path="/contract" element={<ProtectedLayout>{withError(<ContractManage />)}</ProtectedLayout>} />
      <Route path="/equipment" element={<ProtectedLayout>{withError(<EquipmentList />)}</ProtectedLayout>} />
      <Route path="/installation" element={<ProtectedLayout>{withError(<InstallationRecords />)}</ProtectedLayout>} />
      <Route path="/installation/new" element={<ProtectedLayout><WriteRoute>{withError(<InstallationForm />)}</WriteRoute></ProtectedLayout>} />
      <Route path="/installation/:id/edit" element={<ProtectedLayout><WriteRoute>{withError(<InstallationForm />)}</WriteRoute></ProtectedLayout>} />
      <Route path="/progress" element={<ProtectedLayout>{withError(<ProgressEntry />)}</ProtectedLayout>} />
      <Route path="/verification" element={<ProtectedLayout>{withError(<Verification />)}</ProtectedLayout>} />
      <Route path="/settlement" element={<ProtectedLayout>{withError(<Settlement />)}</ProtectedLayout>} />
      <Route path="/penalty" element={<ProtectedLayout>{withError(<PenaltyManage />)}</ProtectedLayout>} />
      <Route path="/users" element={<ProtectedLayout><AdminRoute>{withError(<UserManage />)}</AdminRoute></ProtectedLayout>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <AuthProvider>
          <ContractProvider>
            <AppRoutes />
          </ContractProvider>
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  )
}
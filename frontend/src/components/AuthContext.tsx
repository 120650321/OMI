import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { message } from 'antd'
import api from '../api'

interface User {
  username: string
  fullname: string
  role: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  isAuthenticated: boolean
  isAdmin: boolean
  canEdit: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: async () => false,
  logout: () => {},
  isAuthenticated: false,
  isAdmin: false,
  canEdit: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedToken = localStorage.getItem('omi_token')
    const savedUser = localStorage.getItem('omi_user')
    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser)
        setToken(savedToken)
        setUser(parsed)
      } catch {
        localStorage.removeItem('omi_token')
        localStorage.removeItem('omi_user')
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      const data = await api.post('/auth/login', { username, password }).then(r => r.data)
      const userData: User = { username: data.username, fullname: data.fullname, role: data.role || 'viewer' }
      const accessToken = data.access_token
      localStorage.setItem('omi_token', accessToken)
      localStorage.setItem('omi_user', JSON.stringify(userData))
      setToken(accessToken)
      setUser(userData)
      return true
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '登录失败'
      message.error(msg)
      return false
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('omi_token')
    localStorage.removeItem('omi_user')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAuthenticated: !!token, isAdmin: user?.role === 'admin', canEdit: user?.role === 'admin' || user?.role === 'operator' }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// 请求去重：防止短时间内重复请求
const pendingRequests = new Map<string, AbortController>()

function getRequestKey(config: any): string {
  const { method, url, params, data } = config
  return [method, url, JSON.stringify(params), JSON.stringify(data)].join('&')
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('omi_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // 自动取消重复的 GET 请求
  if (config.method === 'get') {
    const key = getRequestKey(config)
    if (pendingRequests.has(key)) {
      pendingRequests.get(key)!.abort()
    }
    const controller = new AbortController()
    config.signal = controller.signal
    pendingRequests.set(key, controller)
  }

  return config
})

api.interceptors.response.use(
  (response) => {
    // 请求完成后清理
    if (response.config.method === 'get') {
      const key = getRequestKey(response.config)
      pendingRequests.delete(key)
    }
    return response
  },
  (error) => {
    // 请求失败也清理
    if (error.config?.method === 'get') {
      const key = getRequestKey(error.config)
      pendingRequests.delete(key)
    }

    // 取消的请求不算错误，但仍然 reject 让调用方的 .catch 处理
    if (axios.isCancel(error)) {
      return new Promise(() => {})
    }

    if (error?.response?.status === 401) {
      localStorage.removeItem('omi_token')
      localStorage.removeItem('omi_user')
      const currentPath = window.location.pathname
      if (currentPath !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default api

export const installSkipApi = {
  list: (contractId: number, periodId: number) =>
    api.get('/install-skip', { params: { contract_id: contractId, period_id: periodId } }).then(r => r.data),
  mark: (itemIds: number[], contractId: number, periodId: number) =>
    api.post('/install-skip', itemIds, { params: { contract_id: contractId, period_id: periodId } }).then(r => r.data),
  unmark: (itemIds: number[], contractId: number, periodId: number) =>
    api.delete('/install-skip', { params: { contract_id: contractId, period_id: periodId }, data: itemIds }).then(r => r.data),
}

export const contractApi = {
  list: () => api.get('/contracts').then(r => r.data),
  create: (data: any) => api.post('/contracts', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/contracts/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/contracts/${id}`).then(r => r.data),
}

export const equipmentApi = {
  list: (contractId = 1, categoryId?: number) =>
    api.get('/equipment-items', { params: { contract_id: contractId, category_id: categoryId } }).then(r => r.data),
  categories: (contractId = 1) =>
    api.get('/equipment-categories', { params: { contract_id: contractId } }).then(r => r.data),
  create: (data: any) => api.post('/equipment-items', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/equipment-items/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/equipment-items/${id}`).then(r => r.data),
  createCategory: (data: any) => api.post('/equipment-categories', data).then(r => r.data),
  updateCategory: (id: number, data: any) => api.put(`/equipment-categories/${id}`, data).then(r => r.data),
  deleteCategory: (id: number) => api.delete(`/equipment-categories/${id}`).then(r => r.data),
}

export const progressApi = {
  periods: (contractId = 1) =>
    api.get('/progress-periods', { params: { contract_id: contractId } }).then(r => r.data),
  createPeriod: (data: any, contractId = 1) =>
    api.post('/progress-periods', data, { params: { contract_id: contractId } }).then(r => r.data),
  getEntries: (periodId: number) =>
    api.get(`/progress-entries/${periodId}`).then(r => r.data),
  batchUpdate: (entries: any[], periodId: number) =>
    api.put('/progress-entries/batch', entries, { params: { period_id: periodId } }).then(r => r.data),
  deletePeriod: (id: number) =>
    api.delete(`/progress-periods/${id}`).then(r => r.data),
}

export const installationApi = {
  list: (contractId?: number) =>
    api.get('/installation-records', { params: contractId ? { contract_id: contractId } : {} }).then(r => r.data),
  create: (data: any) => api.post('/installation-records', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/installation-records/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/installation-records/${id}`).then(r => r.data),
  batchDelete: (ids: number[]) =>
    api.post('/installation-records/batch-delete', { ids }).then(r => r.data),
  unrecordedItems: (contractId = 1, periodId?: number) =>
    api.get('/installation/unrecorded-items', { params: { contract_id: contractId, ...(periodId ? { period_id: periodId } : {}) } }).then(r => r.data),
  generateFromProgress: (contractId = 1, periodId?: number) =>
    api.post('/installation/generate-from-progress', null, { params: { contract_id: contractId, ...(periodId ? { period_id: periodId } : {}) } }).then(r => r.data),
  generateSelected: (itemIds: number[], contractId = 1, periodId?: number) =>
    api.post('/installation/generate-selected', itemIds, { params: { contract_id: contractId, ...(periodId ? { period_id: periodId } : {}) } }).then(r => r.data),
  generateIndividual: (itemIds: number[], contractId = 1, periodId?: number) =>
    api.post('/installation/generate-individual', itemIds, { params: { contract_id: contractId, ...(periodId ? { period_id: periodId } : {}) } }).then(r => r.data),
  exportWord: (id: number) =>
    api.get(`/installation/export-word/${id}`, { responseType: 'blob' }).then(r => r.data),
  exportPdf: (id: number) =>
    api.get(`/installation/export-pdf/${id}`, { responseType: 'blob' }).then(r => r.data),
  exportWordUrl: (id: number) => `/api/installation/export-word/${id}`,
  exportPdfUrl: (id: number) => `/api/installation/export-pdf/${id}`,
  exportWordBatch: (ids: number[]) =>
    api.post('/installation/export-word/batch', { ids }, { responseType: 'blob' }).then(r => r.data),
  exportPdfBatch: (ids: number[]) =>
    api.post('/installation/export-pdf/batch', { ids }, { responseType: 'blob' }).then(r => r.data),
  uploadImage: (recordId: number, file: File, itemId?: number) => {
    const form = new FormData()
    form.append('file', file)
    const params = itemId ? `?item_id=${itemId}` : ''
    return api.post(`/installation/upload-image/${recordId}${params}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
  deleteImage: (recordId: number, filename: string, itemId?: number) => {
    const params = itemId ? `?item_id=${itemId}` : ''
    return api.delete(`/installation/image/${recordId}/${filename}${params}`).then(r => r.data)
  },
  unitAllocations: (contractId = 1) =>
    api.get('/installation/unit-allocations', { params: { contract_id: contractId } }).then(r => r.data),
  saveUnitAllocations: (data: any, contractId = 1) =>
    api.post('/installation/unit-allocations', data, { params: { contract_id: contractId } }).then(r => r.data),
  saveUnitAllocationsBatch: (data: any[], contractId = 1) =>
    api.post('/installation/unit-allocations/batch', data, { params: { contract_id: contractId } }).then(r => r.data),
  generateByUnit: (data: any, contractId = 1, periodId?: number) =>
    api.post('/installation/generate-by-unit', data, { params: { contract_id: contractId, ...(periodId ? { period_id: periodId } : {}) } }).then(r => r.data),
  generateByUnitMerged: (data: any, contractId = 1, periodId?: number) =>
    api.post('/installation/generate-by-unit-merged', data, { params: { contract_id: contractId, ...(periodId ? { period_id: periodId } : {}) } }).then(r => r.data),
}

export const useUnitApi = {
  list: (contractId = 1) =>
    api.get('/use-units', { params: { contract_id: contractId } }).then(r => r.data),
  save: (data: any[], contractId = 1) =>
    api.post('/use-units', data, { params: { contract_id: contractId } }).then(r => r.data),
}

export const personnelApi = {
  list: (contractId = 1) =>
    api.get('/install-personnel', { params: { contract_id: contractId } }).then(r => r.data),
  create: (data: { name: string; is_default?: boolean }, contractId = 1) =>
    api.post('/install-personnel', data, { params: { contract_id: contractId } }).then(r => r.data),
  update: (id: number, data: { name?: string; is_default?: boolean; sort_order?: number }) =>
    api.put(`/install-personnel/${id}`, data).then(r => r.data),
  delete: (id: number) =>
    api.delete(`/install-personnel/${id}`).then(r => r.data),
}

export const settlementApi = {
  summary: (contractId = 1) =>
    api.get('/settlement/summary', { params: { contract_id: contractId } }).then(r => r.data),
  detail: (contractId = 1, periodId?: number) =>
    api.get('/settlement/detail', { params: { contract_id: contractId, period_id: periodId } }).then(r => r.data),
  updateActualPaid: (entries: { item_id: number; actual_paid_amount: number }[], periodId?: number, contractId = 1) =>
    api.put('/settlement/actual-paid/batch', entries, { params: { contract_id: contractId, ...(periodId ? { period_id: periodId } : {}) } }).then(r => r.data),
}

export const penaltyApi = {
  list: (contractId = 1) =>
    api.get('/penalties', { params: { contract_id: contractId } }).then(r => r.data),
  create: (data: any, contractId = 1) =>
    api.post('/penalties', data, { params: { contract_id: contractId } }).then(r => r.data),
}

export const userApi = {
  list: () => api.get('/users').then(r => r.data),
  create: (data: { username: string; password: string; fullname: string; role: string }) =>
    api.post('/users', data).then(r => r.data),
  update: (id: number, data: { username?: string; password?: string; fullname?: string; role?: string }) =>
    api.put(`/users/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/users/${id}`).then(r => r.data),
}

export const importApi = {
  fromExcel: (contractId = 1) => api.post('/import/from-excel', null, { params: { contract_id: contractId } }).then(r => r.data),
  upload: (contractId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/import/upload', formData, {
      params: { contract_id: contractId },
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },
}

export const exportApi = {
  confirmationSheet: (contractId: number, useUnit: string, documentNo?: string) => {
    const params: any = { contract_id: contractId, use_unit: useUnit }
    if (documentNo) params.document_no = documentNo
    return api.get('/export/confirmation-sheet', { params, responseType: 'blob' }).then(r => {
      const url = window.URL.createObjectURL(new Blob([r.data]))
      const link = document.createElement('a')
      link.href = url
      const disposition = r.headers['content-disposition'] || ''
      const match = disposition.match(/filename=(.+)/)
      link.setAttribute('download', match ? match[1] : `安装设备确认单-${useUnit}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    })
  },
  quantityVerification: (periodId: number) => {
    return api.get('/export/quantity-verification', {
      params: { period_id: periodId },
      responseType: 'blob'
    }).then(r => {
      const url = window.URL.createObjectURL(new Blob([r.data]))
      const link = document.createElement('a')
      link.href = url
      const disposition = r.headers['content-disposition'] || ''
      const match = disposition.match(/filename\*?=(?:UTF-8'')?(.+)/)
      link.setAttribute('download', match ? decodeURIComponent(match[1]) : `工程量核对表.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    })
  },
}

export const authApi = {
  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data).then(r => r.data),
  getCurrentUser: () =>
    api.get('/auth/me').then(r => r.data),
}
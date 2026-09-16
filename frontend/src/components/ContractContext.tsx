import React, { createContext, useContext, useState, useEffect } from 'react'
import { contractApi } from '../api'

interface ContractContextType {
  currentContractId: number
  setCurrentContractId: (id: number) => void
  contracts: any[]
  currentContract: any | null
}

const ContractContext = createContext<ContractContextType>({
  currentContractId: 1,
  setCurrentContractId: () => {},
  contracts: [],
  currentContract: null,
})

export function ContractProvider({ children }: { children: React.ReactNode }) {
  const [contracts, setContracts] = useState<any[]>([])
  const [currentContractId, setCurrentContractId] = useState<number>(() => {
    const saved = localStorage.getItem('omi_contract_id')
    return saved ? parseInt(saved) : 1
  })

  useEffect(() => {
    contractApi.list().then((data) => setContracts(data || [])).catch(() => {})
  }, [])

  useEffect(() => {
    localStorage.setItem('omi_contract_id', String(currentContractId))
  }, [currentContractId])

  const currentContract = (contracts || []).find(c => c.id === currentContractId) || null

  return (
    <ContractContext.Provider value={{ currentContractId, setCurrentContractId, contracts, currentContract }}>
      {children}
    </ContractContext.Provider>
  )
}

export function useContract() {
  return useContext(ContractContext)
}
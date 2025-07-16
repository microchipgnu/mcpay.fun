"use client"

import { useState, useCallback } from 'react'

type AccountModalTab = 'profile' | 'wallets' | 'settings'

interface UseAccountModalReturn {
  isOpen: boolean
  defaultTab: AccountModalTab
  openModal: (tab?: AccountModalTab) => void
  closeModal: () => void
}

export function useAccountModal(): UseAccountModalReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [defaultTab, setDefaultTab] = useState<AccountModalTab>('profile')

  const openModal = useCallback((tab: AccountModalTab = 'profile') => {
    setDefaultTab(tab)
    setIsOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
  }, [])

  return {
    isOpen,
    defaultTab,
    openModal,
    closeModal
  }
} 
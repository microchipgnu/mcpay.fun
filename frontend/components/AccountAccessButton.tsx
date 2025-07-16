"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { User, LogIn, Wallet, Settings } from "lucide-react"
import { useTheme } from "@/context/ThemeContext"
import { useSession } from "@/lib/auth"
import { useAccountModal } from "../hooks/useAccountModal"

interface AccountAccessButtonProps {
  variant?: 'default' | 'ghost' | 'outline'
  size?: 'sm' | 'default' | 'lg'
  showText?: boolean
  defaultTab?: 'profile' | 'wallets' | 'settings'
  className?: string
}

export function AccountAccessButton({ 
  variant = 'ghost',
  size = 'default',
  showText = true,
  defaultTab = 'profile',
  className = ''
}: AccountAccessButtonProps) {
  const { isDark } = useTheme()
  const { data: session, isPending: sessionLoading } = useSession()
  const { openModal } = useAccountModal()

  const getIcon = () => {
    if (defaultTab === 'wallets') return <Wallet className="h-4 w-4" />
    if (defaultTab === 'settings') return <Settings className="h-4 w-4" />
    return session?.user ? <User className="h-4 w-4" /> : <LogIn className="h-4 w-4" />
  }

  const getText = () => {
    if (!showText) return null
    if (defaultTab === 'wallets') return 'Wallets'
    if (defaultTab === 'settings') return 'Settings'
    return session?.user ? (session.user.name?.split(' ')[0] || 'Account') : 'Sign In'
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => openModal(defaultTab)}
      disabled={sessionLoading}
      className={`flex items-center gap-2 ${className} ${
        isDark && variant === 'ghost'
          ? "text-gray-300 hover:bg-gray-800 hover:text-white"
          : ""
      }`}
    >
      {session?.user && variant !== 'outline' ? (
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
          isDark ? "bg-gray-700" : "bg-gray-200"
        }`}>
          {session.user.image ? (
            <img 
              src={session.user.image} 
              alt="Profile" 
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <User className="h-3 w-3" />
          )}
        </div>
      ) : (
        getIcon()
      )}
      {getText()}
    </Button>
  )
}

// Quick access variants for different use cases
export const ProfileButton = (props: Omit<AccountAccessButtonProps, 'defaultTab'>) => (
  <AccountAccessButton {...props} defaultTab="profile" />
)

export const WalletsButton = (props: Omit<AccountAccessButtonProps, 'defaultTab'>) => (
  <AccountAccessButton {...props} defaultTab="wallets" />
)

export const SettingsButton = (props: Omit<AccountAccessButtonProps, 'defaultTab'>) => (
  <AccountAccessButton {...props} defaultTab="settings" />
) 
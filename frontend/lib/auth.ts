import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000",
  fetchOptions: {
    credentials: "include",
    onError: (error) => {
      console.error("Auth error:", error) 
    }
  },
})

// Export hooks for easy use throughout the app
export const { 
  useSession, 
  signIn, 
  signUp, 
  signOut
} = authClient

// Auth status type
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

// Enhanced user type with wallet information
export interface AuthUser {
  id: string
  name?: string
  email?: string
  emailVerified?: boolean
  image?: string
  displayName?: string
  walletAddress?: string // Legacy field
  createdAt: string
  updatedAt: string
  wallets?: Array<{
    id: string
    walletAddress: string
    blockchain: string
    walletType: 'external' | 'managed' | 'custodial'
    provider?: string
    isPrimary: boolean
    isActive: boolean
  }>
} 
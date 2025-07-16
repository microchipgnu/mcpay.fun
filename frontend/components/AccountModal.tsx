"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogContent,
  DialogHeader
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader
} from "@/components/ui/drawer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import { useTheme } from "@/context/ThemeContext"
import { signIn, signOut, useSession } from "@/lib/auth"
import { openExplorer } from "@/lib/blockscout"
import type { UserWallet } from "@/lib/types"
import { api, apiCall } from "@/lib/utils"
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  ExternalLink,
  Github,
  LogOut,
  Plus,
  Settings,
  Shield,
  Star,
  Trash2,
  TrendingUp,
  User,
  Wallet
} from "lucide-react"
import { useEffect, useState } from "react"
import { useAccount, useDisconnect } from "wagmi"
import { ConnectButton } from "./connect-button"

interface AccountModalProps {
  isOpen: boolean
  onClose: () => void
  defaultTab?: 'profile' | 'wallets' | 'settings'
}

interface ChainBalance {
  chain: string
  network: string
  balance: string
  balanceUsd: number
  tokens: Array<{
    symbol: string
    balance: string
    balanceUsd: number
    address?: string
  }>
}

interface BalancesByChain {
  [chainName: string]: Array<{
    address: string
    chain: string
    chainId: number
    chainName: string
    architecture: string
    isTestnet: boolean
    stablecoin: string
    stablecoinName: string
    tokenIdentifier: string
    balance: string
    formattedBalance: string
    decimals: number
    priceUsd: number
    fiatValue: number
  }>
}

export function AccountModal({ isOpen, onClose, defaultTab = 'profile' }: AccountModalProps) {
  const { isDark } = useTheme()
  const { data: session, isPending: sessionLoading } = useSession()
  const { address: connectedWallet, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const [activeTab, setActiveTab] = useState(defaultTab)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")
  const [userWallets, setUserWallets] = useState<UserWallet[]>([])
  const [isMobile, setIsMobile] = useState(false)
  const [totalFiatValue, setTotalFiatValue] = useState<number>(0)
  const [testnetTotalFiatValue, setTestnetTotalFiatValue] = useState<number>(0)
  const [balanceSummary, setBalanceSummary] = useState<{
    hasMainnetBalances: boolean
    hasTestnetBalances: boolean
    mainnetValueUsd: number
    testnetValueUsd: number
  }>({
    hasMainnetBalances: false,
    hasTestnetBalances: false,
    mainnetValueUsd: 0,
    testnetValueUsd: 0
  })
  
  // New state for improved UX
  const [portfolioView, setPortfolioView] = useState<'all' | 'live' | 'test'>('all')
  const [showDetails, setShowDetails] = useState(false)
  const [mainnetBalancesByChain, setMainnetBalancesByChain] = useState<BalancesByChain>({})
  const [testnetBalancesByChain, setTestnetBalancesByChain] = useState<BalancesByChain>({})
  
  // Check for mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load user wallets when authenticated
  useEffect(() => {
    if (session?.user?.id) {
      loadUserWallets()
    }
  }, [session?.user?.id])

  const loadUserWallets = async () => {
    if (!session?.user?.id) return
    
    try {
      // Include testnet balances in the API call using query parameters
      const response = await apiCall(`/users/${session.user.id}/wallets?includeTestnet=true`)
      const { 
        wallets, 
        totalFiatValue, 
        testnetTotalFiatValue,
        summary,
        mainnetBalancesByChain,
        testnetBalancesByChain
      } = response
      
      setUserWallets(wallets)
      setTotalFiatValue(parseFloat(totalFiatValue || '0'))
      setTestnetTotalFiatValue(parseFloat(testnetTotalFiatValue || '0'))
      setMainnetBalancesByChain(mainnetBalancesByChain || {})
      setTestnetBalancesByChain(testnetBalancesByChain || {})
      
      // Update balance summary for UI display
      setBalanceSummary({
        hasMainnetBalances: summary?.hasMainnetBalances || false,
        hasTestnetBalances: summary?.hasTestnetBalances || false,
        mainnetValueUsd: summary?.mainnetValueUsd || 0,
        testnetValueUsd: summary?.testnetValueUsd || 0
      })
    } catch (error) {
      console.error('Failed to load user wallets:', error)
      // Reset state on error
      setUserWallets([])
      setTotalFiatValue(0)
      setTestnetTotalFiatValue(0)
      setMainnetBalancesByChain({})
      setTestnetBalancesByChain({})
      setBalanceSummary({
        hasMainnetBalances: false,
        hasTestnetBalances: false,
        mainnetValueUsd: 0,
        testnetValueUsd: 0
      })
    }
  }

  const handleGitHubSignIn = async () => {
    setIsLoading(true)
    setError("")
    
    try {
      await signIn.social({ 
        provider: "github", 
        callbackURL: window.location.origin 
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to sign in with GitHub")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignOut = async () => {
    setIsLoading(true)
    try {
      await signOut()
      if (isConnected) {
        disconnect()
      }
      setUserWallets([])
    } catch (error) {
      console.error('Failed to sign out:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnectWallet = async () => {
    if (!session?.user?.id || !connectedWallet) return

    setIsLoading(true)
    try {
      await api.addWalletToUser(session.user.id, {
        walletAddress: connectedWallet,
        blockchain: 'ethereum',
        walletType: 'external',
        provider: 'metamask',
        isPrimary: userWallets.length === 0,
      })
      await loadUserWallets()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to connect wallet")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSetPrimaryWallet = async (walletId: string) => {
    if (!session?.user?.id) return

    setIsLoading(true)
    try {
      await api.setWalletAsPrimary(session.user.id, walletId)
      await loadUserWallets()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to set primary wallet")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveWallet = async (walletId: string, isPrimary: boolean) => {
    if (!session?.user?.id) return

    // Confirm removal, especially for primary wallets
    const confirmMessage = isPrimary 
      ? "Are you sure you want to remove your primary wallet? This will affect your account access."
      : "Are you sure you want to remove this wallet?"
    
    if (!confirm(confirmMessage)) return

    setIsLoading(true)
    try {
      await api.removeWallet(session.user.id, walletId)
      await loadUserWallets()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to remove wallet")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBuyCrypto = async () => {
    if (!session?.user?.id) return

    setIsLoading(true)
    try {
      const response = await api.createOnrampUrl(session.user.id, {
        redirectUrl: window.location.origin
      })
      
      if (response.onrampUrl) {
        // Open Coinbase Onramp in a new window
        window.open(response.onrampUrl, '_blank', 'noopener,noreferrer')
        toast.success("Redirecting to Coinbase to buy crypto...")
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create buy crypto URL")
      toast.error("Failed to open buy crypto flow")
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  // Helper function to get friendly chain display names
  const getChainDisplayName = (chainKey: string, chainName: string): string => {
    const chainMap: { [key: string]: string } = {
      'base': 'Base',
      'baseSepolia': 'Base Sepolia',
      'avalanche': 'Avalanche',
      'avalancheFuji': 'Avalanche Fuji',
      'iotex': 'IoTeX',
      'seiTestnet': 'Sei Testnet',
      'ethereum': 'Ethereum',
      'polygon': 'Polygon',
    }
    
    return chainMap[chainKey] || chainName || chainKey
  }

  // Helper function to format balance numbers nicely
  const formatBalance = (balance: number): string => {
    if (balance === 0) return '0.00'
    if (balance < 0.01) return '< 0.01'
    if (balance < 1) return balance.toFixed(4).replace(/\.?0+$/, '')
    if (balance < 1000) return balance.toFixed(2).replace(/\.?0+$/, '')
    if (balance < 1000000) return (balance / 1000).toFixed(1).replace(/\.?0+$/, '') + 'K'
    return (balance / 1000000).toFixed(1).replace(/\.?0+$/, '') + 'M'
  }

  // Helper function to transform chain balance data into ChainBalance format
  const transformChainData = (balancesByChain: BalancesByChain): ChainBalance[] => {
    const result: ChainBalance[] = []
    
    Object.entries(balancesByChain).forEach(([chainKey, balances]) => {
      if (!balances || balances.length === 0) return
      
      // Get friendly chain name
      const chainName = getChainDisplayName(chainKey, balances[0]?.chainName)
      const isTestnet = balances[0]?.isTestnet || false
      
      // Group tokens by stablecoin type and sum balances across all addresses
      const tokenGroups: { [symbol: string]: { balance: number; value: number; addresses: Set<string> } } = {}
      
      balances.forEach(balance => {
        if (!tokenGroups[balance.stablecoin]) {
          tokenGroups[balance.stablecoin] = { balance: 0, value: 0, addresses: new Set() }
        }
        tokenGroups[balance.stablecoin].balance += parseFloat(balance.formattedBalance)
        tokenGroups[balance.stablecoin].value += balance.fiatValue
        tokenGroups[balance.stablecoin].addresses.add(balance.tokenIdentifier)
      })
      
      // Calculate total balance for this chain
      const totalBalanceUsd = Object.values(tokenGroups).reduce((sum, group) => sum + group.value, 0)
      
      // Only include chains with actual balances > $0.001
      if (totalBalanceUsd > 0.001) {
        const tokens = Object.entries(tokenGroups)
          .map(([symbol, group]) => ({
            symbol,
            balance: group.balance.toString(),
            balanceUsd: group.value,
            address: Array.from(group.addresses)[0] // Use first address as reference
          }))
          .filter(token => token.balanceUsd > 0.001) // Only include tokens with meaningful value
          .sort((a, b) => b.balanceUsd - a.balanceUsd) // Sort by value, highest first
        
        if (tokens.length > 0) {
          result.push({
            chain: chainName,
            network: chainKey,
            balance: totalBalanceUsd.toString(),
            balanceUsd: totalBalanceUsd,
            tokens
          })
        }
      }
    })
    
    // Sort chains by balance value, highest first
    return result.sort((a, b) => b.balanceUsd - a.balanceUsd)
  }

  // Helper function to get filtered chains based on current view
  const getFilteredChains = () => {
    const mainnetChains = transformChainData(mainnetBalancesByChain)
    const testnetChains = transformChainData(testnetBalancesByChain)
    
    switch (portfolioView) {
      case 'live':
        return { chains: mainnetChains, total: totalFiatValue }
      case 'test':
        return { chains: testnetChains, total: testnetTotalFiatValue }
      default:
        return { 
          chains: [...mainnetChains, ...testnetChains], 
          total: totalFiatValue + testnetTotalFiatValue 
        }
    }
  }

  // Helper function to get network type badge color
  const getNetworkBadgeColor = (isMainnet: boolean) => {
    if (isMainnet) {
      return isDark ? "bg-green-900/30 text-green-400 border-green-700" : "bg-green-100 text-green-700 border-green-300"
    }
    return isDark ? "bg-orange-900/30 text-orange-400 border-orange-700" : "bg-orange-100 text-orange-700 border-orange-300"
  }

  // GitHub Sign In Component
  const GitHubSignIn = () => (
    <div className="space-y-5 p-1">
      <div className="text-center">
        <div className={`w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center ${
          isDark ? "bg-gray-800/50" : "bg-gray-50"
        }`}>
          <Github className={`h-6 w-6 ${isDark ? "text-gray-300" : "text-gray-600"}`} />
        </div>
        <h2 className={`text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
          Sign in to MCPay
        </h2>
        <p className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
          Connect with your GitHub account
        </p>
      </div>

      {error && (
        <div className={`p-3 rounded-lg border ${
          isDark ? "bg-red-950/50 border-red-800/50 text-red-400" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      <Button
        type="button"
        onClick={handleGitHubSignIn}
        disabled={isLoading}
        className="w-full h-11 text-[15px] font-medium"
        size="lg"
      >
        <Github className="h-4 w-4 mr-3" />
        {isLoading ? "Connecting..." : "Continue with GitHub"}
      </Button>

      <div className={`text-center text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
        By continuing, you agree to our Terms of Service and Privacy Policy
      </div>
    </div>
  )

  // Authenticated User Interface
  const AuthenticatedInterface = () => (
    <div className="space-y-4">
      {/* User Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isDark ? "bg-gray-800/50" : "bg-gray-50"
          }`}>
            {session?.user?.image ? (
              <img 
                src={session.user.image} 
                alt="Profile" 
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <User className={`h-5 w-5 ${isDark ? "text-gray-300" : "text-gray-600"}`} />
            )}
          </div>
          <div>
            <h3 className={`font-medium text-[15px] ${isDark ? "text-white" : "text-gray-900"}`}>
              {session?.user?.name || "User"}
            </h3>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {session?.user?.email}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          disabled={isLoading}
          className={`h-8 w-8 p-0 ${isDark ? "text-gray-400 hover:text-white hover:bg-gray-800" : "hover:bg-gray-100"}`}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className={`h-px ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'profile' | 'wallets' | 'settings')} className="w-full">
        <TabsList className={`grid w-full grid-cols-3 h-9 ${isDark ? "bg-gray-800/50" : "bg-gray-100"}`}>
          <TabsTrigger value="profile" className="text-sm">
            <User className="h-3.5 w-3.5 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="wallets" className="text-sm">
            <Wallet className="h-3.5 w-3.5 mr-1.5" />
            Wallets
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-sm">
            <Settings className="h-3.5 w-3.5 mr-1.5" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-3 mt-4">
          <div className={`rounded-lg border p-4 ${isDark ? "bg-gray-900/50 border-gray-800" : "bg-gray-50/50 border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-3">
              <User className="h-4 w-4" />
              <h4 className={`font-medium text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                Profile Information
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`text-xs font-medium block mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  Name
                </label>
                <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  {session?.user?.name || "Not set"}
                </p>
              </div>
              <div>
                <label className={`text-xs font-medium block mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  Email
                </label>
                <div className="flex items-center gap-1.5">
                  <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    {session?.user?.email?.slice(0, 20)}...
                  </p>
                  {session?.user?.emailVerified ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-orange-500" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Revolut-style Money Section */}
          <div className={`rounded-2xl border-0 ${
            isDark ? "bg-gradient-to-br from-gray-900 to-gray-800 shadow-xl" : "bg-gradient-to-br from-white to-gray-50 shadow-lg"
          } overflow-hidden`}>
            {/* Main Balance Display - The Real Meat */}
            <div className="p-6 pb-4">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isDark ? "bg-gradient-to-br from-green-500 to-green-600" : "bg-gradient-to-br from-green-500 to-green-600"
                  } shadow-lg`}>
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className={`font-semibold text-lg ${isDark ? "text-white" : "text-gray-900"}`}>
                      Your Funds
                    </h3>
                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      Available balance
                    </p>
                  </div>
                </div>
                
                {(balanceSummary.hasMainnetBalances || balanceSummary.hasTestnetBalances) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(!showDetails)}
                    className={`h-8 text-xs px-3 rounded-lg ${
                      isDark ? "hover:bg-gray-700/50" : "hover:bg-gray-100/50"
                    }`}
                  >
                    {showDetails ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                    Details
                  </Button>
                )}
              </div>

              {/* The Big Money Display */}
              {balanceSummary.hasMainnetBalances ? (
                <div className="space-y-1 mb-6">
                  <div className={`text-5xl font-bold tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>
                    ${formatBalance(totalFiatValue)}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className={`text-sm font-medium ${isDark ? "text-green-400" : "text-green-600"}`}>
                      Live on {transformChainData(mainnetBalancesByChain).length} network{transformChainData(mainnetBalancesByChain).length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 mb-6">
                  <div className={`text-5xl font-bold tracking-tight ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    $0.00
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <span className={`text-sm font-medium ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                      No real funds yet
                    </span>
                  </div>
                </div>
              )}

              {/* Test Money - Developer's Glimpse */}
              {balanceSummary.hasTestnetBalances && (
                <div className={`rounded-xl p-4 ${
                  isDark ? "bg-orange-900/20 border border-orange-800/30" : "bg-orange-50 border border-orange-200/50"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isDark ? "bg-orange-900/40" : "bg-orange-100"
                      }`}>
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                      </div>
                      <div>
                        <p className={`font-semibold text-sm ${isDark ? "text-orange-300" : "text-orange-800"}`}>
                          Developer Balance
                        </p>
                        <p className={`text-xs ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                          Test funds for development
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${isDark ? "text-orange-300" : "text-orange-700"}`}>
                        ${formatBalance(testnetTotalFiatValue)}
                      </div>
                      <div className={`text-xs ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                        {transformChainData(testnetBalancesByChain).length} testnet{transformChainData(testnetBalancesByChain).length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* No Balances State */}
              {!balanceSummary.hasMainnetBalances && !balanceSummary.hasTestnetBalances && (
                <div className="text-center py-8">
                  <Wallet className={`h-12 w-12 mx-auto mb-4 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                  <div className={`text-5xl font-bold tracking-tight mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    $0.00
                  </div>
                  <p className={`text-sm font-medium ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                    No funds in connected wallets
                  </p>
                </div>
              )}
            </div>

            {/* Wallet Count Footer */}
            <div className={`px-6 py-3 border-t ${
              isDark ? "border-gray-700/50 bg-gray-800/30" : "border-gray-200/50 bg-gray-50/50"
            }`}>
              <div className="flex items-center justify-between text-sm">
                <span className={isDark ? "text-gray-400" : "text-gray-600"}>
                  {userWallets.length} wallet{userWallets.length !== 1 ? 's' : ''} connected
                </span>
                <div className="flex items-center gap-4">
                  {balanceSummary.hasMainnetBalances && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className={`text-xs font-medium ${isDark ? "text-green-400" : "text-green-600"}`}>
                        LIVE
                      </span>
                    </div>
                  )}
                  {balanceSummary.hasTestnetBalances && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      <span className={`text-xs font-medium ${isDark ? "text-orange-400" : "text-orange-600"}`}>
                        TEST
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            



            {/* Collapsible Chain Details */}
            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleContent className="mt-4 space-y-3">
                <div className={`h-px ${isDark ? "bg-gray-800" : "bg-gray-200"}`} />
                
                {getFilteredChains().chains.length > 0 ? (
                  <div className="space-y-3 px-6 pb-4">
                    <h5 className={`text-xs font-semibold tracking-wide uppercase ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      Balance by Network
                    </h5>
                    
                    <div className="space-y-2">
                      {getFilteredChains().chains.map((chain, index) => {
                        const isMainnet = !chain.network.includes('Sepolia') && !chain.network.includes('Fuji') && !chain.network.includes('Testnet')
                        
                        return (
                          <div 
                            key={`${chain.chain}-${chain.network}-${index}`}
                            className={`group relative overflow-hidden rounded-xl border ${
                              isDark 
                                ? "bg-gray-800/30 border-gray-700/30 hover:bg-gray-800/50" 
                                : "bg-white/80 border-gray-200/50 hover:bg-gray-50/80"
                            } transition-all duration-200 hover:shadow-md`}
                          >
                            {/* Network type indicator bar */}
                            <div className={`absolute left-0 top-0 w-1 h-full ${
                              isMainnet ? 'bg-green-500' : 'bg-orange-500'
                            }`} />
                            
                            <div className="p-4 pl-5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  <div className="flex-shrink-0">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                      isMainnet 
                                        ? isDark 
                                          ? "bg-green-900/40 text-green-400" 
                                          : "bg-green-100 text-green-600"
                                        : isDark 
                                          ? "bg-orange-900/40 text-orange-400" 
                                          : "bg-orange-100 text-orange-600"
                                    }`}>
                                      <div className={`w-2 h-2 rounded-full ${isMainnet ? 'bg-green-500' : 'bg-orange-500'}`} />
                                    </div>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <h6 className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-900"} truncate`}>
                                        {chain.chain}
                                      </h6>
                                      <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wide ${
                                        isMainnet 
                                          ? isDark 
                                            ? "bg-green-900/50 text-green-400 border border-green-700/50"
                                            : "bg-green-100 text-green-700 border border-green-200"
                                          : isDark 
                                            ? "bg-orange-900/50 text-orange-400 border border-orange-700/50"
                                            : "bg-orange-100 text-orange-700 border border-orange-200"
                                      }`}>
                                        {isMainnet ? 'LIVE' : 'TEST'}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      {chain.tokens && chain.tokens.length > 0 && (
                                        <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                          {chain.tokens.length} token{chain.tokens.length !== 1 ? 's' : ''}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                                    ${formatBalance(chain.balanceUsd)}
                                  </div>
                                </div>
                              </div>
                              
                              {/* Token breakdown - clean and minimal */}
                              {chain.tokens && chain.tokens.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-gray-200/30 dark:border-gray-700/30">
                                  <div className="grid gap-1">
                                    {chain.tokens.slice(0, 3).map((token, tokenIndex) => (
                                      <div key={tokenIndex} className="flex items-center justify-between py-1">
                                        <span className={`text-xs font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                          {formatBalance(parseFloat(token.balance))} {token.symbol}
                                        </span>
                                        <span className={`text-xs font-bold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                                          ${formatBalance(token.balanceUsd)}
                                        </span>
                                      </div>
                                    ))}
                                    {chain.tokens.length > 3 && (
                                      <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                                        +{chain.tokens.length - 3} more token{chain.tokens.length - 3 !== 1 ? 's' : ''}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 px-6">
                    <div className={`w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center ${
                      isDark ? "bg-gray-800/40" : "bg-gray-100"
                    }`}>
                      <Wallet className={`h-6 w-6 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                    </div>
                    <p className={`text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      No balances found
                    </p>
                    <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-500"}`}>
                      Connect wallets with funds to see them here
                    </p>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </TabsContent>

        {/* Wallets Tab */}
        <TabsContent value="wallets" className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                Connected Wallets
              </h4>
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                Manage your blockchain wallets
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleBuyCrypto}
                disabled={isLoading || userWallets.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white h-8 text-xs px-3"
                title="Buy cryptocurrency for your wallets"
              >
                <CreditCard className="h-3 w-3 mr-1.5" />
                Buy Crypto
              </Button>
              {isConnected && !userWallets.find(w => w.walletAddress.toLowerCase() === connectedWallet?.toLowerCase()) && (
                <Button
                  size="sm"
                  onClick={handleConnectWallet}
                  disabled={isLoading}
                  className="h-8 text-xs px-3"
                >
                  <Plus className="h-3 w-3 mr-1.5" />
                  Link Wallet
                </Button>
              )}
            </div>
          </div>

          {/* Helper text for testnet */}
          {balanceSummary.hasTestnetBalances && (
            <div className={`text-xs px-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              💡 For test tokens, use faucets like{" "}
              <a 
                href="https://faucet.circle.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-400 underline"
              >
                Circle faucet
              </a>
            </div>
          )}

          {/* Current Connected Wallet (if not linked to account) */}
          {isConnected && !userWallets.find(w => w.walletAddress.toLowerCase() === connectedWallet?.toLowerCase()) && (
            <div className={`border border-dashed rounded-lg p-3 ${isDark ? "border-gray-700 bg-gray-800/30" : "border-gray-300 bg-gray-50"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Wallet className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                      Connected Wallet
                    </p>
                    <p className={`text-xs font-mono ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      {connectedWallet?.slice(0, 6)}...{connectedWallet?.slice(-4)}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">Not Linked</Badge>
              </div>
            </div>
          )}

          {/* Wallet Connection Component */}
          <div className={`rounded-lg border p-4 ${isDark ? "bg-gray-900/50 border-gray-800" : "bg-gray-50/50 border-gray-200"}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className={`font-medium text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                  Native Wallet
                </h4>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  Connect MetaMask, Coinbase Wallet, etc.
                </p>
              </div>
            </div>
            
            {!isConnected ? (
              <div className="text-center py-3">
                <Wallet className={`h-6 w-6 mx-auto mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                <p className={`text-xs mb-3 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  No native wallet connected
                </p>
                <ConnectButton />
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <div>
                    <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                      Connected
                    </p>
                    <p className={`text-xs font-mono ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      {connectedWallet?.slice(0, 6)}...{connectedWallet?.slice(-4)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!userWallets.find(w => w.walletAddress.toLowerCase() === connectedWallet?.toLowerCase()) && (
                    <Button
                      size="sm"
                      onClick={handleConnectWallet}
                      disabled={isLoading}
                      className="h-7 text-xs px-2"
                    >
                      Link
                    </Button>
                  )}
                  <ConnectButton />
                </div>
              </div>
            )}
          </div>

          {/* User's Linked Wallets */}
          <div className="space-y-2">
            {userWallets.map((wallet) => (
              <div key={wallet.id} className={`rounded-lg border p-3 ${isDark ? "bg-gray-900/50 border-gray-800" : "bg-white border-gray-200"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="relative">
                      <Wallet className="h-4 w-4" />
                      {wallet.isPrimary && (
                        <Star className="h-2.5 w-2.5 text-yellow-500 absolute -top-0.5 -right-0.5" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                          {wallet.walletAddress.slice(0, 6)}...{wallet.walletAddress.slice(-4)}
                        </p>
                        {wallet.isPrimary && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">Primary</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {wallet.blockchain}
                        </Badge>
                        <Badge variant="outline" className="text-xs px-1.5 py-0">
                          {wallet.walletType}
                        </Badge>
                        {wallet.provider && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            {wallet.provider}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(wallet.walletAddress)}
                      className="h-7 w-7 p-0"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openExplorer(wallet.walletAddress, 'base-sepolia')}
                      className="h-7 w-7 p-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                    {!wallet.isPrimary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetPrimaryWallet(wallet.id)}
                        disabled={isLoading}
                        className="h-7 px-2 text-xs"
                      >
                        <Star className="h-3 w-3 mr-1" />
                        Primary
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveWallet(wallet.id, wallet.isPrimary)}
                      disabled={isLoading}
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-3 mt-4">
          <div className={`rounded-lg border p-4 ${isDark ? "bg-gray-900/50 border-gray-800" : "bg-gray-50/50 border-gray-200"}`}>
            <div className="flex items-center gap-2 mb-3">
              <Settings className="h-4 w-4" />
              <h4 className={`font-medium text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                Account Settings
              </h4>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`font-medium text-sm ${isDark ? "text-white" : "text-gray-900"}`}>
                    Email Verification
                  </p>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {session?.user?.emailVerified ? "Your email is verified" : "Please verify your email"}
                  </p>
                </div>
                {session?.user?.emailVerified ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Button variant="outline" size="sm" className="h-7 text-xs px-3">
                    Verify
                  </Button>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )

  const LoadingSpinner = () => (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
    </div>
  )

  const ModalHeader = ({ Component }: { Component: any }) => (
    <Component>
      <div className="text-lg font-semibold">
        {session?.user ? "Account" : "Sign In"}
      </div>
    </Component>
  )

  if (sessionLoading) {
    if (isMobile) {
      return (
        <Drawer open={isOpen} onOpenChange={onClose}>
          <DrawerContent className={isDark ? "bg-gray-900 border-gray-800" : ""}>
            <LoadingSpinner />
          </DrawerContent>
        </Drawer>
      )
    }
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className={`max-w-md ${isDark ? "bg-gray-900 border-gray-800" : ""}`}>
          <LoadingSpinner />
        </DialogContent>
      </Dialog>
    )
  }

  // Mobile drawer
  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent className={`h-[65vh] ${isDark ? "bg-gray-900 border-gray-800" : ""}`}>
          <ModalHeader Component={DrawerHeader} />
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {session?.user ? <AuthenticatedInterface /> : <GitHubSignIn />}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  // Desktop dialog
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-lg h-[70vh] flex flex-col ${isDark ? "bg-gray-900 border-gray-800" : ""}`}>
        <ModalHeader Component={DialogHeader} />
        <div className="flex-1 overflow-y-auto px-1">
          {session?.user ? <AuthenticatedInterface /> : <GitHubSignIn />}
        </div>
      </DialogContent>
    </Dialog>
  )
} 
"use client"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { AddressLink } from "./ExplorerLink"
import { getNetworkByChainId, getTokenInfo, NETWORKS, type Network } from "@/lib/tokens"
import {
  getConnectionStatus,
  isCoinbaseWalletConnector,
  isMetaMaskConnector,
  isPortoConnector,
  switchToNetwork,
  verifyWalletConnection
} from "@/lib/wallet-utils"
import { AlertTriangle, CheckCircle, ChevronDown, DollarSign, Loader2, LogOut, Wallet } from "lucide-react"
import { useEffect, useState } from "react"
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, type Connector } from "wagmi"

export function ConnectButton() {
  const [isLoading, setIsLoading] = useState(false)
  const [connectionError, setConnectionError] = useState<string>("")
  const [isNetworkSwitching, setIsNetworkSwitching] = useState(false)

  const { connect, connectors, error: connectError } = useConnect()
  const { address, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()

  // Supported networks
  const supportedChains: Network[] = ['base-sepolia', 'sei-testnet']
  const currentNetwork = getNetworkByChainId(chainId) as Network
  const defaultNetwork: Network = 'base-sepolia'
  
  const connectionStatus = getConnectionStatus(isConnected, address, connector, chainId, currentNetwork)
  const verification = verifyWalletConnection(isConnected, address, connector)

  // USDC addresses for supported networks
  const usdcAddresses: Record<Network, string> = {
    'base-sepolia': '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
    'sei-testnet': '0x4fCF1784B31630811181f670Aea7A7bEF803eaED',
  }

  // Multi-chain balance fetching
  const baseSepoliaBalance = useBalance({
    address: address,
    token: usdcAddresses['base-sepolia'] as `0x${string}`,
    chainId: NETWORKS['base-sepolia'].chainId,
    query: {
      enabled: !!(address && usdcAddresses['base-sepolia'] && isConnected),
      refetchInterval: 30000,
    }
  })

  const seiTestnetBalance = useBalance({
    address: address,
    token: usdcAddresses['sei-testnet'] as `0x${string}`,
    chainId: NETWORKS['sei-testnet'].chainId,
    query: {
      enabled: !!(address && usdcAddresses['sei-testnet'] && isConnected),
      refetchInterval: 30000,
    }
  })

  const balanceQueries = [
    { network: 'base-sepolia' as Network, ...baseSepoliaBalance },
    { network: 'sei-testnet' as Network, ...seiTestnetBalance }
  ]

  // Handle connection errors
  useEffect(() => {
    if (connectError) {
      setConnectionError(connectError.message)
    } else {
      setConnectionError("")
    }
  }, [connectError])

  const handleConnect = async (connector: Connector) => {
    try {
      setIsLoading(true)
      setConnectionError("")

      // Try to switch to default network before connecting
      try {
        await switchToNetwork(defaultNetwork)
      } catch (error) {
        console.warn("Could not switch network before connecting:", error)
      }

      connect({ connector })
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to connect")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setIsLoading(true)
      disconnect()
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to disconnect")
    } finally {
      setIsLoading(false)
    }
  }

  const handleNetworkSwitch = async (targetNetwork: Network) => {
    try {
      setIsNetworkSwitching(true)
      setConnectionError("")
      const success = await switchToNetwork(targetNetwork)
      if (!success) {
        setConnectionError(`Failed to switch to ${NETWORKS[targetNetwork].name} network`)
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Failed to switch network")
    } finally {
      setIsNetworkSwitching(false)
    }
  }

  const formatAddress = (address?: string) => {
    if (!address) return ""
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const formatBalance = (balance: bigint | undefined, decimals: number) => {
    if (!balance) return "0.00"
    const formatted = Number(balance) / Math.pow(10, decimals)
    return formatted.toFixed(2)
  }

  // Get preferred connectors
  const metaMaskConnector = connectors.find(c => isMetaMaskConnector(c))
  const coinbaseConnector = connectors.find(c => isCoinbaseWalletConnector(c))
  const portoConnector = connectors.find(c => isPortoConnector(c))

  if (isConnected && address) {
    const isMetaMask = connector ? isMetaMaskConnector(connector) : false
    const isCoinbaseWallet = connector ? isCoinbaseWalletConnector(connector) : false
    const isPorto = connector ? isPortoConnector(connector) : false
    const currentNetworkInfo = currentNetwork ? NETWORKS[currentNetwork] : null
    const isOnSupportedNetwork = supportedChains.includes(currentNetwork)

    return (
      <div className="space-y-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              {formatAddress(address)}
              {isMetaMask && <Badge variant="outline" className="text-xs">MetaMask</Badge>}
              {isCoinbaseWallet && <Badge variant="outline" className="text-xs">Coinbase</Badge>}
              {isPorto && <Badge variant="outline" className="text-xs">Porto</Badge>}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96">
            {/* Connection Status - Cleaned up */}
            <div className="px-3 py-2 border-b">
              <div className="flex items-center gap-2">
                {verification.isValid ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                <span className="text-sm font-medium">
                  {verification.isValid ? "Connected" : "Connection Issues"}
                </span>
                {!isOnSupportedNetwork && (
                  <Badge variant="outline" className="text-xs text-orange-600">
                    Unsupported Network
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {connector?.name} • {currentNetwork ? NETWORKS[currentNetwork].name : 'Unknown Network'}
                {currentNetwork && (
                  <span className="ml-1">
                    ({currentNetwork.startsWith('sei') ? 'Sei' : 'Ethereum'} ecosystem)
                  </span>
                )}
              </p>
            </div>

            {/* Multi-Chain Balances - Cleaned up layout */}
            <div className="px-3 py-3 border-b">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium">USDC Balances</span>
              </div>

              <div className="space-y-2">
                {balanceQueries.map(({ network, data: balance, isLoading: isLoadingBalance, error }) => {
                  const networkInfo = NETWORKS[network]
                  const isCurrent = network === currentNetwork

                  return (
                    <div key={network} className={`flex justify-between items-center p-2 rounded-md ${isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-blue-500' : 'bg-gray-400'}`} />
                        <span className="text-xs font-medium">{networkInfo.name}</span>
                        {isCurrent && <Badge variant="outline" className="text-xs">Current</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">
                          {isLoadingBalance ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : error ? (
                            <span className="text-red-500">Error</span>
                          ) : balance ? (
                            `${formatBalance(balance.value, balance.decimals)} USDC`
                          ) : (
                            "0.00 USDC"
                          )}
                        </span>
                        {!isCurrent && (
                          <Button
                            onClick={() => handleNetworkSwitch(network)}
                            disabled={isNetworkSwitching}
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                          >
                            {isNetworkSwitching ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Switch"
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Network Switch Section - Only show if needed */}
            {!isOnSupportedNetwork && (
              <>
                <div className="px-3 py-2">
                  <p className="text-xs text-amber-600 mb-2">Switch to supported network:</p>
                  <div className="grid grid-cols-2 gap-1">
                    {supportedChains.map((network) => (
                      <Button
                        key={network}
                        onClick={() => handleNetworkSwitch(network)}
                        disabled={isNetworkSwitching}
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                      >
                        {NETWORKS[network].name}
                      </Button>
                    ))}
                  </div>
                </div>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Actions */}
            <DropdownMenuItem className="p-0">
              <AddressLink
                address={address}
                network={currentNetwork}
                variant="button"
                showExplorerName={true}
                className="w-full justify-start"
              />
            </DropdownMenuItem>

            <DropdownMenuItem onClick={handleDisconnect} className="cursor-pointer">
              <LogOut className="mr-2 h-4 w-4" />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Alerts - Cleaned up and simplified */}
        {verification.warnings.length > 0 && (
          <Alert className="w-full">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {verification.warnings[0]}
            </AlertDescription>
          </Alert>
        )}

        {!isOnSupportedNetwork && (
          <Alert className="w-full">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Switch to: {supportedChains.map(n => NETWORKS[n].name).join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {isNetworkSwitching && (
          <Alert className="w-full">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertDescription className="text-xs">
              Switching networks...
            </AlertDescription>
          </Alert>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting
              </>
            ) : (
              "Connect Wallet"
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Preferred Wallets First */}
          {metaMaskConnector && (
            <DropdownMenuItem
              onClick={() => handleConnect(metaMaskConnector)}
              className="cursor-pointer"
            >
              <div className="flex items-center justify-between w-full">
                <span>{metaMaskConnector.name}</span>
                <Badge variant="outline" className="text-xs">Recommended</Badge>
              </div>
            </DropdownMenuItem>
          )}

          {coinbaseConnector && (
            <DropdownMenuItem
              onClick={() => handleConnect(coinbaseConnector)}
              className="cursor-pointer"
            >
              <div className="flex items-center justify-between w-full">
                <span>{coinbaseConnector.name}</span>
                <Badge variant="outline" className="text-xs">Popular</Badge>
              </div>
            </DropdownMenuItem>
          )}

          {portoConnector && (
            <DropdownMenuItem
              onClick={() => handleConnect(portoConnector)}
              className="cursor-pointer"
            >
              {portoConnector.name}
            </DropdownMenuItem>
          )}

          {/* Other Connectors */}
          {connectors
            .filter(connector =>
              !isMetaMaskConnector(connector) &&
              !isCoinbaseWalletConnector(connector) &&
              !isPortoConnector(connector)
            )
            .map((connector) => (
              <DropdownMenuItem
                key={connector.id}
                onClick={() => handleConnect(connector)}
                className="cursor-pointer"
              >
                {connector.name}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {connectionError && (
        <Alert className="w-full">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {connectionError}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}

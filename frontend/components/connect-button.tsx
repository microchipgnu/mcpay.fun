"use client"

import { useState } from "react"
import { useConnect, useAccount, useDisconnect } from "wagmi"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Loader2, ChevronDown, LogOut, Wallet } from "lucide-react"

export function ConnectButton() {
  const [isLoading, setIsLoading] = useState(false)
  const { connect, connectors } = useConnect()
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()

  const handleConnect = async (connector: any) => {
    try {
      setIsLoading(true)
      connect({ connector })
    } catch (error) {
      console.error("Connection error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisconnect = async () => {
    try {
      setIsLoading(true)
      disconnect()
    } catch (error) {
      console.error("Disconnection error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Format address for display
  const formatAddress = (address?: string) => {
    if (!address) return ""
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  if (isConnected && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            {formatAddress(address)}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleDisconnect} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connecting
            </>
          ) : (
            <>Connect Wallet</>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {connectors.map((connector) => (
          <DropdownMenuItem key={connector.id} onClick={() => handleConnect(connector)} className="cursor-pointer">
            {connector.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

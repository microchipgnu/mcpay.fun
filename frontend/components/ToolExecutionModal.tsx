"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textArea"
import { useTheme } from "@/context/ThemeContext"
import {
  formatTokenAmount,
  getNetworkByChainId,
  getTokenInfo,
  getTokenVerification,
  NETWORKS,
  type Network
} from "@/lib/tokens"
import { urlUtils } from "@/lib/utils"
import { switchToNetwork } from "@/lib/wallet-utils"
import { experimental_createMCPClient } from "ai"
import {
  AlertCircle,
  CheckCircle,
  Coins,
  Copy,
  Loader2,
  Play,
  RefreshCw,
  Wrench
} from "lucide-react"
import { createPaymentTransport } from "mcpay/client"
import Image from "next/image"
import { useEffect, useState } from "react"
import { useAccount, useChainId, useWalletClient } from "wagmi"

interface InputProperty {
  type: string
  description?: string
  enum?: string[]
  default?: any
  minimum?: number
  maximum?: number
}

interface ToolInputSchema {
  type?: string
  properties?: Record<string, InputProperty>
  required?: string[]
}

interface Tool {
  id: string
  name: string
  description: string
  inputSchema: Record<string, unknown> | ToolInputSchema
  isMonetized: boolean
  pricing: Array<{
    id: string
    price: string
    currency: string
    network: string
    assetAddress: string
    active: boolean
  }>
}

interface ToolExecutionModalProps {
  isOpen: boolean
  onClose: () => void
  tool: Tool | null
  serverId: string
}

interface ToolExecution {
  status: 'idle' | 'initializing' | 'executing' | 'success' | 'error'
  result?: any
  error?: string
}

interface MCPTool {
  name: string
  description?: string
  execute: (params: Record<string, any>, options: { toolCallId: string; messages: any[] }) => Promise<any>
  [key: string]: any // Allow additional properties from the MCP client
}

export function ToolExecutionModal({ isOpen, onClose, tool, serverId }: ToolExecutionModalProps) {
  const { isDark } = useTheme()
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const [toolInputs, setToolInputs] = useState<Record<string, any>>({})
  const [execution, setExecution] = useState<ToolExecution>({ status: 'idle' })
  const [isMobile, setIsMobile] = useState(false)
  const [mcpClient, setMcpClient] = useState<any>(null)
  const [mcpTools, setMcpTools] = useState<Record<string, any>>({})
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSwitchingNetwork, setIsSwitchingNetwork] = useState(false)

  // Network compatibility checking
  const getRequiredNetwork = () => {
    if (!tool?.isMonetized || !tool.pricing.length) return null
    return tool.pricing[0].network
  }

  const getCurrentNetwork = () => {
    return chainId ? getNetworkByChainId(chainId) : null
  }

  const getCurrentBlockchain = () => {
    const network = getCurrentNetwork()
    if (!network) return 'ethereum'
    return network.startsWith('sei') ? 'sei' : 'ethereum'
  }

  const isOnCorrectNetwork = () => {
    const requiredNetwork = getRequiredNetwork()
    const currentNetwork = getCurrentNetwork()
    
    if (!requiredNetwork) return true // Free tools don't require specific network
    return requiredNetwork === currentNetwork
  }

  const handleNetworkSwitch = async () => {
    const requiredNetwork = getRequiredNetwork()
    if (!requiredNetwork) return

    setIsSwitchingNetwork(true)
    setExecution({ status: 'idle' }) // Clear any previous errors
    
    try {
      console.log(`[Network Switch] Starting switch to ${requiredNetwork}`)
      console.log(`[Network Switch] Network info:`, NETWORKS[requiredNetwork as Network])
      
      await switchToNetwork(requiredNetwork as Network)
      console.log(`[Network Switch] Successfully switched to ${requiredNetwork}`)
      
      // Clear any previous errors after successful switch
      if (execution.status === 'error') {
        setExecution({ status: 'idle' })
      }
    } catch (error) {
      console.error('[Network Switch] Failed to switch network:', error)
      console.error('[Network Switch] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        requiredNetwork,
        availableNetworks: Object.keys(NETWORKS)
      })
      
      setExecution({ 
        status: 'error', 
        error: `Failed to switch to ${requiredNetwork}: ${error instanceof Error ? error.message : 'Unknown error. Check browser console for details.'}`
      })
    } finally {
      setIsSwitchingNetwork(false)
    }
  }

  // Enhanced formatCurrency function using token registry
  const formatCurrency = (amount: string | number, currency: string, network?: string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount

    // If we have network info, try to get token info from registry
    if (network) {
      const tokenInfo = getTokenInfo(currency, network as Network)
      if (tokenInfo) {
        // Use our awesome token registry formatting
        return formatTokenAmount(num, currency, network as Network, {
          showSymbol: true,
          precision: tokenInfo.isStablecoin ? 2 : 4,
          compact: num >= 1000
        })
      }
    }

    // Fallback: check if it's a token address and show abbreviated
    if (currency.startsWith('0x') && currency.length === 42) {
      return `${num.toFixed(6)} ${currency.slice(0, 6)}...${currency.slice(-4)}`
    }

    // Simple currency display
    return `${num.toFixed(6)} ${currency}`
  }

  // Enhanced token display with verification badge
  const TokenDisplay = ({
    currency,
    network,
    amount,
    showVerification = false
  }: {
    currency: string
    network: string
    amount?: string | number
    showVerification?: boolean
  }) => {
    const tokenInfo = getTokenInfo(currency, network as Network)
    const verification = getTokenVerification(currency, network as Network)

    return (
      <div className="flex items-center gap-2">
        {/* Token Logo */}
        {tokenInfo?.logoUri && (
          <div className="w-4 h-4 rounded-full overflow-hidden">
            <Image
              src={tokenInfo.logoUri}
              alt={tokenInfo.symbol}
              width={16}
              height={16}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Amount and Symbol */}
        <div className="flex items-center gap-1">
          {amount && (
            <span className="font-medium">
              {formatCurrency(amount, currency, network)}
            </span>
          )}
          {!amount && tokenInfo && (
            <span className="font-medium">{tokenInfo.symbol}</span>
          )}
          {!amount && !tokenInfo && (
            <span className="font-mono text-xs">
              {currency.startsWith('0x') ? `${currency.slice(0, 6)}...` : currency}
            </span>
          )}
        </div>
      </div>
    )
  }

  // Check if we're on mobile
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)
    
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  // Helper function to safely get tool properties from MCP tool or server tool
  const getToolProperties = (tool: Tool): Record<string, InputProperty> => {
    // First try to get from MCP client tools (if available and initialized)
    if (isInitialized && mcpTools[tool.name]) {
      const mcpTool = mcpTools[tool.name] as any
      if (mcpTool.parameters?.jsonSchema?.properties) {
        return mcpTool.parameters.jsonSchema.properties
      }
    }
    
    // Fallback to server tool inputSchema
    const schema = tool.inputSchema as any
    if (schema && typeof schema === 'object' && schema.properties) {
      return schema.properties
    }
    return {}
  }

  // Helper function to get required fields from MCP tool or server tool
  const getRequiredFields = (tool: Tool): string[] => {
    // First try to get from MCP client tools (if available and initialized)
    if (isInitialized && mcpTools[tool.name]) {
      const mcpTool = mcpTools[tool.name] as any
      if (mcpTool.parameters?.jsonSchema?.required) {
        return mcpTool.parameters.jsonSchema.required
      }
    }
    
    // Fallback to server tool inputSchema
    const schema = tool.inputSchema as any
    if (schema && typeof schema === 'object' && schema.required) {
      return schema.required
    }
    return []
  }

  // Helper function to check if tool has inputs
  const hasToolInputs = (tool: Tool): boolean => {
    const properties = getToolProperties(tool)
    return Object.keys(properties).length > 0
  }

  // Initialize tool inputs when tool changes
  useEffect(() => {
    if (!tool) return
    
    const inputs: Record<string, any> = {}
    const properties = getToolProperties(tool)
    
    Object.entries(properties).forEach(([key, prop]) => {
      if (prop.type === 'array') {
        inputs[key] = prop.default || []
      } else {
        inputs[key] = prop.default || ''
      }
    })
    
    setToolInputs(inputs)
    setExecution({ status: 'idle' })
    setIsInitialized(false) // Reset initialization when tool changes
    setIsSwitchingNetwork(false) // Reset network switching state
  }, [tool])

  // Initialize MCP client when modal opens and user is connected
  useEffect(() => {
    if (!isOpen || !isConnected || !address || !tool || !walletClient || isInitialized) return

    const initializeMcpClient = async () => {
      try {
        setExecution({ status: 'initializing' })

        // Create the MCP URL using the serverId
        const mcpUrl = new URL(urlUtils.getMcpUrl(serverId))
        
        // Create a viem-compatible Account object that x402 can use
        const account = walletClient

        console.log("Creating payment transport with viem account:", account);
        console.log("Wallet client chain info:", walletClient.chain);

        const transport = createPaymentTransport(new URL(mcpUrl), account, {
          maxPaymentValue: BigInt(0.1 * 10 ** 6), // 0.1 USDC max
          requestInit: {
            credentials: "include",
          }
        });

        // Create MCP client
        const client = await experimental_createMCPClient({
          transport: transport,
        })

        console.log("MCP client created", client)

        // Get available tools
        const tools = await client.tools()
        console.log("Available MCP tools:", tools)

        setMcpClient(client)
        setMcpTools(tools)
        setIsInitialized(true)
        setExecution({ status: 'idle' })
        
        console.log(`MCP client initialized for tool: ${tool.name}`)
        console.log(`Available tools: ${Object.keys(tools).join(', ')}`)
        
        // Check if the current tool is available in MCP
        if (tools[tool.name]) {
          console.log(`Current tool found in MCP:`, tools[tool.name])
          console.log(`Current tool schema:`, (tools[tool.name] as any).parameters?.jsonSchema)
        } else {
          console.warn(`Warning: Tool "${tool.name}" not found in MCP server tools`)
        }
      } catch (error) {
        console.error("Failed to initialize MCP client:", error)
        setExecution({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Failed to initialize MCP client'
        })
      }
    }

    initializeMcpClient()
  }, [isOpen, isConnected, address, tool, serverId, walletClient, isInitialized])

  // Cleanup when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsInitialized(false)
      setMcpClient(null)
      setMcpTools({})
      setExecution({ status: 'idle' })
      setIsSwitchingNetwork(false)
    }
  }, [isOpen])

  const updateToolInput = (inputName: string, value: any) => {
    setToolInputs(prev => ({
      ...prev,
      [inputName]: value
    }))
  }

  const executeTool = async () => {
    if (!tool || !mcpClient || !isInitialized || !walletClient) return
    
    setExecution({ status: 'executing' })

    try {
      // Get the MCP tool by name
      const mcpTool = mcpTools[tool.name]
      
      if (!mcpTool) {
        throw new Error(`Tool "${tool.name}" not found in MCP server`)
      }

      console.log(`Executing MCP tool: ${tool.name}`, toolInputs)
      console.log(`MCP tool schema:`, (mcpTool as any).parameters?.jsonSchema)
      
      // Execute the tool using the MCP client's callTool method
      const result = await mcpTool.execute(toolInputs, {
        toolCallId: "123",
        messages: []
      })
      
      console.log(`Tool execution result:`, result)
      
      setExecution({ 
        status: 'success', 
        result 
      })
          } catch (error) {
        console.error("Tool execution error:", error)
        setExecution({ 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Unknown error occurred'
        })
      }
  }

  const copyResult = (result: any) => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
  }

  const renderInputField = (inputName: string, inputProp: InputProperty) => {
    if (!tool) return null
    
    const currentValue = toolInputs[inputName] || ''
    const requiredFields = getRequiredFields(tool)
    const isRequired = requiredFields.includes(inputName)

    // Handle array inputs
    if (inputProp.type === 'array') {
      const arrayValue = Array.isArray(currentValue) ? currentValue : []
      
      const addArrayItem = () => {
        const newArray = [...arrayValue, '']
        updateToolInput(inputName, newArray)
      }
      
      const removeArrayItem = (index: number) => {
        const newArray = arrayValue.filter((_: any, i: number) => i !== index)
        updateToolInput(inputName, newArray)
      }
      
      const updateArrayItem = (index: number, value: string) => {
        const newArray = [...arrayValue]
        newArray[index] = value
        updateToolInput(inputName, newArray)
      }

      return (
        <div key={inputName} className="space-y-2">
          <label className={`text-sm font-medium flex items-center gap-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            {inputName}
            {isRequired && <span className="text-red-500">*</span>}
          </label>
          <div className="space-y-2">
            {arrayValue.map((item: string, index: number) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="text"
                  value={item}
                  onChange={(e) => updateArrayItem(index, e.target.value)}
                  placeholder={`Enter ${inputName} item ${index + 1}`}
                  className={`flex-1 ${isDark ? "bg-gray-700 border-gray-600 text-white" : ""}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeArrayItem(index)}
                  className={`px-2 ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : ""}`}
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addArrayItem}
              className={`w-full ${isDark ? "border-gray-600 text-gray-300 hover:bg-gray-700" : ""}`}
            >
              + Add {inputName} item
            </Button>
          </div>
          {inputProp.description && (
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {inputProp.description}
            </p>
          )}
        </div>
      )
    }

    if (inputProp.enum) {
      return (
        <div key={inputName} className="space-y-2">
          <label className={`text-sm font-medium flex items-center gap-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            {inputName}
            {isRequired && <span className="text-red-500">*</span>}
          </label>
          <select
            className={`w-full px-3 py-2 rounded-md border text-sm ${
              isDark 
                ? "bg-gray-700 border-gray-600 text-white" 
                : "bg-white border-gray-300 text-gray-900"
            }`}
            value={currentValue}
            onChange={(e) => updateToolInput(inputName, e.target.value)}
          >
            <option value="">Select {inputName}</option>
            {inputProp.enum.map(option => (
              <option key={String(option)} value={String(option)}>{String(option)}</option>
            ))}
          </select>
          {inputProp.description && (
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {inputProp.description}
            </p>
          )}
        </div>
      )
    }

    if (inputProp.type === 'number' || inputProp.type === 'integer') {
      return (
        <div key={inputName} className="space-y-2">
          <label className={`text-sm font-medium flex items-center gap-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            {inputName}
            {isRequired && <span className="text-red-500">*</span>}
          </label>
          <Input
            type="number"
            value={currentValue}
            onChange={(e) => updateToolInput(inputName, parseFloat(e.target.value) || '')}
            placeholder={`Enter ${inputName}`}
            min={inputProp.minimum}
            max={inputProp.maximum}
            className={isDark ? "bg-gray-700 border-gray-600 text-white" : ""}
          />
          {inputProp.description && (
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {inputProp.description}
            </p>
          )}
        </div>
      )
    }

    if (inputProp.type === 'boolean') {
      return (
        <div key={inputName} className="space-y-2">
          <label className={`flex items-center gap-2 text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            <input
              type="checkbox"
              checked={currentValue === true}
              onChange={(e) => updateToolInput(inputName, e.target.checked)}
              className="rounded"
            />
            {inputName}
            {isRequired && <span className="text-red-500">*</span>}
          </label>
          {inputProp.description && (
            <p className={`text-xs ml-6 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {inputProp.description}
            </p>
          )}
        </div>
      )
    }

    // Default to text input
    const isLongText = inputProp.description && inputProp.description.length > 100
    
    return (
      <div key={inputName} className="space-y-2">
        <label className={`text-sm font-medium flex items-center gap-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
          {inputName}
          {isRequired && <span className="text-red-500">*</span>}
        </label>
        {isLongText ? (
          <Textarea
            value={currentValue}
            onChange={(e) => updateToolInput(inputName, e.target.value)}
            placeholder={`Enter ${inputName}`}
            rows={3}
            className={isDark ? "bg-gray-700 border-gray-600 text-white" : ""}
          />
        ) : (
          <Input
            type="text"
            value={currentValue}
            onChange={(e) => updateToolInput(inputName, e.target.value)}
            placeholder={`Enter ${inputName}`}
            className={isDark ? "bg-gray-700 border-gray-600 text-white" : ""}
          />
        )}
        {inputProp.description && (
          <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            {inputProp.description}
          </p>
        )}
      </div>
    )
  }

  const renderContent = () => {
    if (!tool) return null

    const properties = getToolProperties(tool)
    const hasInputs = hasToolInputs(tool)

    return (
      <div className="space-y-6">
        {/* Tool Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{tool.name}</h3>
            {tool.isMonetized ? (
              <Badge variant="secondary" className={`text-xs flex items-center gap-1 ${isDark ? "bg-gray-600 text-gray-200" : ""}`}>
                <Coins className="h-3 w-3" />
                Paid
              </Badge>
            ) : (
              <Badge variant="outline" className={`text-xs ${isDark ? "border-gray-500 text-gray-300" : ""}`}>
                Free
              </Badge>
            )}
          </div>
          
          <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
            {(isInitialized && (mcpTools[tool.name] as any)?.description) || tool.description}
          </p>

          {tool.isMonetized && tool.pricing.length > 0 && (
            <div className={`p-3 rounded-md border ${
              isDark ? "bg-green-900/20 text-green-400 border-green-800" : "bg-green-50 text-green-600 border-green-200"
            }`}>
              <div className="flex items-center gap-2 text-sm">
                <Coins className="h-4 w-4" />
                <span className="font-medium">Paid Tool</span>
              </div>
              <div className="mt-1 text-xs">
                <div className="flex items-center gap-1">
                  <span>Price:</span>
                  <TokenDisplay
                    currency={tool.pricing[0].currency}
                    network={tool.pricing[0].network}
                    amount={tool.pricing[0].price}
                    showVerification={true}
                  />
                </div>
                <div>Network: {tool.pricing[0].network}</div>
              </div>
              <div className="mt-2 text-xs opacity-80">
                Payment will be automatically handled when you execute this tool.
              </div>
            </div>
          )}

          {/* Network Status Warning */}
          {tool.isMonetized && tool.pricing.length > 0 && isConnected && !isOnCorrectNetwork() && (
            <div className={`p-3 rounded-md border ${
              isDark ? "bg-orange-900/20 text-orange-400 border-orange-800" : "bg-orange-50 text-orange-600 border-orange-200"
            }`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium mb-1">Network Mismatch</div>
                  <div className="text-xs mb-3">
                    This tool requires <strong>{getRequiredNetwork()}</strong> network, but youre connected to{" "}
                    <strong>{getCurrentNetwork() || 'unknown network'}</strong>.
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleNetworkSwitch}
                      disabled={isSwitchingNetwork}
                      size="sm"
                      className={`text-xs ${
                        isDark 
                          ? "bg-orange-600 hover:bg-orange-700 text-white" 
                          : "bg-orange-600 hover:bg-orange-700 text-white"
                      }`}
                    >
                      {isSwitchingNetwork ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Switching...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Switch to {getRequiredNetwork()}
                        </>
                      )}
                    </Button>
                    
                    {/* Manual add network info */}
                    {getRequiredNetwork() === 'sei-testnet' && (
                      <Button
                        onClick={() => {
                          const networkInfo = NETWORKS['sei-testnet']
                          const config = {
                            chainId: `0x${networkInfo.chainId.toString(16)}`,
                            chainName: networkInfo.name,
                            nativeCurrency: networkInfo.nativeCurrency,
                            rpcUrls: networkInfo.rpcUrls,
                            blockExplorerUrls: networkInfo.blockExplorerUrls,
                          }
                          navigator.clipboard.writeText(JSON.stringify(config, null, 2))
                          console.log('[Manual Network] Sei Testnet config:', config)
                          alert('Sei Testnet network config copied to clipboard!\n\nTo manually add:\n1. Open your wallet settings\n2. Go to Networks\n3. Add Custom Network\n4. Paste the config\n\nOr check browser console for details.')
                        }}
                        variant="outline"
                        size="sm"
                        className="text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Manual Setup
                      </Button>
                    )}
                  </div>
                  
                  {/* Manual Instructions for Sei Testnet */}
                  {getRequiredNetwork() === 'sei-testnet' && (
                    <div className="mt-3 p-2 rounded text-xs bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800">
                      <div className="font-medium mb-1">Sei Testnet Network Details:</div>
                      <div className="space-y-1 font-mono text-xs">
                        <div>Chain ID: 1328 (0x530)</div>
                        <div>RPC: https://evm-rpc-testnet.sei-apis.com</div>
                        <div>Symbol: SEI</div>
                        <div>Explorer: https://seitrace.com/?chain=atlantic-2</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Fields */}
        {hasInputs && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-md font-medium">Parameters</h4>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(properties).map(([inputName, inputProp]) =>
                renderInputField(inputName, inputProp)
              )}
            </div>
          </div>
                  )}

          {/* Network Status Success */}
          {tool.isMonetized && tool.pricing.length > 0 && isConnected && isOnCorrectNetwork() && (
            <div className={`p-3 rounded-md border ${
              isDark ? "bg-green-900/20 text-green-400 border-green-800" : "bg-green-50 text-green-600 border-green-200"
            }`}>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <div className="text-sm">
                  <span className="font-medium">Ready to Execute</span>
                  <span className="ml-2 text-xs opacity-80">
                    Connected to {getCurrentNetwork()} network
                  </span>
                </div>
              </div>
            </div>
          )}

        {/* Connection Status */}
        {!isConnected || !walletClient ? (
          <div className={`p-4 rounded-md border ${
            isDark ? "bg-yellow-900/20 text-yellow-400 border-yellow-800" : "bg-yellow-50 text-yellow-600 border-yellow-200"
          }`}>
            <p className="text-sm">
              {!isConnected 
                ? "Please connect your wallet to execute this tool." 
                : "Waiting for wallet client to be ready..."}
            </p>
          </div>
        ) : !isInitialized && execution.status !== 'error' ? (
          <div className={`p-4 rounded-md border ${
            isDark ? "bg-blue-900/20 text-blue-400 border-blue-800" : "bg-blue-50 text-blue-600 border-blue-200"
          }`}>
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <p className="text-sm">Initializing MCP connection...</p>
            </div>
          </div>
        ) : isInitialized && !mcpTools[tool.name] ? (
          <div className={`p-4 rounded-md border ${
            isDark ? "bg-orange-900/20 text-orange-400 border-orange-800" : "bg-orange-50 text-orange-600 border-orange-200"
          }`}>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">Tool &quot;{tool.name}&quot; not found in MCP server.</p>
            </div>
            <p className="text-xs mt-1 opacity-80">
              Available tools: {Object.keys(mcpTools).join(', ') || 'None'}
            </p>
          </div>
        ) : null}

        {/* Execute Button */}
        <Button
          onClick={executeTool}
          disabled={
            !isConnected || 
            !walletClient || 
            !isInitialized || 
            !mcpTools[tool.name] || 
            execution.status === 'executing' || 
            execution.status === 'initializing' ||
            (tool.isMonetized && !isOnCorrectNetwork()) ||
            isSwitchingNetwork
          }
          className={`w-full ${isDark ? "bg-blue-600 hover:bg-blue-700" : ""}`}
        >
          {execution.status === 'initializing' ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Initializing...
            </>
          ) : execution.status === 'executing' ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Executing...
            </>
          ) : isSwitchingNetwork ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Switching Network...
            </>
          ) : tool.isMonetized && !isOnCorrectNetwork() ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Switch Network to Execute
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Execute Tool
            </>
          )}
        </Button>

        {/* Execution Result */}
        {execution.status === 'success' && execution.result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Result
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyResult(execution.result)}
                className={isDark ? "border-gray-600 text-gray-300" : ""}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <div className={`rounded-md border max-h-48 overflow-hidden ${
              isDark ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-200"
            }`}>
              <pre className={`text-xs p-3 max-h-48 overflow-auto whitespace-pre ${
                isDark ? "text-gray-300" : "text-gray-800"
              }`}>
                {JSON.stringify(execution.result, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {execution.status === 'error' && execution.error && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Error
            </h4>
            <div className={`text-sm p-3 rounded-md ${
              isDark ? "bg-red-900/20 text-red-400 border border-red-800" : "bg-red-50 text-red-600 border border-red-200"
            }`}>
              {execution.error}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={onClose}>
        <DrawerContent className={`max-h-[85vh] ${isDark ? "bg-gray-800 border-gray-700" : ""}`}>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Execute Tool
            </DrawerTitle>
            <DrawerDescription>
              Set parameters and run this MCP tool
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            {renderContent()}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`max-w-2xl max-h-[85vh] overflow-hidden flex flex-col ${isDark ? "bg-gray-800 border-gray-700" : ""}`}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Execute Tool
          </DialogTitle>
          <DialogDescription>
            Set parameters and run this MCP tool
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  )
} 
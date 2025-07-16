/**
 * Multi-Chain Stablecoin Balance Tracker
 * 
 * This library provides a chain-agnostic interface for checking stablecoin balances
 * across multiple blockchain architectures and calculating total fiat value.
 * 
 * ## Supported Stablecoins:
 * - **USDC**: USD Coin (Circle)
 * - **USDT**: Tether USD
 * - **DAI**: MakerDAO Stablecoin
 * - **BUSD**: Binance USD (where available)
 * - **FRAX**: Frax Stablecoin
 * 
 * ## Supported Blockchain Architectures:
 * - **EVM**: Ethereum Virtual Machine compatible chains (using viem)
 *   - Base, Base Sepolia, Avalanche, Avalanche Fuji, IoTeX, Sei Testnet
 * - **Solana**: Solana blockchain (placeholder for @solana/web3.js implementation)
 *   - Mainnet Beta, Devnet
 * - **Near**: Near Protocol (placeholder for near-api-js implementation)
 *   - Mainnet, Testnet
 * 
 * ## Key Features:
 * 
 * 1. **Multi-Stablecoin Support**: Track USDC, USDT, DAI, and other stablecoins
 * 2. **Fiat Value Calculation**: Get USD-denominated balances across all tokens
 * 3. **Price Integration**: Real-time or configured pricing for accurate fiat values
 * 4. **Chain-Agnostic**: Works across EVM, Solana, Near, and other architectures
 * 5. **Aggregated Reporting**: Total fiat balance across all accounts, tokens, and chains
 * 
 * ## Architecture Design:
 * 
 * 1. **Stablecoin Configuration**: Flexible token definitions per chain
 * 2. **Price Providers**: Pluggable price fetching (APIs, oracles, or fixed rates)
 * 3. **Blockchain Clients**: Architecture-specific implementations
 * 4. **Fiat Aggregation**: USD value calculation and cross-chain totals
 * 
 * ## Usage Examples:
 * 
 * ```typescript
 * // Check all stablecoin balances for accounts
 * const result = await getStablecoinBalances(['0x...', 'alice.near'])
 * console.log(`Total USD value: $${result.totalFiatValue}`)
 * 
 * // Check specific stablecoins only
 * const usdcOnly = await getStablecoinBalances(addresses, ['USDC'])
 * 
 * // Check on specific chains
 * const evmBalances = await getStablecoinBalancesOnChains(addresses, getEVMChains())
 * ```
 */

import { createPublicClient, http, formatUnits, type Address } from 'viem'

// Blockchain architecture types
export type BlockchainArchitecture = 'evm' | 'solana' | 'near' | 'cosmos' | 'bitcoin'

// Supported stablecoin types
export type StablecoinSymbol = 'USDC' | 'USDT' | 'DAI' | 'BUSD' | 'FRAX' | 'TUSD' | 'USDP'

// Generic address type that can handle different address formats
export type BlockchainAddress = string

// Stablecoin metadata
export interface StablecoinConfig {
  symbol: StablecoinSymbol
  name: string
  decimals: number
  coingeckoId?: string // For price fetching
  isPegged: boolean // Whether it's pegged to USD (affects pricing strategy)
  pegTarget?: number // Target peg value in USD (usually 1.0)
}

// Stablecoin definitions
export const STABLECOIN_CONFIGS: Record<StablecoinSymbol, StablecoinConfig> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    coingeckoId: 'usd-coin',
    isPegged: true,
    pegTarget: 1.0,
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    coingeckoId: 'tether',
    isPegged: true,
    pegTarget: 1.0,
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    coingeckoId: 'dai',
    isPegged: true,
    pegTarget: 1.0,
  },
  BUSD: {
    symbol: 'BUSD',
    name: 'Binance USD',
    decimals: 18,
    coingeckoId: 'binance-usd',
    isPegged: true,
    pegTarget: 1.0,
  },
  FRAX: {
    symbol: 'FRAX',
    name: 'Frax',
    decimals: 18,
    coingeckoId: 'frax',
    isPegged: false, // Algorithmic stablecoin, price can vary
    pegTarget: 1.0,
  },
  TUSD: {
    symbol: 'TUSD',
    name: 'TrueUSD',
    decimals: 18,
    coingeckoId: 'true-usd',
    isPegged: true,
    pegTarget: 1.0,
  },
  USDP: {
    symbol: 'USDP',
    name: 'Pax Dollar',
    decimals: 18,
    coingeckoId: 'paxos-standard',
    isPegged: true,
    pegTarget: 1.0,
  },
}

// Token configuration per chain architecture
export interface EVMTokenConfig {
  address: Address
  symbol: StablecoinSymbol
}

export interface SolanaTokenConfig {
  mint: string
  symbol: StablecoinSymbol
}

export interface NearTokenConfig {
  contract: string
  symbol: StablecoinSymbol
}

// Generic chain configuration interface
export interface BaseChainConfig {
  chainId: string | number
  name: string
  architecture: BlockchainArchitecture
  rpcUrl: string
  isTestnet: boolean // Add flag to distinguish testnet from mainnet
  nativeCurrency: {
    symbol: string
    decimals: number
  }
}

// EVM-specific chain configuration
export interface EVMChainConfig extends BaseChainConfig {
  architecture: 'evm'
  chainId: number
  stablecoins: EVMTokenConfig[]
}

// Solana-specific chain configuration
export interface SolanaChainConfig extends BaseChainConfig {
  architecture: 'solana'
  chainId: string
  stablecoins: SolanaTokenConfig[]
}

// Near-specific chain configuration
export interface NearChainConfig extends BaseChainConfig {
  architecture: 'near'
  chainId: string
  stablecoins: NearTokenConfig[]
}

// Union type for all chain configurations
export type ChainConfig = EVMChainConfig | SolanaChainConfig | NearChainConfig

export const SUPPORTED_CHAINS: Record<string, ChainConfig> = {
  // EVM Chains
  baseSepolia: {
    architecture: 'evm',
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    isTestnet: true,
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    stablecoins: [
      { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC' },
      { address: '0x036cec1a199234fc02f72d29e596a58034100694', symbol: 'USDT' },
      { address: '0xf59d77573c53e81809c7d9eb7d83be9f4f412c4c', symbol: 'DAI' },
    ],
  } as EVMChainConfig,
  base: {
    architecture: 'evm',
    chainId: 8453,
    name: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    isTestnet: false,
    nativeCurrency: { symbol: 'ETH', decimals: 18 },
    stablecoins: [
      { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC' },
      { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', symbol: 'USDT' },
      { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI' },
    ],
  } as EVMChainConfig,
  avalancheFuji: {
    architecture: 'evm',
    chainId: 43113,
    name: 'Avalanche Fuji',
    rpcUrl: 'https://api.avax-test.network/ext/bc/C/rpc',
    isTestnet: true,
    nativeCurrency: { symbol: 'AVAX', decimals: 18 },
    stablecoins: [
      { address: '0x5425890298aed601595a70AB815c96711a31Bc65', symbol: 'USDC' },
    ],
  } as EVMChainConfig,
  avalanche: {
    architecture: 'evm',
    chainId: 43114,
    name: 'Avalanche',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    isTestnet: false,
    nativeCurrency: { symbol: 'AVAX', decimals: 18 },
    stablecoins: [
      { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', symbol: 'USDC' },
      { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', symbol: 'USDT' },
      { address: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70', symbol: 'DAI' },
    ],
  } as EVMChainConfig,
  iotex: {
    architecture: 'evm',
    chainId: 4689,
    name: 'IoTeX Network',
    rpcUrl: 'https://babel-api.mainnet.iotex.io',
    isTestnet: false,
    nativeCurrency: { symbol: 'IOTX', decimals: 18 },
    stablecoins: [
      { address: '0xcdf79194c6c285077a58da47641d4dbe51f63542', symbol: 'USDC' },
    ],
  } as EVMChainConfig,
  seiTestnet: {
    architecture: 'evm',
    chainId: 1328,
    name: 'Sei Testnet',
    rpcUrl: 'https://evm-rpc-testnet.sei-apis.com',
    isTestnet: true,
    nativeCurrency: { symbol: 'SEI', decimals: 6 },
    stablecoins: [
      { address: '0x4fCF1784B31630811181f670Aea7A7bEF803eaED', symbol: 'USDC' },
    ],
  } as EVMChainConfig,

  // Solana Chains
  solanaMainnet: {
    architecture: 'solana',
    chainId: 'mainnet-beta',
    name: 'Solana Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    isTestnet: false,
    nativeCurrency: { symbol: 'SOL', decimals: 9 },
    stablecoins: [
      { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC' },
      { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT' },
    ],
  } as SolanaChainConfig,
  solanaDevnet: {
    architecture: 'solana',
    chainId: 'devnet',
    name: 'Solana Devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    isTestnet: true,
    nativeCurrency: { symbol: 'SOL', decimals: 9 },
    stablecoins: [
      { mint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', symbol: 'USDC' },
    ],
  } as SolanaChainConfig,

  // Near Chains
  nearMainnet: {
    architecture: 'near',
    chainId: 'mainnet',
    name: 'NEAR Mainnet',
    rpcUrl: 'https://rpc.mainnet.near.org',
    isTestnet: false,
    nativeCurrency: { symbol: 'NEAR', decimals: 24 },
    stablecoins: [
      { contract: 'a0b86991c431e3a7e3cd0c6b8b3a5e3b4e3a7e3cd0c.near', symbol: 'USDC' },
      { contract: 'usdt.tether-token.near', symbol: 'USDT' },
    ],
  } as NearChainConfig,
  nearTestnet: {
    architecture: 'near',
    chainId: 'testnet',
    name: 'NEAR Testnet',
    rpcUrl: 'https://rpc.testnet.near.org',
    isTestnet: true,
    nativeCurrency: { symbol: 'NEAR', decimals: 24 },
    stablecoins: [
      { contract: 'usdc.testnet', symbol: 'USDC' },
    ],
  } as NearChainConfig,
}

export type SupportedChain = keyof typeof SUPPORTED_CHAINS

// ERC-20 ABI for balanceOf function
const erc20Abi = [
  {
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// Type guards for different chain architectures
export function isEVMChain(config: ChainConfig): config is EVMChainConfig {
  return config.architecture === 'evm'
}

export function isSolanaChain(config: ChainConfig): config is SolanaChainConfig {
  return config.architecture === 'solana'
}

export function isNearChain(config: ChainConfig): config is NearChainConfig {
  return config.architecture === 'near'
}

// Price provider interface for fetching current stablecoin prices
export interface PriceProvider {
  getPrice(symbol: StablecoinSymbol): Promise<number>
  getPrices(symbols: StablecoinSymbol[]): Promise<Record<StablecoinSymbol, number>>
}

// Simple price provider that assumes 1:1 USD peg for stablecoins
export class SimplePriceProvider implements PriceProvider {
  async getPrice(symbol: StablecoinSymbol): Promise<number> {
    const config = STABLECOIN_CONFIGS[symbol]
    return config.isPegged ? (config.pegTarget || 1.0) : 1.0
  }

  async getPrices(symbols: StablecoinSymbol[]): Promise<Record<StablecoinSymbol, number>> {
    const prices = {} as Record<StablecoinSymbol, number>
    for (const symbol of symbols) {
      prices[symbol] = await this.getPrice(symbol)
    }
    return prices
  }
}

// Balance result for a single stablecoin on a single chain
export interface StablecoinBalance {
  address: BlockchainAddress
  chain: SupportedChain
  chainId: string | number
  chainName: string
  architecture: BlockchainArchitecture
  isTestnet: boolean // Add flag to indicate if this balance is on a testnet
  stablecoin: StablecoinSymbol
  stablecoinName: string
  tokenIdentifier: string // Contract address, mint address, etc.
  balance: bigint
  formattedBalance: string
  decimals: number
  priceUsd: number
  fiatValue: number // USD value of the balance (should be 0 for testnet balances in real calculations)
}

export interface StablecoinBalanceError {
  address: BlockchainAddress
  chain: SupportedChain
  chainId: string | number
  chainName: string
  architecture: BlockchainArchitecture
  isTestnet: boolean // Add flag to indicate if this error was on a testnet
  stablecoin: StablecoinSymbol
  tokenIdentifier: string
  error: string
}

export interface MultiChainStablecoinResult {
  balances: StablecoinBalance[]
  errors: StablecoinBalanceError[]
  // Separate totals for mainnet and testnet
  totalFiatValue: number // Total fiat value from mainnet chains only
  testnetTotalFiatValue: number // Total fiat value from testnet chains (for display purposes)
  mainnetBalances: StablecoinBalance[] // Mainnet balances only
  testnetBalances: StablecoinBalance[] // Testnet balances only
  balancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>>
  balancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>>
  // Separate groupings for mainnet and testnet
  mainnetBalancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>>
  testnetBalancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>>
  mainnetBalancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>>
  testnetBalancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>>
  summary: {
    totalAccounts: number
    totalChainsChecked: number
    totalStablecoinsChecked: number
    successfulChecks: number
    failedChecks: number
    // Additional testnet/mainnet breakdown
    mainnetChainsChecked: number
    testnetChainsChecked: number
    mainnetSuccessfulChecks: number
    testnetSuccessfulChecks: number
  }
}

// Abstract interface for blockchain clients
interface StablecoinClient {
  getTokenBalance(address: BlockchainAddress, tokenConfig: EVMTokenConfig | SolanaTokenConfig | NearTokenConfig, chainConfig: ChainConfig): Promise<bigint>
}

// EVM client implementation using viem
class EVMStablecoinClient implements StablecoinClient {
  private erc20Abi = [
    {
      inputs: [{ name: '_owner', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ name: 'balance', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const

  async getTokenBalance(address: BlockchainAddress, tokenConfig: EVMTokenConfig | SolanaTokenConfig | NearTokenConfig, chainConfig: ChainConfig): Promise<bigint> {
    if (!isEVMChain(chainConfig) || !('address' in tokenConfig)) {
      throw new Error('Invalid EVM configuration')
    }

    const client = createPublicClient({
      transport: http(chainConfig.rpcUrl),
    })

    const balance = await client.readContract({
      address: tokenConfig.address,
      abi: this.erc20Abi,
      functionName: 'balanceOf',
      args: [address as Address],
    }) as bigint

    return balance
  }
}

// Solana client implementation (placeholder - would use @solana/web3.js)
class SolanaStablecoinClient implements StablecoinClient {
  async getTokenBalance(address: BlockchainAddress, tokenConfig: EVMTokenConfig | SolanaTokenConfig | NearTokenConfig, chainConfig: ChainConfig): Promise<bigint> {
    if (!isSolanaChain(chainConfig) || !('mint' in tokenConfig)) {
      throw new Error('Invalid Solana configuration')
    }

    // TODO: Implement Solana SPL token balance checking
    // This would use @solana/web3.js and @solana/spl-token
    throw new Error('Solana balance checking not implemented yet')
  }
}

// Near client implementation (placeholder - would use near-api-js)
class NearStablecoinClient implements StablecoinClient {
  async getTokenBalance(address: BlockchainAddress, tokenConfig: EVMTokenConfig | SolanaTokenConfig | NearTokenConfig, chainConfig: ChainConfig): Promise<bigint> {
    if (!isNearChain(chainConfig) || !('contract' in tokenConfig)) {
      throw new Error('Invalid Near configuration')
    }

    // TODO: Implement Near fungible token balance checking
    // This would use near-api-js
    throw new Error('Near balance checking not implemented yet')
  }
}

// Factory to create appropriate client based on chain architecture
function createStablecoinClient(architecture: BlockchainArchitecture): StablecoinClient {
  switch (architecture) {
    case 'evm':
      return new EVMStablecoinClient()
    case 'solana':
      return new SolanaStablecoinClient()
    case 'near':
      return new NearStablecoinClient()
    default:
      throw new Error(`Unsupported blockchain architecture: ${architecture}`)
  }
}

/**
 * Check balance for a single stablecoin on a single chain for a single account
 */
export async function getStablecoinBalanceOnChain(
  address: BlockchainAddress,
  chain: SupportedChain,
  stablecoinSymbol: StablecoinSymbol,
  priceProvider: PriceProvider = new SimplePriceProvider()
): Promise<StablecoinBalance | StablecoinBalanceError> {
  const chainConfig = SUPPORTED_CHAINS[chain]
  if (!chainConfig) {
    return {
      address,
      chain,
      chainId: 'unknown',
      chainName: 'Unknown',
      architecture: 'evm', // default fallback
      isTestnet: false, // default fallback
      stablecoin: stablecoinSymbol,
      tokenIdentifier: 'unknown',
      error: `Unsupported chain: ${chain}`,
    }
  }

  // Find the stablecoin configuration for this chain
  const tokenConfig = chainConfig.stablecoins.find(token => token.symbol === stablecoinSymbol)
  if (!tokenConfig) {
    return {
      address,
      chain,
      chainId: chainConfig.chainId,
      chainName: chainConfig.name,
      architecture: chainConfig.architecture,
      isTestnet: chainConfig.isTestnet,
      stablecoin: stablecoinSymbol,
      tokenIdentifier: 'not_found',
      error: `${stablecoinSymbol} not supported on ${chainConfig.name}`,
    }
  }

  const stablecoinConfig = STABLECOIN_CONFIGS[stablecoinSymbol]
  
  try {
    const client = createStablecoinClient(chainConfig.architecture)
    const balance = await client.getTokenBalance(address, tokenConfig, chainConfig)
    const priceUsd = await priceProvider.getPrice(stablecoinSymbol)

    // Format balance using the stablecoin's decimals
    const formattedBalance = formatUnits(balance, stablecoinConfig.decimals)
    const fiatValue = parseFloat(formattedBalance) * priceUsd

    // Get the appropriate token identifier based on chain architecture
    let tokenIdentifier: string
    if ('address' in tokenConfig) {
      tokenIdentifier = tokenConfig.address
    } else if ('mint' in tokenConfig) {
      tokenIdentifier = tokenConfig.mint
    } else if ('contract' in tokenConfig) {
      tokenIdentifier = tokenConfig.contract
    } else {
      tokenIdentifier = 'unknown'
    }

    return {
      address,
      chain,
      chainId: chainConfig.chainId,
      chainName: chainConfig.name,
      architecture: chainConfig.architecture,
      isTestnet: chainConfig.isTestnet,
      stablecoin: stablecoinSymbol,
      stablecoinName: stablecoinConfig.name,
      tokenIdentifier,
      balance,
      formattedBalance,
      decimals: stablecoinConfig.decimals,
      priceUsd,
      fiatValue,
    }
  } catch (error) {
    const tokenIdentifier = 'address' in tokenConfig ? tokenConfig.address :
                           'mint' in tokenConfig ? tokenConfig.mint :
                           'contract' in tokenConfig ? tokenConfig.contract : 'unknown'

    return {
      address,
      chain,
      chainId: chainConfig.chainId,
      chainName: chainConfig.name,
      architecture: chainConfig.architecture,
      isTestnet: chainConfig.isTestnet,
      stablecoin: stablecoinSymbol,
      tokenIdentifier,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check stablecoin balances for multiple accounts across all supported chains
 */
export async function getStablecoinBalances(
  addresses: BlockchainAddress[],
  stablecoins: StablecoinSymbol[] = ['USDC', 'USDT', 'DAI'],
  priceProvider: PriceProvider = new SimplePriceProvider()
): Promise<MultiChainStablecoinResult> {
  if (!addresses || addresses.length === 0) {
    return {
      balances: [],
      errors: [],
      totalFiatValue: 0,
      testnetTotalFiatValue: 0,
      mainnetBalances: [],
      testnetBalances: [],
      balancesByChain: {},
      balancesByStablecoin: {},
      mainnetBalancesByChain: {},
      testnetBalancesByChain: {},
      mainnetBalancesByStablecoin: {},
      testnetBalancesByStablecoin: {},
      summary: {
        totalAccounts: 0,
        totalChainsChecked: 0,
        totalStablecoinsChecked: 0,
        successfulChecks: 0,
        failedChecks: 0,
        mainnetChainsChecked: 0,
        testnetChainsChecked: 0,
        mainnetSuccessfulChecks: 0,
        testnetSuccessfulChecks: 0,
      },
    }
  }

  const balances: StablecoinBalance[] = []
  const errors: StablecoinBalanceError[] = []

  // Create promises for all address-chain-stablecoin combinations
  const promises: Promise<StablecoinBalance | StablecoinBalanceError>[] = []
  
  for (const address of addresses) {
    for (const chain of Object.keys(SUPPORTED_CHAINS) as SupportedChain[]) {
      for (const stablecoin of stablecoins) {
        promises.push(getStablecoinBalanceOnChain(address, chain, stablecoin, priceProvider))
      }
    }
  }

  // Execute all balance checks in parallel
  const results = await Promise.allSettled(promises)
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const balanceResult = result.value
      if ('balance' in balanceResult) {
        balances.push(balanceResult)
      } else {
        errors.push(balanceResult)
      }
    } else {
      console.error('Unexpected promise rejection:', result.reason)
    }
  }

  // Separate mainnet and testnet balances
  const mainnetBalances = balances.filter(balance => !balance.isTestnet)
  const testnetBalances = balances.filter(balance => balance.isTestnet)

  // Calculate aggregated results - only mainnet balances count toward real fiat value
  const totalFiatValue = mainnetBalances.reduce((sum, balance) => sum + balance.fiatValue, 0)
  const testnetTotalFiatValue = testnetBalances.reduce((sum, balance) => sum + balance.fiatValue, 0)

  // Group all balances by chain
  const balancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>> = {}
  const mainnetBalancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>> = {}
  const testnetBalancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>> = {}

  for (const balance of balances) {
    if (!balancesByChain[balance.chain]) {
      balancesByChain[balance.chain] = []
    }
    balancesByChain[balance.chain]!.push(balance)

    if (balance.isTestnet) {
      if (!testnetBalancesByChain[balance.chain]) {
        testnetBalancesByChain[balance.chain] = []
      }
      testnetBalancesByChain[balance.chain]!.push(balance)
    } else {
      if (!mainnetBalancesByChain[balance.chain]) {
        mainnetBalancesByChain[balance.chain] = []
      }
      mainnetBalancesByChain[balance.chain]!.push(balance)
    }
  }

  // Group all balances by stablecoin
  const balancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>> = {}
  const mainnetBalancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>> = {}
  const testnetBalancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>> = {}

  for (const balance of balances) {
    if (!balancesByStablecoin[balance.stablecoin]) {
      balancesByStablecoin[balance.stablecoin] = []
    }
    balancesByStablecoin[balance.stablecoin]!.push(balance)

    if (balance.isTestnet) {
      if (!testnetBalancesByStablecoin[balance.stablecoin]) {
        testnetBalancesByStablecoin[balance.stablecoin] = []
      }
      testnetBalancesByStablecoin[balance.stablecoin]!.push(balance)
    } else {
      if (!mainnetBalancesByStablecoin[balance.stablecoin]) {
        mainnetBalancesByStablecoin[balance.stablecoin] = []
      }
      mainnetBalancesByStablecoin[balance.stablecoin]!.push(balance)
    }
  }

  // Count chains by type
  const allChains = Object.values(SUPPORTED_CHAINS)
  const mainnetChains = allChains.filter(chain => !chain.isTestnet)
  const testnetChains = allChains.filter(chain => chain.isTestnet)

  return {
    balances,
    errors,
    totalFiatValue,
    testnetTotalFiatValue,
    mainnetBalances,
    testnetBalances,
    balancesByChain,
    balancesByStablecoin,
    mainnetBalancesByChain,
    testnetBalancesByChain,
    mainnetBalancesByStablecoin,
    testnetBalancesByStablecoin,
    summary: {
      totalAccounts: addresses.length,
      totalChainsChecked: allChains.length,
      totalStablecoinsChecked: stablecoins.length,
      successfulChecks: balances.length,
      failedChecks: errors.length,
      mainnetChainsChecked: mainnetChains.length,
      testnetChainsChecked: testnetChains.length,
      mainnetSuccessfulChecks: mainnetBalances.length,
      testnetSuccessfulChecks: testnetBalances.length,
    },
  }
}

/**
 * Get stablecoin balances for accounts on specific chains only
 */
export async function getStablecoinBalancesOnChains(
  addresses: BlockchainAddress[],
  chains: SupportedChain[],
  stablecoins: StablecoinSymbol[] = ['USDC', 'USDT', 'DAI'],
  priceProvider: PriceProvider = new SimplePriceProvider()
): Promise<MultiChainStablecoinResult> {
  if (!addresses || addresses.length === 0 || !chains || chains.length === 0) {
    return {
      balances: [],
      errors: [],
      totalFiatValue: 0,
      testnetTotalFiatValue: 0,
      mainnetBalances: [],
      testnetBalances: [],
      balancesByChain: {},
      balancesByStablecoin: {},
      mainnetBalancesByChain: {},
      testnetBalancesByChain: {},
      mainnetBalancesByStablecoin: {},
      testnetBalancesByStablecoin: {},
      summary: {
        totalAccounts: 0,
        totalChainsChecked: 0,
        totalStablecoinsChecked: 0,
        successfulChecks: 0,
        failedChecks: 0,
        mainnetChainsChecked: 0,
        testnetChainsChecked: 0,
        mainnetSuccessfulChecks: 0,
        testnetSuccessfulChecks: 0,
      },
    }
  }

  const balances: StablecoinBalance[] = []
  const errors: StablecoinBalanceError[] = []

  // Create promises for specified address-chain-stablecoin combinations only
  const promises: Promise<StablecoinBalance | StablecoinBalanceError>[] = []
  
  for (const address of addresses) {
    for (const chain of chains) {
      if (chain in SUPPORTED_CHAINS) {
        for (const stablecoin of stablecoins) {
          promises.push(getStablecoinBalanceOnChain(address, chain, stablecoin, priceProvider))
        }
      }
    }
  }

  // Execute all balance checks in parallel
  const results = await Promise.allSettled(promises)
  
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const balanceResult = result.value
      if ('balance' in balanceResult) {
        balances.push(balanceResult)
      } else {
        errors.push(balanceResult)
      }
    }
  }

  // Separate mainnet and testnet balances
  const mainnetBalances = balances.filter(balance => !balance.isTestnet)
  const testnetBalances = balances.filter(balance => balance.isTestnet)

  // Calculate aggregated results - only mainnet balances count toward real fiat value
  const totalFiatValue = mainnetBalances.reduce((sum, balance) => sum + balance.fiatValue, 0)
  const testnetTotalFiatValue = testnetBalances.reduce((sum, balance) => sum + balance.fiatValue, 0)

  // Group all balances by chain
  const balancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>> = {}
  const mainnetBalancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>> = {}
  const testnetBalancesByChain: Partial<Record<SupportedChain, StablecoinBalance[]>> = {}

  for (const balance of balances) {
    if (!balancesByChain[balance.chain]) {
      balancesByChain[balance.chain] = []
    }
    balancesByChain[balance.chain]!.push(balance)

    if (balance.isTestnet) {
      if (!testnetBalancesByChain[balance.chain]) {
        testnetBalancesByChain[balance.chain] = []
      }
      testnetBalancesByChain[balance.chain]!.push(balance)
    } else {
      if (!mainnetBalancesByChain[balance.chain]) {
        mainnetBalancesByChain[balance.chain] = []
      }
      mainnetBalancesByChain[balance.chain]!.push(balance)
    }
  }

  // Group all balances by stablecoin
  const balancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>> = {}
  const mainnetBalancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>> = {}
  const testnetBalancesByStablecoin: Partial<Record<StablecoinSymbol, StablecoinBalance[]>> = {}

  for (const balance of balances) {
    if (!balancesByStablecoin[balance.stablecoin]) {
      balancesByStablecoin[balance.stablecoin] = []
    }
    balancesByStablecoin[balance.stablecoin]!.push(balance)

    if (balance.isTestnet) {
      if (!testnetBalancesByStablecoin[balance.stablecoin]) {
        testnetBalancesByStablecoin[balance.stablecoin] = []
      }
      testnetBalancesByStablecoin[balance.stablecoin]!.push(balance)
    } else {
      if (!mainnetBalancesByStablecoin[balance.stablecoin]) {
        mainnetBalancesByStablecoin[balance.stablecoin] = []
      }
      mainnetBalancesByStablecoin[balance.stablecoin]!.push(balance)
    }
  }

  // Count specified chains by type
  const specifiedChainConfigs = chains
    .map(chain => SUPPORTED_CHAINS[chain])
    .filter((chain): chain is ChainConfig => chain !== undefined)
  const mainnetChains = specifiedChainConfigs.filter(chain => !chain.isTestnet)
  const testnetChains = specifiedChainConfigs.filter(chain => chain.isTestnet)

  return {
    balances,
    errors,
    totalFiatValue,
    testnetTotalFiatValue,
    mainnetBalances,
    testnetBalances,
    balancesByChain,
    balancesByStablecoin,
    mainnetBalancesByChain,
    testnetBalancesByChain,
    mainnetBalancesByStablecoin,
    testnetBalancesByStablecoin,
    summary: {
      totalAccounts: addresses.length,
      totalChainsChecked: chains.length,
      totalStablecoinsChecked: stablecoins.length,
      successfulChecks: balances.length,
      failedChecks: errors.length,
      mainnetChainsChecked: mainnetChains.length,
      testnetChainsChecked: testnetChains.length,
      mainnetSuccessfulChecks: mainnetBalances.length,
      testnetSuccessfulChecks: testnetBalances.length,
    },
  }
}

/**
 * Utility function to get supported chains list
 */
export function getSupportedChains(): SupportedChain[] {
  return Object.keys(SUPPORTED_CHAINS) as SupportedChain[]
}

/**
 * Utility function to get chain info
 */
export function getChainInfo(chain: SupportedChain) {
  return SUPPORTED_CHAINS[chain]
}

/**
 * Get chains by blockchain architecture
 */
export function getChainsByArchitecture(architecture: BlockchainArchitecture): SupportedChain[] {
  return Object.entries(SUPPORTED_CHAINS)
    .filter(([_, config]) => config.architecture === architecture)
    .map(([chainKey]) => chainKey as SupportedChain)
}

/**
 * Get all EVM chains
 */
export function getEVMChains(): SupportedChain[] {
  return getChainsByArchitecture('evm')
}

/**
 * Get all Solana chains
 */
export function getSolanaChains(): SupportedChain[] {
  return getChainsByArchitecture('solana')
}

/**
 * Get all Near chains
 */
export function getNearChains(): SupportedChain[] {
  return getChainsByArchitecture('near')
}

/**
 * Check if an address format matches a blockchain architecture
 */
export function validateAddressFormat(address: BlockchainAddress, architecture: BlockchainArchitecture): boolean {
  switch (architecture) {
    case 'evm':
      return /^0x[a-fA-F0-9]{40}$/.test(address)
    case 'solana':
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
    case 'near':
      return /^([a-z\d]+[\-_])*[a-z\d]+\.near$|^[a-f0-9]{64}$/.test(address)
    default:
      return false
  }
}

/**
 * Get supported architectures
 */
export function getSupportedArchitectures(): BlockchainArchitecture[] {
  const architectures = new Set<BlockchainArchitecture>()
  Object.values(SUPPORTED_CHAINS).forEach(config => {
    architectures.add(config.architecture)
  })
  return Array.from(architectures)
}

/**
 * Example usage function - demonstrating how to use the stablecoin balance checker with testnet/mainnet separation
 */
export async function exampleUsage() {
  const addresses: BlockchainAddress[] = [
    '0x742d35Cc6634C0532925a3b8D41E5b8F7c5c5C04', // EVM addresses
    '0x742d35Cc6634C0532925a3b8D41E5b8F7c5c5C05',
    'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK', // Solana addresses
    'alice.near', // Near addresses
  ]

  // Check all stablecoin balances across all supported chains (with testnet/mainnet separation)
  console.log('Checking stablecoin balances across all chains with testnet/mainnet separation...')
  const allChainsResult = await getStablecoinBalances(addresses)
  
  console.log(`Real money (mainnet) total: $${allChainsResult.totalFiatValue.toFixed(2)}`)
  console.log(`Test money (testnet) total: $${allChainsResult.testnetTotalFiatValue.toFixed(2)}`)
  console.log(`Mainnet successful checks: ${allChainsResult.summary.mainnetSuccessfulChecks}`)
  console.log(`Testnet successful checks: ${allChainsResult.summary.testnetSuccessfulChecks}`)

  // Check only mainnet balances (real money)
  console.log('\nChecking mainnet balances only (real money)...')
  const mainnetResult = await getMainnetStablecoinBalances(addresses)
  console.log(`Total real money value: $${mainnetResult.totalFiatValue.toFixed(2)}`)

  // Check only testnet balances
  console.log('\nChecking testnet balances only...')
  const testnetResult = await getTestnetStablecoinBalances(addresses)
  console.log(`Total test money value: $${testnetResult.totalFiatValue.toFixed(2)}`)

  // Check USDC only on EVM chains
  console.log('\nChecking USDC balances on EVM chains only...')
  const evmChains = getEVMChains()
  const evmResult = await getStablecoinBalancesOnChains(addresses, evmChains, ['USDC'])
  console.log(`Total USDC value on EVM chains: $${evmResult.totalFiatValue.toFixed(2)} (mainnet)`)
  console.log(`Total USDC test value on EVM chains: $${evmResult.testnetTotalFiatValue.toFixed(2)} (testnet)`)

  // Show supported network types
  console.log('\nSupported network types:')
  console.log('Mainnet chains:', getMainnetChains())
  console.log('Testnet chains:', getTestnetChains())
  console.log('All EVM chains:', getEVMChains())
  console.log('All Solana chains:', getSolanaChains())
  console.log('All Near chains:', getNearChains())
  
  // Print detailed results grouped by network type and stablecoin
  console.log('\nMainnet Balances by Stablecoin (Real Money):')
  for (const [stablecoin, balances] of Object.entries(allChainsResult.mainnetBalancesByStablecoin)) {
    if (balances && balances.length > 0) {
      const totalValue = balances.reduce((sum, bal) => sum + bal.fiatValue, 0)
      console.log(`\n${stablecoin}: $${totalValue.toFixed(2)} total (REAL MONEY)`)
      balances.forEach((balance: StablecoinBalance) => {
        console.log(`  ${balance.address} on ${balance.chainName}: ${balance.formattedBalance} ${balance.stablecoin} ($${balance.fiatValue.toFixed(2)})`)
      })
    }
  }

  console.log('\nTestnet Balances by Stablecoin (Test Money):')
  for (const [stablecoin, balances] of Object.entries(allChainsResult.testnetBalancesByStablecoin)) {
    if (balances && balances.length > 0) {
      const totalValue = balances.reduce((sum, bal) => sum + bal.fiatValue, 0)
      console.log(`\n${stablecoin}: $${totalValue.toFixed(2)} total (TEST MONEY)`)
      balances.forEach((balance: StablecoinBalance) => {
        console.log(`  ${balance.address} on ${balance.chainName}: ${balance.formattedBalance} ${balance.stablecoin} ($${balance.fiatValue.toFixed(2)}) [TESTNET]`)
      })
    }
  }

  // Print errors
  if (allChainsResult.errors.length > 0) {
    console.log('\nErrors:')
    allChainsResult.errors.forEach((error: StablecoinBalanceError) => {
      const networkType = error.isTestnet ? 'TESTNET' : 'MAINNET'
      console.log(`  ${error.address} on ${error.chainName} (${error.architecture}) [${networkType}] - ${error.stablecoin}: ${error.error}`)
    })
  }

  // Example API Usage:
  console.log('\nExample API Usage:')
  console.log('GET /api/users/:userId/wallets - Returns both mainnet and testnet balances')
  console.log('GET /api/users/:userId/wallets?includeTestnet=true - Includes testnet balance details')
  console.log('GET /api/users/:userId/wallets/mainnet-balances - Returns only real money balances')
  console.log('GET /api/users/:userId/wallets/testnet-balances - Returns only test money balances')

  return allChainsResult
}

// Blockchain architecture mapping from blockchain names
export const BLOCKCHAIN_TO_ARCHITECTURE: Record<string, BlockchainArchitecture> = {
  // EVM-based blockchains
  'ethereum': 'evm',
  'polygon': 'evm',
  'base': 'evm',
  'base-sepolia': 'evm',
  'base-mainnet': 'evm',
  'avalanche': 'evm',
  'avalanche-fuji': 'evm',
  'iotex': 'evm',
  'sei-testnet': 'evm',
  'sei': 'evm',
  'arbitrum': 'evm',
  'optimism': 'evm',
  'bsc': 'evm',
  'binance-smart-chain': 'evm',
  'fantom': 'evm',
  'gnosis': 'evm',
  'celo': 'evm',
  'aurora': 'evm',
  'moonbeam': 'evm',
  'moonriver': 'evm',
  'cronos': 'evm',
  'harmony': 'evm',
  'metis': 'evm',
  'boba': 'evm',
  'fuse': 'evm',
  'evmos': 'evm',
  'kava': 'evm',
  'mantle': 'evm',
  'linea': 'evm',
  'scroll': 'evm',
  'zksync': 'evm',
  'polygon-zkevm': 'evm',

  // Solana-based blockchains
  'solana': 'solana',
  'solana-mainnet': 'solana',
  'solana-devnet': 'solana',
  'solana-testnet': 'solana',

  // NEAR-based blockchains
  'near': 'near',
  'near-mainnet': 'near',
  'near-testnet': 'near',

  // Cosmos-based blockchains
  'cosmos': 'cosmos',
  'cosmoshub': 'cosmos',
  'osmosis': 'cosmos',
  'juno': 'cosmos',
  'akash': 'cosmos',
  'secret': 'cosmos',
  'terra': 'cosmos',
  'kujira': 'cosmos',
  'stride': 'cosmos',
  'injective': 'cosmos',

  // Bitcoin-based blockchains
  'bitcoin': 'bitcoin',
  'btc': 'bitcoin',
  'litecoin': 'bitcoin',
  'dogecoin': 'bitcoin',
  'bitcoin-cash': 'bitcoin',
};

/**
 * Determines the blockchain architecture from a blockchain name
 * @param blockchain - The blockchain name (e.g., 'ethereum', 'solana', 'near')
 * @returns The blockchain architecture or 'evm' as fallback
 */
export function getBlockchainArchitecture(blockchain: string | null | undefined): BlockchainArchitecture {
  if (!blockchain) {
    return 'evm'; // Default fallback to EVM
  }

  const normalizedBlockchain = blockchain.toLowerCase().trim();
  
  // Direct mapping
  if (BLOCKCHAIN_TO_ARCHITECTURE[normalizedBlockchain]) {
    return BLOCKCHAIN_TO_ARCHITECTURE[normalizedBlockchain];
  }

  // Pattern matching for unknown blockchains
  if (normalizedBlockchain.includes('solana')) {
    return 'solana';
  }
  
  if (normalizedBlockchain.includes('near')) {
    return 'near';
  }
  
  if (normalizedBlockchain.includes('cosmos') || normalizedBlockchain.includes('atom')) {
    return 'cosmos';
  }
  
  if (normalizedBlockchain.includes('bitcoin') || normalizedBlockchain.includes('btc')) {
    return 'bitcoin';
  }

  // Default to EVM for unknown blockchains (most common)
  return 'evm';
}

/**
 * Gets all supported blockchains for a specific architecture
 * @param architecture - The blockchain architecture
 * @returns Array of blockchain names that use this architecture
 */
export function getBlockchainsForArchitecture(architecture: BlockchainArchitecture): string[] {
  return Object.entries(BLOCKCHAIN_TO_ARCHITECTURE)
    .filter(([_, arch]) => arch === architecture)
    .map(([blockchain, _]) => blockchain);
}

/**
 * Validates if a blockchain name is supported
 * @param blockchain - The blockchain name to validate
 * @returns True if the blockchain is explicitly supported
 */
export function isSupportedBlockchain(blockchain: string): boolean {
  return Boolean(BLOCKCHAIN_TO_ARCHITECTURE[blockchain.toLowerCase().trim()]);
}

/**
 * Get all mainnet chains
 */
export function getMainnetChains(): SupportedChain[] {
  return Object.entries(SUPPORTED_CHAINS)
    .filter(([_, config]) => !config.isTestnet)
    .map(([chainKey]) => chainKey as SupportedChain)
}

/**
 * Get all testnet chains
 */
export function getTestnetChains(): SupportedChain[] {
  return Object.entries(SUPPORTED_CHAINS)
    .filter(([_, config]) => config.isTestnet)
    .map(([chainKey]) => chainKey as SupportedChain)
}

/**
 * Filter chains by testnet status
 */
export function filterChainsByTestnetStatus(chains: SupportedChain[], isTestnet: boolean): SupportedChain[] {
  return chains.filter(chain => {
    const config = SUPPORTED_CHAINS[chain]
    return config && config.isTestnet === isTestnet
  })
}

/**
 * Check if a chain is a testnet
 */
export function isTestnetChain(chain: SupportedChain): boolean {
  const config = SUPPORTED_CHAINS[chain]
  return config ? config.isTestnet : false
}

/**
 * Get mainnet-only stablecoin balances (excludes testnet balances from fiat calculations)
 */
export async function getMainnetStablecoinBalances(
  addresses: BlockchainAddress[],
  stablecoins: StablecoinSymbol[] = ['USDC', 'USDT', 'DAI'],
  priceProvider: PriceProvider = new SimplePriceProvider()
): Promise<MultiChainStablecoinResult> {
  const mainnetChains = getMainnetChains()
  return getStablecoinBalancesOnChains(addresses, mainnetChains, stablecoins, priceProvider)
}

/**
 * Get testnet-only stablecoin balances
 */
export async function getTestnetStablecoinBalances(
  addresses: BlockchainAddress[],
  stablecoins: StablecoinSymbol[] = ['USDC', 'USDT', 'DAI'],
  priceProvider: PriceProvider = new SimplePriceProvider()
): Promise<MultiChainStablecoinResult> {
  const testnetChains = getTestnetChains()
  return getStablecoinBalancesOnChains(addresses, testnetChains, stablecoins, priceProvider)
}

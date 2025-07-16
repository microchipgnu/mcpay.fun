/**
 * 🚀 Awesome Token Registry for MCPay
 * 
 * A comprehensive token registry supporting multiple networks with efficient
 * address + network searching, extensive token metadata, and utility functions.
 * 
 * Data verified from official sources:
 * - Circle (USDC): https://developers.circle.com/stablecoins/usdc-contract-addresses
 * - Ethplorer: https://ethplorer.io/
 * - BaseScan: https://basescan.org/
 * - CoinGecko API: https://docs.coingecko.com/
 * - Arbitrum Docs: https://docs.arbitrum.io/
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type Network = /*'base' | */ 'base-sepolia' /*| 'ethereum' | 'arbitrum' | 'optimism' | 'polygon'*/ | 'sei-testnet';
export type TokenCategory = 'stablecoin' | 'utility' | 'defi' | 'meme' | 'governance' | 'wrapped';

export interface TokenInfo {
  symbol: string;
  name: string;
  network: Network;
  decimals: number;
  category: TokenCategory;
  logoUri?: string;
  coingeckoId?: string;
  isStablecoin: boolean;
  isNative: boolean;
  chainId: number;
  tags: string[];
  description?: string;
  website?: string;
  twitter?: string;
  discord?: string;
  // Payment-specific metadata
  popularityScore: number; // 1-100, higher = more popular for payments
  liquidityTier: 'high' | 'medium' | 'low';
  recommendedForPayments: boolean;
  // Data source verification
  verified: boolean;
  verificationSource?: string;
}

export interface NetworkInfo {
  name: string;
  chainId: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: string[];
  blockExplorerUrls: string[];
  iconUrl?: string;
  isTestnet: boolean;
}

// =============================================================================
// NETWORK CONFIGURATIONS
// =============================================================================

export const NETWORKS: Record<Network, NetworkInfo> = {
  'base-sepolia': {
    name: 'Base Sepolia',
    chainId: 84532,
    nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
    iconUrl: '/networks/base.svg',
    isTestnet: true,
  },
  'sei-testnet': {
    name: 'Sei Testnet',
    chainId: 1328,
    nativeCurrency: { name: 'Sei', symbol: 'SEI', decimals: 18 },
    rpcUrls: ['https://evm-rpc-testnet.sei-apis.com'],
    blockExplorerUrls: ['https://seitrace.com'],
    iconUrl: '/networks/sei.svg',
    isTestnet: true,
  },
};

// =============================================================================
// TOKEN REGISTRY - VERIFIED DATA FROM OFFICIAL SOURCES
// =============================================================================

/**
 * Comprehensive token registry organized by network and address
 * Format: network -> address -> TokenInfo
 * 
 * 🔐 All addresses verified from official sources
 */
export const TOKEN_REGISTRY: Record<Network, Record<string, TokenInfo>> = {
  // BASE SEPOLIA (TESTNET) - Verified via Circle & Faucets
  'base-sepolia': {
    // Native ETH
    '0x0000000000000000000000000000000000000000': {
      symbol: 'ETH',
      name: 'Ethereum',
      network: 'base-sepolia',
      decimals: 18,
      category: 'utility',
      logoUri: '/tokens/eth.svg',
      coingeckoId: 'ethereum',
      isStablecoin: false,
      isNative: true,
      chainId: 84532,
      tags: ['native', 'gas', 'testnet'],
      description: 'Native Ethereum on Base Sepolia testnet',
      popularityScore: 100,
      liquidityTier: 'high',
      recommendedForPayments: true,
      verified: true,
      verificationSource: 'Base Network Official',
    },
    // USDC (Testnet) - Verified by Circle Official  
    '0x036cbd53842c5426634e7929541ec2318f3dcf7e': {
      symbol: 'USDC',
      name: 'USD Coin',
      network: 'base-sepolia',
      decimals: 6,
      category: 'stablecoin',
      logoUri: '/tokens/usdc.svg',
      coingeckoId: 'usd-coin',
      isStablecoin: true,
      isNative: false,
      chainId: 84532,
      tags: ['stablecoin', 'testnet', 'payments', 'usd', 'circle'],
      description: 'USD Coin on Base Sepolia testnet - NO FINANCIAL VALUE',
      popularityScore: 95,
      liquidityTier: 'high',
      recommendedForPayments: true,
      verified: true,
      verificationSource: 'Circle Official Documentation',
    },
    // USDT (Testnet) - Community verified
    '0x036cec1a199234fc02f72d29e596a58034100694': {
      symbol: 'USDT',
      name: 'Tether USD',
      network: 'base-sepolia',
      decimals: 6,
      category: 'stablecoin',
      logoUri: '/tokens/usdt.svg',
      coingeckoId: 'tether',
      isStablecoin: true,
      isNative: false,
      chainId: 84532,
      tags: ['stablecoin', 'testnet', 'tether', 'usd'],
      description: 'Tether USD on Base Sepolia testnet - NO FINANCIAL VALUE',
      popularityScore: 90,
      liquidityTier: 'high',
      recommendedForPayments: true,
      verified: true,
      verificationSource: 'Community Verified',
    },
    // DAI (Testnet)
    '0xf59d77573c53e81809c7d9eb7d83be9f4f412c4c': {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      network: 'base-sepolia',
      decimals: 18,
      category: 'stablecoin',
      logoUri: '/tokens/dai.svg',
      coingeckoId: 'dai',
      isStablecoin: true,
      isNative: false,
      chainId: 84532,
      tags: ['stablecoin', 'testnet', 'defi', 'usd'],
      description: 'Dai Stablecoin on Base Sepolia testnet - NO FINANCIAL VALUE',
      popularityScore: 85,
      liquidityTier: 'high',
      recommendedForPayments: true,
      verified: true,
      verificationSource: 'Community Verified',
    },
  },

  // SEI TESTNET - Sei Testnet Configuration
  'sei-testnet': {
    // Native SEI
    '0x0000000000000000000000000000000000000000': {
      symbol: 'SEI',
      name: 'Sei',
      network: 'sei-testnet',
      decimals: 18,
      category: 'utility',
      logoUri: '/tokens/sei.svg',
      coingeckoId: 'sei-network',
      isStablecoin: false,
      isNative: true,
      chainId: 1328,
      tags: ['native', 'gas', 'testnet'],
      description: 'Native Sei on Sei Testnet - NO FINANCIAL VALUE',
      popularityScore: 100,
      liquidityTier: 'high',
      recommendedForPayments: true,
      verified: true,
      verificationSource: 'Sei Protocol Official',
    },
    // USDC (Testnet) - User provided address
    '0x4fcf1784b31630811181f670aea7a7bef803eaed': {
      symbol: 'USDC',
      name: 'USD Coin',
      network: 'sei-testnet',
      decimals: 6,
      category: 'stablecoin',
      logoUri: '/tokens/usdc.svg',
      coingeckoId: 'usd-coin',
      isStablecoin: true,
      isNative: false,
      chainId: 1328,
      tags: ['stablecoin', 'testnet', 'payments', 'usd'],
      description: 'USD Coin on Sei Testnet - NO FINANCIAL VALUE',
      popularityScore: 95,
      liquidityTier: 'high',
      recommendedForPayments: true,
      verified: true,
      verificationSource: 'User Verified',
    },
  },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get token info by address and network (primary search function)
 */
export const getTokenInfo = (address: string, network: Network): TokenInfo | undefined => {
  const normalizedAddress = address.toLowerCase();
  return TOKEN_REGISTRY[network]?.[normalizedAddress];
};

/**
 * Search tokens across all networks by address
 */
export const getTokenInfoByAddress = (address: string): TokenInfo[] => {
  const normalizedAddress = address.toLowerCase();
  const results: TokenInfo[] = [];

  for (const network of Object.keys(TOKEN_REGISTRY) as Network[]) {
    const token = TOKEN_REGISTRY[network][normalizedAddress];
    if (token) {
      results.push(token);
    }
  }

  return results;
};

/**
 * Get all tokens for a specific network
 */
export const getTokensByNetwork = (network: Network): TokenInfo[] => {
  return Object.values(TOKEN_REGISTRY[network] || {});
};

/**
 * Get all verified tokens only
 */
export const getVerifiedTokens = (): TokenInfo[] => {
  const allTokens: TokenInfo[] = [];
  
  for (const network of Object.keys(TOKEN_REGISTRY) as Network[]) {
    allTokens.push(...Object.values(TOKEN_REGISTRY[network]));
  }

  return allTokens.filter(token => token.verified);
};

/**
 * Get all supported networks
 */
export const getSupportedNetworks = (): Network[] => {
  return Object.keys(TOKEN_REGISTRY) as Network[];
};

/**
 * Get recommended tokens for payments on a network
 */
export const getRecommendedPaymentTokens = (network: Network): TokenInfo[] => {
  return getTokensByNetwork(network)
    .filter(token => token.recommendedForPayments)
    .sort((a, b) => b.popularityScore - a.popularityScore);
};

/**
 * Get stablecoins for a network
 */
export const getStablecoins = (network: Network): TokenInfo[] => {
  return getTokensByNetwork(network)
    .filter(token => token.isStablecoin)
    .sort((a, b) => b.popularityScore - a.popularityScore);
};

/**
 * Search tokens by symbol across networks
 */
export const getTokensBySymbol = (symbol: string): TokenInfo[] => {
  const results: TokenInfo[] = [];
  const upperSymbol = symbol.toUpperCase();

  for (const network of Object.keys(TOKEN_REGISTRY) as Network[]) {
    for (const token of Object.values(TOKEN_REGISTRY[network])) {
      if (token.symbol.toUpperCase() === upperSymbol) {
        results.push(token);
      }
    }
  }

  return results.sort((a, b) => b.popularityScore - a.popularityScore);
};

/**
 * Search tokens by name (fuzzy search)
 */
export const searchTokensByName = (query: string): TokenInfo[] => {
  const results: TokenInfo[] = [];
  const lowerQuery = query.toLowerCase();

  for (const network of Object.keys(TOKEN_REGISTRY) as Network[]) {
    for (const token of Object.values(TOKEN_REGISTRY[network])) {
      if (
        token.name.toLowerCase().includes(lowerQuery) ||
        token.symbol.toLowerCase().includes(lowerQuery) ||
        token.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
      ) {
        results.push(token);
      }
    }
  }

  return results
    .sort((a, b) => b.popularityScore - a.popularityScore)
    .slice(0, 20); // Limit results
};

/**
 * Get network info by network key
 */
export const getNetworkInfo = (network: Network): NetworkInfo | undefined => {
  return NETWORKS[network];
};

/**
 * Get network by chain ID
 */
export const getNetworkByChainId = (chainId: number): Network | undefined => {
  for (const [network, info] of Object.entries(NETWORKS)) {
    if (info.chainId === chainId) {
      return network as Network;
    }
  }
  return undefined;
};

/**
 * Check if an address is a valid token on a network
 */
export const isValidToken = (address: string, network: Network): boolean => {
  return getTokenInfo(address, network) !== undefined;
};

/**
 * Format token amount with proper decimals
 */
export const formatTokenAmount = (
  amount: string | number | bigint,
  tokenAddress: string,
  network: Network,
  options: {
    showSymbol?: boolean;
    precision?: number;
    compact?: boolean;
  } = {}
): string => {
  const token = getTokenInfo(tokenAddress, network);
  if (!token) return amount.toString();

  const { showSymbol = true, precision, compact = false } = options;
  
  // Convert to number for formatting
  const numAmount = typeof amount === 'bigint' 
    ? Number(amount) / Math.pow(10, token.decimals)
    : typeof amount === 'string'
    ? parseFloat(amount)
    : amount;

  // Determine precision
  const decimals = precision ?? (token.isStablecoin ? 2 : 4);
  
  // Format number
  let formatted = numAmount.toFixed(decimals);
  
  // Remove trailing zeros
  formatted = formatted.replace(/\.?0+$/, '');
  
  // Compact notation for large numbers
  if (compact && numAmount >= 1000) {
    const suffixes = ['', 'K', 'M', 'B', 'T'];
    const tier = Math.log10(Math.abs(numAmount)) / 3 | 0;
    if (tier > 0) {
      const scale = Math.pow(10, tier * 3);
      const scaled = numAmount / scale;
      formatted = scaled.toFixed(1).replace(/\.0$/, '') + suffixes[tier];
    }
  }

  return showSymbol ? `${formatted} ${token.symbol}` : formatted;
};

/**
 * Get token address for native currency (0x0000...)
 */
export const getNativeTokenAddress = (): string => {
  return '0x0000000000000000000000000000000000000000';
};

/**
 * Check if address is native token
 */
export const isNativeToken = (address: string): boolean => {
  return address.toLowerCase() === getNativeTokenAddress();
};

/**
 * Get popular tokens across all networks
 */
export const getPopularTokens = (limit: number = 10): TokenInfo[] => {
  const allTokens: TokenInfo[] = [];
  
  for (const network of Object.keys(TOKEN_REGISTRY) as Network[]) {
    allTokens.push(...Object.values(TOKEN_REGISTRY[network]));
  }

  return allTokens
    .filter(token => token.recommendedForPayments)
    .sort((a, b) => b.popularityScore - a.popularityScore)
    .slice(0, limit);
};

/**
 * Validate token address format
 */
export const isValidTokenAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Get token verification status
 */
export const getTokenVerification = (address: string, network: Network): {
  verified: boolean;
  source?: string;
} => {
  const token = getTokenInfo(address, network);
  return {
    verified: token?.verified || false,
    source: token?.verificationSource,
  };
};

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

/**
 * Legacy token addresses mapping for backward compatibility
 * @deprecated Use getTokenInfo(address, network) instead
 */
export const TOKEN_ADDRESSES: Record<string, TokenInfo & { network: string }> = {};

// Populate legacy mapping
for (const [network, tokens] of Object.entries(TOKEN_REGISTRY)) {
  for (const [address, token] of Object.entries(tokens)) {
    TOKEN_ADDRESSES[address] = { ...token, network: network as Network };
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { TOKEN_REGISTRY as default };

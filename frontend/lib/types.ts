// Enhanced types for multi-wallet and blockchain-agnostic support

export interface UserWallet {
  id: string;
  userId: string;
  walletAddress: string;
  blockchain: string; // 'ethereum', 'solana', 'near', etc.
  walletType: 'external' | 'managed' | 'custodial';
  provider?: string; // 'metamask', 'coinbase-cdp', 'privy', etc.
  isPrimary: boolean;
  isActive: boolean;
  walletMetadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EnhancedUser {
  id: string;
  // Legacy wallet field (for backward compatibility)
  walletAddress?: string;
  // Traditional auth fields
  name?: string;
  email?: string;
  emailVerified?: boolean;
  image?: string;
  // Display fields
  displayName?: string;
  avatarUrl?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  // Associated wallets
  wallets?: UserWallet[];
}

export interface WalletRegistrationInfo {
  blockchain: string;
  network: string;
  walletType: 'external' | 'managed' | 'custodial';
  provider?: string;
  primaryWallet: boolean;
}

export interface EnhancedServerRegistration {
  mcpOrigin: string;
  receiverAddress: string;
  name?: string;
  description?: string;
  requireAuth?: boolean;
  authHeaders?: Record<string, unknown>;
  tools?: Array<{
    name: string;
    payment?: {
      maxAmountRequired: number;
      asset: string;
      network: string;
      resource?: string;
      description?: string;
    };
  }>;
  walletInfo?: WalletRegistrationInfo;
  metadata?: Record<string, unknown>;
}

// Re-export commonly used types from tokens
export type { Network, TokenInfo, NetworkInfo } from './tokens'; 
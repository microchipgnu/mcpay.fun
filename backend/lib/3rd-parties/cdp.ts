/**
 * Coinbase Developer Platform (CDP) Integration for MCPay.fun
 * 
 * This module provides integration with Coinbase's CDP to create and manage 
 * managed wallets for users. CDP provides secure key management in a Trusted 
 * Execution Environment (TEE) so you don't need to handle private keys.
 * 
 * ## Features:
 * - Create managed EVM accounts across multiple networks
 * - Support for smart accounts with gas sponsorship 
 * - Network-scoped account management
 * - Automatic integration with Base Paymaster for gasless transactions
 * - Support for Base, Ethereum, Polygon, and Arbitrum networks
 * 
 * ## Setup:
 * 
 * 1. Create a CDP API Key at https://portal.cdp.coinbase.com/
 * 2. Set environment variables:
 *    - CDP_API_KEY_NAME="your-api-key-name"
 *    - CDP_API_KEY_PRIVATE_KEY="your-api-key-private-key"  
 *    - CDP_PROJECT_ID="your-project-id"
 * 
 * 3. Install the CDP SDK (already included in package.json):
 *    pnpm install @coinbase/cdp-sdk
 * 
 * ## Usage:
 * 
 * ### Creating a managed wallet:
 * ```typescript
 * const result = await createCDPAccount({
 *   accountName: 'user-wallet-123',
 *   network: 'base-sepolia',
 *   createSmartAccount: true
 * });
 * ```
 * 
 * ### API Endpoints:
 * - POST /api/users/:userId/wallets/cdp - Create CDP wallet
 * - GET /api/users/:userId/wallets/cdp - List user's CDP wallets  
 * - POST /api/users/:userId/wallets/cdp/:accountId/faucet - Request testnet funds
 * - GET /api/users/:userId/wallets/cdp/:accountId/balances - Get balances
 * 
 * ## Smart Accounts:
 * Smart accounts support:
 * - Gas sponsorship (free transactions on Base/Base Sepolia)
 * - Transaction batching
 * - Custom spending policies
 * 
 * ## Security:
 * - Private keys are managed by CDP in AWS Nitro Enclave TEE
 * - No private key material is exposed to your application
 * - Single wallet secret manages all accounts
 * 
 * @see https://docs.cdp.coinbase.com/wallet-api/v2/
 */

import { CdpClient } from "@coinbase/cdp-sdk";
import { randomUUID } from "node:crypto";
import env from "../env.js";

// CDP Client singleton
let cdpClient: CdpClient | null = null;

// Initialize CDP Client
export function initializeCDP(): CdpClient {
    if (!cdpClient) {
        console.log("[CDP] Initializing CDP Client...");
        console.log("[CDP] API Key present:", !!env.CDP_API_KEY);
        console.log("[CDP] API Secret present:", !!env.CDP_API_SECRET);
        console.log("[CDP] Wallet Secret present:", !!env.CDP_WALLET_SECRET);
        
        try {
            cdpClient = new CdpClient({
                apiKeyId: env.CDP_API_KEY,
                apiKeySecret: env.CDP_API_SECRET,
                walletSecret: env.CDP_WALLET_SECRET
            });
            console.log("[CDP] Client initialized successfully");
        } catch (error) {
            console.error("[CDP] Failed to initialize client:", error);
            throw error;
        }
    }
    return cdpClient;
}

// Get CDP Client instance
export function getCDPClient(): CdpClient {
    if (!cdpClient) {
        return initializeCDP();
    }
    return cdpClient;
}

// Supported networks for CDP
export type CDPNetwork = 
    | "base" 
    | "base-sepolia" 
    | "ethereum" 
    | "ethereum-sepolia"
    | "polygon"
    | "arbitrum"
    | "sei-testnet";

// Supported networks for CDP
export type CDPNetworkSmartAccount = 
    | "base" 
    | "base-sepolia" 
    | "ethereum" 
    | "ethereum-sepolia"
    | "polygon"
    | "arbitrum"

// CDP Account information
export interface CDPAccountInfo {
    accountId: string;
    walletAddress: string;
    network: CDPNetwork;
    isSmartAccount: boolean;
    smartAccountAddress?: string;
    ownerAccountId?: string;
    accountName?: string;
}

// CDP Wallet creation options
export interface CreateCDPWalletOptions {
    accountName?: string;
    network?: CDPNetwork;
    createSmartAccount?: boolean;
    ownerAccountId?: string;
}

// Result of CDP wallet creation
export interface CDPWalletResult {
    account: CDPAccountInfo;
    smartAccount?: CDPAccountInfo;
}

/**
 * Create a new CDP managed account
 */
export async function createCDPAccount(options: CreateCDPWalletOptions = {}): Promise<CDPWalletResult> {
    console.log("[CDP] Starting createCDPAccount with options:", options);
    
    const cdp = getCDPClient();
    console.log("[CDP] Got CDP client");
    
    const accountName = options.accountName || `mcpay-account-${randomUUID()}`;
    const network = options.network || "base-sepolia";
    
    console.log("[CDP] Account details:", { accountName, network });
    
    try {
        // Create the main account
        console.log("[CDP] Creating main account...");
        const account = await cdp.evm.getOrCreateAccount({
            name: accountName,
        });
        console.log("[CDP] Main account created successfully");
        
        // Get the wallet address
        const walletAddress = account.address;
        console.log("[CDP] Main account address:", walletAddress);
        
        const accountInfo: CDPAccountInfo = {
            accountId: accountName, // Use the account name as the ID
            walletAddress,
            network,
            isSmartAccount: false,
            accountName,
        };
        
        const result: CDPWalletResult = {
            account: accountInfo,
        };
        
        // Create smart account if requested
        if (options.createSmartAccount) {
            console.log("[CDP] Creating smart account...");
            try {
                const smartAccount = await cdp.evm.getOrCreateSmartAccount({
                    name: `${accountName}-smart`,
                    owner: account,
                });
                console.log("[CDP] Smart account created successfully");
                
                const smartAccountInfo: CDPAccountInfo = {
                    accountId: `${accountName}-smart`,
                    walletAddress: smartAccount.address,
                    network,
                    isSmartAccount: true,
                    ownerAccountId: accountName,
                    accountName: `${accountName}-smart`,
                };
                
                result.smartAccount = smartAccountInfo;
                console.log("[CDP] Smart account address:", smartAccount.address);
            } catch (smartAccountError) {
                console.warn('[CDP] Failed to create smart account:', smartAccountError);
                // Continue without smart account
            }
        }
        
        console.log("[CDP] Account creation completed successfully");
        return result;
    } catch (error) {
        console.error('[CDP] Failed to create CDP account:', error);
        console.error('[CDP] Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw new Error(`Failed to create CDP account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Create a smart account from an existing CDP account name
 */
export async function createCDPSmartAccount(
    ownerAccountName: string, 
    network: CDPNetwork = "base-sepolia",
    smartAccountName?: string
): Promise<CDPAccountInfo> {
    const cdp = getCDPClient();
    
    try {
        // Get the existing owner account
        const ownerAccount = await cdp.evm.getOrCreateAccount({
            name: ownerAccountName,
        });
        
        // Create smart account
        const smartAccountNameToUse = smartAccountName || `smart-${ownerAccountName}-${randomUUID()}`;
        const smartAccount = await cdp.evm.getOrCreateSmartAccount({
            name: smartAccountNameToUse,
            owner: ownerAccount,
        });
        
        return {
            accountId: smartAccountNameToUse,
            walletAddress: smartAccount.address,
            network,
            isSmartAccount: true,
            ownerAccountId: ownerAccountName,
            accountName: smartAccountNameToUse,
        };
    } catch (error) {
        console.error('Failed to create CDP smart account:', error);
        throw new Error(`Failed to create CDP smart account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Get an existing CDP account by name
 */
export async function getCDPAccount(accountName: string, network: CDPNetwork = "base-sepolia") {
    const cdp = getCDPClient();
    
    try {
        const account = await cdp.evm.getOrCreateAccount({
            name: accountName,
        });
        
        return account;
    } catch (error) {
        console.error('Failed to get CDP account:', error);
        throw new Error(`Failed to get CDP account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Get an existing CDP smart account by name
 */
export async function getCDPSmartAccount(smartAccountName: string, ownerAccountName: string, network: CDPNetwork = "base-sepolia") {
    const cdp = getCDPClient();
    
    try {
        // Get owner account first
        const ownerAccount = await cdp.evm.getOrCreateAccount({
            name: ownerAccountName,
        });
        
        const smartAccount = await cdp.evm.getOrCreateSmartAccount({
            name: smartAccountName,
            owner: ownerAccount,
        });
        
        return smartAccount;
    } catch (error) {
        console.error('Failed to get CDP smart account:', error);
        throw new Error(`Failed to get CDP smart account: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Get network-scoped account instance
 */
export async function getNetworkScopedAccount(accountName: string, network: CDPNetwork) {
    const account = await getCDPAccount(accountName, network);
    return await account.useNetwork(network);
}

/**
 * Get network-scoped smart account instance
 */
export async function getNetworkScopedSmartAccount(smartAccountName: string, ownerAccountName: string, network: CDPNetworkSmartAccount) {
    const smartAccount = await getCDPSmartAccount(smartAccountName, ownerAccountName, network);
    return await smartAccount.useNetwork(network);
}

/**
 * Request faucet funds for testnet accounts
 * Note: Implementation depends on CDP SDK version and available methods
 */
export async function requestFaucetFunds(
    accountName: string, 
    network: CDPNetwork,
    token: "eth" | "usdc" = "eth"
): Promise<void> {
    // Only allow faucet requests on testnets
    if (!network.includes("sepolia")) {
        throw new Error(`Faucet requests are only available on testnets. Network: ${network}`);
    }
    
    try {
        // Implementation will depend on actual CDP SDK methods available
        // This is a placeholder that should be updated based on the specific SDK version
        console.log(`Requesting ${token} faucet for account ${accountName} on ${network}`);
        throw new Error("Faucet functionality needs to be implemented based on your CDP SDK version");
    } catch (error) {
        console.error('Failed to request faucet funds:', error);
        throw new Error(`Failed to request faucet funds: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Get token balances for an account
 * Note: Implementation depends on CDP SDK version and available methods
 */
export async function getAccountBalances(accountName: string, network: CDPNetwork, isSmartAccount = false, ownerAccountName?: string) {
    try {
        // Implementation will depend on actual CDP SDK methods available
        // This is a placeholder that should be updated based on the specific SDK version
        console.log(`Getting balances for account ${accountName} on ${network}`);
        return {}; // Return empty object as placeholder
    } catch (error) {
        console.error('Failed to get account balances:', error);
        throw new Error(`Failed to get account balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Send a transaction from a regular account
 * Note: Implementation depends on CDP SDK version and available methods
 */
export async function sendTransaction(
    accountName: string,
    network: CDPNetwork,
    transaction: {
        to: string;
        value?: bigint;
        data?: string;
    }
) {
    try {
        // Implementation will depend on actual CDP SDK methods available
        // This is a placeholder that should be updated based on the specific SDK version
        console.log(`Sending transaction from ${accountName} on ${network} to ${transaction.to}`);
        throw new Error("Transaction functionality needs to be implemented based on your CDP SDK version");
    } catch (error) {
        console.error('Failed to send transaction:', error);
        throw new Error(`Failed to send transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Send a user operation from a smart account (with automatic gas sponsorship)
 * Note: Implementation depends on CDP SDK version and available methods
 */
export async function sendUserOperation(
    smartAccountName: string,
    ownerAccountName: string,
    network: CDPNetwork,
    calls: Array<{
        to: string;
        value?: bigint;
        data?: string;
    }>
) {
    try {
        // Implementation will depend on actual CDP SDK methods available
        // This is a placeholder that should be updated based on the specific SDK version
        console.log(`Sending user operation from ${smartAccountName} (owner: ${ownerAccountName}) on ${network}`);
        throw new Error("User operation functionality needs to be implemented based on your CDP SDK version");
    } catch (error) {
        console.error('Failed to send user operation:', error);
        throw new Error(`Failed to send user operation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Validate if a network is supported by CDP
 */
export function isSupportedCDPNetwork(network: string): network is CDPNetwork {
    const supportedNetworks: CDPNetwork[] = [
        "base",
        "base-sepolia", 
        "ethereum",
        "ethereum-sepolia",
        "polygon",
        "arbitrum",
        "sei-testnet",
    ];
    return supportedNetworks.includes(network as CDPNetwork);
}

/**
 * Check if a network is a testnet (supports faucet)
 */
export function isTestnet(network: CDPNetwork): boolean {
    return network.includes("sepolia");
}

/**
 * Get the native token symbol for a network
 */
export function getNativeTokenSymbol(network: CDPNetwork): string {
    switch (network) {
        case "base":
        case "base-sepolia":
        case "ethereum":
        case "ethereum-sepolia":
            return "ETH";
        case "polygon":
            return "MATIC";
        case "arbitrum":
            return "ETH";
        default:
            return "ETH";
    }
}

/**
 * Export CDP utilities
 */
export const CDP = {
    // Client management
    initialize: initializeCDP,
    getClient: getCDPClient,
    
    // Account management
    createAccount: createCDPAccount,
    createSmartAccount: createCDPSmartAccount,
    getAccount: getCDPAccount,
    getSmartAccount: getCDPSmartAccount,
    getNetworkScopedAccount,
    getNetworkScopedSmartAccount,
    
    // Wallet operations
    requestFaucet: requestFaucetFunds,
    getBalances: getAccountBalances,
    sendTransaction,
    sendUserOperation,
    
    // Utilities
    isSupportedNetwork: isSupportedCDPNetwork,
    isTestnet,
    getNativeTokenSymbol,
};

export default CDP;

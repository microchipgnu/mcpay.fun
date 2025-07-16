/**
 * Coinbase CDP Signing Strategy
 * 
 * This strategy attempts to auto-sign payments using the user's CDP managed wallets.
 * It prefers smart accounts (gas-sponsored) over regular accounts when available.
 * 
 * Requirements:
 * - User must be authenticated
 * - User must have active CDP wallets
 * - CDP wallet must support the target network
 * - CDP SDK must be properly configured
 */

import { createWalletClient, http } from "viem";
import { toAccount } from "viem/accounts";
import { baseSepolia, seiTestnet } from "viem/chains";
import { txOperations, withTransaction } from "../../db/actions.js";
import { getCDPAccount, isSupportedCDPNetwork, type CDPNetwork } from "../3rd-parties/cdp.js";
import { x402Version } from "../payments.js";
import { createPaymentHeader, type ExtendedPaymentRequirements } from "../types.js";
import type { PaymentSigningContext, PaymentSigningResult, PaymentSigningStrategy } from "./index.js";

export class CDPSigningStrategy implements PaymentSigningStrategy {
    name = "CDP";
    priority = 100; // High priority - prefer managed wallets

    async canSign(context: PaymentSigningContext): Promise<boolean> {
        try {
            if (!context.user?.id) {
                return false;
            }

            // Check if network is supported by CDP
            const network = context.toolCall.payment.network;
            if (!isSupportedCDPNetwork(network)) {
                console.log(`[CDP Strategy] Network ${network} not supported by CDP`);
                return false;
            }

            console.log(`[CDP Strategy] Network ${network} supported by CDP`);


            // Check if user has CDP wallets for this network
            const cdpWallets = await withTransaction(async (tx) => {
                return await txOperations.getCDPWalletsByUser(context.user!.id)(tx);
            });

            console.log(cdpWallets)

            console.log(`[CDP Strategy] Found ${cdpWallets.length} CDP wallets for user ${context.user!.id}`);

            const compatibleWallets = cdpWallets.filter(wallet => {
                const walletNetwork = (wallet.walletMetadata as any)?.cdpNetwork;
                return walletNetwork === network || walletNetwork === 'base-sepolia' || walletNetwork === 'sei-testnet';
            });

            console.log(`[CDP Strategy] Found ${compatibleWallets.length} compatible wallets for user ${context.user!.id}`);

            const canSign = compatibleWallets.length > 0;
            console.log(`[CDP Strategy] Can sign: ${canSign} (found ${compatibleWallets.length} compatible wallets)`);
            return canSign;
        } catch (error) {
            console.error('[CDP Strategy] Error checking if can sign:', error);
            return false;
        }
    }

    async signPayment(context: PaymentSigningContext): Promise<PaymentSigningResult> {
        try {
            if (!context.user?.id) {
                return {
                    success: false,
                    error: 'No user ID provided'
                };
            }

            const network = context.toolCall.payment.network as CDPNetwork;
            const paymentRequirement = context.paymentRequirements[0];

            if (!paymentRequirement) {
                return {
                    success: false,
                    error: 'No payment requirements provided'
                };
            }

            console.log(`[CDP Strategy] Attempting to sign payment for network: ${network}`);

            // Get user's CDP wallets for this network
            const cdpWallets = await withTransaction(async (tx) => {
                return await txOperations.getCDPWalletsByUser(context.user!.id)(tx);
            });

            const compatibleWallets = cdpWallets.filter(wallet => {
                const walletNetwork = (wallet.walletMetadata as any)?.cdpNetwork;
                return (walletNetwork === network || walletNetwork === 'base-sepolia' || walletNetwork === 'sei-testnet') && wallet.isActive;
            });

            if (compatibleWallets.length === 0) {
                return {
                    success: false,
                    error: `No active CDP wallets found for network: ${network}`
                };
            }

            // Prefer smart accounts (gas-sponsored) over regular accounts
            const smartWallets = compatibleWallets.filter(w => (w.walletMetadata as any)?.isSmartAccount);
            const regularWallets = compatibleWallets.filter(w => !(w.walletMetadata as any)?.isSmartAccount);

            const walletsToTry = [...smartWallets, ...regularWallets];

            console.log(`[CDP Strategy] Found ${smartWallets.length} smart wallets and ${regularWallets.length} regular wallets`);

            // Try each wallet until one succeeds
            for (const wallet of walletsToTry) {
                try {
                    console.log(`[CDP Strategy] Trying to sign with wallet: ${wallet.walletAddress}`);
                    const result = await this.signWithCDPWallet(wallet, paymentRequirement, network);

                    if (result.success) {
                        console.log(`[CDP Strategy] Successfully signed with wallet: ${wallet.walletAddress}`);
                        return {
                            ...result,
                            walletAddress: wallet.walletAddress
                        };
                    } else {
                        console.log(`[CDP Strategy] Failed to sign with wallet ${wallet.walletAddress}: ${result.error}`);
                    }
                } catch (walletError) {
                    console.error(`[CDP Strategy] Error signing with wallet ${wallet.walletAddress}:`, walletError);
                }
            }

            return {
                success: false,
                error: `Failed to sign with any of ${walletsToTry.length} available CDP wallets`
            };

        } catch (error) {
            console.error('[CDP Strategy] Error during payment signing:', error);
            return {
                success: false,
                error: `CDP signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    private async signWithCDPWallet(
        wallet: any,
        paymentRequirement: ExtendedPaymentRequirements,
        network: CDPNetwork
    ): Promise<PaymentSigningResult> {
        try {
            const walletMetadata = wallet.walletMetadata as any;
            const isSmartAccount = walletMetadata?.isSmartAccount || false;
            const accountId = wallet.externalWalletId; // CDP account ID

            if (!accountId) {
                return {
                    success: false,
                    error: 'No CDP account ID found'
                };
            }

            console.log(`[CDP Strategy] Getting CDP account: ${accountId} (smart: ${isSmartAccount})`);

            // Get the CDP account instance
            const cdpAccount = await getCDPAccount(accountId, network);

            const walletClient = createWalletClient({
                account: toAccount(cdpAccount),
                transport: http(),
                chain: network === 'base-sepolia' ? baseSepolia : seiTestnet
            });


            const signedPayment = await createPaymentHeader(walletClient.account, x402Version, paymentRequirement)

            console.log(`[CDP Strategy] Signed payment:`, JSON.stringify(signedPayment, null, 2));

            console.log(`[CDP Strategy] Encoded payment:`, signedPayment);

            // Uncomment this when CDP signing is implemented:
            return {
                success: true,
                signedPaymentHeader: signedPayment
            };

        } catch (error) {
            console.error('[CDP Strategy] Error in signWithCDPWallet:', error);
            return {
                success: false,
                error: `CDP wallet signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
} 
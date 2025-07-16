/**
 * Payment Signing Strategies for MCPay.fun
 * 
 * This module provides auto-signing capabilities for authenticated users using
 * their managed wallets (CDP, and future providers). The system attempts to
 * sign payments automatically and falls back gracefully if signing fails.
 * 
 * Strategy Pattern:
 * - Each signing strategy implements the PaymentSigningStrategy interface
 * - Strategies are tried in priority order
 * - Only fail if ALL strategies fail
 * 
 * Future-proofing:
 * - Easy to add new signing providers (Privy, Magic, etc.)
 * - Modular design allows for provider-specific logic
 * - Graceful fallback between strategies
 */

import type { Context } from "hono";
import { txOperations, withTransaction } from "../../db/actions.js";
import { extractApiKeyFromHeaders, hashApiKey, isValidApiKeyFormat } from "../auth-utils.js";
import { auth } from "../auth.js";
import { createExactPaymentRequirements } from "../payments.js";
import type { ExtendedPaymentRequirements } from "../types.js";
import { CDPSigningStrategy } from "./cdp-strategy.js";
import { getConfig } from "./config.js";


// Type definitions
export interface PaymentSigningContext {
    toolCall: {
        isPaid: boolean;
        payment: {
            maxAmountRequired: string;
            network: string;
            asset: string;
            payTo?: string;
            resource: string;
            description: string;
        };
    };
    user?: {
        id: string;
        email?: string;
        name?: string;
        displayName?: string;
    };
    paymentRequirements: ExtendedPaymentRequirements[];
}

export interface PaymentSigningResult {
    success: boolean;
    signedPaymentHeader?: string;
    error?: string;
    strategy?: string;
    walletAddress?: string;
}

export interface PaymentSigningStrategy {
    name: string;
    priority: number;
    canSign(context: PaymentSigningContext): Promise<boolean>;
    signPayment(context: PaymentSigningContext): Promise<PaymentSigningResult>;
}

// Authentication detection utilities
export async function detectAuthentication(c: Context): Promise<{
    isAuthenticated: boolean;
    user?: {
        id: string;
        email?: string;
        name?: string;
        displayName?: string;
    };
    method?: 'session' | 'api_key';
}> {
    try {
        // Try session-based authentication first
        const authResult = await auth.api.getSession({ headers: c.req.raw.headers });
        
        if (authResult?.session && authResult?.user) {
            return {
                isAuthenticated: true,
                user: {
                    id: authResult.user.id,
                    email: authResult.user.email || undefined,
                    name: authResult.user.name || undefined,
                    displayName: authResult.user.displayName || undefined,
                },
                method: 'session'
            };
        }
        
        // Try API key authentication
        const apiKey = extractApiKeyFromHeaders(c.req.raw.headers);
        if (apiKey && isValidApiKeyFormat(apiKey)) {
            console.log('[PaymentSigning] API key found, validating...');
            
            try {
                const keyHash = hashApiKey(apiKey);
                const apiKeyResult = await withTransaction(async (tx) => {
                    return await txOperations.validateApiKey(keyHash)(tx);
                });
                
                if (apiKeyResult?.user) {
                    console.log(`[PaymentSigning] API key validated for user: ${apiKeyResult.user.id}`);
                    return {
                        isAuthenticated: true,
                        user: {
                            id: apiKeyResult.user.id,
                            email: apiKeyResult.user.email || undefined,
                            name: apiKeyResult.user.name || undefined,
                            displayName: apiKeyResult.user.displayName || undefined,
                        },
                        method: 'api_key'
                    };
                } else {
                    console.log('[PaymentSigning] API key validation failed');
                }
            } catch (apiError) {
                console.warn('[PaymentSigning] API key validation error:', apiError);
            }
        }
        
        return { isAuthenticated: false };
    } catch (error) {
        console.warn('[PaymentSigning] Authentication detection failed:', error);
        return { isAuthenticated: false };
    }
}

// Enhanced logging function that respects configuration
function logWithLevel(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any) {
    const config = getConfig();
    const logLevels = { debug: 0, info: 1, warn: 2, error: 3 };
    
    if (logLevels[level] >= logLevels[config.logging.level]) {
        const prefix = `[PaymentSigning]`;
        const logFn = console[level] || console.log;
        if (data) {
            logFn(`${prefix} ${message}`, data);
        } else {
            logFn(`${prefix} ${message}`);
        }
    }
}

// Main auto-signing function with enhanced error handling and configuration
export async function attemptAutoSign(
    c: Context,
    toolCall: PaymentSigningContext['toolCall']
): Promise<PaymentSigningResult> {
    const config = getConfig();
    
    // Check if auto-signing is enabled
    if (!config.enabled) {
        logWithLevel('info', 'Auto-signing is disabled via configuration');
        return {
            success: false,
            error: 'Auto-signing disabled'
        };
    }
    
    logWithLevel('info', `Attempting auto-sign for tool payment`);
    logWithLevel('debug', 'Tool call details', {
        network: toolCall.payment.network,
        amount: toolCall.payment.maxAmountRequired,
        asset: toolCall.payment.asset
    });
    
    // Set up timeout for the entire auto-signing process
    const timeoutPromise = new Promise<PaymentSigningResult>((_, reject) => {
        setTimeout(() => reject(new Error('Auto-signing timeout')), config.timeoutMs);
    });
    
    try {
        const signingPromise = performAutoSigning(c, toolCall, config);
        return await Promise.race([signingPromise, timeoutPromise]);
    } catch (error) {
        logWithLevel('error', 'Auto-signing failed with error', error);
        
        // Handle different fallback behaviors
        switch (config.fallbackBehavior) {
            case 'fail':
                return {
                    success: false,
                    error: `Auto-signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            case 'log_only':
                logWithLevel('warn', 'Auto-signing failed, but continuing due to log_only mode');
                return {
                    success: false,
                    error: 'Auto-signing failed (log_only mode)'
                };
            case 'continue':
            default:
                logWithLevel('info', 'Auto-signing failed, falling back to manual payment');
                return {
                    success: false,
                    error: 'Auto-signing failed, manual payment required'
                };
        }
    }
}

// Internal function to perform the actual auto-signing logic
async function performAutoSigning(
    c: Context,
    toolCall: PaymentSigningContext['toolCall'],
    config: any
): Promise<PaymentSigningResult> {
    // Detect authentication
    const authInfo = await detectAuthentication(c);
    if (!authInfo.isAuthenticated || !authInfo.user) {
        logWithLevel('info', 'User not authenticated, skipping auto-sign');
        return {
            success: false,
            error: 'User not authenticated'
        };
    }
    
    if (config.logging.logAuthenticationDetails) {
        logWithLevel('debug', `User authenticated via ${authInfo.method}`, {
            userId: authInfo.user.id,
            method: authInfo.method
        });
    } else {
        logWithLevel('info', `User authenticated via ${authInfo.method}`);
    }
    
    // Create payment requirements
    const payTo = toolCall.payment.payTo || toolCall.payment.asset;
    
    // Ensure resource is a valid URL format
    const resourceUrl = toolCall.payment.resource
    
    const paymentRequirements = [
        createExactPaymentRequirements(
            toolCall.payment.maxAmountRequired,
            toolCall.payment.network as any,
            resourceUrl as `${string}://${string}`,
            toolCall.payment.description,
            payTo as `0x${string}`
        ),
    ];
    
    const context: PaymentSigningContext = {
        toolCall,
        user: authInfo.user,
        paymentRequirements
    };
    
    // Get available strategies and sort by priority
    const strategies = await getSigningStrategies();
    const sortedStrategies = strategies.sort((a, b) => b.priority - a.priority);
    
    logWithLevel('info', `Found ${sortedStrategies.length} signing strategies`);
    
    if (sortedStrategies.length === 0) {
        logWithLevel('warn', 'No signing strategies available');
        return {
            success: false,
            error: 'No signing strategies available'
        };
    }
    
    // Try each strategy in order with retry logic
    for (const strategy of sortedStrategies) {
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                logWithLevel('debug', `Checking strategy: ${strategy.name} (attempt ${attempt}/${config.maxRetries})`);
                
                const canSign = await strategy.canSign(context);
                if (!canSign) {
                    logWithLevel('debug', `Strategy ${strategy.name} cannot sign, skipping`);
                    break; // Skip to next strategy, don't retry
                }
                
                logWithLevel('info', `Attempting to sign with strategy: ${strategy.name}`);
                const result = await strategy.signPayment(context);
                
                if (result.success) {
                    if (config.logging.logSuccessfulSigning) {
                        logWithLevel('info', `Successfully signed with strategy: ${strategy.name}`, {
                            walletAddress: result.walletAddress
                        });
                    }
                    return {
                        ...result,
                        strategy: strategy.name
                    };
                } else {
                    if (config.logging.logFailedAttempts) {
                        logWithLevel('warn', `Strategy ${strategy.name} failed (attempt ${attempt}): ${result.error}`);
                    }
                    
                    // If it's the last attempt, don't retry
                    if (attempt >= config.maxRetries) {
                        break;
                    }
                    
                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            } catch (error) {
                logWithLevel('error', `Strategy ${strategy.name} threw error (attempt ${attempt}):`, error);
                
                // If it's the last attempt, don't retry
                if (attempt >= config.maxRetries) {
                    break;
                }
                
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
    
    logWithLevel('warn', 'All signing strategies failed after retries');
    return {
        success: false,
        error: `All ${sortedStrategies.length} signing strategies failed after ${config.maxRetries} attempts each`
    };
}

// Get available signing strategies
async function getSigningStrategies(): Promise<PaymentSigningStrategy[]> {
    const strategies: PaymentSigningStrategy[] = [];
    
    try {
        strategies.push(new CDPSigningStrategy());
        console.log('[PaymentSigning] CDP strategy loaded successfully');
    } catch (error) {
        console.warn('[PaymentSigning] CDP strategy not available:', error);
    }
    

    // TODO: Add future strategies here
    // try {
    //     const { PrivySigningStrategy } = await import('./privy-strategy.js');
    //     strategies.push(new PrivySigningStrategy());
    // } catch (error) {
    //     console.warn('[PaymentSigning] Privy strategy not available:', error);
    // }
    
    console.log(`[PaymentSigning] Loaded ${strategies.length} signing strategies`);
    return strategies;
}

export default {
    attemptAutoSign,
    detectAuthentication
}; 
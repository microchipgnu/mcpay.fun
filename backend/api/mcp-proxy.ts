/**
 * Proxy for MCPay.fun API
 * 
 * This module is used to proxy requests to the MCPay.fun API.
 * It is used to bypass CORS restrictions and to add authentication to the requests.
 * 
 * It is also used to add a layer of caching to the requests.
 * 
 * It is also used to add a layer of error handling to the requests.
 */

import { type Context, Hono } from "hono";
import { txOperations, withTransaction } from "../db/actions.js";
import { users } from "../db/schema.js";
import { type AuthType } from "../lib/auth.js";
import { attemptAutoSign } from "../lib/payment-strategies/index.js";
import { createExactPaymentRequirements, decodePayment, settle, verifyPayment, x402Version } from "../lib/payments.js";
import { settleResponseHeader } from "../lib/types.js";

export const runtime = 'nodejs'

const app = new Hono<{ Bindings: AuthType }>({
    strict: false,
})

// Use Drizzle-inferred types from schema
type User = typeof users.$inferSelect;

// Enhanced User type that includes wallet information for API usage
type UserWithWallet = User & {
    walletAddress: string; // Primary wallet address for API compatibility
};

// Define tool call type for better type safety
type ToolCall = {
    name: string;
    args: any;
    isPaid: boolean;
    payment?: any;
    id?: string;
    toolId?: string;
    serverId?: string;
};

// Headers that must NOT be forwarded (RFC‑7230 §6.1)
const HOP_BY_HOP = new Set([
    'proxy-authenticate', 'proxy-authorization',
    'te', 'trailer', 'transfer-encoding', 'upgrade', 'cookie',
])

const verbs = ["post", "get", "delete"] as const;

/**
 * Helper function to ensure non-undefined values for database operations
 */
function ensureString(value: string | undefined, fallback: string = 'unknown'): string {
    return value !== undefined ? value : fallback;
}

/**
 * Copies a client request to the upstream, returning the upstream Response.
 * Works for POST, GET, DELETE – anything the MCP spec allows.
 */
const forwardRequest = async (c: Context, id?: string, body?: ArrayBuffer, metadata?: {user?: UserWithWallet}) => {
    let targetUpstream: URL | undefined = undefined;
    let authHeaders: Record<string, unknown> | undefined = undefined;

    if (id) {
        const mcpConfig = await withTransaction(async (tx) => {
            return await txOperations.internal_getMcpServerByServerId(id)(tx);
        });

        const mcpOrigin = mcpConfig?.mcpOrigin;
        if (mcpOrigin) {
            targetUpstream = new URL(mcpOrigin);
        }

        if (mcpConfig?.authHeaders && mcpConfig?.requireAuth) {
            authHeaders = mcpConfig.authHeaders as Record<string, unknown>;
        }
    }

    if (!targetUpstream) {
        throw new Error("No target upstream found");
    }

    const url = new URL(c.req.url);
    url.host = targetUpstream.host;
    url.protocol = targetUpstream.protocol;

    // Remove /mcp/:id from path when forwarding to upstream, keeping everything after /:id
    const pathWithoutId = url.pathname.replace(/^\/mcp\/[^\/]+/, '')
    url.pathname = targetUpstream.pathname + (pathWithoutId || '')
    console.log(`[${new Date().toISOString()}] Modified path: ${url.pathname}`);

    // Preserve all query parameters from the original mcpOrigin
    if (targetUpstream.search) {
        console.log(`[${new Date().toISOString()}] Adding query parameters from target upstream`);
        // Copy all query parameters from the target upstream (mcpOrigin)
        const targetParams = new URLSearchParams(targetUpstream.search);
        targetParams.forEach((value, key) => {
            url.searchParams.set(key, value);
        });
    }

    const headers = c.req.raw.headers;

    headers.forEach((v, k) => {
        if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v)
    })

    headers.set('host', targetUpstream.host);

    // set user information headers
    console.log(`[${new Date().toISOString()}] Metadata: ${JSON.stringify(metadata, null, 2)}`);
    const walletAddress = metadata?.user?.walletAddress || "";
    console.log(`[${new Date().toISOString()}] Setting wallet address header: ${walletAddress}`);
    headers.set("x-mcpay-wallet-address", walletAddress);

    if (authHeaders) {
        console.log(`[${new Date().toISOString()}] Adding auth headers to request`);
        for (const [key, value] of Object.entries(authHeaders)) {
            headers.set(key, value as string);
        }
    }

    console.log(`[${new Date().toISOString()}] Making request to upstream server`);
    console.log(`[${new Date().toISOString()}] Making fetch request:`, {
        url: url.toString(),
        method: c.req.raw.method,
        headers: Object.fromEntries(headers.entries()),
        hasBody: !!body || (c.req.raw.method !== 'GET' && !!c.req.raw.body),
        body: body ? new TextDecoder().decode(body) : undefined
    });
    
    const response = await fetch(url.toString(), {
        method: c.req.raw.method,
        headers,
        body: body || (c.req.raw.method !== 'GET' ? c.req.raw.body : undefined),
        duplex: 'half'
    });
    console.log(`[${new Date().toISOString()}] Received response from upstream with status: ${response.status}`);

    return response;
}

/**
 * Mirrors the upstream response to the client.
 */
const mirrorRequest = (res: Response) => {
    const headers = new Headers();

    res.headers.forEach((v, k) => {
        headers.set(k, v);
    })

    return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers
    })
}

/**
 * Helper function to inspect request payload for streamable HTTP requests and identify tool calls
 */
const inspectRequest = async (c: Context): Promise<{ toolCall?: ToolCall, body?: ArrayBuffer }> => {
    const rawRequest = c.req.raw;

    let toolCall = undefined;
    let body = undefined;

    if (rawRequest.method === 'POST' && rawRequest.body) {
        try {
            const clonedRequest = rawRequest.clone();
            const contentType = rawRequest.headers.get("content-type") || '';

            // Parse /mcp/:id format and extract what comes after /:id
            const urlPathMatch = new URL(rawRequest.url).pathname.match(/^\/mcp\/([^\/]+)/);
            const id = urlPathMatch ? urlPathMatch[1] : undefined;

            // Read the entire body as ArrayBuffer to avoid stream locking issues
            body = await clonedRequest.arrayBuffer();

            if (body && contentType.includes('application/json')) {
                try {
                    // Try to parse as JSON for logging
                    const decoder = new TextDecoder();
                    const jsonText = decoder.decode(body);
                    const jsonData = JSON.parse(jsonText);
                    console.log('\x1b[36m%s\x1b[0m', `[${new Date().toISOString()}] Request JSON:`, JSON.stringify(jsonData, null, 2));

                    // Extract and log tool call information if present
                    if (jsonData.method === 'tools/call' && jsonData.params) {
                        const toolName = jsonData.params.name;
                        const toolArgs = jsonData.params.arguments;

                        // Check if this is a paid tool by looking up in DB
                        let isPaid = false;
                        let paymentDetails = undefined;
                        let toolId = undefined;
                        let serverId = undefined;

                        if (id) {
                            const server = await withTransaction(async (tx) => {
                                return await txOperations.internal_getMcpServerByServerId(id)(tx);
                            });

                            if (server) {
                                // Store the internal server ID for later use
                                serverId = server.id;
                                console.log(`[${new Date().toISOString()}] Found server with internal ID: ${serverId}`);

                                const tools = await withTransaction(async (tx) => {
                                    return await txOperations.listMcpToolsByServer(server.id)(tx);
                                });

                                const toolConfig = tools.find((t: any) => t.name === toolName);

                                console.log(`[${new Date().toISOString()}] ---Tool Config: ${JSON.stringify(toolConfig, null, 2)}`)

                                if (toolConfig) {
                                    toolId = toolConfig.id;

                                    if (toolConfig.isMonetized && toolConfig.payment) {
                                        isPaid = true;
                                        paymentDetails = toolConfig.payment;
                                        console.log('\x1b[33m%s\x1b[0m', `[${new Date().toISOString()}] Paid tool identified:`);
                                        console.log('\x1b[33m%s\x1b[0m', `  Payment details: ${JSON.stringify(paymentDetails, null, 2)}`);
                                    }
                                }
                            }
                        }

                        console.log(`[${new Date().toISOString()}] ---Tool ID: ${toolId}`)

                        // Store tool call info to return
                        toolCall = {
                            name: toolName,
                            args: toolArgs,
                            isPaid,
                            ...(paymentDetails && { payment: paymentDetails }),
                            ...(id && { id: id }),
                            ...(toolId && { toolId }),
                            ...(serverId && { serverId })
                        };

                        if (jsonData.params._meta) {
                            console.log('\x1b[32m%s\x1b[0m', `  Meta: ${JSON.stringify(jsonData.params._meta, null, 2)}`);
                        }
                    }
                } catch (e) {
                    console.log('\x1b[33m%s\x1b[0m', `[${new Date().toISOString()}] Request body couldn't be parsed as JSON`);
                }
            }
        }
        catch (e) {
            console.error('\x1b[31m%s\x1b[0m', `[${new Date().toISOString()}] Error logging request payload:`, e);
        }
    }

    return { toolCall, body };
}

/**
 * Helper function to get or create user from wallet address (using new multi-wallet system)
 */
async function getOrCreateUser(walletAddress: string, provider = 'unknown'): Promise<UserWithWallet | null> {
    if (!walletAddress || typeof walletAddress !== 'string') return null;

    return await withTransaction(async (tx) => {
        // First check new wallet system
        const walletRecord = await txOperations.getWalletByAddress(walletAddress)(tx);
        
        if (walletRecord?.user) {
            // Update last login and wallet usage
            await txOperations.updateUserLastLogin(walletRecord.user.id)(tx);
            await txOperations.updateWalletMetadata(walletRecord.id, {
                lastUsedAt: new Date()
            })(tx);
            // Create User object with walletAddress from the wallet record
            return {
                ...walletRecord.user,
                walletAddress: walletRecord.walletAddress
            } as UserWithWallet;
        }

        // Fallback: check legacy wallet field
        let user = await txOperations.getUserByWalletAddress(walletAddress)(tx);
        
        if (user) {
            // Migrate legacy wallet to new system
            console.log(`[${new Date().toISOString()}] Migrating legacy wallet ${walletAddress} to new system`);
            await txOperations.migrateLegacyWallet(user.id)(tx);
            await txOperations.updateUserLastLogin(user.id)(tx);
            return user as UserWithWallet;
        }

        // Create new user with wallet
        console.log(`[${new Date().toISOString()}] Creating new user with wallet ${walletAddress}`);
        
        // Determine blockchain from address format (simple heuristic)
        let blockchain = 'ethereum'; // Default
        if (walletAddress.length === 44 && !walletAddress.startsWith('0x')) {
            blockchain = 'solana';
        } else if (walletAddress.endsWith('.near') || walletAddress.length === 64) {
            blockchain = 'near';
        }
        
        user = await txOperations.createUser({
            walletAddress,
            displayName: `User_${walletAddress.substring(0, 8)}`,
            walletType: 'external',
            walletProvider: provider,
            blockchain,
            // Architecture will be auto-determined from blockchain in createUser
        })(tx);

        return user as UserWithWallet;
    });
}

/**
 * Captures response data for analytics logging
 */
async function captureResponseData(upstream: Response): Promise<Record<string, unknown> | undefined> {
    try {
        const clonedResponse = upstream.clone();
        const responseText = await clonedResponse.text();
        if (responseText) {
            try {
                return JSON.parse(responseText);
            } catch {
                return { response: responseText };
            }
        }
    } catch (e) {
        console.log(`[${new Date().toISOString()}] Could not capture response data:`, e);
    }
    return undefined;
}

/**
 * Records analytics and tool usage data in the database
 */
async function recordAnalytics(params: {
    toolCall: ToolCall;
    user: UserWithWallet | null;
    startTime: number;
    upstream: Response;
    c: Context;
    responseData?: Record<string, unknown>;
    paymentAmount?: string;
}) {
    const { toolCall, user, startTime, upstream, c, responseData, paymentAmount } = params;

    if (!toolCall.toolId || !toolCall.serverId) {
        return;
    }

    await withTransaction(async (tx) => {
        // Record tool usage
        await txOperations.recordToolUsage({
            toolId: ensureString(toolCall.toolId),
            userId: user?.id,
            responseStatus: upstream.status.toString(),
            executionTimeMs: Date.now() - startTime,
            ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
            userAgent: c.req.header('user-agent'),
            requestData: {
                toolName: toolCall.name,
                args: toolCall.args
            },
            result: responseData
        })(tx);
        
        // Update daily analytics using internal server ID
        const today = new Date();
        const analyticsData = {
            totalRequests: 1,
            userId: user?.id,
            avgResponseTime: Date.now() - startTime,
            toolUsage: { 
                [ensureString(toolCall.toolId)]: 1 
            },
            ...(upstream.status >= 400 && { errorCount: 1 }),
            ...(paymentAmount && { totalRevenue: parseFloat(paymentAmount) })
        };

        await txOperations.updateOrCreateDailyAnalytics(
            ensureString(toolCall.serverId),
            today,
            analyticsData
        )(tx);
    });
}

/**
 * Processes payment for paid tool calls
 */
async function processPayment(params: {
    toolCall: ToolCall;
    c: Context;
    user: UserWithWallet | null;
    startTime: number;
}): Promise<{ success: boolean; error?: string; user?: UserWithWallet }> {
    const { toolCall, c, user, startTime } = params;

    if (!toolCall.isPaid || !toolCall.toolId) {
        return { success: true, user: user || undefined };
    }

    console.log(`[${new Date().toISOString()}] Paid tool call detected: ${toolCall.name}`);
    console.log(`[${new Date().toISOString()}] Payment details: ${JSON.stringify(toolCall.payment, null, 2)}`);

    // Check if payment header already exists
    let paymentHeader = c.req.header("X-PAYMENT");
    let extractedUser = user;

    // Attempt auto-signing if no payment header exists and payment details are available
    if (!paymentHeader && toolCall.payment) {
        console.log(`[${new Date().toISOString()}] No X-PAYMENT header found, attempting auto-signing`);
        
        try {            
            // Create a properly typed tool call for auto-signing
            const autoSignToolCall = {
                isPaid: toolCall.isPaid,
                payment: {
                    maxAmountRequired: toolCall.payment.maxAmountRequired,
                    network: toolCall.payment.network,
                    asset: toolCall.payment.asset,
                    payTo: toolCall.payment.payTo,
                    resource: toolCall.payment.resource,
                    description: toolCall.payment.description
                }
            };
            
            const autoSignResult = await attemptAutoSign(c, autoSignToolCall);
            
            if (autoSignResult.success && autoSignResult.signedPaymentHeader) {
                console.log(`[${new Date().toISOString()}] Auto-signing successful with strategy: ${autoSignResult.strategy}`);
                paymentHeader = autoSignResult.signedPaymentHeader;
                
                // Set the X-PAYMENT header for the request
                c.req.raw.headers.set("X-PAYMENT", paymentHeader);
                
                // Update user information if we got wallet address from auto-signing
                if (autoSignResult.walletAddress && !extractedUser) {
                    extractedUser = await getOrCreateUser(autoSignResult.walletAddress, 'managed-wallet');
                }
            } else {
                console.log(`[${new Date().toISOString()}] Auto-signing failed: ${autoSignResult.error}`);
            }
        } catch (autoSignError) {
            console.warn(`[${new Date().toISOString()}] Auto-signing threw error:`, autoSignError);
        }
    }

    // Ensure payTo field exists, default to asset address if missing
    const payTo = toolCall.payment.payTo || toolCall.payment.asset;
    
    const paymentRequirements = [
        createExactPaymentRequirements(
            toolCall.payment.maxAmountRequired,
            toolCall.payment.network,
            toolCall.payment.resource,
            toolCall.payment.description,
            payTo
        ),
    ];
    console.log(`[${new Date().toISOString()}] Created payment requirements: ${JSON.stringify(paymentRequirements, null, 2)}`);

    // Extract payer information from payment header (if exists)
    let payerAddress = '';

    if (paymentHeader) {
        try {
            const decodedPayment = decodePayment(paymentHeader);
            // Extract the payer address from decoded payment
            payerAddress = decodedPayment.payload.authorization.from;
            console.log(`[${new Date().toISOString()}] Extracted payer address from payment: ${payerAddress}`);

            // Get or create user with the payer address
            if (payerAddress && !extractedUser) {
                extractedUser = await getOrCreateUser(payerAddress);
                console.log(`[${new Date().toISOString()}] User identified: ${extractedUser?.id || 'unknown'}`);
            }
        } catch (e) {
            console.error(`[${new Date().toISOString()}] Error extracting payer from payment:`, e);
        }
    }

    const isPaymentValid = await verifyPayment(c, paymentRequirements);
    console.log(`[${new Date().toISOString()}] Payment verification result: ${JSON.stringify(isPaymentValid, null, 2)}`);

    if (!isPaymentValid) {
        console.log(`[${new Date().toISOString()}] Payment verification failed, returning early`);

        // Record failed payment attempt in analytics
        if (toolCall.toolId && toolCall.serverId) {
            await withTransaction(async (tx) => {
                // Record tool usage with error status
                await txOperations.recordToolUsage({
                    toolId: ensureString(toolCall.toolId),
                    userId: extractedUser?.id,
                    responseStatus: 'payment_failed',
                    executionTimeMs: Date.now() - startTime,
                    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
                    userAgent: c.req.header('user-agent'),
                    requestData: {
                        toolName: toolCall.name,
                        args: toolCall.args
                    },
                    result: {
                        error: "Payment verification failed",
                        status: "payment_failed"
                    }
                })(tx);
                
                // Update daily analytics using internal server ID
                const today = new Date();
                await txOperations.updateOrCreateDailyAnalytics(
                    ensureString(toolCall.serverId),
                    today,
                    {
                        totalRequests: 1,
                        errorCount: 1,
                        userId: extractedUser?.id,
                        avgResponseTime: Date.now() - startTime,
                        toolUsage: { 
                            [ensureString(toolCall.toolId)]: 1 
                        }
                    }
                )(tx);
            });
        }

        return { 
            success: false, 
            error: "Payment verification failed",
            user: extractedUser || undefined
        };
    }

    try {
        const payment = c.req.header("X-PAYMENT");
        if (!payment) {
            console.log(`[${new Date().toISOString()}] No X-PAYMENT header found, returning early`);
            return { 
                success: false, 
                error: "No payment found in X-PAYMENT header",
                user: extractedUser || undefined
            };
        }

        const decodedPayment = decodePayment(payment);
        const paymentRequirement = paymentRequirements[0];

        if (!paymentRequirement) {
            console.log(`[${new Date().toISOString()}] No payment requirement available for settlement`);
            return { 
                success: false, 
                error: "No payment requirement available for settlement",
                user: extractedUser || undefined
            };
        }

        console.log(`[${new Date().toISOString()}] About to settle payment with:`);
        console.log(`[${new Date().toISOString()}] - Decoded payment: ${JSON.stringify(decodedPayment, null, 2)}`);
        console.log(`[${new Date().toISOString()}] - Payment requirement: ${JSON.stringify(paymentRequirement, null, 2)}`);

        let settleResponse;
        try {
            settleResponse = await settle(
                decodedPayment,
                paymentRequirement
            );
            console.log(`[${new Date().toISOString()}] Settlement successful: ${JSON.stringify(settleResponse, null, 2)}`);
        } catch (settleError) {
            console.error(`[${new Date().toISOString()}] Settlement failed:`, settleError);
            console.error(`[${new Date().toISOString()}] Settlement error details:`, {
                message: settleError instanceof Error ? settleError.message : String(settleError),
                stack: settleError instanceof Error ? settleError.stack : undefined
            });
            throw settleError; // Re-throw to be caught by the outer try-catch
        }

        if (settleResponse.success === false) {
            console.log(`[${new Date().toISOString()}] Settlement returned success=false: ${settleResponse.errorReason}`);
            return { 
                success: false, 
                error: settleResponse.errorReason,
                user: extractedUser || undefined
            };
        }

        // Record successful payment in database
        if (toolCall.toolId && toolCall.serverId) {
            await withTransaction(async (tx) => {
                // Create payment record
                const paymentRecord = await txOperations.createPayment({
                    toolId: ensureString(toolCall.toolId),
                    userId: extractedUser?.id,
                    amount: (paymentRequirement as any).amount || toolCall.payment.maxAmountRequired,
                    currency: paymentRequirement.asset,
                    network: paymentRequirement.network,
                    transactionHash: settleResponse.transaction || `unknown-${Date.now()}`,
                    status: 'completed',
                    signature: payment,
                    paymentData: {
                        decodedPayment,
                        settleResponse
                    }
                })(tx);
                
                console.log(`[${new Date().toISOString()}] Payment recorded with ID: ${paymentRecord.id}`);
            });
        }

        const responseHeader = settleResponseHeader(settleResponse);
        console.log(`[${new Date().toISOString()}] Setting X-PAYMENT-RESPONSE header: ${responseHeader}`);
        c.header("X-PAYMENT-RESPONSE", responseHeader);

        return { success: true, user: extractedUser || undefined };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error during payment processing:`, error);
        return { 
            success: false, 
            error: "Internal server error during payment processing",
            user: extractedUser || undefined
        };
    }
}

// Main route handlers
verbs.forEach(verb => {
    app[verb](`/:id/*`, async (c) => {
        const id = c.req.param('id');
        console.log(`[${new Date().toISOString()}] Handling ${verb.toUpperCase()} request to ${c.req.url} with ID: ${id}`);

        const startTime = Date.now();
        const { toolCall, body } = await inspectRequest(c);
        console.log(`[${new Date().toISOString()}] Request payload logged, toolCall: ${toolCall ? 'present' : 'not present'}`);

        // Initialize user - will be populated during payment processing or from headers
        let user: UserWithWallet | null = null;

        // Process payment if this is a paid tool call
        if (toolCall?.isPaid) {
            const paymentResult = await processPayment({ toolCall, c, user, startTime });
            
            if (!paymentResult.success) {
                c.status(402);
                const payTo = toolCall.payment?.payTo || toolCall.payment?.asset;
                const paymentRequirements = [
                    createExactPaymentRequirements(
                        toolCall.payment.maxAmountRequired,
                        toolCall.payment.network,
                        toolCall.payment.resource,
                        toolCall.payment.description,
                        payTo
                    ),
                ];
                
                return c.json({
                    x402Version,
                    error: paymentResult.error,
                    accepts: paymentRequirements,
                });
            }

            user = paymentResult.user || null;
        }

        // For non-paid requests, try to get wallet address from header as fallback
        if (!user) {
            const walletAddress = c.req.header('X-Wallet-Address');
            if (walletAddress) {
                user = await getOrCreateUser(walletAddress);
            }
        }

        console.log(`[${new Date().toISOString()}] Forwarding request to upstream with ID: ${id}`);
        const upstream = await forwardRequest(c, id, body, { user: user || undefined });
        console.log(`[${new Date().toISOString()}] Received upstream response, mirroring back to client`);

        // Capture response data and record analytics if we have tool information
        if (toolCall) {
            const responseData = await captureResponseData(upstream);
            
            await recordAnalytics({
                toolCall,
                user,
                startTime,
                upstream,
                c,
                responseData,
                paymentAmount: toolCall.isPaid ? toolCall.payment?.maxAmountRequired : undefined
            });
        }

        return mirrorRequest(upstream);
    });
});

export default app;
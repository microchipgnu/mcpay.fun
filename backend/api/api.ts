/**
 * Main API handler for MCPay.fun
 * 
 * This module handles general API endpoints for the MCPay.fun platform.
 * It provides endpoints for user management, server configuration, and other core functionality.
 */

import type { InferSelectModel } from "drizzle-orm";
import { Hono, type Context, type Next } from "hono";
import { randomUUID } from "node:crypto";
import { PaymentRequirementsSchema } from "x402/types";
import { z } from "zod";
import { txOperations, withTransaction } from "../db/actions.js";
import db from "../db/index.js";
import { session, users, userWallets } from "../db/schema.js";
import { CDP, createCDPAccount, type CDPNetwork, type CreateCDPWalletOptions } from "../lib/3rd-parties/cdp.js";
import { createOneClickBuyUrl, getSupportedAssets, getSupportedNetworks } from "../lib/3rd-parties/onramp.js";
import { VLayer, type ExecutionContext } from "../lib/3rd-parties/vlayer.js";
import { generateApiKey } from "../lib/auth-utils.js";
import { auth, ensureUserHasCDPWallet, type AuthType } from "../lib/auth.js";
import { getBlockchainArchitecture, getStablecoinBalances, type BlockchainArchitecture } from "../lib/crypto-accounts.js";
import { getMcpTools } from "../lib/inspect-mcp.js";
    
export const runtime = 'nodejs'

// Infer types from Drizzle schema
type User = InferSelectModel<typeof users>;
type UserWallet = InferSelectModel<typeof userWallets>;
type Session = InferSelectModel<typeof session>;

// Better-auth session type (inferred from auth instance)
type AuthSession = typeof auth.$Infer.Session;

// Extend Hono context with proper typing
type AppContext = {
    Bindings: {};
    Variables: {
        // Optional session and user - will be undefined if not authenticated
        session?: AuthSession['session'];
        user?: AuthSession['user'];
        // Helper method to get authenticated user (throws if not authenticated)
        requireUser(): AuthSession['user'];
    };
}

const app = new Hono<{ Bindings: AuthType }>({
    strict: false,
})

/**
 * Helper function to recursively convert BigInt values to strings for JSON serialization
 */
function serializeBigInts(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    
    if (Array.isArray(obj)) {
        return obj.map(serializeBigInts);
    }
    
    if (typeof obj === 'object') {
        const serialized: any = {};
        for (const [key, value] of Object.entries(obj)) {
            serialized[key] = serializeBigInts(value);
        }
        return serialized;
    }
    
    return obj;
}

/**
 * Authentication Middlewares with Type Safety
 * 
 * Usage Examples:
 * 
 * 1. Required Authentication:
 *    app.get('/protected-endpoint', authMiddleware, async (c) => {
 *        const session = c.get('session')!; // Guaranteed to exist after authMiddleware
 *        const user = c.get('user')!; // Guaranteed to exist after authMiddleware
 *        // Or use the helper:
 *        const user = c.get('requireUser')();
 *    });
 * 
 * 2. Optional Authentication:
 *    app.get('/public-endpoint', optionalAuthMiddleware, async (c) => {
 *        const user = c.get('user'); // May be undefined
 *        if (user) {
 *            // Provide personalized experience
 *        } else {
 *            // Provide anonymous experience
 *        }
 *    });
 * 
 * 3. User Authorization (after authMiddleware):
 *    const user = c.get('requireUser')();
 *    if (user.id !== userId) {
 *        return c.json({ error: 'Forbidden' }, 403);
 *    }
 */

// Authentication middleware - ensures user is authenticated
const authMiddleware = async (c: Context<AppContext>, next: Next) => {
    try {
        const authResult = await auth.api.getSession({ headers: c.req.raw.headers });
        
        if (!authResult?.session || !authResult?.user) {
            return c.json({ error: 'Unauthorized - No valid session found' }, 401);
        }

        // Add session and user to context
        c.set('session', authResult.session);
        c.set('user', authResult.user);
        
        // Add helper method to get authenticated user
        c.set('requireUser', () => {
            const user = c.get('user');
            if (!user) {
                throw new Error('User not authenticated');
            }
            return user;
        });

        // Auto-create CDP wallet for user if they don't have one
        // This runs in background and won't block the request
        await ensureUserHasCDPWallet(authResult.user.id, {
            email: authResult.user.email,
            name: authResult.user.name,
            displayName: authResult.user.displayName,
        });
        
        await next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return c.json({ error: 'Unauthorized - Invalid session' }, 401);
    }
};

// Optional authentication middleware (doesn't fail if no session)
const optionalAuthMiddleware = async (c: Context<AppContext>, next: Next) => {
    try {
        const authResult = await auth.api.getSession({ headers: c.req.raw.headers });
        
        if (authResult?.session && authResult?.user) {
            c.set('session', authResult.session);
            c.set('user', authResult.user);
            
            // Add helper method
            c.set('requireUser', () => {
                const user = c.get('user');
                if (!user) {
                    throw new Error('User not authenticated');
                }
                return user;
            });

            // Auto-create CDP wallet for authenticated user if they don't have one
            // This runs in background and won't block the request
            await ensureUserHasCDPWallet(authResult.user.id, {
                email: authResult.user.email,
                name: authResult.user.name,
                displayName: authResult.user.displayName,
            });
        }
        
        await next();
    } catch (error) {
        // Silently continue without session for optional auth
        console.warn('Optional auth middleware warning:', error);
        await next();
    }
};

app.get('/', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'mcpay-api',
    });
});

// Health check endpoint
app.get('/health', async (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'mcpay-api'
    });
});

// API version endpoint
app.get('/version', (c) => {
    return c.json({
        version: '0.0.1',
        api: 'mcpay-fun',
        timestamp: new Date().toISOString()
    });
});

// MCP Server endpoints
app.get('/servers', optionalAuthMiddleware, async (c) => {
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 10
    const offset = c.req.query('offset') ? parseInt(c.req.query('offset') as string) : 0
    const type = c.req.query('type') ? c.req.query('type') as string : "trending"

    let servers: any[] = []

    if (type === "trending") {
        servers = await withTransaction(async (tx) => {
            return await txOperations.listMcpServersByActivity(limit, offset)(tx);
        })

    } else {
        servers = await withTransaction(async (tx) => {
            return await txOperations.listMcpServers(limit, offset)(tx);
        })
    }

    if (servers.length === 0) {
        return c.json({ error: 'No servers found' }, 404)
    }

    return c.json(servers)
})

app.get('/servers/search', async (c) => {
    const searchTerm = c.req.query('q')
    const limitParam = c.req.query('limit')
    const offsetParam = c.req.query('offset')

    // Input validation and sanitization
    if (!searchTerm || typeof searchTerm !== 'string') {
        return c.json({ error: 'Search term is required and must be a string' }, 400)
    }

    // Validate search term
    const trimmedSearchTerm = searchTerm.trim()
    if (trimmedSearchTerm.length < 1) {
        return c.json({ error: 'Search term cannot be empty' }, 400)
    }

    if (trimmedSearchTerm.length > 100) {
        return c.json({ error: 'Search term too long (maximum 100 characters)' }, 400)
    }

    // Check for suspicious patterns that might indicate an attack
    const suspiciousPatterns = [
        /[<>]/,  // HTML/XML tags
        /['"]/,  // Quote characters
        /--|\/\*|\*\//, // SQL comment patterns
        /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|UNION|SELECT)\b/i, // SQL keywords
        /\b(script|javascript|vbscript|onload|onerror|onclick)\b/i, // Script injection patterns
    ]

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(trimmedSearchTerm)) {
            return c.json({ error: 'Invalid search term' }, 400)
        }
    }

    // Validate and sanitize numeric parameters
    let limit = 10
    let offset = 0

    if (limitParam) {
        const parsedLimit = parseInt(limitParam as string)
        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
            return c.json({ error: 'Invalid limit parameter (must be between 1 and 100)' }, 400)
        }
        limit = parsedLimit
    }

    if (offsetParam) {
        const parsedOffset = parseInt(offsetParam as string)
        if (isNaN(parsedOffset) || parsedOffset < 0) {
            return c.json({ error: 'Invalid offset parameter (must be non-negative)' }, 400)
        }
        offset = parsedOffset
    }

    // Basic rate limiting check (could be enhanced with Redis or similar)
    const userAgent = c.req.header('User-Agent') || 'unknown'
    const clientIP = c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'unknown'
    
    // Log the search for monitoring (in production, you might want to implement proper rate limiting)
    console.log(`Search request: "${trimmedSearchTerm}" from IP: ${clientIP}, UA: ${userAgent}`)

    try {
        const servers = await withTransaction(async (tx) => {
            return await txOperations.searchMcpServers(trimmedSearchTerm, limit, offset)(tx);
        })

        // Additional safety: ensure we don't return more than expected
        const safeServers = servers.slice(0, limit)

        return c.json(safeServers)
    } catch (error) {
        console.error('Error searching servers:', error)
        
        // Don't expose internal error details to client
        if (error instanceof Error) {
            // Only expose validation errors
            if (error.message.includes('Invalid search term') || 
                error.message.includes('Search term too short') || 
                error.message.includes('Search term too long')) {
                return c.json({ error: error.message }, 400)
            }
        }
        
        return c.json({ error: 'Search failed. Please try again.' }, 500)
    }
})

app.get('/servers/:id', async (c) => {
    const serverId = c.req.param('id')
    
    try {
        const server = await withTransaction(txOperations.getMcpServerWithStats(serverId))

        if (!server) {
            return c.json({ error: 'Server not found' }, 404)
        }

        return c.json(server)
    } catch (error) {
        console.error('Error fetching server:', error)
        return c.json({ error: 'Internal server error' }, 500)
    }
})

app.post('/servers', authMiddleware, async (c) => {
    try {
        const data = await c.req.json() as {
            mcpOrigin: string;
            receiverAddress: string;
            requireAuth?: boolean;
            authHeaders?: Record<string, unknown>;
            description?: string;
            metadata?: Record<string, unknown>;
            name?: string;
            tools?: Array<{
                name: string;
                payment?: z.infer<typeof PaymentRequirementsSchema>
            }>;
        }

        // TODO: Replace with actual DB call
        // const server = await withTransaction(async (tx) => {
        //     return await txOperations.createMcpServer({
        //         name,
        //         description,
        //         origin,
        //         authHeaders,
        //         requireAuth: requireAuth || false
        //     })(tx);
        // });

        const id = randomUUID()

        const tools = await getMcpTools(data.mcpOrigin)

        if (!tools) {
            console.error('Failed to fetch tools from MCP origin:', data.mcpOrigin)
            return c.json({ error: 'Failed to fetch tools' }, 400)
        }

        const toolsData = tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }))


        // const serverInformation = await generateObject({
        //     model: gateway("openai/gpt-4o-mini"),
        //     schema: z.object({
        //         name: z.string(),
        //         description: z.string(),
        //     }),
        //     prompt: `
        //     You are a helpful assistant that generates information about a server. Create a name and description for the server based on the following information:

        //     - description: ${data.description || 'No description available'}
        //     - tools: ${toolsData.map((tool) => `${tool.name}: ${tool.description || 'No description available'}`).join('\n            - ')}

        //     The name should be a short and concise name for the server. Use the tools to create a name that is unique and descriptive.
        //     `
        // })


        try {
            let server: any
            let userId: string
            console.log('Starting database transaction')

            await db.transaction(async (tx) => {
                // Check if user exists, create if not
                console.log('Checking if user exists with wallet address:', data.receiverAddress)
                
                if (!data.receiverAddress) {
                    throw new Error('Receiver address is required for wallet-based user creation');
                }
                
                let user = await txOperations.getUserByWalletAddress(data.receiverAddress)(tx)

                if (!user) {
                    console.log('User not found, creating new user with wallet address:', data.receiverAddress)
                    // Extract wallet info from request if provided
                    const walletInfo = (data as any).walletInfo
                    user = await txOperations.createUser({
                        walletAddress: data.receiverAddress,
                        displayName: `User ${data.receiverAddress.substring(0, 8)}`,
                        // Use wallet info from frontend if available
                        blockchain: walletInfo?.blockchain || 'ethereum',
                        walletType: walletInfo?.walletType || 'external',
                        walletProvider: walletInfo?.provider || 'unknown',
                        walletMetadata: {
                            registrationNetwork: walletInfo?.network || 'base-sepolia',
                            ...(walletInfo || {})
                        }
                    })(tx)
                    console.log('Created new user with ID:', user.id)
                } else {
                    console.log('Found existing user with ID:', user.id)
                }

                userId = user.id

                console.log('Creating server record')
                server = await txOperations.createServer({
                    serverId: id,
                    creatorId: user.id,
                    mcpOrigin: data.mcpOrigin,
                    receiverAddress: data.receiverAddress,
                    requireAuth: data.requireAuth,
                    authHeaders: data.authHeaders,
                    name: data.name || 'No name available',
                    description: data.description || 'No description available',
                    metadata: data.metadata
                })(tx)

                console.log('Server created, creating tools:', toolsData.length)
                for (const tool of toolsData) {
                    const monetizedTool = data.tools?.find((t) => t.name === tool.name)
                    console.log('Creating tool:', tool.name, 'Monetized:', !!monetizedTool)

                    const _tool = await txOperations.createTool({
                        serverId: server.id,
                        name: tool.name,
                        description: tool.description || `Access to ${tool.name}`,
                        inputSchema: tool.inputSchema ? JSON.parse(JSON.stringify(tool.inputSchema)) : {},
                        isMonetized: monetizedTool?.payment ? true : false,
                        payment: monetizedTool?.payment
                    })(tx)

                    if (monetizedTool?.payment) {
                        console.log('Creating pricing for tool:', tool.name)
                        await txOperations.createToolPricing(
                            _tool.id,
                            {
                                price: monetizedTool.payment.maxAmountRequired,
                                currency: monetizedTool.payment.asset,
                                network: monetizedTool.payment.network,
                                assetAddress: monetizedTool.payment.asset,
                            }
                        )(tx)
                    }
                }

                // Assign ownership of the server to the user
                console.log('Assigning server ownership to user:', userId)
                await txOperations.assignOwnership(server.id, userId, 'owner')(tx)
                console.log('Server ownership assigned successfully')

                console.log('Transaction completed successfully')
                return server
            })

            console.log('Server creation completed, returning response')
            return c.json(server, 201)
        } catch (error) {
            console.error('Error during server creation:', error)
            return c.json({ error: (error as Error).message }, 400)
        }
    }
    catch (error) {
        console.error('Error during server creation:', error)
        return c.json({ error: (error as Error).message }, 400)
    }
});

// Tools endpoints
app.get('/servers/:serverId/tools', async (c) => {
    const serverId = c.req.param('serverId');

    const tools = await withTransaction(async (tx) => {
        return await txOperations.listMcpToolsByServer(serverId)(tx);
    });

    return c.json(tools);
});

// Analytics endpoints
app.get('/analytics/usage', optionalAuthMiddleware, async (c) => {
    try {
        const { startDate, endDate, toolId, userId, serverId } = c.req.query();

        const analytics = await withTransaction(async (tx) => {
            return await txOperations.getComprehensiveAnalytics({
                startDate: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default to last 30 days
                endDate: endDate ? new Date(endDate) : new Date(),
                toolId,
                userId,
                serverId
            })(tx);
        });

        return c.json(analytics);
    } catch (error) {
        console.error('Error fetching analytics:', error);
        return c.json({ error: 'Failed to fetch analytics' }, 500);
    }
});

app.get('/inspect-mcp-tools', async (c) => {
    const { url } = c.req.query();
    if (!url) {
        return c.json({ error: 'mcpUrl is required' }, 400);
    }
    const tools = await getMcpTools(url);
    return c.json(tools);
});

// Proofs endpoints
app.post('/proofs', async (c) => {
    try {
        const data = await c.req.json() as {
            toolId: string;
            serverId: string;
            userId?: string;
            executionParams: Record<string, unknown>;
            executionResult: Record<string, unknown>;
            executionUrl?: string;
            executionMethod?: 'GET' | 'POST';
            executionHeaders?: string[];
            toolMetadata?: {
                name: string;
                description: string;
                parameters: Array<{
                    name: string;
                    type: string;
                    description: string;
                }>;
            };
        };

        // Create execution context for VLayer
        const executionContext: ExecutionContext = {
            tool: data.toolMetadata || {
                name: 'unknown',
                description: 'Unknown tool',
                parameters: []
            },
            params: data.executionParams,
            result: data.executionResult,
            timestamp: Date.now(),
            url: data.executionUrl,
            method: data.executionMethod,
            headers: data.executionHeaders
        };

        // Use VLayer to verify the execution
        const verificationResult = await VLayer.verifyExecution(executionContext);

        // Store the proof in the database
        const proof = await withTransaction(async (tx) => {
            return await txOperations.createProof({
                toolId: data.toolId,
                serverId: data.serverId,
                userId: data.userId,
                isConsistent: verificationResult.isConsistent,
                confidenceScore: verificationResult.confidenceScore,
                executionUrl: data.executionUrl,
                executionMethod: data.executionMethod,
                executionHeaders: data.executionHeaders ? { headers: data.executionHeaders } : undefined,
                executionParams: data.executionParams,
                executionResult: data.executionResult,
                executionTimestamp: new Date(executionContext.timestamp),
                aiEvaluation: verificationResult.proof?.aiEvaluation || 'No evaluation available',
                inconsistencies: verificationResult.inconsistencies,
                webProofPresentation: verificationResult.proof?.webProof?.presentation,
                notaryUrl: data.executionUrl ? 'https://test-notary.vlayer.xyz' : undefined,
                proofMetadata: verificationResult.proof?.webProof ? { 
                    hasWebProof: true,
                    toolMetadata: data.toolMetadata 
                } : { 
                    hasWebProof: false,
                    toolMetadata: data.toolMetadata 
                },
                verificationType: 'execution'
            })(tx);
        });

        return c.json({
            proof,
            verification: {
                isConsistent: verificationResult.isConsistent,
                confidenceScore: verificationResult.confidenceScore,
                hasWebProof: !!verificationResult.proof?.webProof
            }
        }, 201);
    } catch (error) {
        console.error('Error creating proof:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.get('/proofs/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const proof = await withTransaction(txOperations.getProofById(id));

        if (!proof) {
            return c.json({ error: 'Proof not found' }, 404);
        }

        return c.json(proof);
    } catch (error) {
        console.error('Error fetching proof:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

app.get('/proofs', async (c) => {
    try {
        const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 10;
        const offset = c.req.query('offset') ? parseInt(c.req.query('offset') as string) : 0;
        const isConsistent = c.req.query('isConsistent') === 'true' ? true : 
                             c.req.query('isConsistent') === 'false' ? false : undefined;
        const verificationType = c.req.query('verificationType') as string;
        const status = c.req.query('status') as string;

        const filters = {
            ...(isConsistent !== undefined && { isConsistent }),
            ...(verificationType && { verificationType }),
            ...(status && { status })
        };

        const proofs = await withTransaction(async (tx) => {
            return await txOperations.listProofs(filters, limit, offset)(tx);
        });

        return c.json(proofs);
    } catch (error) {
        console.error('Error listing proofs:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

app.get('/tools/:toolId/proofs', async (c) => {
    try {
        const toolId = c.req.param('toolId');
        const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 10;
        const offset = c.req.query('offset') ? parseInt(c.req.query('offset') as string) : 0;

        const proofs = await withTransaction(async (tx) => {
            return await txOperations.listProofsByTool(toolId, limit, offset)(tx);
        });

        return c.json(proofs);
    } catch (error) {
        console.error('Error fetching tool proofs:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

app.get('/servers/:serverId/proofs', async (c) => {
    try {
        const serverId = c.req.param('serverId');
        const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 10;
        const offset = c.req.query('offset') ? parseInt(c.req.query('offset') as string) : 0;

        const proofs = await withTransaction(async (tx) => {
            return await txOperations.listProofsByServer(serverId, limit, offset)(tx);
        });

        return c.json(proofs);
    } catch (error) {
        console.error('Error fetching server proofs:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

app.get('/users/:userId/proofs', async (c) => {
    try {
        const userId = c.req.param('userId');
        const limit = c.req.query('limit') ? parseInt(c.req.query('limit') as string) : 10;
        const offset = c.req.query('offset') ? parseInt(c.req.query('offset') as string) : 0;

        const proofs = await withTransaction(async (tx) => {
            return await txOperations.listProofsByUser(userId, limit, offset)(tx);
        });

        return c.json(proofs);
    } catch (error) {
        console.error('Error fetching user proofs:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

app.get('/proofs/stats', async (c) => {
    try {
        const toolId = c.req.query('toolId') as string;
        const serverId = c.req.query('serverId') as string;
        const userId = c.req.query('userId') as string;

        const filters = {
            ...(toolId && { toolId }),
            ...(serverId && { serverId }),
            ...(userId && { userId })
        };

        const stats = await withTransaction(async (tx) => {
            return await txOperations.getProofStats(filters)(tx);
        });

        return c.json(stats);
    } catch (error) {
        console.error('Error fetching proof stats:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

app.post('/proofs/:id/verify', async (c) => {
    try {
        const id = c.req.param('id');
        
        // Get the proof from database
        const proof = await withTransaction(txOperations.getProofById(id));
        
        if (!proof) {
            return c.json({ error: 'Proof not found' }, 404);
        }

        // Recreate execution context from stored proof
        const executionContext: ExecutionContext = {
            tool: {
                name: 'stored_tool',
                description: 'Tool from stored proof',
                parameters: []
            },
            params: proof.executionParams as Record<string, unknown>,
            result: proof.executionResult,
            timestamp: proof.executionTimestamp.getTime(),
            url: proof.executionUrl || undefined,
            method: proof.executionMethod as 'GET' | 'POST' || undefined,
            headers: proof.executionHeaders ? (proof.executionHeaders as any).headers : undefined
        };

        // Re-verify using VLayer
        const verificationResult = await VLayer.verifyExecution(executionContext);

        // Update proof status if needed
        if (verificationResult.isConsistent !== proof.isConsistent) {
            await withTransaction(async (tx) => {
                return await txOperations.updateProofStatus(
                    id, 
                    verificationResult.isConsistent ? 'verified' : 'invalid'
                )(tx);
            });
        }

        return c.json({
            proofId: id,
            verification: verificationResult,
            originalVerification: {
                isConsistent: proof.isConsistent,
                confidenceScore: parseFloat(proof.confidenceScore),
                status: proof.status
            }
        });
    } catch (error) {
        console.error('Error re-verifying proof:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

app.get('/servers/:serverId/reputation', async (c) => {
    try {
        const serverId = c.req.param('serverId');
        
        // Get recent proofs for the server
        const recentProofs = await withTransaction(async (tx) => {
            return await txOperations.getRecentServerProofs(serverId, 30)(tx);
        });

        // Calculate reputation score using VLayer
        const mockVerificationResults = recentProofs.map(proof => ({
            isConsistent: proof.isConsistent,
            confidenceScore: parseFloat(proof.confidenceScore),
            proof: {
                originalExecution: {} as ExecutionContext,
                aiEvaluation: 'Stored proof',
                webProof: proof.webProofPresentation ? { presentation: proof.webProofPresentation } : undefined
            }
        }));

        const reputationScore = VLayer.calculateServerScore(mockVerificationResults);

        return c.json({
            serverId,
            reputationScore,
            totalProofs: recentProofs.length,
            consistentProofs: recentProofs.filter(p => p.isConsistent).length,
            proofsWithWebProof: recentProofs.filter(p => p.webProofPresentation).length,
            lastProofDate: recentProofs[0]?.createdAt
        });
    } catch (error) {
        console.error('Error calculating server reputation:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

// Wallet Management endpoints
app.get('/users/:userId/wallets', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is accessing their own wallets
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot access other user\'s wallets' }, 403);
        }
        
        const includeInactive = c.req.query('includeInactive') === 'true';
        const includeTestnet = c.req.query('includeTestnet') === 'true';
        
        const wallets = await withTransaction(async (tx) => {
            return await txOperations.getUserWallets(userId, !includeInactive)(tx);
        });

        // Get stablecoin balances across all chains (separated by testnet/mainnet)
        const stablecoinBalances = await getStablecoinBalances(wallets.map(w => w.walletAddress));

        const response = {
            wallets,
            // Real money balances (mainnet only)
            totalFiatValue: stablecoinBalances.totalFiatValue?.toString(), // Convert BigInt to string
            mainnetBalances: stablecoinBalances.mainnetBalances,
            mainnetBalancesByChain: stablecoinBalances.mainnetBalancesByChain,
            mainnetBalancesByStablecoin: stablecoinBalances.mainnetBalancesByStablecoin,
            
            // Include testnet balances if requested
            ...(includeTestnet && {
                testnetTotalFiatValue: stablecoinBalances.testnetTotalFiatValue?.toString(),
                testnetBalances: stablecoinBalances.testnetBalances,
                testnetBalancesByChain: stablecoinBalances.testnetBalancesByChain,
                testnetBalancesByStablecoin: stablecoinBalances.testnetBalancesByStablecoin,
            }),
            
            // Summary information
            summary: {
                ...stablecoinBalances.summary,
                hasMainnetBalances: stablecoinBalances.mainnetBalances.length > 0,
                hasTestnetBalances: stablecoinBalances.testnetBalances.length > 0,
                mainnetValueUsd: stablecoinBalances.totalFiatValue,
                testnetValueUsd: stablecoinBalances.testnetTotalFiatValue,
            },

            // All balances (if needed for debugging or advanced UI)
            ...(includeTestnet && {
                allBalances: stablecoinBalances.balances,
                balancesByChain: stablecoinBalances.balancesByChain,
                balancesByStablecoin: stablecoinBalances.balancesByStablecoin,
            })
        };

        // Serialize all BigInt values to strings before sending JSON response
        const serializedResponse = serializeBigInts(response);
        return c.json(serializedResponse);
    } catch (error) {
        console.error('Error fetching user wallets:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.post('/users/:userId/wallets', authMiddleware, async (c) => {
    console.log("wallets request", c.req.raw.url);
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is adding wallet to their own account
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot add wallet to another user\'s account' }, 403);
        }
        
        const data = await c.req.json() as {
            walletAddress: string;
            walletType: 'external' | 'managed' | 'custodial';
            provider?: string;
            blockchain?: string; // 'ethereum', 'solana', 'near', 'polygon', 'base', etc.
            architecture?: BlockchainArchitecture; // 'evm', 'solana', 'near', 'cosmos', 'bitcoin'
            isPrimary?: boolean;
            walletMetadata?: Record<string, unknown>; // Blockchain-specific data like chainId, ensName, etc.
        };

        // Auto-determine architecture if not provided
        const architecture = data.architecture || getBlockchainArchitecture(data.blockchain);

        const wallet = await withTransaction(async (tx) => {
            return await txOperations.addWalletToUser({
                userId,
                ...data,
                architecture
            })(tx);
        });

        return c.json(wallet, 201);
    } catch (error) {
        console.error('Error adding wallet to user:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.put('/users/:userId/wallets/:walletId/primary', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const walletId = c.req.param('walletId');
        const user = c.get('requireUser')();
        
        // Check if user is modifying their own wallet
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot modify another user\'s wallet' }, 403);
        }

        const wallet = await withTransaction(async (tx) => {
            return await txOperations.setPrimaryWallet(userId, walletId)(tx);
        });

        return c.json(wallet);
    } catch (error) {
        console.error('Error setting primary wallet:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.delete('/users/:userId/wallets/:walletId', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const walletId = c.req.param('walletId');
        const user = c.get('requireUser')();
        
        // Check if user is deleting their own wallet
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot delete another user\'s wallet' }, 403);
        }

        const wallet = await withTransaction(async (tx) => {
            return await txOperations.removeWallet(userId, walletId)(tx);
        });

        return c.json(wallet);
    } catch (error) {
        console.error('Error removing wallet:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.post('/users/:userId/wallets/managed', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is creating managed wallet for their own account
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot create managed wallet for another user' }, 403);
        }
        
        const data = await c.req.json() as {
            walletAddress: string;
            provider: string; // 'coinbase-cdp', 'privy', 'magic', etc.
            blockchain?: string; // 'ethereum', 'solana', 'near', etc.
            architecture?: BlockchainArchitecture; // 'evm', 'solana', 'near', 'cosmos', 'bitcoin'
            externalWalletId: string; // Reference ID from external service
            externalUserId?: string; // User ID in external system
            isPrimary?: boolean;
            walletMetadata?: Record<string, unknown>; // Blockchain-specific data
        };

        // Validate required fields
        if (!data.walletAddress || !data.provider || !data.externalWalletId) {
            return c.json({ 
                error: 'Missing required fields: walletAddress, provider, and externalWalletId are required' 
            }, 400);
        }

        // Auto-determine architecture if not provided
        const architecture = data.architecture || getBlockchainArchitecture(data.blockchain);

        const wallet = await withTransaction(async (tx) => {
            return await txOperations.createManagedWallet(userId, {
                ...data,
                architecture
            })(tx);
        });

        return c.json(wallet, 201);
    } catch (error) {
        console.error('Error creating managed wallet:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.get('/wallets/:walletAddress/user', async (c) => {
    try {
        const walletAddress = c.req.param('walletAddress');
        
        const walletRecord = await withTransaction(async (tx) => {
            return await txOperations.getWalletByAddress(walletAddress)(tx);
        });

        if (!walletRecord) {
            return c.json({ error: 'Wallet not found' }, 404);
        }

        return c.json({
            wallet: walletRecord,
            user: walletRecord.user
        });
    } catch (error) {
        console.error('Error fetching wallet user:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.post('/users/:userId/migrate-legacy-wallet', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is migrating their own wallet
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot migrate another user\'s wallet' }, 403);
        }

        const wallet = await withTransaction(async (tx) => {
            return await txOperations.migrateLegacyWallet(userId)(tx);
        });

        if (!wallet) {
            return c.json({ message: 'No legacy wallet to migrate' });
        }

        return c.json(wallet);
    } catch (error) {
        console.error('Error migrating legacy wallet:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

// CDP Managed Wallet Endpoints

app.post('/users/:userId/wallets/cdp', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is creating CDP wallet for their own account
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot create CDP wallet for another user' }, 403);
        }
        
        const data = await c.req.json() as {
            accountName?: string;
            network?: CDPNetwork;
            createSmartAccount?: boolean;
            isPrimary?: boolean;
        };

        // Validate network if provided
        if (data.network && !CDP.isSupportedNetwork(data.network)) {
            return c.json({ error: 'Unsupported network' }, 400);
        }

        // Create CDP account(s)
        const cdpOptions: CreateCDPWalletOptions = {
            accountName: data.accountName || `mcpay-${user.id}-${Date.now()}`,
            network: data.network || 'base-sepolia',
            createSmartAccount: data.createSmartAccount || false,
        };

        const cdpResult = await createCDPAccount(cdpOptions);

        // Store CDP account in database
        const wallets = await withTransaction(async (tx) => {
            const wallets = [];

            // Store main account
            const mainWallet = await txOperations.createCDPManagedWallet(userId, {
                walletAddress: cdpResult.account.walletAddress,
                accountId: cdpResult.account.accountId,
                accountName: cdpResult.account.accountName || cdpResult.account.accountId,
                network: cdpResult.account.network,
                isSmartAccount: false,
                isPrimary: data.isPrimary || false,
            })(tx);
            wallets.push(mainWallet);

            // Store smart account if created
            if (cdpResult.smartAccount) {
                const smartWallet = await txOperations.createCDPManagedWallet(userId, {
                    walletAddress: cdpResult.smartAccount.walletAddress,
                    accountId: cdpResult.smartAccount.accountId,
                    accountName: cdpResult.smartAccount.accountName || cdpResult.smartAccount.accountId,
                    network: cdpResult.smartAccount.network,
                    isSmartAccount: true,
                    ownerAccountId: cdpResult.account.accountId,
                    isPrimary: false, // Smart accounts are not primary by default
                })(tx);
                wallets.push(smartWallet);
            }

            return wallets;
        });

        return c.json({
            message: 'CDP wallets created successfully',
            wallets: wallets.map(w => ({
                ...w,
                // Include architecture information in response
                architecture: w?.architecture || 'evm',
                blockchain: w?.blockchain || 'base'
            })),
            cdpAccountInfo: cdpResult
        }, 201);
    } catch (error) {
        console.error('Error creating CDP wallet:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.get('/users/:userId/wallets/cdp', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is accessing their own CDP wallets
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot access other user\'s CDP wallets' }, 403);
        }

        const cdpWallets = await withTransaction(async (tx) => {
            return await txOperations.getCDPWalletsByUser(userId)(tx);
        });

        return c.json(cdpWallets);
    } catch (error) {
        console.error('Error fetching CDP wallets:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.post('/users/:userId/wallets/cdp/:accountId/faucet', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const accountId = c.req.param('accountId');
        const user = c.get('requireUser')();
        
        // Check if user owns the CDP wallet
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot request faucet for another user\'s wallet' }, 403);
        }

        const data = await c.req.json() as {
            token?: 'eth' | 'usdc';
            network?: CDPNetwork;
        };

        const network = data.network || 'base-sepolia';
        const token = data.token || 'eth';

        // Verify wallet belongs to user
        const wallet = await withTransaction(async (tx) => {
            return await txOperations.getCDPWalletByAccountId(accountId)(tx);
        });

        if (!wallet || wallet.user?.id !== userId) {
            return c.json({ error: 'CDP wallet not found or access denied' }, 404);
        }

        // Request faucet funds
        try {
            await CDP.requestFaucet(accountId, network, token);
            
            // Update wallet metadata with faucet request
            await withTransaction(async (tx) => {
                return await txOperations.updateCDPWalletMetadata(wallet.id, {
                    lastUsedAt: new Date(),
                })(tx);
            });

            return c.json({
                message: `Faucet request successful for ${token} on ${network}`,
                accountId,
                token,
                network
            });
        } catch (faucetError) {
            return c.json({ 
                error: `Faucet request failed: ${faucetError instanceof Error ? faucetError.message : 'Unknown error'}` 
            }, 400);
        }
    } catch (error) {
        console.error('Error requesting faucet:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.get('/users/:userId/wallets/cdp/:accountId/balances', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const accountId = c.req.param('accountId');
        const user = c.get('requireUser')();
        
        // Check if user owns the CDP wallet
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot access another user\'s wallet balances' }, 403);
        }

        const network = c.req.query('network') as CDPNetwork || 'base-sepolia';

        // Verify wallet belongs to user
        const wallet = await withTransaction(async (tx) => {
            return await txOperations.getCDPWalletByAccountId(accountId)(tx);
        });

        if (!wallet || wallet.user?.id !== userId) {
            return c.json({ error: 'CDP wallet not found or access denied' }, 404);
        }

        try {
            const metadata = wallet.walletMetadata as any;
            const isSmartAccount = metadata?.isSmartAccount || false;
            const ownerAccountId = metadata?.ownerAccountId;

            const balances = await CDP.getBalances(
                accountId, 
                network, 
                isSmartAccount, 
                ownerAccountId
            );

            // Cache balances in wallet metadata
            await withTransaction(async (tx) => {
                return await txOperations.updateCDPWalletMetadata(wallet.id, {
                    balanceCache: balances,
                    lastUsedAt: new Date(),
                })(tx);
            });

            return c.json({
                accountId,
                network,
                balances,
                isSmartAccount,
                walletAddress: wallet.walletAddress
            });
        } catch (balanceError) {
            return c.json({ 
                error: `Failed to get balances: ${balanceError instanceof Error ? balanceError.message : 'Unknown error'}` 
            }, 400);
        }
    } catch (error) {
        console.error('Error fetching CDP wallet balances:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.get('/cdp/networks', async (c) => {
    return c.json({
        supportedNetworks: [
            { id: 'base', name: 'Base Mainnet', isTestnet: false, nativeToken: 'ETH' },
            { id: 'base-sepolia', name: 'Base Sepolia', isTestnet: true, nativeToken: 'ETH' },
            { id: 'ethereum', name: 'Ethereum Mainnet', isTestnet: false, nativeToken: 'ETH' },
            { id: 'ethereum-sepolia', name: 'Ethereum Sepolia', isTestnet: true, nativeToken: 'ETH' },
            { id: 'polygon', name: 'Polygon Mainnet', isTestnet: false, nativeToken: 'MATIC' },
            { id: 'arbitrum', name: 'Arbitrum One', isTestnet: false, nativeToken: 'ETH' },
        ],
        defaultNetwork: 'base-sepolia'
    });
});

// Utility endpoint to manually trigger CDP wallet creation
app.post('/users/:userId/wallets/cdp/ensure', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is creating CDP wallet for their own account
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot ensure CDP wallet for another user' }, 403);
        }

        console.log(`Manual CDP wallet creation requested for user: ${userId}`);

        // Force check and create CDP wallet (runs immediately, not in background)
        const result = await withTransaction(async (tx) => {
            return await txOperations.autoCreateCDPWalletForUser(userId, {
                email: user.email || undefined,
                name: user.name || undefined,
                displayName: user.displayName || undefined,
            })(tx);
        });

        if (result) {
            return c.json({
                message: 'CDP wallets created successfully',
                accountName: result.accountName,
                walletsCreated: result.wallets.length,
                hasSmartAccount: !!result.cdpResult.smartAccount,
                wallets: result.wallets.map(w => ({
                    id: w.id,
                    walletAddress: w.walletAddress,
                    isPrimary: w.isPrimary,
                    isSmartAccount: (w.walletMetadata as any)?.isSmartAccount || false,
                    network: (w.walletMetadata as any)?.cdpNetwork || 'base-sepolia'
                }))
            }, 201);
        } else {
            return c.json({
                message: 'User already has CDP wallets',
                existing: true
            });
        }
    } catch (error) {
        console.error('Error ensuring CDP wallet:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

// Coinbase Onramp endpoints
app.post('/users/:userId/onramp/buy-url', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is generating URL for their own account
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot generate onramp URL for another user' }, 403);
        }

        const data = await c.req.json() as {
            walletAddress?: string;
            network?: string;
            asset?: string;
            amount?: number;
            currency?: string;
            redirectUrl?: string;
        };

        // Get user's primary wallet if no address specified
        let walletAddress = data.walletAddress;
        if (!walletAddress) {
            const primaryWallet = await withTransaction(async (tx) => {
                return await txOperations.getUserPrimaryWallet(userId)(tx);
            });

            if (!primaryWallet) {
                return c.json({ error: 'No wallet address provided and no primary wallet found' }, 400);
            }

            walletAddress = primaryWallet.walletAddress;
        }

        try {
            const onrampUrl = await createOneClickBuyUrl(walletAddress, {
                network: data.network || 'base',
                asset: data.asset || 'USDC',
                amount: data.amount || 20,
                currency: data.currency || 'USD',
                userId: user.id,
                redirectUrl: data.redirectUrl
            });

            return c.json({
                onrampUrl,
                walletAddress,
                network: data.network || 'base',
                asset: data.asset || 'USDC',
                amount: data.amount || 20,
                currency: data.currency || 'USD'
            });
        } catch (onrampError) {
            console.error('Error creating onramp URL:', onrampError);
            return c.json({ 
                error: `Failed to create onramp URL: ${onrampError instanceof Error ? onrampError.message : 'Unknown error'}` 
            }, 500);
        }
    } catch (error) {
        console.error('Error in onramp buy-url endpoint:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.get('/onramp/config', async (c) => {
    try {
        return c.json({
            supportedNetworks: getSupportedNetworks(),
            supportedAssets: getSupportedAssets(),
            defaultNetwork: 'base',
            defaultAsset: 'USDC',
            defaultAmount: 20,
            defaultCurrency: 'USD'
        });
    } catch (error) {
        console.error('Error fetching onramp config:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

// Add new endpoint to get supported architectures and blockchain mappings
app.get('/wallets/architectures', async (c) => {
    try {
        const { getBlockchainsForArchitecture, isSupportedBlockchain } = await import('../lib/crypto-accounts.js');
        
        return c.json({
            supportedArchitectures: ['evm', 'solana', 'near', 'cosmos', 'bitcoin'],
            blockchainsByArchitecture: {
                evm: getBlockchainsForArchitecture('evm'),
                solana: getBlockchainsForArchitecture('solana'),
                near: getBlockchainsForArchitecture('near'),
                cosmos: getBlockchainsForArchitecture('cosmos'),
                bitcoin: getBlockchainsForArchitecture('bitcoin'),
            },
            // Helper function endpoint
            validateBlockchain: (blockchain: string) => isSupportedBlockchain(blockchain)
        });
    } catch (error) {
        console.error('Error fetching architecture information:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

// Add new endpoint to get only mainnet balances (real money)
app.get('/users/:userId/wallets/mainnet-balances', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is accessing their own wallets
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot access other user\'s mainnet balances' }, 403);
        }
        
        const includeInactive = c.req.query('includeInactive') === 'true';
        
        const wallets = await withTransaction(async (tx) => {
            return await txOperations.getUserWallets(userId, !includeInactive)(tx);
        });

        // Get only mainnet stablecoin balances (real money)
        const { getMainnetStablecoinBalances } = await import('../lib/crypto-accounts.js');
        const stablecoinBalances = await getMainnetStablecoinBalances(wallets.map(w => w.walletAddress));

        const response = {
            wallets,
            totalFiatValue: stablecoinBalances.totalFiatValue?.toString(),
            balances: stablecoinBalances.balances,
            balancesByChain: stablecoinBalances.balancesByChain,
            balancesByStablecoin: stablecoinBalances.balancesByStablecoin,
            summary: {
                ...stablecoinBalances.summary,
                hasBalances: stablecoinBalances.balances.length > 0,
                valueUsd: stablecoinBalances.totalFiatValue,
                networkType: 'mainnet'
            }
        };

        // Serialize all BigInt values to strings before sending JSON response
        const serializedResponse = serializeBigInts(response);
        return c.json(serializedResponse);
    } catch (error) {
        console.error('Error fetching user mainnet balances:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

// Add new endpoint to get only testnet balances
app.get('/users/:userId/wallets/testnet-balances', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is accessing their own wallets
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot access other user\'s testnet balances' }, 403);
        }
        
        const includeInactive = c.req.query('includeInactive') === 'true';
        
        const wallets = await withTransaction(async (tx) => {
            return await txOperations.getUserWallets(userId, !includeInactive)(tx);
        });

        // Get only testnet stablecoin balances
        const { getTestnetStablecoinBalances } = await import('../lib/crypto-accounts.js');
        const stablecoinBalances = await getTestnetStablecoinBalances(wallets.map(w => w.walletAddress));

        const response = {
            wallets,
            totalFiatValue: stablecoinBalances.totalFiatValue?.toString(),
            balances: stablecoinBalances.balances,
            balancesByChain: stablecoinBalances.balancesByChain,
            balancesByStablecoin: stablecoinBalances.balancesByStablecoin,
            summary: {
                ...stablecoinBalances.summary,
                hasBalances: stablecoinBalances.balances.length > 0,
                valueUsd: stablecoinBalances.totalFiatValue,
                networkType: 'testnet'
            }
        };

        // Serialize all BigInt values to strings before sending JSON response
        const serializedResponse = serializeBigInts(response);
        return c.json(serializedResponse);
    } catch (error) {
        console.error('Error fetching user testnet balances:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

// API Key Management endpoints
app.get('/users/:userId/api-keys', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is accessing their own API keys
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot access other user\'s API keys' }, 403);
        }
        
        const apiKeys = await withTransaction(async (tx) => {
            return await txOperations.getUserApiKeys(userId)(tx);
        });

        return c.json(apiKeys);
    } catch (error) {
        console.error('Error fetching user API keys:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.post('/users/:userId/api-keys', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const user = c.get('requireUser')();
        
        // Check if user is creating API key for their own account
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot create API key for another user' }, 403);
        }
        
        const data = await c.req.json() as {
            name: string;
            permissions: string[];
            expiresInDays?: number;
        };

        // Validate input
        if (!data.name || !data.permissions || !Array.isArray(data.permissions)) {
            return c.json({ error: 'Missing required fields: name and permissions' }, 400);
        }

        if (data.name.length < 1 || data.name.length > 100) {
            return c.json({ error: 'Name must be between 1 and 100 characters' }, 400);
        }

        // Generate API key
        const { apiKey, keyHash } = generateApiKey();
        
        // Calculate expiration date if provided
        let expiresAt: Date | undefined;
        if (data.expiresInDays && data.expiresInDays > 0) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);
        }

        const apiKeyRecord = await withTransaction(async (tx) => {
            return await txOperations.createApiKey({
                userId,
                keyHash,
                name: data.name,
                permissions: data.permissions,
                expiresAt
            })(tx);
        });

        // Return the API key only once (for security)
        return c.json({
            apiKey, // This is the only time the full key is returned
            record: {
                id: apiKeyRecord.id,
                name: apiKeyRecord.name,
                permissions: apiKeyRecord.permissions,
                createdAt: apiKeyRecord.createdAt,
                expiresAt: apiKeyRecord.expiresAt
            }
        }, 201);
    } catch (error) {
        console.error('Error creating API key:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

app.delete('/users/:userId/api-keys/:keyId', authMiddleware, async (c) => {
    try {
        const userId = c.req.param('userId');
        const keyId = c.req.param('keyId');
        const user = c.get('requireUser')();
        
        // Check if user is deleting their own API key
        if (user.id !== userId) {
            return c.json({ error: 'Forbidden - Cannot delete another user\'s API key' }, 403);
        }

        const revokedKey = await withTransaction(async (tx) => {
            return await txOperations.revokeApiKey(keyId, userId)(tx);
        });

        return c.json({
            message: 'API key revoked successfully',
            revokedKey: {
                id: revokedKey.id,
                name: revokedKey.name,
                revokedAt: revokedKey.lastUsedAt
            }
        });
    } catch (error) {
        console.error('Error revoking API key:', error);
        return c.json({ error: (error as Error).message }, 400);
    }
});

// Auto-signing configuration endpoint
app.get('/auto-signing/config', optionalAuthMiddleware, async (c) => {
    try {
        // Import config dynamically to avoid issues
        const { getConfig } = await import('../lib/payment-strategies/config.js');
        const config = getConfig();
        
        // Return a safe subset of config for client information
        return c.json({
            enabled: config.enabled,
            supportedNetworks: config.strategies.cdp.networks,
            availableStrategies: {
                cdp: {
                    enabled: config.strategies.cdp.enabled,
                    preferSmartAccounts: config.strategies.cdp.preferSmartAccounts
                }
            },
            fallbackBehavior: config.fallbackBehavior
        });
    } catch (error) {
        console.error('Error fetching auto-signing config:', error);
        return c.json({ error: (error as Error).message }, 500);
    }
});

// Catch-all for unmatched routes
app.all('*', (c) => {
    return c.json({
        error: 'Not Found',
        message: `Route ${c.req.method} ${c.req.path} not found`,
        availableEndpoints: [
            'GET /api/health',
            'GET /api/version',
            'GET /api/users/:walletAddress',
            'POST /api/users',
            'GET /api/servers',
            'GET /api/servers/:id',
            'POST /api/servers',
            'GET /api/servers/:serverId/tools',
            'GET /api/analytics/usage',
            'POST /api/proofs',
            'GET /api/proofs/:id',
            'GET /api/proofs',
            'GET /api/tools/:toolId/proofs',
            'GET /api/servers/:serverId/proofs',
            'GET /api/users/:userId/proofs',
            'GET /api/proofs/stats',
            'POST /api/proofs/:id/verify',
            'GET /api/servers/:serverId/reputation',
            // Multi-blockchain wallet management (secure - no private key storage)
            'GET /api/users/:userId/wallets', // Get user wallets with separated mainnet/testnet balances. Query params: ?includeInactive=true&includeTestnet=true
            'POST /api/users/:userId/wallets', // Supports Ethereum, Solana, NEAR, etc. (now with architecture support)
            'PUT /api/users/:userId/wallets/:walletId/primary',
            'DELETE /api/users/:userId/wallets/:walletId',
            'POST /api/users/:userId/wallets/managed', // External managed wallets (Coinbase CDP, Privy, Magic, etc.)
            'GET /api/wallets/:walletAddress/user',
            'POST /api/users/:userId/migrate-legacy-wallet',
            // CDP Managed Wallet endpoints
            'POST /api/users/:userId/wallets/cdp', // Create CDP managed wallet (with optional smart account)
            'GET /api/users/:userId/wallets/cdp', // Get user's CDP wallets
            'POST /api/users/:userId/wallets/cdp/ensure', // Manually ensure user has CDP wallet
            'POST /api/users/:userId/wallets/cdp/:accountId/faucet', // Request testnet funds
            'GET /api/users/:userId/wallets/cdp/:accountId/balances', // Get CDP wallet balances
            'GET /api/cdp/networks', // Get supported CDP networks
            // Coinbase Onramp endpoints
            'POST /api/users/:userId/onramp/buy-url', // Generate onramp buy URL for user
            'GET /api/onramp/config', // Get onramp configuration (networks, assets, defaults)
            // Blockchain Architecture endpoints
            'GET /api/wallets/architectures', // Get supported blockchain architectures and mappings
            // Mainnet/Testnet balance endpoints
            'GET /api/users/:userId/wallets/mainnet-balances', // Get mainnet balances for a user
            'GET /api/users/:userId/wallets/testnet-balances', // Get testnet balances for a user
            // API Key Management endpoints (requires authentication)
            'GET /api/users/:userId/api-keys', // Get user's API keys
            'POST /api/users/:userId/api-keys', // Create new API key
            'DELETE /api/users/:userId/api-keys/:keyId', // Revoke API key
            // Auto-signing configuration
            'GET /api/auto-signing/config', // Get auto-signing configuration and status
        ]
    }, 404);
});


// Export types for better developer experience
export type { AppContext, AuthSession, Session, User, UserWallet };

export default app;
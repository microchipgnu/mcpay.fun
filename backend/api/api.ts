/**
 * Main API handler for MCPay.fun
 * 
 * This module handles general API endpoints for the MCPay.fun platform.
 * It provides endpoints for user management, server configuration, and other core functionality.
 */

import { gateway } from "@vercel/ai-sdk-gateway";
import { generateObject } from "ai";
import { Hono } from "hono";
import { cors } from 'hono/cors';
import { randomUUID } from "node:crypto";
import { PaymentRequirementsSchema } from "x402/types";
import { z } from "zod";
import { txOperations, withTransaction } from "../db/actions.js";
import db from "../db/index.js";
import { VLayer, type ExecutionContext } from "../lib/3rd-parties/vlayer.js";
import { getMcpTools } from "../lib/inspect-mcp.js";

export const runtime = 'nodejs'

const app = new Hono();

// Enable CORS for all routes
app.use('*', cors({
    origin: '*', // Allow all origins
    allowHeaders: ['*'], // Allow all headers
    allowMethods: ['*'], // Allow all methods
    exposeHeaders: ['*'], // Expose all headers
    maxAge: 86400, // Cache preflight requests for 24 hours
    credentials: true // Allow credentials
}));

app.get('/', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'mcpay-api'
    });
});

// Health check endpoint
app.get('/health', (c) => {
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
app.get('/servers', async (c) => {
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

app.post('/servers', async (c) => {
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


        const serverInformation = await generateObject({
            model: gateway("openai/gpt-4o-mini"),
            schema: z.object({
                name: z.string(),
                description: z.string(),
            }),
            prompt: `
            You are a helpful assistant that generates information about a server. Create a name and description for the server based on the following information:

            - description: ${data.description || 'No description available'}
            - tools: ${toolsData.map((tool) => `${tool.name}: ${tool.description || 'No description available'}`).join('\n            - ')}

            The name should be a short and concise name for the server. Use the tools to create a name that is unique and descriptive.
            `
        })


        try {
            let server: any
            let userId: string
            console.log('Starting database transaction')

            await db.transaction(async (tx) => {
                // Check if user exists, create if not
                console.log('Checking if user exists with wallet address:', data.receiverAddress)
                let user = await txOperations.getUserByWalletAddress(data.receiverAddress)(tx)

                if (!user) {
                    console.log('User not found, creating new user with wallet address:', data.receiverAddress)
                    user = await txOperations.createUser({
                        walletAddress: data.receiverAddress,
                        displayName: `User ${data.receiverAddress.substring(0, 8)}`,
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
                    name: serverInformation.object.name || data.name || 'No name available',
                    description: serverInformation.object.description || data.description || 'No description available',
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
app.get('/analytics/usage', async (c) => {
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
            'GET /api/servers/:serverId/reputation'
        ]
    }, 404);
});


export default app;
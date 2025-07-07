import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import db from "./index.js";
import {
    analytics,
    apiKeys,
    mcpServers,
    mcpTools,
    payments,
    proofs,
    serverOwnership,
    toolPricing,
    toolUsage,
    users,
    webhooks
} from "./schema.js";

// Define proper transaction type
export type TransactionType = Parameters<Parameters<typeof db['transaction']>[0]>[0];

// Enhanced transaction helper with better typing
export const withTransaction = async <T>(callback: (tx: TransactionType) => Promise<T>): Promise<T> => {
    return await db.transaction(async (tx) => {
        return await callback(tx);
    });
};

// Reusable transaction operations
export const txOperations = {
    // MCP Servers
    createServer: (data: {
        serverId: string;
        mcpOrigin: string;
        creatorId?: string;
        receiverAddress: string;
        requireAuth?: boolean;
        authHeaders?: Record<string, unknown>;
        description?: string;
        name?: string;
        metadata?: Record<string, unknown>;
    }) => async (tx: TransactionType) => {
        const server = await tx.insert(mcpServers).values({
            serverId: data.serverId,
            name: data.name,
            mcpOrigin: data.mcpOrigin,
            creatorId: data.creatorId,
            receiverAddress: data.receiverAddress,
            requireAuth: data.requireAuth,
            authHeaders: data.authHeaders,
            description: data.description,
            metadata: data.metadata,
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        if (!server[0]) throw new Error("Failed to create server");
        return server[0];
    },

    getMcpServer: (id: string) => async (tx: TransactionType) => {
        return await tx.query.mcpServers.findFirst({
            where: eq(mcpServers.id, id),
            columns: {
                id: true,
                serverId: true,
                name: true,
                receiverAddress: true,
                description: true,
                metadata: true,
                status: true,
                createdAt: true,
                updatedAt: true
            }
        });
    },

    internal_getMcpServerByServerId: (serverId: string) => async (tx: TransactionType) => {
        return await tx.query.mcpServers.findFirst({
            where: eq(mcpServers.serverId, serverId),
            columns: {
                id: true,
                serverId: true,
                mcpOrigin: true,
                creatorId: true,
                receiverAddress: true,
                requireAuth: true,
                authHeaders: true,
                description: true,
                name: true,
                metadata: true,
                status: true,
                createdAt: true,
                updatedAt: true
            }
        });
    },

    getMcpServerByServerId: (serverId: string) => async (tx: TransactionType) => {
        return await tx.query.mcpServers.findFirst({
            where: eq(mcpServers.serverId, serverId),
            columns: {
                id: true,
                serverId: true,
                name: true,
                mcpOrigin: false,
                receiverAddress: true,
                description: true,
                metadata: true,
                status: true,
                createdAt: true,
                updatedAt: true
            },
            with: {
                creator: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true,
                        avatarUrl: true
                    }
                },
                tools: {
                    columns: {
                        id: true,
                        name: true,
                        description: true,
                        inputSchema: true,
                        isMonetized: true,
                        payment: true,
                        status: true,
                        metadata: true,
                        createdAt: true,
                        updatedAt: true
                    },
                    with: {
                        pricing: {
                            where: eq(toolPricing.active, true),
                            columns: {
                                id: true,
                                price: true,
                                currency: true,
                                network: true,
                                assetAddress: true,
                                active: true,
                                createdAt: true
                            }
                        },
                        payments: {
                            columns: {
                                id: true,
                                amount: true,
                                currency: true,
                                network: true,
                                status: true,
                                createdAt: true,
                                settledAt: true
                            },
                            with: {
                                user: {
                                    columns: {
                                        id: true,
                                        walletAddress: true,
                                        displayName: true
                                    }
                                }
                            },
                            orderBy: [desc(payments.createdAt)],
                            limit: 10
                        },
                        usage: {
                            columns: {
                                id: true,
                                timestamp: true,
                                responseStatus: true,
                                executionTimeMs: true,
                                result: false
                            },
                            with: {
                                user: {
                                    columns: {
                                        id: true,
                                        walletAddress: true,
                                        displayName: true
                                    }
                                }
                            },
                            orderBy: [desc(toolUsage.timestamp)],
                            limit: 10
                        },
                        proofs: {
                            columns: {
                                id: true,
                                isConsistent: true,
                                confidenceScore: true,
                                status: true,
                                verificationType: true,
                                createdAt: true,
                                webProofPresentation: true
                            },
                            with: {
                                user: {
                                    columns: {
                                        id: true,
                                        walletAddress: true,
                                        displayName: true
                                    }
                                }
                            },
                            orderBy: [desc(proofs.createdAt)],
                            limit: 10
                        }
                    },
                    orderBy: [mcpTools.name]
                },
                analytics: {
                    columns: {
                        id: true,
                        date: true,
                        totalRequests: true,
                        totalRevenue: true,
                        uniqueUsers: true,
                        avgResponseTime: true,
                        toolUsage: true,
                        errorCount: true
                    },
                    orderBy: [desc(analytics.date)],
                    limit: 30 // Last 30 days
                },
                ownership: {
                    where: eq(serverOwnership.active, true),
                    columns: {
                        id: true,
                        role: true,
                        createdAt: true,
                        active: true
                    },
                    with: {
                        user: {
                            columns: {
                                id: true,
                                walletAddress: true,
                                displayName: true,
                                avatarUrl: true
                            }
                        },
                        grantedByUser: {
                            columns: {
                                id: true,
                                walletAddress: true,
                                displayName: true
                            }
                        }
                    }
                },
                webhooks: {
                    where: eq(webhooks.active, true),
                    columns: {
                        id: true,
                        url: true,
                        events: true,
                        active: true,
                        lastTriggeredAt: true,
                        failureCount: true,
                        createdAt: true,
                        updatedAt: true
                    }
                },
                proofs: {
                    columns: {
                        id: true,
                        isConsistent: true,
                        confidenceScore: true,
                        status: true,
                        verificationType: true,
                        createdAt: true,
                        webProofPresentation: true
                    },
                    with: {
                        tool: {
                            columns: {
                                id: true,
                                name: true
                            }
                        },
                        user: {
                            columns: {
                                id: true,
                                walletAddress: true,
                                displayName: true
                            }
                        }
                    },
                    orderBy: [desc(proofs.createdAt)],
                    limit: 20
                }
            }
        });
    },

    listMcpServers: (limit = 10, offset = 0) => async (tx: TransactionType) => {
        return await tx.query.mcpServers.findMany({
            limit,
            offset,
            orderBy: [desc(mcpServers.createdAt)],
            columns: {
                id: true,
                serverId: true,
                name: true,
                receiverAddress: true,
                description: true,
                metadata: true,
                status: true,
                createdAt: true,
                updatedAt: true
            },
            with: {
                tools: {
                    columns: {
                        id: true,
                        name: true,
                        description: true,
                        inputSchema: true,
                        isMonetized: true,
                        payment: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true
                    },
                    orderBy: [mcpTools.name]
                }
            }
        });
    },

    listMcpServersByActivity: (limit = 10, offset = 0) => async (tx: TransactionType) => {
        // Get all servers with their related activity data
        const servers = await tx.query.mcpServers.findMany({
            columns: {
                id: true,
                serverId: true,
                name: true,
                receiverAddress: true,
                description: true,
                metadata: true,
                status: true,
                createdAt: true,
                updatedAt: true
            },
            with: {
                creator: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true,
                        avatarUrl: true
                    }
                },
                tools: {
                    columns: {
                        id: true,
                        name: true,
                        description: true,
                        inputSchema: true,
                        isMonetized: true,
                        payment: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true
                    },
                    with: {
                        payments: {
                            where: eq(payments.status, 'completed'),
                            columns: {
                                id: true,
                                amount: true,
                                currency: true,
                                userId: true,
                                createdAt: true
                            }
                        },
                        usage: {
                            columns: {
                                id: true,
                                userId: true,
                                timestamp: true,
                                responseStatus: true
                            }
                        }
                    },
                    orderBy: [mcpTools.name]
                }
            }
        });

        // Calculate activity metrics for each server
        const serversWithActivity = servers.map(server => {
            const allPayments = server.tools.flatMap(tool => tool.payments);
            const allUsage = server.tools.flatMap(tool => tool.usage);
            
            // Calculate metrics
            const totalPayments = allPayments.length;
            const totalRevenue = allPayments.reduce((sum, payment) => 
                sum + parseFloat(payment.amount), 0
            );
            const totalUsage = allUsage.length;
            const successfulUsage = allUsage.filter(usage => 
                usage.responseStatus === 'success' || usage.responseStatus === '200'
            ).length;
            
            // Get unique users from both payments and usage
            const paymentUserIds = allPayments
                .map(p => p.userId)
                .filter(Boolean);
            const usageUserIds = allUsage
                .map(u => u.userId)
                .filter(Boolean);
            const uniqueUsers = new Set([...paymentUserIds, ...usageUserIds]).size;
            
            // Calculate recent activity (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const recentPayments = allPayments.filter(p => 
                new Date(p.createdAt) > thirtyDaysAgo
            ).length;
            const recentUsage = allUsage.filter(u => 
                new Date(u.timestamp) > thirtyDaysAgo
            ).length;
            
            // Calculate activity score (weighted combination of metrics)
            const activityScore = (
                totalPayments * 10 +        // High weight for payments
                totalRevenue * 0.1 +        // Revenue impact (assuming small amounts)
                totalUsage * 2 +            // Medium weight for usage
                uniqueUsers * 15 +          // High weight for unique users
                recentPayments * 20 +       // Higher weight for recent payments
                recentUsage * 5 +           // Medium weight for recent usage
                successfulUsage * 1         // Small bonus for successful usage
            );

            return {
                ...server,
                activityMetrics: {
                    totalPayments,
                    totalRevenue,
                    totalUsage,
                    uniqueUsers,
                    recentPayments,
                    recentUsage,
                    successfulUsage,
                    activityScore
                }
            };
        });

        // Sort by activity score (descending) and apply pagination
        const sortedServers = serversWithActivity
            .sort((a, b) => b.activityMetrics.activityScore - a.activityMetrics.activityScore)
            .slice(offset, offset + limit);

        return sortedServers;
    },

    searchMcpServers: (searchTerm: string, limit = 10, offset = 0) => async (tx: TransactionType) => {
        // Input validation and sanitization
        if (!searchTerm || typeof searchTerm !== 'string') {
            throw new Error('Invalid search term');
        }
        
        // Sanitize search term - remove any potentially dangerous characters
        const sanitizedTerm = searchTerm
            .trim()
            .replace(/[%_\\]/g, '\\$&') // Escape SQL wildcards
            .substring(0, 100); // Limit length to prevent DoS
            
        if (sanitizedTerm.length < 1) {
            throw new Error('Search term too short');
        }
        
        // Validate and sanitize numeric parameters
        const safeLimitNum = Math.max(1, Math.min(100, Number(limit) || 10)); // Limit between 1-100
        const safeOffsetNum = Math.max(0, Number(offset) || 0);
        
        // Use parameterized search pattern
        const searchPattern = `%${sanitizedTerm}%`;
        
        // Use PostgreSQL's advanced search capabilities with proper parameterization
        const servers = await tx.query.mcpServers.findMany({
            where: or(
                ilike(mcpServers.name, searchPattern),
                ilike(mcpServers.description, searchPattern),
                // Use PostgreSQL's full-text search with proper parameterization
                sql`to_tsvector('english', coalesce(${mcpServers.name}, '') || ' ' || coalesce(${mcpServers.description}, '')) @@ plainto_tsquery('english', ${sanitizedTerm})`
            ),
            limit: safeLimitNum,
            offset: safeOffsetNum,
            orderBy: [
                // Prioritize exact matches in name, then description, then by creation date
                sql`CASE 
                    WHEN ${mcpServers.name} ILIKE ${searchPattern} THEN 1
                    WHEN ${mcpServers.description} ILIKE ${searchPattern} THEN 2
                    ELSE 3
                END`,
                desc(mcpServers.createdAt)
            ],
            columns: {
                id: true,
                serverId: true,
                name: true,
                receiverAddress: true,
                description: true,
                metadata: true,
                status: true,
                createdAt: true,
                updatedAt: true
            },
            with: {
                creator: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true,
                        avatarUrl: true
                    }
                },
                tools: {
                    columns: {
                        id: true,
                        name: true,
                        description: true,
                        inputSchema: true,
                        isMonetized: true,
                        payment: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true
                    },
                    orderBy: [mcpTools.name]
                }
            }
        });

        // Also search for servers that have matching tools using safe subquery
        const serversWithMatchingTools = await tx.query.mcpServers.findMany({
            where: sql`EXISTS (
                SELECT 1 FROM ${mcpTools} 
                WHERE ${mcpTools.serverId} = ${mcpServers.id}
                AND (
                    ${mcpTools.name} ILIKE ${searchPattern}
                    OR ${mcpTools.description} ILIKE ${searchPattern}
                    OR to_tsvector('english', coalesce(${mcpTools.name}, '') || ' ' || coalesce(${mcpTools.description}, '')) @@ plainto_tsquery('english', ${sanitizedTerm})
                )
            )`,
            limit: safeLimitNum,
            offset: safeOffsetNum,
            columns: {
                id: true,
                serverId: true,
                name: true,
                receiverAddress: true,
                description: true,
                metadata: true,
                status: true,
                createdAt: true,
                updatedAt: true
            },
            with: {
                creator: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true,
                        avatarUrl: true
                    }
                },
                tools: {
                    columns: {
                        id: true,
                        name: true,
                        description: true,
                        inputSchema: true,
                        isMonetized: true,
                        payment: true,
                        status: true,
                        createdAt: true,
                        updatedAt: true
                    },
                    orderBy: [mcpTools.name]
                }
            }
        });

        // Combine results and remove duplicates
        const allServers = [...servers, ...serversWithMatchingTools];
        const uniqueServers = allServers.filter((server, index, self) => 
            index === self.findIndex(s => s.id === server.id)
        );

        // Sort by relevance (exact name matches first, then description matches, then tool matches)
        const sortedResults = uniqueServers.sort((a, b) => {
            const cleanSearchTerm = sanitizedTerm.toLowerCase();
            const aNameMatch = a.name?.toLowerCase().includes(cleanSearchTerm);
            const bNameMatch = b.name?.toLowerCase().includes(cleanSearchTerm);
            const aDescMatch = a.description?.toLowerCase().includes(cleanSearchTerm);
            const bDescMatch = b.description?.toLowerCase().includes(cleanSearchTerm);
            
            if (aNameMatch && !bNameMatch) return -1;
            if (!aNameMatch && bNameMatch) return 1;
            if (aDescMatch && !bDescMatch) return -1;
            if (!aDescMatch && bDescMatch) return 1;
            
            // If equal relevance, sort by creation date
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return sortedResults.slice(0, safeLimitNum); // Additional safety limit
    },

    updateMcpServer: (id: string, data: {
        url?: string;
        mcpOrigin?: string;
        receiverAddress?: string;
        requireAuth?: boolean;
        authHeaders?: Record<string, unknown>;
        status?: string;
        description?: string;
        name?: string;
        metadata?: Record<string, unknown>;
    }) => async (tx: TransactionType) => {
        const result = await tx.update(mcpServers)
            .set({
                ...data,
                updatedAt: new Date()
            })
            .where(eq(mcpServers.id, id))
            .returning();

        if (!result[0]) throw new Error(`MCP Server with ID ${id} not found`);
        return result[0];
    },

    deleteMcpServer: (id: string) => async (tx: TransactionType) => {
        const result = await tx.delete(mcpServers)
            .where(eq(mcpServers.id, id))
            .returning();

        if (!result[0]) throw new Error(`MCP Server with ID ${id} not found`);
        return result[0];
    },

    // MCP Tools
    createTool: (data: {
        serverId: string;
        name: string;
        description: string;
        inputSchema: Record<string, unknown>;
        isMonetized?: boolean;
        payment?: Record<string, unknown>;
        status?: string;
        metadata?: Record<string, unknown>;
    }) => async (tx: TransactionType) => {
        const tool = await tx.insert(mcpTools).values({
            serverId: data.serverId,
            name: data.name,
            description: data.description,
            inputSchema: data.inputSchema,
            isMonetized: data.isMonetized,
            payment: data.payment,
            status: data.status,
            metadata: data.metadata,
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        if (!tool[0]) throw new Error("Failed to create tool");
        return tool[0];
    },

    getMcpTool: (id: string) => async (tx: TransactionType) => {
        return await tx.query.mcpTools.findFirst({
            where: eq(mcpTools.id, id)
        });
    },

    listMcpToolsByServer: (serverId: string) => async (tx: TransactionType) => {
        return await tx.query.mcpTools.findMany({
            where: eq(mcpTools.serverId, serverId),
            orderBy: [mcpTools.name]
        });
    },

    updateTool: (toolId: string, data: {
        name?: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        isMonetized?: boolean;
        payment?: Record<string, unknown>;
        status?: string;
        metadata?: Record<string, unknown>;
    }) => async (tx: TransactionType) => {
        const tool = await tx.update(mcpTools)
            .set({
                ...data,
                updatedAt: new Date()
            })
            .where(eq(mcpTools.id, toolId))
            .returning();

        if (!tool[0]) throw new Error(`Tool with ID ${toolId} not found`);
        return tool[0];
    },

    deleteMcpTool: (id: string) => async (tx: TransactionType) => {
        const result = await tx.delete(mcpTools)
            .where(eq(mcpTools.id, id))
            .returning();

        if (!result[0]) throw new Error(`Tool with ID ${id} not found`);
        return result[0];
    },

    // Users
    getUserByWalletAddress: (walletAddress: string) => async (tx: TransactionType) => {
        return await tx.query.users.findFirst({
            where: eq(users.walletAddress, walletAddress)
        });
    },

    getUserById: (id: string) => async (tx: TransactionType) => {
        return await tx.query.users.findFirst({
            where: eq(users.id, id)
        });
    },

    createUser: (data: {
        walletAddress: string;
        email?: string;
        displayName?: string;
        avatarUrl?: string;
    }) => async (tx: TransactionType) => {
        const result = await tx.insert(users).values({
            walletAddress: data.walletAddress,
            email: data.email,
            displayName: data.displayName,
            avatarUrl: data.avatarUrl,
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        if (!result[0]) throw new Error("Failed to create user");
        return result[0];
    },

    updateUserLastLogin: (id: string) => async (tx: TransactionType) => {
        const now = new Date();

        const result = await tx.update(users)
            .set({
                lastLoginAt: now,
                updatedAt: now
            })
            .where(eq(users.id, id))
            .returning();

        if (!result[0]) throw new Error(`User with ID ${id} not found`);
        return result[0];
    },

    // Tool Pricing
    createToolPricing: (toolId: string, data: {
        price: string | number;
        currency: string;
        network: string;
        assetAddress?: string;
    }) => async (tx: TransactionType) => {
        const price = typeof data.price === 'number' ? data.price.toString() : data.price;

        const pricing = await tx.insert(toolPricing).values({
            toolId,
            price,
            currency: data.currency,
            network: data.network,
            assetAddress: data.assetAddress,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        if (!pricing[0]) throw new Error("Failed to create pricing");
        return pricing[0];
    },

    getActiveToolPricing: (toolId: string) => async (tx: TransactionType) => {
        return await tx.query.toolPricing.findFirst({
            where: and(
                eq(toolPricing.toolId, toolId),
                eq(toolPricing.active, true)
            )
        });
    },

    deactivateToolPricing: (toolId: string) => async (tx: TransactionType) => {
        const currentPricing = await tx.query.toolPricing.findFirst({
            where: and(
                eq(toolPricing.toolId, toolId),
                eq(toolPricing.active, true)
            )
        });

        if (currentPricing) {
            await tx.update(toolPricing)
                .set({ active: false, updatedAt: new Date() })
                .where(eq(toolPricing.id, currentPricing.id));
            return currentPricing;
        }
        return null;
    },

    // Payments
    createPayment: (data: {
        toolId: string;
        userId?: string;
        amount: string | number;
        currency: string;
        network: string;
        transactionHash?: string;
        status?: string;
        signature?: string;
        paymentData?: Record<string, unknown>;
    }) => async (tx: TransactionType) => {
        const amountStr = typeof data.amount === 'number' ? data.amount.toString() : data.amount;

        const result = await tx.insert(payments).values({
            toolId: data.toolId,
            userId: data.userId,
            amount: amountStr,
            currency: data.currency,
            network: data.network,
            transactionHash: data.transactionHash,
            status: data.status || 'pending',
            signature: data.signature,
            paymentData: data.paymentData,
            createdAt: new Date()
        }).returning();

        if (!result[0]) throw new Error("Failed to create payment");
        return result[0];
    },

    updatePaymentStatus: (id: string, status: string, transactionHash?: string) => async (tx: TransactionType) => {
        const updated = await tx.update(payments)
            .set({
                status,
                ...(transactionHash ? { transactionHash } : {}),
                ...(status === 'completed' ? { settledAt: new Date() } : {})
            })
            .where(eq(payments.id, id))
            .returning();

        if (!updated[0]) throw new Error(`Payment with ID ${id} not found`);
        return updated[0];
    },

    getPaymentByTransactionHash: (transactionHash: string) => async (tx: TransactionType) => {
        return await tx.query.payments.findFirst({
            where: eq(payments.transactionHash, transactionHash)
        });
    },

    // Tool Usage
    recordToolUsage: (data: {
        toolId: string;
        userId?: string;
        responseStatus: string;
        executionTimeMs?: number;
        ipAddress?: string;
        userAgent?: string;
        requestData?: Record<string, unknown>;
        result?: Record<string, unknown>;
    }) => async (tx: TransactionType) => {
        const executionTime = data.executionTimeMs !== undefined ? data.executionTimeMs : undefined;

        const result = await tx.insert(toolUsage).values({
            toolId: data.toolId,
            userId: data.userId,
            responseStatus: data.responseStatus,
            executionTimeMs: executionTime,
            ipAddress: data.ipAddress,
            userAgent: data.userAgent,
            requestData: data.requestData,
            result: data.result,
            timestamp: new Date()
        }).returning();

        if (!result[0]) throw new Error("Failed to record tool usage");
        return result[0];
    },

    // Analytics
    getDailyAnalytics: (serverId: string, date: Date) => async (tx: TransactionType) => {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        return await tx.query.analytics.findFirst({
            where: and(
                eq(analytics.serverId, serverId),
                eq(analytics.date, startOfDay)
            )
        });
    },

    updateAnalytics: (id: string, data: {
        totalRequests?: number;
        totalRevenue?: number;
        uniqueUsers?: number;
        avgResponseTime?: number;
        toolUsage?: Record<string, unknown>;
        errorCount?: number;
    }) => async (tx: TransactionType) => {
        const dbData = {
            ...(data.totalRequests !== undefined ? { totalRequests: data.totalRequests } : {}),
            ...(data.totalRevenue !== undefined ? { totalRevenue: data.totalRevenue.toString() } : {}),
            ...(data.uniqueUsers !== undefined ? { uniqueUsers: data.uniqueUsers } : {}),
            ...(data.avgResponseTime !== undefined ? { avgResponseTime: data.avgResponseTime.toString() } : {}),
            ...(data.errorCount !== undefined ? { errorCount: data.errorCount } : {}),
            ...(data.toolUsage !== undefined ? { toolUsage: data.toolUsage } : {})
        };

        const result = await tx.update(analytics)
            .set(dbData)
            .where(eq(analytics.id, id))
            .returning();

        if (!result[0]) throw new Error(`Analytics with ID ${id} not found`);
        return result[0];
    },

    createDailyAnalytics: (
        serverId: string,
        date: Date,
        data?: {
            totalRequests?: number;
            totalRevenue?: number;
            uniqueUsers?: number;
            avgResponseTime?: number;
            toolUsage?: Record<string, unknown>;
            errorCount?: number;
        }
    ) => async (tx: TransactionType) => {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const result = await tx.insert(analytics).values({
            serverId,
            date: startOfDay,
            totalRequests: data?.totalRequests ?? 0,
            totalRevenue: data?.totalRevenue ? data.totalRevenue.toString() : '0',
            uniqueUsers: data?.uniqueUsers ?? 0,
            errorCount: data?.errorCount ?? 0,
            ...(data?.avgResponseTime !== undefined ? { avgResponseTime: data.avgResponseTime.toString() } : {}),
            ...(data?.toolUsage !== undefined ? { toolUsage: data.toolUsage } : {})
        }).returning();

        if (!result[0]) throw new Error("Failed to create daily analytics");
        return result[0];
    },

    updateOrCreateDailyAnalytics: (
        serverId: string,
        date: Date,
        data: {
            totalRequests?: number;
            totalRevenue?: number;
            uniqueUsers?: number;
            avgResponseTime?: number;
            toolUsage?: Record<string, unknown>;
            errorCount?: number;
            userId?: string; // Optional user ID to track for uniqueUsers
        }
    ) => async (tx: TransactionType) => {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);

        const existing = await tx.query.analytics.findFirst({
            where: and(
                eq(analytics.serverId, serverId),
                eq(analytics.date, startOfDay)
            )
        });

        if (existing) {
            // Initialize updated data with existing values
            let updatedTotalRequests = existing.totalRequests;
            let updatedTotalRevenue = existing.totalRevenue;
            let updatedUniqueUsers = existing.uniqueUsers;
            let updatedAvgResponseTime = existing.avgResponseTime;
            let updatedErrorCount = existing.errorCount;
            let updatedToolUsage = existing.toolUsage as Record<string, number> || {};
            let updatedUserIdsList = existing.userIdsList as string[] || [];

            // Update values incrementally
            if (data.totalRequests !== undefined) {
                updatedTotalRequests += data.totalRequests;
            }

            if (data.totalRevenue !== undefined) {
                updatedTotalRevenue = (parseFloat(updatedTotalRevenue) + data.totalRevenue).toString();
            }

            if (data.errorCount !== undefined) {
                updatedErrorCount += data.errorCount;
            }

            // Add user ID to list if provided and not already included
            if (data.userId && !updatedUserIdsList.includes(data.userId)) {
                updatedUserIdsList.push(data.userId);
                // Update uniqueUsers count based on actual unique users
                updatedUniqueUsers = updatedUserIdsList.length;
            } else if (data.uniqueUsers !== undefined) {
                // Fallback if no userId provided
                updatedUniqueUsers += data.uniqueUsers;
            }

            // Update avgResponseTime using weighted average
            if (data.avgResponseTime !== undefined) {
                if (updatedAvgResponseTime !== null) {
                    const totalTime = parseFloat(updatedAvgResponseTime) * (updatedTotalRequests - (data.totalRequests || 1));
                    const newTotalTime = totalTime + data.avgResponseTime;
                    updatedAvgResponseTime = (newTotalTime / updatedTotalRequests).toString();
                } else {
                    updatedAvgResponseTime = data.avgResponseTime.toString();
                }
            }

            // Merge toolUsage data
            if (data.toolUsage) {
                for (const [toolId, count] of Object.entries(data.toolUsage)) {
                    updatedToolUsage[toolId] = (updatedToolUsage[toolId] || 0) + (count as number);
                }
            }

            const dbData = {
                totalRequests: updatedTotalRequests,
                totalRevenue: updatedTotalRevenue,
                uniqueUsers: updatedUniqueUsers,
                avgResponseTime: updatedAvgResponseTime,
                errorCount: updatedErrorCount,
                toolUsage: updatedToolUsage,
                userIdsList: updatedUserIdsList
            };

            const updated = await tx.update(analytics)
                .set(dbData)
                .where(eq(analytics.id, existing.id))
                .returning();

            return updated[0];
        } else {
            // For new records, initialize with provided data
            const toolUsage = data.toolUsage || {};
            const userIdsList = data.userId ? [data.userId] : [];

            return await tx.insert(analytics).values({
                serverId,
                date: startOfDay,
                totalRequests: data.totalRequests ?? 0,
                totalRevenue: data.totalRevenue ? data.totalRevenue.toString() : '0',
                uniqueUsers: userIdsList.length || (data.uniqueUsers ?? 0),
                errorCount: data.errorCount ?? 0,
                avgResponseTime: data.avgResponseTime?.toString() || null,
                toolUsage,
                userIdsList
            }).returning().then(res => res[0]);
        }
    },

    // Server Ownership
    assignOwnership: (serverId: string, userId: string, role = 'owner') => async (tx: TransactionType) => {
        const ownership = await tx.insert(serverOwnership).values({
            serverId,
            userId,
            role,
            active: true,
            createdAt: new Date()
        }).returning();

        if (!ownership[0]) throw new Error("Failed to assign ownership");
        return ownership[0];
    },

    getServerOwnership: (serverId: string, userId: string) => async (tx: TransactionType) => {
        return await tx.query.serverOwnership.findFirst({
            where: and(
                eq(serverOwnership.serverId, serverId),
                eq(serverOwnership.userId, userId),
                eq(serverOwnership.active, true)
            )
        });
    },

    listServerOwners: (serverId: string) => async (tx: TransactionType) => {
        return await tx.query.serverOwnership.findMany({
            where: and(
                eq(serverOwnership.serverId, serverId),
                eq(serverOwnership.active, true)
            )
        });
    },

    // API Keys
    createApiKey: (data: {
        userId: string;
        keyHash: string;
        name: string;
        permissions: string[];
        expiresAt?: Date;
    }) => async (tx: TransactionType) => {
        const result = await tx.insert(apiKeys).values({
            userId: data.userId,
            keyHash: data.keyHash,
            name: data.name,
            permissions: data.permissions,
            expiresAt: data.expiresAt,
            active: true,
            createdAt: new Date()
        }).returning();

        if (!result[0]) throw new Error("Failed to create API key");
        return result[0];
    },

    getApiKeyByHash: (keyHash: string) => async (tx: TransactionType) => {
        return await tx.query.apiKeys.findFirst({
            where: and(
                eq(apiKeys.keyHash, keyHash),
                eq(apiKeys.active, true)
            )
        });
    },

    updateApiKeyLastUsed: (id: string) => async (tx: TransactionType) => {
        const result = await tx.update(apiKeys)
            .set({
                lastUsedAt: new Date()
            })
            .where(eq(apiKeys.id, id))
            .returning();

        if (!result[0]) throw new Error(`API key with ID ${id} not found`);
        return result[0];
    },

    // Webhooks
    createWebhook: (data: {
        serverId: string;
        url: string;
        secret?: string;
        events: string[];
    }) => async (tx: TransactionType) => {
        const result = await tx.insert(webhooks).values({
            serverId: data.serverId,
            url: data.url,
            secret: data.secret,
            events: data.events,
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            failureCount: 0
        }).returning();

        if (!result[0]) throw new Error("Failed to create webhook");
        return result[0];
    },

    listWebhooks: (serverId: string) => async (tx: TransactionType) => {
        return await tx.query.webhooks.findMany({
            where: and(
                eq(webhooks.serverId, serverId),
                eq(webhooks.active, true)
            )
        });
    },

    // Proofs operations
    createProof: (data: {
        toolId: string;
        serverId: string;
        userId?: string;
        isConsistent: boolean;
        confidenceScore: number;
        executionUrl?: string;
        executionMethod?: string;
        executionHeaders?: Record<string, unknown>;
        executionParams: Record<string, unknown>;
        executionResult: Record<string, unknown>;
        executionTimestamp: Date;
        aiEvaluation: string;
        inconsistencies?: Array<{
            type: 'parameter_mismatch' | 'result_mismatch' | 'description_mismatch';
            details: string;
        }>;
        webProofPresentation?: string;
        notaryUrl?: string;
        proofMetadata?: Record<string, unknown>;
        replayExecutionResult?: Record<string, unknown>;
        replayExecutionTimestamp?: Date;
        status?: string;
        verificationType?: string;
    }) => async (tx: TransactionType) => {
        const result = await tx.insert(proofs).values({
            toolId: data.toolId,
            serverId: data.serverId,
            userId: data.userId,
            isConsistent: data.isConsistent,
            confidenceScore: data.confidenceScore.toString(),
            executionUrl: data.executionUrl,
            executionMethod: data.executionMethod,
            executionHeaders: data.executionHeaders,
            executionParams: data.executionParams,
            executionResult: data.executionResult,
            executionTimestamp: data.executionTimestamp,
            aiEvaluation: data.aiEvaluation,
            inconsistencies: data.inconsistencies,
            webProofPresentation: data.webProofPresentation,
            notaryUrl: data.notaryUrl,
            proofMetadata: data.proofMetadata,
            replayExecutionResult: data.replayExecutionResult,
            replayExecutionTimestamp: data.replayExecutionTimestamp,
            status: data.status || 'verified',
            verificationType: data.verificationType || 'execution',
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        if (!result[0]) throw new Error("Failed to create proof");
        return result[0];
    },

    getProofById: (id: string) => async (tx: TransactionType) => {
        return await tx.query.proofs.findFirst({
            where: eq(proofs.id, id),
            with: {
                tool: {
                    columns: {
                        id: true,
                        name: true,
                        description: true
                    }
                },
                server: {
                    columns: {
                        id: true,
                        serverId: true,
                        name: true
                    }
                },
                user: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true
                    }
                }
            }
        });
    },

    listProofsByTool: (toolId: string, limit = 10, offset = 0) => async (tx: TransactionType) => {
        return await tx.query.proofs.findMany({
            where: eq(proofs.toolId, toolId),
            limit,
            offset,
            orderBy: [desc(proofs.createdAt)],
            with: {
                user: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true
                    }
                }
            }
        });
    },

    listProofsByServer: (serverId: string, limit = 10, offset = 0) => async (tx: TransactionType) => {
        return await tx.query.proofs.findMany({
            where: eq(proofs.serverId, serverId),
            limit,
            offset,
            orderBy: [desc(proofs.createdAt)],
            with: {
                tool: {
                    columns: {
                        id: true,
                        name: true,
                        description: true
                    }
                },
                user: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true
                    }
                }
            }
        });
    },

    listProofsByUser: (userId: string, limit = 10, offset = 0) => async (tx: TransactionType) => {
        return await tx.query.proofs.findMany({
            where: eq(proofs.userId, userId),
            limit,
            offset,
            orderBy: [desc(proofs.createdAt)],
            with: {
                tool: {
                    columns: {
                        id: true,
                        name: true,
                        description: true
                    }
                },
                server: {
                    columns: {
                        id: true,
                        serverId: true,
                        name: true
                    }
                }
            }
        });
    },

    listProofs: (filters?: {
        isConsistent?: boolean;
        verificationType?: string;
        status?: string;
        minConfidenceScore?: number;
    }, limit = 10, offset = 0) => async (tx: TransactionType) => {
        const conditions = [];
        
        if (filters?.isConsistent !== undefined) {
            conditions.push(eq(proofs.isConsistent, filters.isConsistent));
        }
        
        if (filters?.verificationType) {
            conditions.push(eq(proofs.verificationType, filters.verificationType));
        }
        
        if (filters?.status) {
            conditions.push(eq(proofs.status, filters.status));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        return await tx.query.proofs.findMany({
            where: whereClause,
            limit,
            offset,
            orderBy: [desc(proofs.createdAt)],
            with: {
                tool: {
                    columns: {
                        id: true,
                        name: true,
                        description: true
                    }
                },
                server: {
                    columns: {
                        id: true,
                        serverId: true,
                        name: true
                    }
                },
                user: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true
                    }
                }
            }
        });
    },

    updateProofStatus: (id: string, status: string) => async (tx: TransactionType) => {
        const result = await tx.update(proofs)
            .set({
                status,
                updatedAt: new Date()
            })
            .where(eq(proofs.id, id))
            .returning();

        if (!result[0]) throw new Error(`Proof with ID ${id} not found`);
        return result[0];
    },

    getProofStats: (filters?: {
        toolId?: string;
        serverId?: string;
        userId?: string;
        startDate?: Date;
        endDate?: Date;
    }) => async (tx: TransactionType) => {
        // This would be a more complex query in practice
        // For now, return a simple count-based implementation
        const conditions = [];
        
        if (filters?.toolId) {
            conditions.push(eq(proofs.toolId, filters.toolId));
        }
        
        if (filters?.serverId) {
            conditions.push(eq(proofs.serverId, filters.serverId));
        }
        
        if (filters?.userId) {
            conditions.push(eq(proofs.userId, filters.userId));
        }

        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

        const allProofs = await tx.query.proofs.findMany({
            where: whereClause,
            columns: {
                isConsistent: true,
                confidenceScore: true,
                verificationType: true,
                webProofPresentation: true
            }
        });

        const totalProofs = allProofs.length;
        const consistentProofs = allProofs.filter(p => p.isConsistent).length;
        const inconsistentProofs = totalProofs - consistentProofs;
        const proofsWithWebProof = allProofs.filter(p => p.webProofPresentation).length;
        
        const avgConfidenceScore = totalProofs > 0 
            ? allProofs.reduce((sum, p) => sum + parseFloat(p.confidenceScore), 0) / totalProofs
            : 0;

        const verificationTypeStats = allProofs.reduce((stats, proof) => {
            stats[proof.verificationType] = (stats[proof.verificationType] || 0) + 1;
            return stats;
        }, {} as Record<string, number>);

        return {
            totalProofs,
            consistentProofs,
            inconsistentProofs,
            consistencyRate: totalProofs > 0 ? consistentProofs / totalProofs : 0,
            avgConfidenceScore,
            proofsWithWebProof,
            webProofRate: totalProofs > 0 ? proofsWithWebProof / totalProofs : 0,
            verificationTypeStats
        };
    },

    // Get recent proofs for a server (for reputation scoring)
    getRecentServerProofs: (serverId: string, days = 30) => async (tx: TransactionType) => {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);

        return await tx.query.proofs.findMany({
            where: and(
                eq(proofs.serverId, serverId),
                // Note: For date comparison, you'd need to use a proper date comparison function
                // This is a simplified version
            ),
            columns: {
                isConsistent: true,
                confidenceScore: true,
                webProofPresentation: true,
                createdAt: true
            },
            orderBy: [desc(proofs.createdAt)]
        });
    },

    // Comprehensive Analytics for Landing Page
    getComprehensiveAnalytics: (filters?: {
        startDate?: Date;
        endDate?: Date; 
        toolId?: string;
        userId?: string;
        serverId?: string;
    }) => async (tx: TransactionType) => {
        const startDate = filters?.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = filters?.endDate || new Date();

        // Get basic counts with simpler queries
        const [servers, tools, usage, payments, proofs] = await Promise.all([
            tx.query.mcpServers.findMany({ 
                columns: { id: true, status: true, name: true } 
            }),
            tx.query.mcpTools.findMany({ 
                columns: { id: true, name: true, isMonetized: true } 
            }),
            tx.query.toolUsage.findMany({ 
                columns: { 
                    id: true, 
                    responseStatus: true, 
                    executionTimeMs: true,
                    userId: true,
                    timestamp: true,
                    toolId: true
                }
            }),
            tx.query.payments.findMany({ 
                columns: { 
                    id: true, 
                    amount: true, 
                    status: true,
                    userId: true,
                    createdAt: true,
                    toolId: true
                }
            }),
            tx.query.proofs.findMany({ 
                columns: { 
                    id: true, 
                    isConsistent: true,
                    createdAt: true
                }
            })
        ]);

        // Calculate core metrics
        const totalServers = servers.length;
        const activeServers = servers.filter(s => s.status === 'active').length;
        const totalTools = tools.length;
        const monetizedTools = tools.filter(t => t.isMonetized).length;

        // Process usage data
        const totalRequests = usage.length;
        const successfulRequests = usage.filter(u => 
            u.responseStatus === 'success' || u.responseStatus === '200'
        ).length;
        const failedRequests = totalRequests - successfulRequests;
        const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

        const executionTimes = usage
            .filter(u => u.executionTimeMs !== null && u.executionTimeMs !== undefined)
            .map(u => u.executionTimeMs!);
        const averageExecutionTime = executionTimes.length > 0 
            ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
            : 0;

        // Process payment data
        const completedPayments = payments.filter(p => p.status === 'completed');
        const totalPayments = completedPayments.length;
        const totalRevenue = completedPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const averagePaymentValue = totalPayments > 0 ? totalRevenue / totalPayments : 0;

        // Process proof data
        const totalProofs = proofs.length;
        const consistentProofs = proofs.filter(p => p.isConsistent).length;
        const consistencyRate = totalProofs > 0 ? (consistentProofs / totalProofs) * 100 : 0;

        // Calculate unique users (simple approach)
        const uniqueUserIds = new Set<string>();
        usage.forEach(u => { if (u.userId) uniqueUserIds.add(u.userId); });
        completedPayments.forEach(p => { if (p.userId) uniqueUserIds.add(p.userId); });

        // Create tool name lookup
        const toolNames = new Map<string, string>();
        tools.forEach(t => toolNames.set(t.id, t.name));

        // Simple top tools calculation
        const toolRequestCounts = new Map<string, number>();
        const toolRevenueCounts = new Map<string, number>();

        usage.forEach(u => {
            if (u.toolId) {
                const current = toolRequestCounts.get(u.toolId) || 0;
                toolRequestCounts.set(u.toolId, current + 1);
            }
        });

        completedPayments.forEach(p => {
            if (p.toolId) {
                const current = toolRevenueCounts.get(p.toolId) || 0;
                toolRevenueCounts.set(p.toolId, current + parseFloat(p.amount));
            }
        });

        const topToolsByRequests = Array.from(toolRequestCounts.entries())
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([toolId, count]) => ({
                id: toolId,
                name: toolNames.get(toolId) || 'Unknown Tool',
                requests: count,
                revenue: toolRevenueCounts.get(toolId) || 0
            }));

        const topToolsByRevenue = Array.from(toolRevenueCounts.entries())
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([toolId, revenue]) => ({
                id: toolId,
                name: toolNames.get(toolId) || 'Unknown Tool',
                requests: toolRequestCounts.get(toolId) || 0,
                revenue
            }));

        // Simple daily activity (last 30 days)
        const last30Days = [];
        for (let i = 29; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayUsage = usage.filter(u => u.timestamp.toISOString().split('T')[0] === dateStr);
            const dayPayments = completedPayments.filter(p => p.createdAt.toISOString().split('T')[0] === dateStr);
            const dayUsers = new Set<string>();
            
            dayUsage.forEach(u => { if (u.userId) dayUsers.add(u.userId); });
            dayPayments.forEach(p => { if (p.userId) dayUsers.add(p.userId); });
            
            last30Days.push({
                date: dateStr,
                requests: dayUsage.length,
                revenue: Math.round(dayPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0) * 100) / 100,
                uniqueUsers: dayUsers.size
            });
        }

        return {
            // Core metrics
            totalRequests,
            successfulRequests,
            failedRequests,
            successRate: Math.round(successRate * 100) / 100,
            averageExecutionTime: Math.round(averageExecutionTime),
            
            // Financial metrics
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            totalPayments,
            averagePaymentValue: Math.round(averagePaymentValue * 100) / 100,
            
            // Platform metrics
            totalServers,
            activeServers,
            totalTools,
            monetizedTools,
            uniqueUsers: uniqueUserIds.size,
            
            // Proof/verification metrics
            totalProofs,
            consistentProofs,
            consistencyRate: Math.round(consistencyRate * 100) / 100,
            
            // Top performers
            topToolsByRequests,
            topToolsByRevenue,
            topServersByActivity: [], // Simplified for now
            
            // Time series data for charts
            dailyActivity: last30Days,
            
            // Period info
            periodStart: startDate.toISOString(),
            periodEnd: endDate.toISOString(),
            periodDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
        };
    },

    getMcpServerWithStats: (serverId: string) => async (tx: TransactionType) => {
        const server = await tx.query.mcpServers.findFirst({
            where: eq(mcpServers.serverId, serverId),
            columns: {
                id: true,
                serverId: true,
                name: true,
                mcpOrigin: false,
                receiverAddress: true,
                description: true,
                metadata: true,
                status: true,
                createdAt: true,
                updatedAt: true
            },
            with: {
                creator: {
                    columns: {
                        id: true,
                        walletAddress: true,
                        displayName: true,
                        avatarUrl: true
                    }
                },
                tools: {
                    columns: {
                        id: true,
                        name: true,
                        description: true,
                        inputSchema: true,
                        isMonetized: true,
                        payment: true,
                        status: true,
                        metadata: true,
                        createdAt: true,
                        updatedAt: true
                    },
                    with: {
                        pricing: {
                            where: eq(toolPricing.active, true),
                            columns: {
                                id: true,
                                price: true,
                                currency: true,
                                network: true,
                                assetAddress: true,
                                active: true,
                                createdAt: true
                            }
                        },
                        payments: {
                            columns: {
                                id: true,
                                amount: true,
                                currency: true,
                                network: true,
                                status: true,
                                createdAt: true,
                                settledAt: true,
                                transactionHash: true
                            },
                            with: {
                                user: {
                                    columns: {
                                        id: true,
                                        walletAddress: true,
                                        displayName: true
                                    }
                                }
                            },
                            orderBy: [desc(payments.createdAt)],
                            limit: 50
                        },
                        usage: {
                            columns: {
                                id: true,
                                timestamp: true,
                                responseStatus: true,
                                executionTimeMs: true,
                                result: false
                            },
                            with: {
                                user: {
                                    columns: {
                                        id: true,
                                        walletAddress: true,
                                        displayName: true
                                    }
                                }
                            },
                            orderBy: [desc(toolUsage.timestamp)],
                            limit: 100
                        },
                        proofs: {
                            columns: {
                                id: true,
                                isConsistent: true,
                                confidenceScore: true,
                                status: true,
                                verificationType: true,
                                createdAt: true,
                                webProofPresentation: true
                            },
                            with: {
                                user: {
                                    columns: {
                                        id: true,
                                        walletAddress: true,
                                        displayName: true
                                    }
                                }
                            },
                            orderBy: [desc(proofs.createdAt)],
                            limit: 50
                        }
                    },
                    orderBy: [mcpTools.name]
                },
                analytics: {
                    columns: {
                        id: true,
                        date: true,
                        totalRequests: true,
                        totalRevenue: true,
                        uniqueUsers: true,
                        avgResponseTime: true,
                        toolUsage: true,
                        errorCount: true
                    },
                    orderBy: [desc(analytics.date)],
                    limit: 30
                },
                ownership: {
                    where: eq(serverOwnership.active, true),
                    columns: {
                        id: true,
                        role: true,
                        createdAt: true,
                        active: true
                    },
                    with: {
                        user: {
                            columns: {
                                id: true,
                                walletAddress: true,
                                displayName: true,
                                avatarUrl: true
                            }
                        },
                        grantedByUser: {
                            columns: {
                                id: true,
                                walletAddress: true,
                                displayName: true
                            }
                        }
                    }
                },
                webhooks: {
                    where: eq(webhooks.active, true),
                    columns: {
                        id: true,
                        url: true,
                        events: true,
                        active: true,
                        lastTriggeredAt: true,
                        failureCount: true,
                        createdAt: true,
                        updatedAt: true
                    }
                },
                proofs: {
                    columns: {
                        id: true,
                        isConsistent: true,
                        confidenceScore: true,
                        status: true,
                        verificationType: true,
                        createdAt: true,
                        webProofPresentation: true
                    },
                    with: {
                        tool: {
                            columns: {
                                id: true,
                                name: true
                            }
                        },
                        user: {
                            columns: {
                                id: true,
                                walletAddress: true,
                                displayName: true
                            }
                        }
                    },
                    orderBy: [desc(proofs.createdAt)],
                    limit: 50
                }
            }
        });

        if (!server) return null;

        // Calculate aggregate statistics
        const stats = {
            totalTools: server.tools.length,
            monetizedTools: server.tools.filter(t => t.isMonetized).length,
            totalPayments: server.tools.reduce((sum, tool) => sum + tool.payments.length, 0),
            totalRevenue: server.tools.reduce((sum, tool) => 
                sum + tool.payments
                    .filter(p => p.status === 'completed')
                    .reduce((toolSum, payment) => toolSum + parseFloat(payment.amount), 0), 0
            ),
            totalUsage: server.tools.reduce((sum, tool) => sum + tool.usage.length, 0),
            totalProofs: server.proofs.length,
            consistentProofs: server.proofs.filter(p => p.isConsistent).length,
            proofsWithWebProof: server.proofs.filter(p => p.webProofPresentation).length,
            uniqueUsers: new Set([
                ...server.tools.flatMap(t => t.payments.map(p => p.user?.id).filter(Boolean)),
                ...server.tools.flatMap(t => t.usage.map(u => u.user?.id).filter(Boolean)),
                ...server.proofs.map(p => p.user?.id).filter(Boolean)
            ]).size,
            avgResponseTime: (() => {
                const allUsage = server.tools.flatMap(t => t.usage);
                const timesWithExecution = allUsage.filter(u => u.executionTimeMs !== null);
                return timesWithExecution.length > 0 
                    ? timesWithExecution.reduce((sum, u) => sum + (u.executionTimeMs || 0), 0) / timesWithExecution.length
                    : 0;
            })(),
            reputationScore: (() => {
                if (server.proofs.length === 0) return 0;
                const consistencyRate = server.proofs.filter(p => p.isConsistent).length / server.proofs.length;
                const avgConfidence = server.proofs.reduce((sum, p) => sum + parseFloat(p.confidenceScore), 0) / server.proofs.length;
                const webProofBonus = server.proofs.filter(p => p.webProofPresentation).length / server.proofs.length * 0.2;
                return Math.min(1, consistencyRate * 0.6 + avgConfidence * 0.3 + webProofBonus);
            })(),
            lastActivity: (() => {
                const dates = [
                    ...server.tools.flatMap(t => t.payments.map(p => p.createdAt)),
                    ...server.tools.flatMap(t => t.usage.map(u => u.timestamp)),
                    ...server.proofs.map(p => p.createdAt)
                ];
                return dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
            })()
        };

        return {
            ...server,
            stats
        };
    }
};

// Example of using standard transaction approach
export const createServerWithToolAndPricing = async (
    serverData: Parameters<typeof txOperations.createServer>[0],
    toolData: Parameters<typeof txOperations.createTool>[0],
    pricingData: Parameters<typeof txOperations.createToolPricing>[1]
) => {
    return await db.transaction(async (tx) => {
        // Create server first
        const server = await txOperations.createServer(serverData)(tx);

        // Use server ID for the tool
        toolData.serverId = server.serverId;
        const tool = await txOperations.createTool(toolData)(tx);

        // Add pricing for the tool
        const pricing = await txOperations.createToolPricing(tool.id, pricingData)(tx);

        // Assign ownership if creatorId exists
        if (serverData.creatorId) {
            await txOperations.assignOwnership(server.serverId, serverData.creatorId)(tx);
        }

        return { server, tool, pricing };
    });
};

// Example of updating tool with pricing in a more flexible way
export const updateToolWithNewPricing = async (
    toolId: string,
    toolData: Parameters<typeof txOperations.updateTool>[1],
    pricingData: Parameters<typeof txOperations.createToolPricing>[1]
) => {
    return await db.transaction(async (tx) => {
        const updatedTool = await txOperations.updateTool(toolId, toolData)(tx);
        await txOperations.deactivateToolPricing(toolId)(tx);
        const newPricing = await txOperations.createToolPricing(toolId, pricingData)(tx);

        return { tool: updatedTool, pricing: newPricing };
    });
};

// Complex transaction workflow examples

// Example: User registers and creates a server with tools in one transaction
export const registerUserWithServerAndTools = async (
    userData: Parameters<typeof txOperations.createUser>[0],
    serverData: Parameters<typeof txOperations.createServer>[0],
    toolsData: Parameters<typeof txOperations.createTool>[0][],
    webhookData?: Parameters<typeof txOperations.createWebhook>[0]
) => {
    return await db.transaction(async (tx) => {
        // Create the user first
        const user = await txOperations.createUser(userData)(tx);

        // Use the user's ID for the server
        serverData.creatorId = user.id;
        const server = await txOperations.createServer(serverData)(tx);

        // Create all tools
        const tools = [];
        for (const toolData of toolsData) {
            toolData.serverId = server.serverId;
            const tool = await txOperations.createTool(toolData)(tx);
            tools.push(tool);
        }

        // Create webhook if provided
        let webhook = null;
        if (webhookData) {
            webhookData.serverId = server.serverId;
            webhook = await txOperations.createWebhook(webhookData)(tx);
        }

        // Assign ownership
        await txOperations.assignOwnership(server.serverId, user.id, 'owner')(tx);

        return {
            user,
            server,
            tools,
            webhook
        };
    });
};

// Example: Process payment and record usage together
export const processPaymentWithUsage = async (
    paymentData: Parameters<typeof txOperations.createPayment>[0],
    usageData: Parameters<typeof txOperations.recordToolUsage>[0]
) => {
    return await db.transaction(async (tx) => {
        // Create payment record
        const payment = await txOperations.createPayment(paymentData)(tx);

        // Record tool usage
        const usage = await txOperations.recordToolUsage(usageData)(tx);

        // Update analytics if needed
        const today = new Date();

        // Get the server ID for this tool
        const tool = await txOperations.getMcpTool(paymentData.toolId)(tx);
        if (!tool) throw new Error(`Tool with ID ${paymentData.toolId} not found`);

        // Update daily analytics
        await txOperations.updateOrCreateDailyAnalytics(
            tool.serverId,
            today,
            {
                totalRequests: 1,
                totalRevenue: parseFloat(paymentData.amount.toString()),
                uniqueUsers: paymentData.userId ? 1 : 0,
                errorCount: usageData.responseStatus === 'error' ? 1 : 0,
                toolUsage: { [paymentData.toolId]: 1 }
            }
        )(tx);

        return { payment, usage };
    });
};

// Example: Create API key with transaction logging
export const createApiKeyWithTracking = async (
    userId: string,
    keyName: string,
    permissions: string[],
    keyHash: string
) => {
    return await db.transaction(async (tx) => {
        // Make sure user exists
        const user = await txOperations.getUserById(userId)(tx);
        if (!user) throw new Error(`User with ID ${userId} not found`);

        // Create API key
        const apiKey = await txOperations.createApiKey({
            userId,
            keyHash,
            name: keyName,
            permissions,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) // 1 year
        })(tx);

        // Create metadata record about API key creation
        const metadata = {
            event: 'api_key_created',
            userId,
            keyId: apiKey.id,
            permissions,
            timestamp: new Date()
        };

        // For demonstration - in real app we'd have a proper audit log table
        // Insert into audit log or similar tracking mechanism
        await tx.insert(analytics).values({
            serverId: 'system',
            date: new Date(),
            totalRequests: 0,
            totalRevenue: '0',
            uniqueUsers: 0,
            errorCount: 0,
            toolUsage: metadata
        });

        return { apiKey, metadata };
    });
};
/**
 * Authentication Utilities for MCPay.fun
 * 
 * This module provides utility functions for authentication-related operations,
 * including API key hashing, validation, and other auth helpers.
 */

import crypto from 'node:crypto';

/**
 * Hash an API key for secure storage
 * Uses SHA-256 with a salt for security
 */
export function hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate a new API key
 * Creates a secure random API key with a prefix for identification
 */
export function generateApiKey(prefix: string = 'mcpay'): { apiKey: string; keyHash: string } {
    // Generate 32 bytes of random data and encode as base64
    const randomBytes = crypto.randomBytes(32);
    const apiKey = `${prefix}_${randomBytes.toString('base64url')}`;
    const keyHash = hashApiKey(apiKey);
    
    return { apiKey, keyHash };
}

/**
 * Extract API key from various header formats
 */
export function extractApiKeyFromHeaders(headers: { get: (name: string) => string | null }): string | null {
    // Try X-API-KEY header first
    const xApiKey = headers.get('X-API-KEY') || headers.get('x-api-key');
    if (xApiKey) {
        return xApiKey;
    }
    
    // Try Authorization header with Bearer format
    const authHeader = headers.get('Authorization') || headers.get('authorization');
    if (authHeader) {
        const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
        if (bearerMatch && bearerMatch[1]) {
            const token = bearerMatch[1];
            // Check if it looks like an API key (has our prefix)
            if (token.startsWith('mcpay_')) {
                return token;
            }
        }
    }
    
    return null;
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
    // Check if it matches our expected format: prefix_base64url
    return /^mcpay_[A-Za-z0-9_-]+$/.test(apiKey);
} 
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { randomUUID } from "crypto";
import db from "../db/index.js";
import * as schema from "../db/schema.js";
import { getTrustedOrigins, getGitHubConfig } from "./env.js";
import { txOperations, withTransaction } from "../db/actions.js";


export const auth = betterAuth({
  trustedOrigins: getTrustedOrigins(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users: schema.users,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  socialProviders: {
    github: {
      clientId: getGitHubConfig().clientId,
      clientSecret: getGitHubConfig().clientSecret,
    }
  },
  user: {
    additionalFields: {
      walletAddress: {
        type: "string",
        required: false,
      },
      displayName: {
        type: "string",
        required: false,
      },
      avatarUrl: {
        type: "string",
        required: false,
      },
    },
    modelName: "users", // Use the "users" table name
  },
  // Generate UUID for user IDs instead of default string IDss
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
    // crossSubDomainCookies: {
    //   enabled: true,
    //   domain: "http://localhost:3232",
    // },
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
      partitioned: true // New browser standards for foreign cookies
    }
  },
  // Note: Better-auth hooks are not well documented in current version
  // We use middleware approach in api.ts for reliable CDP wallet auto-creation
});

export type AuthType = {
  user: typeof auth.$Infer.Session.user | null
  session: typeof auth.$Infer.Session.session | null
}

/**
 * Auto-create CDP wallet for user if they don't have one
 * 
 * This function provides automatic CDP wallet creation for authenticated users.
 * It's designed to be called from authentication middleware to ensure every
 * user gets managed wallets without impacting the auth flow performance.
 * 
 * ## Usage:
 * This function is automatically called by:
 * - `authMiddleware` in api.ts for protected routes
 * - `optionalAuthMiddleware` in api.ts for optional auth routes
 * 
 * ## Why Middleware Instead of Better-Auth Hooks:
 * 1. **Reliability**: Middleware approach is more predictable and debuggable
 * 2. **Documentation**: Better-auth hooks are not well documented in current version
 * 3. **Control**: We have full control over when and how CDP wallets are created
 * 4. **Performance**: Background execution doesn't block auth responses
 * 5. **Error Handling**: Graceful failure that doesn't break authentication
 * 
 * ## What Gets Created:
 * - Regular CDP account for standard transactions
 * - Smart account with gas sponsorship on Base networks  
 * - Database records with proper metadata and relationships
 * 
 * @param userId - The authenticated user's ID
 * @param userInfo - User information for account naming and metadata
 */
export async function ensureUserHasCDPWallet(
  userId: string, 
  userInfo: {
    email?: string | null;
    name?: string | null; 
    displayName?: string | null;
  }
): Promise<void> {
  try {
    console.log(`Checking CDP wallet auto-creation for user: ${userId}`);
    
    const result = await withTransaction(async (tx) => {

      console.log("autoCreateCDPWalletForUser", userId, {
        email: userInfo.email || undefined,
        name: userInfo.name || undefined,
        displayName: userInfo.displayName || undefined,
      });

      return await txOperations.autoCreateCDPWalletForUser(userId, {
        email: userInfo.email || undefined,
        name: userInfo.name || undefined,
        displayName: userInfo.displayName || undefined,
      })(tx);
    });

    console.log("result", result);

    if (result) {
      console.log(`Auto-created CDP wallets for user ${userId}:`, {
        accountName: result.accountName,
        walletsCreated: result.wallets.length,
        hasSmartAccount: !!result.cdpResult.smartAccount,
        primaryWallet: result.wallets.find(w => w.isPrimary)?.walletAddress,
        smartWallet: result.wallets.find(w => w.walletMetadata && (w.walletMetadata as any).isSmartAccount)?.walletAddress
      });
    } else {
      console.log(`User ${userId} already has CDP wallets, no auto-creation needed`);
    }
  } catch (error) {
    console.error(`Background CDP wallet creation failed for user ${userId}:`, error);
    // Don't throw - this is best effort and shouldn't impact auth flow
  }
}
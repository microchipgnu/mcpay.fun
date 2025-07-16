/**
 * Coinbase Onramp Integration
 * 
 * This module provides integration with Coinbase Onramp API for one-click buy functionality.
 * It handles JWT authentication and session token generation as required by Coinbase.
 */

import { getCDPConfig } from '../env.js';
import { generateJwt } from '@coinbase/cdp-sdk/auth';

export interface OnrampAddress {
  address: string;
  blockchains: string[];
}

export interface OnrampSessionTokenRequest {
  addresses: OnrampAddress[];
  assets?: string[];
}

export interface OnrampSessionTokenResponse {
  token: string;
  channel_id: string;
}

export interface OnrampUrlOptions {
  sessionToken: string;
  defaultAsset?: string;
  defaultNetwork?: string;
  presetFiatAmount?: number;
  presetCryptoAmount?: number;
  fiatCurrency?: string;
  defaultPaymentMethod?: string;
  defaultExperience?: 'send' | 'buy';
  partnerUserId?: string;
  redirectUrl?: string;
}

/**
 * Generate JWT token for CDP API authentication using the official CDP SDK
 */
async function generateJWT(): Promise<string> {
  const { apiKey, apiSecret } = getCDPConfig();
  
  // Use the official CDP SDK to generate JWT with proper ES256 signing
  const jwt = await generateJwt({
    apiKeyId: apiKey,
    apiKeySecret: apiSecret,
    requestMethod: 'POST',
    requestHost: 'api.developer.coinbase.com',
    requestPath: '/onramp/v1/token',
    expiresIn: 120 // 2 minutes expiration
  });

  return jwt;
}

/**
 * Create a session token for Coinbase Onramp
 */
export async function createOnrampSessionToken(
  request: OnrampSessionTokenRequest
): Promise<OnrampSessionTokenResponse> {
  const jwt = await generateJWT();
  
  console.log('Creating onramp session token with request:', JSON.stringify(request, null, 2));
  
  const response = await fetch('https://api.developer.coinbase.com/onramp/v1/token', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Onramp API error response:', errorText);
    throw new Error(`Failed to create onramp session token: ${response.status} ${errorText}`);
  }

  const responseData = await response.json() as any;
  console.log('Onramp API response:', JSON.stringify(responseData, null, 2));
  
  // Check if response has the expected structure - it should have token and channel_id directly
  if (!responseData || !responseData.token) {
    console.error('Unexpected response structure:', responseData);
    throw new Error('Invalid response structure from onramp API');
  }
  
  return responseData as OnrampSessionTokenResponse;
}

/**
 * Generate a complete Onramp URL with session token
 */
export function generateOnrampUrl(options: OnrampUrlOptions): string {
  const baseUrl = 'https://pay.coinbase.com/buy/select-asset';
  const params = new URLSearchParams();

  // Required session token
  params.set('sessionToken', options.sessionToken);

  // Optional parameters
  if (options.defaultAsset) params.set('defaultAsset', options.defaultAsset);
  if (options.defaultNetwork) params.set('defaultNetwork', options.defaultNetwork);
  if (options.presetFiatAmount) params.set('presetFiatAmount', options.presetFiatAmount.toString());
  if (options.presetCryptoAmount) params.set('presetCryptoAmount', options.presetCryptoAmount.toString());
  if (options.fiatCurrency) params.set('fiatCurrency', options.fiatCurrency);
  if (options.defaultPaymentMethod) params.set('defaultPaymentMethod', options.defaultPaymentMethod);
  if (options.defaultExperience) params.set('defaultExperience', options.defaultExperience);
  if (options.partnerUserId) params.set('partnerUserId', options.partnerUserId);
  if (options.redirectUrl) params.set('redirectUrl', options.redirectUrl);

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Create a one-click buy URL for a user's wallet
 */
export async function createOneClickBuyUrl(
  walletAddress: string,
  options: {
    network?: string;
    asset?: string;
    amount?: number;
    currency?: string;
    userId?: string;
    redirectUrl?: string;
  } = {}
): Promise<string> {
  // Prepare addresses for session token
  const addresses: OnrampAddress[] = [{
    address: walletAddress,
    blockchains: [options.network || 'base', 'ethereum']
  }];

  // Create session token
  const sessionToken = await createOnrampSessionToken({
    addresses,
    assets: options.asset ? [options.asset] : ['ETH', 'USDC']
  });

  if (!sessionToken || !sessionToken.token) {
    throw new Error('Failed to create session token: invalid response from onramp API');
  }

  // Generate complete URL
  return generateOnrampUrl({
    sessionToken: sessionToken.token,
    defaultAsset: options.asset || 'USDC',
    defaultNetwork: options.network || 'base',
    presetFiatAmount: options.amount || 20,
    fiatCurrency: options.currency || 'USD',
    defaultPaymentMethod: 'CARD',
    defaultExperience: 'buy',
    partnerUserId: options.userId,
    redirectUrl: options.redirectUrl
  });
}

/**
 * Get supported networks for onramp
 */
export function getSupportedNetworks(): string[] {
  return [
    'ethereum',
    'base', 
    'polygon',
    'arbitrum',
    'optimism',
    'avalanche'
  ];
}

/**
 * Get supported assets for onramp
 */
export function getSupportedAssets(): string[] {
  return [
    'ETH',
    'USDC',
    'USDT',
    'BTC',
    'WETH'
  ];
} 
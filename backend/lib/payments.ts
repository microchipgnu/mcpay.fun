/**
 * Multi-Chain Payment Processing Library
 * 
 * This module provides support for processing payments across multiple blockchain networks
 * using network-specific facilitators. Each network can have its own facilitator URL configured
 * via environment variables.
 * 
 * Supported Networks:
 * - base-sepolia: Base testnet (default)
 * - sei-testnet: Sei testnet
 * 
 * Environment Variables:
 * - SEI_TESTNET_FACILITATOR_URL: Facilitator URL for Sei testnet
 * - FACILITATOR_URL: Fallback facilitator URL for any unsupported networks
 * 
 * Usage:
 * The payment system automatically selects the appropriate facilitator based on the 
 * network specified in the payment requirements. No manual configuration is needed
 * in most cases - just set the appropriate environment variables.
 */

import type { Address } from "viem";
import type { ERC20TokenAmount, Price, Resource } from "x402/types";
import { moneySchema } from "x402/types";
import { PaymentPayloadSchema, safeBase64Decode, type SupportedNetwork, type PaymentPayload, type SupportedPaymentRequirements, type ExtendedPaymentRequirements } from "./types.js";
import { useFacilitator } from "./types.js";
import { getFacilitatorUrl } from "./env.js";

/**
 * Parses the amount from the given price
 *
 * @param price - The price to parse
 * @param network - The network to get the default asset for
 * @returns The parsed amount or an error message
 */
export function processPriceToAtomicAmount(
    price: Price,
    network: SupportedNetwork,
): { maxAmountRequired: string; asset: ERC20TokenAmount["asset"] } | { error: string } {
    // Handle USDC amount (string) or token amount (ERC20TokenAmount)
    let maxAmountRequired: string;
    let asset: ERC20TokenAmount["asset"];

    if (typeof price === "string" || typeof price === "number") {
        // USDC amount in dollars
        const parsedAmount = moneySchema.safeParse(price);
        if (!parsedAmount.success) {
            return {
                error: `Invalid price (price: ${price}). Must be in the form "$3.10", 0.10, "0.001", ${parsedAmount.error}`,
            };
        }
        const parsedUsdAmount = parsedAmount.data;
        asset = getDefaultAsset(network);
        maxAmountRequired = (parsedUsdAmount * 10 ** asset.decimals).toString();
    } else {
        // Token amount in atomic units
        maxAmountRequired = price.amount;
        asset = price.asset;
    }

    return {
        maxAmountRequired,
        asset,
    };
}

/**
* Gets the default asset (USDC) for the given network
*
* @param network - The network to get the default asset for
* @returns The default asset
*/
export function getDefaultAsset(network: SupportedNetwork) {
    return {
        address: getUsdcAddressForChain(getNetworkId(network)),
        decimals: 6,
        eip712: {
            name: network === "base" ? "USD Coin" : network === "iotex" ? "Bridged USDC" : "USDC",
            version: "2",
        },
    };
}

export function getUsdcAddressForChain(chainId: number): Address {
    return config[chainId.toString()]?.usdcAddress as Address;
}

export const EvmNetworkToChainId = new Map<SupportedNetwork, number>([
    ["base-sepolia", 84532],
    ["base", 8453],
    ["avalanche-fuji", 43113],
    ["avalanche", 43114],
    ["iotex", 4689],
    ["sei-testnet", 1328],
]);

export function getNetworkId(network: SupportedNetwork): number {
    if (EvmNetworkToChainId.has(network)) {
        return EvmNetworkToChainId.get(network)!;
    }
    // TODO: Solana
    throw new Error(`Unsupported network: ${network}`);
}

export const config: Record<string, ChainConfig> = {
    "84532": {
        usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        usdcName: "USDC",
    },
    "8453": {
        usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        usdcName: "USDC",
    },
    "43113": {
        usdcAddress: "0x5425890298aed601595a70AB815c96711a31Bc65",
        usdcName: "USD Coin",
    },
    "43114": {
        usdcAddress: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        usdcName: "USDC",
    },
    "4689": {
        usdcAddress: "0xcdf79194c6c285077a58da47641d4dbe51f63542",
        usdcName: "Bridged USDC",
    },
    "1328": {
        usdcAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED",
        usdcName: "USDC",
    },
};

export type ChainConfig = {
    usdcAddress: Address;
    usdcName: string;
};

// Network-specific facilitator URLs
const FACILITATOR_URLS: Partial<Record<SupportedNetwork, Resource>> = {
    "base-sepolia": getFacilitatorUrl("base-sepolia") as Resource,
    "sei-testnet": getFacilitatorUrl("sei-testnet") as Resource,
} as const;

// Fallback facilitator URL
const DEFAULT_FACILITATOR_URL = getFacilitatorUrl("base-sepolia") as Resource;

console.log(`[PAYMENTS] Facilitator URLs configured:`, FACILITATOR_URLS);

// Create facilitator instances for each network
const facilitatorInstances = new Map<SupportedNetwork, ReturnType<typeof useFacilitator>>();

function getFacilitatorForNetwork(network: SupportedNetwork) {
    if (!facilitatorInstances.has(network)) {
        const facilitatorUrl = FACILITATOR_URLS[network] || DEFAULT_FACILITATOR_URL;
        console.log(`[PAYMENTS] Creating facilitator instance for network ${network} with URL: ${facilitatorUrl}`);
        facilitatorInstances.set(network, useFacilitator({ url: facilitatorUrl }));
    }
    return facilitatorInstances.get(network)!;
}

export const x402Version = 1;

export function decodePayment(payment: string): PaymentPayload {
    const decoded = safeBase64Decode(payment);
    const parsed = JSON.parse(decoded);
  
    const obj = {
      ...parsed,
      payload: {
        signature: parsed.payload.signature,
        authorization: {
          ...parsed.payload.authorization,
          value: parsed.payload.authorization.value,
          validAfter: parsed.payload.authorization.validAfter,
          validBefore: parsed.payload.authorization.validBefore,
        },
      },
    };
  
    const validated = PaymentPayloadSchema.parse(obj);
    return validated;
  }


export function createExactPaymentRequirements(
    price: Price,
    network: SupportedNetwork,
    resource: Resource,
    description = "",
    payTo: `0x${string}`,
): SupportedPaymentRequirements {
    const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
    if ("error" in atomicAmountForAsset) {
        throw new Error(atomicAmountForAsset.error);
    }

    console.log(atomicAmountForAsset)
    const { maxAmountRequired, asset } = atomicAmountForAsset;

    return {
        scheme: "exact",
        network: network,
        maxAmountRequired,
        resource,
        description,
        mimeType: "",
        payTo: payTo,
        maxTimeoutSeconds: 60,
        asset: asset.address,
        outputSchema: undefined,
        extra: {
            name: asset.eip712.name,
            version: asset.eip712.version,
        },
    };
}

/**
 * Verifies a payment and handles the response
 *
 * @param c - The Hono context
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A promise that resolves to true if payment is valid, false otherwise
 */
export async function verifyPayment(
    c: any,
    paymentRequirements: SupportedPaymentRequirements[],
): Promise<boolean> {
    const payment = c.req.header("X-PAYMENT");
    if (!payment) {
        c.status(402);
        return c.json({
            x402Version,
            error: "X-PAYMENT header is required",
            accepts: paymentRequirements,
        });
    }

    let decodedPayment: PaymentPayload;
    try {
        decodedPayment = decodePayment(payment);
        decodedPayment.x402Version = x402Version;
    } catch (error) {
        c.status(402);
        return c.json({
            x402Version,
            error: error || "Invalid or malformed payment header",
            accepts: paymentRequirements,
        });
    }

    try {
        // Ensure we're using a valid payment requirement and not undefined
        const paymentRequirement = paymentRequirements[0];
        if (!paymentRequirement) {
            throw new Error("No payment requirements provided");
        }

        // Get the appropriate facilitator for the network
        const facilitator = getFacilitatorForNetwork(paymentRequirement.network);
        const response = await facilitator.verify(decodedPayment, paymentRequirement as ExtendedPaymentRequirements);
        if (!response.isValid) {
            c.status(402);
            return c.json({
                x402Version,
                error: response.invalidReason,
                accepts: paymentRequirements,
                payer: response.payer,
            });
        }
    } catch (error) {
        c.status(402);
        return c.json({
            x402Version,
            error,
            accepts: paymentRequirements,
        });
    }

    return true;
}

/**
 * Settles a payment using the appropriate facilitator for the network
 *
 * @param decodedPayment - The decoded payment payload
 * @param paymentRequirement - The payment requirement
 * @returns A promise that resolves to the settlement response
 */
export async function settle(
    decodedPayment: PaymentPayload,
    paymentRequirement: SupportedPaymentRequirements,
) {
    const facilitator = getFacilitatorForNetwork(paymentRequirement.network);
    return facilitator.settle(decodedPayment, paymentRequirement as ExtendedPaymentRequirements);
}
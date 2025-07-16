
import { Account, Address, Chain, Client, getAddress, Hex, LocalAccount, PublicActions, RpcSchema, toHex, Transport, WalletActions } from "viem";
import { x402Versions, type PaymentRequirements as BasePaymentRequirements, type Network } from "x402/types";
import { z } from "zod";

export type SignerWallet<
    chain extends Chain = Chain,
    transport extends Transport = Transport,
    account extends Account = Account,
> = Client<
    transport,
    chain,
    account,
    RpcSchema,
    PublicActions<transport, chain, account> & WalletActions<chain, account>
>;

export const authorizationTypes = {
    TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
    ],
};

export const authorizationPrimaryType = "TransferWithAuthorization";

export const NetworkSchema = z.enum([
    "base-sepolia",
    "base",
    "avalanche-fuji",
    "avalanche",
    "iotex",
    "sei-testnet",
]);

export const SupportedEVMNetworks: SupportedNetwork[] = [
    "base-sepolia",
    "base",
    "avalanche-fuji",
    "avalanche",
    "iotex",
    "sei-testnet",
];

export const EvmNetworkToChainId = new Map<SupportedNetwork, number>([
    ["base-sepolia", 84532],
    ["base", 8453],
    ["avalanche-fuji", 43113],
    ["avalanche", 43114],
    ["iotex", 4689],
    ["sei-testnet", 1328],
]);

export const ChainIdToNetwork = Object.fromEntries(
    SupportedEVMNetworks.map(network => [EvmNetworkToChainId.get(network), network]),
) as Record<number, Network>;

export const schemes = ["exact"] as const;

const isInteger = (value: string) => Number.isInteger(Number(value)) && Number(value) >= 0;
const hasMaxLength = (maxLength: number) => (value: string) => value.length <= maxLength;


const EvmECDSASignatureRegex = /^0x[0-9a-fA-F]{130}$/;
const Evm6492SignatureRegex =
    /^0x[0-9a-fA-F]+6492649264926492649264926492649264926492649264926492649264926492$/;
const EvmAddressRegex = /^0x[0-9a-fA-F]{40}$/;
const EvmMaxAtomicUnits = 18;
const HexEncoded64ByteRegex = /^0x[0-9a-fA-F]{64}$/;

export const ExactEvmPayloadAuthorizationSchema = z.object({
    from: z.string().regex(EvmAddressRegex),
    to: z.string().regex(EvmAddressRegex),
    value: z.string().refine(isInteger).refine(hasMaxLength(EvmMaxAtomicUnits)),
    validAfter: z.string().refine(isInteger),
    validBefore: z.string().refine(isInteger),
    nonce: z.string().regex(HexEncoded64ByteRegex),
});
export type ExactEvmPayloadAuthorization = z.infer<typeof ExactEvmPayloadAuthorizationSchema>;


export const ExactEvmPayloadSchema = z.object({
    signature: z.string().regex(EvmECDSASignatureRegex).or(z.string().regex(Evm6492SignatureRegex)),
    authorization: ExactEvmPayloadAuthorizationSchema,
});
export type ExactEvmPayload = z.infer<typeof ExactEvmPayloadSchema>;




export const PaymentPayloadSchema = z.object({
    x402Version: z.number().refine(val => x402Versions.includes(val as 1)),
    scheme: z.enum(schemes),
    network: NetworkSchema,
    payload: ExactEvmPayloadSchema,
});
export type PaymentPayload = z.infer<typeof PaymentPayloadSchema>;
export type UnsignedPaymentPayload = Omit<PaymentPayload, "payload"> & {
    payload: Omit<ExactEvmPayload, "signature"> & { signature: undefined };
};

export function isSignerWallet<
    TChain extends Chain = Chain,
    TTransport extends Transport = Transport,
    TAccount extends Account = Account,
>(
    wallet: SignerWallet<TChain, TTransport, TAccount> | LocalAccount,
): wallet is SignerWallet<TChain, TTransport, TAccount> {
    return (
        typeof wallet === "object" && wallet !== null && "chain" in wallet && "transport" in wallet
    );
}

export function isAccount<
  TChain extends Chain = Chain,
  TTransport extends Transport = Transport,
  TAccount extends Account = Account,
>(wallet: SignerWallet<TChain, TTransport, TAccount> | LocalAccount): wallet is LocalAccount {
  const w = wallet as LocalAccount;
  return (
    typeof wallet === "object" &&
    wallet !== null &&
    typeof w.address === "string" &&
    typeof w.type === "string" &&
    // Check for essential signing capabilities
    typeof w.sign === "function" &&
    typeof w.signMessage === "function" &&
    typeof w.signTypedData === "function" &&
    // Check for transaction signing (required by LocalAccount)
    typeof w.signTransaction === "function"
  );
}

export function createNonce(): Hex {
    const cryptoObj =
        typeof globalThis.crypto !== "undefined" &&
            typeof globalThis.crypto.getRandomValues === "function"
            ? globalThis.crypto
            : // Dynamic require is needed to support node.js
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require("crypto").webcrypto;
    return toHex(cryptoObj.getRandomValues(new Uint8Array(32)));
}

export function preparePaymentHeader(
    from: Address,
    x402Version: number,
    paymentRequirements: ExtendedPaymentRequirements,
): UnsignedPaymentPayload {
    const nonce = createNonce();

    const validAfter = BigInt(
        Math.floor(Date.now() / 1000) - 600, // 10 minutes before
    ).toString();
    const validBefore = BigInt(
        Math.floor(Date.now() / 1000 + paymentRequirements.maxTimeoutSeconds),
    ).toString();

    return {
        x402Version,
        scheme: paymentRequirements.scheme,
        network: paymentRequirements.network,
        payload: {
            signature: undefined,
            authorization: {
                from,
                to: paymentRequirements.payTo as Address,
                value: paymentRequirements.maxAmountRequired,
                validAfter: validAfter.toString(),
                validBefore: validBefore.toString(),
                nonce,
            },
        },
    };
}

export async function createPayment<transport extends Transport, chain extends Chain>(
    client: SignerWallet<chain, transport> | LocalAccount,
    x402Version: number,
    paymentRequirements: ExtendedPaymentRequirements,
): Promise<PaymentPayload> {
    const from = isSignerWallet(client) ? client.account!.address : client.address;
    const unsignedPaymentHeader = preparePaymentHeader(from, x402Version, paymentRequirements);
    return signPaymentHeader(client, paymentRequirements, unsignedPaymentHeader);
}

export async function signAuthorization<transport extends Transport, chain extends Chain>(
    walletClient: SignerWallet<chain, transport> | LocalAccount,
    { from, to, value, validAfter, validBefore, nonce }: ExactEvmPayloadAuthorization,
    { asset, network, extra }: ExtendedPaymentRequirements,
): Promise<{ signature: Hex }> {
    const chainId = getNetworkId(network);
    const name = extra?.name;
    const version = extra?.version;

    const data = {
        types: authorizationTypes,
        domain: {
            name,
            version,
            chainId,
            verifyingContract: getAddress(asset),
        },
        primaryType: "TransferWithAuthorization" as const,
        message: {
            from: getAddress(from),
            to: getAddress(to),
            value,
            validAfter,
            validBefore,
            nonce: nonce,
        },
    };

    if (isSignerWallet(walletClient)) {
        const signature = await walletClient.signTypedData(data);
        return {
            signature,
        };
    } else if (isAccount(walletClient) && walletClient.signTypedData) {
        const signature = await walletClient.signTypedData(data);
        return {
            signature,
        };
    } else {
        throw new Error("Invalid wallet client provided does not support signTypedData");
    }
}

/**
 * Encodes a string to base64 format
 *
 * @param data - The string to be encoded to base64
 * @returns The base64 encoded string
 */
export function safeBase64Encode(data: string): string {
    if (typeof globalThis !== "undefined" && typeof globalThis.btoa === "function") {
      return globalThis.btoa(data);
    }
    return Buffer.from(data).toString("base64");
  }
  
  /**
   * Decodes a base64 string back to its original format
   *
   * @param data - The base64 encoded string to be decoded
   * @returns The decoded string in UTF-8 format
   */
  export function safeBase64Decode(data: string): string {
    if (typeof globalThis !== "undefined" && typeof globalThis.atob === "function") {
      return globalThis.atob(data);
    }
    return Buffer.from(data, "base64").toString("utf-8");
  }

export function encodePayment(payment: PaymentPayload): string {
    const safe = {
      ...payment,
      payload: {
        ...payment.payload,
        authorization: Object.fromEntries(
          Object.entries(payment.payload.authorization).map(([key, value]) => [
            key,
            typeof value === "bigint" ? (value as bigint).toString() : value,
          ]),
        ),
      },
    };
    return safeBase64Encode(JSON.stringify(safe));
  }

export async function createPaymentHeaderExactEVM(
    client: SignerWallet | LocalAccount,
    x402Version: number,
    paymentRequirements: ExtendedPaymentRequirements,
): Promise<string> {
    const payment = await createPayment(client, x402Version, paymentRequirements);
    return encodePayment(payment);
}

export async function signPaymentHeader<transport extends Transport, chain extends Chain>(
    client: SignerWallet<chain, transport> | LocalAccount,
    paymentRequirements: ExtendedPaymentRequirements,
    unsignedPaymentHeader: UnsignedPaymentPayload,
): Promise<PaymentPayload> {
    const { signature } = await signAuthorization(
        client,
        unsignedPaymentHeader.payload.authorization,
        paymentRequirements,
    );

    return {
        ...unsignedPaymentHeader,
        payload: {
            ...unsignedPaymentHeader.payload,
            signature,
        },
    };
}

export async function createPaymentHeader(
    client: SignerWallet | LocalAccount,
    x402Version: number,
    paymentRequirements: ExtendedPaymentRequirements,
): Promise<string> {
    if (
        paymentRequirements.scheme === "exact" &&
        SupportedEVMNetworks.includes(paymentRequirements.network)
    ) {
        return await createPaymentHeaderExactEVM(client, x402Version, paymentRequirements);
    }

    throw new Error("Unsupported scheme");
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

// Extended network schema that includes additional networks
export const SupportedNetworkSchema = z.enum([
    "base-sepolia",
    "base",
    "avalanche-fuji",
    "avalanche",
    "iotex",
    "sei-testnet"
]);

export type SupportedNetwork = z.infer<typeof SupportedNetworkSchema>;

// Extended PaymentRequirements schema that supports SupportedNetwork
export const ExtendedPaymentRequirementsSchema = z.object({
    scheme: z.enum(["exact"]),
    network: SupportedNetworkSchema,
    maxAmountRequired: z.string(),
    resource: z.string().url(),
    description: z.string(),
    mimeType: z.string(),
    outputSchema: z.record(z.any()).optional(),
    payTo: z.string(),
    maxTimeoutSeconds: z.number().int(),
    asset: z.string(),
    extra: z.record(z.any()).optional(),
});

export type ExtendedPaymentRequirements = z.infer<typeof ExtendedPaymentRequirementsSchema>;

// Type that can be used in place of the original PaymentRequirements but supports extended networks
export type SupportedPaymentRequirements = Omit<BasePaymentRequirements, 'network'> & {
    network: SupportedNetwork;
};

export function selectPaymentRequirements(paymentRequirements: ExtendedPaymentRequirements[], network?: Network, scheme?: "exact"): ExtendedPaymentRequirements {
    // Sort `base` payment requirements to the front of the list. This is to ensure that base is preferred if available.
    paymentRequirements.sort((a, b) => {
        if (a.network === "base" && b.network !== "base") {
            return -1;
        }
        if (a.network !== "base" && b.network === "base") {
            return 1;
        }
        return 0;
    });

    // Filter down to the scheme/network if provided
    const broadlyAcceptedPaymentRequirements = paymentRequirements.filter(requirement => {
        // If the scheme is not provided, we accept any scheme.
        const isExpectedScheme = !scheme || requirement.scheme === scheme;
        // If the chain is not provided, we accept any chain.
        const isExpectedChain = !network || network == requirement.network;

        return isExpectedScheme && isExpectedChain;
    });

    // Filter down to USDC requirements
    const usdcRequirements = broadlyAcceptedPaymentRequirements.filter(requirement => {
        // If the address is a USDC address, we return it.
        return requirement.asset === getUsdcAddressForChain(getNetworkId(requirement.network));
    });

    // Prioritize USDC requirements if available
    if (usdcRequirements.length > 0) {
        return usdcRequirements[0];
    }

    // If no USDC requirements are found, return the first broadly accepted requirement.
    if (broadlyAcceptedPaymentRequirements.length > 0) {
        return broadlyAcceptedPaymentRequirements[0];
    }

    // If no matching requirements are found, return the first requirement.
    return paymentRequirements[0];
}

/**
 * Selector for payment requirements.
 * 
 * @param paymentRequirements - The payment requirements to select from.
 * @param network - The network to check against. If not provided, the network will not be checked.
 * @param scheme - The scheme to check against. If not provided, the scheme will not be checked.
 * @returns The payment requirement that is the most appropriate for the user.
 */
export type PaymentRequirementsSelector = (paymentRequirements: ExtendedPaymentRequirements[], network?: Network, scheme?: "exact") => ExtendedPaymentRequirements;
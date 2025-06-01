"use client";

import { porto } from 'porto/wagmi'
import { http, createConfig, createStorage } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
 
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [porto()], 
  storage: typeof window !== 'undefined' 
    ? createStorage({ storage: localStorage })
    : undefined,
  transports: {
    [baseSepolia.id]: http(),
  },
})
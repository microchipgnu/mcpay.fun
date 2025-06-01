"use client";

import { porto } from 'porto/wagmi'
import { http, createConfig, createStorage } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
 
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [porto()], 
  storage: createStorage({ storage: localStorage }),
  transports: {
    [baseSepolia.id]: http(),
  },
})
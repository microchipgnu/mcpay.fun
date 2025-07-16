import { config } from "dotenv";
import { Hono } from "hono";
import { cors } from 'hono/cors';
import { verify, settle } from "x402/facilitator";
import {
  PaymentRequirementsSchema,
  type PaymentRequirements,
  evm,
  type PaymentPayload,
  PaymentPayloadSchema,
} from "x402/types";

import { getFacilitatorPrivateKey } from "../lib/env.js";

config();

export const runtime = 'nodejs';

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

// Environment variables
const FACILITATOR_PRIVATE_KEY = getFacilitatorPrivateKey();

if (!FACILITATOR_PRIVATE_KEY) {
  console.error("Missing required environment variables: FACILITATOR_PRIVATE_KEY");
  process.exit(1); 
}

// Create EVM client
const { createClientSepolia, createSignerSepolia } = evm;
const client = createClientSepolia();

// Types for request bodies
type VerifyRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

type SettleRequest = {
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};

// Health check endpoint
app.get('/', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'x402-facilitator'
    });
});

// Verify endpoint documentation
app.get('/verify', (c) => {
  return c.json({
    endpoint: "/verify",
    description: "POST to verify x402 payments",
    body: {
      paymentPayload: "PaymentPayload",
      paymentRequirements: "PaymentRequirements",
    },
  });
});

// Verify payment endpoint
app.post('/verify', async (c) => {
  try {
    const body: VerifyRequest = await c.req.json();
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    
    console.log('Verifying payment:', {
      paymentPayload: paymentPayload,
      paymentRequirements: paymentRequirements
    });
    
    const valid = await verify(client, paymentPayload, paymentRequirements);
    
    console.log('Verification result:', valid);
    
    return c.json(valid);
  } catch (error) {
    console.error('Verification error:', error);
    return c.json({ error: "Invalid request" }, 400);
  }
});

// Settle endpoint documentation
app.get('/settle', (c) => {
  return c.json({
    endpoint: "/settle",
    description: "POST to settle x402 payments",
    body: {
      paymentPayload: "PaymentPayload",
      paymentRequirements: "PaymentRequirements",
    },
  });
});

// Supported payment kinds endpoint
app.get('/supported', (c) => {
  return c.json({
    kinds: [
      {
        x402Version: 1,
        scheme: "exact",
        network: "base-sepolia",
      },
    ],
  });
});

// Settle payment endpoint
app.post('/settle', async (c) => {
  try {
    const signer = createSignerSepolia(FACILITATOR_PRIVATE_KEY as `0x${string}`);
    const body: SettleRequest = await c.req.json();
    const paymentRequirements = PaymentRequirementsSchema.parse(body.paymentRequirements);
    const paymentPayload = PaymentPayloadSchema.parse(body.paymentPayload);
    
    console.log('Settling payment:', {
      paymentPayload: paymentPayload,
      paymentRequirements: paymentRequirements
    });
    
    const response = await settle(signer, paymentPayload, paymentRequirements);
    
    console.log('Settlement result:', response);
    
    return c.json(response);
  } catch (error) {
    console.error('Settlement error:', error);
    return c.json({ error: `Invalid request: ${error}` }, 400);
  }
});

// Health check endpoint
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'x402-facilitator'
    });
});

// Catch-all for unmatched routes
app.all('*', (c) => {
    return c.json({
        error: 'Not Found',
        message: `Route ${c.req.method} ${c.req.path} not found`,
        availableEndpoints: [
            'GET /',
            'GET /health',
            'GET /verify',
            'POST /verify',
            'GET /settle',
            'POST /settle',
            'GET /supported'
        ]
    }, 404);
});

export default app;

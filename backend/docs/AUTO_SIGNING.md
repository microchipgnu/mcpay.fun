# Auto-Signing System for MCPay.fun

The auto-signing system enables authenticated users to automatically sign payments using their managed wallets, providing a seamless payment experience without manual intervention.

## 🎯 Overview

When a paid tool call is made, the system:

1. **Detects Authentication**: Checks for valid session or API key
2. **Attempts Auto-Signing**: Uses available managed wallets to sign the payment
3. **Falls Back Gracefully**: If auto-signing fails, allows manual payment
4. **Only Fails When Necessary**: Only returns an error if ALL strategies fail AND configuration requires it

## 🏗️ Architecture

### Core Components

- **`backend/lib/payment-strategies/index.ts`** - Main auto-signing orchestrator
- **`backend/lib/payment-strategies/config.ts`** - Configuration management
- **`backend/lib/payment-strategies/cdp-strategy.ts`** - CDP wallet signing strategy
- **`backend/lib/auth-utils.ts`** - Authentication utilities
- **`backend/api/mcp-proxy.ts`** - Integration point in payment flow

### Strategy Pattern

The system uses a pluggable strategy pattern where each signing method implements the `PaymentSigningStrategy` interface:

```typescript
interface PaymentSigningStrategy {
    name: string;
    priority: number;
    canSign(context: PaymentSigningContext): Promise<boolean>;
    signPayment(context: PaymentSigningContext): Promise<PaymentSigningResult>;
}
```

## 🔧 Configuration

### Environment Variables

```bash
# Enable/disable auto-signing
PAYMENT_STRATEGY_ENABLED=true

# Fallback behavior when all strategies fail
PAYMENT_STRATEGY_FALLBACK=continue  # continue|fail|log_only

# Retry configuration
PAYMENT_STRATEGY_MAX_RETRIES=3
PAYMENT_STRATEGY_TIMEOUT_MS=30000

# CDP Strategy specific
CDP_STRATEGY_ENABLED=true
CDP_STRATEGY_PRIORITY=100
CDP_PREFER_SMART_ACCOUNTS=true

# Logging
PAYMENT_STRATEGY_LOG_LEVEL=info  # debug|info|warn|error
PAYMENT_STRATEGY_LOG_AUTH_DETAILS=false
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable entire auto-signing system |
| `fallbackBehavior` | `continue` | What to do when all strategies fail |
| `maxRetries` | `3` | Number of retry attempts per strategy |
| `timeoutMs` | `30000` | Total timeout for auto-signing process |

#### Fallback Behaviors

- **`continue`**: Log failure and proceed with manual payment (recommended)
- **`fail`**: Return error to client if auto-signing fails
- **`log_only`**: Log failure but don't block request

## 🔐 Authentication Support

### Session-based Authentication

Uses better-auth sessions for web applications:

```typescript
// Automatically detected from request headers
const authResult = await auth.api.getSession({ headers: c.req.raw.headers });
```

### API Key Authentication

Supports API keys for programmatic access:

```bash
# Using X-API-KEY header
curl -H "X-API-KEY: mcpay_your_api_key_here" ...

# Using Authorization header
curl -H "Authorization: Bearer mcpay_your_api_key_here" ...
```

#### API Key Management

```bash
# Create API key
POST /api/users/:userId/api-keys
{
  "name": "My Integration",
  "permissions": ["payment:sign"],
  "expiresInDays": 90
}

# List API keys
GET /api/users/:userId/api-keys

# Revoke API key
DELETE /api/users/:userId/api-keys/:keyId
```

## 💳 Supported Signing Strategies

### 1. Coinbase CDP Strategy

**Status**: Structured but not fully implemented (requires CDP SDK completion)

- **Priority**: 100 (highest)
- **Networks**: Base, Base Sepolia, Ethereum, Ethereum Sepolia
- **Features**:
  - Prefers smart accounts (gas-sponsored)
  - Falls back to regular accounts
  - Supports multiple wallets per user
  - Automatic wallet selection

**Configuration**:
```typescript
cdp: {
    enabled: true,
    priority: 100,
    preferSmartAccounts: true,
    networks: ['base', 'base-sepolia', 'ethereum', 'ethereum-sepolia'],
    maxWalletsToTry: 5
}
```

### 2. Future Strategies

The system is designed to easily add more strategies:

- **Privy** (priority: 80)
- **Magic** (priority: 70)
- **WalletConnect** (priority: 60)
- **Custom strategies**

## 🔄 Integration Flow

### 1. Request Processing

```typescript
// In mcp-proxy.ts
async function processPayment(params) {
    // Check if payment header already exists
    let paymentHeader = c.req.header("X-PAYMENT");
    
    // Attempt auto-signing if no payment header exists
    if (!paymentHeader && toolCall.payment) {
        const autoSignResult = await attemptAutoSign(c, toolCall);
        
        if (autoSignResult.success) {
            paymentHeader = autoSignResult.signedPaymentHeader;
            c.req.raw.headers.set("X-PAYMENT", paymentHeader);
        }
    }
    
    // Continue with normal payment verification...
}
```

### 2. Strategy Execution

```typescript
// Try strategies in priority order with retries
for (const strategy of sortedStrategies) {
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
        try {
            if (await strategy.canSign(context)) {
                const result = await strategy.signPayment(context);
                if (result.success) {
                    return result; // Success!
                }
            }
        } catch (error) {
            // Log and retry or move to next strategy
        }
    }
}
```

## 📊 Logging and Monitoring

### Log Levels

- **`debug`**: Detailed execution flow, strategy attempts
- **`info`**: High-level operations, successful signings
- **`warn`**: Failed attempts, fallbacks
- **`error`**: Critical failures, exceptions

### Example Logs

```
[PaymentSigning] Attempting auto-sign for tool payment
[PaymentSigning] User authenticated via session
[PaymentSigning] Found 1 signing strategies
[PaymentSigning] Attempting to sign with strategy: CDP
[PaymentSigning] Successfully signed with strategy: CDP
```

## 🧪 Testing

### Manual Testing

1. **Create authenticated user with CDP wallet**
2. **Make paid tool call without X-PAYMENT header**
3. **Verify auto-signing attempts**
4. **Check fallback behavior**

### Configuration Testing

```bash
# Test with auto-signing disabled
PAYMENT_STRATEGY_ENABLED=false

# Test with different fallback behaviors
PAYMENT_STRATEGY_FALLBACK=fail

# Test with increased logging
PAYMENT_STRATEGY_LOG_LEVEL=debug
PAYMENT_STRATEGY_LOG_AUTH_DETAILS=true
```

## 🚀 Adding New Strategies

### 1. Create Strategy Class

```typescript
// backend/lib/payment-strategies/my-strategy.ts
export class MySigningStrategy implements PaymentSigningStrategy {
    name = "MyProvider";
    priority = 90;

    async canSign(context: PaymentSigningContext): Promise<boolean> {
        // Check if user has compatible wallets
        return true;
    }

    async signPayment(context: PaymentSigningContext): Promise<PaymentSigningResult> {
        // Implement signing logic
        return { success: true, signedPaymentHeader: "..." };
    }
}
```

### 2. Register Strategy

```typescript
// In getSigningStrategies()
try {
    const { MySigningStrategy } = await import('./my-strategy.js');
    strategies.push(new MySigningStrategy());
} catch (error) {
    console.warn('[PaymentSigning] My strategy not available:', error);
}
```

### 3. Add Configuration

```typescript
// In config.ts
strategies: {
    myProvider: {
        enabled: true,
        priority: 90,
        networks: ['ethereum', 'polygon']
    }
}
```

## ⚠️ Security Considerations

### ✅ What's Secure

- **No private keys stored**: All signing happens via external services
- **API key hashing**: Keys are hashed before storage
- **User isolation**: Users can only access their own wallets
- **Permission system**: API keys have scoped permissions
- **Audit logging**: All signing attempts are logged

### 🔒 Best Practices

1. **Rotate API keys regularly**
2. **Use short expiration times for API keys**
3. **Monitor auto-signing logs for anomalies**
4. **Set appropriate retry limits**
5. **Use `continue` fallback for production**

## 🐛 Troubleshooting

### Common Issues

#### Auto-signing not working
- Check `PAYMENT_STRATEGY_ENABLED=true`
- Verify user authentication
- Confirm user has managed wallets
- Check strategy-specific requirements

#### API key authentication failing
- Verify API key format: `mcpay_...`
- Check key hasn't expired
- Confirm user owns the key
- Validate permissions

#### CDP strategy not loading
- Currently expected - implementation pending
- Will be enabled when CDP SDK is complete

### Debug Mode

```bash
PAYMENT_STRATEGY_LOG_LEVEL=debug
PAYMENT_STRATEGY_LOG_AUTH_DETAILS=true
```

## 📈 Future Enhancements

### Planned Features

1. **Complete CDP SDK integration**
2. **Add Privy strategy**
3. **Add Magic strategy**
4. **Implement wallet selection preferences**
5. **Add payment amount limits**
6. **Implement signing quotas/rate limits**
7. **Add webhook notifications for signing events**

### Metrics and Analytics

Future versions will include:
- Auto-signing success rates
- Strategy performance metrics
- User adoption statistics
- Error rate monitoring

## 📚 API Reference

### Endpoints

```bash
# Get auto-signing configuration
GET /api/auto-signing/config

# API key management
GET    /api/users/:userId/api-keys
POST   /api/users/:userId/api-keys
DELETE /api/users/:userId/api-keys/:keyId
```

### Response Examples

```json
// Auto-signing config
{
  "enabled": true,
  "supportedNetworks": ["base", "base-sepolia"],
  "availableStrategies": {
    "cdp": {
      "enabled": true,
      "preferSmartAccounts": true
    }
  },
  "fallbackBehavior": "continue"
}

// API key creation
{
  "apiKey": "mcpay_abc123...",  // Only returned once
  "record": {
    "id": "uuid",
    "name": "My Integration",
    "permissions": ["payment:sign"],
    "createdAt": "2024-01-01T00:00:00Z",
    "expiresAt": "2024-04-01T00:00:00Z"
  }
}
```

---

This auto-signing system provides a robust, extensible foundation for seamless payment experiences while maintaining security and user control. 
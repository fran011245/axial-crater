# Wallet Data Flow Analysis

## Overview
This document explains how tokens are retrieved from Etherscan and displayed in the frontend.

---

## 1. Data Retrieval (Backend API)

### Source: `/src/app/api/wallet/route.js`

#### Wallet Address
- **Address**: `0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC`
- **Chain**: Ethereum Mainnet (Chain ID: 1)

#### API Calls to Etherscan

**1. Token Transfers (ERC-20)**
- **Endpoint**: `https://api.etherscan.io/v2/api`
- **Action**: `tokentx` (Token Transfer)
- **Parameters**:
  - `chainid=1` (Ethereum Mainnet)
  - `address={WALLET_ADDRESS}`
  - `page=1&offset=1000` (Last 1000 transactions)
  - `sort=desc` (Most recent first)
- **Returns**: Array of ERC-20 token transfer transactions

**2. ETH Transactions**
- **Endpoint**: `https://api.etherscan.io/v2/api`
- **Action**: `txlist` (Transaction List)
- **Parameters**: Same as above
- **Returns**: Array of native ETH transactions

**3. Pending Transaction Count**
- **Action**: `eth_getTransactionCount` with `tag=pending`
- **Purpose**: Count pending transactions

**4. Latest Transaction Count**
- **Action**: `eth_getTransactionCount` with `tag=latest`
- **Purpose**: Calculate pending count (pending - latest)

---

## 2. Data Processing

### Time Filter
- **Window**: Last 24 hours
- **Calculation**: `oneDayAgo = now - 86400 seconds`
- Only transactions within this window are processed

### Token Processing Logic

#### For ERC-20 Tokens:
1. Extract token symbol (`tokenSymbol`)
2. Extract token decimals (`tokenDecimal`)
3. Convert value: `value / 10^decimals`
4. Determine direction:
   - **IN**: `tx.to === WALLET_ADDRESS`
   - **OUT**: `tx.from === WALLET_ADDRESS`
5. Accumulate volumes:
   - `tokensIn[symbol] += value` (incoming)
   - `tokensOut[symbol] += value` (outgoing)

#### For ETH (Native):
1. Convert Wei to ETH: `value / 10^18`
2. Filter out zero-value transactions (contract calls)
3. Same IN/OUT logic as tokens

### Price Fetching (CoinMarketCap with CoinGecko Fallback)

**Primary: CoinMarketCap API**
- **Endpoint**: `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol={SYMBOLS}&convert=USD`
- **API Key**: Required (set via `COINMARKETCAP_API_KEY` environment variable)
- **Batch Support**: Up to 100 symbols per request
- **Response Format**: `{ data: { SYMBOL: [{ quote: { USD: { price: ... } } }] } }`
- **Token Matching**: 
  - Matches by symbol (case-insensitive)
  - Filters by Ethereum platform when multiple tokens share the same symbol
  - Uses most popular token if Ethereum-specific match not found

**Fallback: CoinGecko API (No API Key Required)**
- **Trigger**: Used when `COINMARKETCAP_API_KEY` is not set or API returns 401/403
- **Endpoint**: `https://api.coingecko.com/api/v3/simple/price?ids={IDS}&vs_currencies=usd`
- **Mapping**: Uses predefined symbol-to-CoinGecko-ID mapping for common tokens
- **Supported Tokens**: ETH, USDT, USDC, DAI, PEPE, SHIB, FLOKI, CHZ, and others

**Caching:**
- **TTL**: 5 minutes
- **Storage**: In-memory cache (global.priceCache)
- **Key**: Sorted comma-separated list of token symbols
- **Purpose**: Reduces API calls and improves performance

### Final Token Data Structure

```javascript
{
    symbol: string,           // Token symbol (e.g., "USDT", "ETH")
    volume: number,           // Outgoing volume (backward compatibility)
    outVolume: number,        // Total outgoing volume (24h)
    inVolume: number,         // Total incoming volume (24h)
    outVolumeUSD: number|null, // Outgoing volume in USD (if price available)
    inVolumeUSD: number|null   // Incoming volume in USD (if price available)
}
```

### Sorting & Limiting
- Sorted by total volume (in + out) descending
- Limited to top 10 tokens

---

## 3. Frontend Display

### Component: `WalletMonitor`
**Location**: `/src/components/terminal/TerminalWidgets.js`

#### Display Structure

**Header:**
- Title: `">> HOT_WALLET_FLOWS [ETH]"`
- Status indicator:
  - **OK**: Green when `status === 'OPERATIONAL'`
  - **WARNING**: Yellow when `status === 'WARNING'` (pendingCount >= 5)
  - Shows: `PENDING ({pendingCount})` or `OK`

**Table Columns:**
1. **TOKEN_SYM**: Token symbol (e.g., "USDT", "ETH")
2. **IN_VOL_24H**: Incoming volume in last 24h
3. **OUT_VOL_24H**: Outgoing volume in last 24h

#### Display Logic

**Volume Formatting:**
```javascript
formatVolume(volume, usdVolume) {
    if (usdVolume !== null && usdVolume !== undefined) {
        return `$${Math.floor(usdVolume).toLocaleString()}`;
    }
    return volume > 0 ? Math.floor(volume).toLocaleString() : '0';
}
```

**Priority:**
1. **If USD value available**: Display as `$X,XXX` (formatted)
2. **If no USD value**: Display raw token amount (e.g., `1,234`)

**Example Display:**
- `USDT`: `$50,000` / `$45,000` (if price available)
- `ETH`: `$120,000` / `$100,000` (if price available)
- `UNKNOWN_TOKEN`: `1,234` / `567` (raw amounts if no price)

---

## 4. Data Flow Summary

```
Etherscan API
    ↓
[Token Transfers + ETH Transactions]
    ↓
[Filter: Last 24 hours]
    ↓
[Process: Calculate IN/OUT volumes per token]
    ↓
[Check Price Cache (5 min TTL)]
    ↓
[Fetch Prices: CoinMarketCap API (or CoinGecko fallback)]
    ↓
[Store in Cache]
    ↓
[Calculate USD Values: volume × price]
    ↓
[Sort by Total Volume]
    ↓
[Limit to Top 10]
    ↓
[Return JSON Response]
    ↓
Frontend: WalletMonitor Component
    ↓
[Display: Token Symbol | IN Volume | OUT Volume]
```

---

## 5. Current Limitations & Notes

### Limitations:
1. **Price Availability**: Not all tokens have prices on CoinMarketCap or CoinGecko
   - Falls back to raw token amounts (displays with "raw" label)
2. **Token Limit**: Only top 10 tokens displayed
3. **Time Window**: Fixed 24-hour window
4. **Rate Limits**: 
   - Etherscan API: Rate limits apply
   - CoinMarketCap: Free tier allows 333 calls/day (10,000/month)
   - CoinGecko: Public API has rate limits
   - Cache: 30 seconds for transaction data
   - Cache: 5 minutes for prices (reduces API calls)
5. **API Key**: CoinMarketCap requires API key for full functionality
   - Without key, falls back to CoinGecko (limited token support)

### Data Accuracy:
- ✅ Accurate for ERC-20 tokens with standard decimals
- ✅ Accurate for ETH native transactions
- ⚠️ May miss tokens if:
  - Not in last 1000 transactions
  - Token symbol is missing/null
  - Contract address is invalid

### Display Behavior:
- **USD Preferred**: Shows USD when available (more readable)
- **Raw Fallback**: Shows token amounts when price unavailable
- **Zero Handling**: Shows `0` for zero volumes
- **Sorting**: Always shows highest volume tokens first

---

## 6. Example API Response

```json
{
    "topTokens": [
        {
            "symbol": "USDT",
            "volume": 50000,
            "outVolume": 50000,
            "inVolume": 45000,
            "outVolumeUSD": 50000,
            "inVolumeUSD": 45000
        },
        {
            "symbol": "ETH",
            "volume": 100,
            "outVolume": 100,
            "inVolume": 80,
            "outVolumeUSD": 120000,
            "inVolumeUSD": 96000
        }
    ],
    "pendingCount": 2,
    "status": "OPERATIONAL",
    "lastUpdate": "2024-12-19T10:30:00.000Z"
}
```

---

## 7. Recommendations

### Potential Improvements:
1. **Token Metadata**: Store token names, logos, decimals
2. **Historical Data**: Show 7-day, 30-day trends
3. **More Tokens**: Increase limit or add pagination
4. **Price Fallback**: Try multiple price APIs
5. **Error Handling**: Better handling for missing token data
6. **Caching**: More aggressive caching for stable tokens



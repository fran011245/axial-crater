# Wallet Token Analysis Summary

## Current Status

### Tokens Retrieved from Etherscan (Last 24 Hours)

Based on the API response, the following tokens are being tracked:

1. **PEPE** - Volume: 4,986,996,269 tokens
2. **SHIB** - Volume: 1,380,936,670 tokens  
3. **USDT** - Volume: 142,573,363 tokens
4. **USDC** - Volume: 7,081,152 tokens
5. **ATH** - Volume: 2,486,993 tokens
6. **LIF3** - Volume: 1,492,261 tokens
7. **CHZ** - Volume: 923,253 tokens
8. **FLOKI** - Volume: 552,182 tokens
9. **uѕd𝑡** - Volume: 323,000 tokens (Note: unusual symbol)
10. **PNK** - Volume: 199,832 tokens

**Wallet Address**: `0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC`

---

## How Tokens Are Retrieved

### 1. Data Sources
- **ERC-20 Token Transfers**: Last 1000 token transfer transactions
- **ETH Native Transactions**: Last 1000 ETH transactions
- **Time Window**: Only transactions from last 24 hours are counted

### 2. Processing Steps
1. Fetch token transfers from Etherscan API
2. Fetch ETH transactions from Etherscan API
3. Filter transactions to last 24 hours
4. Separate IN (to wallet) vs OUT (from wallet) transactions
5. Accumulate volumes per token symbol
6. Fetch token prices from CoinGecko (if available)
7. Calculate USD values (volume × price)
8. Sort by total volume (IN + OUT)
9. Return top 10 tokens

---

## How Tokens Are Displayed in Frontend

### Component: `WalletMonitor`
**Location**: `src/components/terminal/TerminalWidgets.js`

### Display Format

**Table Structure:**
```
| TOKEN_SYM | IN_VOL_24H  | OUT_VOL_24H |
|-----------|-------------|-------------|
| PEPE      | $X,XXX      | $X,XXX      |
| SHIB      | $X,XXX      | $X,XXX      |
| ...       | ...         | ...         |
```

### Display Logic

**Priority Order:**
1. **If USD value available**: Shows `$X,XXX` (formatted with commas)
2. **If no USD value**: Shows raw token amount (e.g., `1,234,567`)

**Code Logic:**
```javascript
formatVolume(volume, usdVolume) {
    if (usdVolume !== null && usdVolume !== undefined) {
        return `$${Math.floor(usdVolume).toLocaleString()}`;
    }
    return volume > 0 ? Math.floor(volume).toLocaleString() : '0';
}
```

**Fields Used:**
- `t.inVolume` - Incoming volume (raw)
- `t.inVolumeUSD` - Incoming volume in USD
- `t.outVolume` - Outgoing volume (raw)
- `t.outVolumeUSD` - Outgoing volume in USD

---

## Issue Identified

### Problem: API Response Missing Fields

**Expected Response Structure:**
```json
{
    "symbol": "USDT",
    "volume": 142573363,
    "outVolume": 142573363,
    "inVolume": 45000,
    "outVolumeUSD": 142573363,
    "inVolumeUSD": 45000
}
```

**Actual Response Structure:**
```json
{
    "symbol": "USDT",
    "volume": 142573363
}
```

**Root Cause:**
The API code (`route.js`) includes all fields, but the actual response only shows `symbol` and `volume`. This suggests:
1. The deployed version may be different from local code
2. There might be a serialization issue
3. The response might be cached from an older version

**Impact:**
- Frontend falls back to showing raw token amounts (no USD conversion)
- IN/OUT separation may not be working correctly
- Only total volume is displayed (not separated by direction)

---

## Recommendations

### Immediate Actions:
1. **Verify Deployment**: Ensure latest code is deployed to production
2. **Check API Response**: Verify the actual API response includes all fields
3. **Test Price Fetching**: Confirm CoinGecko API is working and returning prices

### Code Improvements:
1. **Add Fallback**: If `inVolume`/`outVolume` missing, use `volume` as fallback
2. **Better Error Handling**: Log when price fetching fails
3. **Add Debugging**: Log token processing steps for troubleshooting

### Display Improvements:
1. **Show Both**: Display both USD and raw amounts when available
2. **Add Tooltips**: Show token names and contract addresses
3. **Add Icons**: Display token logos if available
4. **Better Formatting**: Format large numbers better (e.g., "1.2B" instead of "1,200,000,000")

---

## Data Flow Diagram

```
Etherscan API
    ↓
[Fetch: Token Transfers + ETH Transactions]
    ↓
[Filter: Last 24 hours]
    ↓
[Process: Calculate IN/OUT per token]
    ↓
[Fetch Prices: CoinGecko]
    ↓
[Calculate USD Values]
    ↓
[Sort & Limit: Top 10]
    ↓
[Return JSON]
    ↓
Frontend: WalletMonitor
    ↓
[Display: Symbol | IN Volume | OUT Volume]
```

---

## Token Categories Observed

### Stablecoins:
- **USDT** (Tether)
- **USDC** (USD Coin)
- **uѕd𝑡** (Possible USDT variant/spoof)

### Meme Tokens:
- **PEPE** (Pepe token)
- **SHIB** (Shiba Inu)
- **FLOKI** (Floki Inu)

### Other Tokens:
- **ATH** (Unknown)
- **LIF3** (Unknown)
- **CHZ** (Chiliz)
- **PNK** (Unknown)

---

## Next Steps

1. ✅ Document current behavior
2. ⏳ Verify API response structure matches code
3. ⏳ Test price fetching functionality
4. ⏳ Add fallback handling for missing fields
5. ⏳ Improve display formatting for large numbers



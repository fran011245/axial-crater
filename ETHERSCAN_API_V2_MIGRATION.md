# Etherscan API V2 Migration

**Date:** December 23, 2025  
**Status:** ✅ Migrated to V2 API

---

## Problem Identified

Etherscan has **deprecated their V1 API** and now requires using V2 API with:
1. **New endpoint format:** `/v2/api` instead of `/api`
2. **Required parameter:** `chainid=1` for Ethereum mainnet
3. **Valid API key:** No longer accepts placeholder keys like "YourApiKeyToken"

### Error Messages

**V1 API (deprecated):**
```json
{
  "status": "0",
  "message": "NOTOK",
  "result": "You are using a deprecated V1 endpoint, switch to Etherscan API V2 using https://docs.etherscan.io/v2-migration"
}
```

**V2 API (without valid key):**
```json
{
  "status": "0",
  "message": "NOTOK",
  "result": "Missing/Invalid API Key"
}
```

---

## Solution Implemented

### 1. Updated API Endpoints

**Before (V1 - deprecated):**
```javascript
https://api.etherscan.io/api?module=account&action=txlist&address=...
```

**After (V2):**
```javascript
https://api.etherscan.io/v2/api?module=account&action=txlist&address=...&chainid=1
```

### 2. Added Error Handling

- ✅ Graceful handling when API key is missing/invalid
- ✅ Returns empty arrays instead of crashing
- ✅ Logs warnings instead of throwing errors
- ✅ Validates responses before processing

### 3. Updated All Endpoints

- ✅ Token transfers: `/v2/api?module=account&action=tokentx&chainid=1`
- ✅ ETH transactions: `/v2/api?module=account&action=txlist&chainid=1`
- ✅ Pending transactions: `/v2/api?module=account&action=txlist&chainid=1`

---

## Required Action

### Get a Valid Etherscan API Key

1. **Sign up/Login:** https://etherscan.io/register
2. **Create API Key:** https://etherscan.io/myapikey
3. **Add to Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add: `ETHERSCAN_API_KEY=<your-actual-key>`
   - Select: Production, Preview, Development
   - Click **Save**
4. **Redeploy:** Vercel will automatically redeploy

### Free Tier Limits

- **5 calls/second**
- **100,000 calls/day**
- **No credit card required**

---

## Testing

### Test Script

Run the test script to verify API connectivity:

```bash
node test-etherscan-api.js
```

### Expected Behavior

**Without API Key:**
- ✅ API returns empty arrays (no crash)
- ✅ Warning logged: "⚠️ Etherscan API key invalid or missing"
- ✅ Endpoint returns 200 with empty data

**With Valid API Key:**
- ✅ API returns transaction data
- ✅ All endpoints work correctly
- ✅ No warnings in logs

---

## Code Changes

### File: `src/app/api/wallet/route.js`

**Key Changes:**
1. Updated all endpoints from `/api` to `/v2/api`
2. Added `chainid=1` parameter to all requests
3. Wrapped all fetches in try-catch blocks
4. Added validation for API key errors
5. Return empty arrays on API errors (graceful degradation)

**Example:**
```javascript
// Before
const res = await fetch(`https://api.etherscan.io/api?module=account&action=txlist&...`);

// After
let data = { status: '0', result: [] };
try {
    const res = await fetch(`https://api.etherscan.io/v2/api?module=account&action=txlist&chainid=1&...`);
    data = await res.json();
    if (data.status === '0' && data.result?.includes('Missing/Invalid API Key')) {
        console.warn('⚠️ Etherscan API key invalid or missing.');
        data = { status: '0', result: [] };
    }
} catch (error) {
    console.error('Error:', error.message);
    data = { status: '0', result: [] };
}
```

---

## Impact

### Before Migration
- ❌ 500 errors when Etherscan V1 API deprecated
- ❌ Crashes when API key invalid
- ❌ No graceful error handling

### After Migration
- ✅ Uses V2 API (future-proof)
- ✅ Graceful degradation when API key missing
- ✅ Returns empty data instead of crashing
- ✅ Better error logging for debugging

---

## Next Steps

1. ✅ **Code updated** - All endpoints migrated to V2
2. ⚠️ **Get API key** - Sign up at etherscan.io/myapikey
3. ⚠️ **Add to Vercel** - Set `ETHERSCAN_API_KEY` environment variable
4. ⚠️ **Redeploy** - Vercel will auto-redeploy after env var change

---

## References

- **Etherscan API V2 Docs:** https://docs.etherscan.io/v2-migration
- **API Key Management:** https://etherscan.io/myapikey
- **Supported Chain IDs:** https://api.etherscan.io/v2/chainlist

---

*Migration completed: December 23, 2025*



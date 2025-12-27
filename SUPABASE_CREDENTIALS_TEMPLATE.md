# Supabase Credentials Template

**⚠️ DO NOT COMMIT THIS FILE WITH REAL CREDENTIALS**

Use this template to document your Supabase credentials locally. Copy this file to a secure location outside of git.

## bfxterminal Project Credentials

**Project Location**: Francisco's project > bfxterminal

### Project URL
```
https://[your-project-ref].supabase.co
```

### Service Role Key
```
[your-service-role-key-here]
```
⚠️ **Keep this secret!** This key has full database access.

### Anon Key (Optional - for client-side operations)
```
[your-anon-key-here]
```

## How to Get These Values

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **Francisco's project** → **bfxterminal**
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** from "Project URL" section
   - **Service Role Key** from "Project API keys" → "service_role" (click "Reveal")
   - **Anon Key** from "Project API keys" → "anon public" (if needed)

## Update .env.local

Add these to your `.env.local` file:

```bash
SUPABASE_URL=https://[your-project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
```


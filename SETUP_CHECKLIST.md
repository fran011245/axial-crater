# Setup Checklist - Rate Limiting & Cron Job

**Fecha:** December 23, 2025  
**Estado:** ⚠️ Pendiente de configuración manual

---

## ✅ Completado Automáticamente

- [x] Rate limiting implementado en todas las APIs
- [x] Seguridad del snapshot API (requiere secret header)
- [x] RLS habilitado en Supabase
- [x] Código pusheado a GitHub
- [x] Documentación creada

---

## ⚠️ Pendiente - Configuración Manual

### Paso 1: Generar SNAPSHOT_SECRET

Ya generado para ti:
```
8K905OesD3U4g9A2OvDekZuoyjIHAUB+MK8LNLgOq3o=
```

**⚠️ IMPORTANTE:** Guarda este valor en un lugar seguro. Lo necesitarás en los siguientes pasos.

**Guarda este valor** - lo necesitarás en los siguientes pasos.

---

### Paso 2: Agregar Variables de Entorno a Vercel

1. Ve a: **https://vercel.com/dashboard** → Tu proyecto **axial-crater**
2. Click en **Settings** → **Environment Variables**
3. Agrega estas variables:

| Variable | Valor | Environment |
|----------|-------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | `<obtener-de-supabase>` | Production, Preview, Development |
| `SNAPSHOT_SECRET` | `<el-secret-generado-arriba>` | Production, Preview, Development |

**Cómo obtener `SUPABASE_SERVICE_ROLE_KEY`:**
- Ve a: **https://supabase.com/dashboard/project/grbzolycddncbxcyjlls/settings/api**
- Copia el valor de **"service_role" key** (⚠️ NO el anon key)

4. Click **Save**
5. **Redeploy** el proyecto (Vercel → Deployments → ... → Redeploy)

---

### Paso 3: Verificar Supabase CLI

```bash
# Verificar que tienes Supabase CLI instalado
supabase --version

# Si no está instalado:
npm install -g supabase

# Login a Supabase
supabase login

# Link al proyecto
supabase link --project-ref grbzolycddncbxcyjlls
```

---

### Paso 4: Deploy Edge Function

```bash
cd /Users/fsimonai/axial-crater
supabase functions deploy save-snapshot
```

**Verificar:**
```bash
supabase functions list
```

Deberías ver `save-snapshot` en la lista.

---

### Paso 5: Configurar Secrets en Supabase Edge Function

```bash
# Reemplaza <TU-SECRET> con el SNAPSHOT_SECRET que generaste
supabase secrets set VERCEL_URL=https://axial-crater.vercel.app
supabase secrets set SNAPSHOT_SECRET=<TU-SECRET>
```

**Verificar:**
```bash
supabase secrets list
```

Deberías ver ambos secrets listados.

---

### Paso 6: Crear Cron Job en Supabase

1. Ve a: **https://supabase.com/dashboard/project/grbzolycddncbxcyjlls/sql/new**
2. Ejecuta este SQL:

```sql
-- Habilitar extensión pg_cron (si no está habilitada)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Crear cron job que se ejecuta cada 5 minutos
SELECT cron.schedule(
    'save-snapshot-every-5-min',           -- Nombre del job
    '*/5 * * * *',                         -- Cada 5 minutos
    $$
    SELECT
      net.http_post(
          url := 'https://grbzolycddncbxcyjlls.supabase.co/functions/v1/save-snapshot',
          headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
          ),
          body := '{}'::jsonb
      ) as request_id;
    $$
);
```

3. Click **Run** (o presiona Cmd+Enter)

**Verificar:**
```sql
SELECT * FROM cron.job WHERE jobname = 'save-snapshot-every-5-min';
```

Deberías ver una fila con el job configurado.

---

### Paso 7: Verificar que Todo Funciona

#### 7.1: Verificar Cron Job está corriendo

```sql
-- Ver últimos 10 ejecuciones del cron job
SELECT 
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'save-snapshot-every-5-min')
ORDER BY start_time DESC
LIMIT 10;
```

**Esperado:** Ver ejecuciones cada ~5 minutos con `status = 'succeeded'`

#### 7.2: Verificar Edge Function Logs

1. Ve a: **https://supabase.com/dashboard/project/grbzolycddncbxcyjlls/functions/save-snapshot**
2. Click en **Logs**
3. Deberías ver logs cada 5 minutos con:
   ```
   [Cron] Starting snapshot save...
   [Cron] Snapshot saved successfully
   ```

#### 7.3: Verificar Datos en Supabase

```sql
-- Ver últimos snapshots guardados
SELECT 
    timestamp,
    ticker_count,
    jsonb_array_length(top_pairs) as top_pairs_count
FROM volume_snapshots
ORDER BY timestamp DESC
LIMIT 10;
```

**Esperado:** Ver filas nuevas cada 5 minutos

#### 7.4: Test Manual del Snapshot API

```bash
# Test con secret (debería funcionar)
curl -X POST https://axial-crater.vercel.app/api/snapshot \
  -H "x-snapshot-secret: <TU-SECRET>" \
  -H "Content-Type: application/json"

# Test sin secret (debería fallar con 401)
curl -X POST https://axial-crater.vercel.app/api/snapshot \
  -H "Content-Type: application/json"
```

**Esperado:**
- Con secret: `{"success":true,"message":"Snapshots saved successfully"}`
- Sin secret: `{"success":false,"error":"Unauthorized"}`

---

## Troubleshooting

### Error: "Server missing SNAPSHOT_SECRET"

**Causa:** Variable de entorno no configurada en Vercel  
**Solución:** Verifica Paso 2, asegúrate de hacer redeploy después de agregar las variables

### Error: "Server missing Supabase service role configuration"

**Causa:** `SUPABASE_SERVICE_ROLE_KEY` no configurada en Vercel  
**Solución:** Verifica Paso 2, usa el service_role key (no el anon key)

### Error: "Unauthorized" al llamar /api/snapshot

**Causa:** Header `x-snapshot-secret` incorrecto o faltante  
**Solución:** Verifica que el secret en Vercel y Supabase Edge Function sean iguales

### Cron Job no se ejecuta

**Causa 1:** Extensión `pg_cron` no habilitada  
**Solución:** Ejecuta `CREATE EXTENSION IF NOT EXISTS pg_cron;`

**Causa 2:** Cron job no creado  
**Solución:** Verifica Paso 6, ejecuta el SQL de nuevo

**Causa 3:** Plan de Supabase no incluye pg_cron  
**Solución:** pg_cron está disponible en todos los planes, pero verifica que tu plan lo soporte

### Edge Function retorna 401

**Causa:** Secret no configurado en Supabase Edge Function  
**Solución:** Verifica Paso 5, asegúrate de que `SNAPSHOT_SECRET` esté configurado

### Edge Function retorna 429 (Rate Limited)

**Causa:** Rate limiter bloqueando Edge Function  
**Solución:** Verifica que `isSupabaseEdgeFunction()` esté funcionando. El Edge Function debería tener `user-agent` con "Deno" y header `cf-ray`.

---

## Checklist Final

- [ ] SNAPSHOT_SECRET generado y guardado
- [ ] Variables de entorno agregadas a Vercel
- [ ] Vercel redeployado
- [ ] Supabase CLI instalado y logueado
- [ ] Edge Function deployado
- [ ] Secrets configurados en Supabase Edge Function
- [ ] Cron job creado en Supabase
- [ ] Cron job ejecutándose (verificar logs)
- [ ] Datos guardándose en Supabase (verificar tablas)
- [ ] Test manual del snapshot API funciona

---

## Próximos Pasos (Opcional)

1. **Monitoreo:** Configurar alertas en Supabase si el cron job falla
2. **Retención de Datos:** Agregar política de TTL para snapshots antiguos (90 días)
3. **Dashboard:** Crear visualización de snapshots históricos
4. **Alertas:** Configurar notificaciones si el rate limit se excede frecuentemente

---

*Última actualización: December 23, 2025*


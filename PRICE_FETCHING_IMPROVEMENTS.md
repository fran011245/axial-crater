# Mejoras en la Obtención de Precios USD

## Cambios Realizados

### 1. Mapeo de Tokens Conocidos a CoinGecko IDs

Se agregó un mapeo directo de símbolos comunes a CoinGecko IDs para obtener precios más confiables:

```javascript
const symbolToCoinGeckoId = {
    'ETH': 'ethereum',
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'PEPE': 'pepe',
    'SHIB': 'shiba-inu',
    'FLOKI': 'floki',
    'CHZ': 'chiliz',
    'PNK': 'kleros',
    // ... más tokens
};
```

**Ventajas:**
- Más rápido y confiable para tokens conocidos
- No depende de direcciones de contrato
- Evita problemas con tokens que tienen múltiples contratos

### 2. Estrategia Dual de Obtención de Precios

**Estrategia 1: Por CoinGecko ID (tokens conocidos)**
- Usa el mapeo de símbolos → CoinGecko IDs
- Más rápido y confiable
- Endpoint: `/api/v3/simple/price?ids={ids}&vs_currencies=usd`

**Estrategia 2: Por Dirección de Contrato (tokens desconocidos)**
- Usa direcciones de contrato de Etherscan
- Fallback para tokens no mapeados
- Endpoint: `/api/v3/simple/token_price/ethereum?contract_addresses={addresses}&vs_currencies=usd`

### 3. Mejoras en el Cálculo USD

El código ahora:
1. Obtiene precios de CoinGecko (por ID o contrato)
2. Multiplica volumen × precio para obtener USD
3. Calcula tanto `inVolumeUSD` como `outVolumeUSD`
4. Retorna valores en la respuesta JSON

**Cálculo:**
```javascript
outVolumeUSD: price ? outVolume * price : null
inVolumeUSD: price ? inVolume * price : null
```

### 4. Logging Mejorado

Se agregó logging para debugging:
```javascript
console.log(`Fetched prices for ${Object.keys(tokenPrices).length} tokens:`, Object.keys(tokenPrices));
```

---

## Cómo Funciona Ahora

### Flujo de Datos:

```
1. Obtener transacciones de Etherscan
   ↓
2. Procesar volúmenes IN/OUT por token
   ↓
3. Intentar obtener precios:
   a) Tokens conocidos → CoinGecko ID
   b) Tokens desconocidos → Dirección de contrato
   ↓
4. Calcular USD:
   - inVolumeUSD = inVolume × price
   - outVolumeUSD = outVolume × price
   ↓
5. Retornar datos con valores USD
   ↓
6. Frontend muestra USD si disponible, sino muestra raw amount
```

---

## Ejemplo de Respuesta Mejorada

**Antes:**
```json
{
    "symbol": "USDT",
    "volume": 142573363
}
```

**Ahora:**
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

---

## Display en Frontend

El componente `WalletMonitor` ya está configurado para:
1. **Priorizar USD**: Si `inVolumeUSD` o `outVolumeUSD` están disponibles, muestra `$X,XXX`
2. **Fallback a Raw**: Si no hay precio, muestra cantidad raw del token
3. **Formato**: Números formateados con comas (ej: `$1,234,567`)

**Código:**
```javascript
const formatVolume = (volume, usdVolume) => {
    if (usdVolume !== null && usdVolume !== undefined) {
        return `$${Math.floor(usdVolume).toLocaleString()}`;
    }
    return volume > 0 ? Math.floor(volume).toLocaleString() : '0';
};
```

---

## Tokens que Ahora Tienen Precios USD

Con el mapeo agregado, estos tokens deberían mostrar precios USD:

- ✅ **ETH** (Ethereum)
- ✅ **USDT** (Tether)
- ✅ **USDC** (USD Coin)
- ✅ **PEPE** (Pepe)
- ✅ **SHIB** (Shiba Inu)
- ✅ **FLOKI** (Floki)
- ✅ **CHZ** (Chiliz)
- ✅ **PNK** (Kleros)

Y cualquier otro token que CoinGecko tenga por dirección de contrato.

---

## Próximos Pasos

1. ✅ Código mejorado y probado
2. ⏳ Desplegar a producción
3. ⏳ Verificar que los precios se muestren correctamente
4. ⏳ Agregar más tokens al mapeo si es necesario

---

## Notas Técnicas

- **Cache**: Precios se cachean por 5 minutos (300 segundos)
- **Rate Limits**: CoinGecko tiene límites de rate, pero el cache ayuda
- **Fallback**: Si CoinGecko falla, se muestran valores raw
- **Límite**: Máximo 100 direcciones de contrato por request



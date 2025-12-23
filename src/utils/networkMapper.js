/**
 * Infers network name from token name
 * Note: Index 11 in the API response is confirmation count, not network ID
 * Therefore we must infer the network from the token name
 */
export function getNetworkName(networkId, tokenName) {
    // Always infer from token name since index 11 is confirmation count, not network ID
    return inferNetworkFromName(tokenName);
}

/**
 * Infers network name from token name
 */
function inferNetworkFromName(tokenName) {
    if (!tokenName) return 'Unknown Network';

    const name = tokenName.toUpperCase();

    // Direct network matches
    if (name.includes('BITCOIN') || name === 'BTC') return 'Bitcoin Network';
    if (name.includes('ETHEREUM') || name === 'ETH' || name === 'ETHEREUMC') return 'Ethereum Network';
    if (name.includes('LITECOIN') || name === 'LTC') return 'Litecoin Network';
    if (name.includes('RIPPLE') || name === 'XRP') return 'Ripple Network';
    if (name.includes('XLM') || name === 'STELLAR') return 'Stellar Network';
    if (name.includes('TRON') || name === 'TRX') return 'Tron Network';
    if (name.includes('POLKADOT') || name === 'DOT') return 'Polkadot Network';
    if (name.includes('SOLANA') || name === 'SOL' || name.includes('USDT') && name.includes('SOL')) return 'Solana Network';
    if (name.includes('AVALANCHE') || name === 'AVAX' || name.includes('USDT') && name.includes('AVAX')) return 'Avalanche Network';
    if (name.includes('NEAR') || name.includes('USDT') && name.includes('NEAR')) return 'NEAR Network';
    if (name.includes('TON') || name.includes('USDT') && name.includes('TON')) return 'TON Network';
    if (name.includes('POLYGON') || name === 'POL' || name.includes('USDT') && name.includes('POL')) return 'Polygon Network';
    if (name.includes('ARBITRUM') || name === 'ARB' || name.includes('USDT') && name.includes('ARB')) return 'Arbitrum Network';
    if (name.includes('OPTIMISM') || name === 'OPX' || name.includes('USDT') && name.includes('OPX')) return 'Optimism Network';
    if (name.includes('CELO') || name.includes('USDT') && name.includes('CELO')) return 'Celo Network';
    if (name.includes('KAVA') || name.includes('USDT') && name.includes('KAVA')) return 'Kava Network';
    if (name.includes('APTOS') || name === 'APT' || name.includes('USDT') && name.includes('APT')) return 'Aptos Network';
    if (name.includes('CARDANO') || name === 'ADA') return 'Cardano Network';
    if (name.includes('ZCASH') || name === 'ZEC') return 'Zcash Network';
    if (name.includes('MONERO') || name === 'XMR') return 'Monero Network';
    if (name.includes('DASH') || name === 'DASH') return 'Dash Network';
    if (name.includes('EOS') || name === 'EOS') return 'EOS Network';
    if (name.includes('IOTA') || name === 'IOTA') return 'IOTA Network';
    if (name.includes('NEO') || name === 'NEO') return 'NEO Network';

    // Tether variants - check for network indicators
    if (name.includes('TETHER')) {
        if (name.includes('SOL') || name.includes('SOL')) return 'Solana Network';
        if (name.includes('AVAX') || name.includes('AVALANCHE')) return 'Avalanche Network';
        if (name.includes('TON')) return 'TON Network';
        if (name.includes('NEAR')) return 'NEAR Network';
        if (name.includes('DOT') || name.includes('POLKADOT')) return 'Polkadot Network';
        if (name.includes('KAVA')) return 'Kava Network';
        if (name.includes('CELO')) return 'Celo Network';
        if (name.includes('APT') || name.includes('APTOS')) return 'Aptos Network';
        if (name.includes('XTZ') || name.includes('TEZOS')) return 'Tezos Network';
        if (name.includes('XPL')) return 'XPL Network';
        if (name.includes('POL') || name.includes('POLYGON')) return 'Polygon Network';
        if (name.includes('ARB') || name.includes('ARBITRUM')) return 'Arbitrum Network';
        if (name.includes('OPX') || name.includes('OPTIMISM')) return 'Optimism Network';
        if (name.includes('KAIA')) return 'Kaia Network';
        // Default Tether to Ethereum
        return 'Ethereum Network';
    }

    return 'Unknown Network';
}


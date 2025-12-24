"use client";

import { useState, useMemo } from 'react';
import { Search, X, Pin } from 'lucide-react';
import styles from '../../app/terminal/terminal.module.css';

// Helper function to get Bitfinex trading URL
const getBitfinexTradingUrl = (symbol, pairUrlMap) => {
    // Si tenemos el mapa de la API, usarlo directamente
    if (pairUrlMap && pairUrlMap[symbol]) {
        return `https://trading.bitfinex.com/t/${pairUrlMap[symbol]}?type=exchange`;
    }
    
    // Si el símbolo ya tiene dos puntos, usarlo directamente (evitar doble procesamiento)
    if (symbol.includes(':')) {
        return `https://trading.bitfinex.com/t/${symbol}?type=exchange`;
    }
    
    // Fallback: construir manualmente si no tenemos el mapa
    if (symbol.endsWith('USD')) {
        const base = symbol.slice(0, -3);
        return `https://trading.bitfinex.com/t/${base}:USD?type=exchange`;
    } else if (symbol.endsWith('UST')) {
        const base = symbol.slice(0, -3);
        return `https://trading.bitfinex.com/t/${base}:UST?type=exchange`;
    }
    
    // Último fallback
    return `https://trading.bitfinex.com/t/${symbol}?type=exchange`;
};

export const NetworkVitals = ({ status, volume, isClassicTheme = false }) => {
    return (
        <section className={styles.sectorA} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
            <div className={styles.panelTitle}>{">> NETWORK_VITALS"}</div>
            <div className={styles.bigStat}>
                <span className={styles.label}>EXCHANGE_STATE</span>
                <span className={status?.status === 'Operational' ? styles.valueOk : styles.valueErr}>
                    [{status?.status?.toUpperCase() || "---"}]
                </span>
            </div>
            <div className={styles.bigStat}>
                <span className={styles.label}>VOL_24H [USD]</span>
                <span className={styles.value}>
                    {volume?.totalVolumeUSD ? Math.floor(volume.totalVolumeUSD).toLocaleString() : '---'}
                </span>
            </div>
            <div className={styles.bigStat}>
                <span className={styles.label}>ACTIVE_PAIRS</span>
                <span className={styles.value}>{volume?.tickerCount || 0}</span>
            </div>
        </section>
    );
};


export const LiquidityRiskMonitor = ({ volume, isClassicTheme = false }) => {
    const [illiquidSearch, setIlliquidSearch] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [sortByTicker, setSortByTicker] = useState(null);
    const [sortBySpread, setSortBySpread] = useState(null);
    const [sortBy24HVol, setSortBy24HVol] = useState(null);
    const [sortBy7DVol, setSortBy7DVol] = useState(null);

    const fmtVol = (val) => {
        if (!val || val === 0) return '---';
        if (val >= 1000000000) return (val / 1000000000).toFixed(1) + 'B';
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
        return Math.floor(val).toLocaleString();
    };

    const handleSort = (column) => {
        // Reset all other sorts
        setSortByTicker(null);
        setSortBySpread(null);
        setSortBy24HVol(null);
        setSortBy7DVol(null);

        // Handle the clicked column
        if (column === 'ticker') {
            if (sortByTicker === null) setSortByTicker('desc');
            else if (sortByTicker === 'desc') setSortByTicker('asc');
            else setSortByTicker(null);
        } else if (column === 'spread') {
            if (sortBySpread === null) setSortBySpread('desc');
            else if (sortBySpread === 'desc') setSortBySpread('asc');
            else setSortBySpread(null);
        } else if (column === '24hvol') {
            if (sortBy24HVol === null) setSortBy24HVol('desc');
            else if (sortBy24HVol === 'desc') setSortBy24HVol('asc');
            else setSortBy24HVol(null);
        } else if (column === '7dvol') {
            if (sortBy7DVol === null) setSortBy7DVol('desc');
            else if (sortBy7DVol === 'desc') setSortBy7DVol('asc');
            else setSortBy7DVol(null);
        }
    };

    const sortedPairs = useMemo(() => {
        if (!volume?.lowPairs) return [];
        const filtered = volume.lowPairs.filter(p => !illiquidSearch || p.symbol.includes(illiquidSearch.toUpperCase()));
        
        if (!sortByTicker && !sortBySpread && !sortBy24HVol && !sortBy7DVol) {
            return filtered; // Default: no sort
        }
        
        return [...filtered].sort((a, b) => {
            if (sortByTicker) {
                return sortByTicker === 'desc' 
                    ? b.symbol.localeCompare(a.symbol)
                    : a.symbol.localeCompare(b.symbol);
            }
            if (sortBySpread) {
                const spreadA = a.spreadPercent || 0;
                const spreadB = b.spreadPercent || 0;
                return sortBySpread === 'desc' ? spreadB - spreadA : spreadA - spreadB;
            }
            if (sortBy24HVol) {
                return sortBy24HVol === 'desc' 
                    ? (b.volumeUSD || 0) - (a.volumeUSD || 0)
                    : (a.volumeUSD || 0) - (b.volumeUSD || 0);
            }
            if (sortBy7DVol) {
                return sortBy7DVol === 'desc' 
                    ? (b.vol7d || 0) - (a.vol7d || 0)
                    : (a.vol7d || 0) - (b.vol7d || 0);
            }
            return 0;
        });
    }, [volume?.lowPairs, illiquidSearch, sortByTicker, sortBySpread, sortBy24HVol, sortBy7DVol]);

    return (
        <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.warningHeader}>
                {isSearchOpen ? (
                    <div className={styles.searchContainer}>
                        <input
                            autoFocus
                            type="text"
                            className={styles.searchInput}
                            value={illiquidSearch}
                            onChange={(e) => setIlliquidSearch(e.target.value)}
                            onBlur={() => !illiquidSearch && setIsSearchOpen(false)}
                            placeholder="FILTER_RISK..."
                        />
                        <X
                            size={14}
                            className={styles.iconBtn}
                            onClick={() => {
                                setIlliquidSearch("");
                                setIsSearchOpen(false);
                            }}
                        />
                    </div>
                ) : (
                    <>
                        <span className={styles.warningTitle}>{">> LIQUIDITY_RISK_MONITOR"}</span>
                        <Search
                            size={14}
                            className={styles.iconBtn}
                            onClick={() => setIsSearchOpen(true)}
                        />
                    </>
                )}
            </div>
            <div className={styles.warningGrid}>
                <div className={styles.warningHeaderRow}>
                    <span className={styles.warningHeaderSortable} onClick={() => handleSort('ticker')}>
                        TICKER
                        {sortByTicker && <span className={styles.sortArrow}>{sortByTicker === 'desc' ? '↓' : '↑'}</span>}
                    </span>
                    <span className={styles.warningHeaderSortable} onClick={() => handleSort('spread')}>
                        SPREAD
                        {sortBySpread && <span className={styles.sortArrow}>{sortBySpread === 'desc' ? '↓' : '↑'}</span>}
                    </span>
                    <span className={styles.warningHeaderSortable} onClick={() => handleSort('24hvol')}>
                        24H_VOL
                        {sortBy24HVol && <span className={styles.sortArrow}>{sortBy24HVol === 'desc' ? '↓' : '↑'}</span>}
                    </span>
                    <span className={styles.warningHeaderSortable} onClick={() => handleSort('7dvol')}>
                        7D_VOL
                        {sortBy7DVol && <span className={styles.sortArrow}>{sortBy7DVol === 'desc' ? '↓' : '↑'}</span>}
                    </span>
                </div>
                <div className={styles.warningList} style={{ flex: 1, overflow: 'auto' }}>
                    {sortedPairs.length > 0 ? (
                        sortedPairs.map(p => (
                            <div key={p.symbol} className={styles.warningRow}>
                                <span 
                                    className={styles.warnSymbol}
                                    onClick={() => window.open(
                                        getBitfinexTradingUrl(p.symbol, volume?.pairUrlMap), 
                                        '_blank', 
                                        'noopener,noreferrer'
                                    )}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {p.symbol}
                                </span>
                                <span className={styles.warnVol}>
                                    {p.spreadPercent !== undefined ? `${p.spreadPercent.toFixed(1)}%` : '---'}
                                </span>
                                <span className={styles.warnVol}>
                                    {p.volumeUSD ? `$${fmtVol(p.volumeUSD)}` : '---'}
                                </span>
                                <span className={styles.warnVol}>
                                    {fmtVol(p.vol7d)}
                                </span>
                            </div>
                        ))
                    ) : (
                        <div className={styles.warningRow} style={{ justifyContent: 'center', color: isClassicTheme ? '#888' : '#8b949e' }}>LOADING...</div>
                    )}
                    {volume?.lowPairs && sortedPairs.length === 0 && (
                        <div className={styles.warningRow} style={{ justifyContent: 'center', color: isClassicTheme ? '#ff5555' : '#f85149' }}>NO RISK DATA</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const MarketScanner = ({ volume, movements, isClassicTheme = false }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [sortBySymbol, setSortBySymbol] = useState(null);
    const [sortByLast, setSortByLast] = useState(null);
    const [sortBySD, setSortBySD] = useState(null);
    const [sortBySpread, setSortBySpread] = useState(null);
    const [sortBy24HVol, setSortBy24HVol] = useState(null);
    const [sortBy7DVol, setSortBy7DVol] = useState(null);
    const [sortBy30DVol, setSortBy30DVol] = useState(null);
    const [sortByD, setSortByD] = useState(null);
    const [sortByW, setSortByW] = useState(null);

    const getMovementStatus = (pairSymbol) => {
        const base = pairSymbol.replace('USD', '').replace('UST', '');
        const mv = movements.find(m => m.symbol === base || m.name === base);
        return {
            d: mv ? (mv.deposit === 'Active' ? 'OK' : 'CLSD') : 'NA',
            w: mv ? (mv.withdrawal === 'Active' ? 'OK' : 'CLSD') : 'NA'
        };
    };

    const fmtVals = (val) => {
        if (!val) return '---';
        if (val > 1000000000) return (val / 1000000000).toFixed(1) + 'B';
        if (val > 1000000) return (val / 1000000).toFixed(1) + 'M';
        return Math.floor(val).toLocaleString();
    }

    const handleSort = (column) => {
        // Reset all other sorts
        setSortBySymbol(null);
        setSortByLast(null);
        setSortBySD(null);
        setSortBySpread(null);
        setSortBy24HVol(null);
        setSortBy7DVol(null);
        setSortBy30DVol(null);
        setSortByD(null);
        setSortByW(null);

        // Handle the clicked column
        if (column === 'symbol') {
            if (sortBySymbol === null) setSortBySymbol('desc');
            else if (sortBySymbol === 'desc') setSortBySymbol('asc');
            else setSortBySymbol(null);
        } else if (column === 'last') {
            if (sortByLast === null) setSortByLast('desc');
            else if (sortByLast === 'desc') setSortByLast('asc');
            else setSortByLast(null);
        } else if (column === 'sd') {
            if (sortBySD === null) setSortBySD('desc');
            else if (sortBySD === 'desc') setSortBySD('asc');
            else setSortBySD(null);
        } else if (column === 'spread') {
            if (sortBySpread === null) setSortBySpread('desc');
            else if (sortBySpread === 'desc') setSortBySpread('asc');
            else setSortBySpread(null);
        } else if (column === '24hvol') {
            if (sortBy24HVol === null) setSortBy24HVol('desc');
            else if (sortBy24HVol === 'desc') setSortBy24HVol('asc');
            else setSortBy24HVol(null);
        } else if (column === '7dvol') {
            if (sortBy7DVol === null) setSortBy7DVol('desc');
            else if (sortBy7DVol === 'desc') setSortBy7DVol('asc');
            else setSortBy7DVol(null);
        } else if (column === '30dvol') {
            if (sortBy30DVol === null) setSortBy30DVol('desc');
            else if (sortBy30DVol === 'desc') setSortBy30DVol('asc');
            else setSortBy30DVol(null);
        } else if (column === 'd') {
            if (sortByD === null) setSortByD('desc');
            else if (sortByD === 'desc') setSortByD('asc');
            else setSortByD(null);
        } else if (column === 'w') {
            if (sortByW === null) setSortByW('desc');
            else if (sortByW === 'desc') setSortByW('asc');
            else setSortByW(null);
        }
    };

    // Filter pairs based on search query, limit to 12 when not searching
    const filteredPairs = volume?.topPairs
        ? volume.topPairs
            .filter(p => !searchQuery || p.symbol.includes(searchQuery.toUpperCase()))
            .slice(0, searchQuery ? undefined : 12)
        : [];

    const sortedPairs = useMemo(() => {
        let sorted = [...filteredPairs];
        
        // Determine which column is active
        const activeSort = sortBySymbol || sortByLast || sortBySD || sortBySpread || sortBy24HVol || 
                          sortBy7DVol || sortBy30DVol || sortByD || sortByW;
        
        if (!activeSort) return sorted;
        
        sorted.sort((a, b) => {
            const stA = getMovementStatus(a.symbol);
            const stB = getMovementStatus(b.symbol);
            
            // Status order: OK > CLSD > NA
            const statusOrder = { 'OK': 3, 'CLSD': 2, 'NA': 1 };
            
            if (sortBySymbol) {
                return sortBySymbol === 'desc' 
                    ? b.symbol.localeCompare(a.symbol)
                    : a.symbol.localeCompare(b.symbol);
            }
            if (sortByLast) {
                return sortByLast === 'desc' ? b.lastPrice - a.lastPrice : a.lastPrice - b.lastPrice;
            }
            if (sortBySD) {
                return sortBySD === 'desc' ? b.change - a.change : a.change - b.change;
            }
            if (sortBySpread) {
                const spreadA = a.spreadPercent || 0;
                const spreadB = b.spreadPercent || 0;
                return sortBySpread === 'desc' ? spreadB - spreadA : spreadA - spreadB;
            }
            if (sortBy24HVol) {
                return sortBy24HVol === 'desc' 
                    ? (b.volumeUSD || 0) - (a.volumeUSD || 0) 
                    : (a.volumeUSD || 0) - (b.volumeUSD || 0);
            }
            if (sortBy7DVol) {
                return sortBy7DVol === 'desc' 
                    ? (b.vol7d || 0) - (a.vol7d || 0) 
                    : (a.vol7d || 0) - (b.vol7d || 0);
            }
            if (sortBy30DVol) {
                return sortBy30DVol === 'desc' 
                    ? (b.vol30d || 0) - (a.vol30d || 0) 
                    : (a.vol30d || 0) - (b.vol30d || 0);
            }
            if (sortByD) {
                const orderA = statusOrder[stA.d] || 0;
                const orderB = statusOrder[stB.d] || 0;
                return sortByD === 'desc' ? orderB - orderA : orderA - orderB;
            }
            if (sortByW) {
                const orderA = statusOrder[stA.w] || 0;
                const orderB = statusOrder[stB.w] || 0;
                return sortByW === 'desc' ? orderB - orderA : orderA - orderB;
            }
            
            return 0;
        });
        
        return sorted;
    }, [filteredPairs, sortBySymbol, sortByLast, sortBySD, sortBySpread, sortBy24HVol, sortBy7DVol, sortBy30DVol, sortByD, sortByW, movements]);

    return (
        <section className={styles.sectorB} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.warningHeader}>
                {isSearchOpen ? (
                    <div className={styles.searchContainer}>
                        <input
                            autoFocus
                            type="text"
                            className={styles.searchInput}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onBlur={() => !searchQuery && setIsSearchOpen(false)}
                            placeholder="SEARCH_PAIRS..."
                        />
                        <X
                            size={14}
                            className={styles.iconBtn}
                            onClick={() => {
                                setSearchQuery("");
                                setIsSearchOpen(false);
                            }}
                        />
                    </div>
                ) : (
                    <>
                        <span className={styles.warningTitle}>{">> MARKET_SCANNERS"}</span>
                        <Search
                            size={14}
                            className={styles.iconBtn}
                            onClick={() => setIsSearchOpen(true)}
                        />
                    </>
                )}
            </div>
            <div className={styles.tableHeader}>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('symbol')}>
                    SYMBOL
                    {sortBySymbol && <span className={styles.sortArrow}>{sortBySymbol === 'desc' ? '↓' : '↑'}</span>}
                </span>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('last')}>
                    LAST
                    {sortByLast && <span className={styles.sortArrow}>{sortByLast === 'desc' ? '↓' : '↑'}</span>}
                </span>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('sd')}>
                    SD
                    {sortBySD && <span className={styles.sortArrow}>{sortBySD === 'desc' ? '↓' : '↑'}</span>}
                </span>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('spread')}>
                    SPREAD
                    {sortBySpread && <span className={styles.sortArrow}>{sortBySpread === 'desc' ? '↓' : '↑'}</span>}
                </span>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('24hvol')}>
                    24H_VOL
                    {sortBy24HVol && <span className={styles.sortArrow}>{sortBy24HVol === 'desc' ? '↓' : '↑'}</span>}
                </span>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('7dvol')}>
                    7D_VOL
                    {sortBy7DVol && <span className={styles.sortArrow}>{sortBy7DVol === 'desc' ? '↓' : '↑'}</span>}
                </span>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('30dvol')}>
                    30D_VOL
                    {sortBy30DVol && <span className={styles.sortArrow}>{sortBy30DVol === 'desc' ? '↓' : '↑'}</span>}
                </span>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('d')}>
                    D
                    {sortByD && <span className={styles.sortArrow}>{sortByD === 'desc' ? '↓' : '↑'}</span>}
                </span>
                <span className={styles.tableHeaderSortable} onClick={() => handleSort('w')}>
                    W
                    {sortByW && <span className={styles.sortArrow}>{sortByW === 'desc' ? '↓' : '↑'}</span>}
                </span>
            </div>
            <div className={styles.scrollList} style={{ flex: 1, overflow: 'auto' }}>
                {sortedPairs.length > 0 ? (
                    sortedPairs.map((p) => {
                        const st = getMovementStatus(p.symbol);
                        return (
                            <div key={p.symbol} className={styles.tableRow}>
                                <span 
                                    className={styles.colSymbol}
                                    onClick={() => window.open(
                                        getBitfinexTradingUrl(p.symbol, volume?.pairUrlMap), 
                                        '_blank', 
                                        'noopener,noreferrer'
                                    )}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {p.symbol}
                                </span>
                                <span className={styles.colPrice}>{p.lastPrice.toFixed(2)}</span>
                                <span className={p.change >= 0 ? styles.gain : styles.loss}>
                                    {p.change > 0 ? '+' : ''}{(p.change * 100).toFixed(2)}%
                                </span>
                                <span className={styles.colVol}>
                                    {p.spreadPercent !== undefined ? `${p.spreadPercent.toFixed(2)}%` : '---'}
                                </span>
                                <span className={styles.colVol}>{fmtVals(p.volumeUSD)}</span>
                                <span className={styles.colVol}>{fmtVals(p.vol7d)}</span>
                                <span className={styles.colVol}>{fmtVals(p.vol30d)}</span>
                                <span className={
                                    st.d === 'OK' ? styles.statusOk : 
                                    st.d === 'CLSD' ? styles.statusErr : 
                                    styles.statusNa
                                }>{st.d}</span>
                                <span className={
                                    st.w === 'OK' ? styles.statusOk : 
                                    st.w === 'CLSD' ? styles.statusErr : 
                                    styles.statusNa
                                }>{st.w}</span>
                            </div>
                        );
                    })
                ) : (
                    <div className={styles.tableRow} style={{ justifyContent: 'center', color: isClassicTheme ? '#888' : '#8b949e' }}>
                        {searchQuery ? 'NO MATCHES' : 'LOADING...'}
                    </div>
                )}
            </div>
        </section>
    );
};

export const WalletMonitor = ({ walletData, isClassicTheme = false }) => {
    const [sortByInVolume, setSortByInVolume] = useState(null); // 'desc' | 'asc' | null
    const [sortByOutVolume, setSortByOutVolume] = useState(null); // 'desc' | 'asc' | null

    const handleSort = (column) => {
        if (column === 'in') {
            if (sortByInVolume === null) {
                setSortByInVolume('desc');
                setSortByOutVolume(null);
            } else if (sortByInVolume === 'desc') {
                setSortByInVolume('asc');
            } else {
                setSortByInVolume(null); // Volver a orden original
            }
        } else if (column === 'out') {
            if (sortByOutVolume === null) {
                setSortByOutVolume('desc');
                setSortByInVolume(null);
            } else if (sortByOutVolume === 'desc') {
                setSortByOutVolume('asc');
            } else {
                setSortByOutVolume(null); // Volver a orden original
            }
        }
    };

    const sortedTokens = useMemo(() => {
        if (!walletData?.topTokens || walletData.topTokens.length === 0) {
            return [];
        }

        const tokens = [...walletData.topTokens];
        
        // Separar ETH si tiene volumen
        const ethToken = tokens.find(t => t.symbol === 'ETH' && ((t.outVolume || 0) + (t.inVolume || 0) > 0));
        const otherTokens = tokens.filter(t => t.symbol !== 'ETH' || ((t.outVolume || 0) + (t.inVolume || 0) === 0));
        
        // Ordenar otros tokens según la columna seleccionada
        if (sortByInVolume) {
            otherTokens.sort((a, b) => {
                const valA = a.inVolumeUSD || a.inVolume || 0;
                const valB = b.inVolumeUSD || b.inVolume || 0;
                return sortByInVolume === 'desc' ? valB - valA : valA - valB;
            });
        } else if (sortByOutVolume) {
            otherTokens.sort((a, b) => {
                const valA = a.outVolumeUSD || a.outVolume || 0;
                const valB = b.outVolumeUSD || b.outVolume || 0;
                return sortByOutVolume === 'desc' ? valB - valA : valA - valB;
            });
        } else {
            // Default: ordenar por volumen IN descendente (mayor a menor)
            otherTokens.sort((a, b) => {
                const valA = a.inVolumeUSD || a.inVolume || 0;
                const valB = b.inVolumeUSD || b.inVolume || 0;
                return valB - valA;
            });
        }
        
        // ETH primero si existe, luego los demás
        return ethToken ? [ethToken, ...otherTokens] : otherTokens;
    }, [walletData?.topTokens, sortByInVolume, sortByOutVolume]);

    return (
        <section className={styles.sectorW} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.warningHeader}>
                <span className={styles.warningTitle}>{">> HOT_WALLET_FLOWS [ETH]"}</span>
                <div className={styles.walletStatus}>
                    <span className={styles.label}>STATE:</span>
                    <span className={walletData?.status === 'WARNING' ? styles.statusWarn : styles.statusOk}>
                        {walletData?.status === 'WARNING' ? `PENDING (${walletData.pendingCount})` : 'OK'}
                    </span>
                </div>
            </div>
            <div className={styles.walletGrid}>
                <div className={styles.walletHeaderRow}>
                    <span>TOKEN_SYM</span>
                    <span 
                        className={styles.walletHeaderSortable}
                        onClick={() => handleSort('in')}
                    >
                        IN_VOL_24H
                        {sortByInVolume && (
                            <span className={styles.sortArrow}>
                                {sortByInVolume === 'desc' ? '↓' : '↑'}
                            </span>
                        )}
                    </span>
                    <span 
                        className={styles.walletHeaderSortable}
                        onClick={() => handleSort('out')}
                    >
                        OUT_VOL_24H
                        {sortByOutVolume && (
                            <span className={styles.sortArrow}>
                                {sortByOutVolume === 'desc' ? '↓' : '↑'}
                            </span>
                        )}
                    </span>
                </div>
                <div className={styles.walletList}>
                    {sortedTokens.length > 0 ? (
                        sortedTokens.map(t => {
                            // Format volumes: show USD if available, otherwise raw token amount
                            const formatVolume = (volume, usdVolume) => {
                                if (usdVolume !== null && usdVolume !== undefined) {
                                    return `$${Math.floor(usdVolume).toLocaleString()}`;
                                }
                                return volume > 0 ? Math.floor(volume).toLocaleString() : '0';
                            };

                            const inDisplay = formatVolume(t.inVolume || 0, t.inVolumeUSD);
                            const outDisplay = formatVolume(t.outVolume || 0, t.outVolumeUSD);

                            return (
                                <div key={t.symbol} className={styles.walletRow}>
                                    <span className={styles.walletSymbol}>
                                        {t.symbol}
                                        {t.symbol === 'ETH' && (
                                            <Pin size={10} className={styles.pinIcon} />
                                        )}
                                    </span>
                                    <span className={styles.walletVol}>{inDisplay}</span>
                                    <span className={styles.walletVol}>{outDisplay}</span>
                                </div>
                            );
                        })
                    ) : (
                        <div className={styles.walletRow} style={{ justifyContent: 'center', color: isClassicTheme ? '#666' : '#6e7681' }}>SCANNING / NO DATA</div>
                    )}
                </div>
            </div>
        </section>
    );
};

export const StatusFeed = ({ movements, onTokenClick, isClassicTheme = false }) => {
    const [movementSearch, setMovementSearch] = useState("");
    const [isMovementSearchOpen, setIsMovementSearchOpen] = useState(false);

    const handleTokenClick = (token) => {
        if (onTokenClick) {
            onTokenClick(token);
        }
    };

    return (
        <section className={styles.sectorC} style={{ height: '100%', width: '100%' }}>
            <div className={styles.sectorHeader}>
                {isMovementSearchOpen ? (
                    <div className={styles.searchContainer}>
                        <input
                            autoFocus
                            type="text"
                            className={styles.searchInputOrange}
                            value={movementSearch}
                            onChange={(e) => setMovementSearch(e.target.value)}
                            onBlur={() => !movementSearch && setIsMovementSearchOpen(false)}
                            placeholder="CMD: FIND_ASSET..."
                        />
                        <X
                            size={14}
                            className={styles.iconBtn}
                            onClick={() => {
                                setMovementSearch("");
                                setIsMovementSearchOpen(false);
                            }}
                        />
                    </div>
                ) : (
                    <>
                        <span className={styles.headerTitle}>{">> DEP/WD_STATUS_FEED"}</span>
                        <Search
                            size={14}
                            className={styles.iconBtn}
                            onClick={() => setIsMovementSearchOpen(true)}
                        />
                    </>
                )}
            </div>
            <div className={styles.denseGrid}>
                {movements
                    .filter(m => !movementSearch || (m.symbol && m.symbol.includes(movementSearch.toUpperCase())) || (m.name && m.name.toUpperCase().includes(movementSearch.toUpperCase())))
                    .map((m, i) => {
                        const isDepositOk = m.deposit === 'Active';
                        const isWithdrawalOk = m.withdrawal === 'Active';
                        const bothOk = isDepositOk && isWithdrawalOk;
                        
                        // Colors based on theme
                        const greenColor = isClassicTheme ? '#00ff00' : '#3fb950';
                        const redColor = isClassicTheme ? '#ff3333' : '#f85149';
                        
                        return (
                            <div 
                                key={i} 
                                className={styles.miniTag} 
                                data-status={bothOk ? 'ok' : 'err'}
                                onClick={() => handleTokenClick(m)}
                                style={{ cursor: 'pointer' }}
                            >
                                {m.symbol || m.name}: {bothOk ? 'OK' : (
                                    <>
                                        <span style={{ color: isDepositOk ? greenColor : redColor }}>D</span>
                                        {' '}
                                        <span style={{ color: isWithdrawalOk ? greenColor : redColor }}>W</span>
                                    </>
                                )}
                            </div>
                        )
                    })}
            </div>
        </section>
    );
};

export const FundingStats = ({ funding, isClassicTheme = false }) => {
    const [fundingSearch, setFundingSearch] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const fmtVol = (val) => {
        if (!val || val === 0) return '---';
        if (val >= 1000000000) return (val / 1000000000).toFixed(1) + 'B';
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
        return Math.floor(val).toLocaleString();
    };

    const filteredFunding = useMemo(() => {
        if (!funding?.fundingStats) return [];
        return funding.fundingStats.filter(f => 
            !fundingSearch || f.symbol.includes(fundingSearch.toUpperCase())
        );
    }, [funding?.fundingStats, fundingSearch]);

    return (
        <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.warningHeader}>
                {isSearchOpen ? (
                    <div className={styles.searchContainer}>
                        <input
                            autoFocus
                            type="text"
                            className={styles.searchInput}
                            value={fundingSearch}
                            onChange={(e) => setFundingSearch(e.target.value)}
                            onBlur={() => !fundingSearch && setIsSearchOpen(false)}
                            placeholder="FILTER_FUNDING..."
                        />
                        <X
                            size={14}
                            className={styles.iconBtn}
                            onClick={() => {
                                setFundingSearch("");
                                setIsSearchOpen(false);
                            }}
                        />
                    </div>
                ) : (
                    <>
                        <span className={styles.warningTitle}>{">> FUNDING_STATS"}</span>
                        <Search
                            size={14}
                            className={styles.iconBtn}
                            onClick={() => setIsSearchOpen(true)}
                        />
                    </>
                )}
            </div>
            <div className={styles.fundingGridContainer}>
                <div className={styles.fundingHeaderRow}>
                    <span>TICKER</span>
                    <span>APR 1H</span>
                    <span>24H_VOL</span>
                </div>
                <div className={styles.fundingList}>
                    {filteredFunding.length > 0 ? (
                        filteredFunding.map(f => (
                            <div key={f.symbol} className={styles.fundingRow}>
                                <span className={styles.fundingSymbol}>{f.symbol}</span>
                                <span className={f.apr1h >= 0 ? styles.aprPositive : styles.aprNegative}>
                                    {f.apr1h >= 0 ? '+' : ''}{f.apr1h.toFixed(2)}%
                                </span>
                                <span className={styles.fundingVol}>${fmtVol(f.volume24h)}</span>
                            </div>
                        ))
                    ) : (
                        <div className={styles.fundingRow} style={{ justifyContent: 'center', color: isClassicTheme ? '#888' : '#8b949e' }}>
                            {funding?.fundingStats ? 'NO DATA' : 'LOADING...'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

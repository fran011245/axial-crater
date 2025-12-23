"use client";

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import styles from '../../app/terminal/terminal.module.css';

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
            <div className={styles.warningList} style={{ flex: 1, overflow: 'auto' }}>
                {volume?.lowPairs ? (
                    volume.lowPairs
                        .filter(p => !illiquidSearch || p.symbol.includes(illiquidSearch.toUpperCase()))
                        .map(p => (
                            <div key={p.symbol} className={styles.warningRow}>
                                <span className={styles.warnSymbol}>{p.symbol}</span>
                                <span className={styles.warnVol}>${Math.floor(p.volumeUSD).toLocaleString()}</span>
                            </div>
                        ))
                ) : (
                    <div className={styles.warningRow} style={{ justifyContent: 'center', color: isClassicTheme ? '#888' : '#8b949e' }}>LOADING...</div>
                )}
                {volume?.lowPairs && volume.lowPairs.filter(p => !illiquidSearch || p.symbol.includes(illiquidSearch.toUpperCase())).length === 0 && (
                    <div className={styles.warningRow} style={{ justifyContent: 'center', color: isClassicTheme ? '#ff5555' : '#f85149' }}>NO RISK DATA</div>
                )}
            </div>
        </div>
    );
};

export const MarketScanner = ({ volume, movements, isClassicTheme = false }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    const getMovementStatus = (pairSymbol) => {
        const base = pairSymbol.replace('USD', '').replace('UST', '');
        const mv = movements.find(m => m.symbol === base || m.name === base);
        return {
            d: mv ? (mv.deposit === 'Active' ? 'OK' : 'ERR') : 'UNK',
            w: mv ? (mv.withdrawal === 'Active' ? 'OK' : 'ERR') : 'UNK'
        };
    };

    const fmtVals = (val) => {
        if (!val) return '---';
        if (val > 1000000000) return (val / 1000000000).toFixed(1) + 'B';
        if (val > 1000000) return (val / 1000000).toFixed(1) + 'M';
        return Math.floor(val).toLocaleString();
    }

    // Filter pairs based on search query, limit to 12 when not searching
    const filteredPairs = volume?.topPairs
        ? volume.topPairs
            .filter(p => !searchQuery || p.symbol.includes(searchQuery.toUpperCase()))
            .slice(0, searchQuery ? undefined : 12)
        : [];

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
                <span>SYMBOL</span>
                <span>LAST</span>
                <span>SD</span>
                <span>24H_VOL</span>
                <span>7D_VOL</span>
                <span>30D_VOL</span>
                <span>D</span>
                <span>W</span>
            </div>
            <div className={styles.scrollList} style={{ flex: 1, overflow: 'auto' }}>
                {filteredPairs.length > 0 ? (
                    filteredPairs.map((p) => {
                        const st = getMovementStatus(p.symbol);
                        return (
                            <div key={p.symbol} className={styles.tableRow}>
                                <span className={styles.colSymbol}>{p.symbol}</span>
                                <span className={styles.colPrice}>{p.lastPrice.toFixed(2)}</span>
                                <span className={p.change >= 0 ? styles.gain : styles.loss}>
                                    {p.change > 0 ? '+' : ''}{(p.change * 100).toFixed(2)}%
                                </span>
                                <span className={styles.colVol}>{fmtVals(p.volumeUSD)}</span>
                                <span className={styles.colVol}>{fmtVals(p.vol7d)}</span>
                                <span className={styles.colVol}>{fmtVals(p.vol30d)}</span>
                                <span className={st.d === 'OK' ? styles.statusOk : styles.statusErr}>{st.d}</span>
                                <span className={st.w === 'OK' ? styles.statusOk : styles.statusErr}>{st.w}</span>
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
                    <span>IN_VOL_24H</span>
                    <span>OUT_VOL_24H</span>
                </div>
                <div className={styles.walletList}>
                    {walletData?.topTokens && walletData.topTokens.length > 0 ? (
                        walletData.topTokens.map(t => {
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
                                    <span className={styles.walletSymbol}>{t.symbol}</span>
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
                        const isOk = m.deposit === 'Active' && m.withdrawal === 'Active';
                        return (
                            <div 
                                key={i} 
                                className={styles.miniTag} 
                                data-status={isOk ? 'ok' : 'err'}
                                onClick={() => handleTokenClick(m)}
                                style={{ cursor: 'pointer' }}
                            >
                                {m.symbol || m.name}: {isOk ? 'OK' : 'WARN'}
                            </div>
                        )
                    })}
            </div>
        </section>
    );
};

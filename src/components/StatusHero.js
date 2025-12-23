"use client";

import { useEffect, useState } from 'react';
import styles from './StatusHero.module.css';
import { Activity } from 'lucide-react';

export default function StatusHero() {
    const [status, setStatus] = useState(null);
    const [volume, setVolume] = useState(null);
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [illiquidSearch, setIlliquidSearch] = useState("");

    useEffect(() => {
        async function fetchData() {
            try {
                const [statusRes, volumeRes, mvRes] = await Promise.all([
                    fetch('/api/status'),
                    fetch('/api/volume'),
                    fetch('/api/movements')
                ]);

                const statusData = await statusRes.json();
                const volumeData = await volumeRes.json();
                const movementsData = await mvRes.json();

                setStatus(statusData);
                setVolume(volumeData);
                setMovements(movementsData);
            } catch (e) {
                console.error("Failed to fetch data", e);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const isOperative = status?.status === "Operational";

    // Helper to find movement status for a symbol
    const getMovementStatus = (pairSymbol) => {
        // pairSymbol e.g. BTCUSD
        // Try to match base currency (BTC)
        const base = pairSymbol.replace('USD', '').replace('UST', '');
        const mv = movements.find(m => m.symbol === base || m.name === base);

        return {
            deposit: mv ? mv.deposit : 'Unknown',
            withdrawal: mv ? mv.withdrawal : 'Unknown'
        };
    };

    // Filter logic for low liquidity pairs
    const lowLiquidityPairs = volume?.lowPairs || [];
    const filteredLowLiquidity = lowLiquidityPairs.filter(pair =>
        pair.symbol.toLowerCase().includes(illiquidSearch.toLowerCase())
    );

    return (
        <section className={styles.hero}>
            <div className={styles.container}>
                <div className={styles.statusBox}>
                    {loading ? (
                        <h2 className={styles.loading}>Checking System Status...</h2>
                    ) : (
                        <>
                            <div className={styles.statusHeader}>
                                <Activity size={32} color={isOperative ? "#01a68c" : "#f59e0b"} />
                                <h1>Systems are {status?.status}</h1>
                            </div>

                            {isOperative && <p className={styles.subtitle}>All systems functioning normally.</p>}

                            <div className={styles.volumeMetric}>
                                <span className={styles.label}>24h Volume</span>
                                <span className={styles.value}>
                                    ${volume?.totalVolumeUSD ? Math.floor(volume.totalVolumeUSD).toLocaleString() : '---'}
                                </span>
                            </div>

                            {volume?.topPairs && (
                                <div className={styles.marketActivity}>
                                    {volume.topPairs.map(pair => {
                                        const mvStatus = getMovementStatus(pair.symbol);
                                        return (
                                            <div key={pair.symbol} className={styles.tickerItem}>
                                                <div className={styles.cardHeader}>
                                                    <span className={styles.tickerSymbol}>{pair.symbol}</span>
                                                    <div className={styles.signals}>
                                                        <div className={styles.signal} title={`Deposit: ${mvStatus.deposit}`}>
                                                            <span className={styles.signalLabel}>D</span>
                                                            <div className={`${styles.signalDot} ${mvStatus.deposit === 'Active' ? styles.dotGreen : styles.dotRed}`} />
                                                        </div>
                                                        <div className={styles.signal} title={`Withdrawal: ${mvStatus.withdrawal}`}>
                                                            <span className={styles.signalLabel}>W</span>
                                                            <div className={`${styles.signalDot} ${mvStatus.withdrawal === 'Active' ? styles.dotGreen : styles.dotRed}`} />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className={styles.cardMain}>
                                                    <span className={styles.tickerPrice}>{pair.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                                    <span className={`${styles.tickerChange} ${pair.change >= 0 ? styles.green : styles.red}`}>
                                                        {pair.change > 0 ? '+' : ''}{(pair.change * 100).toFixed(2)}%
                                                    </span>
                                                </div>

                                                <div className={styles.cardFooter}>
                                                    <span className={styles.volLabel}>Vol:</span>
                                                    <span className={styles.volValue}>{Math.floor(pair.volume).toLocaleString()}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {volume?.lowPairs && (
                                <div className={styles.illiquidSection}>
                                    <div className={styles.sectionTitle}>
                                        <span>Low Liquidity / Illiquid Pairs</span>
                                        <div className={styles.terminalSearch}>
                                            <span className={styles.prompt}>{">"}</span>
                                            <input
                                                type="text"
                                                className={styles.terminalInput}
                                                placeholder="SEARCH PAIR..."
                                                value={illiquidSearch}
                                                onChange={(e) => setIlliquidSearch(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.illiquidList}>
                                        {filteredLowLiquidity.length > 0 ? (
                                            filteredLowLiquidity.map(pair => {
                                                const mvStatus = getMovementStatus(pair.symbol);
                                                return (
                                                    <div key={pair.symbol} className={styles.illiquidItem}>
                                                        <span className={styles.mono}>{pair.symbol}</span>
                                                        <div className={styles.signals}>
                                                            <div className={styles.signal} title={`Deposit: ${mvStatus.deposit}`}>
                                                                <span className={styles.signalLabel}>D</span>
                                                                <div className={`${styles.signalDot} ${mvStatus.deposit === 'Active' ? styles.dotGreen : styles.dotRed}`} />
                                                            </div>
                                                            <div className={styles.signal} title={`Withdrawal: ${mvStatus.withdrawal}`}>
                                                                <span className={styles.signalLabel}>W</span>
                                                                <div className={`${styles.signalDot} ${mvStatus.withdrawal === 'Active' ? styles.dotGreen : styles.dotRed}`} />
                                                            </div>
                                                            <span style={{ marginLeft: '8px', fontSize: '12px' }}>${pair.lastPrice}</span>
                                                        </div>
                                                        <span className={`${styles.lowVolValue} ${styles.mono}`}>
                                                            VOL: {Math.floor(pair.volume).toLocaleString()}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className={styles.noResults}>No pairs found matching "{illiquidSearch}"</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

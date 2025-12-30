"use client";

import { useState, useMemo, useEffect } from 'react';
import { Search, X, Pin, Plus } from 'lucide-react';
import styles from '../../app/terminal/terminal.module.css';
import { useIsMobile } from '../../hooks/useIsMobile';
import MarketCard from './MarketCard';

// Helper function to open external links in a new tab safely
const openExternalLink = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
};

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
                    <span className={`${styles.warningHeaderSortable} ${styles.warnVolHeader}`} onClick={() => handleSort('spread')}>
                        SPREAD
                        {sortBySpread && <span className={styles.sortArrow}>{sortBySpread === 'desc' ? '↓' : '↑'}</span>}
                    </span>
                    <span className={`${styles.warningHeaderSortable} ${styles.warnVolHeader}`} onClick={() => handleSort('24hvol')}>
                        24H_VOL
                        {sortBy24HVol && <span className={styles.sortArrow}>{sortBy24HVol === 'desc' ? '↓' : '↑'}</span>}
                    </span>
                    <span className={`${styles.warningHeaderSortable} ${styles.warnVolHeader}`} onClick={() => handleSort('7dvol')}>
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
                                    onClick={() => openExternalLink(
                                        getBitfinexTradingUrl(p.symbol, volume?.pairUrlMap)
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
                                    {p.vol7d ? `$${fmtVol(p.vol7d)}` : '---'}
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

// Column Suggestion Dialog Component (now also supports general feedback)
const ColumnSuggestionDialog = ({ isOpen, onClose, isClassicTheme = false }) => {
    const [dialogType, setDialogType] = useState('column'); // 'column' or 'feedback'
    const [columnName, setColumnName] = useState("");
    const [description, setDescription] = useState("");
    const [feedbackMessage, setFeedbackMessage] = useState("");
    const [feedbackType, setFeedbackType] = useState('general');
    const [userEmail, setUserEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (dialogType === 'column') {
            if (!columnName.trim()) {
                return;
            }
        } else {
            if (!feedbackMessage.trim()) {
                return;
            }
        }

        setIsSubmitting(true);
        setSubmitError(null);
        
        try {
            let response;
            if (dialogType === 'column') {
                // Submit column suggestion
                response = await fetch('/api/column-suggestions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        columnName: columnName.trim(),
                        description: description.trim() || null
                    })
                });
            } else {
                // Submit general feedback
                response = await fetch('/api/feedback', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        message: feedbackMessage.trim(),
                        feedbackType: feedbackType,
                        userEmail: userEmail.trim() || null
                    })
                });
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to submit');
            }

            // Success
            setSubmitSuccess(true);
            setIsSubmitting(false);
            
            // Reset form after 2 seconds
            setTimeout(() => {
                setColumnName("");
                setDescription("");
                setFeedbackMessage("");
                setUserEmail("");
                setFeedbackType('general');
                setSubmitSuccess(false);
                setSubmitError(null);
                onClose();
            }, 2000);
        } catch (error) {
            console.error('Error submitting:', error);
            setSubmitError(error.message || 'Failed to submit. Please try again.');
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setColumnName("");
            setDescription("");
            setFeedbackMessage("");
            setUserEmail("");
            setFeedbackType('general');
            setSubmitSuccess(false);
            setSubmitError(null);
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className={styles.suggestionDialogBackdrop} onClick={handleClose} />
            <div className={styles.suggestionDialog}>
                <div className={styles.suggestionDialogHeader}>
                    <span className={styles.suggestionDialogTitle}>
                        {dialogType === 'column' ? 'SUGGEST A NEW COLUMN / STAT' : 'SEND FEEDBACK'}
                    </span>
                    <button 
                        className={styles.suggestionDialogCloseButton} 
                        onClick={handleClose}
                        disabled={isSubmitting}
                        aria-label="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
                <form className={styles.suggestionDialogForm} onSubmit={handleSubmit}>
                    {/* Type selector */}
                    <div className={styles.suggestionDialogField}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            <button
                                type="button"
                                className={`${styles.suggestionDialogButton} ${dialogType === 'column' ? styles.suggestionDialogButtonPrimary : ''}`}
                                onClick={() => {
                                    setDialogType('column');
                                    setSubmitError(null);
                                }}
                                disabled={isSubmitting || submitSuccess}
                                style={{ flex: 1, fontSize: '10px', padding: '6px 12px' }}
                            >
                                COLUMN SUGGESTION
                            </button>
                            <button
                                type="button"
                                className={`${styles.suggestionDialogButton} ${dialogType === 'feedback' ? styles.suggestionDialogButtonPrimary : ''}`}
                                onClick={() => {
                                    setDialogType('feedback');
                                    setSubmitError(null);
                                }}
                                disabled={isSubmitting || submitSuccess}
                                style={{ flex: 1, fontSize: '10px', padding: '6px 12px' }}
                            >
                                FEEDBACK
                            </button>
                        </div>
                    </div>

                    {dialogType === 'column' ? (
                        <>
                            <div className={styles.suggestionDialogField}>
                                <label className={styles.suggestionDialogLabel}>
                                    COLUMN_NAME / STAT_NAME *
                                </label>
                                <input
                                    type="text"
                                    className={styles.suggestionDialogInput}
                                    value={columnName}
                                    onChange={(e) => setColumnName(e.target.value)}
                                    placeholder="E.G., LIQUIDITY_SCORE, MARKET_CAP, ETC."
                                    required
                                    disabled={isSubmitting || submitSuccess}
                                    autoFocus
                                />
                            </div>
                            <div className={styles.suggestionDialogField}>
                                <label className={styles.suggestionDialogLabel}>
                                    DESCRIPTION / USE_CASE
                                </label>
                                <textarea
                                    className={styles.suggestionDialogTextarea}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="DESCRIBE WHAT THIS COLUMN WOULD SHOW AND WHY IT WOULD BE USEFUL..."
                                    rows={6}
                                    disabled={isSubmitting || submitSuccess}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={styles.suggestionDialogField}>
                                <label className={styles.suggestionDialogLabel}>
                                    FEEDBACK TYPE
                                </label>
                                <select
                                    className={styles.suggestionDialogInput}
                                    value={feedbackType}
                                    onChange={(e) => setFeedbackType(e.target.value)}
                                    disabled={isSubmitting || submitSuccess}
                                    style={{ textTransform: 'uppercase' }}
                                >
                                    <option value="general">GENERAL</option>
                                    <option value="bug">BUG REPORT</option>
                                    <option value="feature">FEATURE REQUEST</option>
                                    <option value="suggestion">SUGGESTION</option>
                                    <option value="other">OTHER</option>
                                </select>
                            </div>
                            <div className={styles.suggestionDialogField}>
                                <label className={styles.suggestionDialogLabel}>
                                    MESSAGE *
                                </label>
                                <textarea
                                    className={styles.suggestionDialogTextarea}
                                    value={feedbackMessage}
                                    onChange={(e) => setFeedbackMessage(e.target.value)}
                                    placeholder="SHARE YOUR FEEDBACK, SUGGESTIONS, OR REPORT ISSUES..."
                                    rows={6}
                                    required
                                    disabled={isSubmitting || submitSuccess}
                                    autoFocus
                                />
                            </div>
                            <div className={styles.suggestionDialogField}>
                                <label className={styles.suggestionDialogLabel}>
                                    EMAIL (OPTIONAL)
                                </label>
                                <input
                                    type="email"
                                    className={styles.suggestionDialogInput}
                                    value={userEmail}
                                    onChange={(e) => setUserEmail(e.target.value)}
                                    placeholder="YOUR_EMAIL@EXAMPLE.COM"
                                    disabled={isSubmitting || submitSuccess}
                                />
                            </div>
                        </>
                    )}
                    {submitError && (
                        <div className={styles.suggestionDialogError}>
                            ERROR: {submitError}
                        </div>
                    )}
                    {submitSuccess ? (
                        <div className={styles.suggestionDialogSuccess}>
                            ✓ {dialogType === 'column' ? 'SUGGESTION' : 'FEEDBACK'} SUBMITTED SUCCESSFULLY
                        </div>
                    ) : (
                        <div className={styles.suggestionDialogActions}>
                            <button
                                type="button"
                                className={styles.suggestionDialogButton}
                                onClick={handleClose}
                                disabled={isSubmitting}
                            >
                                CANCEL
                            </button>
                            <button
                                type="submit"
                                className={`${styles.suggestionDialogButton} ${styles.suggestionDialogButtonPrimary}`}
                                disabled={
                                    isSubmitting || 
                                    (dialogType === 'column' ? !columnName.trim() : !feedbackMessage.trim())
                                }
                            >
                                {isSubmitting ? 'SUBMITTING...' : 'SUBMIT'}
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </>
    );
};

export const MarketScanner = ({ volume, movements, isClassicTheme = false }) => {
    const { isMobile: isMobileHook } = useIsMobile();
    // Safe default for SSR - always use desktop view during prerendering
    const isMobile = typeof isMobileHook === 'boolean' ? isMobileHook : false;
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSuggestionDialogOpen, setIsSuggestionDialogOpen] = useState(false);
    const [sortBySymbol, setSortBySymbol] = useState(null);
    const [sortByLast, setSortByLast] = useState(null);
    const [sortBySD, setSortBySD] = useState(null);
    const [sortBySpread, setSortBySpread] = useState(null);
    const [sortBy24HVol, setSortBy24HVol] = useState(null);
    const [sortBy7DVol, setSortBy7DVol] = useState(null);
    const [sortBy30DVol, setSortBy30DVol] = useState(null);
    const [sortByOI, setSortByOI] = useState(null);
    const [sortByD, setSortByD] = useState(null);
    const [sortByW, setSortByW] = useState(null);
    
    // Advanced filters
    const [showFilters, setShowFilters] = useState(false);
    const [minVolume, setMinVolume] = useState("");
    const [maxVolume, setMaxVolume] = useState("");
    const [minSpread, setMinSpread] = useState("");
    const [maxSpread, setMaxSpread] = useState("");
    const [minChange, setMinChange] = useState("");
    const [maxChange, setMaxChange] = useState("");
    
    // Trend data
    const [trends, setTrends] = useState(new Map());
    const [loadingTrends, setLoadingTrends] = useState(false);

    const getMovementStatus = (pairSymbol) => {
        const base = pairSymbol.replace('USD', '').replace('UST', '');
        // Ensure movements is an array before using .find()
        const movementsArray = Array.isArray(movements) ? movements : [];
        const mv = movementsArray.find(m => m.symbol === base || m.name === base);
        return {
            d: mv ? (mv.deposit === 'Active' ? 'OK' : 'CLSD') : 'NA',
            w: mv ? (mv.withdrawal === 'Active' ? 'OK' : 'CLSD') : 'NA'
        };
    };

    const fmtVals = (val) => {
        // Distinguish between 0 (valid value) and null/undefined (no data)
        if (val === null || val === undefined) return '---';
        if (val === 0) return '0';
        if (val > 1000000000) return (val / 1000000000).toFixed(1) + 'B';
        if (val > 1000000) return (val / 1000000).toFixed(1) + 'M';
        return Math.floor(val).toLocaleString();
    }

    // Fetch trend data
    useEffect(() => {
        if (!volume?.topPairs || volume.topPairs.length === 0) return;
        
        setLoadingTrends(true);
        const fetchTrends = async () => {
            try {
                const response = await fetch('/api/insights/volume-trends?hours=24&limit=50');
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.data) {
                        const trendsMap = new Map();
                        data.data.forEach(trend => {
                            trendsMap.set(trend.symbol, trend);
                        });
                        setTrends(trendsMap);
                    }
                }
            } catch (error) {
                console.error('Error fetching trends:', error);
            } finally {
                setLoadingTrends(false);
            }
        };
        
        fetchTrends();
    }, [volume?.topPairs]);

    const handleSort = (column) => {
        // Reset all other sorts
        setSortBySymbol(null);
        setSortByLast(null);
        setSortBySD(null);
        setSortBySpread(null);
        setSortBy24HVol(null);
        setSortBy7DVol(null);
        setSortBy30DVol(null);
        setSortByOI(null);
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
        } else if (column === 'oi') {
            if (sortByOI === null) setSortByOI('desc');
            else if (sortByOI === 'desc') setSortByOI('asc');
            else setSortByOI(null);
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

    // Filter pairs based on search query and advanced filters, limit to 12 when not searching/filtering
    const filteredPairs = useMemo(() => {
        if (!volume?.topPairs) return [];
        
        let filtered = volume.topPairs.filter(p => {
            // Search filter
            if (searchQuery && !p.symbol.includes(searchQuery.toUpperCase())) {
                return false;
            }
            
            // Volume filters
            if (minVolume && (p.volumeUSD || 0) < parseFloat(minVolume)) {
                return false;
            }
            if (maxVolume && (p.volumeUSD || 0) > parseFloat(maxVolume)) {
                return false;
            }
            
            // Spread filters
            if (minSpread && (p.spreadPercent || 0) < parseFloat(minSpread)) {
                return false;
            }
            if (maxSpread && (p.spreadPercent || 0) > parseFloat(maxSpread)) {
                return false;
            }
            
            // Change percentage filters
            if (minChange && (p.change || 0) < parseFloat(minChange) / 100) {
                return false;
            }
            if (maxChange && (p.change || 0) > parseFloat(maxChange) / 100) {
                return false;
            }
            
            return true;
        });
        
        // Limit to 12 when not searching or filtering
        const hasFilters = searchQuery || minVolume || maxVolume || minSpread || maxSpread || minChange || maxChange;
        return hasFilters ? filtered : filtered.slice(0, 12);
    }, [volume?.topPairs, searchQuery, minVolume, maxVolume, minSpread, maxSpread, minChange, maxChange]);

    const sortedPairs = useMemo(() => {
        let sorted = [...filteredPairs];
        
        // Determine which column is active
        const activeSort = sortBySymbol || sortByLast || sortBySD || sortBySpread || sortBy24HVol || 
                          sortBy7DVol || sortBy30DVol || sortByOI || sortByD || sortByW;
        
        // Default sort: 7D volume descending when no active sort
        if (!activeSort) {
            sorted.sort((a, b) => (b.vol7d || 0) - (a.vol7d || 0));
            return sorted;
        }
        
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
            if (sortByOI) {
                return sortByOI === 'desc' 
                    ? (b.openInterest || 0) - (a.openInterest || 0) 
                    : (a.openInterest || 0) - (b.openInterest || 0);
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
    }, [filteredPairs, sortBySymbol, sortByLast, sortBySD, sortBySpread, sortBy24HVol, sortBy7DVol, sortBy30DVol, sortByOI, sortByD, sortByW, movements]);
    
    // Helper to get trend indicator
    const getTrendIndicator = (symbol) => {
        const trend = trends.get(symbol);
        if (!trend) return null;
        
        if (trend.trend_direction === 'up') {
            return <span style={{ color: isClassicTheme ? '#00ff00' : '#3fb950', marginLeft: '4px' }}>↑</span>;
        } else if (trend.trend_direction === 'down') {
            return <span style={{ color: isClassicTheme ? '#ff3333' : '#f85149', marginLeft: '4px' }}>↓</span>;
        }
        return null;
    };

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
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <button
                                className={styles.iconBtn}
                                onClick={() => setShowFilters(!showFilters)}
                                style={{ 
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    border: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                                    background: showFilters ? (isClassicTheme ? '#331a00' : '#21262d') : 'transparent'
                                }}
                                title="Advanced filters"
                            >
                                FILTER
                            </button>
                            <Search
                                size={14}
                                className={styles.iconBtn}
                                onClick={() => setIsSearchOpen(true)}
                            />
                        </div>
                    </>
                )}
            </div>
            {showFilters && (
                <div style={{ 
                    padding: '8px',
                    borderBottom: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    fontSize: '11px',
                    background: isClassicTheme ? '#110a00' : '#0d1117'
                }}>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <label style={{ color: isClassicTheme ? '#ff9900' : '#8b949e' }}>VOL:</label>
                        <input
                            type="number"
                            placeholder="Min"
                            value={minVolume}
                            onChange={(e) => setMinVolume(e.target.value)}
                            style={{
                                width: '80px',
                                padding: '2px 4px',
                                background: isClassicTheme ? '#000' : '#161b22',
                                border: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                                color: isClassicTheme ? '#ff9900' : '#e6edf3',
                                fontSize: '10px'
                            }}
                        />
                        <input
                            type="number"
                            placeholder="Max"
                            value={maxVolume}
                            onChange={(e) => setMaxVolume(e.target.value)}
                            style={{
                                width: '80px',
                                padding: '2px 4px',
                                background: isClassicTheme ? '#000' : '#161b22',
                                border: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                                color: isClassicTheme ? '#ff9900' : '#e6edf3',
                                fontSize: '10px'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <label style={{ color: isClassicTheme ? '#ff9900' : '#8b949e' }}>SPREAD:</label>
                        <input
                            type="number"
                            placeholder="Min %"
                            value={minSpread}
                            onChange={(e) => setMinSpread(e.target.value)}
                            style={{
                                width: '60px',
                                padding: '2px 4px',
                                background: isClassicTheme ? '#000' : '#161b22',
                                border: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                                color: isClassicTheme ? '#ff9900' : '#e6edf3',
                                fontSize: '10px'
                            }}
                        />
                        <input
                            type="number"
                            placeholder="Max %"
                            value={maxSpread}
                            onChange={(e) => setMaxSpread(e.target.value)}
                            style={{
                                width: '60px',
                                padding: '2px 4px',
                                background: isClassicTheme ? '#000' : '#161b22',
                                border: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                                color: isClassicTheme ? '#ff9900' : '#e6edf3',
                                fontSize: '10px'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <label style={{ color: isClassicTheme ? '#ff9900' : '#8b949e' }}>CHANGE:</label>
                        <input
                            type="number"
                            placeholder="Min %"
                            value={minChange}
                            onChange={(e) => setMinChange(e.target.value)}
                            style={{
                                width: '60px',
                                padding: '2px 4px',
                                background: isClassicTheme ? '#000' : '#161b22',
                                border: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                                color: isClassicTheme ? '#ff9900' : '#e6edf3',
                                fontSize: '10px'
                            }}
                        />
                        <input
                            type="number"
                            placeholder="Max %"
                            value={maxChange}
                            onChange={(e) => setMaxChange(e.target.value)}
                            style={{
                                width: '60px',
                                padding: '2px 4px',
                                background: isClassicTheme ? '#000' : '#161b22',
                                border: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                                color: isClassicTheme ? '#ff9900' : '#e6edf3',
                                fontSize: '10px'
                            }}
                        />
                    </div>
                    <button
                        onClick={() => {
                            setMinVolume("");
                            setMaxVolume("");
                            setMinSpread("");
                            setMaxSpread("");
                            setMinChange("");
                            setMaxChange("");
                        }}
                        style={{
                            padding: '2px 8px',
                            background: isClassicTheme ? '#331a00' : '#21262d',
                            border: `1px solid ${isClassicTheme ? '#331a00' : '#30363d'}`,
                            color: isClassicTheme ? '#ff9900' : '#8b949e',
                            fontSize: '10px',
                            cursor: 'pointer'
                        }}
                    >
                        CLEAR
                    </button>
                </div>
            )}
            {isMobile ? (
                /* Card View for Mobile */
                <div className={styles.cardView}>
                    {sortedPairs.length > 0 ? (
                        sortedPairs.map((p) => {
                            const st = getMovementStatus(p.symbol);
                            return (
                                <MarketCard
                                    key={p.symbol}
                                    pair={p}
                                    onClick={() => openExternalLink(
                                        getBitfinexTradingUrl(p.symbol, volume?.pairUrlMap)
                                    )}
                                    isClassicTheme={isClassicTheme}
                                    movementStatus={st}
                                    trendIndicator={getTrendIndicator(p.symbol)}
                                />
                            );
                        })
                    ) : (
                        <div style={{ 
                            padding: '20px', 
                            textAlign: 'center', 
                            color: isClassicTheme ? '#888' : '#8b949e' 
                        }}>
                            {searchQuery ? 'NO MATCHES' : 'LOADING...'}
                        </div>
                    )}
                </div>
            ) : (
                /* Table View for Desktop/Tablet */
                <div className={styles.tableContainer}>
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
                        <span className={styles.tableHeaderSortable} onClick={() => handleSort('oi')}>
                            OI_DER
                            {sortByOI && <span className={styles.sortArrow}>{sortByOI === 'desc' ? '↓' : '↑'}</span>}
                        </span>
                        <span className={styles.tableHeaderSortable} onClick={() => handleSort('d')}>
                            D
                            {sortByD && <span className={styles.sortArrow}>{sortByD === 'desc' ? '↓' : '↑'}</span>}
                        </span>
                        <span className={styles.tableHeaderSortable} onClick={() => handleSort('w')}>
                            W
                            {sortByW && <span className={styles.sortArrow}>{sortByW === 'desc' ? '↓' : '↑'}</span>}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <button
                                className={styles.suggestionButton}
                                onClick={() => setIsSuggestionDialogOpen(true)}
                                title="Suggest a new column"
                                aria-label="Suggest a new column"
                            >
                                <Plus size={14} />
                            </button>
                        </span>
                    </div>
                    <div className={styles.scrollList}>
                        {sortedPairs.length > 0 ? (
                            sortedPairs.map((p) => {
                                const st = getMovementStatus(p.symbol);
                                return (
                                    <div key={p.symbol} className={styles.tableRow}>
                                        <span 
                                            className={styles.colSymbol}
                                            onClick={() => openExternalLink(
                                                getBitfinexTradingUrl(p.symbol, volume?.pairUrlMap)
                                            )}
                                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                        >
                                            {p.symbol}
                                            {getTrendIndicator(p.symbol)}
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
                                        <span className={styles.colVol}>
                                            {p.openInterestUSD !== null && p.openInterestUSD !== undefined 
                                                ? fmtVals(p.openInterestUSD) 
                                                : (p.openInterest !== null && p.openInterest !== undefined 
                                                    ? `${fmtVals(p.openInterest)} raw` 
                                                    : '---')}
                                        </span>
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
                                        <span></span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className={styles.tableRow} style={{ justifyContent: 'center', color: isClassicTheme ? '#888' : '#8b949e' }}>
                                {searchQuery ? 'NO MATCHES' : 'LOADING...'}
                            </div>
                        )}
                    </div>
                </div>
            )}
            <ColumnSuggestionDialog 
                isOpen={isSuggestionDialogOpen} 
                onClose={() => setIsSuggestionDialogOpen(false)}
                isClassicTheme={isClassicTheme}
            />
        </section>
    );
};

export const WalletMonitor = ({ walletData, isClassicTheme = false }) => {
    const [sortByInVolume, setSortByInVolume] = useState(null); // 'desc' | 'asc' | null
    const [sortByOutVolume, setSortByOutVolume] = useState(null); // 'desc' | 'asc' | null
    const [sortByBalance, setSortByBalance] = useState(null); // 'desc' | 'asc' | null

    const handleSort = (column) => {
        if (column === 'in') {
            if (sortByInVolume === null) {
                setSortByInVolume('desc');
                setSortByOutVolume(null);
                setSortByBalance(null);
            } else if (sortByInVolume === 'desc') {
                setSortByInVolume('asc');
            } else {
                setSortByInVolume(null); // Volver a orden original
            }
        } else if (column === 'out') {
            if (sortByOutVolume === null) {
                setSortByOutVolume('desc');
                setSortByInVolume(null);
                setSortByBalance(null);
            } else if (sortByOutVolume === 'desc') {
                setSortByOutVolume('asc');
            } else {
                setSortByOutVolume(null); // Volver a orden original
            }
        } else if (column === 'balance') {
            if (sortByBalance === null) {
                setSortByBalance('desc');
                setSortByInVolume(null);
                setSortByOutVolume(null);
            } else if (sortByBalance === 'desc') {
                setSortByBalance('asc');
            } else {
                setSortByBalance(null); // Volver a orden original
            }
        }
    };

    const sortedTokens = useMemo(() => {
        if (!walletData?.topTokens || walletData.topTokens.length === 0) {
            if (process.env.NODE_ENV === 'development') {
                console.warn('WalletMonitor: No topTokens in walletData', walletData);
            }
            return [];
        }

        // Validate token structure and filter invalid entries
        const tokens = walletData.topTokens.filter(t => {
            const isValid = t && t.symbol && (
                (t.inVolume !== undefined && t.inVolume !== null) ||
                (t.outVolume !== undefined && t.outVolume !== null)
            );
            
            if (!isValid && process.env.NODE_ENV === 'development') {
                console.warn('WalletMonitor: Invalid token structure:', t);
            }
            
            return isValid;
        });
        
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
        } else if (sortByBalance) {
            otherTokens.sort((a, b) => {
                const valA = a.currentBalanceUSD || a.currentBalance || 0;
                const valB = b.currentBalanceUSD || b.currentBalance || 0;
                return sortByBalance === 'desc' ? valB - valA : valA - valB;
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
    }, [walletData?.topTokens, sortByInVolume, sortByOutVolume, sortByBalance]);

    return (
        <section className={styles.sectorW} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.warningHeader}>
                <a 
                    href="https://etherscan.io/address/0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.warningTitle}
                    style={{ textDecoration: 'none', cursor: 'pointer' }}
                    title="View wallet on Etherscan"
                >
                    {">> HOT_WALLET_FLOWS [ETH]"}
                </a>
                <div className={styles.walletStatus}>
                    <span className={styles.label}>STATE:</span>
                    <span className={walletData?.status === 'WARNING' ? styles.statusWarn : styles.statusOk}>
                        {walletData?.status === 'WARNING' ? `PENDING (${walletData.pendingCount})` : 'OK'}
                    </span>
                </div>
            </div>
            <div className={styles.walletTableContainer}>
                <div className={styles.walletHeaderRow}>
                    <span>TOKEN_SYM</span>
                    <span 
                        className={styles.walletHeaderSortable}
                        onClick={() => handleSort('in')}
                    >
                        IN_24H
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
                        OUT_24H
                        {sortByOutVolume && (
                            <span className={styles.sortArrow}>
                                {sortByOutVolume === 'desc' ? '↓' : '↑'}
                            </span>
                        )}
                    </span>
                    <span 
                        className={styles.walletHeaderSortable}
                        onClick={() => handleSort('balance')}
                    >
                        BAL
                        {sortByBalance && (
                            <span className={styles.sortArrow}>
                                {sortByBalance === 'desc' ? '↓' : '↑'}
                            </span>
                        )}
                    </span>
                </div>
                <div className={styles.walletGrid}>
                    {sortedTokens.length > 0 ? (
                        sortedTokens.map(t => {
                            // Format currency with $ sign and K/M/B notation
                            const formatCurrency = (value) => {
                                if (value === null || value === undefined || value === 0) {
                                    return '$0';
                                }
                                
                                const absValue = Math.abs(value);
                                
                                if (absValue >= 1000000000) {
                                    return `$${(value / 1000000000).toFixed(2)}B`;
                                }
                                if (absValue >= 1000000) {
                                    return `$${(value / 1000000).toFixed(2)}M`;
                                }
                                if (absValue >= 1000) {
                                    return `$${(value / 1000).toFixed(2)}K`;
                                }
                                
                                return `$${Math.floor(value).toLocaleString()}`;
                            };

                            const inDisplay = formatCurrency(t.inVolumeUSD ?? 0);
                            const outDisplay = formatCurrency(t.outVolumeUSD ?? 0);
                            const balanceDisplay = formatCurrency(t.currentBalanceUSD ?? 0);
                            
                            return (
                                <div key={t.symbol} className={styles.walletRow}>
                                    <span className={styles.walletSymbol}>
                                        {t.symbol}
                                        {t.symbol === 'ETH' && (
                                            <Pin size={10} className={styles.pinIcon} />
                                        )}
                                    </span>
                                    <span className={styles.walletVol}>
                                        {inDisplay}
                                    </span>
                                    <span className={styles.walletVol}>
                                        {outDisplay}
                                    </span>
                                    <span className={styles.walletVol}>
                                        {balanceDisplay}
                                    </span>
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

    // Ensure movements is always an array
    const movementsArray = Array.isArray(movements) ? movements : [];

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
                {movementsArray
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
        <section className={styles.sectorD} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                    <span>APR_FRR</span>
                    <span className={styles.fundingVolHeader}>24H_VOL</span>
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
        </section>
    );
};

"use client";

import { useEffect, useState, useMemo } from 'react';
import styles from './terminal.module.css';
import { NetworkVitals, MarketScanner, WalletMonitor, StatusFeed, LiquidityRiskMonitor, FundingStats } from '../../components/terminal/TerminalWidgets';
import TokenDetailWidget from '../../components/terminal/TokenDetailWidget';
import dynamic from 'next/dynamic';
const DraggableGrid = dynamic(() => import('../../components/terminal/DraggableGrid'), { ssr: false });


export default function TerminalPage() {
    const [status, setStatus] = useState(null);
    const [volume, setVolume] = useState(null);
    const [movements, setMovements] = useState([]);
    const [currentTime, setCurrentTime] = useState("");
    const [walletData, setWalletData] = useState(null);
    const [fundingData, setFundingData] = useState(null);
    const [tokenWidgets, setTokenWidgets] = useState([]); // Array of { id, token }
    const [isClassicTheme, setIsClassicTheme] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    const addTokenWidget = (token) => {
        // Check if widget already exists for this token
        const tokenId = token.symbol || token.name;
        if (tokenWidgets.some(w => (w.token.symbol || w.token.name) === tokenId)) {
            return; // Already open
        }
        
        const widgetId = `token-${Date.now()}-${tokenId}`;
        setTokenWidgets(prev => [...prev, { id: widgetId, token }]);
    };

    const removeTokenWidget = (widgetId) => {
        setTokenWidgets(prev => prev.filter(w => w.id !== widgetId));
    };

    // Base layouts - token widgets will be added dynamically
    const baseLayouts = {
        lg: [
            { i: 'vitals', x: 0, y: 0, w: 3, h: 1.5, minW: 2, minH: 1 },
            { i: 'liquidity', x: 0, y: 1.5, w: 3, h: 2, minW: 2, minH: 1.5 },
            { i: 'market', x: 3, y: 0, w: 9, h: 4.1, minW: 4, minH: 3 },
            { i: 'wallet', x: 0, y: 3.5, w: 3, h: 2.5, minW: 2, minH: 1 },
            { i: 'feed', x: 3, y: 4.1, w: 9, h: 3.9, minW: 4, minH: 1.5 },
            { i: 'funding', x: 0, y: 8.0, w: 3, h: 2, minW: 2, minH: 1.5, static: false }
        ],
        md: [
            { i: 'vitals', x: 0, y: 0, w: 3, h: 1.5, minW: 2, minH: 1 },
            { i: 'liquidity', x: 0, y: 1.5, w: 3, h: 2, minW: 2, minH: 1.5 },
            { i: 'market', x: 3, y: 0, w: 7, h: 4.1, minW: 4, minH: 3 },
            { i: 'wallet', x: 0, y: 3.5, w: 3, h: 2.5, minW: 2, minH: 1 },
            { i: 'feed', x: 3, y: 4.1, w: 7, h: 3.9, minW: 4, minH: 1.5 },
            { i: 'funding', x: 0, y: 8.0, w: 3, h: 2, minW: 2, minH: 1.5 }
        ],
        sm: [
            { i: 'vitals', x: 0, y: 0, w: 6, h: 1.5, minW: 2, minH: 1 },
            { i: 'liquidity', x: 0, y: 1.5, w: 6, h: 2, minW: 2, minH: 1.5 },
            { i: 'market', x: 0, y: 3.5, w: 6, h: 4.1, minW: 4, minH: 3 },
            { i: 'wallet', x: 0, y: 7.6, w: 6, h: 2.5, minW: 2, minH: 1 },
            { i: 'feed', x: 0, y: 12.1, w: 6, h: 2.0, minW: 4, minH: 1.5 },
            { i: 'funding', x: 0, y: 14.1, w: 6, h: 2, minW: 2, minH: 1.5 }
        ],
        xs: [
            { i: 'vitals', x: 0, y: 0, w: 4, h: 1.5, minW: 2, minH: 1 },
            { i: 'liquidity', x: 0, y: 1.5, w: 4, h: 2, minW: 2, minH: 1.5 },
            { i: 'market', x: 0, y: 3.5, w: 4, h: 4.1, minW: 4, minH: 3 },
            { i: 'wallet', x: 0, y: 7.6, w: 4, h: 2.5, minW: 2, minH: 1 },
            { i: 'feed', x: 0, y: 12.1, w: 4, h: 2.0, minW: 4, minH: 1.5 },
            { i: 'funding', x: 0, y: 14.1, w: 4, h: 2, minW: 2, minH: 1.5 }
        ]
    };

    // Generate layouts with token widgets positioned between market and feed
    const defaultLayouts = useMemo(() => {
        const layouts = { ...baseLayouts };
        const breakpoints = ['lg', 'md', 'sm', 'xs'];
        
        breakpoints.forEach(bp => {
            const base = [...baseLayouts[bp]];
            // Position token widgets between market and feed (around y: 4.1-6.0 for lg/md)
            tokenWidgets.forEach((widget, index) => {
                if (bp === 'lg' || bp === 'md') {
                    // Position widgets in a row between market and feed
                    const cols = bp === 'lg' ? 12 : 10;
                    const widgetWidth = 1.5; // Half of original width (was 3)
                    // Calculate position: widgets can fit side by side
                    const maxWidgetsPerRow = Math.floor(cols / widgetWidth);
                    const row = Math.floor(index / maxWidgetsPerRow);
                    const col = (index % maxWidgetsPerRow) * widgetWidth;
                    base.push({
                        i: widget.id,
                        x: col,
                        y: 4.1 + row * 1.0,
                        w: widgetWidth,
                        h: 1.0,
                        minW: 1.5,
                        maxW: 1.5,
                        minH: 0.8,
                        maxH: 1.2
                    });
                } else {
                    // For smaller screens, stack vertically
                    base.push({
                        i: widget.id,
                        x: 0,
                        y: 7.6 + index * 1.2,
                        w: bp === 'sm' ? 6 : 4,
                        h: 1.0,
                        minW: 2,
                        minH: 0.8
                    });
                }
            });
            layouts[bp] = base;
        });
        
        return layouts;
    }, [tokenWidgets]);

    useEffect(() => {
        // Mark component as mounted to avoid hydration mismatch
        setIsMounted(true);
        
        // Load theme preference from localStorage AFTER mount to avoid hydration mismatch
        try {
            const savedTheme = localStorage.getItem('terminalTheme');
            if (savedTheme === 'classic') {
                setIsClassicTheme(true);
            }
        } catch (e) {
            // localStorage not available, use default theme
            console.warn('localStorage not available, using default theme');
        }
    }, []);

    useEffect(() => {
        // Only set up clock after component is mounted to avoid hydration mismatch
        if (!isMounted) return;
        
        // Set initial time immediately
        const updateTime = () => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }) + " " + now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase());
        };
        updateTime();
        
        // Then update every second
        const timer = setInterval(updateTime, 1000);

        // Data Fetching
        async function fetchData() {
            try {
                const [statusRes, volumeRes, mvRes] = await Promise.all([
                    fetch('/api/status'),
                    fetch('/api/volume'),
                    fetch('/api/movements')
                ]);

                setStatus(await statusRes.json());
                setVolume(await volumeRes.json());
                setMovements(await mvRes.json());
            } catch (e) { console.error(e); }
        }
        fetchData();

        // Wallet Fetching (30s interval)
        async function fetchWallet() {
            try {
                const res = await fetch('/api/wallet');
                if (!res.ok) {
                    console.error('Wallet API error:', res.status, res.statusText);
                    return;
                }
                const data = await res.json();
                if (process.env.NODE_ENV === 'development') {
                    console.log('Wallet data fetched:', { 
                        hasTopTokens: !!data.topTokens, 
                        topTokensCount: data.topTokens?.length || 0,
                        hasTokens: !!data.tokens,
                        tokensCount: data.tokens?.length || 0
                    });
                }
                setWalletData(data);
            } catch (e) { 
                console.error('Wallet fetch error:', e); 
            }
        }
        fetchWallet();
        const walletTimer = setInterval(fetchWallet, 30000);

        // Funding Fetching (60s interval)
        async function fetchFunding() {
            try {
                const res = await fetch('/api/funding');
                if (!res.ok) {
                    console.error('Funding API error:', res.status, res.statusText);
                    return;
                }
                const data = await res.json();
                if (process.env.NODE_ENV === 'development') {
                    console.log('Funding data fetched:', data);
                }
                setFundingData(data);
            } catch (e) { 
                console.error('Funding fetch error:', e); 
            }
        }
        fetchFunding();
        const fundingTimer = setInterval(fetchFunding, 60000);

        // Snapshot Saving:
        // Disabled on the client for security (no safe place to keep a write secret in the browser).
        // Use Supabase Cron / Edge Function (or Vercel Cron) to call /api/snapshot with x-snapshot-secret.
        const snapshotTimer = null;

        return () => {
            clearInterval(timer);
            clearInterval(walletTimer);
            clearInterval(fundingTimer);
            if (snapshotTimer) clearInterval(snapshotTimer);
        };
    }, [isMounted]);

    const toggleTheme = () => {
        const newTheme = !isClassicTheme;
        setIsClassicTheme(newTheme);
        try {
            localStorage.setItem('terminalTheme', newTheme ? 'classic' : 'bloomberg');
        } catch (e) {
            // localStorage not available, theme still changes but won't persist
            console.warn('Failed to save theme preference:', e);
        }
    };

    return (
        <div className={styles.terminalBody} data-theme={isMounted && isClassicTheme ? 'classic' : 'bloomberg'} suppressHydrationWarning>
            {/* fixed header */}
            <header className={styles.header} style={{ marginBottom: '10px' }}>
                <div className={styles.brand}>BFX_TERM // v1.0.5</div>
                <div className={styles.marquee} suppressHydrationWarning>{status?.status ? `SYS.MSG: ${status.status.toUpperCase()}` : "SYS.MSG: CONNECTING..."}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button 
                        onClick={toggleTheme}
                        className={styles.themeToggle}
                        title={isClassicTheme ? 'Switch to Bloomberg style' : 'Switch to Classic style'}
                    >
                        {isClassicTheme ? '◐' : '◑'}
                    </button>
                    <div className={styles.clock} suppressHydrationWarning>{isMounted ? currentTime : "---"}</div>
                </div>
            </header>

            <DraggableGrid
                className="layout"
                layouts={defaultLayouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={100}
                margin={[4, 4]}
                containerPadding={[0, 0]}
                isDraggable={true}
                isResizable={true}
                draggableHandle=".drag-handle"
                resizeHandles={['s', 'se']}
            >
                <div key="vitals" style={{ border: `1px solid ${isMounted && isClassicTheme ? '#331a00' : '#30363d'}` }} suppressHydrationWarning>
                    <div className="drag-handle" style={{ height: '8px', background: isMounted && isClassicTheme ? '#331a00' : '#30363d', cursor: 'grab', width: '100%', opacity: 0.8 }} suppressHydrationWarning></div>
                    <NetworkVitals status={status} volume={volume} isClassicTheme={isClassicTheme} />
                </div>
                <div key="liquidity" style={{ border: `1px solid ${isMounted && isClassicTheme ? '#331a00' : '#30363d'}` }} suppressHydrationWarning>
                    <div className="drag-handle" style={{ height: '8px', background: isMounted && isClassicTheme ? '#331a00' : '#30363d', cursor: 'grab', width: '100%', opacity: 0.8 }} suppressHydrationWarning></div>
                    <LiquidityRiskMonitor volume={volume} isClassicTheme={isClassicTheme} />
                </div>
                <div key="market" style={{ border: `1px solid ${isMounted && isClassicTheme ? '#331a00' : '#30363d'}` }} suppressHydrationWarning>
                    <div className="drag-handle" style={{ height: '8px', background: isMounted && isClassicTheme ? '#331a00' : '#30363d', cursor: 'grab', width: '100%', opacity: 0.8 }} suppressHydrationWarning></div>
                    <MarketScanner volume={volume} movements={movements} isClassicTheme={isClassicTheme} />
                </div>
                <div key="wallet" style={{ border: `1px solid ${isMounted && isClassicTheme ? '#331a00' : '#30363d'}` }} suppressHydrationWarning>
                    <div className="drag-handle" style={{ height: '8px', background: isMounted && isClassicTheme ? '#331a00' : '#30363d', cursor: 'grab', width: '100%', opacity: 0.8 }} suppressHydrationWarning></div>
                    <WalletMonitor walletData={walletData} isClassicTheme={isClassicTheme} />
                </div>
                <div key="funding" style={{ border: `1px solid ${isMounted && isClassicTheme ? '#331a00' : '#30363d'}` }} suppressHydrationWarning>
                    <div className="drag-handle" style={{ height: '8px', background: isMounted && isClassicTheme ? '#331a00' : '#30363d', cursor: 'grab', width: '100%', opacity: 0.8 }} suppressHydrationWarning></div>
                    <FundingStats funding={fundingData} isClassicTheme={isClassicTheme} />
                </div>
                <div key="feed" style={{ border: `1px solid ${isMounted && isClassicTheme ? '#331a00' : '#30363d'}` }} suppressHydrationWarning>
                    <div className="drag-handle" style={{ height: '8px', background: isMounted && isClassicTheme ? '#331a00' : '#30363d', cursor: 'grab', width: '100%', opacity: 0.8 }} suppressHydrationWarning></div>
                    <StatusFeed movements={movements} onTokenClick={addTokenWidget} isClassicTheme={isClassicTheme} />
                </div>
                {tokenWidgets.map(widget => (
                    <div key={widget.id} style={{ border: `1px solid ${isMounted && isClassicTheme ? '#331a00' : '#30363d'}` }} suppressHydrationWarning>
                        <div className="drag-handle" style={{ height: '8px', background: isMounted && isClassicTheme ? '#331a00' : '#30363d', cursor: 'grab', width: '100%', opacity: 0.8 }} suppressHydrationWarning></div>
                        <TokenDetailWidget token={widget.token} onClose={() => removeTokenWidget(widget.id)} isClassicTheme={isClassicTheme} />
                    </div>
                ))}
            </DraggableGrid>
        </div>
    );
}

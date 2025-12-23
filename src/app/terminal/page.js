"use client";

import { useEffect, useState } from 'react';
import styles from './terminal.module.css';
import { NetworkVitals, MarketScanner, WalletMonitor, StatusFeed, LiquidityRiskMonitor } from '../../components/terminal/TerminalWidgets';
import dynamic from 'next/dynamic';
const DraggableGrid = dynamic(() => import('../../components/terminal/DraggableGrid'), { ssr: false });


export default function TerminalPage() {
    const [status, setStatus] = useState(null);
    const [volume, setVolume] = useState(null);
    const [movements, setMovements] = useState([]);
    const [currentTime, setCurrentTime] = useState("");
    const [walletData, setWalletData] = useState(null);

    // Responsive Layouts - Auto-adjusts based on screen size
    const defaultLayouts = {
        lg: [
            { i: 'vitals', x: 0, y: 0, w: 3, h: 1.5, minW: 2, minH: 1 },
            { i: 'liquidity', x: 0, y: 1.5, w: 3, h: 2, minW: 2, minH: 1.5 },
            { i: 'market', x: 3, y: 0, w: 9, h: 4.1, minW: 4, minH: 3 },
            { i: 'wallet', x: 0, y: 3.5, w: 3, h: 1, minW: 2, minH: 1 },
            { i: 'feed', x: 3, y: 4.1, w: 9, h: 2.0, minW: 4, minH: 1.5 }
        ],
        md: [
            { i: 'vitals', x: 0, y: 0, w: 3, h: 1.5, minW: 2, minH: 1 },
            { i: 'liquidity', x: 0, y: 1.5, w: 3, h: 2, minW: 2, minH: 1.5 },
            { i: 'market', x: 3, y: 0, w: 7, h: 4.1, minW: 4, minH: 3 },
            { i: 'wallet', x: 0, y: 3.5, w: 3, h: 1, minW: 2, minH: 1 },
            { i: 'feed', x: 3, y: 4.1, w: 7, h: 2.0, minW: 4, minH: 1.5 }
        ],
        sm: [
            { i: 'vitals', x: 0, y: 0, w: 6, h: 1.5, minW: 2, minH: 1 },
            { i: 'liquidity', x: 0, y: 1.5, w: 6, h: 2, minW: 2, minH: 1.5 },
            { i: 'market', x: 0, y: 3.5, w: 6, h: 4.1, minW: 4, minH: 3 },
            { i: 'wallet', x: 0, y: 7.6, w: 6, h: 1, minW: 2, minH: 1 },
            { i: 'feed', x: 0, y: 8.6, w: 6, h: 2.0, minW: 4, minH: 1.5 }
        ],
        xs: [
            { i: 'vitals', x: 0, y: 0, w: 4, h: 1.5, minW: 2, minH: 1 },
            { i: 'liquidity', x: 0, y: 1.5, w: 4, h: 2, minW: 2, minH: 1.5 },
            { i: 'market', x: 0, y: 3.5, w: 4, h: 4.1, minW: 4, minH: 3 },
            { i: 'wallet', x: 0, y: 7.6, w: 4, h: 1, minW: 2, minH: 1 },
            { i: 'feed', x: 0, y: 8.6, w: 4, h: 2.0, minW: 4, minH: 1.5 }
        ]
    };

    useEffect(() => {
        // Clock
        const timer = setInterval(() => {
            const now = new Date();
            setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }) + " " + now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase());
        }, 1000);

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
                const data = await res.json();
                setWalletData(data);
            } catch (e) { console.error(e); }
        }
        fetchWallet();
        const walletTimer = setInterval(fetchWallet, 30000);

        return () => {
            clearInterval(timer);
            clearInterval(walletTimer);
        };
    }, []);

    return (
        <div className={styles.terminalBody}>
            {/* fixed header */}
            <header className={styles.header} style={{ marginBottom: '10px' }}>
                <div className={styles.brand}>BFX_TERM // v1.0.5</div>
                <div className={styles.marquee}>{status?.status ? `SYS.MSG: ${status.status.toUpperCase()}` : "SYS.MSG: CONNECTING..."}</div>
                <div className={styles.clock}>{currentTime}</div>
            </header>

            <DraggableGrid
                className="layout"
                layouts={defaultLayouts}
                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                rowHeight={100}
                margin={[10, 10]}
                containerPadding={[0, 0]}
                isDraggable={true}
                isResizable={true}
                draggableHandle=".drag-handle"
            >
                <div key="vitals" style={{ border: '1px solid #331a00' }}>
                    <div className="drag-handle" style={{ height: '10px', background: '#331a00', cursor: 'grab', width: '100%' }}></div>
                    <NetworkVitals status={status} volume={volume} />
                </div>
                <div key="liquidity" style={{ border: '1px solid #331a00' }}>
                    <div className="drag-handle" style={{ height: '10px', background: '#331a00', cursor: 'grab', width: '100%' }}></div>
                    <LiquidityRiskMonitor volume={volume} />
                </div>
                <div key="market" style={{ border: '1px solid #331a00' }}>
                    <div className="drag-handle" style={{ height: '10px', background: '#331a00', cursor: 'grab', width: '100%' }}></div>
                    <MarketScanner volume={volume} movements={movements} />
                </div>
                <div key="wallet" style={{ border: '1px solid #331a00' }}>
                    <div className="drag-handle" style={{ height: '10px', background: '#331a00', cursor: 'grab', width: '100%' }}></div>
                    <WalletMonitor walletData={walletData} />
                </div>
                <div key="feed" style={{ border: '1px solid #331a00' }}>
                    <div className="drag-handle" style={{ height: '10px', background: '#331a00', cursor: 'grab', width: '100%' }}></div>
                    <StatusFeed movements={movements} />
                </div>
            </DraggableGrid>
        </div>
    );
}

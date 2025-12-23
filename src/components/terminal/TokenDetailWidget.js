"use client";

import { X } from 'lucide-react';
import styles from '../../app/terminal/terminal.module.css';

export default function TokenDetailWidget({ token, onClose, isClassicTheme = false }) {
    if (!token) return null;

    const isDepositActive = token.deposit === 'Active';
    const isWithdrawalActive = token.withdrawal === 'Active';

    const displaySymbol = token.symbol || token.name || 'UNKNOWN';
    const displayName = token.name || token.symbol || 'UNKNOWN';
    const networkShort = token.network?.split(' ')[0]?.toUpperCase() || 'UNK';

    return (
        <section className={styles.sectorD} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.warningHeader}>
                <span className={styles.warningTitle}>{displayName} [{networkShort}]</span>
                <X
                    size={14}
                    className={styles.iconBtn}
                    onClick={onClose}
                    style={{ cursor: 'pointer' }}
                />
            </div>
            <div style={{ padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div className={styles.warningRow} style={{ justifyContent: 'space-between', padding: '2px 4px' }}>
                    <span className={styles.label}>D:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div className={`${styles.statusDot} ${isDepositActive ? styles.dotGreen : styles.dotRed}`} style={{ width: '6px', height: '6px' }} />
                        <span className={isDepositActive ? styles.statusOk : styles.statusErr}>
                            {isDepositActive ? 'OK' : 'MAINT'}
                        </span>
                    </div>
                </div>
                <div className={styles.warningRow} style={{ justifyContent: 'space-between', padding: '2px 4px' }}>
                    <span className={styles.label}>W:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div className={`${styles.statusDot} ${isWithdrawalActive ? styles.dotGreen : styles.dotRed}`} style={{ width: '6px', height: '6px' }} />
                        <span className={isWithdrawalActive ? styles.statusOk : styles.statusErr}>
                            {isWithdrawalActive ? 'OK' : 'MAINT'}
                        </span>
                    </div>
                </div>
            </div>
        </section>
    );
}


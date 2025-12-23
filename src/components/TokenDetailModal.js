"use client";

import { useEffect } from 'react';
import { X } from 'lucide-react';
import styles from './TokenDetailModal.module.css';

export default function TokenDetailModal({ isOpen, onClose, token }) {
    // Close on ESC key
    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen || !token) return null;

    const isDepositActive = token.deposit === 'Active';
    const isWithdrawalActive = token.withdrawal === 'Active';

    return (
        <>
            {/* Backdrop */}
            <div className={styles.backdrop} onClick={onClose} />
            
            {/* Modal */}
            <div className={styles.modal}>
                {/* Header */}
                <div className={styles.header}>
                    <span className={styles.tokenName}>{token.symbol || token.name}</span>
                    <button className={styles.closeButton} onClick={onClose} aria-label="Close">
                        <X size={12} />
                    </button>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    <div className={styles.compactRow}>
                        <span className={styles.label}>NET:</span>
                        <span className={styles.value}>{token.network?.split(' ')[0] || 'UNK'}</span>
                    </div>
                    <div className={styles.compactRow}>
                        <span className={styles.label}>D:</span>
                        <div className={styles.statusContainer}>
                            <div className={`${styles.statusDot} ${isDepositActive ? styles.dotGreen : styles.dotRed}`} />
                            <span className={styles.statusText}>{isDepositActive ? 'OK' : 'MAINT'}</span>
                        </div>
                    </div>
                    <div className={styles.compactRow}>
                        <span className={styles.label}>W:</span>
                        <div className={styles.statusContainer}>
                            <div className={`${styles.statusDot} ${isWithdrawalActive ? styles.dotGreen : styles.dotRed}`} />
                            <span className={styles.statusText}>{isWithdrawalActive ? 'OK' : 'MAINT'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}


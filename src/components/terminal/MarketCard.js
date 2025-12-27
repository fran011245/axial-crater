"use client";

import styles from '../../app/terminal/terminal.module.css';

/**
 * Componente de tarjeta para mostrar información de un par de trading en mobile
 * @param {Object} props
 * @param {Object} props.pair - Objeto con datos del par (symbol, lastPrice, change, volumeUSD, etc.)
 * @param {Function} props.onClick - Función a ejecutar al hacer click en la tarjeta
 * @param {boolean} props.isClassicTheme - Si está en tema classic
 * @param {Object} props.movementStatus - Estado de movimientos (D, W) si está disponible
 * @param {React.ReactNode} props.trendIndicator - Indicador de tendencia si está disponible
 */
export default function MarketCard({ pair, onClick, isClassicTheme = false, movementStatus = null, trendIndicator = null }) {
    const { symbol, lastPrice, change, volumeUSD, vol7d } = pair;
    
    // Formatear valores (misma lógica que en MarketScanner)
    const fmtVals = (val) => {
        if (val === null || val === undefined) return '---';
        if (val === 0) return '0';
        if (val > 1000000000) return (val / 1000000000).toFixed(1) + 'B';
        if (val > 1000000) return (val / 1000000).toFixed(1) + 'M';
        return Math.floor(val).toLocaleString();
    };

    const formattedPrice = lastPrice ? lastPrice.toFixed(2) : '---';
    const formattedChange = change !== null && change !== undefined 
        ? `${change > 0 ? '+' : ''}${(change * 100).toFixed(2)}%`
        : '---';
    const formattedVolume = fmtVals(volumeUSD);

    return (
        <div 
            className={styles.marketCard}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            aria-label={`${symbol} trading pair card`}
        >
            <div className={styles.cardHeader}>
                <span className={styles.cardSymbol}>
                    {symbol}
                    {trendIndicator}
                </span>
                <span className={styles.cardPrice}>${formattedPrice}</span>
            </div>
            <div className={styles.cardBody}>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>CHANGE:</span>
                    <span className={change >= 0 ? styles.gain : styles.loss}>
                        {formattedChange}
                    </span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>VOL 24H:</span>
                    <span className={styles.cardValue}>{formattedVolume}</span>
                </div>
                <div className={styles.cardRow}>
                    <span className={styles.cardLabel}>VOL 7D:</span>
                    <span className={styles.cardValue}>{fmtVals(vol7d)}</span>
                </div>
                {movementStatus && (
                    <div className={styles.cardStatus}>
                        <span className={styles.cardStatusItem}>
                            <span className={styles.cardLabel}>D:</span>
                            <span className={
                                movementStatus.d === 'OK' ? styles.statusOk : 
                                movementStatus.d === 'CLSD' ? styles.statusErr : 
                                styles.statusNa
                            }>
                                {movementStatus.d}
                            </span>
                        </span>
                        <span className={styles.cardStatusItem}>
                            <span className={styles.cardLabel}>W:</span>
                            <span className={
                                movementStatus.w === 'OK' ? styles.statusOk : 
                                movementStatus.w === 'CLSD' ? styles.statusErr : 
                                styles.statusNa
                            }>
                                {movementStatus.w}
                            </span>
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}


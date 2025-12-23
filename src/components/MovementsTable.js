"use client";

import { useEffect, useState } from 'react';
import styles from './MovementsTable.module.css';
import { Search, AlertCircle, CheckCircle } from 'lucide-react';

export default function MovementsTable() {
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [showSuspendedOnly, setShowSuspendedOnly] = useState(false);

    useEffect(() => {
        fetch('/api/movements')
            .then(res => res.json())
            .then(data => {
                setMovements(data);
                setLoading(false);
            });
    }, []);

    const filteredMovements = movements.filter(m => {
        if (!m.name) return false;
        const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (m.symbol && m.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesSuspended = showSuspendedOnly ? m.isSuspended : true;
        return matchesSearch && matchesSuspended;
    });

    return (
        <section className={styles.section}>
            <div className={styles.container}>
                <h2 className={styles.title}>Deposit and Withdrawal Status</h2>

                <div className={styles.controls}>
                    <div className={styles.searchBox}>
                        <Search className={styles.searchIcon} size={18} />
                        <input
                            type="text"
                            placeholder="Search currency..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={styles.searchInput}
                        />
                    </div>

                    <label className={styles.checkboxLabel}>
                        <input
                            type="checkbox"
                            checked={showSuspendedOnly}
                            onChange={(e) => setShowSuspendedOnly(e.target.checked)}
                        />
                        <span className={styles.checkboxText}>Only show suspended</span>
                    </label>
                </div>

                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Currency</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="2" className={styles.loadingCell}>Loading data...</td></tr>
                            ) : filteredMovements.length === 0 ? (
                                <tr><td colSpan="2" className={styles.loadingCell}>No currencies found</td></tr>
                            ) : (
                                filteredMovements.map((m, idx) => (
                                    <tr key={idx}>
                                        <td className={styles.nameCell}>
                                            <div className={styles.currencyName}>{m.name}</div>
                                            <div className={styles.currencySymbol}>{m.symbol}</div>
                                        </td>
                                        <td className={styles.statusCell}>
                                            <div className={styles.statusRow}>
                                                <div className={styles.statusItem}>
                                                    <span className={styles.label}>Deposit:</span>
                                                    <StatusBadge status={m.deposit} />
                                                </div>
                                                <div className={styles.statusItem}>
                                                    <span className={styles.label}>Withdrawal:</span>
                                                    <StatusBadge status={m.withdrawal} />
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}

function StatusBadge({ status }) {
    const isActive = status === 'Active';
    return (
        <span className={`${styles.badge} ${isActive ? styles.active : styles.suspended}`}>
            {status}
        </span>
    );
}

"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import styles from './ActivityChart.module.css';

// Mock data as real usage data isn't public
const data = [
    { name: 'USDT', value: 85, color: '#01a68c' },
    { name: 'BTC', value: 72, color: '#01a68c' },
    { name: 'ETH', value: 65, color: '#01a68c' },
    { name: 'USD', value: 45, color: '#01a68c' },
    { name: 'EUR', value: 30, color: '#01a68c' },
    { name: 'GBP', value: 25, color: '#01a68c' },
    { name: 'JPY', value: 15, color: '#01a68c' },
];

export default function ActivityChart() {
    return (
        <section className={styles.section}>
            <div className={styles.container}>
                <h2 className={styles.title}>Most Used Deposit Methods (24h)</h2>
                <div className={styles.chartWrapper}>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data}>
                            <XAxis
                                dataKey="name"
                                stroke="#9ca3af"
                                tick={{ fill: '#9ca3af' }}
                                axisLine={{ stroke: '#253346' }}
                            />
                            <YAxis
                                hide
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                contentStyle={{
                                    backgroundColor: '#17212e',
                                    border: '1px solid #253346',
                                    color: '#fff'
                                }}
                            />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </section>
    );
}

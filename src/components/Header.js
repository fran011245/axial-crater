import Link from 'next/link';
import { Leaf, ChevronDown, Smartphone } from 'lucide-react';
import styles from './Header.module.css';

export default function Header() {
    return (
        <header className={styles.header}>
            <div className={styles.container}>
                <div className={styles.left}>
                    <Link href="/" className={styles.logo}>
                        BITFINEX <Leaf size={20} fill="#01a68c" stroke="none" />
                    </Link>
                    <nav className={styles.nav}>
                        <Link href="#" className={styles.navLink}>Traders <ChevronDown size={14} /></Link>
                        <Link href="#" className={styles.navLink}>Lenders <ChevronDown size={14} /></Link>
                        <Link href="#" className={styles.navLink}>About <ChevronDown size={14} /></Link>
                        <Link href="#" className={styles.navLink}>UNUS SED LEO</Link>
                        <Link href="#" className={styles.navLink}>Securities</Link>
                        <Link href="#" className={styles.navLink}>Affiliates</Link>
                    </nav>
                </div>

                <div className={styles.right}>
                    <Link href="#" className={styles.iconLink}><Smartphone size={20} /></Link>
                    <div className={styles.buttons}>
                        <button className={styles.loginBtn}>Log in</button>
                        <button className={styles.signupBtn}>Sign up</button>
                    </div>
                    <div className={styles.langSelector}>
                        English <ChevronDown size={14} />
                    </div>
                </div>
            </div>
        </header>
    );
}

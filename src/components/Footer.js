import styles from './Footer.module.css';
import { MessageCircle } from 'lucide-react';

export default function Footer() {
    return (
        <footer className={styles.footer}>
            <div className={styles.container}>
                <div className={styles.columns}>
                    <div className={styles.column}>
                        <h4>Services</h4>
                        <a href="#">Exchange</a>
                        <a href="#">Margin Trading</a>
                        <a href="#">Derivatives</a>
                    </div>
                    <div className={styles.column}>
                        <h4>Products</h4>
                        <a href="#">Mobile App</a>
                        <a href="#">Bitfinex Borrow</a>
                    </div>
                    <div className={styles.column}>
                        <h4>Company</h4>
                        <a href="#">About</a>
                        <a href="#">Manifesto</a>
                    </div>
                    <div className={styles.column}>
                        <h4>Support</h4>
                        <a href="#">Help Center</a>
                        <a href="#">Contact Us</a>
                        <a href="#">Status</a>
                    </div>
                    <div className={styles.column}>
                        <h4>Legal & privacy</h4>
                        <a href="#">Privacy</a>
                        <a href="#">Cookies Policy</a>
                    </div>
                </div>
            </div>
            <button className={styles.chatBtn}>
                <MessageCircle size={20} /> Chat
            </button>
        </footer>
    );
}

'use client';

import Link from 'next/link';

export default function Footer() {
    return (
        <footer style={{
            background: 'var(--dark-950)',
            borderTop: '1px solid var(--dark-700)',
            padding: '32px 0',
            marginTop: 'auto'
        }}>
            <div className="container" style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '16px' }}>
                    <img src="/nit-logo-white.png" alt="NIT KKR" style={{ width: '40px', height: '40px', opacity: 0.6 }} />
                </div>
                <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                    © 2026. Built with ❤️ by{' '}
                    <Link href="/about" style={{ color: 'var(--primary-400)', fontWeight: 600 }}>
                        Team Ethers
                    </Link>
                </p>
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '24px',
                    marginTop: '12px',
                    fontSize: '0.8rem'
                }}>
                    <Link href="/about" style={{ color: 'var(--dark-500)' }}>About Us</Link>
                    <Link href="/verify" style={{ color: 'var(--dark-500)' }}>Verify Certificate</Link>
                    <Link href="/login" style={{ color: 'var(--dark-500)' }}>Login</Link>
                    <Link href="/register" style={{ color: 'var(--dark-500)' }}>Register</Link>
                </div>
            </div>
        </footer>
    );
}

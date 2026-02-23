'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar({ user, profile }) {
    const pathname = usePathname();

    const getDashboardLink = () => {
        if (!profile) return '/login';
        if (profile.status !== 'active') return '/pending';
        switch (profile.role) {
            case 'admin': return '/admin';
            case 'club_leader': return '/club-leader';
            case 'student': return '/student';
            default: return '/login';
        }
    };

    return (
        <nav style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: 'rgba(10, 14, 26, 0.85)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--glass-border)',
            padding: '0 24px',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        }}>
            <Link href="/" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: 'white',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.95rem'
            }}>
                <img src="/nit-logo-white.png" alt="NIT KKR" style={{ width: '32px', height: '32px' }} />
                <span>NIT KKR</span>
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Link href="/about" style={{
                    color: pathname === '/about' ? 'var(--primary-400)' : 'var(--dark-300)',
                    fontSize: '0.9rem',
                    fontWeight: 500
                }}>
                    About
                </Link>

                {user ? (
                    <Link href={getDashboardLink()} className="btn btn-primary btn-sm">
                        Dashboard
                    </Link>
                ) : (
                    <>
                        <Link href="/login" className="btn btn-secondary btn-sm">Login</Link>
                        <Link href="/register" className="btn btn-primary btn-sm">Register</Link>
                    </>
                )}
            </div>
        </nav>
    );
}

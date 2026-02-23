'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

export default function PendingPage() {
    const router = useRouter();
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) { router.push('/login'); return; }
            supabase.from('profiles').select('*').eq('id', user.id).single()
                .then(({ data }) => {
                    if (!data) { router.push('/login'); return; }
                    if (data.status === 'active') {
                        const routes = { admin: '/admin', club_leader: '/club-leader', student: '/student' };
                        router.push(routes[data.role] || '/login');
                        return;
                    }
                    if (data.status === 'rejected') {
                        router.push('/login?error=' + encodeURIComponent('Your account has been rejected.'));
                        return;
                    }
                    setProfile(data);
                });
        });
    }, [router]);

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (!profile) {
        return <div className="loading-screen"><div className="spinner" /><p style={{ color: 'var(--dark-400)' }}>Loading...</p></div>;
    }

    return (
        <div className="page-wrapper">
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
                <div style={{ maxWidth: '500px', width: '100%', textAlign: 'center' }} className="animate-slide-up">
                    <div className="glass-card" style={{ padding: '48px 32px' }}>
                        <div style={{
                            width: '80px', height: '80px', borderRadius: '50%',
                            background: 'rgba(245,158,11,0.15)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 24px', fontSize: '2rem'
                        }}>
                            ⏳
                        </div>

                        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'white', marginBottom: '12px' }}>
                            Awaiting Approval
                        </h1>

                        <p style={{ color: 'var(--dark-400)', lineHeight: 1.7, marginBottom: '8px' }}>
                            Your <span className="badge badge-warning" style={{ textTransform: 'capitalize' }}>
                                {profile.role === 'club_leader' ? 'Club Leader' : 'Admin'}
                            </span> account request is being reviewed.
                        </p>

                        {profile.role === 'club_leader' && profile.requested_club_name && (
                            <p style={{ color: 'var(--dark-300)', fontSize: '0.9rem', marginTop: '12px' }}>
                                Club: <strong style={{ color: 'white' }}>{profile.requested_club_name}</strong>
                            </p>
                        )}

                        <p style={{ color: 'var(--dark-500)', fontSize: '0.85rem', marginTop: '20px' }}>
                            An administrator will review your request shortly.<br />
                            You&apos;ll be able to login once approved.
                        </p>

                        <button onClick={handleLogout} className="btn btn-secondary" style={{ marginTop: '28px' }}>
                            ← Back to Login
                        </button>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}

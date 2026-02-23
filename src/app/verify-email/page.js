'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

function VerifyEmailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState(searchParams.get('email') || '');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleVerifyFilter = (val) => {
        // Allow alphanumeric (numbers + letters)
        if (val.length <= 8) {
            setCode(val);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const supabase = createClient();

            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                email,
                token: code,
                type: 'signup',
            });

            if (verifyError) {
                setError(verifyError.message);
                setLoading(false);
                return;
            }

            // Success! Check profile status
            setSuccess('Email verified successfully! Redirecting...');

            // Wait a moment then check profile to route properly
            setTimeout(async () => {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    // Check profile role
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('role, status')
                        .eq('id', session.user.id)
                        .single();

                    if (profile) {
                        if (profile.status === 'pending') {
                            router.push('/pending');
                        } else if (profile.status === 'active') {
                            if (profile.role === 'admin') router.push('/admin');
                            else if (profile.role === 'club_leader') router.push('/club-leader');
                            else router.push('/student');
                        } else {
                            // Fallback
                            router.push('/login?message=Email verified. Please log in.');
                        }
                    } else {
                        router.push('/login?message=Email verified. Please log in.');
                    }
                } else {
                    router.push('/login?message=Email verified. Please log in.');
                }
            }, 1500);

        } catch (err) {
            setError('An unexpected error occurred.');
            setLoading(false);
        }
    };

    return (
        <div style={{ textAlign: 'center' }}>
            {/* Logo */}
            <div style={{ marginBottom: '28px' }}>
                <img src="/nit-logo-white.png" alt="NIT KKR" style={{ width: '60px', height: '60px', margin: '0 auto 16px' }} />
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Verify Email</h1>
                <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>
                    Enter the code sent to {email || 'your email'}
                </p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <form onSubmit={handleVerify}>
                <div className="form-group">
                    <label>Email Address</label>
                    <input
                        type="email"
                        className="form-input"
                        placeholder="yourrollnumber@nitkkr.ac.in"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={!!searchParams.get('email')}
                    />
                </div>

                <div className="form-group">
                    <label>Verification Code</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="123456"
                        value={code}
                        onChange={(e) => handleVerifyFilter(e.target.value)}
                        required
                        style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '1.2rem' }}
                    />
                </div>

                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading || code.length < 6}
                    style={{ width: '100%', marginTop: '8px' }}
                >
                    {loading ? 'Verifying...' : 'Verify Code'}
                </button>
            </form>

            <p style={{ marginTop: '20px', color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                <Link href="/login" style={{ fontWeight: 600 }}>Back to Login</Link>
            </p>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <div className="page-wrapper">
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 24px',
                position: 'relative',
                minHeight: '100vh'
            }}>
                {/* Background */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'url(/nit-desktop.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    opacity: 0.1
                }} />

                <div style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '420px'
                }} className="animate-slide-up">

                    <div className="glass-card" style={{ padding: '40px 32px' }}>
                        <Suspense fallback={<div className="spinner"></div>}>
                            <VerifyEmailContent />
                        </Suspense>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}

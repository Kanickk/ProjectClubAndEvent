'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(searchParams.get('error') || '');
    const [message, setMessage] = useState(searchParams.get('message') || '');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setLoading(true);

        try {
            const supabase = createClient();

            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                if (signInError.message.includes('Email not confirmed')) {
                    setError('Please verify your email address before logging in.');
                } else {
                    setError(signInError.message);
                }
                setLoading(false);
                return;
            }

            // Fetch profile to check role + status
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role, status, is_primary_admin')
                .eq('id', data.user.id)
                .single();

            if (profileError || !profile) {
                setError('Could not load your profile. Please contact an administrator.');
                setLoading(false);
                return;
            }

            // Check status
            if (profile.status === 'rejected') {
                await supabase.auth.signOut();
                setError('Your account has been rejected. You cannot access the system.');
                setLoading(false);
                return;
            }

            if (profile.status === 'pending') {
                router.push('/pending');
                return;
            }

            // Active + role-based redirect
            if (profile.status === 'active') {
                switch (profile.role) {
                    case 'admin':
                        router.push('/admin');
                        break;
                    case 'club_leader':
                        router.push('/club-leader');
                        break;
                    case 'student':
                        router.push('/student');
                        break;
                    default:
                        setError('Unknown role. Please contact an administrator.');
                }
            }
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

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
                    {/* Back button */}
                    <Link href="/" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: 'var(--dark-400)',
                        fontSize: '0.85rem',
                        marginBottom: '24px'
                    }}>
                        ← Back to Home
                    </Link>

                    <div className="glass-card" style={{ padding: '40px 32px' }}>
                        {/* Logo */}
                        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                            <img src="/nit-logo-white.png" alt="NIT KKR" style={{ width: '60px', height: '60px', margin: '0 auto 16px' }} />
                            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Welcome Back</h1>
                            <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>
                                Sign in to your NIT KKR account
                            </p>
                        </div>

                        {error && <div className="alert alert-error">{error}</div>}
                        {message && <div className="alert alert-success">{message}</div>}

                        <form onSubmit={handleLogin}>
                            <div className="form-group">
                                <label>Email Address</label>
                                <input
                                    type="email"
                                    className="form-input"
                                    placeholder="yourrollnumber@nitkkr.ac.in"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Password</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                            </div>

                            <div style={{ textAlign: 'right', marginBottom: '12px' }}>
                                <Link href="/forgot-password" style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--primary-400)',
                                    fontWeight: 500
                                }}>
                                    Forgot your password?
                                </Link>
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={loading}
                                style={{ width: '100%', marginTop: '8px' }}
                            >
                                {loading ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                                        Signing in...
                                    </span>
                                ) : 'Sign In'}
                            </button>
                        </form>

                        <p style={{ textAlign: 'center', marginTop: '20px', color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                            Don&apos;t have an account?{' '}
                            <Link href="/register" style={{ fontWeight: 600 }}>Register here</Link>
                        </p>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="loading-screen">
                <div className="spinner" />
                <p style={{ color: 'var(--dark-400)' }}>Loading...</p>
            </div>
        }>
            <LoginForm />
        </Suspense>
    );
}

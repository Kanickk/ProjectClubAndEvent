'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);

    useEffect(() => {
        // Supabase handles the token exchange automatically when
        // the user clicks the reset link and lands on this page.
        // We just need to verify a session exists.
        const supabase = createClient();
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setSessionReady(true);
            }
        });

        // Listen for auth state changes (token exchange happens via onAuthStateChange)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setSessionReady(true);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleReset = async (e) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            const supabase = createClient();
            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
            });

            if (updateError) {
                setError(updateError.message);
                setLoading(false);
                return;
            }

            setSuccess(true);
            setTimeout(() => router.push('/login?message=' + encodeURIComponent('Password updated successfully! Please login with your new password.')), 3000);
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
                    <Link href="/login" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: 'var(--dark-400)',
                        fontSize: '0.85rem',
                        marginBottom: '24px'
                    }}>
                        ← Back to Login
                    </Link>

                    <div className="glass-card" style={{ padding: '40px 32px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                            <img src="/nit-logo-white.png" alt="NIT KKR" style={{ width: '60px', height: '60px', margin: '0 auto 16px' }} />
                            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Reset Password</h1>
                            <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>
                                Enter your new password below
                            </p>
                        </div>

                        {error && <div className="alert alert-error">{error}</div>}

                        {success ? (
                            <div className="animate-slide-up">
                                <div className="alert alert-success">
                                    ✅ Password updated successfully!
                                </div>
                                <p style={{ textAlign: 'center', color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '12px' }}>
                                    Redirecting you to login...
                                </p>
                            </div>
                        ) : !sessionReady ? (
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                <div className="spinner" style={{ margin: '0 auto 16px' }} />
                                <p style={{ color: 'var(--dark-400)', fontSize: '0.9rem' }}>
                                    Verifying your reset link...
                                </p>
                                <p style={{ color: 'var(--dark-500)', fontSize: '0.8rem', marginTop: '8px' }}>
                                    If this takes too long, your reset link may have expired.{' '}
                                    <Link href="/forgot-password" style={{ fontWeight: 600 }}>Request a new one</Link>
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={handleReset}>
                                <div className="form-group">
                                    <label>New Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="Minimum 6 characters"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                    />
                                </div>

                                <div className="form-group">
                                    <label>Confirm New Password</label>
                                    <input
                                        type="password"
                                        className="form-input"
                                        placeholder="Re-enter your new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                    />
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
                                            Updating...
                                        </span>
                                    ) : 'Update Password'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}

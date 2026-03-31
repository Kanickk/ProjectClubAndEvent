'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess(false);
        setLoading(true);

        try {
            const supabase = createClient();

            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/reset-password`,
            });

            if (resetError) {
                setError(resetError.message);
                setLoading(false);
                return;
            }

            setSuccess(true);
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
                            <img src="/nit-logo-white.png" alt="Clubshetra" style={{ width: '60px', height: '60px', margin: '0 auto 16px' }} />
                            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Forgot Password</h1>
                            <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>
                                Enter your email and we&apos;ll send you a reset link
                            </p>
                        </div>

                        {error && <div className="alert alert-error">{error}</div>}

                        {success ? (
                            <div className="animate-slide-up">
                                <div className="alert alert-success" style={{ marginBottom: '20px' }}>
                                    ✅ Password reset link sent!
                                </div>
                                <div style={{
                                    background: 'var(--dark-800)',
                                    border: '1px solid var(--dark-600)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: '20px',
                                    textAlign: 'center'
                                }}>
                                    <p style={{ color: 'var(--dark-300)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                        Check your inbox at <strong style={{ color: 'white' }}>{email}</strong> for the reset link.
                                        It may take a minute to arrive.
                                    </p>
                                    <p style={{ color: 'var(--dark-500)', fontSize: '0.8rem', marginTop: '12px' }}>
                                        Didn&apos;t receive it? Check your spam folder or{' '}
                                        <button
                                            onClick={() => { setSuccess(false); setEmail(''); }}
                                            style={{
                                                background: 'none', border: 'none', color: 'var(--primary-400)',
                                                cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', fontSize: 'inherit'
                                            }}
                                        >
                                            try again
                                        </button>
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label>Email Address</label>
                                    <input
                                        type="email"
                                        className="form-input"
                                        placeholder="your@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
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
                                            Sending...
                                        </span>
                                    ) : 'Send Reset Link'}
                                </button>
                            </form>
                        )}

                        <p style={{ textAlign: 'center', marginTop: '20px', color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                            Remember your password?{' '}
                            <Link href="/login" style={{ fontWeight: 600 }}>Sign in</Link>
                        </p>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}

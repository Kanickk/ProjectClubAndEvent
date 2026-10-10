'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);
    const [verifying, setVerifying] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const supabase = createClient();

        // 1. Check for query parameters containing error from Supabase
        const queryError = searchParams.get('error');
        const queryErrorDesc = searchParams.get('error_description');
        if (queryError || queryErrorDesc) {
            const msg = queryErrorDesc
                ? decodeURIComponent(queryErrorDesc.replace(/\+/g, ' '))
                : 'This password reset link is invalid or has expired.';
            setError(msg);
            setVerifying(false);
            return;
        }

        // 2. Check for hash errors (e.g. #error=access_denied&error_description=...)
        if (typeof window !== 'undefined' && window.location.hash) {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const hashError = params.get('error');
            const hashErrorDesc = params.get('error_description');
            if (hashError || hashErrorDesc) {
                const msg = hashErrorDesc
                    ? decodeURIComponent(hashErrorDesc.replace(/\+/g, ' '))
                    : 'This password reset link is invalid or has expired.';
                setError(msg);
                setVerifying(false);
                return;
            }
        }

        // 3. Listen for auth events (e.g. PASSWORD_RECOVERY or SIGNED_IN)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;
            if (event === 'PASSWORD_RECOVERY' || (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION'))) {
                setSessionReady(true);
                setVerifying(false);
            }
        });

        // 4. Handle PKCE authorization code if present in URL
        const code = searchParams.get('code');

        async function initSession() {
            try {
                if (code) {
                    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
                    if (exchangeError) {
                        if (isMounted) {
                            setError(exchangeError.message || 'This reset link has expired or was already used. Please request a new one.');
                            setVerifying(false);
                        }
                        return;
                    }
                    if (data?.session && isMounted) {
                        setSessionReady(true);
                        setVerifying(false);
                        return;
                    }
                }

                // 5. Check if an active session already exists
                const { data: { session } } = await supabase.auth.getSession();
                if (session && isMounted) {
                    setSessionReady(true);
                    setVerifying(false);
                    return;
                }

                // 6. Check if hash contains access_token (implicit flow)
                if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
                    const timer = setTimeout(async () => {
                        const { data: { session: s } } = await supabase.auth.getSession();
                        if (s && isMounted) {
                            setSessionReady(true);
                            setVerifying(false);
                        } else if (isMounted) {
                            setError('This reset link is invalid or has expired.');
                            setVerifying(false);
                        }
                    }, 1200);
                    return () => clearTimeout(timer);
                }

                // 7. Fallback timeout: If after 3.5 seconds no session or code is detected
                const fallbackTimer = setTimeout(() => {
                    if (isMounted && !sessionReady) {
                        setError('No active reset session found. Your reset link may have expired or was already used.');
                        setVerifying(false);
                    }
                }, 3500);

                return () => clearTimeout(fallbackTimer);
            } catch (err) {
                if (isMounted) {
                    setError('Unable to verify reset link. Please request a new one.');
                    setVerifying(false);
                }
            }
        }

        initSession();

        return () => {
            isMounted = false;
            subscription?.unsubscribe();
        };
    }, [searchParams]);

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

            // Successfully updated password!
            // Sign out of the temporary recovery session so user can log in freshly
            await supabase.auth.signOut();

            setSuccess(true);
            setTimeout(() => {
                router.push('/login?message=' + encodeURIComponent('Password updated successfully! Please login with your new password.'));
            }, 2500);
        } catch (err) {
            setError('An unexpected error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-card" style={{ padding: '40px 32px' }}>
            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <img src="/nit-logo-white.png" alt="Clubshetra" style={{ width: '60px', height: '60px', margin: '0 auto 16px' }} />
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Reset Password</h1>
                <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>
                    Enter your new password below
                </p>
            </div>

            {error && (
                <div className="alert alert-error" style={{ marginBottom: '20px' }}>
                    {error}
                </div>
            )}

            {success ? (
                <div className="animate-slide-up">
                    <div className="alert alert-success">
                        ✅ Password updated successfully!
                    </div>
                    <p style={{ textAlign: 'center', color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '16px' }}>
                        Redirecting you to login...
                    </p>
                </div>
            ) : verifying ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <div className="spinner" style={{ margin: '0 auto 16px', width: '32px', height: '32px' }} />
                    <p style={{ color: 'var(--dark-300)', fontSize: '0.95rem', fontWeight: 500 }}>
                        Verifying your reset link...
                    </p>
                    <p style={{ color: 'var(--dark-500)', fontSize: '0.8rem', marginTop: '8px' }}>
                        Securing your password reset session
                    </p>
                </div>
            ) : !sessionReady ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                    <p style={{ color: 'var(--dark-300)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Need a new password reset link?
                    </p>
                    <Link href="/forgot-password" className="btn btn-primary" style={{ display: 'inline-block', width: '100%', textAlign: 'center' }}>
                        Request New Reset Link
                    </Link>
                </div>
            ) : (
                <form onSubmit={handleReset}>
                    <div className="form-group">
                        <label>New Password</label>
                        <div className="password-field-wrapper">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input"
                                placeholder="Minimum 6 characters"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                            <button
                                type="button"
                                className="password-toggle-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                            >
                                {showPassword ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Confirm New Password</label>
                        <div className="password-field-wrapper">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                className="form-input"
                                placeholder="Re-enter your new password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="password-toggle-btn"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex={-1}
                            >
                                {showPassword ? '🙈' : '👁️'}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                        style={{ width: '100%', marginTop: '8px' }}
                    >
                        {loading ? (
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                                Updating Password...
                            </span>
                        ) : 'Update Password'}
                    </button>
                </form>
            )}
        </div>
    );
}

export default function ResetPasswordPage() {
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

                    <Suspense fallback={
                        <div className="glass-card" style={{ padding: '40px 32px', textAlign: 'center' }}>
                            <div className="spinner" style={{ margin: '0 auto 16px' }} />
                            <p style={{ color: 'var(--dark-400)' }}>Loading...</p>
                        </div>
                    }>
                        <ResetPasswordForm />
                    </Suspense>
                </div>
            </div>
            <Footer />
        </div>
    );
}

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

function VerifyForm() {
    const searchParams = useSearchParams();
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');

    // Auto-fill from QR code URL param
    useEffect(() => {
        const codeParam = searchParams.get('code');
        if (codeParam) {
            setCode(codeParam);
            // Auto-verify
            verifyCode(codeParam);
        }
    }, [searchParams]);

    const verifyCode = async (certCode) => {
        setError('');
        setResult(null);
        setLoading(true);

        try {
            const supabase = createClient();
            const { data, error: fetchError } = await supabase
                .from('certificates')
                .select(`
                    *,
                    profiles:user_id (full_name, email, roll_number),
                    events:event_id (title, date, venue)
                `)
                .eq('unique_code', certCode.trim())
                .single();

            if (fetchError || !data) {
                setError('Certificate not found. Please check the code and try again.');
                setLoading(false);
                return;
            }

            setResult(data);
        } catch (err) {
            setError('An error occurred during verification.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        verifyCode(code);
    };

    return (
        <div className="page-wrapper">
            <nav style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
                background: 'rgba(10,14,26,0.9)', backdropFilter: 'blur(20px)',
                borderBottom: '1px solid var(--glass-border)',
                padding: '0 24px', height: '64px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
                <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'white', fontWeight: 700 }}>
                    <img src="/nit-logo-white.png" alt="Clubshetra" style={{ width: '32px', height: '32px' }} />
                    <span>Clubshetra</span>
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Link href="/about" style={{ color: 'var(--dark-300)', fontSize: '0.9rem', fontWeight: 500 }}>About</Link>
                    <Link href="/login" className="btn btn-secondary btn-sm">Login</Link>
                </div>
            </nav>

            <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '100px 24px 40px'
            }}>
                <div style={{ maxWidth: '500px', width: '100%' }} className="animate-slide-up">
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'white', marginBottom: '8px' }}>
                            🔍 Certificate Verification
                        </h1>
                        <p style={{ color: 'var(--dark-400)', fontSize: '0.9rem' }}>
                            Enter the certificate code or scan the QR code to verify.
                        </p>
                    </div>

                    <div className="glass-card" style={{ padding: '32px' }}>
                        <form onSubmit={handleVerify}>
                            <div className="form-group">
                                <label>Certificate Code</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="Enter certificate code"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    required
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
                                {loading ? 'Verifying...' : 'Verify Certificate'}
                            </button>
                        </form>

                        {error && <div className="alert alert-error" style={{ marginTop: '16px' }}>{error}</div>}

                        {result && (
                            <div style={{ marginTop: '24px' }} className="animate-slide-up">
                                <div className="alert alert-success" style={{ marginBottom: '16px' }}>
                                    ✅ Certificate Verified Successfully
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {[
                                        { label: 'Student Name', value: result.profiles?.full_name },
                                        { label: 'Roll Number', value: result.profiles?.roll_number || 'N/A' },
                                        { label: 'Event', value: result.events?.title },
                                        { label: 'Date', value: result.events?.date ? new Date(result.events.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A' },
                                        { label: 'Venue', value: result.events?.venue || 'N/A' },
                                        { label: 'Certificate Type', value: result.certificate_type || 'Participation' },
                                        { label: 'Issue Date', value: result.issue_date ? new Date(result.issue_date).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A' },
                                        { label: 'Status', value: result.verification_status || 'Valid' },
                                    ].map((item, i) => (
                                        <div key={i} style={{
                                            display: 'flex', justifyContent: 'space-between',
                                            padding: '10px 14px', background: 'var(--dark-800)',
                                            borderRadius: 'var(--radius-md)', border: '1px solid var(--dark-600)'
                                        }}>
                                            <span style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>{item.label}</span>
                                            <span style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize' }}>{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}

export default function VerifyPage() {
    return (
        <Suspense fallback={
            <div className="loading-screen">
                <div className="spinner" />
                <p style={{ color: 'var(--dark-400)' }}>Loading...</p>
            </div>
        }>
            <VerifyForm />
        </Suspense>
    );
}

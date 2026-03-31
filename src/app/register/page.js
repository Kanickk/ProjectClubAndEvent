'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

export default function RegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'student',
        clubName: '',
        branch: '',
        year: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validations
        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (form.password.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }

        // Email validation - must be @nitkkr.ac.in (except primary admin)
        if (!form.email.endsWith('@nitkkr.ac.in') && form.email !== 'kanicksharma8@gmail.com') {
            setError('Please use a valid @nitkkr.ac.in email address.');
            return;
        }

        // Roll number extraction for students
        const rollMatch = form.email.match(/^(\d+)@nitkkr\.ac\.in$/);
        if (form.role === 'student' && !rollMatch) {
            setError('Student email must be in the format: rollnumber@nitkkr.ac.in');
            return;
        }

        if (form.role === 'club_leader' && !form.clubName.trim()) {
            setError('Please provide a club name.');
            return;
        }

        setLoading(true);

        try {
            const supabase = createClient();

            const metadata = {
                full_name: form.fullName,
                role: form.role,
                roll_number: rollMatch ? rollMatch[1] : null,
                branch: form.branch || null,
                year: form.year || null,
            };

            if (form.role === 'club_leader') {
                metadata.club_name = form.clubName;
            }

            const { data, error: signUpError } = await supabase.auth.signUp({
                email: form.email,
                password: form.password,
                options: {
                    data: metadata,
                },
            });

            if (signUpError) {
                setError(signUpError.message);
                setLoading(false);
                return;
            }

            if (data.user && !data.session) {
                setSuccess('Registration successful! Please check your email for the verification code.');
                // Redirect to verify-email page with email param
                setTimeout(() => router.push(`/verify-email?email=${encodeURIComponent(form.email)}`), 1500);
            } else {
                // Auto-login success (if email confirm is off)
                if (form.role === 'student') {
                    setSuccess('Registration successful! You can now login.');
                } else {
                    setSuccess('Registration successful! Your account is pending admin approval.');
                }

                setTimeout(() => router.push('/login?message=' + encodeURIComponent(
                    form.role === 'student'
                        ? 'Registration successful! You can now login.'
                        : 'Registration successful! Your account is pending admin approval.'
                )), 2000);
            }

        } catch (err) {
            setError('An unexpected error occurred.');
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

                <div style={{ position: 'relative', width: '100%', maxWidth: '480px' }} className="animate-slide-up">
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
                        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                            <img src="/nit-logo-white.png" alt="Clubshetra" style={{ width: '60px', height: '60px', margin: '0 auto 16px' }} />
                            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>Create Account</h1>
                            <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>
                                Create your Clubshetra account
                            </p>
                        </div>

                        {error && <div className="alert alert-error">{error}</div>}
                        {success && <div className="alert alert-success">{success}</div>}

                        <form onSubmit={handleRegister}>
                            <div className="form-group">
                                <label>Full Name</label>
                                <input
                                    type="text"
                                    name="fullName"
                                    className="form-input"
                                    placeholder="Enter your full name"
                                    value={form.fullName}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Email Address</label>
                                <input
                                    type="email"
                                    name="email"
                                    className="form-input"
                                    placeholder="rollnumber@nitkkr.ac.in"
                                    value={form.email}
                                    onChange={handleChange}
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label>Role</label>
                                <select
                                    name="role"
                                    className="form-input"
                                    value={form.role}
                                    onChange={handleChange}
                                >
                                    <option value="student">Student</option>
                                    <option value="club_leader">Club Leader / President</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>

                            {form.role === 'club_leader' && (
                                <div className="form-group animate-slide-up">
                                    <label>Club Name</label>
                                    <input
                                        type="text"
                                        name="clubName"
                                        className="form-input"
                                        placeholder="Enter your club name"
                                        value={form.clubName}
                                        onChange={handleChange}
                                        required
                                    />
                                </div>
                            )}

                            <div className="grid-2">
                                <div className="form-group">
                                    <label>Branch</label>
                                    <select name="branch" className="form-input" value={form.branch} onChange={handleChange}>
                                        <option value="">Select Branch</option>
                                        {['Computer Engineering', 'Information Technology', 'Electrical Engineering', 'Electronics & Communication', 'Mechanical Engineering', 'Civil Engineering', 'Production & Industrial', 'Physics', 'Mathematics', 'Chemistry', 'Other'].map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Year</label>
                                    <select name="year" className="form-input" value={form.year} onChange={handleChange}>
                                        <option value="">Select Year</option>
                                        {['1st Year', '2nd Year', '3rd Year', '4th Year', 'PhD', 'Alumni'].map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Password</label>
                                <div className="password-field-wrapper">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        className="form-input"
                                        placeholder="Minimum 6 characters"
                                        value={form.password}
                                        onChange={handleChange}
                                        required
                                        minLength={6}
                                        style={{ paddingRight: '40px' }}
                                    />
                                    <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
                                        {showPassword ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Confirm Password</label>
                                <div className="password-field-wrapper">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="confirmPassword"
                                        className="form-input"
                                        placeholder="Re-enter your password"
                                        value={form.confirmPassword}
                                        onChange={handleChange}
                                        required
                                        style={{ paddingRight: '40px' }}
                                    />
                                    <button type="button" className="password-toggle-btn" onClick={() => setShowPassword(!showPassword)}>
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
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                                        Creating Account...
                                    </span>
                                ) : 'Create Account'}
                            </button>
                        </form>

                        <p style={{ textAlign: 'center', marginTop: '20px', color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                            Already have an account?{' '}
                            <Link href="/login" style={{ fontWeight: 600 }}>Sign in here</Link>
                        </p>
                    </div>
                </div>
            </div>
            <Footer />
        </div>
    );
}

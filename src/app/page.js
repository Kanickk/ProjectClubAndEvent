'use client';

import Link from 'next/link';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';

const HERO_LINES = [
    'Code. Create. Celebrate.',
    'From Hackathons to DJ Nights.',
    'From Innovation to Celebration.',
    'One Campus. Infinite Vibes.',
    'Welcome to the Experience',
];

const TYPING_SPEED = 70;
const DELETING_SPEED = 40;
const PAUSE_AFTER_TYPING = 1800;
const PAUSE_AFTER_DELETING = 400;

export default function HomePage() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [lineIndex, setLineIndex] = useState(0);
    const [displayedText, setDisplayedText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    // Typing animation effect
    useEffect(() => {
        const currentLine = HERO_LINES[lineIndex];
        let timeout;

        if (!isDeleting) {
            // Typing forward
            if (displayedText.length < currentLine.length) {
                timeout = setTimeout(() => {
                    setDisplayedText(currentLine.slice(0, displayedText.length + 1));
                }, TYPING_SPEED);
            } else {
                // Finished typing — pause then start deleting
                timeout = setTimeout(() => {
                    setIsDeleting(true);
                }, PAUSE_AFTER_TYPING);
            }
        } else {
            // Deleting
            if (displayedText.length > 0) {
                timeout = setTimeout(() => {
                    setDisplayedText(displayedText.slice(0, -1));
                }, DELETING_SPEED);
            } else {
                // Finished deleting — move to next line
                timeout = setTimeout(() => {
                    setIsDeleting(false);
                    setLineIndex((prev) => (prev + 1) % HERO_LINES.length);
                }, PAUSE_AFTER_DELETING);
            }
        }

        return () => clearTimeout(timeout);
    }, [displayedText, isDeleting, lineIndex]);

    useEffect(() => {
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
            if (user) {
                supabase.from('profiles').select('role, status').eq('id', user.id).single()
                    .then(({ data }) => setProfile(data));
            }
        });
    }, []);

    const getDashboardLink = () => {
        if (!profile || profile.status !== 'active') return '/pending';
        switch (profile.role) {
            case 'admin': return '/admin';
            case 'club_leader': return '/club-leader';
            default: return '/student';
        }
    };

    return (
        <div className="page-wrapper">
            <Navbar user={user} profile={profile} />
            {/* Hero Section */}
            <section style={{
                position: 'relative',
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden'
            }}>
                {/* Background Image */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'url(/nit-desktop.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                }} />
                {/* Dark Overlay */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(3,7,18,0.75) 0%, rgba(3,7,18,0.85) 50%, rgba(3,7,18,0.95) 100%)'
                }} />

                {/* Content */}
                <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: '0 24px', maxWidth: '800px' }}
                    className="animate-fade-in">
                    <img src="/nit-logo-white.png" alt="NIT Kurukshetra" style={{
                        width: '100px',
                        height: '100px',
                        margin: '0 auto 24px',
                        display: 'block',
                        filter: 'drop-shadow(0 4px 20px rgba(99,102,241,0.3))'
                    }} />

                    <div style={{
                        display: 'inline-block',
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 'var(--radius-full)',
                        padding: '6px 18px',
                        fontSize: '0.8rem',
                        color: 'var(--primary-400)',
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        marginBottom: '20px'
                    }}>
                        NATIONAL INSTITUTE OF TECHNOLOGY, KURUKSHETRA
                    </div>

                    {/* Typing Animation */}
                    <div style={{
                        minHeight: 'clamp(3.5rem, 8vw, 5.5rem)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '16px'
                    }}>
                        <h1 style={{
                            fontSize: 'clamp(1.8rem, 4.5vw, 3.2rem)',
                            fontWeight: 900,
                            lineHeight: 1.2,
                            background: 'linear-gradient(135deg, #fff 0%, var(--primary-200) 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            margin: 0,
                        }}>
                            {displayedText}
                            <span style={{
                                display: 'inline-block',
                                width: '3px',
                                height: '1em',
                                background: 'var(--primary-400)',
                                marginLeft: '4px',
                                verticalAlign: 'text-bottom',
                                animation: 'blink-caret 0.75s step-end infinite',
                                WebkitTextFillColor: 'var(--primary-400)',
                            }} />
                        </h1>
                    </div>

                    <p style={{
                        fontSize: '1rem',
                        color: 'var(--dark-300)',
                        maxWidth: '600px',
                        margin: '0 auto 32px',
                        lineHeight: 1.7,
                        opacity: 0.85,
                    }}>
                        Discover clubs, participate in events, earn certificates, and track your campus journey — all in one place.
                    </p>

                    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        {user ? (
                            <Link href={getDashboardLink()} className="btn btn-primary btn-lg"
                                style={{ minWidth: '180px' }}>
                                Go to Dashboard →
                            </Link>
                        ) : (
                            <>
                                <Link href="/register" className="btn btn-primary btn-lg"
                                    style={{ minWidth: '180px' }}>
                                    Get Started →
                                </Link>
                                <Link href="/login" className="btn btn-secondary btn-lg"
                                    style={{ minWidth: '180px' }}>
                                    Login
                                </Link>
                            </>
                        )}
                    </div>
                </div>

                {/* Scroll Indicator */}
                <div style={{
                    position: 'absolute',
                    bottom: '32px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--dark-500)',
                    fontSize: '0.75rem',
                    animation: 'pulse 2s infinite'
                }}>
                    <span>Scroll Down</span>
                    <span style={{ fontSize: '1.2rem' }}>↓</span>
                </div>
            </section>

            {/* Features Section */}
            <section style={{ padding: '80px 0', background: 'var(--dark-900)' }}>
                <div className="container">
                    <div style={{ textAlign: 'center', marginBottom: '48px' }} className="animate-slide-up">
                        <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', marginBottom: '12px' }}>
                            Everything You Need
                        </h2>
                        <p style={{ color: 'var(--dark-400)', maxWidth: '500px', margin: '0 auto' }}>
                            A complete ecosystem for managing clubs, events, and campus activities.
                        </p>
                    </div>

                    <div className="grid-3">
                        {[
                            { icon: '🏛️', title: 'Club Management', desc: 'Join clubs, manage memberships, and connect with like-minded peers.' },
                            { icon: '🎯', title: 'Event Platform', desc: 'Create, discover, and register for campus events with ease.' },
                            { icon: '📜', title: 'Certificates', desc: 'Earn verifiable certificates with QR codes for every participation.' },
                            { icon: '👥', title: 'Team Registration', desc: 'Register as individuals or form teams for competitive events.' },
                            { icon: '📊', title: 'Analytics', desc: 'Track participation, engagement, and club growth with real-time data.' },
                            { icon: '🔔', title: 'Notifications', desc: 'Stay updated with real-time notifications for approvals and events.' },
                        ].map((feature, i) => (
                            <div key={i} className="glass-card" style={{ textAlign: 'center', padding: '32px 24px' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '16px' }}>{feature.icon}</div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', marginBottom: '8px' }}>
                                    {feature.title}
                                </h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--dark-400)', lineHeight: 1.6 }}>
                                    {feature.desc}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section style={{
                padding: '80px 0',
                background: 'linear-gradient(135deg, var(--dark-900) 0%, rgba(99,102,241,0.05) 100%)'
            }}>
                <div className="container" style={{ textAlign: 'center' }}>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'white', marginBottom: '12px' }}>
                        Ready to Get Started?
                    </h2>
                    <p style={{ color: 'var(--dark-400)', marginBottom: '32px' }}>
                        Join the community. Register with your NIT KKR email.
                    </p>
                    <Link href="/register" className="btn btn-primary btn-lg">
                        Create Your Account →
                    </Link>
                </div>
            </section>

            <Footer />
        </div>
    );
}

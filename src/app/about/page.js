'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

const teamMembers = [
    { name: 'Kanick', emoji: '🚀', role: 'Lead Developer' },
    { name: 'Aman', emoji: '⚡', role: 'Backend Engineer' },
    { name: 'Gayathri', emoji: '🎨', role: 'UI/UX Designer' },
    { name: 'Yogeshwar', emoji: '🔧', role: 'Full Stack Dev' },
    { name: 'Vansh', emoji: '📊', role: 'Data & Analytics' },
];

export default function AboutPage() {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);

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

    return (
        <div className="page-wrapper">
            <Navbar user={user} profile={profile} />

            {/* Content */}
            <div style={{ paddingTop: '64px' }}>
                <section style={{ padding: '80px 0', textAlign: 'center' }}>
                    <div className="container animate-fade-in">
                        <div style={{
                            display: 'inline-block', background: 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius-full)',
                            padding: '6px 18px', fontSize: '0.8rem', color: 'var(--primary-400)',
                            fontWeight: 600, letterSpacing: '0.05em', marginBottom: '24px'
                        }}>
                            ABOUT US
                        </div>

                        <h1 style={{
                            fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900,
                            background: 'linear-gradient(135deg, #fff 0%, var(--primary-200) 100%)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text', marginBottom: '16px'
                        }}>
                            Team Ethers
                        </h1>

                        <p style={{
                            color: 'var(--dark-300)', maxWidth: '700px', margin: '0 auto 48px',
                            fontSize: '1.05rem', lineHeight: 1.8
                        }}>
                            We are a group of passionate Computer Science students from NIT Kurukshetra,
                            united by our love for building impactful software. This Club & Event Management
                            System is our vision for a smarter, more connected campus experience — built by
                            students, for students. Through collaboration, late nights of coding, and a shared
                            drive for excellence, we&apos;re learning by building real-world applications that
                            make a difference.
                        </p>

                        <div className="grid-3" style={{ maxWidth: '900px', margin: '0 auto' }}>
                            {teamMembers.map((member, i) => (
                                <div key={i} className="glass-card" style={{
                                    textAlign: 'center', padding: '32px 20px',
                                    animationDelay: `${i * 0.1}s`
                                }}>
                                    <div style={{
                                        width: '70px', height: '70px', borderRadius: '50%',
                                        background: 'linear-gradient(135deg, var(--primary-600), var(--primary-400))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        margin: '0 auto 16px', fontSize: '1.8rem'
                                    }}>
                                        {member.emoji}
                                    </div>
                                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', marginBottom: '4px' }}>
                                        {member.name}
                                    </h3>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--primary-400)', fontWeight: 500 }}>
                                        {member.role}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="glass-card" style={{ maxWidth: '700px', margin: '48px auto 0', padding: '32px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white', marginBottom: '12px' }}>
                                🎓 Our Mission
                            </h3>
                            <p style={{ color: 'var(--dark-300)', lineHeight: 1.7, fontSize: '0.95rem' }}>
                                To create technology that empowers student communities. We believe that the best
                                learning happens when you build something real — something that your peers actually
                                use. This project represents our commitment to collaboration, growth, and
                                making campus life more organized and exciting.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
            <Footer />
        </div>
    );
}

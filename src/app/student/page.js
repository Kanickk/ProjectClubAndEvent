'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';
import ProfileModal from '@/components/ProfileModal';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

export default function StudentDashboard() {
    const router = useRouter();
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;
    const [profile, setProfile] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [feedbackForm, setFeedbackForm] = useState({ eventId: null, rating: 0, comment: '' });
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Data
    const [myClubs, setMyClubs] = useState([]);
    const [allClubs, setAllClubs] = useState([]);
    const [myEvents, setMyEvents] = useState([]);
    const [allEvents, setAllEvents] = useState([]);
    const [myCertificates, setMyCertificates] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [broadcastNotifs, setBroadcastNotifs] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [selectedChatClub, setSelectedChatClub] = useState(null);
    const chatEndRef = useRef(null);

    // Profile editing
    const [profileForm, setProfileForm] = useState({ full_name: '', branch: '', year: '', bio: '' });
    const [showProfileEdit, setShowProfileEdit] = useState(false);
    const [profileModalUserId, setProfileModalUserId] = useState(null);
    const [chatSettings, setChatSettings] = useState('all');

    const fetchData = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (!prof || prof.role !== 'student' || prof.status !== 'active') {
            router.push('/login'); return;
        }
        setProfile(prof);
        setProfileForm({ full_name: prof.full_name || '', branch: prof.branch || '', year: prof.year || '', bio: prof.bio || '' });

        // Parallel fetch
        const [
            { data: clubs },
            { data: memberships },
            { data: events },
            { data: registrations },
            { data: certs },
            { data: notifs }
        ] = await Promise.all([
            supabase.from('clubs').select('*, profiles(full_name)'), // All clubs
            supabase.from('club_members').select('*, clubs(*)').eq('user_id', user.id), // My memberships
            supabase.from('events').select('*, clubs(name)').eq('status', 'active').order('date', { ascending: true }), // Active events
            supabase.from('registrations').select('*, events(*)').eq('user_id', user.id), // My registrations
            supabase.from('certificates').select('*, events(title, date)').eq('user_id', user.id), // My certificates
            supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
        ]);

        setAllClubs(clubs || []);
        setMyClubs(memberships || []);
        setAllEvents(events || []);
        setMyEvents(registrations || []);
        setMyCertificates(certs || []);
        setNotifications(notifs || []);

        // Fetch broadcast notifications (global + club-specific)
        const activeClubIds = (memberships || []).filter(m => m.status === 'active').map(m => m.club_id);
        let bNotifs = [];
        // Global admin broadcasts
        const { data: globalNotifs } = await supabase.from('broadcast_notifications')
            .select('*, profiles:creator_id(full_name), clubs:club_id(name)')
            .is('club_id', null).order('created_at', { ascending: false }).limit(20);
        bNotifs = [...(globalNotifs || [])];
        // Club-specific broadcasts
        if (activeClubIds.length > 0) {
            const { data: clubNotifs } = await supabase.from('broadcast_notifications')
                .select('*, profiles:creator_id(full_name), clubs:club_id(name)')
                .in('club_id', activeClubIds).order('created_at', { ascending: false }).limit(30);
            bNotifs = [...bNotifs, ...(clubNotifs || [])];
        }
        bNotifs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setBroadcastNotifs(bNotifs);

        setLoading(false);
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Realtime chat subscription
    useEffect(() => {
        if (!selectedChatClub) return;
        const channel = supabase.channel(`student-chat-${selectedChatClub}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `club_id=eq.${selectedChatClub}` }, async (payload) => {
                const { data } = await supabase.from('chat_messages').select('*, profiles:sender_id(full_name, avatar_url)').eq('id', payload.new.id).single();
                if (data) setChatMessages(prev => [...prev, data]);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [selectedChatClub, supabase]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // Load chat messages when selecting a club
    const selectChatClub = async (clubId) => {
        setSelectedChatClub(clubId);
        const { data: msgs } = await supabase.from('chat_messages')
            .select('*, profiles:sender_id(full_name, avatar_url)')
            .eq('club_id', clubId).order('created_at', { ascending: true }).limit(200);
        setChatMessages(msgs || []);
        // Fetch chat settings for this club
        const { data: clubData } = await supabase.from('clubs').select('chat_settings').eq('id', clubId).single();
        setChatSettings(clubData?.chat_settings?.who_can_message || 'all');
    };

    const handleJoinClub = async (clubId) => {
        setActionLoading(prev => ({ ...prev, [clubId]: true }));
        try {
            // Check if already member
            const existing = myClubs.find(m => m.club_id === clubId);
            if (existing) {
                alert('You have already joined or requested to join this club.');
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('club_members').insert({
                club_id: clubId,
                user_id: user.id,
                status: 'pending' // Default to pending
            });

            alert('Join request sent successfully!');
            fetchData();
        } catch (err) {
            alert('Error joining club');
        }
        setActionLoading(prev => ({ ...prev, [clubId]: false }));
    };

    const handleSendChatMessage = async (e) => {
        e.preventDefault();
        if (!chatInput.trim() || !selectedChatClub) return;
        // Enforce chat settings
        if (chatSettings === 'muted' || chatSettings === 'admins_only') return;
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('chat_messages').insert({
            club_id: selectedChatClub,
            sender_id: user.id,
            message: chatInput.trim()
        });
        if (!error) setChatInput('');
    };

    // Profile handlers
    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        setActionLoading(prev => ({ ...prev, updateProfile: true }));
        try {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('profiles').update({
                full_name: profileForm.full_name, branch: profileForm.branch,
                year: profileForm.year, bio: profileForm.bio,
            }).eq('id', user.id);
            setShowProfileEdit(false);
            fetchData();
            alert('Profile updated!');
        } catch (err) { alert('Error: ' + err.message); }
        setActionLoading(prev => ({ ...prev, updateProfile: false }));
    };

    const handleAvatarUpload = async (file) => {
        if (!file) return;
        setActionLoading(prev => ({ ...prev, avatarUpload: true }));
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const ext = file.name.split('.').pop();
            const path = `${user.id}/avatar.${ext}`;
            await supabase.storage.from('avatars').upload(path, file, { upsert: true });
            const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
            await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
            fetchData();
            alert('Profile picture updated!');
        } catch (err) { alert('Error uploading avatar: ' + err.message); }
        setActionLoading(prev => ({ ...prev, avatarUpload: false }));
    };

    const handleRegisterEvent = async (eventId, type = 'individual') => {
        setActionLoading(prev => ({ ...prev, [eventId]: true }));
        try {
            // Check if already registered
            const existing = myEvents.find(r => r.event_id === eventId);
            if (existing) {
                alert('You are already registered for this event.');
                return;
            }

            const { data: { user } } = await supabase.auth.getUser();

            // Check registration deadline
            const event = allEvents.find(e => e.id === eventId);
            if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
                alert('Registration deadline has passed!');
                return;
            }

            // Check capacity
            const { count } = await supabase.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', eventId);

            if (event.max_participants && count >= event.max_participants) {
                alert('Event is full!');
                return;
            }

            // If team, ask for team name
            let teamName = null;
            if (type === 'team') {
                teamName = prompt("Enter your Team Name:");
                if (!teamName) return;
            }

            await supabase.from('registrations').insert({
                event_id: eventId,
                user_id: user.id,
                registration_type: type,
                team_name: teamName
            });

            alert('Registration successful!');
            fetchData();
        } catch (err) {
            console.error(err);
            alert('Error registering for event');
        }
        setActionLoading(prev => ({ ...prev, [eventId]: false }));
    };

    const handleUnregisterEvent = async (registrationId, eventTitle) => {
        if (!confirm(`Are you sure you want to unregister from "${eventTitle}"?`)) return;
        setActionLoading(prev => ({ ...prev, [`unreg_${registrationId}`]: true }));
        try {
            await supabase.from('registrations').delete().eq('id', registrationId);
            alert('Successfully unregistered from event.');
            fetchData();
        } catch (err) {
            alert('Error unregistering from event.');
        }
        setActionLoading(prev => ({ ...prev, [`unreg_${registrationId}`]: false }));
    };

    const handleSubmitFeedback = async (e) => {
        e.preventDefault();
        if (!feedbackForm.eventId || feedbackForm.rating === 0) {
            alert('Please select a rating.');
            return;
        }
        setActionLoading(prev => ({ ...prev, submitFeedback: true }));
        try {
            const { data: { user } } = await supabase.auth.getUser();
            // Check if feedback already exists
            const { data: existing } = await supabase.from('event_feedback')
                .select('id').eq('event_id', feedbackForm.eventId).eq('user_id', user.id).single();
            if (existing) {
                alert('You have already submitted feedback for this event.');
                setShowFeedbackModal(false);
                return;
            }
            const { error } = await supabase.from('event_feedback').insert({
                event_id: feedbackForm.eventId,
                user_id: user.id,
                rating: feedbackForm.rating,
                comment: feedbackForm.comment
            });
            if (error) throw error;
            alert('Feedback submitted! Thank you.');
            setShowFeedbackModal(false);
            setFeedbackForm({ eventId: null, rating: 0, comment: '' });
        } catch (err) {
            alert('Error submitting feedback: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, submitFeedback: false }));
    };

    const generateCertificate = async (cert) => {
        try {
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4'
            });

            // Background logic would go here (drawing a nice border)
            doc.setLineWidth(2);
            doc.setDrawColor(99, 102, 241); // Primary color
            doc.rect(10, 10, 277, 190);

            doc.setLineWidth(1);
            doc.setDrawColor(200, 200, 200);
            doc.rect(15, 15, 267, 180);

            // Logo
            // Note: In a real app, you'd load the image data properly
            // doc.addImage('/nit-logo-white.png', 'PNG', 20, 20, 30, 30);

            // Header
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(28);
            doc.setTextColor(50, 50, 50);
            doc.text('CERTIFICATE OF PARTICIPATION', 148.5, 50, { align: 'center' });

            doc.setFontSize(16);
            doc.setFont('helvetica', 'normal');
            doc.text('This is to certify that', 148.5, 70, { align: 'center' });

            // Name
            doc.setFontSize(24);
            doc.setFont('times', 'bold');
            doc.setTextColor(99, 102, 241);
            doc.text(profile.full_name, 148.5, 85, { align: 'center' });

            doc.setFontSize(16);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(50, 50, 50);
            doc.text(`has successfully participated in the event`, 148.5, 100, { align: 'center' });

            // Event Name
            doc.setFontSize(20);
            doc.setFont('times', 'bold');
            doc.text(cert.events?.title || 'Unknown Event', 148.5, 115, { align: 'center' });

            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            const dateStr = cert.events?.date ? new Date(cert.events.date).toLocaleDateString() : 'N/A';
            doc.text(`held on ${dateStr}`, 148.5, 125, { align: 'center' });

            // QR Code
            const verifyUrl = `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/verify?code=${cert.unique_code}`;
            const qrDataUrl = await QRCode.toDataURL(verifyUrl);
            doc.addImage(qrDataUrl, 'PNG', 123.5, 130, 40, 40);

            // Try to add club logo and leader signature
            try {
                // Find the event's club
                const { data: eventData } = await supabase.from('events').select('club_id').eq('id', cert.event_id).single();
                if (eventData?.club_id) {
                    const { data: clubData } = await supabase.from('clubs').select('logo_url, leader_signature_url, name').eq('id', eventData.club_id).single();
                    if (clubData) {
                        let yPos = 175;

                        // Add club logo at bottom-left
                        if (clubData.logo_url) {
                            try {
                                const logoResp = await fetch(clubData.logo_url);
                                const logoBlob = await logoResp.blob();
                                const logoBase64 = await new Promise((resolve) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result);
                                    reader.readAsDataURL(logoBlob);
                                });
                                doc.addImage(logoBase64, 'PNG', 25, yPos - 10, 25, 25);
                                doc.setFontSize(8);
                                doc.setTextColor(100, 100, 100);
                                doc.text(clubData.name, 38, yPos + 18, { align: 'center' });
                            } catch (e) { console.log('Could not load club logo:', e); }
                        }

                        // Add leader signature at bottom-right
                        if (clubData.leader_signature_url) {
                            try {
                                const sigResp = await fetch(clubData.leader_signature_url);
                                const sigBlob = await sigResp.blob();
                                const sigBase64 = await new Promise((resolve) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result);
                                    reader.readAsDataURL(sigBlob);
                                });
                                doc.addImage(sigBase64, 'PNG', 220, yPos - 5, 40, 16);
                                doc.setFontSize(8);
                                doc.setDrawColor(100, 100, 100);
                                doc.line(215, yPos + 13, 265, yPos + 13);
                                doc.setTextColor(100, 100, 100);
                                doc.text('Club Leader', 240, yPos + 18, { align: 'center' });
                            } catch (e) { console.log('Could not load signature:', e); }
                        }
                    }
                }
            } catch (e) { console.log('Could not fetch club data for certificate:', e); }

            doc.setFontSize(10);
            doc.setTextColor(50, 50, 50);
            doc.text(`Verify at: ${verifyUrl}`, 148.5, 195, { align: 'center' });
            doc.text(`Certificate ID: ${cert.unique_code}`, 20, 195);

            doc.save(`Certificate-${cert.events?.title}.pdf`);
        } catch (err) {
            console.error(err);
            alert('Failed to generate certificate');
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (loading) {
        return <div className="loading-screen"><div className="spinner" /><p style={{ color: 'var(--dark-400)' }}>Loading Dashboard...</p></div>;
    }

    const sidebarLinks = [
        { key: 'overview', icon: '📊', label: 'My Dashboard' },
        { key: 'profile', icon: '👤', label: 'My Profile' },
        { key: 'clubs', icon: '🏛️', label: 'Join Clubs' },
        { key: 'events', icon: '🎯', label: 'Events' },
        { key: 'certificates', icon: '📜', label: 'Certificates', count: myCertificates.length },
        { key: 'chat', icon: '💬', label: 'Group Chat' },
        { key: 'notifications', icon: '🔔', label: 'Notifications', count: notifications.filter(n => !n.is_read).length },
    ];

    const filteredClubs = allClubs.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredEvents = allEvents.filter(e =>
        e.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.venue.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="dashboard-layout">
            {/* Mobile hamburger */}
            <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                {sidebarOpen ? '✕' : '☰'}
            </button>
            <div className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <img src="/nit-logo-white.png" alt="NIT KKR" />
                    <div>
                        <h2>Student Panel</h2>
                        <span>NIT Kurukshetra</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {sidebarLinks.map(link => (
                        <button
                            key={link.key}
                            className={`sidebar-link ${activeTab === link.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(link.key)}
                        >
                            <span className="link-icon">{link.icon}</span>
                            <span>{link.label}</span>
                            {link.count > 0 && (
                                <span className="badge badge-success" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                                    {link.count}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div style={{ fontSize: '0.85rem', color: 'var(--dark-300)', marginBottom: '4px', fontWeight: 600 }}>
                        {profile?.full_name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--dark-400)', marginBottom: '12px' }}>
                        {profile?.roll_number}
                    </div>
                    <Link href="/about" style={{ fontSize: '0.8rem', color: 'var(--dark-500)', display: 'block', marginBottom: '8px' }}>About Us</Link>
                    <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="dashboard-main">
                <div className="dashboard-header">
                    <h1>
                        {activeTab === 'overview' && 'My Dashboard'}
                        {activeTab === 'profile' && 'My Profile'}
                        {activeTab === 'clubs' && 'Explore Clubs'}
                        {activeTab === 'events' && 'Upcoming Events'}
                        {activeTab === 'certificates' && 'My Certificates'}
                        {activeTab === 'chat' && 'Group Chat'}
                        {activeTab === 'notifications' && 'Notifications'}
                    </h1>
                    <div className="user-info">
                        <div className="user-avatar" style={{ background: 'var(--success-500)' }}>{profile?.full_name?.charAt(0)}</div>
                    </div>
                </div>

                {/* ===== MY PROFILE TAB ===== */}
                {activeTab === 'profile' && (
                    <div className="animate-fade-in">
                        <div className="card" style={{ maxWidth: '600px' }}>
                            {!showProfileEdit ? (
                                <>
                                    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                        <div className="profile-avatar-upload" style={{ pointerEvents: 'none' }}>
                                            {profile?.avatar_url ? (
                                                <img src={profile.avatar_url} alt={profile.full_name} />
                                            ) : (
                                                <div className="avatar-placeholder">{profile?.full_name?.charAt(0)}</div>
                                            )}
                                        </div>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{profile?.full_name}</h2>
                                        <span className="badge badge-success" style={{ marginTop: '8px' }}>Student</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                                        {[
                                            { icon: '📧', label: 'Email', value: profile?.email },
                                            { icon: '🎓', label: 'Roll Number', value: profile?.roll_number },
                                            { icon: '📚', label: 'Branch', value: profile?.branch || 'Not set' },
                                            { icon: '📅', label: 'Year', value: profile?.year || 'Not set' },
                                            { icon: '💬', label: 'Bio', value: profile?.bio || 'Not set' },
                                        ].map((item, i) => (
                                            <div key={i} className="profile-detail-row">
                                                <span className="profile-detail-icon">{item.icon}</span>
                                                <div>
                                                    <div className="profile-detail-label">{item.label}</div>
                                                    <div className="profile-detail-value">{item.value}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button onClick={() => setShowProfileEdit(true)} className="btn btn-primary">Edit Profile</button>
                                </>
                            ) : (
                                <form onSubmit={handleUpdateProfile}>
                                    <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '20px' }}>Edit Profile</h2>
                                    <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                                        <div className="profile-avatar-upload">
                                            {profile?.avatar_url ? (
                                                <img src={profile.avatar_url} alt="" />
                                            ) : (
                                                <div className="avatar-placeholder">{profile?.full_name?.charAt(0)}</div>
                                            )}
                                            <div className="avatar-overlay">📷</div>
                                            <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleAvatarUpload(e.target.files[0])} />
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--dark-400)' }}>
                                            {actionLoading.avatarUpload ? 'Uploading...' : 'Click avatar to change'}
                                        </p>
                                    </div>
                                    <div className="form-group">
                                        <label>Full Name</label>
                                        <input type="text" className="form-input" value={profileForm.full_name} onChange={e => setProfileForm({ ...profileForm, full_name: e.target.value })} required />
                                    </div>
                                    <div className="grid-2">
                                        <div className="form-group">
                                            <label>Branch</label>
                                            <select className="form-input" value={profileForm.branch} onChange={e => setProfileForm({ ...profileForm, branch: e.target.value })}>
                                                <option value="">Select Branch</option>
                                                {['Computer Engineering', 'Information Technology', 'Electrical Engineering', 'Electronics & Communication', 'Mechanical Engineering', 'Civil Engineering', 'Production & Industrial', 'Physics', 'Mathematics', 'Chemistry', 'Other'].map(b => (
                                                    <option key={b} value={b}>{b}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Year</label>
                                            <select className="form-input" value={profileForm.year} onChange={e => setProfileForm({ ...profileForm, year: e.target.value })}>
                                                <option value="">Select Year</option>
                                                {['1st Year', '2nd Year', '3rd Year', '4th Year', 'PhD', 'Alumni'].map(y => (
                                                    <option key={y} value={y}>{y}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label>Bio</label>
                                        <textarea className="form-input" value={profileForm.bio} onChange={e => setProfileForm({ ...profileForm, bio: e.target.value })} rows={3} placeholder="Tell us about yourself..." />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button type="submit" className="btn btn-primary" disabled={actionLoading.updateProfile}>
                                            {actionLoading.updateProfile ? 'Saving...' : 'Save Changes'}
                                        </button>
                                        <button type="button" onClick={() => setShowProfileEdit(false)} className="btn btn-secondary">Cancel</button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                )}

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="animate-fade-in">
                        <div className="grid-3">
                            {[
                                { label: 'My Clubs', value: myClubs.filter(c => c.status === 'active').length, icon: '🏛️', color: 'var(--primary-500)' },
                                { label: 'Events Registered', value: myEvents.length, icon: '🎯', color: 'var(--accent-500)' },
                                { label: 'Certificates', value: myCertificates.length, icon: '📜', color: 'var(--success-500)' },
                            ].map((stat, i) => (
                                <div key={i} className="stat-card" style={{ '--accent': stat.color }}>
                                    <div className="stat-value">{stat.value}</div>
                                    <div className="stat-label">{stat.label}</div>
                                    <div className="stat-icon">{stat.icon}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid-2" style={{ marginTop: '24px' }}>
                            {/* My Active Clubs */}
                            <div className="card">
                                <div className="section-header">
                                    <h2>My Clubs</h2>
                                </div>
                                {myClubs.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '20px' }}>
                                        <p>You haven&apos;t joined any clubs yet.</p>
                                        <button onClick={() => setActiveTab('clubs')} className="btn btn-primary btn-sm mt-1">Browse Clubs</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {myClubs.slice(0, 5).map(member => (
                                            <div key={member.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '10px 14px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)'
                                            }}>
                                                <span style={{ fontWeight: 600 }}>{member.clubs?.name}</span>
                                                <span className={`badge ${member.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                                                    {member.status}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* My Upcoming Events */}
                            <div className="card">
                                <div className="section-header">
                                    <h2>📅 My Registered Events</h2>
                                </div>
                                {myEvents.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '20px' }}>
                                        <p>No upcoming events.</p>
                                        <button onClick={() => setActiveTab('events')} className="btn btn-primary btn-sm mt-1">Find Events</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {myEvents.slice(0, 5).map(reg => (
                                            <div key={reg.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '10px 14px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)'
                                            }}>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{reg.events?.title}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--dark-400)', marginTop: '2px' }}>
                                                        {reg.events?.date ? new Date(reg.events.date).toLocaleDateString() : ''} · {reg.events?.venue}
                                                    </div>
                                                </div>
                                                {(() => {
                                                    const eventDone = reg.events?.status === 'completed' || (reg.events?.registration_deadline && new Date(reg.events.registration_deadline) < new Date()) || (reg.events?.date && new Date(reg.events.date) < new Date());
                                                    return eventDone ? (
                                                        <span className="badge badge-primary" style={{ flexShrink: 0 }}>Completed</span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleUnregisterEvent(reg.id, reg.events?.title)}
                                                            className="btn btn-danger btn-sm"
                                                            disabled={actionLoading[`unreg_${reg.id}`]}
                                                            style={{ flexShrink: 0 }}
                                                        >
                                                            {actionLoading[`unreg_${reg.id}`] ? '...' : 'Unregister'}
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Clubs Tab */}
                {activeTab === 'clubs' && (
                    <div className="animate-fade-in">
                        <div style={{ marginBottom: '24px' }}>
                            <div className="search-bar">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Search clubs..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid-3">
                            {filteredClubs.map(club => {
                                const membership = myClubs.find(m => m.club_id === club.id);
                                return (
                                    <div key={club.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                            {club.logo_url ? (
                                                <img src={club.logo_url} alt={club.name} style={{
                                                    width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover',
                                                    border: '2px solid var(--primary-500)'
                                                }} />
                                            ) : (
                                                <div style={{
                                                    width: '48px', height: '48px', background: 'linear-gradient(135deg, var(--primary-600), var(--primary-400))', borderRadius: '50%',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem'
                                                }}>
                                                    🏛️
                                                </div>
                                            )}
                                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{club.name}</h3>
                                        </div>
                                        <p style={{ color: 'var(--dark-400)', fontSize: '0.9rem', flex: 1, marginBottom: '16px' }}>
                                            {club.description || 'No description available'}
                                        </p>
                                        {membership ? (
                                            <button className="btn btn-secondary btn-sm" disabled style={{ width: '100%' }}>
                                                {membership.status === 'active' ? '✅ Member' : '⏳ Requested'}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleJoinClub(club.id)}
                                                className="btn btn-primary btn-sm"
                                                style={{ width: '100%' }}
                                                disabled={actionLoading[club.id]}
                                            >
                                                {actionLoading[club.id] ? 'Joining...' : 'Join Club'}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {filteredClubs.length === 0 && <div className="empty-state">No clubs found matching your search.</div>}
                    </div>
                )}

                {/* Events Tab */}
                {activeTab === 'events' && (
                    <div className="animate-fade-in">
                        <div style={{ marginBottom: '24px' }}>
                            <div className="search-bar">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Search events..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="grid-2">
                            {filteredEvents.map(event => {
                                const isRegistered = myEvents.some(r => r.event_id === event.id);
                                const myReg = myEvents.find(r => r.event_id === event.id);
                                const deadlinePassed = event.registration_deadline && new Date(event.registration_deadline) < new Date();

                                return (
                                    <div key={event.id} className="card">
                                        {event.poster_url && (
                                            <div style={{ marginBottom: '16px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                                <img src={event.poster_url} alt={event.title} style={{ width: '100%', maxHeight: '200px', objectFit: 'cover' }} />
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                                            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{event.title}</h3>
                                            <span className="badge badge-primary">{event.clubs?.name}</span>
                                        </div>

                                        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', fontSize: '0.9rem', color: 'var(--dark-300)', flexWrap: 'wrap' }}>
                                            <span>📅 {new Date(event.date).toLocaleString()}</span>
                                            <span>📍 {event.venue}</span>
                                        </div>

                                        <p style={{ color: 'var(--dark-400)', fontSize: '0.9rem', marginBottom: '12px', lineHeight: 1.6 }}>
                                            {event.description}
                                        </p>

                                        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', fontSize: '0.8rem', color: 'var(--dark-400)', flexWrap: 'wrap' }}>
                                            <span>👥 Max: {event.max_participants || '∞'}</span>
                                            <span>📝 Type: {event.registration_type}</span>
                                            {event.registration_deadline && (
                                                <span style={{ color: deadlinePassed ? 'var(--error-400)' : 'var(--success-400)' }}>
                                                    ⏰ Deadline: {new Date(event.registration_deadline).toLocaleString()}
                                                    {deadlinePassed && ' (Passed)'}
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--dark-700)', paddingTop: '16px', gap: '8px', flexWrap: 'wrap' }}>
                                            {isRegistered ? (
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                    <button className="btn btn-success btn-sm" disabled>
                                                        ✅ Registered
                                                    </button>
                                                    {!deadlinePassed && event.status !== 'completed' && new Date(event.date) > new Date() && (
                                                        <button
                                                            onClick={() => handleUnregisterEvent(myReg.id, event.title)}
                                                            className="btn btn-danger btn-sm"
                                                            disabled={actionLoading[`unreg_${myReg?.id}`]}
                                                        >
                                                            {actionLoading[`unreg_${myReg?.id}`] ? '...' : 'Unregister'}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => { setFeedbackForm({ eventId: event.id, rating: 0, comment: '' }); setShowFeedbackModal(true); }}
                                                        className="btn btn-secondary btn-sm"
                                                    >
                                                        ⭐ Feedback
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleRegisterEvent(event.id, event.registration_type)}
                                                    className="btn btn-primary btn-sm"
                                                    disabled={actionLoading[event.id] || deadlinePassed}
                                                >
                                                    {deadlinePassed ? 'Deadline Passed' : actionLoading[event.id] ? '...' : `Register (${event.registration_type})`}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {filteredEvents.length === 0 && <div className="empty-state">No events found matching your search.</div>}

                        {/* Feedback Modal */}
                        {showFeedbackModal && (
                            <div className="modal-overlay" onClick={() => setShowFeedbackModal(false)}>
                                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                                    <div className="modal-header">
                                        <h2>⭐ Submit Feedback</h2>
                                        <button className="modal-close" onClick={() => setShowFeedbackModal(false)}>×</button>
                                    </div>
                                    <form onSubmit={handleSubmitFeedback}>
                                        <div className="form-group">
                                            <label>Rating</label>
                                            <div style={{ display: 'flex', gap: '8px', fontSize: '1.8rem', cursor: 'pointer' }}>
                                                {[1, 2, 3, 4, 5].map(star => (
                                                    <span key={star}
                                                        onClick={() => setFeedbackForm({ ...feedbackForm, rating: star })}
                                                        style={{ color: star <= feedbackForm.rating ? 'var(--accent-400)' : 'var(--dark-600)', transition: 'color 0.2s' }}
                                                    >★</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Comment (optional)</label>
                                            <textarea className="form-input" value={feedbackForm.comment}
                                                onChange={e => setFeedbackForm({ ...feedbackForm, comment: e.target.value })}
                                                rows={3} placeholder="Share your experience..." />
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <button type="submit" className="btn btn-primary" disabled={actionLoading.submitFeedback || feedbackForm.rating === 0}>
                                                {actionLoading.submitFeedback ? 'Submitting...' : 'Submit Feedback'}
                                            </button>
                                            <button type="button" onClick={() => setShowFeedbackModal(false)} className="btn btn-secondary">Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'certificates' && (
                    <div className="animate-fade-in">
                        <div className="card">
                            <div className="section-header">
                                <h2>My Certificates</h2>
                                <span className="badge badge-success">{myCertificates.length}</span>
                            </div>

                            {myCertificates.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">📜</div>
                                    <h3>No Certificates Yet</h3>
                                    <p>Participate in events to earn certificates!</p>
                                </div>
                            ) : (
                                <div className="grid-3">
                                    {myCertificates.map(cert => (
                                        <div key={cert.id} className="glass-card" style={{ padding: '24px', textAlign: 'center', border: '1px solid var(--primary-900)' }}>
                                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎓</div>
                                            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '4px' }}>{cert.events?.title}</h3>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--dark-400)', marginBottom: '16px' }}>
                                                Issued: {new Date(cert.issue_date).toLocaleDateString()}
                                            </p>
                                            <button onClick={() => generateCertificate(cert)} className="btn btn-primary btn-sm" style={{ width: '100%' }}>
                                                Download PDF
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Group Chat Tab */}
                {activeTab === 'chat' && (
                    <div className="animate-fade-in">
                        {(() => {
                            const activeClubMemberships = myClubs.filter(m => m.status === 'active');
                            if (activeClubMemberships.length === 0) return (
                                <div className="card">
                                    <div className="empty-state">
                                        <div className="empty-icon">💬</div>
                                        <h3>No Club Chats Available</h3>
                                        <p>Join a club and get approved to access group chats.</p>
                                    </div>
                                </div>
                            );
                            return (
                                <>
                                    <div className="club-selector">
                                        {activeClubMemberships.map(m => (
                                            <button key={m.club_id}
                                                className={`club-selector-btn ${selectedChatClub === m.club_id ? 'active' : ''}`}
                                                onClick={() => selectChatClub(m.club_id)}>
                                                {m.clubs?.name || 'Club'}
                                            </button>
                                        ))}
                                    </div>
                                    {selectedChatClub ? (
                                        <div className="chat-container">
                                            <div className="chat-header">
                                                <span style={{ fontSize: '1.3rem' }}>💬</span>
                                                <h3>{activeClubMemberships.find(m => m.club_id === selectedChatClub)?.clubs?.name} Chat</h3>
                                            </div>
                                            <div className="chat-messages">
                                                {chatMessages.length === 0 ? (
                                                    <div className="empty-state" style={{ padding: '40px' }}>
                                                        <div className="empty-icon">💬</div>
                                                        <h3>No messages yet</h3>
                                                        <p>Be the first to say something!</p>
                                                    </div>
                                                ) : (
                                                    chatMessages.map(msg => (
                                                        <div key={msg.id} className="chat-bubble-with-avatar" style={{ justifyContent: msg.sender_id === profile?.id ? 'flex-end' : 'flex-start' }}>
                                                            {msg.sender_id !== profile?.id && (
                                                                msg.profiles?.avatar_url ? (
                                                                    <img src={msg.profiles.avatar_url} className="chat-avatar-small" onClick={() => setProfileModalUserId(msg.sender_id)} alt="" />
                                                                ) : (
                                                                    <div className="chat-avatar-placeholder-small" onClick={() => setProfileModalUserId(msg.sender_id)}>
                                                                        {msg.profiles?.full_name?.charAt(0) || '?'}
                                                                    </div>
                                                                )
                                                            )}
                                                            <div className={`chat-bubble ${msg.sender_id === profile?.id ? 'chat-bubble-own' : ''}`}>
                                                                <div className="chat-sender">{msg.profiles?.full_name || 'Unknown'}</div>
                                                                <div>{msg.message}</div>
                                                                <div className="chat-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                                <div ref={chatEndRef} />
                                            </div>
                                            {chatSettings === 'muted' ? (
                                                <div className="chat-muted-notice">🔇 Chat is currently muted by the club leader</div>
                                            ) : chatSettings === 'admins_only' ? (
                                                <div className="chat-muted-notice">🔒 Only club leaders can send messages</div>
                                            ) : (
                                                <form className="chat-input-container" onSubmit={handleSendChatMessage}>
                                                    <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." />
                                                    <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()}>➤</button>
                                                </form>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="card">
                                            <div className="empty-state" style={{ padding: '40px' }}>
                                                <div className="empty-icon">👆</div>
                                                <h3>Select a Club</h3>
                                                <p>Choose a club above to open its group chat.</p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* Notifications Tab */}
                {activeTab === 'notifications' && (
                    <div className="animate-fade-in">
                        {/* Broadcast Notifications */}
                        {broadcastNotifs.length > 0 && (
                            <div className="card" style={{ marginBottom: '24px' }}>
                                <div className="section-header">
                                    <h2>📢 Broadcast Notifications</h2>
                                    <span className="section-count">{broadcastNotifs.length}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {broadcastNotifs.map(notif => (
                                        <div key={notif.id} style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.2)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{notif.title}</h4>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {notif.clubs?.name && <span className="badge badge-primary">{notif.clubs.name}</span>}
                                                    {!notif.clubs && <span className="badge badge-warning">Admin</span>}
                                                    <span style={{ color: 'var(--dark-500)', fontSize: '0.75rem' }}>{new Date(notif.created_at).toLocaleString()}</span>
                                                </div>
                                            </div>
                                            <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>{notif.message}</p>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--dark-500)', marginTop: '6px' }}>By: {notif.profiles?.full_name || 'System'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* System Notifications */}
                        <div className="card">
                            <div className="section-header"><h2>🔔 System Notifications</h2></div>
                            {notifications.length === 0 ? (
                                <div className="empty-state" style={{ padding: '24px' }}><p>No system notifications</p></div>
                            ) : (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                                        <button onClick={async () => {
                                            const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
                                            if (unreadIds.length > 0) {
                                                await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
                                                fetchData();
                                            }
                                        }} className="btn btn-secondary btn-sm">Mark All as Read</button>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {notifications.map(notif => (
                                            <div key={notif.id} style={{ padding: '14px 16px', background: notif.is_read ? 'transparent' : 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-md)', border: `1px solid ${notif.is_read ? 'var(--dark-700)' : 'rgba(99,102,241,0.2)'}`, position: 'relative' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{notif.title}</h4>
                                                    <span style={{ color: 'var(--dark-500)', fontSize: '0.75rem' }}>{new Date(notif.created_at).toLocaleString()}</span>
                                                </div>
                                                <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px', paddingRight: '24px' }}>{notif.message}</p>
                                                {!notif.is_read && (
                                                    <button onClick={async (e) => { e.stopPropagation(); await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id); fetchData(); }}
                                                        style={{ position: 'absolute', bottom: '10px', right: '10px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary-500)', fontSize: '1.2rem' }} title="Mark as read">✓</button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </main>
            {profileModalUserId && <ProfileModal userId={profileModalUserId} onClose={() => setProfileModalUserId(null)} />}
        </div>
    );
}

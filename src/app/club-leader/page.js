'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

export default function ClubLeaderDashboard() {
    const router = useRouter();
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;
    const [profile, setProfile] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Data
    const [myClub, setMyClub] = useState(null);
    const [members, setMembers] = useState([]);
    const [events, setEvents] = useState([]);
    const [registrations, setRegistrations] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [feedback, setFeedback] = useState([]);
    const [broadcastNotifs, setBroadcastNotifs] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [showNotifForm, setShowNotifForm] = useState(false);
    const [notifForm, setNotifForm] = useState({ title: '', message: '' });
    const chatEndRef = useRef(null);

    // Forms
    const [showEventModal, setShowEventModal] = useState(false);
    const [showEditClub, setShowEditClub] = useState(false);
    const [eventForm, setEventForm] = useState({
        title: '', description: '', date: '', venue: '', category: '',
        max_participants: 100, registration_type: 'individual', registration_deadline: '', poster: null
    });
    const [clubForm, setClubForm] = useState({ name: '', description: '' });

    const fetchData = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (!prof || prof.role !== 'club_leader' || prof.status !== 'active') {
            router.push('/login'); return;
        }
        setProfile(prof);

        // Get club
        const { data: club } = await supabase.from('clubs').select('*').eq('admin_id', user.id).single();
        if (club) {
            setMyClub(club);
            setClubForm({ name: club.name, description: club.description || '' });

            // Fetch related data in parallel
            const [
                { data: mems },
                { data: evts },
                { data: notifs },
                { data: fb },
                { data: bNotifs },
                { data: msgs }
            ] = await Promise.all([
                supabase.from('club_members').select('*, profiles(full_name, email, roll_number)').eq('club_id', club.id).order('created_at', { ascending: false }),
                supabase.from('events').select('*').eq('club_id', club.id).order('created_at', { ascending: false }),
                supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
                supabase.from('event_feedback').select('*, profiles(full_name), events(title)').in('event_id',
                    (await supabase.from('events').select('id').eq('club_id', club.id)).data?.map(e => e.id) || []
                ),
                supabase.from('broadcast_notifications').select('*, profiles:creator_id(full_name)').eq('club_id', club.id).order('created_at', { ascending: false }).limit(30),
                supabase.from('chat_messages').select('*, profiles:sender_id(full_name)').eq('club_id', club.id).order('created_at', { ascending: true }).limit(200)
            ]);

            setMembers(mems || []);
            setEvents(evts || []);
            setNotifications(notifs || []);
            setFeedback(fb || []);
            setBroadcastNotifs(bNotifs || []);
            setChatMessages(msgs || []);

            // Fetch registrations for all events
            if (evts && evts.length > 0) {
                const { data: regs } = await supabase
                    .from('registrations')
                    .select('*, profiles:user_id(full_name, email, roll_number), events:event_id(title)')
                    .in('event_id', evts.map(e => e.id));
                setRegistrations(regs || []);
            }
        }

        setLoading(false);
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Realtime chat subscription
    useEffect(() => {
        if (!myClub) return;
        const channel = supabase.channel(`chat-${myClub.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `club_id=eq.${myClub.id}` }, async (payload) => {
                const { data } = await supabase.from('chat_messages').select('*, profiles:sender_id(full_name)').eq('id', payload.new.id).single();
                if (data) setChatMessages(prev => [...prev, data]);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [myClub, supabase]);

    // Auto-scroll chat
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleMemberAction = async (memberId, action) => {
        if (!confirm(`Are you sure you want to ${action} this member?`)) return;
        setActionLoading(prev => ({ ...prev, [memberId]: true }));
        try {
            const newStatus = action === 'approve' ? 'active' : 'rejected';
            await supabase.from('club_members').update({ status: newStatus }).eq('id', memberId);
            fetchData();
        } catch (err) {
            alert('Error updating member');
        }
        setActionLoading(prev => ({ ...prev, [memberId]: false }));
    };

    const handleCreateEvent = async (e) => {
        e.preventDefault();
        setActionLoading(prev => ({ ...prev, createEvent: true }));
        try {
            let posterUrl = null;
            // Upload poster if provided
            if (eventForm.poster) {
                const file = eventForm.poster;
                const ext = file.name.split('.').pop();
                const path = `${myClub.id}/posters/${Date.now()}.${ext}`;
                const { error: uploadErr } = await supabase.storage.from('club-assets').upload(path, file, { upsert: true });
                if (uploadErr) throw uploadErr;
                const { data: { publicUrl } } = supabase.storage.from('club-assets').getPublicUrl(path);
                posterUrl = publicUrl;
            }

            const { poster, ...formData } = eventForm;
            const { error } = await supabase.from('events').insert({
                ...formData,
                club_id: myClub.id,
                status: 'pending',
                max_participants: parseInt(eventForm.max_participants),
                date: new Date(eventForm.date).toISOString(),
                registration_deadline: eventForm.registration_deadline ? new Date(eventForm.registration_deadline).toISOString() : null,
                poster_url: posterUrl
            });
            if (error) throw error;
            setShowEventModal(false);
            setEventForm({ title: '', description: '', date: '', venue: '', category: '', max_participants: 100, registration_type: 'individual', registration_deadline: '', poster: null });
            fetchData();
            alert('Event created! It will be visible once an admin approves it.');
        } catch (err) {
            alert('Error creating event: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, createEvent: false }));
    };

    const handleMarkEventCompleted = async (eventId, eventTitle) => {
        if (!confirm(`Are you sure you want to mark "${eventTitle}" as completed? This cannot be undone.`)) return;
        setActionLoading(prev => ({ ...prev, [`complete_${eventId}`]: true }));
        try {
            const { error } = await supabase.from('events').update({ status: 'completed' }).eq('id', eventId);
            if (error) throw error;
            alert('Event marked as completed!');
            fetchData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, [`complete_${eventId}`]: false }));
    };

    const handleUpdateClub = async (e) => {
        e.preventDefault();
        try {
            await supabase.from('clubs').update({
                name: clubForm.name,
                description: clubForm.description
            }).eq('id', myClub.id);
            setShowEditClub(false);
            fetchData();
            alert('Club profile updated!');
        } catch (err) {
            alert('Error updating club');
        }
    };

    const handleGenerateCertificates = async (eventId) => {
        setActionLoading(prev => ({ ...prev, [`cert_${eventId}`]: true }));
        try {
            const { data, error } = await supabase.rpc('generate_certificates_for_event', { target_event_id: eventId });
            if (error) throw error;
            alert(`Generated ${data} certificates!`);
            fetchData();
        } catch (err) {
            alert('Error generating certificates: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, [`cert_${eventId}`]: false }));
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!chatInput.trim() || !myClub) return;
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('chat_messages').insert({
            club_id: myClub.id,
            sender_id: user.id,
            message: chatInput.trim()
        });
        if (!error) setChatInput('');
    };

    const handleUploadFile = async (file, type) => {
        if (!file || !myClub) return;
        setActionLoading(prev => ({ ...prev, [`upload_${type}`]: true }));
        try {
            const ext = file.name.split('.').pop();
            const path = `${myClub.id}/${type}.${ext}`;
            const { error: uploadErr } = await supabase.storage.from('club-assets').upload(path, file, { upsert: true });
            if (uploadErr) throw uploadErr;
            const { data: { publicUrl } } = supabase.storage.from('club-assets').getPublicUrl(path);
            const updateCol = type === 'logo' ? 'logo_url' : 'leader_signature_url';
            await supabase.from('clubs').update({ [updateCol]: publicUrl }).eq('id', myClub.id);
            fetchData();
            alert(`${type === 'logo' ? 'Club display picture' : 'Signature'} uploaded!`);
        } catch (err) {
            alert('Upload error: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, [`upload_${type}`]: false }));
    };

    const handleCreateNotification = async (e) => {
        e.preventDefault();
        setActionLoading(prev => ({ ...prev, createNotif: true }));
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.from('broadcast_notifications').insert({
                creator_id: user.id,
                club_id: myClub.id,
                title: notifForm.title,
                message: notifForm.message
            });
            if (error) throw error;
            setNotifForm({ title: '', message: '' });
            setShowNotifForm(false);
            fetchData();
            alert('Notification sent to club members!');
        } catch (err) {
            alert('Error: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, createNotif: false }));
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    if (loading) {
        return <div className="loading-screen"><div className="spinner" /><p style={{ color: 'var(--dark-400)' }}>Loading Dashboard...</p></div>;
    }

    const pendingMembers = members.filter(m => m.status === 'pending');
    const activeMembers = members.filter(m => m.status === 'active');
    const activeEvents = events.filter(e => e.status === 'active');
    const pendingEvents = events.filter(e => e.status === 'pending');
    const completedEvents = events.filter(e => e.status === 'completed');

    if (!myClub) {
        return (
            <div className="dashboard-layout">
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <img src="/nit-logo-white.png" alt="NIT KKR" />
                        <div><h2>Club Leader</h2></div>
                    </div>
                    <div className="sidebar-footer">
                        <div style={{ fontSize: '0.85rem', color: 'var(--dark-300)', marginBottom: '8px', fontWeight: 600 }}>{profile?.full_name}</div>
                        <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>Logout</button>
                    </div>
                </aside>
                <main className="dashboard-main">
                    <div className="card" style={{ maxWidth: '600px', margin: '40px auto', textAlign: 'center', padding: '40px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
                        <h2>Club Setup Incomplete</h2>
                        <p style={{ color: 'var(--dark-400)', marginBottom: '24px' }}>
                            Your account is active, but no club is associated with your profile.
                            This usually happens if your account was approved manually without generating a club.
                        </p>
                        <p>Please contact an administrator to resolve this issue.</p>
                    </div>
                </main>
            </div>
        );
    }

    const sidebarLinks = [
        { key: 'overview', icon: '📊', label: 'Overview' },
        { key: 'club', icon: '🏛️', label: 'Club Profile' },
        { key: 'members', icon: '👥', label: 'Members', count: pendingMembers.length },
        { key: 'events', icon: '🎯', label: 'Events' },
        { key: 'participants', icon: '📋', label: 'Participants' },
        { key: 'chat', icon: '💬', label: 'Group Chat' },
        { key: 'analytics', icon: '📈', label: 'Analytics' },
        { key: 'notifications', icon: '🔔', label: 'Notifications', count: notifications.filter(n => !n.is_read).length },
    ];

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
                        <h2>Club Leader</h2>
                        <span>{myClub?.name || 'My Club'}</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {sidebarLinks.map(link => (
                        <button key={link.key}
                            className={`sidebar-link ${activeTab === link.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(link.key)}>
                            <span className="link-icon">{link.icon}</span>
                            <span>{link.label}</span>
                            {link.count > 0 && (
                                <span className="badge badge-warning" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>{link.count}</span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div style={{ fontSize: '0.85rem', color: 'var(--dark-300)', marginBottom: '8px', fontWeight: 600 }}>{profile?.full_name}</div>
                    <Link href="/about" style={{ fontSize: '0.8rem', color: 'var(--dark-500)', display: 'block', marginBottom: '8px' }}>About Us</Link>
                    <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>Logout</button>
                </div>
            </aside>

            {/* Main */}
            <main className="dashboard-main">
                <div className="dashboard-header">
                    <h1>
                        {activeTab === 'overview' && 'Dashboard Overview'}
                        {activeTab === 'club' && 'Club Profile'}
                        {activeTab === 'members' && 'Member Management'}
                        {activeTab === 'events' && 'Event Management'}
                        {activeTab === 'participants' && 'Event Participants'}
                        {activeTab === 'chat' && 'Group Chat'}
                        {activeTab === 'analytics' && 'Club Analytics'}
                        {activeTab === 'notifications' && 'Notifications'}
                    </h1>
                    <div className="user-info">
                        <div className="user-avatar" style={{ background: 'var(--accent-500)' }}>{profile?.full_name?.charAt(0)}</div>
                    </div>
                </div>

                {/* ===== OVERVIEW TAB ===== */}
                {activeTab === 'overview' && (
                    <div className="animate-fade-in">
                        <div className="grid-4">
                            {[
                                { label: 'Total Members', value: activeMembers.length, icon: '👥', color: 'var(--primary-500)' },
                                { label: 'Pending Requests', value: pendingMembers.length, icon: '⏳', color: 'var(--warning-500)' },
                                { label: 'Active Events', value: activeEvents.length, icon: '🎯', color: 'var(--success-500)' },
                                { label: 'Registrations', value: registrations.length, icon: '📋', color: 'var(--accent-500)' },
                            ].map((stat, i) => (
                                <div key={i} className="stat-card">
                                    <div className="stat-value">{stat.value}</div>
                                    <div className="stat-label">{stat.label}</div>
                                    <div className="stat-icon">{stat.icon}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid-2" style={{ marginTop: '24px' }}>
                            <div className="card">
                                <div className="section-header">
                                    <h2>⏳ Pending Requests</h2>
                                    <span className="badge badge-warning">{pendingMembers.length}</span>
                                </div>
                                {pendingMembers.length === 0 ? (
                                    <p style={{ color: 'var(--dark-500)' }}>No pending requests</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {pendingMembers.slice(0, 5).map(m => (
                                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{m.profiles?.full_name}</div>
                                                    <div style={{ color: 'var(--dark-400)', fontSize: '0.8rem' }}>{m.profiles?.roll_number}</div>
                                                </div>
                                                <button onClick={() => setActiveTab('members')} className="btn btn-primary btn-sm">Review</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card">
                                <div className="section-header">
                                    <h2>🎯 Recent Events</h2>
                                </div>
                                {events.length === 0 ? (
                                    <p style={{ color: 'var(--dark-500)' }}>No events yet. Create your first event!</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {events.slice(0, 5).map(e => (
                                            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{e.title}</div>
                                                    <div style={{ color: 'var(--dark-400)', fontSize: '0.8rem' }}>{new Date(e.date).toLocaleDateString()}</div>
                                                </div>
                                                <span className={`badge ${e.status === 'active' ? 'badge-success' : e.status === 'pending' ? 'badge-warning' : e.status === 'completed' ? 'badge-primary' : 'badge-danger'}`}>{e.status}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Feedback Preview */}
                        {feedback.length > 0 && (
                            <div className="card" style={{ marginTop: '24px' }}>
                                <div className="section-header"><h2>💬 Recent Feedback</h2></div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {feedback.slice(0, 5).map(fb => (
                                        <div key={fb.id} style={{ padding: '12px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{fb.profiles?.full_name}</span>
                                                <span style={{ color: 'var(--dark-400)', fontSize: '0.8rem' }}>{fb.events?.title}</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '2px', marginBottom: '4px' }}>
                                                {[1, 2, 3, 4, 5].map(s => <span key={s} style={{ color: s <= fb.rating ? 'var(--accent-400)' : 'var(--dark-600)' }}>★</span>)}
                                            </div>
                                            {fb.comment && <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>{fb.comment}</p>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ===== CLUB PROFILE TAB ===== */}
                {activeTab === 'club' && (
                    <div className="animate-fade-in">
                        <div className="card" style={{ maxWidth: '700px' }}>
                            {!showEditClub ? (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                                        {myClub?.logo_url ? (
                                            <img src={myClub.logo_url} alt="Club DP" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--primary-500)' }} />
                                        ) : (
                                            <div style={{ width: '80px', height: '80px', background: 'linear-gradient(135deg, var(--primary-600), var(--primary-400))', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem' }}>🏛️</div>
                                        )}
                                        <div>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{myClub?.name}</h2>
                                            <p style={{ color: 'var(--dark-400)' }}>Led by {profile?.full_name}</p>
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '24px' }}>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--dark-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</label>
                                        <p style={{ color: 'var(--dark-200)', marginTop: '8px' }}>{myClub?.description || 'No description set.'}</p>
                                    </div>
                                    <div className="grid-2" style={{ marginBottom: '24px' }}>
                                        <div style={{ padding: '16px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{activeMembers.length}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--dark-400)' }}>Members</div>
                                        </div>
                                        <div style={{ padding: '16px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                                            <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{events.length}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--dark-400)' }}>Events</div>
                                        </div>
                                    </div>

                                    {/* Upload Club DP */}
                                    <div style={{ marginBottom: '24px' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>📷 Club Display Picture</h3>
                                        {myClub?.logo_url && (
                                            <div className="image-preview" style={{ marginBottom: '12px' }}>
                                                <img src={myClub.logo_url} alt="Club DP" style={{ width: '120px', height: '120px' }} />
                                            </div>
                                        )}
                                        <div className="upload-area" style={{ padding: '20px' }}>
                                            <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleUploadFile(e.target.files[0], 'logo')} />
                                            <div className="upload-icon">📷</div>
                                            <div className="upload-text">{actionLoading.upload_logo ? 'Uploading...' : 'Click to upload club display picture'}</div>
                                            <div className="upload-hint">PNG, JPG up to 5MB</div>
                                        </div>
                                    </div>

                                    {/* Upload Signature */}
                                    <div style={{ marginBottom: '24px' }}>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>✍️ Leader Signature</h3>
                                        {myClub?.leader_signature_url && (
                                            <div className="image-preview" style={{ marginBottom: '12px' }}>
                                                <img src={myClub.leader_signature_url} alt="Signature" style={{ width: '200px', height: '80px', background: 'white', padding: '8px' }} />
                                            </div>
                                        )}
                                        <div className="upload-area" style={{ padding: '20px' }}>
                                            <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleUploadFile(e.target.files[0], 'signature')} />
                                            <div className="upload-icon">✍️</div>
                                            <div className="upload-text">{actionLoading.upload_signature ? 'Uploading...' : 'Click to upload your signature'}</div>
                                            <div className="upload-hint">PNG with transparent background recommended</div>
                                        </div>
                                    </div>

                                    <button onClick={() => setShowEditClub(true)} className="btn btn-primary">Edit Club Info</button>
                                </>
                            ) : (
                                <form onSubmit={handleUpdateClub}>
                                    <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '20px' }}>Edit Club Profile</h2>
                                    <div className="form-group">
                                        <label>Club Name</label>
                                        <input type="text" className="form-input" value={clubForm.name} onChange={(e) => setClubForm({ ...clubForm, name: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Description</label>
                                        <textarea className="form-input" value={clubForm.description} onChange={(e) => setClubForm({ ...clubForm, description: e.target.value })} rows={5} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button type="submit" className="btn btn-primary">Save Changes</button>
                                        <button type="button" onClick={() => setShowEditClub(false)} className="btn btn-secondary">Cancel</button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                )}

                {/* ===== MEMBERS TAB ===== */}
                {activeTab === 'members' && (
                    <div className="animate-fade-in">
                        {/* Pending */}
                        <div className="card" style={{ marginBottom: '24px' }}>
                            <div className="section-header">
                                <h2>⏳ Pending Requests</h2>
                                <span className="badge badge-warning">{pendingMembers.length}</span>
                            </div>
                            {pendingMembers.length === 0 ? (
                                <div className="empty-state" style={{ padding: '24px' }}><p>No pending membership requests.</p></div>
                            ) : (
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead><tr><th>Name</th><th>Email</th><th>Roll No.</th><th>Requested</th><th>Actions</th></tr></thead>
                                        <tbody>
                                            {pendingMembers.map(m => (
                                                <tr key={m.id}>
                                                    <td style={{ fontWeight: 600 }}>{m.profiles?.full_name}</td>
                                                    <td style={{ color: 'var(--dark-400)' }}>{m.profiles?.email}</td>
                                                    <td>{m.profiles?.roll_number || '—'}</td>
                                                    <td style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>{new Date(m.created_at).toLocaleDateString()}</td>
                                                    <td style={{ display: 'flex', gap: '8px' }}>
                                                        <button onClick={() => handleMemberAction(m.id, 'approve')} className="btn btn-success btn-sm" disabled={actionLoading[m.id]}>Approve</button>
                                                        <button onClick={() => handleMemberAction(m.id, 'reject')} className="btn btn-danger btn-sm" disabled={actionLoading[m.id]}>Reject</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Active */}
                        <div className="card">
                            <div className="section-header"><h2>✅ Active Members</h2><span className="section-count">{activeMembers.length}</span></div>
                            {activeMembers.length === 0 ? (
                                <div className="empty-state" style={{ padding: '24px' }}><p>No active members yet.</p></div>
                            ) : (
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead><tr><th>Name</th><th>Email</th><th>Roll Number</th><th>Joined</th></tr></thead>
                                        <tbody>
                                            {activeMembers.map(m => (
                                                <tr key={m.id}>
                                                    <td style={{ fontWeight: 600 }}>{m.profiles?.full_name}</td>
                                                    <td style={{ color: 'var(--dark-400)' }}>{m.profiles?.email}</td>
                                                    <td>{m.profiles?.roll_number || '—'}</td>
                                                    <td style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>{new Date(m.created_at).toLocaleDateString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ===== EVENTS TAB ===== */}
                {activeTab === 'events' && (
                    <div className="animate-fade-in">
                        <div style={{ marginBottom: '24px' }}>
                            <button onClick={() => setShowEventModal(true)} className="btn btn-primary">+ Create Event</button>
                        </div>

                        {events.length === 0 ? (
                            <div className="empty-state">
                                <div className="empty-icon">🎯</div>
                                <h3>No events yet</h3>
                                <p>Create your first event to get started!</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {events.map(event => (
                                    <div key={event.id} className="card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                            <div>
                                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>{event.title}</h3>
                                                <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginBottom: '8px' }}>
                                                    📅 {new Date(event.date).toLocaleString()} · 📍 {event.venue} · 🏷️ {event.category}
                                                </p>
                                                <p style={{ color: 'var(--dark-500)', fontSize: '0.85rem' }}>{event.description?.slice(0, 150)}...</p>
                                                <div style={{ display: 'flex', gap: '12px', marginTop: '12px', fontSize: '0.8rem', color: 'var(--dark-400)' }}>
                                                    <span>Max: {event.max_participants}</span>
                                                    <span>Type: {event.registration_type}</span>
                                                    <span>Registered: {registrations.filter(r => r.event_id === event.id).length}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', flexShrink: 0 }}>
                                                <span className={`badge ${event.status === 'active' ? 'badge-success' : event.status === 'pending' ? 'badge-warning' : event.status === 'completed' ? 'badge-primary' : 'badge-danger'}`}>{event.status}</span>
                                                {event.status === 'active' && (
                                                    <>
                                                        <button onClick={() => handleMarkEventCompleted(event.id, event.title)} className="btn btn-primary btn-sm"
                                                            disabled={actionLoading[`complete_${event.id}`]}>
                                                            {actionLoading[`complete_${event.id}`] ? '...' : '✅ Mark Completed'}
                                                        </button>
                                                        <button onClick={() => handleGenerateCertificates(event.id)} className="btn btn-secondary btn-sm"
                                                            disabled={actionLoading[`cert_${event.id}`]}>
                                                            {actionLoading[`cert_${event.id}`] ? '...' : '📜 Generate Certs'}
                                                        </button>
                                                    </>
                                                )}
                                                {event.status === 'completed' && (
                                                    <button onClick={() => handleGenerateCertificates(event.id)} className="btn btn-secondary btn-sm"
                                                        disabled={actionLoading[`cert_${event.id}`]}>
                                                        {actionLoading[`cert_${event.id}`] ? '...' : '📜 Generate Certs'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Create Event Modal */}
                        {showEventModal && (
                            <div className="modal-overlay" onClick={() => setShowEventModal(false)}>
                                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
                                    <div className="modal-header">
                                        <h2>Create New Event</h2>
                                        <button className="modal-close" onClick={() => setShowEventModal(false)}>×</button>
                                    </div>
                                    <form onSubmit={handleCreateEvent}>
                                        <div className="form-group">
                                            <label>Event Title</label>
                                            <input type="text" className="form-input" value={eventForm.title} onChange={e => setEventForm({ ...eventForm, title: e.target.value })} required />
                                        </div>
                                        <div className="form-group">
                                            <label>Description</label>
                                            <textarea className="form-input" value={eventForm.description} onChange={e => setEventForm({ ...eventForm, description: e.target.value })} rows={3} required />
                                        </div>
                                        <div className="grid-2">
                                            <div className="form-group">
                                                <label>Date & Time</label>
                                                <input type="datetime-local" className="form-input" value={eventForm.date} onChange={e => setEventForm({ ...eventForm, date: e.target.value })} required />
                                            </div>
                                            <div className="form-group">
                                                <label>Venue</label>
                                                <input type="text" className="form-input" value={eventForm.venue} onChange={e => setEventForm({ ...eventForm, venue: e.target.value })} required />
                                            </div>
                                        </div>
                                        <div className="grid-2">
                                            <div className="form-group">
                                                <label>Category</label>
                                                <select className="form-input" value={eventForm.category} onChange={e => setEventForm({ ...eventForm, category: e.target.value })} required>
                                                    <option value="">Select category</option>
                                                    <option value="workshop">Workshop</option>
                                                    <option value="hackathon">Hackathon</option>
                                                    <option value="seminar">Seminar</option>
                                                    <option value="competition">Competition</option>
                                                    <option value="cultural">Cultural</option>
                                                    <option value="sports">Sports</option>
                                                    <option value="other">Other</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Registration Type</label>
                                                <select className="form-input" value={eventForm.registration_type} onChange={e => setEventForm({ ...eventForm, registration_type: e.target.value })}>
                                                    <option value="individual">Individual</option>
                                                    <option value="team">Team</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid-2">
                                            <div className="form-group">
                                                <label>Max Participants</label>
                                                <input type="number" className="form-input" value={eventForm.max_participants} onChange={e => setEventForm({ ...eventForm, max_participants: e.target.value })} min={1} />
                                            </div>
                                            <div className="form-group">
                                                <label>Registration Deadline</label>
                                                <input type="datetime-local" className="form-input" value={eventForm.registration_deadline} onChange={e => setEventForm({ ...eventForm, registration_deadline: e.target.value })} />
                                            </div>
                                        </div>
                                        <div className="form-group">
                                            <label>Event Poster (optional)</label>
                                            <input type="file" accept="image/*" className="form-input" style={{ padding: '8px' }}
                                                onChange={e => setEventForm({ ...eventForm, poster: e.target.files[0] })} />
                                            {eventForm.poster && (
                                                <p style={{ fontSize: '0.8rem', color: 'var(--success-400)', marginTop: '4px' }}>📎 {eventForm.poster.name}</p>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                                            <button type="submit" className="btn btn-primary" disabled={actionLoading.createEvent}>
                                                {actionLoading.createEvent ? 'Creating...' : 'Create Event'}
                                            </button>
                                            <button type="button" onClick={() => setShowEventModal(false)} className="btn btn-secondary">Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ===== PARTICIPANTS TAB ===== */}
                {activeTab === 'participants' && (
                    <div className="animate-fade-in">
                        {events.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">📋</div><h3>No events yet</h3></div>
                        ) : (
                            events.map(event => {
                                const eventRegs = registrations.filter(r => r.event_id === event.id);
                                return (
                                    <div key={event.id} className="card" style={{ marginBottom: '16px' }}>
                                        <div className="section-header">
                                            <h2>{event.title}</h2>
                                            <span className="badge badge-primary">{eventRegs.length} registered</span>
                                        </div>
                                        {eventRegs.length === 0 ? (
                                            <p style={{ color: 'var(--dark-500)' }}>No registrations yet.</p>
                                        ) : (
                                            <div className="table-container">
                                                <table className="data-table">
                                                    <thead><tr><th>Name</th><th>Email</th><th>Roll No.</th><th>Type</th><th>Team</th><th>Registered</th></tr></thead>
                                                    <tbody>
                                                        {eventRegs.map(r => (
                                                            <tr key={r.id}>
                                                                <td style={{ fontWeight: 600 }}>{r.profiles?.full_name}</td>
                                                                <td style={{ color: 'var(--dark-400)' }}>{r.profiles?.email}</td>
                                                                <td>{r.profiles?.roll_number || '—'}</td>
                                                                <td><span className="badge badge-primary">{r.registration_type || 'individual'}</span></td>
                                                                <td>{r.team_name || '—'}</td>
                                                                <td style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}

                {/* ===== ANALYTICS TAB ===== */}
                {activeTab === 'analytics' && (
                    <div className="animate-fade-in">
                        <div className="grid-3">
                            {[
                                { label: 'Total Members', value: activeMembers.length, icon: '👥' },
                                { label: 'Total Events', value: events.length, icon: '🎯' },
                                { label: 'Total Registrations', value: registrations.length, icon: '📋' },
                            ].map((stat, i) => (
                                <div key={i} className="stat-card">
                                    <div className="stat-value">{stat.value}</div>
                                    <div className="stat-label">{stat.label}</div>
                                    <div className="stat-icon">{stat.icon}</div>
                                </div>
                            ))}
                        </div>

                        <div className="grid-2" style={{ marginTop: '24px' }}>
                            <div className="card">
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>📊 Event Status Breakdown</h2>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {[
                                        { label: 'Active', count: activeEvents.length, color: 'var(--success-500)' },
                                        { label: 'Pending', count: pendingEvents.length, color: 'var(--warning-500)' },
                                        { label: 'Completed', count: completedEvents.length, color: 'var(--primary-500)' },
                                    ].map((item, i) => (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                                                <span style={{ color: 'var(--dark-300)' }}>{item.label}</span>
                                                <span style={{ fontWeight: 600 }}>{item.count}</span>
                                            </div>
                                            <div style={{ height: '6px', background: 'var(--dark-700)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', background: item.color, borderRadius: '3px',
                                                    width: `${events.length > 0 ? (item.count / events.length) * 100 : 0}%`,
                                                    transition: 'width 0.5s ease'
                                                }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="card">
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>👥 Membership Stats</h2>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {[
                                        { label: 'Active', count: activeMembers.length, color: 'var(--success-500)' },
                                        { label: 'Pending', count: pendingMembers.length, color: 'var(--warning-500)' },
                                        { label: 'Rejected', count: members.filter(m => m.status === 'rejected').length, color: 'var(--error-500)' },
                                    ].map((item, i) => (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                                                <span style={{ color: 'var(--dark-300)' }}>{item.label}</span>
                                                <span style={{ fontWeight: 600 }}>{item.count}</span>
                                            </div>
                                            <div style={{ height: '6px', background: 'var(--dark-700)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', background: item.color, borderRadius: '3px',
                                                    width: `${members.length > 0 ? (item.count / members.length) * 100 : 0}%`,
                                                    transition: 'width 0.5s ease'
                                                }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Events with most registrations */}
                        <div className="card" style={{ marginTop: '24px' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>🏆 Most Popular Events</h2>
                            {events.length === 0 ? (
                                <p style={{ color: 'var(--dark-500)' }}>No events to show.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {events
                                        .map(e => ({ ...e, regCount: registrations.filter(r => r.event_id === e.id).length }))
                                        .sort((a, b) => b.regCount - a.regCount)
                                        .slice(0, 5)
                                        .map((e, i) => (
                                            <div key={e.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '12px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: i === 0 ? 'var(--accent-400)' : 'var(--dark-400)', width: '24px' }}>
                                                        #{i + 1}
                                                    </span>
                                                    <div>
                                                        <span style={{ fontWeight: 600 }}>{e.title}</span>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--dark-400)' }}>{e.category}</div>
                                                    </div>
                                                </div>
                                                <span style={{ fontWeight: 700, color: 'var(--primary-400)' }}>{e.regCount} reg.</span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        {/* Average Feedback Rating */}
                        {feedback.length > 0 && (
                            <div className="card" style={{ marginTop: '24px' }}>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>⭐ Average Feedback Rating</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--accent-400)' }}>
                                        {(feedback.reduce((acc, f) => acc + (f.rating || 0), 0) / feedback.length).toFixed(1)}
                                    </span>
                                    <div>
                                        <div style={{ display: 'flex', gap: '2px' }}>
                                            {[1, 2, 3, 4, 5].map(s => {
                                                const avg = feedback.reduce((acc, f) => acc + (f.rating || 0), 0) / feedback.length;
                                                return <span key={s} style={{ color: s <= Math.round(avg) ? 'var(--accent-400)' : 'var(--dark-600)', fontSize: '1.2rem' }}>★</span>;
                                            })}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--dark-400)' }}>Based on {feedback.length} reviews</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ===== GROUP CHAT TAB ===== */}
                {activeTab === 'chat' && (
                    <div className="animate-fade-in">
                        <div className="chat-container">
                            <div className="chat-header">
                                <span style={{ fontSize: '1.3rem' }}>💬</span>
                                <h3>{myClub?.name} — Group Chat</h3>
                                <span className="badge badge-success" style={{ marginLeft: 'auto' }}>{activeMembers.length} members</span>
                            </div>
                            <div className="chat-messages">
                                {chatMessages.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '40px' }}>
                                        <div className="empty-icon">💬</div>
                                        <h3>No messages yet</h3>
                                        <p>Start a conversation with your club members!</p>
                                    </div>
                                ) : (
                                    chatMessages.map(msg => (
                                        <div key={msg.id} className={`chat-bubble ${msg.sender_id === profile?.id ? 'chat-bubble-own' : ''}`}>
                                            <div className="chat-sender">{msg.profiles?.full_name || 'Unknown'}</div>
                                            <div>{msg.message}</div>
                                            <div className="chat-time">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    ))
                                )}
                                <div ref={chatEndRef} />
                            </div>
                            <form className="chat-input-container" onSubmit={handleSendMessage}>
                                <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." />
                                <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()}>➤</button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ===== NOTIFICATIONS TAB ===== */}
                {activeTab === 'notifications' && (
                    <div className="animate-fade-in">
                        {/* Create Notification */}
                        <div style={{ marginBottom: '24px' }}>
                            <button onClick={() => setShowNotifForm(!showNotifForm)} className="btn btn-primary">
                                {showNotifForm ? 'Cancel' : '📢 Create Club Notification'}
                            </button>
                        </div>

                        {showNotifForm && (
                            <div className="card" style={{ marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>📢 Notify Club Members</h2>
                                <form onSubmit={handleCreateNotification}>
                                    <div className="form-group">
                                        <label>Title</label>
                                        <input type="text" className="form-input" value={notifForm.title}
                                            onChange={e => setNotifForm({ ...notifForm, title: e.target.value })} required
                                            placeholder="e.g. Meeting Tomorrow" />
                                    </div>
                                    <div className="form-group">
                                        <label>Message</label>
                                        <textarea className="form-input" value={notifForm.message}
                                            onChange={e => setNotifForm({ ...notifForm, message: e.target.value })} required
                                            rows={4} placeholder="Write your notification message..." />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button type="submit" className="btn btn-primary" disabled={actionLoading.createNotif}>
                                            {actionLoading.createNotif ? 'Sending...' : 'Send to Club Members'}
                                        </button>
                                        <button type="button" onClick={() => setShowNotifForm(false)} className="btn btn-secondary">Cancel</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Broadcast Notifications */}
                        <div className="card" style={{ marginBottom: '24px' }}>
                            <div className="section-header">
                                <h2>📢 Club Broadcasts</h2>
                                <span className="section-count">{broadcastNotifs.length}</span>
                            </div>
                            {broadcastNotifs.length === 0 ? (
                                <div className="empty-state" style={{ padding: '24px' }}><p>No broadcasts sent yet.</p></div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {broadcastNotifs.map(notif => (
                                        <div key={notif.id} style={{ padding: '14px 16px', background: 'rgba(99,102,241,0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(99,102,241,0.2)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{notif.title}</h4>
                                                <span style={{ color: 'var(--dark-500)', fontSize: '0.75rem' }}>{new Date(notif.created_at).toLocaleString()}</span>
                                            </div>
                                            <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>{notif.message}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

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
        </div>
    );
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import Footer from '@/components/Footer';

export default function AdminDashboard() {
    const router = useRouter();
    const supabaseRef = useRef(createClient());
    const supabase = supabaseRef.current;
    const [profile, setProfile] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState({});
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Data states
    const [stats, setStats] = useState({ users: 0, clubs: 0, events: 0, students: 0 });
    const [pendingLeaders, setPendingLeaders] = useState([]);
    const [pendingAdmins, setPendingAdmins] = useState([]);
    const [pendingEvents, setPendingEvents] = useState([]);
    const [allEvents, setAllEvents] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [broadcastNotifs, setBroadcastNotifs] = useState([]);
    const [showNotifForm, setShowNotifForm] = useState(false);
    const [notifForm, setNotifForm] = useState({ title: '', message: '' });
    const [userSearch, setUserSearch] = useState('');
    const [eventSearch, setEventSearch] = useState('');

    // Profile editing
    const [profileForm, setProfileForm] = useState({ full_name: '', branch: '', year: '', bio: '' });
    const [showProfileEdit, setShowProfileEdit] = useState(false);

    const fetchData = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (!prof || prof.role !== 'admin' || prof.status !== 'active') {
            router.push('/login'); return;
        }
        setProfile(prof);
        setProfileForm({ full_name: prof.full_name || '', branch: prof.branch || '', year: prof.year || '', bio: prof.bio || '' });

        // Fetch all data in parallel
        const [
            { data: users },
            { data: clubs },
            { data: events },
            { data: pLeaders },
            { data: pAdmins },
            { data: pEvents },
            { data: notifs },
            { data: bNotifs },
        ] = await Promise.all([
            supabase.from('profiles').select('*').order('created_at', { ascending: false }),
            supabase.from('clubs').select('*'),
            supabase.from('events').select('*, clubs(name)').order('created_at', { ascending: false }),
            supabase.from('profiles').select('*').eq('role', 'club_leader').eq('status', 'pending'),
            supabase.from('profiles').select('*').eq('role', 'admin').eq('status', 'pending'),
            supabase.from('events').select('*, clubs(name)').eq('status', 'pending'),
            supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
            supabase.from('broadcast_notifications').select('*, profiles:creator_id(full_name)').is('club_id', null).order('created_at', { ascending: false }).limit(30),
        ]);

        setAllUsers(users || []);
        setAllEvents(events || []);
        setPendingLeaders(pLeaders || []);
        setPendingAdmins(pAdmins || []);
        setPendingEvents(pEvents || []);
        setNotifications(notifs || []);
        setBroadcastNotifs(bNotifs || []);
        setStats({
            users: (users || []).length,
            clubs: (clubs || []).length,
            events: (events || []).length,
            students: (users || []).filter(u => u.role === 'student' && u.status === 'active').length,
        });
        setLoading(false);
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleAction = async (action, id, type) => {
        if (!confirm(`Are you sure you want to ${action} this ${type === 'event' ? 'event' : 'user'}?`)) return;
        setActionLoading(prev => ({ ...prev, [id]: true }));
        try {
            if (action === 'approve' && type === 'club_leader') {
                await supabase.rpc('approve_club_leader', { target_user_id: id });
            } else if (action === 'approve' && type === 'admin') {
                await supabase.rpc('approve_admin', { target_user_id: id });
            } else if (action === 'reject' && (type === 'club_leader' || type === 'admin')) {
                await supabase.rpc('reject_user', { target_user_id: id });
            } else if (action === 'approve' && type === 'event') {
                await supabase.rpc('approve_event', { target_event_id: id });
            } else if (action === 'reject' && type === 'event') {
                await supabase.rpc('reject_event', { target_event_id: id });
            }
            fetchData();
        } catch (err) {
            console.error(err);
        }
        setActionLoading(prev => ({ ...prev, [id]: false }));
    };

    const handleMarkEventCompleted = async (eventId, eventTitle) => {
        if (!confirm(`Mark "${eventTitle}" as completed?`)) return;
        setActionLoading(prev => ({ ...prev, [`complete_${eventId}`]: true }));
        try {
            await supabase.from('events').update({ status: 'completed' }).eq('id', eventId);
            alert('Event marked as completed!');
            fetchData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, [`complete_${eventId}`]: false }));
    };

    const handleDeactivateUser = async (userId, userName) => {
        if (!confirm(`Deactivate user "${userName}"? They will not be able to login.`)) return;
        setActionLoading(prev => ({ ...prev, [`deact_${userId}`]: true }));
        try {
            await supabase.from('profiles').update({ status: 'rejected' }).eq('id', userId);
            alert(`User ${userName} has been deactivated.`);
            fetchData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, [`deact_${userId}`]: false }));
    };

    const handleActivateUser = async (userId, userName) => {
        if (!confirm(`Re-activate user "${userName}"?`)) return;
        setActionLoading(prev => ({ ...prev, [`act_${userId}`]: true }));
        try {
            await supabase.from('profiles').update({ status: 'active' }).eq('id', userId);
            alert(`User ${userName} has been activated.`);
            fetchData();
        } catch (err) {
            alert('Error: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, [`act_${userId}`]: false }));
    };

    const handleCreateNotification = async (e) => {
        e.preventDefault();
        setActionLoading(prev => ({ ...prev, createNotif: true }));
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase.from('broadcast_notifications').insert({
                creator_id: user.id,
                club_id: null,
                title: notifForm.title,
                message: notifForm.message
            });
            if (error) throw error;
            setNotifForm({ title: '', message: '' });
            setShowNotifForm(false);
            fetchData();
            alert('Notification broadcast to all users!');
        } catch (err) {
            alert('Error creating notification: ' + err.message);
        }
        setActionLoading(prev => ({ ...prev, createNotif: false }));
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
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

    if (loading) {
        return <div className="loading-screen"><div className="spinner" /><p style={{ color: 'var(--dark-400)' }}>Loading Dashboard...</p></div>;
    }

    const sidebarLinks = [
        { key: 'overview', icon: '📊', label: 'Overview' },
        { key: 'profile', icon: '👤', label: 'My Profile' },
        { key: 'approvals', icon: '✅', label: 'Approvals', count: pendingLeaders.length + pendingAdmins.length },
        { key: 'events', icon: '🎯', label: 'Events', count: pendingEvents.length },
        { key: 'users', icon: '👥', label: 'All Users' },
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
                        <h2>Admin Panel</h2>
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
                                <span className="badge badge-warning" style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
                                    {link.count}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <div style={{ fontSize: '0.85rem', color: 'var(--dark-300)', marginBottom: '8px' }}>
                        {profile?.full_name}
                        {profile?.is_primary_admin && <span className="badge badge-primary" style={{ marginLeft: '8px' }}>Primary</span>}
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
                        {activeTab === 'overview' && 'Dashboard Overview'}
                        {activeTab === 'profile' && 'My Profile'}
                        {activeTab === 'approvals' && 'Pending Approvals'}
                        {activeTab === 'events' && 'Event Management'}
                        {activeTab === 'users' && 'User Management'}
                        {activeTab === 'notifications' && 'Notifications'}
                    </h1>
                    <div className="user-info">
                        <div className="user-avatar" style={{ cursor: 'pointer', overflow: 'hidden', padding: 0 }} onClick={() => setActiveTab('profile')} title="My Profile">
                            {profile?.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            ) : profile?.full_name?.charAt(0)}
                        </div>
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
                                        <span className="badge badge-primary" style={{ marginTop: '8px' }}>Admin</span>
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
                        <div className="grid-4">
                            {[
                                { label: 'Total Users', value: stats.users, icon: '👥', color: 'var(--primary-500)' },
                                { label: 'Active Students', value: stats.students, icon: '🎓', color: 'var(--success-500)' },
                                { label: 'Total Clubs', value: stats.clubs, icon: '🏛️', color: 'var(--accent-500)' },
                                { label: 'Total Events', value: stats.events, icon: '🎯', color: 'var(--error-500)' },
                            ].map((stat, i) => (
                                <div key={i} className="stat-card" style={{ '--accent': stat.color }}>
                                    <div className="stat-value">{stat.value}</div>
                                    <div className="stat-label">{stat.label}</div>
                                    <div className="stat-icon">{stat.icon}</div>
                                </div>
                            ))}
                        </div>

                        {/* Pending Items Summary */}
                        <div className="grid-2" style={{ marginTop: '24px' }}>
                            <div className="card">
                                <div className="section-header">
                                    <h2>⏳ Pending Approvals</h2>
                                    <span className="badge badge-warning">{pendingLeaders.length + pendingAdmins.length}</span>
                                </div>
                                {pendingLeaders.length + pendingAdmins.length === 0 ? (
                                    <p style={{ color: 'var(--dark-500)', fontSize: '0.9rem' }}>No pending approvals</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {[...pendingLeaders, ...pendingAdmins].slice(0, 5).map(user => (
                                            <div key={user.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '10px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)'
                                            }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.full_name}</div>
                                                    <div style={{ color: 'var(--dark-400)', fontSize: '0.8rem' }}>{user.role === 'club_leader' ? 'Club Leader' : 'Admin'}</div>
                                                </div>
                                                <button onClick={() => setActiveTab('approvals')} className="btn btn-primary btn-sm">Review</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="card">
                                <div className="section-header">
                                    <h2>🎯 Pending Events</h2>
                                    <span className="badge badge-warning">{pendingEvents.length}</span>
                                </div>
                                {pendingEvents.length === 0 ? (
                                    <p style={{ color: 'var(--dark-500)', fontSize: '0.9rem' }}>No pending events</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {pendingEvents.slice(0, 5).map(event => (
                                            <div key={event.id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '10px', background: 'var(--dark-700)', borderRadius: 'var(--radius-md)'
                                            }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{event.title}</div>
                                                    <div style={{ color: 'var(--dark-400)', fontSize: '0.8rem' }}>{event.clubs?.name}</div>
                                                </div>
                                                <button onClick={() => setActiveTab('events')} className="btn btn-primary btn-sm">Review</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recent Users */}
                        <div className="card" style={{ marginTop: '24px' }}>
                            <div className="section-header">
                                <h2>👤 Recent Users</h2>
                            </div>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Status</th>
                                            <th>Joined</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allUsers.slice(0, 10).map(user => (
                                            <tr key={user.id}>
                                                <td style={{ fontWeight: 600 }}>{user.full_name}</td>
                                                <td style={{ color: 'var(--dark-400)' }}>{user.email}</td>
                                                <td>
                                                    <span className={`badge ${user.role === 'admin' ? 'badge-primary' : user.role === 'club_leader' ? 'badge-warning' : 'badge-success'}`}>
                                                        {user.role === 'club_leader' ? 'Club Leader' : user.role}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`badge ${user.status === 'active' ? 'badge-success' : user.status === 'pending' ? 'badge-warning' : 'badge-danger'}`}>
                                                        {user.status}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                                                    {new Date(user.created_at).toLocaleDateString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Approvals Tab */}
                {activeTab === 'approvals' && (
                    <div className="animate-fade-in">
                        {/* Pending Club Leaders */}
                        <div className="card" style={{ marginBottom: '24px' }}>
                            <div className="section-header">
                                <h2>🧑‍💼 Pending Club Leaders</h2>
                                <span className="badge badge-warning">{pendingLeaders.length}</span>
                            </div>
                            {pendingLeaders.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">✅</div>
                                    <h3>All caught up!</h3>
                                    <p>No pending club leader approvals.</p>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Email</th>
                                                <th>Club Name</th>
                                                <th>Requested</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pendingLeaders.map(leader => (
                                                <tr key={leader.id}>
                                                    <td style={{ fontWeight: 600 }}>{leader.full_name}</td>
                                                    <td style={{ color: 'var(--dark-400)' }}>{leader.email}</td>
                                                    <td><span className="badge badge-primary">{leader.requested_club_name || 'N/A'}</span></td>
                                                    <td style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                                                        {new Date(leader.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            onClick={() => handleAction('approve', leader.id, 'club_leader')}
                                                            className="btn btn-success btn-sm"
                                                            disabled={actionLoading[leader.id]}
                                                        >
                                                            {actionLoading[leader.id] ? '...' : 'Approve'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction('reject', leader.id, 'club_leader')}
                                                            className="btn btn-danger btn-sm"
                                                            disabled={actionLoading[leader.id]}
                                                        >
                                                            Reject
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Pending Admins */}
                        <div className="card">
                            <div className="section-header">
                                <h2>🧑‍⚖️ Pending Administrators</h2>
                                <span className="badge badge-warning">{pendingAdmins.length}</span>
                            </div>
                            {!profile?.is_primary_admin ? (
                                <div className="alert alert-warning">
                                    ⚠️ Only the Primary Admin can approve new administrators.
                                </div>
                            ) : pendingAdmins.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">✅</div>
                                    <h3>All caught up!</h3>
                                    <p>No pending admin approvals.</p>
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Email</th>
                                                <th>Requested</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pendingAdmins.map(admin => (
                                                <tr key={admin.id}>
                                                    <td style={{ fontWeight: 600 }}>{admin.full_name}</td>
                                                    <td style={{ color: 'var(--dark-400)' }}>{admin.email}</td>
                                                    <td style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                                                        {new Date(admin.created_at).toLocaleDateString()}
                                                    </td>
                                                    <td style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            onClick={() => handleAction('approve', admin.id, 'admin')}
                                                            className="btn btn-success btn-sm"
                                                            disabled={actionLoading[admin.id]}
                                                        >
                                                            {actionLoading[admin.id] ? '...' : 'Approve'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleAction('reject', admin.id, 'admin')}
                                                            className="btn btn-danger btn-sm"
                                                            disabled={actionLoading[admin.id]}
                                                        >
                                                            Reject
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Events Tab */}
                {activeTab === 'events' && (
                    <div className="animate-fade-in">
                        {/* Pending Events */}
                        <div className="card" style={{ marginBottom: '24px' }}>
                            <div className="section-header">
                                <h2>⏳ Pending Events</h2>
                                <span className="badge badge-warning">{pendingEvents.length}</span>
                            </div>
                            {pendingEvents.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">🎯</div>
                                    <h3>No pending events</h3>
                                    <p>All events have been reviewed.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {pendingEvents.map(event => (
                                        <div key={event.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h3 style={{ fontWeight: 700, marginBottom: '4px' }}>{event.title}</h3>
                                                <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>
                                                    {event.clubs?.name} · {event.venue} · {new Date(event.date).toLocaleDateString()}
                                                </p>
                                                <p style={{ color: 'var(--dark-500)', fontSize: '0.85rem', marginTop: '4px' }}>{event.description?.slice(0, 100)}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                                <button onClick={() => handleAction('approve', event.id, 'event')} className="btn btn-success btn-sm" disabled={actionLoading[event.id]}>
                                                    Approve
                                                </button>
                                                <button onClick={() => handleAction('reject', event.id, 'event')} className="btn btn-danger btn-sm" disabled={actionLoading[event.id]}>
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* All Events */}
                        <div className="card">
                            <div className="section-header">
                                <h2>📋 All Events</h2>
                                <span className="section-count">{allEvents.length}</span>
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <input type="text" className="form-input" placeholder="Search events..."
                                    value={eventSearch} onChange={e => setEventSearch(e.target.value)}
                                    style={{ maxWidth: '300px' }} />
                            </div>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Title</th>
                                            <th>Club</th>
                                            <th>Date</th>
                                            <th>Venue</th>
                                            <th>Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allEvents
                                            .filter(e => !eventSearch || e.title.toLowerCase().includes(eventSearch.toLowerCase()) || e.clubs?.name?.toLowerCase().includes(eventSearch.toLowerCase()))
                                            .map(event => (
                                                <tr key={event.id}>
                                                    <td style={{ fontWeight: 600 }}>{event.title}</td>
                                                    <td style={{ color: 'var(--dark-400)' }}>{event.clubs?.name}</td>
                                                    <td style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>{new Date(event.date).toLocaleDateString()}</td>
                                                    <td style={{ color: 'var(--dark-400)' }}>{event.venue}</td>
                                                    <td>
                                                        <span className={`badge ${event.status === 'active' ? 'badge-success' : event.status === 'pending' ? 'badge-warning' : event.status === 'completed' ? 'badge-primary' : 'badge-danger'}`}>
                                                            {event.status}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {event.status === 'active' && (
                                                            <button onClick={() => handleMarkEventCompleted(event.id, event.title)}
                                                                className="btn btn-primary btn-sm"
                                                                disabled={actionLoading[`complete_${event.id}`]}
                                                            >
                                                                {actionLoading[`complete_${event.id}`] ? '...' : '✅ Complete'}
                                                            </button>
                                                        )}
                                                        {event.status === 'pending' && (
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button onClick={() => handleAction('approve', event.id, 'event')} className="btn btn-success btn-sm" disabled={actionLoading[event.id]}>
                                                                    ✓
                                                                </button>
                                                                <button onClick={() => handleAction('reject', event.id, 'event')} className="btn btn-danger btn-sm" disabled={actionLoading[event.id]}>
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                    <div className="animate-fade-in">
                        <div className="card">
                            <div className="section-header">
                                <h2>All Users</h2>
                                <span className="section-count">{allUsers.length}</span>
                            </div>
                            <div style={{ marginBottom: '16px' }}>
                                <input type="text" className="form-input" placeholder="Search users by name, email, or role..."
                                    value={userSearch} onChange={e => setUserSearch(e.target.value)}
                                    style={{ maxWidth: '400px' }} />
                            </div>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Email</th>
                                            <th>Role</th>
                                            <th>Status</th>
                                            <th>Roll Number</th>
                                            <th>Joined</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allUsers
                                            .filter(u => !userSearch || u.full_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()) || u.role?.toLowerCase().includes(userSearch.toLowerCase()))
                                            .map(user => (
                                                <tr key={user.id}>
                                                    <td style={{ fontWeight: 600 }}>
                                                        {user.full_name}
                                                        {user.is_primary_admin && <span className="badge badge-primary" style={{ marginLeft: '6px' }}>Primary</span>}
                                                    </td>
                                                    <td style={{ color: 'var(--dark-400)' }}>{user.email}</td>
                                                    <td>
                                                        <span className={`badge ${user.role === 'admin' ? 'badge-primary' : user.role === 'club_leader' ? 'badge-warning' : 'badge-success'}`}>
                                                            {user.role === 'club_leader' ? 'Club Leader' : user.role}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`badge ${user.status === 'active' ? 'badge-success' : user.status === 'pending' ? 'badge-warning' : 'badge-danger'}`}>
                                                            {user.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: 'var(--dark-400)' }}>{user.roll_number || '—'}</td>
                                                    <td style={{ color: 'var(--dark-400)', fontSize: '0.85rem' }}>{new Date(user.created_at).toLocaleDateString()}</td>
                                                    <td>
                                                        {!user.is_primary_admin && user.id !== profile?.id && (
                                                            <>
                                                                {user.status === 'active' && (
                                                                    <button onClick={() => handleDeactivateUser(user.id, user.full_name)}
                                                                        className="btn btn-danger btn-sm"
                                                                        disabled={actionLoading[`deact_${user.id}`]}
                                                                    >
                                                                        {actionLoading[`deact_${user.id}`] ? '...' : 'Deactivate'}
                                                                    </button>
                                                                )}
                                                                {user.status === 'rejected' && (
                                                                    <button onClick={() => handleActivateUser(user.id, user.full_name)}
                                                                        className="btn btn-success btn-sm"
                                                                        disabled={actionLoading[`act_${user.id}`]}
                                                                    >
                                                                        {actionLoading[`act_${user.id}`] ? '...' : 'Activate'}
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* Notifications Tab */}
                {activeTab === 'notifications' && (
                    <div className="animate-fade-in">
                        {/* Create Notification */}
                        <div style={{ marginBottom: '24px' }}>
                            <button onClick={() => setShowNotifForm(!showNotifForm)} className="btn btn-primary">
                                {showNotifForm ? 'Cancel' : '📢 Create Notification'}
                            </button>
                        </div>

                        {showNotifForm && (
                            <div className="card" style={{ marginBottom: '24px' }}>
                                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>📢 Broadcast to All Users</h2>
                                <form onSubmit={handleCreateNotification}>
                                    <div className="form-group">
                                        <label>Title</label>
                                        <input type="text" className="form-input" value={notifForm.title}
                                            onChange={e => setNotifForm({ ...notifForm, title: e.target.value })} required
                                            placeholder="e.g. Important Announcement" />
                                    </div>
                                    <div className="form-group">
                                        <label>Message</label>
                                        <textarea className="form-input" value={notifForm.message}
                                            onChange={e => setNotifForm({ ...notifForm, message: e.target.value })} required
                                            rows={4} placeholder="Write your notification message..." />
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button type="submit" className="btn btn-primary" disabled={actionLoading.createNotif}>
                                            {actionLoading.createNotif ? 'Sending...' : 'Send Notification'}
                                        </button>
                                        <button type="button" onClick={() => setShowNotifForm(false)} className="btn btn-secondary">Cancel</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Broadcast Notifications Created by Admins */}
                        <div className="card" style={{ marginBottom: '24px' }}>
                            <div className="section-header">
                                <h2>📢 Broadcast Notifications</h2>
                                <span className="section-count">{broadcastNotifs.length}</span>
                            </div>
                            {broadcastNotifs.length === 0 ? (
                                <div className="empty-state" style={{ padding: '24px' }}>
                                    <p>No broadcast notifications sent yet.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {broadcastNotifs.map(notif => (
                                        <div key={notif.id} style={{
                                            padding: '14px 16px',
                                            background: 'rgba(99,102,241,0.05)',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid rgba(99,102,241,0.2)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{notif.title}</h4>
                                                <span style={{ color: 'var(--dark-500)', fontSize: '0.75rem' }}>
                                                    {new Date(notif.created_at).toLocaleString()}
                                                </span>
                                            </div>
                                            <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px' }}>{notif.message}</p>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--dark-500)', marginTop: '6px' }}>By: {notif.profiles?.full_name || 'Admin'}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* System Notifications */}
                        <div className="card">
                            <div className="section-header">
                                <h2>🔔 System Notifications</h2>
                            </div>
                            {notifications.length === 0 ? (
                                <div className="empty-state" style={{ padding: '24px' }}>
                                    <p>No system notifications</p>
                                </div>
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
                                            <div key={notif.id} style={{
                                                padding: '14px 16px',
                                                background: notif.is_read ? 'transparent' : 'rgba(99,102,241,0.05)',
                                                borderRadius: 'var(--radius-md)',
                                                border: `1px solid ${notif.is_read ? 'var(--dark-700)' : 'rgba(99,102,241,0.2)'}`,
                                                position: 'relative'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600 }}>{notif.title}</h4>
                                                    <span style={{ color: 'var(--dark-500)', fontSize: '0.75rem' }}>
                                                        {new Date(notif.created_at).toLocaleString()}
                                                    </span>
                                                </div>
                                                <p style={{ color: 'var(--dark-400)', fontSize: '0.85rem', marginTop: '4px', paddingRight: '24px' }}>{notif.message}</p>
                                                {!notif.is_read && (
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
                                                            fetchData();
                                                        }}
                                                        style={{ position: 'absolute', bottom: '10px', right: '10px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--primary-500)', fontSize: '1.2rem' }}
                                                        title="Mark as read"
                                                    >
                                                        ✓
                                                    </button>
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

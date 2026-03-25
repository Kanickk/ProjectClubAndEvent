'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function ProfileModal({ userId, onClose }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) return;
        const supabase = createClient();
        (async () => {
            const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
            setProfile(data);
            setLoading(false);
        })();
    }, [userId]);

    if (!userId) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal profile-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <button className="modal-close" onClick={onClose}>×</button>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                        <div className="spinner" />
                    </div>
                ) : !profile ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--dark-400)' }}>
                        Profile not found
                    </div>
                ) : (
                    <div className="profile-modal-content">
                        <div className="profile-modal-avatar-section">
                            {profile.avatar_url ? (
                                <img src={profile.avatar_url} alt={profile.full_name} className="profile-modal-avatar" />
                            ) : (
                                <div className="profile-modal-avatar profile-modal-avatar-placeholder">
                                    {profile.full_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                            )}
                            <h2 className="profile-modal-name">{profile.full_name}</h2>
                            <span className={`badge ${profile.role === 'admin' ? 'badge-primary' : profile.role === 'club_leader' ? 'badge-warning' : 'badge-success'}`}>
                                {profile.role === 'club_leader' ? 'Club Leader' : profile.role}
                            </span>
                        </div>

                        <div className="profile-modal-details">
                            {profile.email && (
                                <div className="profile-detail-row">
                                    <span className="profile-detail-icon">📧</span>
                                    <div>
                                        <div className="profile-detail-label">Email</div>
                                        <div className="profile-detail-value">{profile.email}</div>
                                    </div>
                                </div>
                            )}
                            {profile.roll_number && (
                                <div className="profile-detail-row">
                                    <span className="profile-detail-icon">🎓</span>
                                    <div>
                                        <div className="profile-detail-label">Roll Number</div>
                                        <div className="profile-detail-value">{profile.roll_number}</div>
                                    </div>
                                </div>
                            )}
                            {profile.branch && (
                                <div className="profile-detail-row">
                                    <span className="profile-detail-icon">📚</span>
                                    <div>
                                        <div className="profile-detail-label">Branch</div>
                                        <div className="profile-detail-value">{profile.branch}</div>
                                    </div>
                                </div>
                            )}
                            {profile.year && (
                                <div className="profile-detail-row">
                                    <span className="profile-detail-icon">📅</span>
                                    <div>
                                        <div className="profile-detail-label">Year</div>
                                        <div className="profile-detail-value">{profile.year}</div>
                                    </div>
                                </div>
                            )}
                            {profile.bio && (
                                <div className="profile-detail-row" style={{ alignItems: 'flex-start' }}>
                                    <span className="profile-detail-icon">💬</span>
                                    <div>
                                        <div className="profile-detail-label">Bio</div>
                                        <div className="profile-detail-value">{profile.bio}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.75rem', color: 'var(--dark-500)' }}>
                            Joined {new Date(profile.created_at).toLocaleDateString()}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

import { useState, useEffect, useCallback } from 'react';
import { adminListUsers } from '../../services/adminUserApi';
import { adminListProjects, adminAssignUser, adminRemoveUserAssignment } from '../../services/projectApi';
import type { Project, User } from '../../types';

type Permission = 'viewer' | 'editor' | 'admin';

interface Assignment {
    id: string;
    projectId: string;
    projectName: string;
    userId: string;
    username: string;
    permission: Permission;
    assignedAt: string;
}

const PERM_LABEL: Record<Permission, string> = {
    viewer: 'Viewer', editor: 'Editor', admin: 'Admin',
};

const PERM_DESC: Record<Permission, string> = {
    viewer: 'Read-only access to all drawings and revision history.',
    editor: 'Can upload new drawings and edit drawing metadata.',
    admin: 'Full control: upload, edit, delete drawings, manage project settings.',
};

export default function AdminPermissions() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [selProject, setSelProject] = useState('');
    const [selUser, setSelUser] = useState('');
    const [selRole, setSelRole] = useState<Permission>('viewer');
    const [saved, setSaved] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [projData, userData] = await Promise.all([
                adminListProjects(),
                adminListUsers()
            ]);

            const mappedProj = projData.projects.map((p: any) => ({
                ...p,
                id: p._id || p.id,
            }));
            setProjects(mappedProj);
            setUsers(userData.users.map((u: any) => ({ ...u, id: u._id || u.id })));

            // Reconstruct assignments list from ALL projects
            const allAssignments: Assignment[] = mappedProj.flatMap((p: Project) =>
                p.assignments.map((a) => ({
                    id: `${p.id}_${a.userId}`,
                    projectId: p.id,
                    projectName: p.name,
                    userId: a.userId,
                    username: a.username,
                    permission: a.permission as Permission,
                    assignedAt: p.updatedAt,
                }))
            );
            setAssignments(allAssignments);

        } catch (err: any) {
            setError(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    async function handleSave() {
        if (!selProject || !selUser) return;
        try {
            setError('');
            await adminAssignUser(selProject, {
                userId: selUser,
                permission: selRole,
            });

            // Refresh local state
            await fetchData();
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err: any) {
            setError(`Save failed: ${err.message}`);
        }
    }

    async function handleRemove(projectId: string, userId: string) {
        try {
            setError('');
            await adminRemoveUserAssignment(projectId, userId);
            await fetchData();
        } catch (err: any) {
            setError(`Removal failed: ${err.message}`);
        }
    }

    return (
        <div>
            <div className="page-header">
                <div className="page-header-left">
                    <h2 className="page-title">Permission Assignment</h2>
                    <p className="page-subtitle">Control which users access which projects and at what permission level</p>
                </div>
            </div>

            {error && (
                <div className="info-box danger mb-md">
                    <strong>Error:</strong> {error}
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 'var(--space-lg)', alignItems: 'start' }}>
                {/* ── Assignment Panel ── */}
                <div className="card">
                    <div className="card-header">
                        <span className="card-header-title">Assign / Update Permission</span>
                    </div>
                    <div className="card-body">
                        {loading ? (
                            <div className="text-center py-lg">
                                <div className="spinner mb-sm"></div>
                                <p className="text-muted">Loading...</p>
                            </div>
                        ) : (
                            <>
                                <div className="form-group">
                                    <label className="form-label required">Project</label>
                                    <select className="form-control" value={selProject}
                                        onChange={(e) => setSelProject(e.target.value)}>
                                        <option value="">— Select project —</option>
                                        {projects.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label required">User</label>
                                    <select className="form-control" value={selUser}
                                        onChange={(e) => setSelUser(e.target.value)}>
                                        <option value="">— Select user —</option>
                                        {users.filter(u => u.role !== 'admin').map((u) => (
                                            <option key={u.id} value={u.id}>{u.username} ({u.email})</option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}

                        <div className="form-group">
                            <label className="form-label required">Permission Level</label>
                            <select className="form-control" value={selRole}
                                onChange={(e) => setSelRole(e.target.value as Permission)}>
                                <option value="viewer">Viewer — Read-only</option>
                                <option value="editor">Editor — Upload &amp; edit</option>
                                <option value="admin">Admin — Full control</option>
                            </select>
                        </div>

                        {/* Permission description */}
                        <div style={{
                            padding: '12px 14px',
                            background: '#f8faff',
                            border: '1px solid var(--color-border-light)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 13,
                            color: 'var(--color-text-secondary)',
                            lineHeight: 1.6,
                            marginBottom: 'var(--space-md)',
                        }}>
                            <strong style={{ color: 'var(--color-text-primary)', display: 'block', marginBottom: 3 }}>
                                {PERM_LABEL[selRole]} Access
                            </strong>
                            {PERM_DESC[selRole]}
                        </div>

                        {saved && (
                            <div className="info-box success">
                                ✓ Assignment saved successfully.
                            </div>
                        )}

                        <button
                            className="btn btn-primary btn-lg"
                            style={{ width: '100%' }}
                            disabled={!selProject || !selUser}
                            onClick={handleSave}
                        >
                            Save Assignment
                        </button>
                    </div>
                </div>

                {/* ── Permission Modules ── */}
                <div>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-sm)',
                    }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                            Permission Modules
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                            {assignments.length} active assignment{assignments.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                        {(['viewer', 'editor', 'admin'] as Permission[]).map((perm) => {
                            const moduleAssignments = assignments.filter((a) => a.permission === perm);
                            return (
                                <div key={perm} className="card" style={{ margin: 0 }}>
                                    <div className="card-header" style={{ paddingTop: 12, paddingBottom: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <span className={`role-chip ${perm}`}>{PERM_LABEL[perm]}</span>
                                            <span className="card-header-title" style={{ fontSize: 13 }}>
                                                {PERM_DESC[perm]}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                            {moduleAssignments.length} assigned
                                        </span>
                                    </div>
                                    <div style={{ padding: '8px var(--space-lg) 12px' }}>
                                        {moduleAssignments.length === 0 ? (
                                            <p style={{
                                                fontSize: 13,
                                                color: 'var(--color-text-muted)',
                                                fontStyle: 'italic',
                                                margin: '8px 0',
                                            }}>
                                                No permissions assigned
                                            </p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {moduleAssignments.map((a) => (
                                                    <div key={a.id} style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '8px 10px',
                                                        borderRadius: 'var(--radius-md)',
                                                        background: 'var(--color-bg-subtle, #f8faff)',
                                                        border: '1px solid var(--color-border-light)',
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{
                                                                width: 26, height: 26,
                                                                borderRadius: '50%',
                                                                background: 'var(--color-primary-light)',
                                                                color: 'var(--color-primary)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                fontSize: 10, fontWeight: 700,
                                                                border: '1px solid #93c5fd',
                                                                flexShrink: 0,
                                                            }}>
                                                                {a.username.slice(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>
                                                                    {a.username}
                                                                </div>
                                                                <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                                                                    {a.projectName}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button
                                                            className="btn btn-danger btn-sm"
                                                            onClick={() => handleRemove(a.projectId, a.userId)}
                                                        >
                                                            Revoke
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

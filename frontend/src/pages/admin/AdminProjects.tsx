import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project, ProjectStatus } from '../../types';
import { adminListProjects, adminCreateProject, adminDeleteProject, adminUpdateProject } from '../../services/projectApi';
import { IconPlus, IconEdit, IconTrash, IconOpen, IconClose } from '../../components/Icons';

const STATUS_OPTIONS: ProjectStatus[] = ['active', 'on_hold', 'completed', 'archived'];
const STATUS_LABEL: Record<ProjectStatus, string> = {
    active: 'Active', on_hold: 'On Hold', completed: 'Completed', archived: 'Archived',
};

const STATUS_CLS: Record<ProjectStatus, string> = {
    active: 'badge-success', on_hold: 'badge-warning', completed: 'badge-info', archived: 'badge-neutral',
};

interface CreateProjectForm {
    name: string; clientName: string; description: string; status: ProjectStatus;
}
const DEFAULT_FORM: CreateProjectForm = { name: '', clientName: '', description: '', status: 'active' };

export default function AdminProjects() {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState<CreateProjectForm>(DEFAULT_FORM);
    const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
    const [editTarget, setEditTarget] = useState<Project | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true);
            const data = await adminListProjects();
            // Map _id to id for internal consistency
            const mapped = data.projects.map((p: any) => ({
                ...p,
                id: p._id || p.id,
            }));
            setProjects(mapped);
        } catch (err: any) {
            setError(err.message || 'Failed to load projects');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const filtered = projects.filter(
        (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.clientName.toLowerCase().includes(search.toLowerCase())
    );

    async function handleCreate() {
        if (!form.name.trim() || !form.clientName.trim()) return;
        try {
            setActionLoading(true);
            setError('');
            const { project } = await adminCreateProject({
                name: form.name.trim(),
                clientName: form.clientName.trim(),
                description: form.description.trim(),
                status: form.status,
            });

            const newProject = {
                ...project,
                id: project._id || project.id
            };

            setProjects((prev) => [newProject, ...prev]);
            setShowCreate(false);
            setForm(DEFAULT_FORM);
        } catch (err: any) {
            setError(`Create failed: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleDelete(id: string) {
        try {
            setActionLoading(true);
            setError('');
            await adminDeleteProject(id);
            setProjects((prev) => prev.filter((p) => p.id !== id));
            setDeleteTarget(null);
        } catch (err: any) {
            setError(`Delete failed: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleEditSave() {
        if (!editTarget) return;
        try {
            setActionLoading(true);
            setError('');
            const { project } = await adminUpdateProject(editTarget.id, {
                name: editTarget.name,
                clientName: editTarget.clientName,
                description: editTarget.description,
                status: editTarget.status
            });

            // Re-map with consistent ID
            const updatedProject = {
                ...project,
                id: project._id || project.id
            };

            setProjects((prev) =>
                prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
            );
            setEditTarget(null);
        } catch (err: any) {
            setError(`Update failed: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    }

    const SearchIcon = () => (
        <svg viewBox="0 0 16 16" fill="none" strokeWidth="1.5" stroke="currentColor" width="14" height="14">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l3.5 3.5" strokeLinecap="round" />
        </svg>
    );

    return (
        <div>
            <div className="page-header">
                <div className="page-header-left">
                    <h2 className="page-title">Projects</h2>
                    <p className="page-subtitle">Manage all steel detailing projects</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                    <IconPlus /> New Project
                </button>
            </div>

            {/* Quick stats row */}
            <div className="stats-grid mb-lg" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {[
                    { label: 'Total', value: projects.length, cls: 'accent-blue' },
                    { label: 'Active', value: projects.filter((p) => p.status === 'active').length, cls: 'accent-green' },
                    { label: 'On Hold', value: projects.filter((p) => p.status === 'on_hold').length, cls: 'accent-amber' },
                    { label: 'Completed', value: projects.filter((p) => p.status === 'completed').length, cls: 'accent-slate' },
                ].map(({ label, value, cls }) => (
                    <div className={`stat-card ${cls}`} key={label}>
                        <div className="stat-card-label">{label}</div>
                        <div className="stat-card-value">{value}</div>
                    </div>
                ))}
            </div>

            {/* Filter */}
            <div className="filter-toolbar mb-md">
                <div className="search-input-wrapper">
                    <SearchIcon />
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Search projects or clients…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ paddingLeft: 34 }}
                        disabled={loading}
                    />
                </div>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                    {filtered.length} of {projects.length} projects
                </span>
            </div>

            {error && (
                <div className="info-box danger mb-md" style={{ padding: '12px 16px', borderRadius: 8 }}>
                    <strong>Error:</strong> {error}
                    <button onClick={fetchProjects} className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }}>Retry</button>
                </div>
            )}

            {/* Table */}
            <div className="table-wrapper">
                {loading ? (
                    <div className="table-empty" style={{ padding: '60px 0' }}>
                        <div className="spinner mb-sm"></div>
                        <p>Loading projects from server...</p>
                    </div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}>#</th>
                                <th>Project Name</th>
                                <th>Client Name</th>
                                <th>Created</th>
                                <th>Users</th>
                                <th>Drawings</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr><td colSpan={8} className="table-empty">No projects match your search.</td></tr>
                            ) : (
                                filtered.map((p, i) => (
                                    <tr key={p.id}>
                                        <td className="text-muted font-mono" style={{ fontSize: 12 }}>{i + 1}</td>
                                        <td>
                                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text-primary)' }}>
                                                {p.name}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--color-text-secondary)' }}>{p.clientName}</td>
                                        <td className="text-muted font-mono" style={{ fontSize: 12.5 }}>
                                            {new Date(p.createdAt).toLocaleDateString()}
                                        </td>
                                        <td>
                                            {(() => {
                                                const assignedUsers = p.assignments?.filter(a => a.permission !== 'admin') || [];
                                                if (assignedUsers.length === 0) {
                                                    return <span className="text-muted">—</span>;
                                                }
                                                return (
                                                    <span style={{ fontWeight: 500 }}>
                                                        {assignedUsers.length} user{assignedUsers.length > 1 ? 's' : ''}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td className="font-mono" style={{ fontWeight: 600 }}>{p.drawingCount}</td>
                                        <td>
                                            <span className={`badge ${STATUS_CLS[p.status]}`}>
                                                {STATUS_LABEL[p.status]}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="btn-group">
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => navigate(`/admin/project/${p.id}`)}
                                                    title="Open Project"
                                                >
                                                    <IconOpen /> Open
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm btn-icon"
                                                    onClick={() => setEditTarget({ ...p })}
                                                    title="Edit"
                                                >
                                                    <IconEdit />
                                                </button>
                                                <button
                                                    className="btn btn-danger btn-sm btn-icon"
                                                    onClick={() => setDeleteTarget(p)}
                                                    title="Delete"
                                                >
                                                    <IconTrash />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Create Modal ── */}
            {showCreate && (
                <div className="modal-overlay" onClick={() => setShowCreate(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Create New Project</span>
                            <button className="modal-close" onClick={() => setShowCreate(false)}><IconClose /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label required">Project Name</label>
                                <input className="form-control" placeholder="e.g. SteelFrame Tower B"
                                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label required">Client Name</label>
                                <input className="form-control" placeholder="e.g. Infra Corp Ltd."
                                    value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea className="form-control" placeholder="Brief project description…" rows={3}
                                    value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Initial Status</label>
                                <select className="form-control" value={form.status}
                                    onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
                                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                                </select>
                            </div>
                            <div className="form-actions">
                                <button className="btn btn-secondary"
                                    onClick={() => { setShowCreate(false); setForm(DEFAULT_FORM); }}>Cancel</button>
                                <button className="btn btn-primary"
                                    onClick={handleCreate}
                                    disabled={!form.name.trim() || !form.clientName.trim() || actionLoading}>
                                    {actionLoading ? 'Creating...' : 'Create Project'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Edit Modal ── */}
            {editTarget && (
                <div className="modal-overlay" onClick={() => setEditTarget(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Edit Project</span>
                            <button className="modal-close" onClick={() => setEditTarget(null)}><IconClose /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label required">Project Name</label>
                                <input className="form-control" value={editTarget.name}
                                    onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label required">Client Name</label>
                                <input className="form-control" value={editTarget.clientName}
                                    onChange={(e) => setEditTarget({ ...editTarget, clientName: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea className="form-control" rows={3} value={editTarget.description}
                                    onChange={(e) => setEditTarget({ ...editTarget, description: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Status</label>
                                <select className="form-control" value={editTarget.status}
                                    onChange={(e) => setEditTarget({ ...editTarget, status: e.target.value as ProjectStatus })}>
                                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                                </select>
                            </div>
                            <div className="form-actions">
                                <button className="btn btn-secondary" disabled={actionLoading} onClick={() => setEditTarget(null)}>Cancel</button>
                                <button className="btn btn-primary" disabled={actionLoading} onClick={handleEditSave}>
                                    {actionLoading ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Delete Confirm ── */}
            {deleteTarget && (
                <div className="modal-overlay" onClick={() => setDeleteTarget(null)}>
                    <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <span className="modal-title">Confirm Deletion</span>
                            <button className="modal-close" onClick={() => setDeleteTarget(null)}><IconClose /></button>
                        </div>
                        <div className="modal-body">
                            <p className="confirm-dialog-text">
                                Are you sure you want to permanently delete project{' '}
                                <strong>"{deleteTarget.name}"</strong>? All associated drawings and user
                                assignments will be removed. This cannot be undone.
                            </p>
                            <div className="form-actions">
                                <button className="btn btn-secondary" disabled={actionLoading} onClick={() => setDeleteTarget(null)}>Cancel</button>
                                <button className="btn btn-danger btn-lg" disabled={actionLoading} onClick={() => handleDelete(deleteTarget.id)}>
                                    {actionLoading ? 'Deleting...' : 'Delete Project'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

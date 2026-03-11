import { useState, useEffect, useCallback } from 'react';
import { adminListProjects, downloadProjectStatusExcel } from '../../services/projectApi';
import type { Project, ProjectStatus } from '../../types';

const STATUS_LABEL: Record<ProjectStatus, string> = {
    active: 'Active',
    on_hold: 'On Hold',
    completed: 'Completed',
    archived: 'Archived',
};

const STATUS_CLS: Record<ProjectStatus, string> = {
    active: 'badge-success',
    on_hold: 'badge-warning',
    completed: 'badge-info',
    archived: 'badge-neutral',
};

function IconDownload() {
    return (
        <svg viewBox="0 0 16 16" fill="none" strokeWidth="1.5" stroke="currentColor" width="15" height="15">
            <path d="M8 2v8m0 0l-3-3m3 3l3-3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 12h12" strokeLinecap="round" />
        </svg>
    );
}

export default function AdminProjectStatus() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState('');

    const fetchProjects = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const data = await adminListProjects();
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

    const totalProjects = projects.length;
    const activeProjects = projects.filter((p) => p.status === 'active').length;
    const totalDrawings = projects.reduce((s, p) => s + (p.drawingCount || 0), 0);

    async function handleDownloadStatusExcel() {
        try {
            setDownloading(true);
            setDownloadError('');
            await downloadProjectStatusExcel();
        } catch (err: any) {
            setDownloadError(err.message || 'Download failed');
        } finally {
            setDownloading(false);
        }
    }

    return (
        <div>
            <div className="page-header">
                <div className="page-header-left">
                    <h2 className="page-title">Project Status</h2>
                    <p className="page-subtitle">Live overview of fabrication &amp; approval counts per project</p>
                </div>
                {/* Download Status Excel Button */}
                <button
                    className="btn btn-primary"
                    onClick={handleDownloadStatusExcel}
                    disabled={downloading || loading || projects.length === 0}
                    title="Download all project status as Excel"
                >
                    <IconDownload />
                    {downloading ? 'Downloading…' : 'Download Status Excel'}
                </button>
            </div>

            {downloadError && (
                <div className="info-box danger mb-md" style={{ padding: '10px 16px', borderRadius: 8 }}>
                    <strong>Download Error:</strong> {downloadError}
                </div>
            )}

            {/* Top stat cards */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card accent-blue">
                    <div className="stat-card-label">Total Projects</div>
                    <div className="stat-card-value">{loading ? '—' : totalProjects}</div>
                </div>
                <div className="stat-card accent-green">
                    <div className="stat-card-label">Active Projects</div>
                    <div className="stat-card-value">{loading ? '—' : activeProjects}</div>
                </div>
                <div className="stat-card accent-amber">
                    <div className="stat-card-label">Total Drawings</div>
                    <div className="stat-card-value">{loading ? '—' : totalDrawings}</div>
                </div>
            </div>

            {error && (
                <div className="info-box danger mb-md" style={{ padding: '12px 16px', borderRadius: 8 }}>
                    <strong>Error:</strong> {error}
                    <button onClick={fetchProjects} className="btn btn-ghost btn-sm" style={{ marginLeft: 12 }}>
                        Retry
                    </button>
                </div>
            )}

            {loading ? (
                <div className="text-center py-xl">
                    <div className="spinner mb-md"></div>
                    <p className="text-muted">Loading project status...</p>
                </div>
            ) : projects.length === 0 ? (
                <div className="table-empty" style={{ padding: '60px 0', background: 'var(--color-bg-card)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
                    <p>No projects found. Create a project first.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {projects.map((project, index) => {
                        const teamMembers = project.assignments?.filter(a => a.permission !== 'admin').length || 0;
                        const fabricationCount = (project as any).fabricationCount || 0;
                        const approvedCount = (project as any).approvalCount || 0;
                        const totalClassified = approvedCount + fabricationCount;
                        const approvalPct = totalClassified > 0 ? Math.round((approvedCount / totalClassified) * 100) : 0;

                        return (
                            <div key={project.id} className="project-status-card">
                                <div className="project-status-header">
                                    <div className="project-status-num">{index + 1}</div>
                                    <div className="project-status-info">
                                        <div className="project-status-name">{project.name}</div>
                                        <div className="project-status-client">{project.clientName}</div>
                                    </div>
                                    <span className={`badge ${STATUS_CLS[project.status]}`}>
                                        {STATUS_LABEL[project.status]}
                                    </span>
                                </div>

                                <div className="project-status-stats">
                                    <div className="project-status-stat">
                                        <div className="project-status-stat-label">Fabrications</div>
                                        <div className="project-status-stat-value">{fabricationCount}</div>
                                        <div className="project-status-stat-sub">drawings</div>
                                    </div>
                                    <div className="project-status-stat">
                                        <div className="project-status-stat-label">Approvals</div>
                                        <div className="project-status-stat-value">{approvedCount}</div>
                                        <div className="project-status-stat-sub">{approvalPct}% approved</div>
                                    </div>
                                    <div className="project-status-stat">
                                        <div className="project-status-stat-label">Team Members</div>
                                        <div className="project-status-stat-value">{teamMembers}</div>
                                        <div className="project-status-stat-sub">assigned</div>
                                    </div>
                                </div>

                                <div className="project-status-progress-row">
                                    <span className="project-status-progress-label">Approval Progress</span>
                                    <div className="project-status-progress-bar">
                                        <div
                                            className="project-status-progress-fill"
                                            style={{ width: `${approvalPct}%` }}
                                        />
                                    </div>
                                    <span className="project-status-progress-pct">{approvalPct}%</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

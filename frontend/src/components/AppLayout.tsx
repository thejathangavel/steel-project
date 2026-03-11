import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useState, useEffect } from 'react';

const PAGE_TITLES: Record<string, string> = {
    '/admin': 'Dashboard Overview',
    '/admin/projects': 'Project Management',
    '/admin/users': 'User Management',
    '/admin/permissions': 'Permission Assignment',
    '/admin/status': 'Project Status',
    '/dashboard': 'My Dashboard',
    '/dashboard/projects': 'My Projects',
};

function LiveClock() {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const timeStr = now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
    });

    const dateStr = now.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    });

    return (
        <div className="topbar-clock">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="topbar-clock-time">{timeStr}</span>
            <span className="topbar-clock-sep">·</span>
            <span className="topbar-clock-date">{dateStr}</span>
        </div>
    );
}

function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();
    const isDark = theme === 'dark';

    return (
        <button
            className="topbar-theme-btn"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
        >
            {isDark ? (
                /* Sun icon for dark mode (click to go light) */
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
            ) : (
                /* Moon icon for light mode (click to go dark) */
                <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
                    <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                </svg>
            )}
        </button>
    );
}

export default function AppLayout() {
    const { user } = useAuth();
    const { pathname } = useLocation();

    const pageTitle =
        PAGE_TITLES[pathname] ??
        (pathname.includes('/project/') ? 'Project View' : 'Steel Detailing DMS');

    const initials = user?.username?.slice(0, 2).toUpperCase() ?? 'U';
    const isAdmin = user?.role === 'admin';

    return (
        <div className="app-shell">
            <Sidebar />
            <div className="main-content">
                {/* Topbar */}
                <header className="topbar">
                    <span className="topbar-title">{pageTitle}</span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <LiveClock />
                        <ThemeToggle />
                        <span className={`topbar-badge ${isAdmin ? 'admin-badge' : ''}`}>
                            {isAdmin ? 'Admin' : 'User'}
                        </span>
                        <div className="topbar-user-avatar">{initials}</div>
                    </div>
                </header>

                {/* Page */}
                <main className="page-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

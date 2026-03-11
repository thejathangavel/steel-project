/**
 * Admin Project Management Routes
 * All routes protected by: verifyToken → requireAdmin → [scope middleware]
 *
 * GET    /api/admin/projects
 * POST   /api/admin/projects
 * GET    /api/admin/projects/status/excel   ← NEW: download all-project status report
 * GET    /api/admin/projects/:projectId
 * PATCH  /api/admin/projects/:projectId
 * DELETE /api/admin/projects/:projectId
 * POST   /api/admin/projects/:projectId/assignments
 * DELETE /api/admin/projects/:projectId/assignments/:userId
 */
const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { scopeProjectToAdmin, validateCrossAdminAssignment } = require('../middleware/adminScope');
const {
    listProjects, createProject, getProject,
    updateProject, deleteProject, assignUser, removeAssignment,
    downloadAllProjectsStatusExcel,
} = require('../controllers/adminProjectsController');

const router = express.Router();

router.use(verifyToken, requireAdmin);

// ── Project Status Excel (Must be before /:projectId to avoid route collision) ──
router.get('/status/excel', downloadAllProjectsStatusExcel);

// Project CRUD
router.get('/', listProjects);
router.post('/', createProject);
router.get('/:projectId', scopeProjectToAdmin, getProject);
router.patch('/:projectId', scopeProjectToAdmin, updateProject);
router.delete('/:projectId', scopeProjectToAdmin, deleteProject);

// Assignments
router.post('/:projectId/assignments', scopeProjectToAdmin, validateCrossAdminAssignment, assignUser);
router.delete('/:projectId/assignments/:userId', scopeProjectToAdmin, removeAssignment);

module.exports = router;


/**
 * User Project Routes
 * All routes protected by: verifyToken → requireUser → [scope middleware]
 *
 * GET /api/user/projects
 * GET /api/user/projects/:projectId
 * GET /api/user/projects/:projectId/drawings
 */
const express = require('express');
const { verifyToken, requireUser } = require('../middleware/auth');
const { scopeProjectToUser } = require('../middleware/adminScope');
const {
    listMyProjects, getMyProject, getProjectDrawings,
} = require('../controllers/userProjectsController');

const router = express.Router();

router.use(verifyToken, requireUser);

router.get('/', listMyProjects);
router.get('/:projectId', scopeProjectToUser, getMyProject);
router.get('/:projectId/drawings', scopeProjectToUser, getProjectDrawings);

module.exports = router;

/**
 * Admin User Management Routes
 * All routes protected by: verifyToken → requireAdmin → [scope middleware]
 *
 * GET    /api/admin/users
 * POST   /api/admin/users
 * GET    /api/admin/users/:userId
 * PATCH  /api/admin/users/:userId
 * DELETE /api/admin/users/:userId
 */
const express = require('express');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const { scopeUserToAdmin } = require('../middleware/adminScope');
const {
    listUsers, createUser, getUser, updateUser, deleteUser,
} = require('../controllers/adminUsersController');

const router = express.Router();

// Apply auth to all routes in this file
router.use(verifyToken, requireAdmin);

router.get('/', listUsers);
router.post('/', createUser);
router.get('/:userId', scopeUserToAdmin, getUser);
router.patch('/:userId', scopeUserToAdmin, updateUser);
router.delete('/:userId', scopeUserToAdmin, deleteUser);

module.exports = router;

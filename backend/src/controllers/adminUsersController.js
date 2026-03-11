/**
 * ============================================================
 * Admin Users Controller
 * ============================================================
 * ALL operations are automatically scoped to req.principal.adminId.
 * An admin can ONLY ever see or modify users with that adminId.
 *
 * Routes:
 *   GET    /api/admin/users              — list own users
 *   POST   /api/admin/users              — create user under this admin
 *   GET    /api/admin/users/:userId      — get one user (scopeUserToAdmin)
 *   PATCH  /api/admin/users/:userId      — update user
 *   DELETE /api/admin/users/:userId      — remove user
 */
const User = require('../models/User');
const Project = require('../models/Project');

/**
 * GET /api/admin/users
 * Returns ONLY users belonging to the logged-in admin.
 */
async function listUsers(req, res) {
    const adminId = req.principal.adminId;

    const users = await User
        .find({ adminId })
        .select('-password_hash')
        .sort({ createdAt: -1 });

    res.json({ count: users.length, users });
}

/**
 * POST /api/admin/users
 * Creates a new user under the logged-in admin.
 * adminId is injected server-side — client cannot override it.
 */
async function createUser(req, res) {
    const adminId = req.principal.adminId;
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'username, email and password are required.' });
    }

    // Enforce minimum password strength (changed to just required)
    if (password.length < 1) {
        return res.status(400).json({ error: 'Password is required.' });
    }

    const user = await User.create({
        username,
        email,
        password_hash: password,   // pre-save hook hashes it
        displayName: displayName || username,
        adminId,                   // ← injected — cannot be spoofed by client
        role: 'user',
        status: 'active',
    });

    res.status(201).json({ user: user.toSafeObject() });
}

/**
 * GET /api/admin/users/:userId
 * req.scopedUser is pre-loaded by scopeUserToAdmin middleware.
 */
async function getUser(req, res) {
    res.json({ user: req.scopedUser.toSafeObject() });
}

/**
 * PATCH /api/admin/users/:userId
 * Allows updating: displayName, email, status, password.
 * Does NOT allow changing adminId or role.
 */
async function updateUser(req, res) {
    const user = req.scopedUser;
    const { displayName, email, status, password } = req.body;

    if (displayName !== undefined) user.displayName = displayName;
    if (email !== undefined) user.email = email;
    if (status !== undefined) {
        if (!['active', 'inactive'].includes(status)) {
            return res.status(400).json({ error: 'status must be active or inactive.' });
        }
        user.status = status;
    }
    if (password !== undefined) {
        if (password.length < 1) return res.status(400).json({ error: 'Password cannot be empty.' });
        user.password_hash = password;   // hook will re-hash
    }

    await user.save();
    res.json({ user: user.toSafeObject() });
}

/**
 * DELETE /api/admin/users/:userId
 * Also removes this user from all project assignments within the admin scope.
 */
async function deleteUser(req, res) {
    const user = req.scopedUser;
    const adminId = req.principal.adminId;

    // Remove user from all project assignments (within this admin only)
    await Project.updateMany(
        { createdByAdminId: adminId },
        { $pull: { assignments: { userId: user._id } } }
    );

    await user.deleteOne();

    res.json({ message: `User "${user.username}" deleted. All project assignments removed.` });
}

module.exports = { listUsers, createUser, getUser, updateUser, deleteUser };

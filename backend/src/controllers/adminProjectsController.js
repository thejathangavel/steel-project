/**
 * ============================================================
 * Admin Projects Controller
 * ============================================================
 * ALL operations scoped to req.principal.adminId.
 *
 * Routes:
 *   GET    /api/admin/projects                           — list own projects
 *   POST   /api/admin/projects                           — create project
 *   GET    /api/admin/projects/:projectId                — get one project
 *   PATCH  /api/admin/projects/:projectId                — update project
 *   DELETE /api/admin/projects/:projectId                — delete project
 *   POST   /api/admin/projects/:projectId/assignments    — assign user
 *   DELETE /api/admin/projects/:projectId/assignments/:userId — remove assignment
 */
const Project = require('../models/Project');
const Drawing = require('../models/Drawing');
const DrawingExtraction = require('../models/DrawingExtraction');
const { generateProjectStatusExcel } = require('../services/excelService');

/**
 * GET /api/admin/projects
 * List all projects owned by the logged-in admin.
 */
async function listProjects(req, res) {
    const adminId = req.principal.adminId;
    const { status, search } = req.query;

    const filter = { createdByAdminId: adminId };
    if (status) filter.status = status;
    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { clientName: { $regex: search, $options: 'i' } },
        ];
    }

    const projects = await Project
        .find(filter)
        .sort({ createdAt: -1 });

    // Batch-count completed drawings per project (one DB round-trip)
    const projectIds = projects.map((p) => p._id);
    const counts = await DrawingExtraction.aggregate([
        { $match: { projectId: { $in: projectIds }, status: 'completed' } },
        {
            $group: {
                _id: '$projectId',
                count: { $sum: 1 },
                approvalCount: {
                    $sum: {
                        $cond: [
                            { $regexMatch: { input: { $ifNull: ["$extractedFields.revision", ""] }, regex: "^(rev\\s*)?[a-z]", options: "i" } },
                            1, 0
                        ]
                    }
                },
                fabricationCount: {
                    $sum: {
                        $cond: [
                            { $regexMatch: { input: { $ifNull: ["$extractedFields.revision", ""] }, regex: "^(rev\\s*)?[0-9]", options: "i" } },
                            1, 0
                        ]
                    }
                }
            }
        },
    ]);
    const countMap = {};
    counts.forEach((c) => {
        countMap[c._id.toString()] = {
            total: c.count,
            approvalCount: c.approvalCount,
            fabricationCount: c.fabricationCount
        };
    });

    const projectsWithCount = projects.map((p) => {
        const stats = countMap[p._id.toString()] || { total: 0, approvalCount: 0, fabricationCount: 0 };
        return {
            ...p.toObject(),
            drawingCount: stats.total,
            approvalCount: stats.approvalCount,
            fabricationCount: stats.fabricationCount
        };
    });

    res.json({ count: projectsWithCount.length, projects: projectsWithCount });
}

/**
 * POST /api/admin/projects
 * Creates project under this admin.
 * createdByAdminId is always injected server-side.
 */
async function createProject(req, res) {
    const adminId = req.principal.adminId;
    const { name, clientName, description, status } = req.body;

    if (!name || !clientName) {
        return res.status(400).json({ error: 'name and clientName are required.' });
    }

    const project = await Project.create({
        name,
        clientName,
        description: description || '',
        status: status || 'active',
        createdByAdminId: adminId,
        assignments: [
            {
                userId: req.principal.id,
                username: req.principal.username,
                permission: 'admin',
                assignedAt: new Date(),
            }
        ],
        drawingCount: 0,
    });

    res.status(201).json({ project });
}

/**
 * GET /api/admin/projects/:projectId
 * req.scopedProject is pre-loaded by scopeProjectToAdmin.
 */
async function getProject(req, res) {
    res.json({ project: req.scopedProject });
}

/**
 * PATCH /api/admin/projects/:projectId
 * Updates mutable fields. Cannot change createdByAdminId.
 */
async function updateProject(req, res) {
    const project = req.scopedProject;
    const { name, clientName, description, status } = req.body;

    if (name !== undefined) project.name = name;
    if (clientName !== undefined) project.clientName = clientName;
    if (description !== undefined) project.description = description;
    if (status !== undefined) {
        if (!['active', 'on_hold', 'completed', 'archived'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status value.' });
        }
        project.status = status;
    }

    await project.save();
    res.json({ project });
}

/**
 * DELETE /api/admin/projects/:projectId
 * Deletes project and all its drawings/extractions.
 */
async function deleteProject(req, res) {
    const project = req.scopedProject;

    // 1. Delete all associated data
    await Drawing.deleteMany({ projectId: project._id });
    await DrawingExtraction.deleteMany({ projectId: project._id });

    // 2. Delete project itself
    await project.deleteOne();

    res.json({ message: `Project "${project.name}" and all related data deleted.` });
}

/**
 * POST /api/admin/projects/:projectId/assignments
 * Assigns a user to a project.
 *
 * SECURITY: validateCrossAdminAssignment middleware runs first,
 * ensuring req.assignmentUser.adminId === req.principal.adminId.
 *
 * Body: { userId, permission }
 */
async function assignUser(req, res) {
    const project = req.scopedProject;
    const user = req.assignmentUser;   // pre-validated by middleware
    const permission = req.body.permission || 'viewer';

    if (!['viewer', 'editor', 'admin'].includes(permission)) {
        return res.status(400).json({ error: 'permission must be viewer, editor, or admin.' });
    }

    // Check if user is already assigned → update permission instead
    const existingIdx = project.assignments.findIndex(
        (a) => a.userId.toString() === user._id.toString()
    );

    if (existingIdx >= 0) {
        project.assignments[existingIdx].permission = permission;
    } else {
        project.assignments.push({
            userId: user._id,
            username: user.username,
            permission,
            assignedAt: new Date(),
        });
    }

    await project.save();
    res.json({ project });
}

/**
 * DELETE /api/admin/projects/:projectId/assignments/:userId
 * Removes a user's assignment from a project.
 * Also validates the userId belongs to this admin.
 */
async function removeAssignment(req, res) {
    const project = req.scopedProject;
    const { userId } = req.params;
    const adminId = req.principal.adminId;

    // Safety check: confirm the userId belongs to this admin
    const User = require('../models/User');
    const user = await User.findOne({ _id: userId, adminId });
    if (!user) {
        return res.status(403).json({
            error: 'Cannot remove assignment: user not in your admin scope.',
        });
    }

    const before = project.assignments.length;
    project.assignments = project.assignments.filter(
        (a) => a.userId.toString() !== userId
    );

    if (project.assignments.length === before) {
        return res.status(404).json({ error: 'Assignment not found.' });
    }

    await project.save();
    res.json({ message: 'Assignment removed.', project });
}

/**
 * GET /api/admin/projects/status/excel
 * Downloads an Excel report with the status of all projects owned by this admin.
 * Columns: Project Name, Client Name, Total Drawings, Fabrication Count, Approval Count,
 *           Hold Count, Pending Count, Failed Count, Overall Status, Last Updated
 */
async function downloadAllProjectsStatusExcel(req, res) {
    const adminId = req.principal.adminId;

    // Fetch all projects for this admin
    const projects = await Project.find({ createdByAdminId: adminId }).sort({ createdAt: -1 }).lean();

    if (projects.length === 0) {
        return res.status(404).json({ error: 'No projects found.' });
    }

    const projectIds = projects.map(p => p._id);

    // Aggregate drawing counts per project, broken down by status and revision type
    const counts = await DrawingExtraction.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        {
            $group: {
                _id: '$projectId',
                totalDrawings: { $sum: 1 },
                approvalCount: {
                    $sum: {
                        $cond: [
                            {
                                $regexMatch: {
                                    input: { $ifNull: ['$extractedFields.revision', ''] },
                                    regex: '^(rev\\s*)?[a-z]',
                                    options: 'i'
                                }
                            }, 1, 0
                        ]
                    }
                },
                fabricationCount: {
                    $sum: {
                        $cond: [
                            {
                                $regexMatch: {
                                    input: { $ifNull: ['$extractedFields.revision', ''] },
                                    regex: '^(rev\\s*)?[0-9]',
                                    options: 'i'
                                }
                            }, 1, 0
                        ]
                    }
                },
                holdCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'on_hold'] }, 1, 0] }
                },
                pendingCount: {
                    $sum: { $cond: [{ $in: ['$status', ['queued', 'processing']] }, 1, 0] }
                },
                failedCount: {
                    $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                },
            }
        },
    ]);

    // Build a fast lookup map
    const countMap = {};
    counts.forEach(c => {
        countMap[c._id.toString()] = c;
    });

    // Merge project data with aggregated stats
    const projectsData = projects.map(p => {
        const stats = countMap[p._id.toString()] || {};
        return {
            ...p,
            totalDrawings: stats.totalDrawings || 0,
            fabricationCount: stats.fabricationCount || 0,
            approvalCount: stats.approvalCount || 0,
            holdCount: stats.holdCount || 0,
            pendingCount: stats.pendingCount || 0,
            failedCount: stats.failedCount || 0,
        };
    });

    const { buffer, filename } = await generateProjectStatusExcel(projectsData);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
}

module.exports = {
    listProjects,
    createProject,
    getProject,
    updateProject,
    deleteProject,
    assignUser,
    removeAssignment,
    downloadAllProjectsStatusExcel,
};

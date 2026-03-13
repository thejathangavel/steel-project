/**
 * ============================================================
 * User Projects Controller
 * ============================================================
 * Routes for regular users — scoped to their assigned projects.
 *
 * Routes:
 *   GET /api/user/projects                  — list my assigned projects
 *   GET /api/user/projects/:projectId       — get one assigned project
 *   GET /api/user/projects/:projectId/drawings — get drawings for project
 */
const Project = require('../models/Project');
const Drawing = require('../models/Drawing');
const DrawingExtraction = require('../models/DrawingExtraction');

/**
 * GET /api/user/projects
 * Returns only projects where the user is in assignments[].
 */
async function listMyProjects(req, res) {
    const userId = req.principal.id;
    const mongoose = require('mongoose');

    let queryUserId = userId;
    if (mongoose.Types.ObjectId.isValid(userId)) {
        queryUserId = new mongoose.Types.ObjectId(userId);
    }

    const projects = await Project
        .find({
            'assignments.userId': queryUserId,
            status: { $ne: 'archived' },   // hide archived by default
        })
        .sort({ updatedAt: -1 });

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
                            {
                                $or: [
                                    { $regexMatch: { input: { $ifNull: ["$extractedFields.revision", ""] }, regex: "^(rev\\s*)?[a-z]", options: "i" } },
                                    { $regexMatch: { input: { $ifNull: ["$extractedFields.remarks", ""] }, regex: "approved|approval", options: "i" } },
                                    { $regexMatch: { input: { $ifNull: ["$extractedFields.description", ""] }, regex: "approved|approval", options: "i" } }
                                ]
                            },
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

    // Attach the user's own permission + drawing count in the response
    const result = projects.map((p) => {
        const assignment = p.assignments.find(
            (a) => a.userId.toString() === userId
        );
        const stats = countMap[p._id.toString()] || { total: 0, approvalCount: 0, fabricationCount: 0 };
        const approx = p.approximateDrawingsCount || 0;
        
        let approvalPercentage = 0;
        let fabricationPercentage = 0;
        if (approx > 0) {
            approvalPercentage = Math.round((stats.approvalCount / approx) * 100);
            fabricationPercentage = Math.round((stats.fabricationCount / approx) * 100);
        }

        return {
            ...p.toObject(),
            myPermission: assignment?.permission ?? 'viewer',
            drawingCount: stats.total,
            approvalCount: stats.approvalCount,
            fabricationCount: stats.fabricationCount,
            approvalPercentage,
            fabricationPercentage,
        };
    });

    res.json({ count: result.length, projects: result });
}


/**
 * GET /api/user/projects/:projectId
 * req.scopedProject pre-loaded by scopeProjectToUser.
 * req.userPermission set by scopeProjectToUser.
 */
async function getMyProject(req, res) {
    const project = req.scopedProject;
    res.json({
        project: {
            ...project.toObject(),
            myPermission: req.userPermission,
        },
    });
}

/**
 * GET /api/user/projects/:projectId/drawings
 * Returns drawings for an assigned project.
 */
async function getProjectDrawings(req, res) {
    const project = req.scopedProject;

    const drawings = await Drawing
        .find({ projectId: project._id })
        .sort({ createdAt: -1 });

    res.json({
        count: drawings.length,
        projectName: project.name,
        permission: req.userPermission,
        drawings,
    });
}

module.exports = { listMyProjects, getMyProject, getProjectDrawings };

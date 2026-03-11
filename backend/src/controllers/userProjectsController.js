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
        { $group: { _id: '$projectId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => { countMap[c._id.toString()] = c.count; });

    // Attach the user's own permission + drawing count in the response
    const result = projects.map((p) => {
        const assignment = p.assignments.find(
            (a) => a.userId.toString() === userId
        );
        return {
            ...p.toObject(),
            myPermission: assignment?.permission ?? 'viewer',
            drawingCount: countMap[p._id.toString()] || 0,
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

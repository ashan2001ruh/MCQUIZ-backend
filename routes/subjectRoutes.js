const express = require('express');
const subjectRouter = express.Router();
const subjectController = require('../controllers/subjectController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

subjectRouter.use(authenticate, isAdmin);

subjectRouter.post('/', subjectController.createSubject);
subjectRouter.get('/', subjectController.getAllSubjects);
subjectRouter.get('/level/:level', subjectController.getSubjectsByLevel);
subjectRouter.get('/stats', subjectController.getSubjectStats);
subjectRouter.get('/:id', subjectController.getSubjectById);
subjectRouter.put('/:id', subjectController.updateSubject);
subjectRouter.delete('/:id', subjectController.deleteSubject);

module.exports = subjectRouter;
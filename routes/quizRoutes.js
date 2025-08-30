const express = require('express');
const quizRouter = express.Router();
const quizController = require('../controllers/quizController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

quizRouter.use(authenticate, isAdmin);

quizRouter.post('/', quizController.createQuiz);
quizRouter.get('/', quizController.getAllQuizzes);
quizRouter.get('/stats', quizController.getQuizStats);
quizRouter.get('/subject/:subjectId', quizController.getQuizzesBySubject);
quizRouter.get('/:id', quizController.getQuizById);
quizRouter.put('/:id', quizController.updateQuiz);
quizRouter.delete('/:id', quizController.deleteQuiz);

module.exports = quizRouter;
const express = require('express');
const userAttemptsRouter = express.Router();
const userAttemptController = require('../controllers/userAttemptController');
const { authenticate } = require('../middleware/authMiddleware');

// All routes require authentication
userAttemptsRouter.use(authenticate);

// Save quiz attempt (submit quiz with saving)
userAttemptsRouter.post('/quiz/:id/submit', userAttemptController.saveQuizAttempt);

// Get user's quiz history (all attempts)
userAttemptsRouter.get('/history', userAttemptController.getUserQuizHistory);

// Get user's attempts for a specific quiz
userAttemptsRouter.get('/quiz/:quizId/attempts', userAttemptController.getUserQuizAttempts);

// Check if user has attempted a specific quiz
userAttemptsRouter.get('/quiz/:quizId/check', userAttemptController.checkQuizAttempted);

// Get detailed results of a specific attempt
userAttemptsRouter.get('/attempt/:attemptId', userAttemptController.getAttemptDetails);

// Get user's overall quiz statistics
userAttemptsRouter.get('/stats', userAttemptController.getUserQuizStats);

module.exports = userAttemptsRouter;
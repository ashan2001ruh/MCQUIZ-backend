const express = require('express');
const router = express.Router();
const sentimentController = require('../controllers/sentimentController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

// Submit feedback (requires authentication)
router.post('/submit', authenticate, sentimentController.submitFeedback);

// Get user's own feedback (requires authentication)
router.get('/user', authenticate, sentimentController.getUserFeedback);

// Get all feedback (admin only)
router.get('/all', authenticate, isAdmin, sentimentController.getAllFeedback);

// Get feedback statistics (admin only)
router.get('/stats', authenticate, isAdmin, sentimentController.getFeedbackStats);

// Get sentiment trends (admin only)
router.get('/trends', authenticate, isAdmin, sentimentController.getSentimentTrends);

// Get public feedback statistics (no auth required for home page)
router.get('/public-stats', sentimentController.getFeedbackStats);

// Bulk operations (admin only)
router.post('/bulk', authenticate, isAdmin, sentimentController.bulkUpdateFeedback);

// Export feedback data (admin only)
router.get('/export', authenticate, isAdmin, sentimentController.exportFeedback);

// Delete feedback (admin or owner)
router.delete('/:feedbackId', authenticate, sentimentController.deleteFeedback);

module.exports = router;

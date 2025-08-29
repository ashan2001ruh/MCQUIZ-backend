const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');

// Admin routes for subscription management
router.get('/all', authenticate, isAdmin, subscriptionController.getAllSubscriptions);
router.get('/stats', authenticate, isAdmin, subscriptionController.getSubscriptionStats);
router.get('/users', authenticate, isAdmin, subscriptionController.getAllUsersWithSubscriptions);

// Subscription approval/rejection
router.put('/:subscriptionId/approve', authenticate, isAdmin, subscriptionController.approveSubscription);
router.put('/:subscriptionId/reject', authenticate, isAdmin, subscriptionController.rejectSubscription);

// Manual user subscription level update
router.put('/users/:userId/subscription-level', authenticate, isAdmin, subscriptionController.updateUserSubscriptionLevel);

module.exports = router;

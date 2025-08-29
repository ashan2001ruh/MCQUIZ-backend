const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/initialize', authenticate, paymentController.initializePayment);

router.post('/notify', paymentController.handlePaymentNotification);

router.get('/subscription', authenticate, paymentController.getUserSubscription);

router.get('/status/:orderId', authenticate, paymentController.checkPaymentStatus);

router.post('/update-subscription', authenticate, paymentController.updateUserSubscription);

router.get('/subscription-status', authenticate, paymentController.getUserSubscriptionStatus);

module.exports = router;
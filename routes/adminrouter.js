const express = require('express');
const adminRouter = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, isAdmin } = require('../middleware/authMiddleware');
const subjectRouter = require('./subjectRoutes');
const quizRouter = require('./quizRoutes');

adminRouter.post('/login', adminController.loginAdmin);

adminRouter.get('/profile', authenticate, isAdmin, adminController.getAdminProfile);

adminRouter.get('/dashboard', authenticate, isAdmin, (req, res) => {
  res.status(200).json({ message: 'Admin dashboard data' });
});

adminRouter.use('/subjects', subjectRouter);
adminRouter.use('/quizzes', quizRouter);

module.exports = adminRouter;

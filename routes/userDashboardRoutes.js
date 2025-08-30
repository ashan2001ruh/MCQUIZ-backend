const express = require('express');
const userDashboardRouter = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const User = require('../models/model');
const Attempt = require('../models/quizAttemptModel');
const Quiz = require('../models/quizModel');
const Subject = require('../models/subjectModel');
const mongoose = require('mongoose');

// Get user dashboard stats
userDashboardRouter.get('/user/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get basic stats
    const totalAttempts = await Attempt.countDocuments({ user: userId });
    const passedAttempts = await Attempt.countDocuments({ user: userId, passed: true });
    
    // Get average score
    const scoreStats = await Attempt.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
          highestScore: { $max: '$score' },
          lowestScore: { $min: '$score' }
        }
      }
    ]);

    // Get last active date
    const lastAttempt = await Attempt.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .select('createdAt');

    // Get weekly activity for the current week (Monday to Sunday) in IST timezone
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    console.log('📅 Date Range (IST):', {
      startOfWeek: startOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      endOfWeek: endOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      now: now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    });

    const weeklyActivity = await Attempt.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startOfWeek, $lte: endOfWeek }
        } 
      },
      {
        $project: {
          // Convert to IST timezone for day calculation
          localDayOfWeek: {
            $dayOfWeek: {
              date: '$createdAt',
              timezone: '+05:30' // IST timezone offset
            }
          },
          quizzesTaken: 1
        }
      },
      {
        $group: {
          _id: '$localDayOfWeek',
          quizzesTaken: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Create an array with 7 zeros (Sunday to Saturday)
    const completeWeeklyActivity = Array(7).fill(0);

    // Map MongoDB day numbers (1=Sunday, 2=Monday, etc.) to array with Monday first
    weeklyActivity.forEach(day => {
      const frontendIndex = day._id - 1; // Convert MongoDB day (1-7) to array index (0-6)
      if (frontendIndex >= 0 && frontendIndex < 7) {
        // Reorder: put Monday (index 1) at position 0, Tuesday at 1, etc., Sunday at 6
        const reorderedIndex = (frontendIndex + 6) % 7;
        completeWeeklyActivity[reorderedIndex] = day.quizzesTaken;
      }
    });

    console.log('📅 Weekly Activity Debug (IST):', {
      startOfWeek: startOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      endOfWeek: endOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      rawWeeklyActivity: weeklyActivity,
      completeWeeklyActivity,
      dayMapping: {
        1: 'Sunday (index 6)',
        2: 'Monday (index 0)', 
        3: 'Tuesday (index 1)',
        4: 'Wednesday (index 2)',
        5: 'Thursday (index 3)',
        6: 'Friday (index 4)',
        7: 'Saturday (index 5)'
      }
    });

    // Get monthly activity for the last 6 months (including current month)
    const currentDate = new Date();
    const startMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1); // 6 months ago
    
    const monthlyActivity = await Attempt.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startMonth }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          quizzesTaken: { $sum: 1 },
          averageScore: { $avg: '$score' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Ensure all 6 months are represented (even if no quizzes taken)
    const completeMonthlyActivity = [];
    for (let i = 0; i < 6; i++) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth() + 1;
      
      const monthData = monthlyActivity.find(m => m._id.year === year && m._id.month === month);
      completeMonthlyActivity.push({
        month: `${year}-${month.toString().padStart(2, '0')}`,
        quizzesTaken: monthData ? monthData.quizzesTaken : 0,
        averageScore: monthData ? Math.round(monthData.averageScore || 0) : 0
      });
    }
    // Reverse to show oldest to newest
    completeMonthlyActivity.reverse();

    console.log('📊 Monthly Activity Debug:', {
      currentDate,
      startMonth,
      rawMonthlyActivity: monthlyActivity,
      completeMonthlyActivity
    });

    // Get subject performance
    const subjectPerformance = await Attempt.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $lookup: {
          from: 'quizzes',
          localField: 'quiz',
          foreignField: '_id',
          as: 'quizData'
        }
      },
      { $unwind: '$quizData' },
      {
        $lookup: {
          from: 'subjects',
          localField: 'quizData.subject',
          foreignField: '_id',
          as: 'subjectData'
        }
      },
      { $unwind: '$subjectData' },
      {
        $group: {
          _id: '$subjectData._id',
          name: { $first: '$subjectData.name' },
          averageScore: { $avg: '$score' },
          attempts: { $sum: 1 }
        }
      },
      { $sort: { averageScore: -1 } }
    ]);

    // Calculate improvement (comparing last 10 attempts vs previous 10)
    const recentAttempts = await Attempt.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('score createdAt');

    let improvement = 0;
    if (recentAttempts.length >= 10) {
      const last10 = recentAttempts.slice(0, 10);
      const previous10 = recentAttempts.slice(10, 20);
      
      const last10Avg = last10.reduce((sum, attempt) => sum + attempt.score, 0) / last10.length;
      const previous10Avg = previous10.reduce((sum, attempt) => sum + attempt.score, 0) / previous10.length;
      
      improvement = last10Avg - previous10Avg;
    }

    // Generate daily message
    const dailyMessages = [
      "Ready to continue your learning journey?",
      "Keep up the great work!",
      "Time to challenge yourself with a new quiz!",
      "Your progress is looking amazing!",
      "Ready for today's learning session?"
    ];
    const dailyMessage = dailyMessages[Math.floor(Math.random() * dailyMessages.length)];

    const stats = {
      quizzesTaken: totalAttempts,
      averageScore: scoreStats.length > 0 ? Math.round(scoreStats[0].avgScore) : 0,
      improvement: Math.round(improvement * 10) / 10,
      lastActive: lastAttempt?.createdAt || null,
      passRate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
      highestScore: scoreStats.length > 0 ? scoreStats[0].highestScore : 0,
      weeklyActivity: completeWeeklyActivity, // Use the mapped array
      monthlyActivity: completeMonthlyActivity,
      subjectPerformance: subjectPerformance.map(subject => ({
        name: subject.name,
        averageScore: Math.round(subject.averageScore),
        attempts: subject.attempts
      })),
      dailyMessage
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get recent quiz attempts
userDashboardRouter.get('/user/recent-quizzes', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 5;

    const recentAttempts = await Attempt.find({ user: userId })
      .populate({
        path: 'quiz',
        populate: {
          path: 'subject',
          select: 'name level'
        }
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('score passed createdAt timeSpent');

    const attempts = recentAttempts.map(attempt => ({
      quizId: attempt.quiz._id,
      quizTitle: attempt.quiz.title,
      subjectName: attempt.quiz.subject.name,
      difficulty: attempt.quiz.difficulty,
      subscriptionLevel: attempt.quiz.subscriptionLevel,
      score: attempt.score,
      passed: attempt.passed,
      attemptDate: attempt.createdAt,
      timeSpent: attempt.timeSpent
    }));

    res.status(200).json({ attempts });
  } catch (error) {
    console.error('Get recent quizzes error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get recommended subjects
userDashboardRouter.get('/user/recommendations', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's attempted subjects
    const userAttempts = await Attempt.find({ user: userId })
      .populate({
        path: 'quiz',
        populate: {
          path: 'subject',
          select: 'name level'
        }
      });

    const attemptedSubjectIds = [...new Set(userAttempts.map(attempt => attempt.quiz.subject._id.toString()))];

    // Get all active subjects
    const allSubjects = await Subject.find({ isActive: true });

    // Get quiz counts for each subject
    const subjectsWithQuizCounts = await Promise.all(
      allSubjects.map(async (subject) => {
        const quizCount = await Quiz.countDocuments({ 
          subject: subject._id, 
          isActive: true 
        });
        
        return {
          _id: subject._id,
          name: subject.name,
          level: subject.level,
          description: subject.description,
          quizCount,
          isAttempted: attemptedSubjectIds.includes(subject._id.toString())
        };
      })
    );

    // Filter out subjects with no quizzes and sort by recommendation score
    const validSubjects = subjectsWithQuizCounts
      .filter(subject => subject.quizCount > 0)
      .sort((a, b) => {
        // Prioritize unattempted subjects
        if (!a.isAttempted && b.isAttempted) return -1;
        if (a.isAttempted && !b.isAttempted) return 1;
        
        // Then sort by quiz count (more quizzes = better recommendation)
        return b.quizCount - a.quizCount;
      })
      .slice(0, 5); // Return top 5 recommendations

    res.status(200).json({ subjects: validSubjects });
  } catch (error) {
    console.error('Get recommendations error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Test endpoint to check database and quiz attempts
userDashboardRouter.get('/test/data', async (req, res) => {
  try {
    const Subject = require('../models/subjectModel');
    const Quiz = require('../models/quizModel');
    const Attempt = require('../models/quizAttemptModel');
    
    const subjects = await Subject.find({ isActive: true });
    const quizzes = await Quiz.find({ isActive: true });
    const attempts = await Attempt.find().populate('user', 'firstName lastName email');
    
    res.json({
      message: 'Database test successful',
      subjects: {
        count: subjects.length,
        data: subjects.map(s => ({ id: s._id, name: s.name, level: s.level }))
      },
      quizzes: {
        count: quizzes.length,
        data: quizzes.map(q => ({ id: q._id, title: q.title, subject: q.subject }))
      },
      attempts: {
        count: attempts.length,
        data: attempts.map(a => ({ 
          id: a._id, 
          user: a.user?.firstName || 'Unknown', 
          score: a.score, 
          passed: a.passed,
          createdAt: a.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({ message: 'Database test failed', error: error.message });
  }
});

// Test endpoint to check user stats calculation (without authentication for testing)
userDashboardRouter.get('/test/stats', async (req, res) => {
  try {
    const Attempt = require('../models/quizAttemptModel');
    const mongoose = require('mongoose');
    
    // Get all attempts for testing
    const totalAttempts = await Attempt.countDocuments();
    const passedAttempts = await Attempt.countDocuments({ passed: true });
    
    // Get average score
    const scoreStats = await Attempt.aggregate([
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
          highestScore: { $max: '$score' },
          lowestScore: { $min: '$score' }
        }
      }
    ]);

    // Get recent attempts for improvement calculation
    const recentAttempts = await Attempt.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select('score createdAt');

    let improvement = 0;
    if (recentAttempts.length >= 10) {
      const last10 = recentAttempts.slice(0, 10);
      const previous10 = recentAttempts.slice(10, 20);
      
      const last10Avg = last10.reduce((sum, attempt) => sum + attempt.score, 0) / last10.length;
      const previous10Avg = previous10.reduce((sum, attempt) => sum + attempt.score, 0) / previous10.length;
      
      improvement = last10Avg - previous10Avg;
    }

    const stats = {
      quizzesTaken: totalAttempts,
      averageScore: scoreStats.length > 0 ? Math.round(scoreStats[0].avgScore) : 0,
      improvement: Math.round(improvement * 10) / 10,
      passRate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
      highestScore: scoreStats.length > 0 ? scoreStats[0].highestScore : 0,
      message: 'Test stats calculated successfully'
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('Test stats error:', error);
    res.status(500).json({ message: 'Test stats failed', error: error.message });
  }
});

// Test endpoint to check users and authentication
userDashboardRouter.get('/test/users', async (req, res) => {
  try {
    const User = require('../models/model');
    const users = await User.find().select('firstName lastName email role');
    
    res.json({
      message: 'Users found',
      count: users.length,
      users: users.map(u => ({
        id: u._id,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        role: u.role
      }))
    });
  } catch (error) {
    console.error('Test users error:', error);
    res.status(500).json({ message: 'Test users failed', error: error.message });
  }
});

// Debug endpoint to check weekly and monthly activity for a specific user
userDashboardRouter.get('/debug/activity/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    // Get weekly activity for the current week in IST
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const weeklyActivity = await Attempt.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startOfWeek, $lte: endOfWeek }
        } 
      },
      {
        $project: {
          localDayOfWeek: {
            $dayOfWeek: {
              date: '$createdAt',
              timezone: '+05:30' // IST timezone
            }
          },
          quizzesTaken: 1
        }
      },
      {
        $group: {
          _id: '$localDayOfWeek',
          quizzesTaken: { $sum: 1 },
          attempts: { $push: { score: '$score', createdAt: '$createdAt' } }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Get monthly activity for the last 6 months
    const currentDate = new Date();
    const startMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1);
    
    const monthlyActivity = await Attempt.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startMonth }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          quizzesTaken: { $sum: 1 },
          averageScore: { $avg: '$score' },
          attempts: { $push: { score: '$score', createdAt: '$createdAt' } }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get all attempts for this user in the current week
    const currentWeekAttempts = await Attempt.find({ 
      user: userId,
      createdAt: { $gte: startOfWeek, $lte: endOfWeek }
    }).populate('quiz', 'title').sort({ createdAt: -1 });

    res.json({
      message: 'Activity debug data (IST)',
      userId,
      currentWeek: {
        start: startOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        end: endOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        activity: weeklyActivity,
        attempts: currentWeekAttempts.map(a => ({
          quizTitle: a.quiz?.title || 'Unknown',
          score: a.score,
          createdAt: a.createdAt,
          localTime: a.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          dayOfWeek: a.createdAt.getDay() + 1 // MongoDB dayOfWeek (1=Sunday, 2=Monday, etc.)
        }))
      },
      last6Months: {
        startMonth,
        activity: monthlyActivity
      }
    });
  } catch (error) {
    console.error('Debug activity error:', error);
    res.status(500).json({ message: 'Debug activity failed', error: error.message });
  }
});

// Endpoint to get user's enrolled courses (subjects they have access to)
userDashboardRouter.get('/enrolled-courses', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const mongoose = require('mongoose');
    const Subject = require('../models/subjectModel');
    const Attempt = require('../models/quizAttemptModel');
    const Subscription = require('../models/subscription');
    
    // Get user's active subscriptions
    const activeSubscriptions = await Subscription.find({
      userId: userId,
      status: 'success',
      endDate: { $gte: new Date() }
    });
    
    // Get subscription levels the user has access to
    const userSubscriptionLevels = activeSubscriptions.map(sub => sub.planType);
    
    // If no active subscriptions, give access to Basic level only
    const accessibleLevels = userSubscriptionLevels.length > 0 ? userSubscriptionLevels : ['Basic'];
    
    // Get subjects the user has access to based on subscription
    const accessibleSubjects = await Subject.find({
      level: { $in: accessibleLevels },
      isActive: true
    }).sort({ name: 1 });
    
    // Get subjects the user has actually attempted quizzes for
    const userAttempts = await Attempt.find({ user: userId })
      .populate({
        path: 'quiz',
        populate: {
          path: 'subject',
          select: 'name description level'
        }
      });
    
    const attemptedSubjectIds = [...new Set(userAttempts.map(attempt => 
      attempt.quiz?.subject?._id?.toString()
    ).filter(Boolean))];
    
    // Combine accessible subjects with attempted subjects
    const enrolledSubjects = accessibleSubjects.map(subject => ({
      _id: subject._id,
      name: subject.name,
      description: subject.description,
      level: subject.level,
      isEnrolled: attemptedSubjectIds.includes(subject._id.toString()),
      quizCount: 0 // This could be populated with actual quiz count if needed
    }));
    
    res.status(200).json({
      subjects: enrolledSubjects,
      message: 'Enrolled courses retrieved successfully'
    });
    
  } catch (error) {
    console.error('Get enrolled courses error:', error);
    res.status(500).json({ message: 'Failed to get enrolled courses', error: error.message });
  }
});

// Test endpoint to check weekly and monthly activity calculations
userDashboardRouter.get('/test/activity-calculation', async (req, res) => {
  try {
    const Attempt = require('../models/quizAttemptModel');
    const mongoose = require('mongoose');
    
    // Get a sample user ID for testing
    const sampleUser = await Attempt.findOne().select('user');
    if (!sampleUser) {
      return res.status(404).json({ message: 'No quiz attempts found in database' });
    }
    
    const userId = sampleUser.user;
    
    // Get weekly activity for the current week (Monday to Sunday) in Sri Lanka timezone
const now = new Date();
const startOfWeek = new Date(now);
startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
startOfWeek.setHours(0, 0, 0, 0);

const endOfWeek = new Date(startOfWeek);
endOfWeek.setDate(startOfWeek.getDate() + 6);
endOfWeek.setHours(23, 59, 59, 999);

console.log('📅 Date Range (Sri Lanka Time):', {
  startOfWeek: startOfWeek.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }),
  endOfWeek: endOfWeek.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }),
  now: now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' })
});

const weeklyActivity = await Attempt.aggregate([
  { 
    $match: { 
      user: new mongoose.Types.ObjectId(userId),
      createdAt: { $gte: startOfWeek, $lte: endOfWeek }
    } 
  },
  {
    $project: {
      // Use Asia/Colombo timezone for Sri Lanka
      localDayOfWeek: {
        $dayOfWeek: {
          date: '$createdAt',
          timezone: 'Asia/Colombo' // Use timezone name instead of offset
        }
      },
      createdAt: 1,
      quizzesTaken: 1
    }
  },
  {
    $group: {
      _id: '$localDayOfWeek',
      quizzesTaken: { $sum: 1 }
    }
  },
  { $sort: { '_id': 1 } }
]);

// Create an array with 7 zeros (Sunday to Saturday)
const completeWeeklyActivity = Array(7).fill(0);

// Map MongoDB day numbers (1=Sunday, 2=Monday, etc.) to array with Monday first
weeklyActivity.forEach(day => {
  const frontendIndex = day._id - 1; // Convert MongoDB day (1-7) to array index (0-6)
  if (frontendIndex >= 0 && frontendIndex < 7) {
    // Reorder: put Monday (index 1) at position 0, Tuesday at 1, etc., Sunday at 6
    const reorderedIndex = (frontendIndex + 6) % 7;
    completeWeeklyActivity[reorderedIndex] = day.quizzesTaken;
  }
});

console.log('📅 Weekly Activity Debug (Sri Lanka Time):', {
  startOfWeek: startOfWeek.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }),
  endOfWeek: endOfWeek.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }),
  rawWeeklyActivity: weeklyActivity,
  completeWeeklyActivity,
  dayMapping: {
    1: 'Sunday (index 6)',
    2: 'Monday (index 0)', 
    3: 'Tuesday (index 1)',
    4: 'Wednesday (index 2)',
    5: 'Thursday (index 3)',
    6: 'Friday (index 4)',
    7: 'Saturday (index 5)'
  }
});

    // Test monthly activity calculation
    const currentDate = new Date();
    const startMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 5, 1);
    
    const monthlyActivity = await Attempt.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startMonth }
        } 
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          quizzesTaken: { $sum: 1 },
          averageScore: { $avg: '$score' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Ensure all 6 months are represented
    const completeMonthlyActivity = [];
    for (let i = 0; i < 6; i++) {
      const monthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth() + 1;
      
      const monthData = monthlyActivity.find(m => m._id.year === year && m._id.month === month);
      completeMonthlyActivity.push({
        month: `${year}-${month.toString().padStart(2, '0')}`,
        quizzesTaken: monthData ? monthData.quizzesTaken : 0,
        averageScore: monthData ? Math.round(monthData.averageScore || 0) : 0
      });
    }
    completeMonthlyActivity.reverse();

    res.json({
      message: 'Activity calculation test successful (IST)',
      testUserId: userId,
      weeklyActivity: {
        startOfWeek: startOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        endOfWeek: endOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        raw: weeklyActivity,
        complete: completeWeeklyActivity
      },
      monthlyActivity: {
        startMonth,
        raw: monthlyActivity,
        complete: completeMonthlyActivity
      }
    });
    
  } catch (error) {
    console.error('Activity calculation test error:', error);
    res.status(500).json({ message: 'Activity calculation test failed', error: error.message });
  }
});

// Test endpoint for weekly activity calculation (no auth required)
userDashboardRouter.get('/test/weekly-activity', async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
    endOfWeek.setHours(23, 59, 59, 999);

    console.log('🧪 Test Weekly Activity Calculation (IST):', {
      now: now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      startOfWeek: startOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      endOfWeek: endOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    });

    // Get all attempts in the current week
    const weeklyAttempts = await Attempt.find({
      createdAt: { $gte: startOfWeek, $lte: endOfWeek }
    }).select('createdAt').sort('createdAt');

    const weeklyActivity = await Attempt.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startOfWeek, $lte: endOfWeek }
        } 
      },
      {
        $project: {
          localDayOfWeek: {
            $dayOfWeek: {
              date: '$createdAt',
              timezone: '+05:30' // IST timezone
            }
          },
          quizzesTaken: 1
        }
      },
      {
        $group: {
          _id: '$localDayOfWeek',
          quizzesTaken: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    // Ensure all days of the week are represented
    const completeWeeklyActivity = Array(7).fill(0);
    weeklyActivity.forEach(day => {
      const frontendIndex = day._id - 1;
      if (frontendIndex >= 0 && frontendIndex < 7) {
        const reorderedIndex = (frontendIndex + 6) % 7;
        completeWeeklyActivity[reorderedIndex] = day.quizzesTaken;
      }
    });

    res.json({
      message: 'Weekly activity test data (IST)',
      dateRange: {
        startOfWeek: startOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        endOfWeek: endOfWeek.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      },
      rawWeeklyActivity: weeklyActivity,
      completeWeeklyActivity,
      allAttempts: weeklyAttempts.map(a => ({
        date: a.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        dayOfWeek: a.createdAt.getDay() + 1 // MongoDB dayOfWeek (1=Sunday, 2=Monday, etc.)
      })),
      dayMapping: {
        1: 'Sunday',
        2: 'Monday', 
        3: 'Tuesday',
        4: 'Wednesday',
        5: 'Thursday',
        6: 'Friday',
        7: 'Saturday'
      }
    });

  } catch (error) {
    console.error('Test weekly activity error:', error);
    res.status(500).json({ message: 'Test error', error: error.message });
  }
});

module.exports = userDashboardRouter;
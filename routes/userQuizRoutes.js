const express = require('express');
const userQuizRouter = express.Router();
const userQuizController = require('../controllers/userQuizController');
const { authenticate } = require('../middleware/authMiddleware');
const { checkAnySubscriptionAccess, attachSubscriptionInfo } = require('../middleware/userSubscriptionMiddleware');
const Quiz = require('../models/quizModel');

userQuizRouter.get('/', async (req, res) => {
  try {
    const { subject, search, difficulty, sort, page = 1, limit = 10 } = req.query;
    
    const query = { isActive: true };
    
    if (subject) {
      query.subject = require('mongoose').Types.ObjectId.isValid(subject) ? subject : null;
    }
    
    if (difficulty) {
      query.difficulty = difficulty;
    }
    
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }
    
    const sortOptions = {};
    if (sort) {
      const [field, order] = sort.split(':');
      sortOptions[field] = order === 'desc' ? -1 : 1;
    } else {
      sortOptions.createdAt = -1;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const quizzes = await Quiz.find(query)
      .populate('subject', 'name level')
      .select('-questions')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Quiz.countDocuments(query);
    
    const transformedQuizzes = quizzes.map(quiz => ({
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      subject: quiz.subject,
      timeLimit: quiz.timeLimit,
      difficulty: quiz.difficulty,
      createdAt: quiz.createdAt,
      subscriptionLevel: quiz.subscriptionLevel
    }));

    console.log("transformedQuizzes : ",transformedQuizzes);
    
    res.status(200).json({
      quizzes: transformedQuizzes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

userQuizRouter.use(authenticate);

// Get quizzes by subject (requires authentication)
userQuizRouter.get('/subject/:subjectId', async (req, res) => {
  try {
    const { subjectId } = req.params;
    const mongoose = require('mongoose');
    
    if (!mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: 'Invalid subject ID format' });
    }
    
    const Subject = require('../models/subjectModel');
    const subject = await Subject.findOne({ _id: subjectId, isActive: true });
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found or inactive' });
    }
    
    const quizzes = await Quiz.find({ subject: subjectId, isActive: true })
      .select('title description difficulty timeLimit createdAt subscriptionLevel')
      .sort({ createdAt: -1 });
    
    res.status(200).json({ 
      subject: {
        _id: subject._id,
        name: subject.name,
        level: subject.level
      },
      quizzes,
      count: quizzes.length
    });
  } catch (error) {
    console.error('Get quizzes by subject error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Test endpoint to check authentication and quiz data
userQuizRouter.get('/test/:quizId', async (req, res) => {
  try {
    const { quizId } = req.params;
    console.log('Test endpoint - User:', req.user);
    console.log('Test endpoint - Quiz ID:', quizId);
    
    const quiz = await Quiz.findById(quizId).select('title questions');
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    // Test QuizAttempt model creation
    const QuizAttempt = require('../models/quizAttemptModel');
    const testAttempt = new QuizAttempt({
      user: req.user.userId,
      quiz: quizId,
      score: 50,
      passed: true,
      timeSpent: 300,
      answers: [{
        question: quiz.questions[0]._id,
        selectedOption: 0,
        correctOption: 0,
        isCorrect: true
      }]
    });
    
    console.log('Test attempt object created:', testAttempt);
    
    res.json({
      message: 'Test successful',
      user: req.user,
      quiz: {
        id: quiz._id,
        title: quiz.title,
        questionsCount: quiz.questions.length
      },
      testAttempt: {
        userId: testAttempt.user,
        quizId: testAttempt.quiz,
        score: testAttempt.score,
        passed: testAttempt.passed,
        timeSpent: testAttempt.timeSpent,
        answersCount: testAttempt.answers.length
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ message: 'Test failed', error: error.message });
  }
});

// Specific routes must come before parameterized routes
userQuizRouter.get('/history', userQuizController.getUserQuizHistory);
userQuizRouter.get('/stats', userQuizController.getUserStats);
userQuizRouter.get('/attempt/:attemptId', userQuizController.getAttemptDetails);

// Parameterized routes come last - add subscription info to request
userQuizRouter.get('/:id/attempt', attachSubscriptionInfo, userQuizController.getQuizForAttempt);
userQuizRouter.post('/:id/submit', attachSubscriptionInfo, userQuizController.submitQuizAttempt);

module.exports = userQuizRouter;
const Attempt = require('../models/quizAttemptModel');
const Quiz = require('../models/quizModel');
const mongoose = require('mongoose');

// Save quiz attempt after submission
const saveQuizAttempt = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { answers, timeSpent, startedAt } = req.body;
    const userId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: 'Invalid quiz ID format' });
    }

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers array is required' });
    }

    const quiz = await Quiz.findOne({ _id: quizId, isActive: true })
      .populate('subject', 'name level');
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found or inactive' });
    }

    if (answers.length !== quiz.questions.length) {
      return res.status(400).json({ 
        message: 'Number of answers must match number of questions' 
      });
    }

    // Calculate score and prepare answers for saving
    let correctAnswers = 0;
    const processedAnswers = [];
    const detailedResults = [];

    quiz.questions.forEach((question, index) => {
      const userAnswer = answers[index];
      const isCorrect = userAnswer === question.correctAnswer;
      
      if (isCorrect) {
        correctAnswers++;
      }

      // For saving to database
      processedAnswers.push({
        question: new mongoose.Types.ObjectId(), // Generate unique ID for this question attempt
        selectedOption: userAnswer,
        correctOption: question.correctAnswer,
        isCorrect: isCorrect
      });

      // For response
      detailedResults.push({
        questionIndex: index,
        question: question.question,
        options: question.options,
        userAnswer: userAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect: isCorrect,
        explanation: question.explanation || null
      });
    });

    const totalQuestions = quiz.questions.length;
    const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100);
    const passed = scorePercentage >= quiz.passingScore;

    // Save attempt to database
    const attemptData = {
      user: userId,
      quiz: quizId,
      answers: processedAnswers,
      score: scorePercentage,
      passed: passed,
      timeSpent: timeSpent || 0
    };

    const attempt = new Attempt(attemptData);
    await attempt.save();

    res.status(201).json({
      message: 'Quiz attempt saved successfully',
      attemptId: attempt._id,
      results: {
        quizId: quiz._id,
        quizTitle: quiz.title,
        subject: quiz.subject,
        totalQuestions: totalQuestions,
        correctAnswers: correctAnswers,
        incorrectAnswers: totalQuestions - correctAnswers,
        scorePercentage: scorePercentage,
        passingScore: quiz.passingScore,
        passed: passed,
        timeSpent: timeSpent || 0,
        submittedAt: attempt.createdAt,
        detailedResults: detailedResults
      }
    });

  } catch (error) {
    console.error('Save quiz attempt error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user's quiz history
const getUserQuizHistory = async (req, res) => {
  try {
    console.log('getUserQuizHistory - Request user:', req.user);
    console.log('getUserQuizHistory - Request query:', req.query);
    
    const userId = req.user.userId;
    console.log('getUserQuizHistory - User ID:', userId);
    
    const { page = 1, limit = 10, quizId, passed } = req.query;

    // Build query
    const query = { user: userId };
    
    if (quizId && mongoose.Types.ObjectId.isValid(quizId)) {
      query.quiz = quizId;
    }
    
    if (passed !== undefined) {
      query.passed = passed === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const attempts = await Attempt.find(query)
      .populate({
        path: 'quiz',
        select: 'title description difficulty passingScore subject subscriptionLevel',
        populate: {
          path: 'subject',
          select: 'name level'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Attempt.countDocuments(query);

    const formattedAttempts = attempts.map(attempt => ({
      id: attempt._id,
      quiz: {
        id: attempt.quiz._id,
        title: attempt.quiz.title,
        description: attempt.quiz.description,
        difficulty: attempt.quiz.difficulty,
        passingScore: attempt.quiz.passingScore,
        subject: attempt.quiz.subject,
        subscriptionLevel: attempt.quiz.subscriptionLevel
      },
      score: {
        percentage: attempt.score || 0,
        correct: attempt.answers ? attempt.answers.filter(a => a.isCorrect).length : 0,
        total: attempt.answers ? attempt.answers.length : 0
      },
      passed: attempt.passed,
      timeSpent: attempt.timeSpent || 0,
      submittedAt: attempt.createdAt
    }));

    res.status(200).json({
      attempts: formattedAttempts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Get user quiz history error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user's attempts for a specific quiz
const getUserQuizAttempts = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: 'Invalid quiz ID format' });
    }

    const attempts = await Attempt.find({ 
      user: userId, 
      quiz: quizId 
    })
    .populate('quiz', 'title description difficulty passingScore subject subscriptionLevel')
    .sort({ createdAt: -1 });

    const formattedAttempts = attempts.map(attempt => ({
      id: attempt._id,
      score: {
        percentage: attempt.score || 0,
        correct: attempt.answers ? attempt.answers.filter(a => a.isCorrect).length : 0,
        total: attempt.answers ? attempt.answers.length : 0
      },
      passed: attempt.passed,
      timeSpent: attempt.timeSpent || 0,
      submittedAt: attempt.createdAt
    }));

    // Get quiz info
    const quiz = await Quiz.findById(quizId)
      .populate('subject', 'name level')
      .select('title description difficulty passingScore subject subscriptionLevel');

    res.status(200).json({
      quiz: {
        id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        difficulty: quiz.difficulty,
        passingScore: quiz.passingScore,
        subject: quiz.subject,
        subscriptionLevel: quiz.subscriptionLevel
      },
      attempts: formattedAttempts,
      attemptCount: attempts.length,
      hasAttempted: attempts.length > 0,
      bestScore: attempts.length > 0 ? Math.max(...attempts.map(a => a.score || 0)) : 0
    });

  } catch (error) {
    console.error('Get user quiz attempts error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get detailed results of a specific attempt
const getAttemptDetails = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const userId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ message: 'Invalid attempt ID format' });
    }

    const attempt = await Attempt.findOne({ 
      _id: attemptId, 
      user: userId 
    })
    .populate({
      path: 'quiz',
      select: 'title description questions difficulty passingScore subject subscriptionLevel',
      populate: {
        path: 'subject',
        select: 'name level'
      }
    });

    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }

    // Build detailed results
    const detailedResults = attempt.quiz.questions.map((question, index) => {
      const userAnswer = attempt.answers[index];
      return {
        questionIndex: index,
        question: question.question,
        options: question.options,
        userAnswer: userAnswer ? userAnswer.selectedOption : null,
        correctAnswer: question.correctAnswer,
        isCorrect: userAnswer ? userAnswer.isCorrect : false,
        explanation: question.explanation || null
      };
    });

    res.status(200).json({
      attempt: {
        id: attempt._id,
        quiz: {
          id: attempt.quiz._id,
          title: attempt.quiz.title,
          description: attempt.quiz.description,
          difficulty: attempt.quiz.difficulty,
          passingScore: attempt.quiz.passingScore,
          subject: attempt.quiz.subject,
          subscriptionLevel: attempt.quiz.subscriptionLevel
        },
        score: attempt.score,
        passed: attempt.passed,
        timeSpent: attempt.timeSpent,
        submittedAt: attempt.createdAt,
        detailedResults: detailedResults
      }
    });

  } catch (error) {
    console.error('Get attempt details error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get user's quiz statistics
const getUserQuizStats = async (req, res) => {
  try {
    const userId = req.user.userId;

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

    // Get attempts by difficulty
    const difficultyStats = await Attempt.aggregate([
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
        $group: {
          _id: '$quizData.difficulty',
          count: { $sum: 1 },
          passed: { $sum: { $cond: ['$passed', 1, 0] } },
          avgScore: { $avg: '$score' }
        }
      }
    ]);

    // Get unique quizzes attempted
    const uniqueQuizzes = await Attempt.distinct('quiz', { user: userId });

    const stats = {
      totalAttempts,
      passedAttempts,
      failedAttempts: totalAttempts - passedAttempts,
      passRate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
      uniqueQuizzesAttempted: uniqueQuizzes.length,
      averageScore: scoreStats.length > 0 ? Math.round(scoreStats[0].avgScore) : 0,
      highestScore: scoreStats.length > 0 ? scoreStats[0].highestScore : 0,
      lowestScore: scoreStats.length > 0 ? scoreStats[0].lowestScore : 0,
      byDifficulty: difficultyStats.map(stat => ({
        difficulty: stat._id,
        attempts: stat.count,
        passed: stat.passed,
        passRate: Math.round((stat.passed / stat.count) * 100),
        averageScore: Math.round(stat.avgScore)
      }))
    };

    res.status(200).json({ stats });

  } catch (error) {
    console.error('Get user quiz stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Check if user has attempted a specific quiz
const checkQuizAttempted = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: 'Invalid quiz ID format' });
    }

    const attemptCount = await Attempt.countDocuments({ 
      user: userId, 
      quiz: quizId 
    });

    const lastAttempt = await Attempt.findOne({ 
      user: userId, 
      quiz: quizId 
    })
    .sort({ createdAt: -1 })
    .select('score passed createdAt timeSpent');

    res.status(200).json({
      hasAttempted: attemptCount > 0,
      attemptCount,
      lastAttempt: lastAttempt ? {
        score: lastAttempt.score,
        passed: lastAttempt.passed,
        submittedAt: lastAttempt.createdAt,
        timeSpent: lastAttempt.timeSpent
      } : null
    });

  } catch (error) {
    console.error('Check quiz attempted error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  saveQuizAttempt,
  getUserQuizHistory,
  getUserQuizAttempts,
  getAttemptDetails,
  getUserQuizStats,
  checkQuizAttempted
};
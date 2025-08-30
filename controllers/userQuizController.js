const Quiz = require('../models/quizModel');
const Subject = require('../models/subjectModel');
const QuizAttempt = require('../models/quizAttemptModel');
const mongoose = require('mongoose');

const getAvailableQuizzes = async (req, res) => {
  try {
    const { subject, search, difficulty, sort, page = 1, limit = 10 } = req.query;
    
    const query = { isActive: true };
    
    if (subject) {
      query.subject = mongoose.Types.ObjectId.isValid(subject) ? subject : null;
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
      .select('-questions.correctAnswer -questions.explanation')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Quiz.countDocuments(query);
    
    const transformedQuizzes = quizzes.map(quiz => ({
      _id: quiz._id,
      title: quiz.title,
      description: quiz.description,
      subject: quiz.subject,
      questionsCount: quiz.questions ? quiz.questions.length : 0,
      subscriptionLevel: quiz.subscriptionLevel,
      timeLimit: quiz.timeLimit,
      difficulty: quiz.difficulty,
      createdAt: quiz.createdAt
    }));
    
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
    console.error('Get available quizzes error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getQuizzesBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(subjectId)) {
      return res.status(400).json({ message: 'Invalid subject ID format' });
    }
    
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
};

const getQuizForAttempt = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid quiz ID format' });
    }
    
    const quiz = await Quiz.findOne({ _id: id, isActive: true })
      .populate('subject', 'name level');
    
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found or inactive' });
    }

    // Check subscription access for Pro/OL/AL content
    const subjectLevel = quiz.subject.level;
    const requiresSubscription = ['Pro', 'OL', 'AL'].includes(subjectLevel);
    
    if (requiresSubscription) {
      const userSubscriptions = req.userSubscriptions || [];
      const hasAccess = userSubscriptions.some(level => ['Pro', 'OL', 'AL'].includes(level));
      
      if (!hasAccess) {
        return res.status(403).json({ 
          message: 'Access denied. This quiz requires a Pro/OL/AL subscription.',
          requiredLevel: subjectLevel,
          userSubscriptions: userSubscriptions
        });
      }
    }
    
    const previousAttempts = await QuizAttempt.find({
      user: req.user.userId,
      quiz: id
    }).countDocuments();
    
    const response = {
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        subject: quiz.subject,
        timeLimit: quiz.timeLimit,
        difficulty: quiz.difficulty,
        subscriptionLevel: quiz.subscriptionLevel,
        questions: quiz.questions.map(q => ({
          _id: q._id,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer
        })),
        passingScore: quiz.passingScore
      },
      previousAttempts
    };
    
    res.status(200).json(response);
  } catch (error) {
    console.error('Get quiz for attempt error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const submitQuizAttempt = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { answers, timeSpent } = req.body;
    
    console.log('Submit quiz attempt - Request data:', {
      quizId,
      answersCount: answers?.length,
      timeSpent,
      userId: req.user?.userId
    });
    
    if (!quizId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Quiz ID and answers array are required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: 'Invalid quiz ID format' });
    }
    
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    
    console.log('Quiz found:', {
      quizId: quiz._id,
      title: quiz.title,
      questionsCount: quiz.questions.length,
      passingScore: quiz.passingScore
    });
    
    let correctAnswers = 0;
    const questionResults = [];
    
    answers.forEach((answer, index) => {
      const question = quiz.questions.id(answer.questionId);
      if (!question) {
        console.log(`Question not found for ID: ${answer.questionId}`);
        return;
      }
      
      const isCorrect = answer.selectedOption !== -1 && question.correctAnswer === answer.selectedOption;
      if (isCorrect) correctAnswers++;
      
      questionResults.push({
        question: answer.questionId,
        selectedOption: answer.selectedOption,
        correctOption: question.correctAnswer,
        isCorrect
      });
    });
    
    const totalQuestions = quiz.questions.length;
    const score = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
    const passed = score >= quiz.passingScore;
    
    console.log('Quiz results calculated:', {
      correctAnswers,
      totalQuestions,
      score,
      passed,
      questionResultsCount: questionResults.length
    });
    
    // Test database connection and model validation
    try {
      const testAttempt = new QuizAttempt({
        user: req.user.userId,
        quiz: quizId,
        score: 0,
        passed: false,
        timeSpent: 0,
        answers: []
      });
      
      console.log('Test attempt object created successfully');
      console.log('Test attempt validation:', testAttempt.validateSync());
    } catch (validationError) {
      console.error('Validation error:', validationError);
      return res.status(400).json({ message: 'Validation error', error: validationError.message });
    }
    
    const attempt = new QuizAttempt({
      user: req.user.userId,
      quiz: quizId,
      score,
      passed,
      timeSpent: timeSpent || 0,
      answers: questionResults
    });
    
    console.log('Attempt object created:', {
      userId: attempt.user,
      quizId: attempt.quiz,
      score: attempt.score,
      passed: attempt.passed,
      timeSpent: attempt.timeSpent,
      answersCount: attempt.answers.length
    });
    
    await attempt.save();
    console.log('Attempt saved successfully with ID:', attempt._id);
    
    const response = {
      attemptId: attempt._id,
      score,
      correctAnswers,
      totalQuestions,
      passed,
      passingScore: quiz.passingScore,
      results: questionResults.map(result => ({
        questionId: result.question,
        selectedOption: result.selectedOption,
        correctOption: result.correctOption,
        isCorrect: result.isCorrect,
        explanation: quiz.questions.id(result.question)?.explanation || ''
      }))
    };
    
    console.log('Sending response:', response);
    res.status(200).json(response);
  } catch (error) {
    console.error('Submit quiz attempt error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUserQuizHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const attempts = await QuizAttempt.find({ user: req.user.userId })
      .populate({
        path: 'quiz',
        select: 'title subject difficulty subscriptionLevel',
        populate: {
          path: 'subject',
          select: 'name level'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await QuizAttempt.countDocuments({ user: req.user.userId });
    
    res.status(200).json({
      attempts,
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

const getAttemptDetails = async (req, res) => {
  try {
    const { attemptId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ message: 'Invalid attempt ID format' });
    }
    
    const attempt = await QuizAttempt.findById(attemptId)
      .populate({
        path: 'quiz',
        populate: {
          path: 'subject',
          select: 'name level subscriptionLevel'
        }
      });
    
    if (!attempt) {
      return res.status(404).json({ message: 'Attempt not found' });
    }
    
    if (attempt.user.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied: Not your attempt' });
    }
    
    const quiz = await Quiz.findById(attempt.quiz._id);
    
    const detailedResults = attempt.answers.map(answer => {
      const question = quiz.questions.id(answer.question);
      return {
        question: question ? question.question : 'Question not found',
        options: question ? question.options : [],
        selectedOption: answer.selectedOption,
        correctOption: answer.correctOption,
        isCorrect: answer.isCorrect,
        explanation: question ? question.explanation : ''
      };
    });
    
    res.status(200).json({
      attempt: {
        _id: attempt._id,
        quiz: {
          _id: attempt.quiz._id,
          title: attempt.quiz.title,
          subject: attempt.quiz.subject,
          subscriptionLevel: attempt.quiz.subscriptionLevel
        },
        score: attempt.score,
        passed: attempt.passed,
        timeSpent: attempt.timeSpent,
        createdAt: attempt.createdAt
      },
      detailedResults
    });
  } catch (error) {
    console.error('Get attempt details error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getUserStats = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const totalAttempts = await QuizAttempt.countDocuments({ user: userId });
    
    const scoreStats = await QuizAttempt.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      { $group: {
          _id: null,
          averageScore: { $avg: '$score' },
          highestScore: { $max: '$score' },
          lowestScore: { $min: '$score' }
        }
      }
    ]);
    
    const passedCount = await QuizAttempt.countDocuments({ user: userId, passed: true });
    
    const recentAttempts = await QuizAttempt.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate({
        path: 'quiz',
        select: 'title subscriptionLevel'
      });
    
    const subjectPerformance = await QuizAttempt.aggregate([
      { $match: { user: mongoose.Types.ObjectId(userId) } },
      { $lookup: {
          from: 'quizzes',
          localField: 'quiz',
          foreignField: '_id',
          as: 'quizData'
        }
      },
      { $unwind: '$quizData' },
      { $group: {
          _id: '$quizData.subject',
          attemptCount: { $sum: 1 },
          averageScore: { $avg: '$score' },
          passCount: { $sum: { $cond: [{ $eq: ['$passed', true] }, 1, 0] } }
        }
      },
      { $lookup: {
          from: 'subjects',
          localField: '_id',
          foreignField: '_id',
          as: 'subjectData'
        }
      },
      { $unwind: '$subjectData' }
    ]);
    
    res.status(200).json({
      totalAttempts,
      averageScore: scoreStats.length > 0 ? scoreStats[0].averageScore : 0,
      highestScore: scoreStats.length > 0 ? scoreStats[0].highestScore : 0,
      lowestScore: scoreStats.length > 0 ? scoreStats[0].lowestScore : 0,
      passedCount,
      failedCount: totalAttempts - passedCount,
      passRate: totalAttempts > 0 ? (passedCount / totalAttempts) * 100 : 0,
      recentAttempts: recentAttempts.map(attempt => ({
        _id: attempt._id,
        quizTitle: attempt.quiz.title,
        subscriptionLevel: attempt.quiz.subscriptionLevel,
        score: attempt.score,
        passed: attempt.passed,
        date: attempt.createdAt
      })),
      subjectPerformance: subjectPerformance.map(subject => ({
        subjectId: subject._id,
        subjectName: subject.subjectData.name,
        attemptCount: subject.attemptCount,
        averageScore: subject.averageScore,
        passRate: subject.attemptCount > 0 ? (subject.passCount / subject.attemptCount) * 100 : 0
      }))
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getAvailableQuizzes,
  getQuizzesBySubject,
  getQuizForAttempt,
  submitQuizAttempt,
  getUserQuizHistory,
  getAttemptDetails,
  getUserStats
};
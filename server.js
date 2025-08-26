const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const User = require('./models/model');
const router = require('./routes/router');
const adminRouter = require('./routes/adminrouter');
const paymentRouter = require('./routes/paymentRouter');
const subjectRouter = require('./routes/subjectRoutes');
const userSubjectRouter = require('./routes/userSubjectRoutes');
const userQuizRouter = require('./routes/userQuizRoutes');
const userAttemptRouter = require('./routes/userAttemptRoutes');
const userDashboardRouter = require('./routes/userDashboardRoutes');
const userProfileRouter = require('./routes/userProfileRoutes');
const passwordResetRouter = require('./routes/passwordResetRoutes');
const feedbackRouter = require('./routes/feedbackRoutes');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT ;
const host = process.env.HOST ;

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'uploads'))); // Serve uploaded files
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(
  session({
    secret: process.env.JWT_SECRET || 'mcquiz-secret',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    }
  })
);
app.use(passport.initialize());
app.use(passport.session());

const uri = process.env.MONGODB_URI;
const connect = async () => {
  try {
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};
connect();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

passport.use(
  new GoogleStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: `http://${host}:${port}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ email: profile.emails[0].value });
        if (user) {
          if (!user.googleId) {
            user.googleId = profile.id;
            user.firstName = profile.name.givenName;
            user.lastName = profile.name.familyName;
            await user.save();
          }
        } else {
          user = new User({
            googleId: profile.id,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            email: profile.emails[0].value,
            role: 'user'
          });
          await user.save();
        }
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
        const user = await User.findById(id);
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    });

    app.get(
      '/auth/google',
      (req, res, next) => {
        try {
          req.session.oauthFrom = req.query.from || '/';
        } catch (_) {}
        next();
      },
      passport.authenticate('google', { scope: ['profile', 'email'] })
    );

    // Duplicate routes under /api for clients expecting API-prefixed auth paths
    app.get(
      '/api/auth/google',
      (req, res, next) => {
        try {
          req.session.oauthFrom = req.query.from || '/';
        } catch (_) {}
        next();
      },
      passport.authenticate('google', { scope: ['profile', 'email'] })
    );

    app.get(
      '/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/' }),
      (req, res) => {
        const token = jwt.sign(
          { userId: req.user._id, email: req.user.email, role: req.user.role },
          process.env.JWT_SECRET,
          { expiresIn: '8h' }
        );
        const from = (req.session && req.session.oauthFrom) || '/';
        if (req.session) req.session.oauthFrom = undefined;
        res.redirect(`${FRONTEND_URL}/oauth/callback?token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}`);
      }
    );

    app.get(
      '/api/auth/google/callback',
      passport.authenticate('google', { failureRedirect: '/' }),
      (req, res) => {
        const token = jwt.sign(
          { userId: req.user._id, email: req.user.email, role: req.user.role },
          process.env.JWT_SECRET,
          { expiresIn: '8h' }
        );
        const from = (req.session && req.session.oauthFrom) || '/';
        if (req.session) req.session.oauthFrom = undefined;
        res.redirect(`${FRONTEND_URL}/oauth/callback?token=${encodeURIComponent(token)}&from=${encodeURIComponent(from)}`);
      }
    );

    app.get('/auth/logout', (req, res) => {
      req.logout((err) => {
        if (err) {
          return res.status(500).json({ message: 'Failed to log out.' });
        }
        res.redirect(FRONTEND_URL);
      });
    });

    app.get('/auth/user', (req, res) => {
      res.json(req.user || null);
    });

    // Routes
    app.use('/api', router);
    app.use('/api/admin', adminRouter);
    app.use('/api/admin/subjects', subjectRouter);
    app.use('/api/subjects', userSubjectRouter);
    app.use('/api/payment', paymentRouter);
    app.use('/api/user-quizzes', userQuizRouter);
    app.use('/api/user-attempts', userAttemptRouter);
    app.use('/api', userDashboardRouter);
    app.use('/api/user', userProfileRouter);
    app.use('/api/password-reset', passwordResetRouter);
    app.use('/api/feedback', feedbackRouter);

    // Test endpoint to check database
    app.get('/api/test/database', async (req, res) => {
      try {
        const Subject = require('./models/subjectModel');
        const Quiz = require('./models/quizModel');
        const Attempt = require('./models/quizAttemptModel');
        
        const subjects = await Subject.find({ isActive: true });
        const quizzes = await Quiz.find({ isActive: true });
        const attempts = await Attempt.find({}).populate('user', 'firstName lastName email').populate('quiz', 'title');
        
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
              user: a.user ? `${a.user.firstName} ${a.user.lastName}` : 'Unknown',
              quiz: a.quiz ? a.quiz.title : 'Unknown',
              score: a.score,
              passed: a.passed,
              timeSpent: a.timeSpent,
              answersCount: a.answers ? a.answers.length : 0,
              createdAt: a.createdAt
            }))
          }
        });
      } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({ message: 'Database test failed', error: error.message });
      }
    });

    // Fix existing quiz attempts data structure
    app.get('/api/fix-attempts', async (req, res) => {
      try {
        const Attempt = require('./models/quizAttemptModel');
        
        // Find all attempts to check and fix
        const allAttempts = await Attempt.find({});
        console.log(`Found ${allAttempts.length} total attempts`);
        
        let fixedCount = 0;
        
        for (const attempt of allAttempts) {
          let needsUpdate = false;
          
          // Fix score if it's an object or missing
          if (typeof attempt.score === 'object' && attempt.score !== null) {
            attempt.score = attempt.score.percentage || 0;
            needsUpdate = true;
          } else if (attempt.score === undefined || attempt.score === null) {
            attempt.score = 0;
            needsUpdate = true;
          }
          
          // Ensure timeSpent is a number
          if (typeof attempt.timeSpent !== 'number') {
            attempt.timeSpent = 0;
            needsUpdate = true;
          }
          
          // Fix answers structure if needed
          if (attempt.answers && Array.isArray(attempt.answers)) {
            for (const answer of attempt.answers) {
              if (answer.selectedAnswer !== undefined && answer.selectedOption === undefined) {
                answer.selectedOption = answer.selectedAnswer;
                delete answer.selectedAnswer;
                needsUpdate = true;
              }
              if (answer.questionId !== undefined && answer.question === undefined) {
                answer.question = answer.questionId;
                delete answer.questionId;
                needsUpdate = true;
              }
            }
          }
          
          if (needsUpdate) {
            await attempt.save();
            fixedCount++;
          }
        }
        
        res.json({
          message: `Checked ${allAttempts.length} attempts, fixed ${fixedCount}`,
          totalAttempts: allAttempts.length,
          fixedCount: fixedCount
        });
      } catch (error) {
        console.error('Fix attempts error:', error);
        res.status(500).json({ message: 'Failed to fix attempts', error: error.message });
      }
    });

    // Create a test quiz attempt
    app.get('/api/create-test-attempt', async (req, res) => {
      try {
        const Attempt = require('./models/quizAttemptModel');
        const Quiz = require('./models/quizModel');
        const User = require('./models/model');
        
        // Get first available quiz and user
        const quiz = await Quiz.findOne({ isActive: true });
        const user = await User.findOne({ role: 'user' });
        
        if (!quiz || !user) {
          return res.status(404).json({ message: 'No quiz or user found for testing' });
        }
        
        const testAttempt = new Attempt({
          user: user._id,
          quiz: quiz._id,
          score: 85,
          passed: true,
          timeSpent: 300, // 5 minutes
          answers: [
            {
              question: new mongoose.Types.ObjectId(),
              selectedOption: 0,
              correctOption: 0,
              isCorrect: true
            },
            {
              question: new mongoose.Types.ObjectId(),
              selectedOption: 1,
              correctOption: 1,
              isCorrect: true
            }
          ]
        });
        
        await testAttempt.save();
        
        res.json({
          message: 'Test attempt created successfully',
          attemptId: testAttempt._id,
          quiz: quiz.title,
          user: `${user.firstName} ${user.lastName}`,
          score: testAttempt.score,
          timeSpent: testAttempt.timeSpent,
          answersCount: testAttempt.answers.length,
          correctAnswers: testAttempt.answers.filter(a => a.isCorrect).length
        });
      } catch (error) {
        console.error('Create test attempt error:', error);
        res.status(500).json({ message: 'Failed to create test attempt', error: error.message });
      }
    });

    // Debug endpoint to see raw attempt data
    app.get('/api/debug/attempts', async (req, res) => {
      try {
        const Attempt = require('./models/quizAttemptModel');
        
        const attempts = await Attempt.find({}).populate('user', 'firstName lastName').populate('quiz', 'title');
        
        const debugData = attempts.map(attempt => ({
          id: attempt._id,
          user: attempt.user ? `${attempt.user.firstName} ${attempt.user.lastName}` : 'Unknown',
          quiz: attempt.quiz ? attempt.quiz.title : 'Unknown',
          rawScore: attempt.score,
          scoreType: typeof attempt.score,
          passed: attempt.passed,
          timeSpent: attempt.timeSpent,
          answersCount: attempt.answers ? attempt.answers.length : 0,
          correctAnswers: attempt.answers ? attempt.answers.filter(a => a.isCorrect).length : 0,
          createdAt: attempt.createdAt,
          answers: attempt.answers ? attempt.answers.slice(0, 2) : [] // Show first 2 answers
        }));
        
        res.json({
          totalAttempts: attempts.length,
          attempts: debugData
        });
      } catch (error) {
        console.error('Debug attempts error:', error);
        res.status(500).json({ message: 'Failed to debug attempts', error: error.message });
      }
    });

    // Test endpoint to check if a specific user has attempts
    app.get('/api/test/user-attempts/:userId', async (req, res) => {
      try {
        const Attempt = require('./models/quizAttemptModel');
        const { userId } = req.params;
        
        const attempts = await Attempt.find({ user: userId }).populate('quiz', 'title');
        
        res.json({
          userId,
          totalAttempts: attempts.length,
          attempts: attempts.map(attempt => ({
            id: attempt._id,
            quiz: attempt.quiz ? attempt.quiz.title : 'Unknown',
            score: attempt.score,
            passed: attempt.passed,
            timeSpent: attempt.timeSpent,
            answersCount: attempt.answers ? attempt.answers.length : 0,
            correctAnswers: attempt.answers ? attempt.answers.filter(a => a.isCorrect).length : 0
          }))
        });
      } catch (error) {
        console.error('Test user attempts error:', error);
        res.status(500).json({ message: 'Failed to test user attempts', error: error.message });
      }
    });

    // Create uploads directory if it doesn't exist
    const createUploadsDirectory = () => {
      const uploadsDir = path.join(__dirname, 'uploads');
      const profilePicturesDir = path.join(uploadsDir, 'profile-pictures');
      
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log('Created uploads directory');
      }
      
      if (!fs.existsSync(profilePicturesDir)) {
        fs.mkdirSync(profilePicturesDir, { recursive: true });
        console.log('Created profile-pictures directory');
      }
    };

    // Create directories on startup
    createUploadsDirectory();

    app.use((req, res, next) => {
      res.status(404).json({ message: 'Route not found' });
    });

    app.use((err, req, res, next) => {
      console.error('Unhandled error:', err);
      res.status(500).json({ 
        message: 'Server error',
        error: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
      });
    });

const server = app.listen(port, () => {
  console.log(`Node server is listening on port ${server.address().port}`);
});

    module.exports = app;
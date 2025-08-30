const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  selectedOption: {
    type: Number,
    required: true,
    default: -1
  },
  correctOption: {
    type: Number,
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true,
    default: false
  }
});

const quizAttemptSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
      index: true
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    passed: {
      type: Boolean,
      required: true,
      default: false
    },
    timeSpent: {
      type: Number,
      default: 0,
      min: 0
    },
    answers: {
      type: [answerSchema],
      default: []
    }
  },
  { timestamps: true }
);

quizAttemptSchema.index({ user: 1, quiz: 1, createdAt: -1 });

const QuizAttempt = mongoose.model('QuizAttempt', quizAttemptSchema);
module.exports = QuizAttempt;
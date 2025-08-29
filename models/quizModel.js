const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true
  },
  options: [{
    type: String,
    required: true,
    trim: true
  }],
  correctAnswer: {
    type: Number,
    required: true,
    min: 0
  },
  explanation: {
    type: String,
    trim: true
  }
});

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
      index: true
    },
    timeLimit: {
      type: Number,
      default: 0,
      min: 0
    },
    questions: [questionSchema],
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    difficulty: {
      type: String,
      enum: ['Easy', 'Medium', 'Hard'],
      default: 'Medium'
    },
    passingScore: {
      type: Number,
      default: 60,
      min: 0,
      max: 100
    },
    subscriptionLevel: {
      type: String,
      required: true,
      enum: ['basic', 'Basic', 'School Pro', 'O/L Pro', 'A/L Pro', 'school', 'ol_pro', 'al_pro'],
      default: 'Basic'
    }
  },
  { timestamps: true }
);

quizSchema.index({ subject: 1, title: 1 });

const Quiz = mongoose.model('Quiz', quizSchema);
module.exports = Quiz;
const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) =>
          !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
        message: 'Please provide a valid email address',
      },
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    company: {
      type: String,
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters'],
      default: '',
    },
    address: {
      type: String,
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters'],
      default: '',
    },
    category: {
      type: String,
      enum: {
        values: ['Work', 'Personal', 'Family', 'Friend', 'Other'],
        message: 'Category must be Work, Personal, Family, Friend, or Other',
      },
      default: 'Other',
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
      default: '',
    },
    isFavorite: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index for fast text search
contactSchema.index(
  { firstName: 'text', lastName: 'text', email: 'text', phone: 'text', company: 'text' },
  { weights: { firstName: 5, lastName: 4, email: 3, phone: 2, company: 1 } }
);

module.exports = mongoose.model('Contact', contactSchema);

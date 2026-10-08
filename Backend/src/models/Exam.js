const mongoose = require('mongoose');

const examSubjectSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    nisfiFullMarks: { type: Number, default: 40, min: 0 },
    nihaayiFullMarks: { type: Number, default: 60, min: 0 },
    fullMarks: { type: Number, default: 100, min: 1 },
    passMarks: { type: Number, default: 40, min: 0 }
}, { _id: false });

const examSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    examType: {
        type: String,
        enum: ['Weekly', 'Monthly', 'Mid-Term', 'Final', 'Quiz', 'Combined'],
        default: 'Mid-Term'
    },
    classId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
        required: true
    },
    term: {
        type: String,
        trim: true,
        default: ''
    },
    academicYear: {
        type: String,
        trim: true,
        default: () => String(new Date().getFullYear())
    },
    examDate: {
        type: Date,
        default: Date.now
    },
    // The subjects included in this exam and their full / pass marks.
    subjects: {
        type: [examSubjectSchema],
        default: []
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        // Scheduled → Ongoing → Completed (marks entered) → Published (visible as results)
        type: String,
        enum: ['Scheduled', 'Ongoing', 'Completed', 'Published'],
        default: 'Scheduled'
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('Exam', examSchema);

const asyncHandler = require('../middleware/asyncHandler');
const Exam = require('../models/Exam');
const ExamResult = require('../models/ExamResult');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Subject = require('../models/Subject');

// ---- Grading ---------------------------------------------------------------

// Standard percentage → letter grade + grade point.
const gradeFor = (pct) => {
    if (pct >= 90) return { grade: 'A+', point: 4.0 };
    if (pct >= 80) return { grade: 'A', point: 3.7 };
    if (pct >= 70) return { grade: 'B', point: 3.0 };
    if (pct >= 60) return { grade: 'C', point: 2.0 };
    if (pct >= 50) return { grade: 'D', point: 1.0 };
    return { grade: 'F', point: 0.0 };
};

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// Merge an exam's subjects, the class students, and any saved marks into a
// ranked result sheet with totals, percentage, grade and pass/fail per student.
const buildResultSheet = (exam, students, resultDocs) => {
    const isMidTerm = exam.examType === 'Mid-Term';
    const isFinal = exam.examType === 'Final';

    const getSubjectFullMarks = (sub) => {
        if (isMidTerm) return Number(sub.nisfiFullMarks || sub.fullMarks || 40);
        if (isFinal) return Number(sub.nihaayiFullMarks || sub.fullMarks || 60);
        return Number(sub.fullMarks || (Number(sub.nisfiFullMarks || 40) + Number(sub.nihaayiFullMarks || 60)));
    };

    const getSubjectPassMarks = (sub) => {
        const full = getSubjectFullMarks(sub);
        const pass = Number(sub.passMarks || 0);
        return (pass > 0 && pass < full) ? pass : Math.round(full * 0.4);
    };

    const byStudent = new Map();
    resultDocs.forEach((r) => byStudent.set(String(r.studentId), r));

    const subjects = exam.subjects || [];
    const totalFull = subjects.reduce((sum, s) => sum + getSubjectFullMarks(s), 0);

    const rows = students.map((s) => {
        const doc = byStudent.get(String(s._id));
        const marksMap = new Map();
        (doc?.marks || []).forEach((m) => marksMap.set(m.subject, m));
        const entered = !!doc && (doc.marks || []).length > 0;

        let totalObtained = 0;
        let failedSubjects = 0;
        const subjectResults = subjects.map((sub) => {
            const m = marksMap.get(sub.name);
            const isAbsent = !!m?.isAbsent;
            const nisfi = isAbsent ? 0 : Number(m?.nisfi || 0);
            const nihaayi = isAbsent ? 0 : Number(m?.nihaayi || 0);
            const subFull = getSubjectFullMarks(sub);
            const subPass = getSubjectPassMarks(sub);

            let obtained = 0;
            if (!isAbsent) {
                if (isMidTerm) {
                    obtained = (m?.nisfi !== undefined && m?.nisfi !== null) ? nisfi : Number(m?.marksObtained || 0);
                } else if (isFinal) {
                    obtained = (m?.nihaayi !== undefined && m?.nihaayi !== null) ? nihaayi : Number(m?.marksObtained || 0);
                } else {
                    obtained = (m?.nisfi !== undefined || m?.nihaayi !== undefined)
                        ? (nisfi + nihaayi)
                        : Number(m?.marksObtained || 0);
                }
            }

            const passed = !isAbsent && obtained >= subPass;
            if (entered && !passed) failedSubjects += 1;
            totalObtained += obtained;

            return {
                subject: sub.name,
                nisfiFullMarks: Number(sub.nisfiFullMarks || 40),
                nihaayiFullMarks: Number(sub.nihaayiFullMarks || 60),
                fullMarks: subFull,
                passMarks: subPass,
                nisfi,
                nihaayi,
                marksObtained: obtained,
                isAbsent,
                passed
            };
        });

        const percentage = totalFull > 0 ? round1((totalObtained / totalFull) * 100) : 0;
        const average = subjects.length > 0 ? round1(totalObtained / subjects.length) : 0;
        const { grade, point } = gradeFor(percentage);

        return {
            studentId: s._id,
            studentName: s.fullName,
            rollNumber: s.rollNumber || s.studentCode || '',
            entered,
            subjects: subjectResults,
            totalObtained,
            totalFull,
            percentage,
            average,
            grade: entered ? grade : '-',
            point: entered ? point : 0,
            status: entered ? (failedSubjects > 0 ? 'Fail' : 'Pass') : 'Pending',
            failedSubjects,
            remarks: doc?.remarks || ''
        };
    });

    // Rank only students whose marks were entered, by total obtained (desc).
    const ranked = rows
        .filter((r) => r.entered)
        .sort((a, b) => b.totalObtained - a.totalObtained);
    let lastScore = null;
    let lastRank = 0;
    ranked.forEach((r, i) => {
        if (r.totalObtained === lastScore) {
            r.position = lastRank; // tie → same rank
        } else {
            r.position = i + 1;
            lastRank = i + 1;
            lastScore = r.totalObtained;
        }
    });
    rows.forEach((r) => { if (r.position === undefined) r.position = null; });

    // Class summary.
    const gradedRows = rows.filter((r) => r.entered);
    const passed = gradedRows.filter((r) => r.status === 'Pass').length;
    const failed = gradedRows.filter((r) => r.status === 'Fail').length;
    const avgPercentage = gradedRows.length
        ? round1(gradedRows.reduce((sum, r) => sum + r.percentage, 0) / gradedRows.length)
        : 0;
    const topper = ranked[0] || null;

    const summary = {
        totalStudents: rows.length,
        graded: gradedRows.length,
        pending: rows.length - gradedRows.length,
        passed,
        failed,
        passRate: gradedRows.length ? round1((passed / gradedRows.length) * 100) : 0,
        avgPercentage,
        topper: topper ? { studentName: topper.studentName, percentage: topper.percentage } : null,
        totalFull
    };

    return { rows, summary };
};

const classStudents = (classId) =>
    Student.find({ classId, status: { $nin: ['Graduated', 'Exited'] } })
        .select('fullName rollNumber studentCode classId')
        .sort({ fullName: 1 })
        .lean();

// ---- Exam CRUD -------------------------------------------------------------

const getExams = asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.classId) filter.classId = req.query.classId;
    if (req.query.status) filter.status = req.query.status;

    const exams = await Exam.find(filter)
        .populate({ path: 'classId', select: 'name className branchId', populate: { path: 'branchId', select: 'name' } })
        .sort({ examDate: -1, createdAt: -1 })
        .lean();

    // Attach a quick "results entered" count per exam.
    const counts = await ExamResult.aggregate([
        { $group: { _id: '$examId', n: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
    exams.forEach((e) => { e.resultsCount = countMap.get(String(e._id)) || 0; });

    res.json(exams);
});

const getExamById = asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id).populate({ path: 'classId', select: 'name className branchId', populate: { path: 'branchId', select: 'name' } });
    if (!exam) {
        res.status(404);
        throw new Error('Exam not found');
    }
    res.json(exam);
});

const normalizeSubjects = (subjects, examType = 'Mid-Term') => {
    if (!Array.isArray(subjects)) return [];
    return subjects.map((s) => {
        const nisfiFullMarks = Math.max(0, Number(s.nisfiFullMarks) || 40);
        const nihaayiFullMarks = Math.max(0, Number(s.nihaayiFullMarks) || 60);
        let fullMarks = Number(s.fullMarks) || (nisfiFullMarks + nihaayiFullMarks);

        if (examType === 'Mid-Term') {
            fullMarks = nisfiFullMarks;
        } else if (examType === 'Final') {
            fullMarks = nihaayiFullMarks;
        }

        let passMarks = (s.passMarks !== undefined && s.passMarks !== null && s.passMarks !== '')
            ? Number(s.passMarks)
            : Math.round(fullMarks * 0.4);

        if (isNaN(passMarks) || passMarks <= 0 || passMarks >= fullMarks) {
            passMarks = Math.round(fullMarks * 0.4);
        }

        return {
            name: String(s.name || '').trim(),
            nisfiFullMarks,
            nihaayiFullMarks,
            fullMarks,
            passMarks
        };
    }).filter((s) => s.name);
};

const createExam = asyncHandler(async (req, res) => {
    const payload = { ...req.body, createdBy: req.user?._id };
    if (!payload.branchId && req.user?.branchId) payload.branchId = req.user.branchId;
    if (!payload.title || !payload.classId) {
        res.status(400);
        throw new Error('Exam title and class are required');
    }
    payload.subjects = normalizeSubjects(payload.subjects, payload.examType);
    if (payload.subjects.length === 0) {
        res.status(400);
        throw new Error('Add at least one subject to the exam');
    }
    const exam = await Exam.create(payload);
    const populated = await Exam.findById(exam._id).populate({ path: 'classId', select: 'name className branchId', populate: { path: 'branchId', select: 'name' } });
    res.status(201).json(populated);
});

const updateExam = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (payload.subjects) {
        payload.subjects = normalizeSubjects(payload.subjects);
    }
    const exam = await Exam.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true })
        .populate({ path: 'classId', select: 'name className branchId', populate: { path: 'branchId', select: 'name' } });
    if (!exam) {
        res.status(404);
        throw new Error('Exam not found');
    }
    res.json(exam);
});

const deleteExam = asyncHandler(async (req, res) => {
    const exam = await Exam.findByIdAndDelete(req.params.id);
    if (!exam) {
        res.status(404);
        throw new Error('Exam not found');
    }
    // Clean up all results tied to this exam.
    await ExamResult.deleteMany({ examId: exam._id });
    res.json({ message: 'Exam and its results removed' });
});

// ---- Results ---------------------------------------------------------------

// Full ranked result sheet for an exam (all class students + their marks).
const getExamResults = asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id).populate({ path: 'classId', select: 'name className branchId', populate: { path: 'branchId', select: 'name' } });
    if (!exam) {
        res.status(404);
        throw new Error('Exam not found');
    }
    const [students, resultDocs] = await Promise.all([
        classStudents(exam.classId._id || exam.classId),
        ExamResult.find({ examId: exam._id }).lean()
    ]);
    const { rows, summary } = buildResultSheet(exam, students, resultDocs);
    res.json({ exam, results: rows, summary });
});

// Save / update marks for many students at once (mark entry grid).
const saveExamResults = asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
        res.status(404);
        throw new Error('Exam not found');
    }
    const results = Array.isArray(req.body?.results) ? req.body.results : [];
    if (!results.length) {
        res.status(400);
        throw new Error('No marks provided');
    }

    const isMidTerm = exam.examType === 'Mid-Term';
    const isFinal = exam.examType === 'Final';

    const validSubjects = new Set((exam.subjects || []).map((s) => s.name));
    let saved = 0;
    for (const r of results) {
        if (!r.studentId) continue;
        const marks = (Array.isArray(r.marks) ? r.marks : [])
            .filter((m) => validSubjects.has(m.subject))
            .map((m) => {
                const isAbsent = !!m.isAbsent;
                const nisfi = isAbsent ? 0 : Math.max(0, Number(m.nisfi) || 0);
                const nihaayi = isAbsent ? 0 : Math.max(0, Number(m.nihaayi) || 0);

                let marksObtained = 0;
                if (!isAbsent) {
                    if (isMidTerm) {
                        marksObtained = (m.nisfi !== undefined && m.nisfi !== null) ? nisfi : Math.max(0, Number(m.marksObtained) || 0);
                    } else if (isFinal) {
                        marksObtained = (m.nihaayi !== undefined && m.nihaayi !== null) ? nihaayi : Math.max(0, Number(m.marksObtained) || 0);
                    } else {
                        marksObtained = (m.nisfi !== undefined || m.nihaayi !== undefined)
                            ? (nisfi + nihaayi)
                            : Math.max(0, Number(m.marksObtained) || 0);
                    }
                }

                return {
                    subject: m.subject,
                    nisfi,
                    nihaayi,
                    marksObtained,
                    isAbsent
                };
            });
        await ExamResult.findOneAndUpdate(
            { examId: exam._id, studentId: r.studentId },
            {
                examId: exam._id,
                studentId: r.studentId,
                classId: exam.classId,
                marks,
                remarks: r.remarks || '',
                createdBy: req.user?._id
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        saved += 1;
    }

    // Once marks exist the exam is at least "Completed" (unless already published).
    if (exam.status === 'Scheduled' || exam.status === 'Ongoing') {
        exam.status = 'Completed';
        await exam.save();
    }

    res.json({ message: `Saved marks for ${saved} student(s)`, saved, status: exam.status });
});

// One student's report card, including their rank in the class.
const getStudentResult = asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id).populate({ path: 'classId', select: 'name className branchId', populate: { path: 'branchId', select: 'name' } });
    if (!exam) {
        res.status(404);
        throw new Error('Exam not found');
    }
    const [students, resultDocs] = await Promise.all([
        classStudents(exam.classId._id || exam.classId),
        ExamResult.find({ examId: exam._id }).lean()
    ]);
    const { rows, summary } = buildResultSheet(exam, students, resultDocs);
    const row = rows.find((r) => String(r.studentId) === String(req.params.studentId));
    if (!row) {
        res.status(404);
        throw new Error('Student is not part of this exam class');
    }
    res.json({ exam, result: row, classSize: summary.graded, summary });
});

const publishExam = asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
        res.status(404);
        throw new Error('Exam not found');
    }
    exam.status = req.body?.status === 'Completed' ? 'Completed' : 'Published';
    await exam.save();
    const populated = await Exam.findById(exam._id).populate({ path: 'classId', select: 'name className branchId', populate: { path: 'branchId', select: 'name' } });
    res.json(populated);
});

// Class Cumulative Broadsheet (Merges Mid-Term + Final into 100 for all subjects)
const getClassBroadsheet = asyncHandler(async (req, res) => {
    const { classId } = req.params;
    const { term, academicYear } = req.query;

    const classDoc = await Class.findById(classId).populate('branchId', 'name').lean();
    if (!classDoc) {
        res.status(404);
        throw new Error('Class not found');
    }

    const examQuery = { classId };
    if (term) examQuery.term = term;
    if (academicYear) examQuery.academicYear = academicYear;

    const exams = await Exam.find(examQuery).lean();
    const midTermExam = exams.find((e) => e.examType === 'Mid-Term');
    const finalExam = exams.find((e) => e.examType === 'Final');
    const combinedExam = exams.find((e) => e.examType === 'Combined');

    let subjects = [];
    if (midTermExam?.subjects?.length) {
        subjects = midTermExam.subjects;
    } else if (finalExam?.subjects?.length) {
        subjects = finalExam.subjects;
    } else if (combinedExam?.subjects?.length) {
        subjects = combinedExam.subjects;
    } else {
        const subDocs = await Subject.find({ classIds: classId, status: 'Active' }).lean();
        subjects = subDocs.map((s) => ({
            name: s.name,
            nisfiFullMarks: s.nisfiFullMarks || 40,
            nihaayiFullMarks: s.nihaayiFullMarks || 60,
            fullMarks: s.fullMarks || 100,
            passMarks: s.passMarks || 40
        }));
    }

    const students = await classStudents(classId);
    const examIds = exams.map((e) => e._id);
    const allResults = await ExamResult.find({ examId: { $in: examIds } }).lean();

    const resultsByStudentExam = new Map();
    allResults.forEach((r) => {
        resultsByStudentExam.set(`${r.studentId}_${r.examId}`, r);
    });

    const totalFull = subjects.reduce((sum, s) => sum + Number(s.fullMarks || 100), 0);

    const rows = students.map((s) => {
        let totalObtained = 0;
        let failedSubjects = 0;
        let entered = false;

        const midResult = midTermExam ? resultsByStudentExam.get(`${s._id}_${midTermExam._id}`) : null;
        const finalResult = finalExam ? resultsByStudentExam.get(`${s._id}_${finalExam._id}`) : null;
        const combResult = combinedExam ? resultsByStudentExam.get(`${s._id}_${combinedExam._id}`) : null;

        if (midResult || finalResult || combResult) entered = true;

        const midMap = new Map((midResult?.marks || []).map((m) => [m.subject, m]));
        const finalMap = new Map((finalResult?.marks || []).map((m) => [m.subject, m]));
        const combMap = new Map((combResult?.marks || []).map((m) => [m.subject, m]));

        const subjectResults = subjects.map((sub) => {
            const mM = midMap.get(sub.name);
            const fM = finalMap.get(sub.name);
            const cM = combMap.get(sub.name);

            let nisfi = 0;
            let nihaayi = 0;

            if (mM) nisfi = Number(mM.nisfi ?? mM.marksObtained ?? 0);
            if (fM) nihaayi = Number(fM.nihaayi ?? fM.marksObtained ?? 0);
            if (cM) {
                if (!mM) nisfi = Number(cM.nisfi ?? 0);
                if (!fM) nihaayi = Number(cM.nihaayi ?? 0);
            }

            const obtained = nisfi + nihaayi;
            const full = Number(sub.fullMarks || 100);
            const pass = Number(sub.passMarks || 40);
            const passed = obtained >= pass;
            if (entered && !passed) failedSubjects += 1;
            totalObtained += obtained;

            return {
                subject: sub.name,
                nisfi,
                nihaayi,
                nisfiFullMarks: Number(sub.nisfiFullMarks || 40),
                nihaayiFullMarks: Number(sub.nihaayiFullMarks || 60),
                fullMarks: full,
                passMarks: pass,
                marksObtained: obtained,
                passed
            };
        });

        const percentage = totalFull > 0 ? round1((totalObtained / totalFull) * 100) : 0;
        const average = subjects.length > 0 ? round1(totalObtained / subjects.length) : 0;
        const { grade, point } = gradeFor(percentage);

        return {
            studentId: s._id,
            studentName: s.fullName,
            rollNumber: s.rollNumber || s.studentCode || '',
            entered,
            subjects: subjectResults,
            totalObtained,
            totalFull,
            percentage,
            average,
            grade: entered ? grade : '-',
            point: entered ? point : 0,
            status: entered ? (failedSubjects > 0 ? 'Fail' : 'Pass') : 'Pending'
        };
    });

    const ranked = rows.filter((r) => r.entered).sort((a, b) => b.totalObtained - a.totalObtained);
    let lastScore = null;
    let lastRank = 0;
    ranked.forEach((r, i) => {
        if (r.totalObtained === lastScore) {
            r.position = lastRank;
        } else {
            r.position = i + 1;
            lastRank = i + 1;
            lastScore = r.totalObtained;
        }
    });

    const gradedRows = rows.filter((r) => r.entered);
    const summary = {
        totalStudents: students.length,
        graded: gradedRows.length,
        passed: gradedRows.filter((r) => r.status === 'Pass').length,
        failed: gradedRows.filter((r) => r.status === 'Fail').length,
        avgPercentage: gradedRows.length ? round1(gradedRows.reduce((sum, r) => sum + r.percentage, 0) / gradedRows.length) : 0,
        topper: ranked[0] ? { studentName: ranked[0].studentName, percentage: ranked[0].percentage } : null,
        totalFull
    };

    res.json({
        class: classDoc,
        subjects,
        exams: { midTerm: midTermExam, final: finalExam, combined: combinedExam },
        results: rows,
        summary
    });
});

module.exports = {
    getExams,
    getExamById,
    createExam,
    updateExam,
    deleteExam,
    getExamResults,
    saveExamResults,
    getStudentResult,
    publishExam,
    getClassBroadsheet
};

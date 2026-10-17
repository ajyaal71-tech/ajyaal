import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import {
  PenSquare, Save, Loader2, ClipboardList, Users, Printer,
  FileDown, BookOpen, Layers, CheckCircle2, AlertCircle, Sparkles, X, Building2
} from 'lucide-react';
import api from '../services/api';
import { useAlert } from '../components/common/alerts/useAlert';
import { classLabel } from '../utils/classLabel';
import { useLanguage } from '../i18n/LanguageContext.jsx';

const ExamMarks = () => {
  const { showAlert } = useAlert();
  const { t, tv, locale } = useLanguage();
  const location = useLocation();

  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [exam, setExam] = useState(null);
  const [settings, setSettings] = useState(null);

  const [rows, setRows] = useState([]); // editable grid state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Subject view filter: null means All Subjects, or subject name string
  const [activeSubject, setActiveSubject] = useState(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printBlank, setPrintBlank] = useState(false);
  const [showAllParts, setShowAllParts] = useState(false);

  // Load initial settings, classes, exams, and branches
  useEffect(() => {
    (async () => {
      try {
        const [resExams, resClasses, resSettings, resBranches] = await Promise.all([
          api.get('/exams'),
          api.get('/classes'),
          api.get('/settings').catch(() => ({ data: null })),
          api.get('/branches').catch(() => ({ data: [] }))
        ]);
        const examsData = resExams.data || [];
        const classesData = resClasses.data || [];
        let branchesData = resBranches?.data || [];

        // Fallback: derive unique branches from classes if branches endpoint was empty
        if (!branchesData.length) {
          const branchMap = new Map();
          classesData.forEach(c => {
            if (c.branchId && typeof c.branchId === 'object' && c.branchId._id) {
              branchMap.set(String(c.branchId._id), c.branchId);
            }
          });
          branchesData = Array.from(branchMap.values());
        }

        setExams(examsData);
        setClasses(classesData);
        setBranches(branchesData);
        if (resSettings?.data) setSettings(resSettings.data);

        // Check URL params
        const paramExam = new URLSearchParams(location.search).get('exam');
        if (paramExam) {
          const match = examsData.find(e => e._id === paramExam);
          if (match) {
            const cId = match.classId?._id || match.classId;
            const classObj = classesData.find(c => c._id === cId);
            const bId = classObj?.branchId?._id || classObj?.branchId;
            if (bId) setSelectedBranchId(String(bId));
            setSelectedClassId(cId || '');
            setSelectedExamId(paramExam);
            return;
          }
        }

        // Default selection
        if (classesData.length) {
          const firstClass = classesData[0];
          const firstClassId = firstClass._id;
          const bId = firstClass.branchId?._id || firstClass.branchId;
          if (bId) setSelectedBranchId(String(bId));
          setSelectedClassId(firstClassId);
          const firstClassExams = examsData.filter(e => (e.classId?._id || e.classId) === firstClassId);
          if (firstClassExams.length) {
            setSelectedExamId(firstClassExams[0]._id);
          }
        } else if (examsData.length) {
          setSelectedExamId(examsData[0]._id);
        }
      } catch (error) {
        console.error(error);
        showAlert({ type: 'danger', title: t('common.error'), message: t('exams.loadFailed') });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter classes by selected branch
  const filteredClasses = useMemo(() => {
    if (!selectedBranchId) return classes;
    return classes.filter(c => {
      const bId = c.branchId?._id || c.branchId;
      return String(bId) === selectedBranchId;
    });
  }, [classes, selectedBranchId]);

  // Handle branch change -> only that branch's classes remain
  const handleBranchChange = (newBranchId) => {
    setSelectedBranchId(newBranchId);
    const matchingClasses = !newBranchId
      ? classes
      : classes.filter(c => String(c.branchId?._id || c.branchId) === newBranchId);

    if (matchingClasses.length) {
      const stillValid = matchingClasses.some(c => c._id === selectedClassId);
      if (!stillValid) {
        handleClassChange(matchingClasses[0]._id);
      }
    } else {
      handleClassChange('');
    }
  };

  // Filter exams by selected class
  const filteredExams = useMemo(() => {
    if (!selectedClassId) return exams;
    return exams.filter(e => (e.classId?._id || e.classId) === selectedClassId);
  }, [exams, selectedClassId]);

  // When class changes, adjust selectedExamId
  const handleClassChange = (newClassId) => {
    setSelectedClassId(newClassId);
    if (!newClassId) {
      if (exams.length) setSelectedExamId(exams[0]._id);
      return;
    }
    const matching = exams.filter(e => (e.classId?._id || e.classId) === newClassId);
    if (matching.length) {
      setSelectedExamId(matching[0]._id);
    } else {
      setSelectedExamId('');
      setExam(null);
      setRows([]);
    }
  };

  // Load selected exam's students and marks
  useEffect(() => {
    if (!selectedExamId) {
      setExam(null);
      setRows([]);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get(`/exams/${selectedExamId}/results`);
        setExam(data.exam);

        const currentSubjects = data.exam?.subjects || [];
        if (currentSubjects.length && (!activeSubject || !currentSubjects.some(s => s.name === activeSubject))) {
          setActiveSubject(currentSubjects[0].name);
        }

        setRows((data.results || []).map(r => {
          const marksObj = {};
          (r.subjects || []).forEach(s => {
            marksObj[s.subject] = {
              nisfi: r.entered ? (s.nisfi !== undefined && s.nisfi !== null ? String(s.nisfi) : '') : '',
              nihaayi: r.entered ? (s.nihaayi !== undefined && s.nihaayi !== null ? String(s.nihaayi) : '') : '',
              marksObtained: r.entered ? Number(s.marksObtained || 0) : 0
            };
          });

          return {
            studentId: r.studentId,
            studentName: r.studentName,
            rollNumber: r.rollNumber,
            remarks: r.remarks || '',
            entered: r.entered,
            absent: r.subjects.length > 0 && r.subjects.every(s => s.isAbsent) && r.entered,
            marks: marksObj
          };
        }));
      } catch (error) {
        console.error(error);
        showAlert({ type: 'danger', title: t('common.error'), message: t('exams.marks.loadFailed') });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExamId]);

  const subjects = exam?.subjects || [];
  const isMidTerm = exam?.examType === 'Mid-Term';
  const isFinal = exam?.examType === 'Final';
  const isCombined = exam?.examType === 'Combined';

  const showNisfi = isMidTerm || isCombined || showAllParts || (!isMidTerm && !isFinal);
  const showNihaayi = isFinal || isCombined || showAllParts || (!isMidTerm && !isFinal);

  // Update mark for a specific student and subject (nisfi or nihaayi)
  const setScore = (studentId, subjectName, part, val) => {
    setRows(prev => prev.map(r => {
      if (r.studentId !== studentId) return r;
      const prevSub = r.marks[subjectName] || { nisfi: '', nihaayi: '', marksObtained: 0 };
      const nextSub = { ...prevSub, [part]: val };
      const n = Number(nextSub.nisfi) || 0;
      const f = Number(nextSub.nihaayi) || 0;

      if (isMidTerm && !showAllParts) {
        nextSub.marksObtained = nextSub.nisfi !== '' ? n : 0;
      } else if (isFinal && !showAllParts) {
        nextSub.marksObtained = nextSub.nihaayi !== '' ? f : 0;
      } else {
        nextSub.marksObtained = (nextSub.nisfi !== '' || nextSub.nihaayi !== '') ? (n + f) : 0;
      }

      return {
        ...r,
        marks: {
          ...r.marks,
          [subjectName]: nextSub
        }
      };
    }));
  };

  const setRemark = (studentId, value) => {
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, remarks: value } : r));
  };

  const toggleAbsent = (studentId) => {
    setRows(prev => prev.map(r => r.studentId === studentId ? { ...r, absent: !r.absent } : r));
  };

  const currentSubjectObj = useMemo(() => {
    return subjects.find(s => s.name === activeSubject) || subjects[0] || null;
  }, [subjects, activeSubject]);

  const currentSubMax = isMidTerm && !showAllParts
    ? (currentSubjectObj?.nisfiFullMarks || 40)
    : isFinal && !showAllParts
      ? (currentSubjectObj?.nihaayiFullMarks || 60)
      : (currentSubjectObj?.fullMarks || 100);

  const currentSubPass = isMidTerm && !showAllParts
    ? Math.min(Number(currentSubjectObj?.passMarks || 16), Number(currentSubjectObj?.nisfiFullMarks || 40))
    : isFinal && !showAllParts
      ? Math.min(Number(currentSubjectObj?.passMarks || 24), Number(currentSubjectObj?.nihaayiFullMarks || 60))
      : Number(currentSubjectObj?.passMarks || 40);

  const studentTotalScore = (r) => {
    if (r.absent) return 0;
    return subjects.reduce((sum, s) => {
      const sm = r.marks[s.name];
      return sum + (Number(sm?.marksObtained) || 0);
    }, 0);
  };

  const totalFullMarks = useMemo(() => {
    return subjects.reduce((sum, s) => {
      const full = isMidTerm && !showAllParts
        ? Number(s.nisfiFullMarks || 40)
        : isFinal && !showAllParts
          ? Number(s.nihaayiFullMarks || 60)
          : Number(s.fullMarks || 100);
      return sum + full;
    }, 0);
  }, [subjects, isMidTerm, isFinal, showAllParts]);

  const hasInput = (r) => {
    if (r.entered || r.absent || r.remarks.trim()) return true;
    return subjects.some(s => {
      const sm = r.marks[s.name];
      return (sm?.nisfi !== '' && sm?.nisfi !== undefined) ||
             (sm?.nihaayi !== '' && sm?.nihaayi !== undefined);
    });
  };

  // Save handler
  const handleSave = async () => {
    if (!exam || !rows.length) return;

    // Validate marks against upper limits
    for (const r of rows) {
      if (r.absent) continue;
      for (const s of subjects) {
        const sm = r.marks[s.name] || {};
        const nVal = Number(sm.nisfi);
        const fVal = Number(sm.nihaayi);
        const maxNisfi = Number(s.nisfiFullMarks || 40);
        const maxNihaayi = Number(s.nihaayiFullMarks || 60);

        if (sm.nisfi !== '' && sm.nisfi !== undefined) {
          if (nVal < 0 || nVal > maxNisfi) {
            return showAlert({
              type: 'warning',
              title: t('exams.marks.invalidTitle'),
              message: `${r.studentName} (${s.name}): Nisfi waa inuu u dhexeeyo 0 iyo ${maxNisfi}.`
            });
          }
        }
        if (sm.nihaayi !== '' && sm.nihaayi !== undefined) {
          if (fVal < 0 || fVal > maxNihaayi) {
            return showAlert({
              type: 'warning',
              title: t('exams.marks.invalidTitle'),
              message: `${r.studentName} (${s.name}): Nihaayi waa inuu u dhexeeyo 0 iyo ${maxNihaayi}.`
            });
          }
        }
      }
    }

    const payloadRows = rows.filter(hasInput).map(r => ({
      studentId: r.studentId,
      remarks: r.remarks,
      marks: subjects.map(s => {
        const sm = r.marks[s.name] || {};
        const nisfi = r.absent ? 0 : (Number(sm.nisfi) || 0);
        const nihaayi = r.absent ? 0 : (Number(sm.nihaayi) || 0);
        let marksObtained = 0;
        if (!r.absent) {
          if (isMidTerm && !showAllParts) {
            marksObtained = sm.nisfi !== '' ? nisfi : 0;
          } else if (isFinal && !showAllParts) {
            marksObtained = sm.nihaayi !== '' ? nihaayi : 0;
          } else {
            marksObtained = (sm.nisfi !== '' || sm.nihaayi !== '')
              ? (nisfi + nihaayi)
              : (Number(sm.marksObtained) || 0);
          }
        }
        return {
          subject: s.name,
          nisfi: r.absent ? 0 : nisfi,
          nihaayi: r.absent ? 0 : nihaayi,
          marksObtained,
          isAbsent: r.absent
        };
      })
    }));

    if (!payloadRows.length) {
      return showAlert({
        type: 'warning',
        title: t('exams.marks.nothingTitle'),
        message: t('exams.marks.nothing')
      });
    }

    try {
      setSaving(true);
      const { data } = await api.post(`/exams/${selectedExamId}/results`, { results: payloadRows });
      showAlert({
        type: 'success',
        title: t('exams.marks.savedTitle'),
        message: data.message || t('exams.marks.saved')
      });

      // Refresh
      const { data: fresh } = await api.get(`/exams/${selectedExamId}/results`);
      setRows((fresh.results || []).map(r => {
        const marksObj = {};
        (r.subjects || []).forEach(s => {
          marksObj[s.subject] = {
            nisfi: r.entered ? (s.nisfi !== undefined && s.nisfi !== null ? String(s.nisfi) : '') : '',
            nihaayi: r.entered ? (s.nihaayi !== undefined && s.nihaayi !== null ? String(s.nihaayi) : '') : '',
            marksObtained: r.entered ? Number(s.marksObtained || 0) : 0
          };
        });
        return {
          studentId: r.studentId,
          studentName: r.studentName,
          rollNumber: r.rollNumber,
          remarks: r.remarks || '',
          entered: r.entered,
          absent: r.subjects.length > 0 && r.subjects.every(s => s.isAbsent) && r.entered,
          marks: marksObj
        };
      }));
    } catch (error) {
      console.error(error);
      showAlert({
        type: 'danger',
        title: t('common.error'),
        message: error.response?.data?.message || t('exams.marks.saveFailed')
      });
    } finally {
      setSaving(false);
    }
  };

  // Export Teacher's Subject Score Sheet PDF (Matching Image 1)
  const handleExportTeacherPDF = () => {
    if (!exam || !currentSubjectObj) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    const instituteName = settings?.businessInfo?.name || 'MACHADKA AJYAAL';
    const subName = currentSubjectObj.name;
    const nisfiMax = currentSubjectObj.nisfiFullMarks || 40;
    const nihaayiMax = currentSubjectObj.nihaayiFullMarks || 60;
    const totalMax = currentSubjectObj.fullMarks || 100;

    // Header Box
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(instituteName.toUpperCase(), pageW / 2, 10, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `FASALKA: ${classLabel(exam.classId, '')}   |   NUUCA IMTIXAANKA: ${exam.title.toUpperCase()} (${tv(exam.examType)})   |   MAADDADA: ${subName.toUpperCase()}`,
      pageW / 2,
      18,
      { align: 'center' }
    );

    // Table Header
    let y = 35;
    const x0 = 14;
    const tableW = pageW - 28;
    const idW = 22;
    const nameW = (showNisfi && showNihaayi) ? 75 : 100;
    const nisfiW = 30;
    const nihaayiW = 30;
    const totW = (showNisfi && showNihaayi) ? tableW - (idW + nameW + nisfiW + nihaayiW) : tableW - (idW + nameW + 35);

    doc.setFillColor(30, 41, 59);
    doc.rect(x0, y - 5, tableW, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);

    doc.text('ID', x0 + 4, y);
    doc.text('NAME', x0 + idW + 4, y);

    if (showNisfi && showNihaayi) {
      doc.text(`NISFI (${nisfiMax})`, x0 + idW + nameW + nisfiW / 2, y, { align: 'center' });
      doc.text(`NIHAAYI (${nihaayiMax})`, x0 + idW + nameW + nisfiW + nihaayiW / 2, y, { align: 'center' });
      doc.text(`TOTAL (${totalMax})`, x0 + idW + nameW + nisfiW + nihaayiW + totW / 2, y, { align: 'center' });
    } else if (showNisfi) {
      doc.text(`NISFI (${nisfiMax})`, x0 + idW + nameW + 35 / 2, y, { align: 'center' });
      doc.text('REMARKS', x0 + idW + nameW + 35 + totW / 2, y, { align: 'center' });
    } else {
      doc.text(`NIHAAYI (${nihaayiMax})`, x0 + idW + nameW + 35 / 2, y, { align: 'center' });
      doc.text('REMARKS', x0 + idW + nameW + 35 + totW / 2, y, { align: 'center' });
    }

    y += 7;

    // Table Rows
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);

    rows.forEach((r, idx) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(x0, y - 4, tableW, 7, 'F');
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(x0, y + 3, x0 + tableW, y + 3);

      const sm = r.marks[subName] || {};
      const idVal = r.rollNumber || String(idx + 1);
      const nameVal = r.studentName;
      const nisfiVal = printBlank ? '' : (r.absent ? 'MQ' : sm.nisfi ?? '');
      const nihaayiVal = printBlank ? '' : (r.absent ? 'MQ' : sm.nihaayi ?? '');
      const totalVal = printBlank ? '' : (r.absent ? '0' : (sm.marksObtained ?? ''));

      doc.setFont('helvetica', 'bold');
      doc.text(String(idVal), x0 + 4, y);
      doc.setFont('helvetica', 'normal');
      doc.text(nameVal.slice(0, 35), x0 + idW + 4, y);

      if (showNisfi && showNihaayi) {
        doc.text(String(nisfiVal), x0 + idW + nameW + nisfiW / 2, y, { align: 'center' });
        doc.text(String(nihaayiVal), x0 + idW + nameW + nisfiW + nihaayiW / 2, y, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        doc.text(String(totalVal), x0 + idW + nameW + nisfiW + nihaayiW + totW / 2, y, { align: 'center' });
        doc.setFont('helvetica', 'normal');
      } else if (showNisfi) {
        doc.setFont('helvetica', 'bold');
        doc.text(String(nisfiVal), x0 + idW + nameW + 35 / 2, y, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text(r.remarks || '', x0 + idW + nameW + 40, y);
      } else {
        doc.setFont('helvetica', 'bold');
        doc.text(String(nihaayiVal), x0 + idW + nameW + 35 / 2, y, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.text(r.remarks || '', x0 + idW + nameW + 40, y);
      }

      y += 7;
    });

    // Signature Block at Bottom
    y += 15;
    if (y > 265) {
      doc.addPage();
      y = 30;
    }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);

    doc.line(x0 + 10, y + 8, x0 + 60, y + 8);
    doc.text('SAXIIXA MACALLINKA MAADDADA', x0 + 12, y + 13);

    doc.line(x0 + tableW - 60, y + 8, x0 + tableW - 10, y + 8);
    doc.text('SAXIIXA MAAMULAHA / TAARIIXDA', x0 + tableW - 58, y + 13);

    doc.save(`Waraaqda_${subName}_${exam.title.replace(/\s+/g, '_')}.pdf`);
  };

  const instituteName = settings?.businessInfo?.name || 'MACHADKA AJYAAL';

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1800px] mx-auto animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-600/20">
            <PenSquare size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {t('exams.marks.title')}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mt-0.5">
              {t('exams.marks.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          {exam && (
            <>
              <button
                type="button"
                onClick={() => { setPrintBlank(false); setPrintModalOpen(true); }}
                className="flex items-center gap-2 px-5 py-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm"
              >
                <Printer size={16} /> {t('printTeacherSheet')}
              </button>
              <button
                type="button"
                onClick={handleExportTeacherPDF}
                className="flex items-center gap-2 px-5 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 shadow-sm"
              >
                <FileDown size={16} /> PDF
              </button>
            </>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !exam || !rows.length}
            className="flex items-center gap-2 px-6 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-brand-600/30 active:scale-95 disabled:opacity-60"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} {t('exams.marks.save')}
          </button>
        </div>
      </div>

      {/* Selectors Bar: Branch + Class + Exam */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
        {/* Branch Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
            <Building2 size={16} className="text-brand-600" /> {t('common.branch') || 'Laanta'}:
          </span>
          <select
            value={selectedBranchId}
            onChange={e => handleBranchChange(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t('common.allBranches') || 'Dhammaan Laamaha'}</option>
            {branches.map(b => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Class Selector (Filtered by selected branch) */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
            <BookOpen size={16} className="text-brand-600" /> {t('selectClass') || 'Dooro Fasalka'}:
          </span>
          <select
            value={selectedClassId}
            onChange={e => handleClassChange(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t('allClasses') || 'Dhammaan Fasallada'}</option>
            {filteredClasses.map(c => (
              <option key={c._id} value={c._id}>
                {classLabel(c, '')}
              </option>
            ))}
          </select>
        </div>

        {/* Exam Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
            <ClipboardList size={16} className="text-amber-500" /> {t('exams.selectExam') || 'Dooro Imtixaanka'}:
          </span>
          <select
            value={selectedExamId}
            onChange={e => setSelectedExamId(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t('exams.selectExamOption') || '-- Dooro Imtixaan --'}</option>
            {filteredExams.map(e => (
              <option key={e._id} value={e._id}>
                {e.title} · {classLabel(e.classId, '')} · {tv(e.examType)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-16 text-center text-slate-500 font-bold flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="animate-spin text-brand-600" />
          <span>{t('attendance.student.loadingStudents')}</span>
        </div>
      ) : !exam ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
          {t('exams.marks.selectHint')}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-400 font-semibold">
          {t('exams.marks.noStudents')}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Subject Switcher Tabs (Matching Image 1: Teacher focuses on one subject's Nisfi + Nihaayi) */}
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1">
                <BookOpen size={14} /> {t('marks.subjectFilter')}:
              </span>
              {subjects.map(s => {
                const isActive = activeSubject === s.name;
                return (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setActiveSubject(s.name)}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30 scale-105'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {s.name}
                    <span className="ml-1.5 opacity-70 text-[10px]">
                      ({s.nisfiFullMarks || 40}+{s.nihaayiFullMarks || 60}={s.fullMarks || 100})
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setActiveSubject(null)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                  activeSubject === null
                    ? 'bg-slate-900 text-white shadow-md scale-105'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                <Layers size={13} /> {t('allSubjectsView')}
              </button>
            </div>

            <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
              <Users size={15} /> {t('exams.marks.summary', { count: rows.length, total: totalFullMarks })}
            </div>
          </div>

          {/* VIEW 1: SINGLE SUBJECT SCORE-SHEET (Exact match to Image 1: Id | Name | Nisfi | Nihaayi | Total) */}
          {activeSubject !== null && currentSubjectObj && (
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
              {/* Card Header showing Institute, Class, and Subject */}
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 text-xs font-black uppercase tracking-wider mb-2">
                    <Sparkles size={13} /> {instituteName}
                  </div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>{classLabel(exam.classId, '')}</span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-brand-600">{currentSubjectObj.name}</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-bold mt-0.5">
                    {exam.title} ({tv(exam.examType)}) · Nisfi: {currentSubjectObj.nisfiFullMarks || 40} dhibcood · Nihaayi: {currentSubjectObj.nihaayiFullMarks || 60} dhibcood · Wadarta: {currentSubjectObj.fullMarks || 100}
                  </p>
                </div>

                  <div className="flex items-center gap-2">
                    {(isMidTerm || isFinal) && (
                      <button
                        type="button"
                        onClick={() => setShowAllParts(prev => !prev)}
                        className="px-3.5 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 transition shadow-sm"
                      >
                        {showAllParts ? 'Kaliya Dhibcaha Imtixaankan' : 'Muuji Labadaba (Nisfi + Nihaayi)'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setPrintBlank(true); setPrintModalOpen(true); }}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
                    >
                      {t('printBlankSheet')}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPrintBlank(false); setPrintModalOpen(true); }}
                      className="px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-600/20"
                    >
                      {t('printTeacherSheet')}
                    </button>
                  </div>
              </div>

              {/* Table exact match to Image 1: Id | Name | Nisfi | Nihaayi | Total */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest border-b border-slate-800">
                      <th className="px-5 py-4 w-12 text-center">#</th>
                      <th className="px-5 py-4 w-28">Id</th>
                      <th className="px-6 py-4">Name</th>
                      {showNisfi && (
                        <th className="px-4 py-4 text-center w-36">
                          {t('nisfiShort')}
                          <span className="block text-[9px] text-brand-300 font-normal">
                            Max: {currentSubjectObj.nisfiFullMarks || 40}
                          </span>
                        </th>
                      )}
                      {showNihaayi && (
                        <th className="px-4 py-4 text-center w-36">
                          {t('nihaayiShort')}
                          <span className="block text-[9px] text-brand-300 font-normal">
                            Max: {currentSubjectObj.nihaayiFullMarks || 60}
                          </span>
                        </th>
                      )}
                      <th className="px-5 py-4 text-center w-32 bg-slate-800/80">
                        {showAllParts || isCombined
                          ? t('common.total')
                          : isMidTerm
                            ? 'Dhibcaha (Nisfi)'
                            : isFinal
                              ? 'Dhibcaha (Nihaayi)'
                              : t('common.total')}
                        <span className="block text-[9px] text-emerald-400 font-normal">
                          Max: {currentSubMax}
                        </span>
                      </th>
                      <th className="px-4 py-4 text-center w-24">{tv('Absent')}</th>
                      <th className="px-5 py-4 w-52">{t('academic.exit.remarks')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r, i) => {
                      const sm = r.marks[currentSubjectObj.name] || { nisfi: '', nihaayi: '', marksObtained: 0 };
                      const maxNisfi = currentSubjectObj.nisfiFullMarks || 40;
                      const maxNihaayi = currentSubjectObj.nihaayiFullMarks || 60;
                      const totalSub = r.absent ? 0 : Number(sm.marksObtained || 0);

                      return (
                        <tr
                          key={r.studentId}
                          className={`transition-colors ${
                            r.absent ? 'bg-rose-50/40 dark:bg-rose-950/20 opacity-75' : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/20'
                          }`}
                        >
                          <td className="px-5 py-3.5 text-xs font-bold text-slate-400 text-center">{i + 1}</td>
                          <td className="px-5 py-3.5 text-sm font-mono font-black text-slate-700 dark:text-slate-300">
                            {r.rollNumber || `ID-${i + 1}`}
                          </td>
                          <td className="px-6 py-3.5">
                            <p className="text-sm font-black text-slate-900 dark:text-white capitalize">
                              {r.studentName}
                            </p>
                          </td>
                          {showNisfi && (
                            <td className="px-4 py-3.5 text-center">
                              <input
                                type="number"
                                min="0"
                                max={maxNisfi}
                                disabled={r.absent}
                                value={sm.nisfi ?? ''}
                                onChange={e => setScore(r.studentId, currentSubjectObj.name, 'nisfi', e.target.value)}
                                placeholder={`0 - ${maxNisfi}`}
                                className="w-24 px-3 py-2 text-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 disabled:opacity-40"
                              />
                            </td>
                          )}
                          {showNihaayi && (
                            <td className="px-4 py-3.5 text-center">
                              <input
                                type="number"
                                min="0"
                                max={maxNihaayi}
                                disabled={r.absent}
                                value={sm.nihaayi ?? ''}
                                onChange={e => setScore(r.studentId, currentSubjectObj.name, 'nihaayi', e.target.value)}
                                placeholder={`0 - ${maxNihaayi}`}
                                className="w-24 px-3 py-2 text-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-sm font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 disabled:opacity-40"
                              />
                            </td>
                          )}
                          <td className="px-5 py-3.5 text-center bg-slate-50/60 dark:bg-slate-800/40">
                            <span
                              className={`inline-block px-3 py-1.5 rounded-xl text-sm font-black ${
                                r.absent
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  : totalSub >= currentSubPass
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              }`}
                            >
                              {r.absent ? 'MQ' : totalSub}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <input
                              type="checkbox"
                              checked={r.absent}
                              onChange={() => toggleAbsent(r.studentId)}
                              className="w-4 h-4 accent-rose-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-5 py-3.5">
                            <input
                              value={r.remarks}
                              onChange={e => setRemark(r.studentId, e.target.value)}
                              placeholder="—"
                              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-xs text-slate-700 dark:text-slate-200"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 2: ALL SUBJECTS MATRIX (When activeSubject is null) */}
          {activeSubject === null && (
            <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest border-b border-slate-800">
                      <th className="px-4 py-4 w-10 sticky left-0 bg-slate-900">#</th>
                      <th className="px-4 py-4 w-24">ID</th>
                      <th className="px-5 py-4">{t('common.student')}</th>
                      {subjects.map(s => (
                        <th key={s.name} className="px-3 py-4 text-center">
                          {s.name}
                          <span className="block text-[9px] text-slate-300 font-normal">
                            /{s.fullMarks}
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-4 text-center bg-slate-800">{t('common.total')}</th>
                      <th className="px-3 py-4 text-center">{tv('Absent')}</th>
                      <th className="px-4 py-4">{t('academic.exit.remarks')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r, i) => (
                      <tr
                        key={r.studentId}
                        className={`transition-colors ${
                          r.absent ? 'opacity-50' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/10'
                        }`}
                      >
                        <td className="px-4 py-3 text-xs font-bold text-slate-400 sticky left-0 bg-white dark:bg-slate-900">
                          {i + 1}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono font-bold text-slate-600 dark:text-slate-400">
                          {r.rollNumber || `ID-${i + 1}`}
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {r.studentName}
                          </p>
                        </td>
                        {subjects.map(s => {
                          const sm = r.marks[s.name] || {};
                          return (
                            <td key={s.name} className="px-2 py-3 text-center">
                              <span
                                onClick={() => setActiveSubject(s.name)}
                                className="cursor-pointer inline-block px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-brand-50 text-slate-900 dark:text-white font-black text-xs transition"
                                title={`Guji si aad u geliso Nisfi iyo Nihaayi: ${s.name}`}
                              >
                                {r.absent ? 'MQ' : (sm.marksObtained ?? '—')}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-center text-sm font-black text-brand-600 dark:text-brand-400 bg-slate-50 dark:bg-slate-800/40">
                          {studentTotalScore(r)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={r.absent}
                            onChange={() => toggleAbsent(r.studentId)}
                            className="w-4 h-4 accent-rose-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={r.remarks}
                            onChange={e => setRemark(r.studentId, e.target.value)}
                            placeholder="—"
                            className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-xs text-slate-700 dark:text-slate-200"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PRINTABLE PREVIEW MODAL (Matching Image 1 EXACTLY) */}
      {printModalOpen && currentSubjectObj && exam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden my-8 print:my-0 print:shadow-none print:w-full print:max-w-none">
            {/* Modal Controls Bar */}
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-3">
                <BookOpen size={18} className="text-brand-400" />
                <span className="text-xs font-black uppercase tracking-wider">
                  {printBlank ? t('printBlankSheet') : t('printTeacherSheet')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPrintBlank(!printBlank)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    printBlank ? 'bg-amber-500 text-white' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {printBlank ? 'Waa Bannaan tahay' : 'Waa Buuxdaa'}
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition"
                >
                  <Printer size={15} /> {t('common.print')}
                </button>
                <button
                  type="button"
                  onClick={handleExportTeacherPDF}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition"
                >
                  <FileDown size={15} /> PDF
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalOpen(false)}
                  className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Document Paper Body (Styling like physical A4 sheet) */}
            <div className="p-8 sm:p-12 text-slate-900 space-y-6 bg-white font-sans">
              {/* Header as requested in Image 1: Magaca Machadka, Fasalka, Nuuca Imtixaanka, Maaddada */}
              <div className="text-center border-b-2 border-slate-900 pb-4 space-y-1.5">
                <h1 className="text-2xl font-black tracking-tight uppercase text-slate-900">
                  {instituteName}
                </h1>
                <p className="text-sm font-bold tracking-wide uppercase text-slate-700">
                  FASALKA: <span className="underline">{classLabel(exam.classId, '')}</span> &nbsp;|&nbsp;
                  NUUCA IMTIXAANKA: <span className="underline">{exam.title} ({tv(exam.examType)})</span> &nbsp;|&nbsp;
                  MAADDADA: <span className="underline text-brand-700">{currentSubjectObj.name}</span>
                </p>
                <p className="text-[11px] text-slate-500 font-semibold italic">
                  Waraaqda dhibco-gelinta ardayda ee macallinka maaddada ({exam.academicYear || new Date().getFullYear()})
                </p>
              </div>

              {/* Table (Id | Name | Nisfi | Nihaayi | Total) */}
              <table className="w-full border-collapse border border-slate-900 text-left text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-900 font-black text-slate-900 text-xs uppercase">
                    <th className="border border-slate-900 px-3 py-2 w-16 text-center">Id</th>
                    <th className="border border-slate-900 px-4 py-2">Name</th>
                    <th className="border border-slate-900 px-3 py-2 w-28 text-center">
                      Nisfi ({currentSubjectObj.nisfiFullMarks || 40})
                    </th>
                    <th className="border border-slate-900 px-3 py-2 w-28 text-center">
                      Nihaayi ({currentSubjectObj.nihaayiFullMarks || 60})
                    </th>
                    <th className="border border-slate-900 px-3 py-2 w-28 text-center">
                      Total ({currentSubjectObj.fullMarks || 100})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const sm = r.marks[currentSubjectObj.name] || {};
                    return (
                      <tr key={r.studentId} className="border-b border-slate-400">
                        <td className="border border-slate-900 px-3 py-2 text-center font-bold font-mono">
                          {r.rollNumber || i + 1}
                        </td>
                        <td className="border border-slate-900 px-4 py-2 font-bold capitalize">
                          {r.studentName}
                        </td>
                        <td className="border border-slate-900 px-3 py-2 text-center font-semibold">
                          {printBlank ? '' : (r.absent ? 'MQ' : sm.nisfi ?? '')}
                        </td>
                        <td className="border border-slate-900 px-3 py-2 text-center font-semibold">
                          {printBlank ? '' : (r.absent ? 'MQ' : sm.nihaayi ?? '')}
                        </td>
                        <td className="border border-slate-900 px-3 py-2 text-center font-black">
                          {printBlank ? '' : (r.absent ? '0' : (sm.marksObtained ?? ''))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Signatures Footer */}
              <div className="pt-8 flex justify-between items-center text-xs font-bold text-slate-800">
                <div className="space-y-1">
                  <p>Macallinka Maaddada: ___________________________</p>
                  <p className="text-[10px] text-slate-500 font-normal">Magaca iyo Saxiixa</p>
                </div>
                <div className="space-y-1 text-right">
                  <p>Saxiixa Maamulaha: ___________________________</p>
                  <p className="text-[10px] text-slate-500 font-normal">Shaabadda iyo Taariikhda</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamMarks;

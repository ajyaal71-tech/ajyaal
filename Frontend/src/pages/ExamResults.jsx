import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import {
  Award, ClipboardList, Printer, FileDown, Trophy, CheckCircle2,
  XCircle, TrendingUp, Users, X, BookOpen, Sparkles
} from 'lucide-react';
import api from '../services/api';
import { useAlert } from '../components/common/alerts/useAlert';
import { classLabel } from '../utils/classLabel';
import { useLanguage } from '../i18n/LanguageContext.jsx';

const gradeColor = (grade) => {
  if (grade === 'A+' || grade === 'A') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
  if (grade === 'B' || grade === 'C') return 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300';
  if (grade === 'D') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  if (grade === 'F') return 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
};

const ExamResults = () => {
  const { showAlert } = useAlert();
  const { t, tv, locale } = useLanguage();
  const resultLabel = (status) => t(`exams.results.status.${status}`, { defaultValue: status });
  const location = useLocation();

  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [settings, setSettings] = useState(null);

  const [data, setData] = useState(null); // { exam, results, summary }
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState(null); // individual report-card modal

  // Load initial settings, classes, and exams
  useEffect(() => {
    (async () => {
      try {
        const [resExams, resClasses, resSettings] = await Promise.all([
          api.get('/exams'),
          api.get('/classes'),
          api.get('/settings').catch(() => ({ data: null }))
        ]);
        const examsData = resExams.data || [];
        const classesData = resClasses.data || [];
        setExams(examsData);
        setClasses(classesData);
        if (resSettings?.data) setSettings(resSettings.data);

        const param = new URLSearchParams(location.search).get('exam');
        if (param) {
          const match = examsData.find(e => e._id === param);
          if (match) {
            const cId = match.classId?._id || match.classId;
            setSelectedClassId(cId || '');
            setSelectedExamId(param);
            return;
          }
        }

        if (classesData.length) {
          const firstClassId = classesData[0]._id;
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

  // Filter exams by selected class
  const filteredExams = useMemo(() => {
    if (!selectedClassId) return exams;
    return exams.filter(e => (e.classId?._id || e.classId) === selectedClassId);
  }, [exams, selectedClassId]);

  // When class changes, adjust selected exam
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
      setData(null);
    }
  };

  // Load results for selected exam
  useEffect(() => {
    if (!selectedExamId) {
      setData(null);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const { data: resData } = await api.get(`/exams/${selectedExamId}/results`);
        setData(resData);
      } catch (error) {
        console.error(error);
        showAlert({ type: 'danger', title: t('common.error'), message: t('exams.results.loadFailed') });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExamId]);

  const exam = data?.exam;
  const subjects = exam?.subjects || [];
  const summary = data?.summary;

  // Graded students first by rank, pending last
  const rows = useMemo(() => {
    return (data?.results || []).slice().sort((a, b) => {
      if (a.entered !== b.entered) return a.entered ? -1 : 1;
      return (a.position || 999) - (b.position || 999);
    });
  }, [data]);

  const instituteName = settings?.businessInfo?.name || 'MACHADKA SALAAX ALDAAREYN';

  // Export Master Broadsheet PDF (Matching Image 2 in Landscape format)
  const handleExportPDF = () => {
    if (!exam) return;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Top Brand Bar
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(instituteName.toUpperCase(), pageW / 2, 10, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `WARAAQDA NATIIJADA FASALKA: ${classLabel(exam.classId, '')}   |   IMTIXAANKA: ${exam.title.toUpperCase()} (${tv(exam.examType)})   |   ${exam.term || ''} ${exam.academicYear || ''}`,
      pageW / 2,
      19,
      { align: 'center' }
    );

    // Table Columns Configuration
    let y = 35;
    const x0 = 10;
    const rankW = 12;
    const idW = 18;
    const nameW = 50;
    const rightColsW = 58; // total, average, grade, result
    const availableForSubjects = pageW - 20 - (rankW + idW + nameW + rightColsW);
    const subW = Math.max(16, subjects.length ? availableForSubjects / subjects.length : 20);

    // Header Row
    doc.setFillColor(30, 41, 59);
    doc.rect(x0, y - 5, pageW - 20, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);

    doc.text('RK', x0 + 2, y);
    doc.text('ID', x0 + rankW + 2, y);
    doc.text('NAME', x0 + rankW + idW + 2, y);

    subjects.forEach((s, i) => {
      doc.text(
        s.name.slice(0, 10).toUpperCase(),
        x0 + rankW + idW + nameW + i * subW + subW / 2,
        y,
        { align: 'center' }
      );
    });

    const totX = x0 + rankW + idW + nameW + subjects.length * subW;
    doc.text('TOTAL', totX + 8, y, { align: 'center' });
    doc.text('AVG', totX + 22, y, { align: 'center' });
    doc.text('GRD', totX + 34, y, { align: 'center' });
    doc.text('STATUS', totX + 48, y, { align: 'center' });

    y += 7;

    // Rows
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);

    rows.forEach((r, idx) => {
      if (y > 185) {
        doc.addPage();
        y = 20;
      }

      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(x0, y - 4, pageW - 20, 6.5, 'F');
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(x0, y + 2.5, pageW - 10, y + 2.5);

      doc.setTextColor(100, 116, 139);
      doc.text(r.entered ? String(r.position) : '-', x0 + 2, y);

      doc.setTextColor(51, 65, 85);
      doc.text(String(r.rollNumber || '-'), x0 + rankW + 2, y);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(r.studentName.slice(0, 24), x0 + rankW + idW + 2, y);
      doc.setFont('helvetica', 'normal');

      // Subject Marks (Total obtained in each subject: Nisfi + Nihaayi)
      r.subjects.forEach((sub, i) => {
        const markText = sub.isAbsent ? 'MQ' : (r.entered ? String(sub.marksObtained) : '-');
        if (!sub.passed && r.entered && !sub.isAbsent) {
          doc.setTextColor(225, 29, 72);
        } else {
          doc.setTextColor(15, 23, 42);
        }
        doc.text(markText, x0 + rankW + idW + nameW + i * subW + subW / 2, y, { align: 'center' });
      });

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text(r.entered ? String(r.totalObtained) : '-', totX + 8, y, { align: 'center' });

      const avgText = r.entered ? `${r.average ?? r.percentage}%` : '-';
      doc.text(avgText, totX + 22, y, { align: 'center' });

      doc.text(r.entered ? r.grade : '-', totX + 34, y, { align: 'center' });

      if (r.status === 'Pass') doc.setTextColor(22, 163, 74);
      else if (r.status === 'Fail') doc.setTextColor(225, 29, 72);
      else doc.setTextColor(100, 116, 139);

      doc.text(r.entered ? r.status.toUpperCase() : 'PENDING', totX + 48, y, { align: 'center' });
      doc.setFont('helvetica', 'normal');

      y += 6.5;
    });

    // Signature Block at Bottom
    y += 12;
    if (y > 185) {
      doc.addPage();
      y = 30;
    }
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);

    doc.line(x0 + 15, y + 7, x0 + 75, y + 7);
    doc.text('SAXIIXA MACALLINKA FASALKA', x0 + 18, y + 12);

    doc.line(pageW - 85, y + 7, pageW - 25, y + 7);
    doc.text('SAXIIXA MAAMULAHA & SHAABADDA', pageW - 82, y + 12);

    doc.save(`Waraaqda_Fasalka_${exam.title.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1800px] mx-auto animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
            <Award size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {t('exams.results.title')}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mt-0.5">
              {t('masterSheet')}
            </p>
          </div>
        </div>

        {exam && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-5 py-3.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95"
            >
              <FileDown size={16} /> {t('exams.results.exportPdf')}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-6 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-brand-600/30 active:scale-95"
            >
              <Printer size={16} /> {t('printMasterSheet')}
            </button>
          </div>
        )}
      </div>

      {/* Class and Exam Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
        {/* Class Filter */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
            <BookOpen size={16} className="text-brand-600" /> {t('selectClass')}:
          </span>
          <select
            value={selectedClassId}
            onChange={e => handleClassChange(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t('allClasses')}</option>
            {classes.map(c => (
              <option key={c._id} value={c._id}>
                {classLabel(c, '')}
              </option>
            ))}
          </select>
        </div>

        {/* Exam Filter */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 whitespace-nowrap">
            <ClipboardList size={16} className="text-amber-500" /> {t('exams.selectExam')}:
          </span>
          <select
            value={selectedExamId}
            onChange={e => setSelectedExamId(e.target.value)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white font-bold text-sm focus:ring-2 focus:ring-brand-500"
          >
            <option value="">{t('exams.selectExamOption')}</option>
            {filteredExams.map(e => (
              <option key={e._id} value={e._id}>
                {e.title} · {classLabel(e.classId, '')} · {tv(e.examType)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-500 font-bold">{t('exams.results.loading')}</div>
      ) : !exam ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
          {t('exams.results.selectHint')}
        </div>
      ) : (
        <>
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:hidden">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                  {t('exams.results.passed')}
                </span>
                <CheckCircle2 size={18} className="text-emerald-500" />
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-white">{summary?.passed ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1 font-semibold">
                {t('exams.results.passRate', { rate: summary?.passRate ?? 0 })}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-600">
                  {t('exams.results.failed')}
                </span>
                <XCircle size={18} className="text-rose-500" />
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-white">{summary?.failed ?? 0}</p>
              <p className="text-xs text-slate-500 mt-1 font-semibold">
                {t('exams.results.notGraded', { count: summary?.pending ?? 0 })}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-600">
                  {t('exams.results.classAverage')}
                </span>
                <TrendingUp size={18} className="text-brand-500" />
              </div>
              <p className="text-3xl font-black text-slate-900 dark:text-white">{summary?.avgPercentage ?? 0}%</p>
              <p className="text-xs text-slate-500 mt-1 font-semibold">
                {t('exams.results.graded', { graded: summary?.graded ?? 0, total: summary?.totalStudents ?? 0 })}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                  {t('exams.results.topStudent')}
                </span>
                <Trophy size={18} className="text-amber-500" />
              </div>
              <p className="text-lg font-black text-slate-900 dark:text-white truncate">
                {summary?.topper?.studentName || '—'}
              </p>
              <p className="text-xs text-slate-500 mt-1 font-semibold">
                {summary?.topper ? `${summary.topper.percentage}%` : t('exams.results.noMarks')}
              </p>
            </div>
          </div>

          {/* Master Broadsheet Card (Exact Match to Image 2!) */}
          <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden p-6 print:p-0 print:border-0 print:shadow-none">
            {/* Header matching Image 2: Magaca Machadka, Fasalka, Nuuca Imtixaanka */}
            <div className="pb-5 border-b-2 border-slate-900 dark:border-slate-700 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 flex items-center gap-1.5">
                  <Sparkles size={14} /> {instituteName}
                </span>
              </div>
              <h2 className="text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
                {exam.title}
              </h2>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                FASALKA: <span className="text-slate-900 dark:text-white underline">{classLabel(exam.classId, '')}</span> &nbsp;·&nbsp;
                NUUCA IMTIXAANKA: <span className="text-slate-900 dark:text-white">{tv(exam.examType)}</span> &nbsp;·&nbsp;
                {exam.term} {exam.academicYear} &nbsp;·&nbsp; {new Date(exam.examDate).toLocaleDateString(locale)}
              </p>
            </div>

            {/* Table exact match to Image 2: Id | Name | Maaddooyinka... | Total | Average */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest">
                    <th className="px-3 py-3.5 w-12 text-center">{t('exams.results.rank')}</th>
                    <th className="px-3 py-3.5 w-20">Id</th>
                    <th className="px-4 py-3.5 min-w-[150px]">Name</th>
                    {subjects.map(s => (
                      <th key={s.name} className="px-3 py-3.5 text-center whitespace-nowrap">
                        {s.name}
                        <span className="block text-[9px] text-brand-300 font-normal">
                          /{s.fullMarks}
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-3.5 text-center bg-slate-800 whitespace-nowrap">{t('common.total')}</th>
                    <th className="px-3 py-3.5 text-center bg-slate-800 whitespace-nowrap">{t('average')}</th>
                    <th className="px-3 py-3.5 text-center">{t('exams.results.grade')}</th>
                    <th className="px-3 py-3.5 text-center">{t('exams.results.result')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map(r => (
                    <tr
                      key={r.studentId}
                      onClick={() => setCard(r)}
                      className="hover:bg-brand-50/50 dark:hover:bg-brand-950/20 transition-colors cursor-pointer"
                      title={t('exams.results.tip')}
                    >
                      <td className="px-3 py-3 text-sm font-black text-slate-400 text-center">
                        {r.entered ? (
                          r.position <= 3 ? (
                            <span className="inline-flex items-center gap-1 text-amber-500 font-black">
                              <Trophy size={13} /> {r.position}
                            </span>
                          ) : (
                            r.position
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                        {r.rollNumber || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap capitalize">
                          {r.studentName}
                        </p>
                      </td>
                      {/* Dynamic columns for every subject showing Total Obtained */}
                      {r.subjects.map(sub => (
                        <td key={sub.subject} className="px-3 py-3 text-center text-sm font-semibold">
                          {sub.isAbsent ? (
                            <span className="text-rose-500 text-xs font-black">{t('exams.results.absentShort')}</span>
                          ) : (
                            <span
                              className={
                                sub.passed
                                  ? 'text-slate-800 dark:text-slate-200 font-bold'
                                  : 'text-rose-600 dark:text-rose-400 font-black'
                              }
                            >
                              {r.entered ? sub.marksObtained : '—'}
                            </span>
                          )}
                        </td>
                      ))}
                      {/* Total of all subjects */}
                      <td className="px-3 py-3 text-center text-sm font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/40">
                        {r.entered ? `${r.totalObtained}` : '—'}
                      </td>
                      {/* Average */}
                      <td className="px-3 py-3 text-center text-sm font-black text-brand-600 dark:text-brand-400 bg-slate-50 dark:bg-slate-800/40">
                        {r.entered ? `${r.average ?? r.percentage}%` : '—'}
                      </td>
                      {/* Grade Badge */}
                      <td className="px-3 py-3 text-center">
                        <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${gradeColor(r.grade)}`}>
                          {r.grade}
                        </span>
                      </td>
                      {/* Status Badge */}
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-full ${
                            r.status === 'Pass'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : r.status === 'Fail'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                          }`}
                        >
                          {resultLabel(r.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={subjects.length + 7} className="px-6 py-12 text-center text-slate-400 text-sm font-medium">
                        {t('exams.results.noStudents')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-semibold print:hidden">
              <span>{t('exams.results.tip')}</span>
              <span>Wadarta Ardayda: {rows.length}</span>
            </div>

            {/* Print Signatures Block (Visible when printing directly) */}
            <div className="hidden print:flex justify-between items-center pt-12 text-xs font-bold text-slate-800">
              <div className="space-y-1">
                <p>Saxiixa Macallinka Fasalka: ___________________________</p>
                <p className="text-[10px] text-slate-500 font-normal">Magaca iyo Taariikhda</p>
              </div>
              <div className="space-y-1 text-right">
                <p>Saxiixa Maamulaha: ___________________________</p>
                <p className="text-[10px] text-slate-500 font-normal">Shaabadda Machadka</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Individual Report Card Modal */}
      {card && exam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-[#0B1E3F] via-[#1E7A3C] to-[#B8860B] p-6 text-white relative">
              <button
                onClick={() => setCard(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition"
              >
                <X size={18} />
              </button>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{t('exams.results.reportCard')}</p>
              <h2 className="text-2xl font-black">{card.studentName}</h2>
              <p className="text-xs font-semibold opacity-90">
                {exam.title} · {classLabel(exam.classId, '')} · {exam.term} {exam.academicYear}
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">{t('exams.results.rank')}</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {card.entered ? card.position : '—'}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">{t('average')}</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white">
                    {card.average ?? card.percentage}%
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-3">
                  <p className="text-[10px] font-black uppercase text-slate-400">{t('exams.results.grade')}</p>
                  <p className={`text-2xl font-black ${card.grade === 'F' ? 'text-rose-500' : 'text-emerald-600'}`}>
                    {card.grade}
                  </p>
                </div>
              </div>

              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2">{t('exams.results.subject')}</th>
                    <th className="py-2 text-center">Nisfi</th>
                    <th className="py-2 text-center">Nihaayi</th>
                    <th className="py-2 text-center">Total</th>
                    <th className="py-2 text-center">{t('exams.results.result')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {card.subjects.map(s => (
                    <tr key={s.subject}>
                      <td className="py-2 text-sm font-bold text-slate-700 dark:text-slate-200">{s.subject}</td>
                      <td className="py-2 text-center text-xs font-semibold text-slate-500">
                        {s.isAbsent ? 'MQ' : `${s.nisfi ?? '—'} / ${s.nisfiFullMarks || 40}`}
                      </td>
                      <td className="py-2 text-center text-xs font-semibold text-slate-500">
                        {s.isAbsent ? 'MQ' : `${s.nihaayi ?? '—'} / ${s.nihaayiFullMarks || 60}`}
                      </td>
                      <td className="py-2 text-center text-sm font-bold text-slate-900 dark:text-white">
                        {s.isAbsent ? 'MQ' : `${s.marksObtained} / ${s.fullMarks}`}
                      </td>
                      <td className="py-2 text-center">
                        {s.isAbsent ? (
                          <span className="text-rose-500 text-xs font-black">{t('exams.results.absentShort')}</span>
                        ) : (
                          <span className={`text-xs font-black ${s.passed ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {s.passed ? t('exams.results.passUpper') : t('exams.results.failUpper')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-black text-slate-900 dark:text-white">
                    <td colSpan={3} className="py-2 uppercase text-xs">{t('common.total')}</td>
                    <td className="py-2 text-center text-sm">{card.totalObtained} / {card.totalFull}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs font-black uppercase ${card.status === 'Pass' ? 'text-emerald-600' : card.status === 'Fail' ? 'text-rose-500' : 'text-slate-400'}`}>
                        {resultLabel(card.status)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>

              {card.remarks && (
                <p className="text-xs text-slate-500">
                  <span className="font-black uppercase">{t('academic.exit.remarks')}:</span> {card.remarks}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamResults;

import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen, Plus, Search, Edit2, Trash2, CheckCircle2, XCircle,
  Users, Layers, GraduationCap, Award, SlidersHorizontal, Loader2,
  X, Check, AlertCircle, FileText, Sparkles
} from 'lucide-react';
import api from '../services/api';
import { useAlert } from '../components/common/alerts/useAlert';
import { classLabel } from '../utils/classLabel';
import { useLanguage } from '../i18n/LanguageContext.jsx';

const emptyForm = () => ({
  name: '',
  code: '',
  classIds: [],
  teacherId: '',
  nisfiFullMarks: 40,
  nihaayiFullMarks: 60,
  fullMarks: 100,
  passMarks: 40,
  status: 'Active',
  description: ''
});

const SubjectsManagement = () => {
  const { showAlert, showConfirm } = useAlert();
  const { t, tv } = useLanguage();

  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resSubjects, resClasses, resUsers] = await Promise.all([
        api.get('/subjects'),
        api.get('/classes'),
        api.get('/users').catch(() => ({ data: [] }))
      ]);

      setSubjects(resSubjects.data || []);
      setClasses(resClasses.data || []);

      // Filter teachers from users
      const usersList = resUsers.data || [];
      const teacherUsers = usersList.filter(u => {
        const r = (u.role || '').toLowerCase();
        const rs = (u.roles || []).map(x => String(x).toLowerCase());
        return r.includes('teacher') || rs.some(x => x.includes('teacher'));
      });
      setTeachers(teacherUsers.length ? teacherUsers : usersList);
    } catch (error) {
      console.error('Failed to load subjects data', error);
      showAlert({ type: 'danger', title: t('common.error'), message: 'Failed to load subjects.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm());
    setIsModalOpen(true);
  };

  const openEdit = (sub) => {
    setEditing(sub);
    setForm({
      name: sub.name || '',
      code: sub.code || '',
      classIds: (sub.classIds || []).map(c => c._id || c),
      teacherId: sub.teacherId?._id || sub.teacherId || '',
      nisfiFullMarks: sub.nisfiFullMarks ?? 40,
      nihaayiFullMarks: sub.nihaayiFullMarks ?? 60,
      fullMarks: sub.fullMarks || ((sub.nisfiFullMarks ?? 40) + (sub.nihaayiFullMarks ?? 60)),
      passMarks: sub.passMarks ?? 40,
      status: sub.status || 'Active',
      description: sub.description || ''
    });
    setIsModalOpen(true);
  };

  const handleScoreChange = (field, val) => {
    const num = Math.max(0, Number(val) || 0);
    setForm(prev => {
      const next = { ...prev, [field]: num };
      if (field === 'nisfiFullMarks' || field === 'nihaayiFullMarks') {
        const n = field === 'nisfiFullMarks' ? num : prev.nisfiFullMarks;
        const f = field === 'nihaayiFullMarks' ? num : prev.nihaayiFullMarks;
        next.fullMarks = n + f;
      }
      return next;
    });
  };

  const toggleClassSelect = (cId) => {
    setForm(prev => {
      const exists = prev.classIds.includes(cId);
      return {
        ...prev,
        classIds: exists
          ? prev.classIds.filter(id => id !== cId)
          : [...prev.classIds, cId]
      };
    });
  };

  const selectAllClasses = () => {
    if (form.classIds.length === classes.length) {
      setForm(prev => ({ ...prev, classIds: [] }));
    } else {
      setForm(prev => ({ ...prev, classIds: classes.map(c => c._id) }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      return showAlert({ type: 'warning', title: 'Xaqiijin', message: 'Fadlan qor magaca maaddada.' });
    }
    if (form.passMarks > form.fullMarks) {
      return showAlert({ type: 'warning', title: 'Xaqiijin', message: 'Dhibcaha gudbitaanka kama badnaan karaan wadarta guud.' });
    }

    try {
      setSaving(true);
      const payload = {
        ...form,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase()
      };

      if (editing) {
        const { data } = await api.put(`/subjects/${editing._id}`, payload);
        setSubjects(prev => prev.map(s => s._id === editing._id ? data : s));
        showAlert({ type: 'success', title: 'Waa la cusbooneysiiyey', message: 'Maaddada si guul ah ayaa loo cusbooneysiiyey.' });
      } else {
        const { data } = await api.post('/subjects', payload);
        setSubjects(prev => [data, ...prev]);
        showAlert({ type: 'success', title: 'Waa la abuuray', message: 'Maaddo cusub ayaa si guul ah loogu daray.' });
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      showAlert({
        type: 'danger',
        title: t('common.error'),
        message: error.response?.data?.message || 'Kaydinta maaddada way fashilantay.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sub) => {
    const ok = await showConfirm({
      type: 'warning',
      title: 'Tirtir Maaddada?',
      message: `Ma hubtaa inaad tirtirto maaddada "${sub.name}"?`,
      confirmText: t('common.yesDelete'),
      cancelText: t('common.cancel'),
      danger: true
    });
    if (!ok) return;

    try {
      await api.delete(`/subjects/${sub._id}`);
      setSubjects(prev => prev.filter(s => s._id !== sub._id));
      showAlert({ type: 'success', title: t('common.deleted'), message: 'Maaddada waa la tirtiray.' });
    } catch (error) {
      showAlert({ type: 'danger', title: t('common.error'), message: 'Tirtirista maaddada way fashilantay.' });
    }
  };

  // Filtered Subjects
  const filteredSubjects = useMemo(() => {
    return subjects.filter(s => {
      const matchSearch =
        (s.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.code || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.description || '').toLowerCase().includes(search.toLowerCase());

      const matchClass = !classFilter || (s.classIds || []).some(c => (c._id || c) === classFilter);
      const matchStatus = !statusFilter || s.status === statusFilter;

      return matchSearch && matchClass && matchStatus;
    });
  }, [subjects, search, classFilter, statusFilter]);

  // KPI Calculations
  const totalCount = subjects.length;
  const activeCount = subjects.filter(s => s.status === 'Active').length;
  const classesAssigned = new Set(subjects.flatMap(s => (s.classIds || []).map(c => c._id || c))).size;

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-[1800px] mx-auto animate-in fade-in duration-500 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-600/20">
            <BookOpen size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {tv('Subjects') || 'Maaddooyinka'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider mt-0.5">
              Maamul maaddooyinka waxbarashada · dhibcaha Nisfi/Nihaayi · fasallada & macallimiinta
            </p>
          </div>
        </div>

        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-6 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-brand-600/30 active:scale-95"
        >
          <Plus size={18} /> Ku dar Maaddo Cusub
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-600">
              Wadarta Maaddooyinka
            </span>
            <BookOpen size={18} className="text-brand-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">{totalCount}</p>
          <p className="text-xs text-slate-500 mt-1 font-semibold">Dhammaan maaddooyinka diiwaangashan</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
              Maaddooyinka Firfircoon
            </span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">{activeCount}</p>
          <p className="text-xs text-slate-500 mt-1 font-semibold">{totalCount - activeCount} aan shaqaynayn</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-sky-600">
              Fasallada Ku Xiran
            </span>
            <Layers size={18} className="text-sky-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white">{classesAssigned}</p>
          <p className="text-xs text-slate-500 mt-1 font-semibold">fasal oo maaddooyin loo xilsaaray</p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
              Nidaamka Dhibcaha
            </span>
            <Award size={18} className="text-amber-500" />
          </div>
          <p className="text-xl font-black text-slate-900 dark:text-white">40 / 60</p>
          <p className="text-xs text-slate-500 mt-1 font-semibold">Nisfi (40) + Nihaayi (60) = 100</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Ku raadi magaca maaddada, koodhka, iwm..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white text-sm font-semibold focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white text-sm font-bold focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Dhammaan Fasallada</option>
            {classes.map(c => (
              <option key={c._id} value={c._id}>
                {classLabel(c, '')}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white text-sm font-bold focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Dhammaan Xaaladaha</option>
            <option value="Active">Active (Firfircoon)</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Subjects Table */}
      {loading ? (
        <div className="p-16 text-center text-slate-500 font-bold flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="animate-spin text-brand-600" />
          <span>Waxaa la soo rarayaa maaddooyinka...</span>
        </div>
      ) : filteredSubjects.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 font-semibold space-y-3">
          <BookOpen size={40} className="mx-auto text-slate-300" />
          <p>Wax maaddooyin ah lama helin.</p>
          <button
            onClick={openAdd}
            className="px-5 py-2.5 bg-brand-600 text-white rounded-xl text-xs font-bold uppercase"
          >
            Ku dar Maaddo Cusub
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/30 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">
                  <th className="px-5 py-4 w-12 text-center">#</th>
                  <th className="px-6 py-4">Maaddada</th>
                  <th className="px-4 py-4">Koodhka</th>
                  <th className="px-6 py-4">Fasallada Qaata</th>
                  <th className="px-6 py-4">Macallinka Loo Xilsaaray</th>
                  <th className="px-4 py-4 text-center">Qaybinta Dhibcaha (Nisfi + Nihaayi)</th>
                  <th className="px-4 py-4 text-center">Gudbitaanka</th>
                  <th className="px-4 py-4 text-center">Xaaladda</th>
                  <th className="px-5 py-4 text-right">Ficilada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSubjects.map((sub, i) => {
                  const classList = sub.classIds || [];
                  const teacherName = sub.teacherId?.fullName || sub.teacherId?.name;

                  return (
                    <tr
                      key={sub._id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors"
                    >
                      <td className="px-5 py-4 text-xs font-bold text-slate-400 text-center">{i + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 flex items-center justify-center font-black text-sm">
                            <BookOpen size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white capitalize">
                              {sub.name}
                            </p>
                            {sub.description && (
                              <p className="text-xs text-slate-400 line-clamp-1">{sub.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-xs font-bold">
                          {sub.code || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center flex-wrap gap-1.5 max-w-xs">
                          {classList.length === 0 ? (
                            <span className="text-xs text-slate-400 italic">Dhammaan Fasallada</span>
                          ) : (
                            classList.map(c => (
                              <span
                                key={c._id || c}
                                className="px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 text-[11px] font-bold"
                              >
                                {classLabel(c, '')}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {teacherName ? (
                          <div className="flex items-center gap-2">
                            <GraduationCap size={15} className="text-slate-400" />
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {teacherName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Lama xilsaarin</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs font-black">
                          <span>Nisfi: {sub.nisfiFullMarks || 40}</span>
                          <span>+</span>
                          <span>Nihaayi: {sub.nihaayiFullMarks || 60}</span>
                          <span className="text-slate-400">=</span>
                          <span className="text-brand-600 font-extrabold">{sub.fullMarks || 100}</span>
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {sub.passMarks || 40} dhibcood
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            sub.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(sub)}
                            className="p-2 rounded-xl text-slate-400 hover:text-brand-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Wax ka beddel"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(sub)}
                            className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Tirtir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE / EDIT SUBJECT MODAL (Compact & Clean) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            {/* Modal Header (Compact) */}
            <div className="bg-slate-900 px-5 py-3.5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white">
                  <BookOpen size={16} />
                </div>
                <div>
                  <h2 className="text-base font-black leading-tight">
                    {editing ? 'Wax ka beddel Maaddada' : 'Ku dar Maaddo Cusub'}
                  </h2>
                  <p className="text-[11px] text-slate-400 font-semibold leading-none mt-0.5">
                    Geli magaca maaddada iyo dhibcaheeda
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
                {/* 1. PRIMARY FIELD: MAGACA MAADDADA (Clear & Prominent) */}
                <div className="p-3 rounded-xl bg-brand-50/70 dark:bg-brand-950/30 border-2 border-brand-500/50 dark:border-brand-500/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-brand-900 dark:text-brand-300 flex items-center gap-1.5">
                      <BookOpen size={14} className="text-brand-600" />
                      Magaca Maaddada (Subject Name) *
                    </label>
                    <span className="text-[10px] font-bold text-brand-700 dark:text-brand-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-full border border-brand-200 dark:border-brand-800">
                      Halkaan ku qor
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Qor magaca maaddada (tusaale: Xisaab, Carabiga, Soomaali, Xadiis...)"
                    className="w-full px-3 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-brand-300 dark:border-brand-700 outline-none text-slate-900 dark:text-white text-sm font-black focus:ring-2 focus:ring-brand-500 placeholder:text-slate-400"
                  />
                </div>

                {/* 2. CODE & TEACHER ROW (Compact) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                      Koodhka Maaddada (Code)
                    </label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={e => setForm({ ...form, code: e.target.value })}
                      placeholder="tusaale: MATH-101, SOM"
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                      Macallinka Loo Xilsaaray
                    </label>
                    <select
                      value={form.teacherId}
                      onChange={e => setForm({ ...form, teacherId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">-- Dooro Macallin (Ikhtiyaari) --</option>
                      {teachers.map(t => (
                        <option key={t._id} value={t._id}>
                          {t.fullName || t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. MARKING SCHEME (Compact 4-column strip) */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                    <Award size={13} className="text-amber-500" />
                    Dhibcaha: Nisfi (40) + Nihaayi (60) = Wadarta (100)
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 mb-0.5 text-center">Nisfi</span>
                      <input
                        type="number"
                        min="0"
                        value={form.nisfiFullMarks}
                        onChange={e => handleScoreChange('nisfiFullMarks', e.target.value)}
                        className="w-full px-2 py-1.5 text-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 mb-0.5 text-center">Nihaayi</span>
                      <input
                        type="number"
                        min="0"
                        value={form.nihaayiFullMarks}
                        onChange={e => handleScoreChange('nihaayiFullMarks', e.target.value)}
                        className="w-full px-2 py-1.5 text-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 mb-0.5 text-center">Wadarta</span>
                      <input
                        type="number"
                        readOnly
                        value={form.fullMarks}
                        className="w-full px-2 py-1.5 text-center rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-600 dark:text-slate-300 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 mb-0.5 text-center">Gudbidda</span>
                      <input
                        type="number"
                        min="0"
                        value={form.passMarks}
                        onChange={e => handleScoreChange('passMarks', e.target.value)}
                        className="w-full px-2 py-1.5 text-center rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-black text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. FASALLADA QAATA MAADDADAN (Compact Scrollable Pills) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black uppercase text-slate-500">
                      Fasallada Qaata Maaddadan
                    </label>
                    <button
                      type="button"
                      onClick={selectAllClasses}
                      className="text-[11px] text-brand-600 font-bold hover:underline"
                    >
                      {form.classIds.length === classes.length ? 'Ka qaad dhammaan' : 'Dooro dhammaan'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-28 overflow-y-auto p-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/20">
                    {classes.map(c => {
                      const isSelected = form.classIds.includes(c._id);
                      return (
                        <button
                          key={c._id}
                          type="button"
                          onClick={() => toggleClassSelect(c._id)}
                          className={`flex items-center gap-1.5 p-1.5 px-2 rounded-lg text-[11px] font-bold text-left transition border ${
                            isSelected
                              ? 'bg-brand-50 border-brand-500 text-brand-900 dark:bg-brand-950/40 dark:text-brand-300'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                              isSelected
                                ? 'bg-brand-600 border-brand-600 text-white'
                                : 'border-slate-300 dark:border-slate-600'
                            }`}
                          >
                            {isSelected && <Check size={10} />}
                          </div>
                          <span className="truncate">{classLabel(c, '')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 5. STATUS & DESCRIPTION ROW (Compact) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                      Xaaladda
                    </label>
                    <select
                      value={form.status}
                      onChange={e => setForm({ ...form, status: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-black uppercase text-slate-500 mb-1">
                      Faahfaahin (Ikhtiyaari)
                    </label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Faahfaahin kooban..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* Modal Footer (Compact Pinned) */}
              <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase transition hover:bg-slate-100"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs uppercase transition shadow-md shadow-brand-600/20 disabled:opacity-60"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <SaveIcon size={14} />}
                  {editing ? 'Cusbooneysii' : 'Kaydi Maaddada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const SaveIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

export default SubjectsManagement;

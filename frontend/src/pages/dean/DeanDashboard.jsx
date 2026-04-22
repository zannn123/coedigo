import { useEffect, useMemo, useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart3, Users, BookOpen, GraduationCap, Search, UserRound, CalendarRange, ScrollText, Mail } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './DeanDashboard.css';

const statusBadge = {
  draft: 'badge-warning',
  faculty_verified: 'badge-info',
  officially_released: 'badge-success',
};

const semesterOrder = {
  '1st': 1,
  '2nd': 2,
  Summer: 3,
};

const numberValue = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatPercent = (value) => {
  const parsed = numberValue(value);
  return parsed != null ? `${parsed.toFixed(1)}%` : '-';
};

const formatGrade = (value) => {
  const parsed = numberValue(value);
  return parsed != null ? parsed.toFixed(2) : '-';
};

const statusLabel = (status) => {
  if (status === 'officially_released') return 'Released';
  if (status === 'faculty_verified') return 'Verified';
  return 'Draft';
};

const semesterLabel = (semester) => semester === 'Unassigned Semester' ? semester : `${semester} Semester`;

const groupTranscriptByYear = (grades = []) => {
  const grouped = grades.reduce((years, grade) => {
    const year = grade.academic_year || 'Unassigned Academic Year';
    const semester = grade.semester || 'Unassigned Semester';

    if (!years[year]) years[year] = {};
    if (!years[year][semester]) years[year][semester] = [];
    years[year][semester].push(grade);
    return years;
  }, {});

  return Object.entries(grouped)
    .map(([year, semesters]) => ({
      year,
      semesters: Object.entries(semesters)
        .map(([semester, subjects]) => ({
          semester,
          subjects: [...subjects].sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true })),
        }))
        .sort((a, b) => (semesterOrder[a.semester] || 9) - (semesterOrder[b.semester] || 9) || a.semester.localeCompare(b.semester)),
    }))
    .sort((a, b) => {
      if (a.year === 'Unassigned Academic Year') return 1;
      if (b.year === 'Unassigned Academic Year') return -1;
      return b.year.localeCompare(a.year, undefined, { numeric: true });
    });
};

export default function DeanDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [studentReport, setStudentReport] = useState(null);
  const [studentReportLoading, setStudentReportLoading] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  useEffect(() => {
    let active = true;

    const loadDashboard = async () => {
      try {
        const [dashboardResponse, studentsResponse] = await Promise.all([
          api.get('/reports/dashboard'),
          api.get('/reports/students'),
        ]);

        if (!active) return;

        const nextStudents = studentsResponse.data?.data || [];
        setData(dashboardResponse.data?.data || null);
        setStudents(nextStudents);
        setSelectedStudentId(current => current ?? nextStudents[0]?.id ?? null);
      } catch {
        if (!active) return;
        setData(null);
        setStudents([]);
      } finally {
        if (active) {
          setStudentsLoading(false);
        }
      }
    };

    loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedStudentId) {
      setStudentReport(null);
      return;
    }

    let active = true;
    setStudentReportLoading(true);

    api.get(`/reports/student/${selectedStudentId}`)
      .then(response => {
        if (active) {
          setStudentReport(response.data?.data || null);
        }
      })
      .catch(() => {
        if (active) {
          setStudentReport(null);
        }
      })
      .finally(() => {
        if (active) {
          setStudentReportLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedStudentId]);

  const filteredStudents = useMemo(() => {
    const keyword = studentSearch.trim().toLowerCase();
    if (!keyword) return students;

    return students.filter(student => [
      student.student_id,
      student.first_name,
      student.middle_name,
      student.last_name,
      student.email,
      student.program,
    ].filter(Boolean).some(value => String(value).toLowerCase().includes(keyword)));
  }, [studentSearch, students]);

  useEffect(() => {
    if (!filteredStudents.length) {
      return;
    }

    const selectedVisible = filteredStudents.some(student => student.id === selectedStudentId);
    if (!selectedVisible) {
      setSelectedStudentId(filteredStudents[0].id);
    }
  }, [filteredStudents, selectedStudentId]);

  const transcriptYears = useMemo(
    () => groupTranscriptByYear(studentReport?.grades || []),
    [studentReport]
  );

  if (!data && studentsLoading) {
    return <div className="empty-state" style={{ marginTop: '4rem' }}>Loading dashboard...</div>;
  }

  const { overview, grade_status_distribution, program_performance, recent_releases } = data || {
    overview: { total_students: 0, total_faculty: 0, total_classes: 0, total_subjects: 0 },
    grade_status_distribution: [],
    program_performance: [],
    recent_releases: [],
  };

  const statusMap = {};
  grade_status_distribution?.forEach(item => {
    statusMap[item.grade_status] = parseInt(item.count, 10);
  });

  const pieData = [
    { name: 'Draft', value: statusMap.draft || 0, color: '#EAB308' },
    { name: 'Verified', value: statusMap.faculty_verified || 0, color: '#3B82F6' },
    { name: 'Released', value: statusMap.officially_released || 0, color: '#22C55E' },
  ].filter(item => item.value > 0);

  const perfData = program_performance?.map(item => ({
    name: item.program || 'N/A',
    avg: parseFloat(item.avg_score || 0).toFixed(1),
    passed: parseInt(item.passed || 0, 10),
    failed: parseInt(item.failed || 0, 10),
  })) || [];

  const roleLabel = user?.role === 'program_chair' ? 'Program Chair' : 'Dean';
  const selectedStudent = students.find(student => student.id === selectedStudentId) || null;

  return (
    <div className="animate-in dean-dashboard-page">
      <div className="page-header">
        <h1>{roleLabel} Monitoring Dashboard</h1>
        <p>Grade monitoring, student roster review, and individual grade history by academic year.</p>
      </div>

      <div className="grid-4" style={{ marginBottom: '2rem' }}>
        {[
          { label: 'Students', value: overview.total_students, icon: <GraduationCap size={22} />, color: 'var(--success)' },
          { label: 'Faculty', value: overview.total_faculty, icon: <Users size={22} />, color: 'var(--info)' },
          { label: 'Classes', value: overview.total_classes, icon: <BookOpen size={22} />, color: 'var(--accent)' },
          { label: 'Subjects', value: overview.total_subjects, icon: <BarChart3 size={22} />, color: 'var(--warning)' },
        ].map((card, index) => (
          <div key={index} className="stat-card">
            <div className="flex-between">
              <div>
                <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
                <div className="stat-label">{card.label}</div>
              </div>
              <div style={{ color: card.color, opacity: 0.5 }}>{card.icon}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        <section className="card">
          <h3 style={{ marginBottom: '1rem' }}>Program Performance (Avg Score %)</h3>
          {perfData.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={perfData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }} />
                <Bar dataKey="avg" fill="var(--accent)" radius={[4, 4, 0, 0]} name="Avg Score %" />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="empty-state">No performance data</p>}
        </section>

        <section className="card">
          <h3 style={{ marginBottom: '1rem' }}>Grade Status Distribution</h3>
          {pieData.length ? (
            <div className="chart-split">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" stroke="var(--bg-primary)" strokeWidth={2}>
                    {pieData.map((item, index) => <Cell key={index} fill={item.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pieData.map((item, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
                    <span style={{ fontSize: '0.875rem' }}>{item.name}: <strong>{item.value}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="empty-state">No data</p>}
        </section>
      </div>

      <section className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Recently Released Grades</h3>
        <div className="table-container">
          <table>
            <thead><tr><th>Subject</th><th>Section</th><th>Faculty</th><th>Released</th></tr></thead>
            <tbody>
              {recent_releases?.map((release, index) => (
                <tr key={index}>
                  <td><strong>{release.code}</strong> - {release.name}</td>
                  <td>{release.section}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{release.faculty}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{release.released_at ? new Date(release.released_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
              {!recent_releases?.length && <tr><td colSpan={4} className="empty-state">No released grades yet</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dean-student-workspace">
        <div className="card dean-roster-panel">
          <div className="dean-panel-head">
            <div>
              <span>Student roster</span>
              <h3>Browse individual students</h3>
            </div>
            <strong>{filteredStudents.length}</strong>
          </div>

          <div className="dean-search-row">
            <Search size={16} />
            <input
              className="input-field"
              value={studentSearch}
              onChange={event => setStudentSearch(event.target.value)}
              placeholder="Search by name, ID, email, or program"
            />
          </div>

          <div className="dean-roster-list">
            {studentsLoading ? (
              <div className="empty-state" style={{ padding: '1rem' }}>Loading students...</div>
            ) : filteredStudents.length ? (
              filteredStudents.map(student => {
                const isSelected = student.id === selectedStudentId;
                return (
                  <button
                    type="button"
                    key={student.id}
                    className={`dean-student-row ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => setSelectedStudentId(student.id)}
                  >
                    <div className="dean-student-row-top">
                      <strong>{student.last_name}, {student.first_name}</strong>
                      <span>{student.student_id || 'No ID'}</span>
                    </div>
                    <div className="dean-student-row-meta">
                      <span>{student.program || 'Unassigned program'}</span>
                      <span>{student.year_level ? `Year ${student.year_level}` : 'Year not set'}</span>
                      <span>{student.enrollment_count} subject{student.enrollment_count === 1 ? '' : 's'}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="empty-state" style={{ padding: '1rem' }}>No students match the current search.</div>
            )}
          </div>
        </div>

        <div className="card dean-transcript-panel">
          <div className="dean-panel-head">
            <div>
              <span>Student grade view</span>
              <h3>{selectedStudent ? `${selectedStudent.first_name} ${selectedStudent.last_name}` : 'Select a student'}</h3>
            </div>
          </div>

          {selectedStudent ? (
            <>
              <div className="dean-student-summary">
                <div><UserRound size={15} /><span>{selectedStudent.student_id || 'No student ID'}</span></div>
                <div><GraduationCap size={15} /><span>{selectedStudent.program || 'Program not set'}</span></div>
                <div><CalendarRange size={15} /><span>{selectedStudent.year_level ? `Year ${selectedStudent.year_level}` : 'Year not set'}</span></div>
                <div><Mail size={15} /><span>{selectedStudent.email || 'No email'}</span></div>
              </div>

              {studentReportLoading ? (
                <div className="empty-state" style={{ marginTop: '2rem' }}>Loading student grades...</div>
              ) : transcriptYears.length ? (
                <div className="dean-year-stack">
                  {transcriptYears.map(yearGroup => {
                    const subjectCount = yearGroup.semesters.reduce((count, semester) => count + semester.subjects.length, 0);

                    return (
                      <section key={yearGroup.year} className="dean-year-band">
                        <div className="dean-year-head">
                          <div>
                            <span>Academic Year</span>
                            <h4>{yearGroup.year}</h4>
                          </div>
                          <strong>{subjectCount} subject{subjectCount === 1 ? '' : 's'}</strong>
                        </div>

                        <div className="dean-semester-stack">
                          {yearGroup.semesters.map(semesterGroup => (
                            <div key={`${yearGroup.year}-${semesterGroup.semester}`} className="dean-semester-section">
                              <div className="dean-semester-head">
                                <h5>{semesterLabel(semesterGroup.semester)}</h5>
                                <span>{semesterGroup.subjects.length} entry{semesterGroup.subjects.length === 1 ? '' : 'ies'}</span>
                              </div>

                              <div className="table-container">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Subject</th>
                                      <th>Section</th>
                                      <th>Faculty</th>
                                      <th>Status</th>
                                      <th>Weighted</th>
                                      <th>Final Grade</th>
                                      <th>Remarks</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {semesterGroup.subjects.map(subject => (
                                      <tr key={subject.enrollment_id || `${subject.code}-${subject.section}`}>
                                        <td>
                                          <strong>{subject.code}</strong> - {subject.name}
                                        </td>
                                        <td>{subject.section}</td>
                                        <td style={{ color: 'var(--text-secondary)' }}>{subject.faculty_name}</td>
                                        <td><span className={`badge ${statusBadge[subject.grade_status] || 'badge-warning'}`}>{statusLabel(subject.grade_status)}</span></td>
                                        <td>{formatPercent(subject.weighted_score)}</td>
                                        <td style={{ fontWeight: 700 }}>{formatGrade(subject.final_grade)}</td>
                                        <td>{subject.remarks || '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="dean-empty-state">
                  <ScrollText size={18} />
                  <span>No grade history is available for this student yet.</span>
                </div>
              )}
            </>
          ) : (
            <div className="dean-empty-state">
              <ScrollText size={18} />
              <span>Select a student from the left panel to view grades by academic year and semester.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

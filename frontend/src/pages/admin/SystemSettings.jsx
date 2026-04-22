import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Shield, Save } from 'lucide-react';

export default function SystemSettings() {
  const [settings, setSettings] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get('/settings').then(r => {
      const map = {};
      r.data.data?.forEach(s => { map[s.setting_key] = s.setting_value; });
      setSettings(map);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      await api.put('/settings', settings);
      setToast({ msg: 'Settings saved successfully.', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch { setToast({ msg: 'Failed to save.', type: 'error' }); setTimeout(() => setToast(null), 3000); }
  };

  const update = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  return (
    <div className="animate-in">
      <div className="page-header flex-between">
        <div><h1>System Settings</h1><p>Configure grading parameters and institution details</p></div>
        <button className="btn btn-primary" onClick={handleSave}><Save size={18} />Save Changes</button>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Shield size={18} /> Institution</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group"><label>Institution Name</label><input className="input-field" value={settings.institution_name || ''} onChange={e => update('institution_name', e.target.value)} /></div>
            <div className="input-group"><label>College Name</label><input className="input-field" value={settings.college_name || ''} onChange={e => update('college_name', e.target.value)} /></div>
            <div className="grid-2">
              <div className="input-group"><label>Academic Year</label><input className="input-field" value={settings.current_academic_year || ''} onChange={e => update('current_academic_year', e.target.value)} /></div>
              <div className="input-group"><label>Semester</label><select className="input-field" value={settings.current_semester || ''} onChange={e => update('current_semester', e.target.value)}><option value="1st">1st</option><option value="2nd">2nd</option><option value="Summer">Summer</option></select></div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: '1.25rem' }}>Grading Weights</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group"><label>Major Exams (%)</label><input type="number" className="input-field" min="0" max="100" value={settings.major_exam_weight || ''} onChange={e => update('major_exam_weight', e.target.value)} /></div>
            <div className="input-group"><label>Quizzes (%)</label><input type="number" className="input-field" min="0" max="100" value={settings.quiz_weight || ''} onChange={e => update('quiz_weight', e.target.value)} /></div>
            <div className="input-group"><label>Projects/Outputs (%)</label><input type="number" className="input-field" min="0" max="100" value={settings.project_weight || ''} onChange={e => update('project_weight', e.target.value)} /></div>
            <div className="input-group"><label>Passing Grade</label><input className="input-field" value={settings.passing_grade || ''} onChange={e => update('passing_grade', e.target.value)} /></div>
          </div>
        </div>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

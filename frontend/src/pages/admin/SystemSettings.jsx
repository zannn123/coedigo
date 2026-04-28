import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle, Mail, Save, Settings, Shield } from 'lucide-react';
import api from '../../services/api';
import './SystemSettings.css';

const DEFAULT_SETTINGS = {
  institution_name: '',
  college_name: '',
  current_academic_year: '',
  current_semester: '1st',
  major_exam_weight: '',
  quiz_weight: '',
  project_weight: '',
  passing_grade: '',
  smtp_host: 'smtp.gmail.com',
  smtp_port: '465',
  smtp_username: '',
  smtp_password: '',
  smtp_encryption: 'ssl',
  mail_from_address: '',
  mail_from_name: 'COEDIGO',
  mail_reply_to: '',
};

const SECTIONS = [
  {
    id: 'institution',
    title: 'Institution',
    icon: Shield,
    fields: [
      { key: 'institution_name', label: 'Institution' },
      { key: 'college_name', label: 'College' },
    ],
  },
  {
    id: 'term',
    title: 'Academic Term',
    icon: BookOpen,
    fields: [
      { key: 'current_academic_year', label: 'Academic Year', placeholder: '2025-2026' },
      {
        key: 'current_semester',
        label: 'Semester',
        type: 'select',
        options: [
          { value: '1st', label: '1st Semester' },
          { value: '2nd', label: '2nd Semester' },
          { value: 'Summer', label: 'Summer' },
        ],
      },
    ],
  },
  {
    id: 'grading',
    title: 'Grading',
    icon: Settings,
    fields: [
      { key: 'major_exam_weight', label: 'Exams', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'quiz_weight', label: 'Quizzes', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'project_weight', label: 'Projects', type: 'number', min: 0, max: 100, suffix: '%' },
      { key: 'passing_grade', label: 'Passing Grade', placeholder: '3.00' },
    ],
  },
  {
    id: 'email',
    title: 'Email',
    icon: Mail,
    fields: [
      { key: 'smtp_host', label: 'Host', placeholder: 'smtp.gmail.com' },
      { key: 'smtp_port', label: 'Port', type: 'number', placeholder: '465' },
      {
        key: 'smtp_encryption',
        label: 'Encryption',
        type: 'select',
        options: [
          { value: 'ssl', label: 'SSL' },
          { value: 'tls', label: 'TLS / STARTTLS' },
          { value: 'none', label: 'None' },
        ],
      },
      { key: 'smtp_username', label: 'Username', type: 'email', placeholder: 'name@gmail.com' },
      { key: 'smtp_password', label: 'Password', type: 'password' },
      { key: 'mail_from_name', label: 'From Name' },
      { key: 'mail_from_address', label: 'From Email', type: 'email', placeholder: 'Optional' },
      { key: 'mail_reply_to', label: 'Reply-To', type: 'email', placeholder: 'Optional' },
    ],
  },
];

function buildSettingsMap(rows) {
  const map = {};
  rows?.forEach(setting => {
    map[setting.setting_key] = setting.setting_value;
  });
  return map;
}

function settingValue(settings, key) {
  return settings[key] ?? '';
}

export default function SystemSettings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let mounted = true;

    api.get('/settings')
      .then(response => {
        if (!mounted) return;
        const next = { ...DEFAULT_SETTINGS, ...buildSettingsMap(response.data.data) };
        setSettings(next);
        setSavedSettings(next);
      })
      .catch(() => {
        if (mounted) setToast({ msg: 'Unable to load settings.', type: 'error' });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  const activeConfig = SECTIONS.find(section => section.id === activeSection) || SECTIONS[0];
  const activeSectionIndex = SECTIONS.findIndex(section => section.id === activeConfig.id) + 1;
  const hasChanges = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const gradingTotal = useMemo(() => {
    return ['major_exam_weight', 'quiz_weight', 'project_weight'].reduce((total, key) => {
      const value = Number(settings[key]);
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
  }, [settings]);

  const showToast = (message, type = 'success') => {
    setToast({ msg: message, type });
    setTimeout(() => setToast(null), 2600);
  };

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      setSavedSettings(settings);
      showToast('Settings saved.');
    } catch {
      showToast('Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderControl = field => {
    const id = `setting-${field.key}`;
    const commonProps = {
      id,
      className: 'input-field settings-input',
      value: settingValue(settings, field.key),
      onChange: event => update(field.key, event.target.value),
    };

    if (field.type === 'select') {
      return (
        <select {...commonProps}>
          {field.options.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        {...commonProps}
        type={field.type || 'text'}
        min={field.min}
        max={field.max}
        placeholder={field.placeholder || ''}
      />
    );
  };

  return (
    <div className="settings-page animate-in">
      <header className="settings-header">
        <div>
          <p className="settings-eyebrow">Admin</p>
          <h1>Settings</h1>
        </div>
        <button className="btn btn-primary settings-save-button" onClick={handleSave} disabled={saving || loading || !hasChanges}>
          <Save size={18} />
          {saving ? 'Saving' : hasChanges ? 'Save' : 'Saved'}
        </button>
      </header>

      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isActive = section.id === activeConfig.id;

            return (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-item ${isActive ? 'is-active' : ''}`}
                onClick={() => setActiveSection(section.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="settings-nav-icon"><Icon size={18} /></span>
                <span>{section.title}</span>
              </button>
            );
          })}
        </nav>

        <section className="settings-panel" aria-labelledby={`settings-${activeConfig.id}-title`}>
          <div className="settings-panel-head">
            <div className="settings-title-block">
              <span className="settings-section-count">{activeSectionIndex}/{SECTIONS.length}</span>
              <h2 id={`settings-${activeConfig.id}-title`}>{activeConfig.title}</h2>
            </div>

            {activeConfig.id === 'grading' && (
              <span className={`settings-status-pill ${gradingTotal === 100 ? 'is-good' : 'is-warning'}`}>
                {gradingTotal}% total
              </span>
            )}

            {activeConfig.id === 'email' && (
              <span className="settings-status-pill">
                <Mail size={14} /> SMTP
              </span>
            )}
          </div>

          <div className={`settings-field-grid settings-field-grid-${activeConfig.id}`}>
            {activeConfig.fields.map(field => (
              <div key={field.key} className={`settings-field ${field.suffix ? 'has-suffix' : ''}`}>
                <label htmlFor={`setting-${field.key}`}>{field.label}</label>
                <div className="settings-control-wrap">
                  {renderControl(field)}
                  {field.suffix && <span className="settings-suffix">{field.suffix}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="settings-panel-footer">
            <span className={`settings-change-state ${hasChanges ? 'is-dirty' : ''}`}>
              <CheckCircle size={15} />
              {hasChanges ? 'Unsaved changes' : 'Up to date'}
            </span>
            <button className="btn btn-primary settings-mobile-save" onClick={handleSave} disabled={saving || loading || !hasChanges}>
              <Save size={17} />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </section>
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

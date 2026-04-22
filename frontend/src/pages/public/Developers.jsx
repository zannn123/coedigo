import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Link2, Mail } from 'lucide-react';
import ThemeToggleButton from '../../components/theme/ThemeToggleButton';
import './Developers.css';

function DeveloperPhoto({ src, alt, initials, position = 'center center' }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="developer-photo-shell">
      <div className="developer-photo-fallback" aria-hidden={failed ? 'false' : 'true'}>
        <span>{initials}</span>
      </div>
      {!failed && (
        <img
          src={src}
          alt={alt}
          className="developer-photo"
          style={{ objectPosition: position }}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

const developers = [
  {
    id: 'T',
    name: 'Meeko Pauleonard M. Tan',
    role: 'Project Manager',
    initials: 'MT',
    image: '/developers/tan.jpg',
    imagePosition: 'center 20%',
    description: 'Builds polished plan and sprints for COEDIGO, focusing on clear layouts, responsive behavior, and practical project implementation.',
    highlights: ['Project Manager', 'Data Analyst', 'Student experience'],
    socials: [
      { label: 'Email', value: 'meekotan12@gmail.com', href: 'mailto:meekotan12@gmail.com', icon: Mail },
    ],
  },
  {
    id: 'E',
    name: 'Reah Ex',
    role: 'Documentation and Design Support',
    initials: 'RE',
    image: '/developers/ex.jpg',
    imagePosition: 'center 18%',
    description: 'Supports the team with structured presentation, visual clarity, and project-facing communication across the COEDIGO experience.',
    highlights: ['Documentation', 'Visual support', 'Project presentation'],
    socials: [
      { label: 'Email', value: 'imreahex@gmail.com', href: 'mailto:imreahex@gmail.com', icon: Mail },
    ],
  },
  {
    id: 'A',
    name: 'Gloryzann H. Aclao',
    role: 'Future EnYEARNhiro',
    initials: 'GA',
    image: '/developers/aclao.jpg',
    imagePosition: 'center 24%',
    description: 'Leads full-stack implementation across the platform, connecting academic workflows, backend logic, and interface decisions into one working system.',
    highlights: ['Healer', 'Backburner', 'Safest Option'],
    socials: [
      { label: 'LinkedIn', value: 'linkedin.com/in/gloryzann-aclao-025421366', href: 'https://www.linkedin.com/in/gloryzann-aclao-025421366/', icon: Link2 },
      { label: 'GitHub', value: 'github.com/zannn123', href: 'https://github.com/zannn123', icon: Link2 },
      { label: 'Email', value: 'aclaogloryzann30@gmail.com', href: 'mailto:aclaogloryzann30@gmail.com', icon: Mail },
    ],
  },
];

export default function Developers() {
  return (
    <div className="developer-page animate-in">
      <ThemeToggleButton className="theme-toggle-floating developer-theme-toggle" />
      <section className="developer-hero">
        <div className="developer-hero-inner">
          <Link to="/login" className="developer-back-link">
            <ArrowLeft size={16} />
            <span>Back to Login</span>
          </Link>

          <div className="developer-brand-row">
            <img src="/coedigo-brand-logo.png" alt="COEDIGO" className="developer-brand-logo" />
            <span>C.O.E.D.I.G.O.</span>
          </div>

          <div className="developer-hero-copy">
            <span className="developer-eyebrow">Development Team</span>
            <h1>Meet the Developers</h1>
            <p>
              Get to know the minds and hearts that crafted this digital hub for the JRMSU College of Engineering community.
            </p>
          </div>
        </div>
      </section>

      <section className="developer-section">
        <div className="developer-card-grid">
          {developers.map(member => (
            <article key={member.name} className="developer-card">
              <DeveloperPhoto
                src={member.image}
                alt={member.name}
                initials={member.initials}
                position={member.imagePosition}
              />

              <div className="developer-card-title">
                <h2>{member.name}</h2>
                <span>{member.role}</span>
              </div>

              <p className="developer-card-description">{member.description}</p>

              <div className="developer-highlight-list">
                {member.highlights.map(item => (
                  <span key={`${member.name}-${item}`} className="developer-highlight-pill">{item}</span>
                ))}
              </div>

              <div className="developer-social-list">
                {member.socials.map(item => {
                  const Icon = item.icon;
                  return (
                    <a key={`${member.name}-${item.label}`} href={item.href} className="developer-social-link" target="_blank" rel="noreferrer">
                      <span className="developer-social-icon" aria-hidden="true">
                        <Icon size={15} />
                      </span>
                      <span className="developer-social-copy">
                        <strong>{item.label}</strong>
                        <small>{item.value}</small>
                      </span>
                    </a>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

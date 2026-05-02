import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Link2, Mail } from 'lucide-react';
import ThemeToggleButton from '../../components/theme/ThemeToggleButton';
import './Developers.css';

function DeveloperPhoto({ src, alt, initials, position = 'center center' }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="developer-photo-shell">
      {failed ? (
        <div className="developer-photo-fallback">
          <span>{initials}</span>
        </div>
      ) : (
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
    id: '01',
    name: 'Meeko Pauleonard M. Tan',
    role: 'Project Manager / Data Analyst',
    initials: 'MT',
    image: '/developers/tan.jpg',
    imagePosition: 'center 20%',
    description: 'Coordinates planning, requirements, and delivery priorities so the system stays focused on usable academic workflows.',
    highlights: ['Project planning', 'Data analysis', 'User flow review'],
    socials: [
      { label: 'Email', value: 'meekotan12@gmail.com', href: 'mailto:meekotan12@gmail.com', icon: Mail },
    ],
  },
  {
    id: '02',
    name: 'Reah Ex',
    role: 'Documentation / Design Support',
    initials: 'RE',
    image: '/developers/ex.jpg',
    imagePosition: 'center 18%',
    description: 'Shapes documentation and presentation details, keeping project communication clear, consistent, and easy to follow.',
    highlights: ['Documentation', 'Visual QA', 'Presentation support'],
    socials: [
      { label: 'Email', value: 'imreahex@gmail.com', href: 'mailto:imreahex@gmail.com', icon: Mail },
    ],
  },
  {
    id: '03',
    name: 'Gloryzann H. Aclao',
    role: 'Full-Stack Developer',
    initials: 'GA',
    image: '/developers/aclao.jpg',
    imagePosition: 'center 24%',
    description: 'Builds the full-stack implementation, connecting interface behavior, backend logic, and database workflows into one working product.',
    highlights: ['Frontend engineering', 'Backend integration', 'Database workflows'],
    socials: [
      { label: 'LinkedIn', value: 'gloryzann-aclao', href: 'https://www.linkedin.com/in/gloryzann-aclao-025421366/', icon: Link2 },
      { label: 'GitHub', value: '@zannn123', href: 'https://github.com/zannn123', icon: Link2 },
      { label: 'Email', value: 'aclaogloryzann30@gmail.com', href: 'mailto:aclaogloryzann30@gmail.com', icon: Mail },
    ],
  },
];

const teamCapabilities = [
  'Product planning',
  'Interface design',
  'Backend integration',
  'Project documentation',
];

export default function Developers() {
  return (
    <div className="developer-page animate-in">
      <header className="developer-topbar">
        <Link to="/login" className="developer-back-link">
          <ArrowLeft size={16} />
          <span>Back to Login</span>
        </Link>

        <div className="developer-brand-row" aria-label="COEDIGO">
          <img src="/coedigo-brand-logo.png" alt="" className="developer-brand-logo" />
          <span>C.O.E.D.I.G.O.</span>
        </div>

        <ThemeToggleButton compact className="developer-theme-toggle" />
      </header>

      <main>
        <section className="developer-hero" aria-labelledby="developer-title">
          <div className="developer-hero-copy">
            <span className="developer-eyebrow">Development Team</span>
            <h1 id="developer-title">Meet the team behind COEDIGO.</h1>
            <p>
              A focused group building a cleaner grading and class-management experience for the JRMSU College of Engineering community.
            </p>
          </div>

          <div className="developer-capability-row" aria-label="Team capabilities">
            {teamCapabilities.map(item => (
              <span key={item}>{item}</span>
            ))}
          </div>

          <div className="developer-photo-rail" aria-label="Developer portraits">
            {developers.map(member => (
              <div key={`${member.name}-portrait`} className="developer-portrait-preview">
                <DeveloperPhoto
                  src={member.image}
                  alt={member.name}
                  initials={member.initials}
                  position={member.imagePosition}
                />
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.role}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="developer-section" aria-label="Developer profiles">
          <div className="developer-section-header">
            <span>Profiles</span>
            <h2>Built with clear ownership.</h2>
          </div>

          <div className="developer-card-grid">
          {developers.map(member => (
            <article key={member.name} className="developer-card">
              <div className="developer-card-media">
                <DeveloperPhoto
                  src={member.image}
                  alt={member.name}
                  initials={member.initials}
                  position={member.imagePosition}
                />
              </div>

              <div className="developer-card-body">
                <div className="developer-card-kicker">
                  <span>{member.id}</span>
                  <small>{member.role}</small>
                </div>

                <div className="developer-card-title">
                  <h3>{member.name}</h3>
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
                    const isExternal = !item.href.startsWith('mailto:');

                    return (
                      <a
                        key={`${member.name}-${item.label}`}
                        href={item.href}
                        className="developer-social-link"
                        target={isExternal ? '_blank' : undefined}
                        rel={isExternal ? 'noreferrer' : undefined}
                        aria-label={`${item.label}: ${item.value}`}
                      >
                        <span className="developer-social-icon" aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <span className="developer-social-copy">
                          <strong>{item.label}</strong>
                          <small>{item.value}</small>
                        </span>
                        {isExternal && <ArrowUpRight size={15} aria-hidden="true" className="developer-social-arrow" />}
                      </a>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
          </div>
        </section>
      </main>
    </div>
  );
}

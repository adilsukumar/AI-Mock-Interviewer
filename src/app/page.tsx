'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Briefcase, Award, Sparkles, ArrowRight, Building } from 'lucide-react';

const COMMON_ROLES = [
  "Software Engineer",
  "Product Manager",
  "Data Scientist",
  "UI/UX Designer",
  "Marketing Manager",
  "Sales Executive",
  "Financial Analyst",
  "HR Manager",
  "Customer Success Manager",
  "Other (Custom)"
];

const EXPERIENCE_LEVELS = [
  "Internship",
  "Entry-Level / Junior",
  "Mid-Level",
  "Senior",
  "Lead",
  "Staff / Principal",
  "Manager",
  "Director"
];

const COMPANIES = [
  "General (No specific company)",
  "Google",
  "Meta",
  "Amazon",
  "Apple",
  "Netflix",
  "Microsoft",
  "Stripe",
  "Uber",
  "Tesla"
];

export default function Home() {
  const router = useRouter();
  const [roleSelect, setRoleSelect] = useState('Software Engineer');
  const [customRole, setCustomRole] = useState('');
  const [level, setLevel] = useState('Mid-Level');
  const [company, setCompany] = useState('General (No specific company)');
  const [searchParamsKey, setSearchParamsKey] = useState('');
  const [isHovering, setIsHovering] = useState(false);

  const startInterview = (e: React.FormEvent) => {
    e.preventDefault();
    const finalRole = roleSelect === 'Other (Custom)' ? customRole : roleSelect;
    if (!finalRole.trim()) return;
    
    let url = `/interview?role=${encodeURIComponent(finalRole)}&level=${encodeURIComponent(level)}&company=${encodeURIComponent(company)}`;
    if (searchParamsKey.trim()) {
      url += `&elevenLabsKey=${encodeURIComponent(searchParamsKey.trim())}`;
    }
    
    router.push(url);
  };

  return (
    <main style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '40px 20px', overflow: 'hidden' }}>
      
      {/* Background Orbs */}
      <div style={{ position: 'absolute', top: '10%', left: '-5%', width: '30vw', height: '30vw', background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 60%)', borderRadius: '50%', zIndex: 0, filter: 'blur(60px)' }}></div>
      <div style={{ position: 'absolute', bottom: '10%', right: '-5%', width: '40vw', height: '40vw', background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 60%)', borderRadius: '50%', zIndex: 0, filter: 'blur(70px)' }}></div>

      <div style={{ zIndex: 1, width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '60px' }}>
        
        {/* Left Side: Branding / Hero */}
        <div style={{ flex: '1 1 400px', textAlign: 'left', animation: 'slideIn 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
             <div className="orb-container" style={{ width: '80px', height: '80px', margin: '0 20px 0 0' }}>
               <div className="voice-orb" style={{ width: '50px', height: '50px', animation: 'float 3s infinite ease-in-out' }}></div>
               <div className="orb-ring-1" style={{ width: '100px', height: '100px', animation: 'ripple 3s infinite linear' }}></div>
             </div>
             <div style={{ padding: '8px 16px', background: 'rgba(139, 92, 246, 0.15)', borderRadius: '20px', border: '1px solid rgba(139, 92, 246, 0.3)', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
               Powered by Llama 3.3
             </div>
          </div>
          
          <h1 className="title-responsive">
            Master Your Next <br /> Interview
          </h1>
          <p className="subtitle-responsive" style={{ maxWidth: '500px' }}>
            Experience a hyper-realistic, conversational AI interview. No typing required. Just configure your role, turn on your mic, and practice naturally.
          </p>
        </div>

        {/* Right Side: Configuration Panel */}
        <div className="glass-panel" style={{ flex: '1 1 400px', width: '100%', maxWidth: '600px', padding: '40px', animation: 'slideIn 1s cubic-bezier(0.175, 0.885, 0.32, 1.275)', background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.2) 100%)' }}>
          <form onSubmit={startInterview}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
              <Sparkles color="var(--accent-secondary)" size={24} />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Customize Session</h2>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Role Selection */}
              <div>
                <label className="label" htmlFor="roleSelect" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Briefcase size={16} color="var(--text-secondary)" /> Target Role
                </label>
                <div className="select-wrapper">
                  <select 
                    id="roleSelect"
                    className="input-field" 
                    value={roleSelect} 
                    onChange={(e) => setRoleSelect(e.target.value)}
                    style={{ cursor: 'pointer', appearance: 'none', margin: 0 }}
                  >
                    {COMMON_ROLES.map(r => (
                      <option key={r} value={r} style={{ background: '#0f172a' }}>{r}</option>
                    ))}
                  </select>
                </div>

                {roleSelect === 'Other (Custom)' && (
                  <div style={{ marginTop: '16px', animation: 'slideIn 0.3s ease-out' }}>
                    <label className="label" htmlFor="customRole" style={{ marginBottom: '8px', display: 'block' }}>Specify Custom Role</label>
                    <input 
                      id="customRole"
                      className="input-field" 
                      type="text" 
                      value={customRole} 
                      onChange={(e) => setCustomRole(e.target.value)}
                      placeholder="e.g. Space Operations Commander"
                      style={{ margin: 0 }}
                      required
                    />
                  </div>
                )}
              </div>
              
              {/* Experience Level Selection */}
              <div>
                <label className="label" htmlFor="level" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Award size={16} color="var(--text-secondary)" /> Experience Level
                </label>
                <div className="select-wrapper">
                  <select 
                    id="level"
                    className="input-field" 
                    value={level} 
                    onChange={(e) => setLevel(e.target.value)}
                    style={{ cursor: 'pointer', appearance: 'none', margin: 0 }}
                  >
                    {EXPERIENCE_LEVELS.map(l => (
                      <option key={l} value={l} style={{ background: '#0f172a' }}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Company Selection */}
              <div>
                <label className="label" htmlFor="company" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Building size={16} color="var(--text-secondary)" /> Target Company (Optional)
                </label>
                <div className="select-wrapper">
                  <select 
                    id="company"
                    className="input-field" 
                    value={company} 
                    onChange={(e) => setCompany(e.target.value)}
                    style={{ cursor: 'pointer', appearance: 'none', margin: 0 }}
                  >
                    {COMPANIES.map(c => (
                      <option key={c} value={c} style={{ background: '#0f172a' }}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

            </div>
            
            {/* Submit Button */}
            <div style={{ marginTop: '40px' }}>
              <button 
                type="submit" 
                className="btn-primary" 
                style={{ 
                  width: '100%', 
                  padding: '18px', 
                  fontSize: '1.15rem', 
                  borderRadius: '16px',
                  background: isHovering 
                    ? 'linear-gradient(135deg, var(--accent-secondary), var(--accent-tertiary))' 
                    : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  transition: 'all 0.4s ease'
                }}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
              >
                Start Interview <ArrowRight size={20} style={{ marginLeft: '8px' }} />
              </button>
            </div>

          </form>
        </div>

      </div>
    </main>
  );
}

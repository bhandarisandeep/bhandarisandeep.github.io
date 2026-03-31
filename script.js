// ===== Data from Resume =====
const skills = [
  { name: 'Web App Security Review', icon: '🌐', level: 95 },
  { name: 'Threat Modelling', icon: '🎯', level: 92 },
  { name: 'Android/iOS Security', icon: '📱', level: 90 },
  { name: 'Source Code Review', icon: '🔍', level: 88 },
  { name: 'AI Prompt Engineering', icon: '🤖', level: 85 },
  { name: 'RAG Model Creation', icon: '🧠', level: 82 },
];

const experience = [
  {
    company: 'Amazon India',
    role: 'Security Engineer',
    period: '02/2023 — Present',
    location: 'Bengaluru, India',
    bullets: [
      'Conducted comprehensive threat modelling for web, mobile, and backend services, identifying risks across application logic, infrastructure, and cloud resources.',
      'Partnered with engineering teams to triage and remediate security vulnerabilities, enabling secure-by-default development practices.',
      'Performed secure code reviews and business logic assessments across high-impact applications, identifying authorization flaws, data leakage, and privilege escalation.',
      'Leveraged AI/ML tools and custom automation frameworks to accelerate threat detection and vulnerability triage across large-scale systems.',
      'Supported mobile application security assessments focusing on reverse engineering, dynamic analysis, and mitigating insecure data storage and SDK misconfigurations.',
      'Designed and maintained a fraud prevention system for the Ads ecosystem using advanced heuristics and behavioral analysis.',
      'Organized Capture the Flag (CTF) events during internal security conferences to foster a security-first culture.',
      'Drove DevSecOps adoption by embedding security checks into CI/CD pipelines.',
      'Hunt high-impact, scalable security issues from bug bounty data. Identify patterns for centralized fixes. Approach teams to fix at scale.'
    ]
  },
  {
    company: 'OLA Cabs (ANI Technologies)',
    role: 'Senior Product Security Engineer',
    period: '01/2022 — 02/2023',
    location: 'Bengaluru, India',
    bullets: [
      'Led Product Security Design Reviews including architectural assessments, threat modeling, and security posture evaluations for web and mobile platforms (iOS & Android).',
      'Conducted black-box and grey-box security testing aligned with OWASP Top 10 standards.',
      'Specialized in mobile security using Frida, MobSF, Objection, and Burp Suite to exploit insecure storage, runtime manipulation, and reverse engineering weaknesses.',
      'Implemented runtime instrumentation using Frida to bypass root/jailbreak detection, SSL pinning, and monitor sensitive API calls.',
      'Automated vulnerability detection across the organization using custom scripts, enhancing visibility in CI/CD pipelines.',
    ]
  },
  {
    company: 'Synopsys, Inc',
    role: 'Associate Security Consultant',
    period: '12/2018 — 01/2022',
    location: 'Bengaluru, India',
    bullets: [
      'Performed DAST and manual security assessments using Burp Suite, Nessus, AppScan, Metasploit, SqlMap, Nmap, OpenVAS, Nikto, and Dirb.',
      'Identified injection flaws, broken access controls, misconfigurations, and custom business logic issues, prioritizing by business impact.',
      'Conducted black-box and grey-box testing aligned with OWASP Top 10 and internal risk frameworks.',
      'Delivered technical reports and executive summaries outlining risk impact, exploitability, and tailored mitigation strategies.',
      'Engaged in continuous learning on mobile penetration testing, secure SDLC, cloud configuration reviews, and threat modelling.',
    ]
  }
];

const education = [
  {
    type: 'Post-Graduation',
    degree: 'M. Tech — AI & ML in ARVr Technologies',
    institution: 'IIT Jodhpur',
    gpa: '7 / 10'
  },
  {
    type: 'Graduation',
    degree: 'B. Tech — Computer Science (Cyber Security & Forensics)',
    institution: 'University of Petroleum and Energy Studies (UPES)',
    gpa: '7.76 / 10'
  }
];

// ===== Typing Effect =====
const phrases = [
  'Securing applications, one vulnerability at a time.',
  'Threat modeling · Code review · Pen testing',
  '7 years in Application & Product Security',
  'Building secure-by-default systems'
];

let phraseIdx = 0, charIdx = 0, deleting = false;
const typedEl = document.getElementById('typed-text');

function typeLoop() {
  const current = phrases[phraseIdx];
  if (!deleting) {
    typedEl.textContent = current.substring(0, charIdx + 1);
    charIdx++;
    if (charIdx === current.length) {
      deleting = true;
      setTimeout(typeLoop, 2000);
      return;
    }
    setTimeout(typeLoop, 50);
  } else {
    typedEl.textContent = current.substring(0, charIdx - 1);
    charIdx--;
    if (charIdx === 0) {
      deleting = false;
      phraseIdx = (phraseIdx + 1) % phrases.length;
    }
    setTimeout(typeLoop, 30);
  }
}
typeLoop();

// ===== Intersection Observer =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

// ===== Populate Skills =====
const skillsContainer = document.getElementById('skills-container');
skills.forEach(skill => {
  const el = document.createElement('div');
  el.className = 'skill-card';
  el.innerHTML = `
    <div class="skill-header">
      <div class="skill-icon">${skill.icon}</div>
      <h3>${skill.name}</h3>
    </div>
    <div class="skill-bar-track">
      <div class="skill-bar-fill" style="--level: ${skill.level}%"></div>
    </div>
  `;
  skillsContainer.appendChild(el);
  observer.observe(el);
});

// ===== Populate Experience =====
const expContainer = document.getElementById('experience-container');
experience.forEach(exp => {
  const el = document.createElement('div');
  el.className = 'timeline-item';
  el.innerHTML = `
    <div class="timeline-dot"></div>
    <h3>${exp.company}</h3>
    <div class="timeline-meta">
      <span class="timeline-role">${exp.role}</span>
      <span class="timeline-period">${exp.period}</span>
      <span class="timeline-location">📍 ${exp.location}</span>
    </div>
    <ul class="timeline-bullets">
      ${exp.bullets.map(b => `<li>${b}</li>`).join('')}
    </ul>
  `;
  expContainer.appendChild(el);
  observer.observe(el);
});

// ===== Populate Education =====
const eduContainer = document.getElementById('education-container');
education.forEach(edu => {
  const el = document.createElement('div');
  el.className = 'edu-card';
  el.innerHTML = `
    <div class="edu-type">${edu.type}</div>
    <h3>${edu.degree}</h3>
    <div class="edu-institution">${edu.institution}</div>
    <div class="edu-gpa">GPA: ${edu.gpa}</div>
  `;
  eduContainer.appendChild(el);
  observer.observe(el);
});

// ===== Navbar Scroll =====
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// ===== Mobile Nav Toggle =====
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.querySelector('.nav-links');
navToggle.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});
navLinks.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => navLinks.classList.remove('open'));
});

// ===== Matrix / Particle Background =====
const canvas = document.getElementById('matrix-bg');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Floating particles
const particles = [];
const PARTICLE_COUNT = 60;

for (let i = 0; i < PARTICLE_COUNT; i++) {
  particles.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    vx: (Math.random() - 0.5) * 0.4,
    vy: (Math.random() - 0.5) * 0.4,
    size: Math.random() * 2 + 0.5,
    opacity: Math.random() * 0.5 + 0.1
  });
}

function drawParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw connections
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 150) {
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.06 * (1 - dist / 150)})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  // Draw & update particles
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 240, 255, ${p.opacity})`;
    ctx.fill();

    p.x += p.vx;
    p.y += p.vy;

    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
  });

  requestAnimationFrame(drawParticles);
}

drawParticles();

// ===== Dynamic Footer Year =====
document.getElementById('footer-year').textContent = new Date().getFullYear();

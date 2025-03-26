// Data
const skills = [
  { name: 'Penetration Testing', icon: 'terminal', level: 95 },
  { name: 'Risk Assessment', icon: 'shield', level: 90 },
  { name: 'Secure Code Review', icon: 'code-2', level: 85 },
  { name: 'Threat Modeling', icon: 'bug', level: 92 },
  { name: 'Cloud Security', icon: 'cloud', level: 88 },
  { name: 'Security Automation', icon: 'bot', level: 82 },
];

const projects = [
  {
    name: 'Fireball',
    description: 'Internal security assessment portal for streamlined vulnerability management and reporting.',
    tech: ['Python', 'React', 'GraphQL', 'Docker'],
    link: 'https://github.com/username/fireball'
  },
  {
    name: 'Mail Automation',
    description: 'Automated security scanning and reporting system for email infrastructure.',
    tech: ['Node.js', 'AWS Lambda', 'SendGrid API'],
    link: 'https://github.com/username/mail-automation'
  }
];

const experience = [
  {
    company: 'Amazon India',
    role: 'Senior Security Engineer',
    period: '2023 - Present',
    description: 'Lead application security initiatives and cloud security assessments.'
  },
  {
    company: 'Ola Cabs',
    role: 'Product Security Engineer',
    period: '2022 - 2023',
    description: 'Conducted security reviews and implemented automated security testing.'
  },
  {
    company: 'Synopsys',
    role: 'Security Consultant',
    period: '2019 - 2022',
    description: 'Performed dynamic application security testing and vulnerability assessments.'
  }
];

// Initialize Lucide icons
lucide.createIcons();

// Intersection Observer for skill bars animation
const observeElement = (element) => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('skill-bar');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  
  observer.observe(element);
};

// Populate Skills
const skillsContainer = document.getElementById('skills-container');
skills.forEach(skill => {
  const skillElement = document.createElement('div');
  skillElement.className = 'bg-gray-900 p-6 rounded-lg border border-cyan-800 hover:border-cyan-400 transition-colors animate-fade-in skill-container';
  skillElement.innerHTML = `
    <div class="flex items-center gap-4 mb-4">
      <div class="text-gradient">
        <i data-lucide="${skill.icon}" class="w-6 h-6"></i>
      </div>
      <h3 class="text-xl font-semibold text-gradient">${skill.name}</h3>
    </div>
    <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
      <div 
        class="h-full rounded-full"
        style="--skill-level: ${skill.level}%"
        data-level="${skill.level}%"
      ></div>
    </div>
  `;
  skillsContainer.appendChild(skillElement);
  
  // Observe the skill bar
  const skillBar = skillElement.querySelector('.rounded-full');
  observeElement(skillBar);
});

// Populate Projects
const projectsContainer = document.getElementById('projects-container');
projects.forEach(project => {
  const projectElement = document.createElement('div');
  projectElement.className = 'group bg-gray-800 p-6 rounded-lg hover:bg-gray-750 transition-all duration-300 animate-fade-in hover-gradient';
  projectElement.innerHTML = `
    <h3 class="text-2xl font-bold mb-4 text-gradient">${project.name}</h3>
    <p class="mb-4 text-gray-300">${project.description}</p>
    <div class="flex flex-wrap gap-2 mb-4">
      ${project.tech.map(tech => `
        <span class="px-3 py-1 bg-gray-700 rounded-full text-sm">${tech}</span>
      `).join('')}
    </div>
    <a 
      href="${project.link}"
      class="inline-flex items-center gap-2 text-gradient hover:opacity-80"
      target="_blank"
      rel="noopener noreferrer"
    >
      <i data-lucide="github" class="w-5 h-5"></i>
      View Repository
    </a>
  `;
  projectsContainer.appendChild(projectElement);
});

// Populate Experience
const experienceContainer = document.getElementById('experience-container');
experience.forEach(exp => {
  const expElement = document.createElement('div');
  expElement.className = 'relative pl-8 border-l-2 border-gradient animate-fade-in';
  expElement.innerHTML = `
    <div class="absolute -left-[9px] top-0">
      <i data-lucide="timer" class="w-4 h-4 text-gradient"></i>
    </div>
    <h3 class="text-xl font-bold text-gradient">${exp.company}</h3>
    <p class="text-lg font-semibold mb-2">${exp.role}</p>
    <p class="text-gray-400 mb-2">${exp.period}</p>
    <p class="text-gray-300">${exp.description}</p>
  `;
  experienceContainer.appendChild(expElement);
});

// Reinitialize icons after dynamic content is added
lucide.createIcons();
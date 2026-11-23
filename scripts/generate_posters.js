const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const postersDir = path.join(__dirname, '../public/images/posters');
if (!fs.existsSync(postersDir)) {
  fs.mkdirSync(postersDir, { recursive: true });
}

const posters = [
  {
    slug: 'inception',
    title: 'INCEPTION',
    tagline: 'YOUR MIND IS THE SCENE OF THE CRIME',
    year: '2010',
    cert: 'UA',
    duration: '148m',
    grad1: '#020617',
    grad2: '#0e7490',
    accent: '#38bdf8',
    icon: `<circle cx="200" cy="260" r="110" stroke="#38bdf8" stroke-width="3" fill="none" opacity="0.3"/>
           <circle cx="200" cy="260" r="80" stroke="#38bdf8" stroke-width="2.5" fill="none" opacity="0.5"/>
           <circle cx="200" cy="260" r="50" stroke="#38bdf8" stroke-width="2" fill="none" opacity="0.7"/>
           <polygon points="200,210 215,260 200,310 185,260" fill="#38bdf8"/>`
  },
  {
    slug: 'interstellar',
    title: 'INTERSTELLAR',
    tagline: 'MANKIND WAS NOT MEANT TO DIE HERE',
    year: '2014',
    cert: 'UA',
    duration: '169m',
    grad1: '#030712',
    grad2: '#1e1b4b',
    accent: '#818cf8',
    icon: `<circle cx="200" cy="260" r="90" fill="#000" stroke="#818cf8" stroke-width="5"/>
           <ellipse cx="200" cy="260" rx="140" ry="30" stroke="#c084fc" stroke-width="4" fill="none" opacity="0.8"/>
           <circle cx="200" cy="260" r="6" fill="#fff"/>`
  },
  {
    slug: 'dark-knight',
    title: 'THE DARK KNIGHT',
    tagline: 'WHY SO SERIOUS?',
    year: '2008',
    cert: 'A',
    duration: '152m',
    grad1: '#09090b',
    grad2: '#18181b',
    accent: '#facc15',
    icon: `<path d="M120,240 C140,210 170,230 190,250 C195,235 205,235 210,250 C230,230 260,210 280,240 C280,270 250,290 200,310 C150,290 120,270 120,240 Z" fill="#facc15"/>`
  },
  {
    slug: 'oppenheimer',
    title: 'OPPENHEIMER',
    tagline: 'NOW I AM BECOME DEATH',
    year: '2023',
    cert: 'A',
    duration: '180m',
    grad1: '#451a03',
    grad2: '#7f1d1d',
    accent: '#f97316',
    icon: `<circle cx="200" cy="260" r="80" fill="url(#fireGlow)"/>
           <circle cx="200" cy="260" r="30" fill="#fff"/>
           <line x1="200" y1="140" x2="200" y2="380" stroke="#f97316" stroke-width="2" opacity="0.6"/>
           <line x1="80" y1="260" x2="320" y2="260" stroke="#f97316" stroke-width="2" opacity="0.6"/>`
  },
  {
    slug: 'dune-2',
    title: 'DUNE: PART TWO',
    tagline: 'LONG LIVE THE FIGHTERS',
    year: '2024',
    cert: 'UA',
    duration: '166m',
    grad1: '#451a03',
    grad2: '#b45309',
    accent: '#fbbf24',
    icon: `<circle cx="160" cy="210" r="45" fill="#fef08a" opacity="0.7"/>
           <circle cx="240" cy="235" r="25" fill="#fed7aa" opacity="0.5"/>
           <path d="M60,330 Q200,240 340,330 L340,360 L60,360 Z" fill="#78350f"/>
           <path d="M60,300 Q150,250 340,320 L340,360 L60,360 Z" fill="#92400e" opacity="0.8"/>`
  },
  {
    slug: 'gladiator-2',
    title: 'GLADIATOR II',
    tagline: 'WHAT WE DO IN LIFE ECHOES IN ETERNITY',
    year: '2024',
    cert: 'A',
    duration: '148m',
    grad1: '#4c0519',
    grad2: '#881337',
    accent: '#fb7185',
    icon: `<rect x="195" y="170" width="10" height="150" fill="#e2e8f0"/>
           <polygon points="200,150 208,170 192,170" fill="#f8fafc"/>
           <rect x="170" y="270" width="60" height="12" rx="4" fill="#fbbf24"/>
           <circle cx="200" cy="300" r="10" fill="#fbbf24"/>`
  },
  {
    slug: 'avatar-3',
    title: 'AVATAR: FIRE & ASH',
    tagline: 'RETURN TO PANDORA',
    year: '2025',
    cert: 'UA',
    duration: '192m',
    grad1: '#083344',
    grad2: '#991b1b',
    accent: '#06b6d4',
    icon: `<path d="M100,260 Q200,180 300,260 Q200,230 100,260 Z" fill="#06b6d4"/>
           <circle cx="200" cy="260" r="25" fill="#ef4444" opacity="0.8"/>
           <circle cx="200" cy="260" r="10" fill="#fef08a"/>`
  },
  {
    slug: 'spider-verse',
    title: 'SPIDER-MAN',
    tagline: 'BEYOND THE SPIDER-VERSE',
    year: '2025',
    cert: 'U',
    duration: '140m',
    grad1: '#3b0764',
    grad2: '#be185d',
    accent: '#ec4899',
    icon: `<circle cx="200" cy="260" r="70" stroke="#ec4899" stroke-width="4" fill="none"/>
           <path d="M160,240 Q200,280 240,240 Q200,260 160,240 Z" fill="#f43f5e"/>
           <line x1="200" y1="190" x2="200" y2="330" stroke="#38bdf8" stroke-width="2"/>
           <line x1="130" y1="260" x2="270" y2="260" stroke="#38bdf8" stroke-width="2"/>`
  },
  {
    slug: 'titanic',
    title: 'TITANIC',
    tagline: 'NOTHING ON EARTH COULD COME BETWEEN THEM',
    year: '1997',
    cert: 'UA',
    duration: '195m',
    grad1: '#0c4a6e',
    grad2: '#0284c7',
    accent: '#38bdf8',
    icon: `<polygon points="200,180 280,310 120,310" fill="#38bdf8" opacity="0.8"/>
           <polygon points="200,200 260,310 140,310" fill="#0369a1"/>
           <circle cx="200" cy="150" r="5" fill="#fff"/>`
  },
  {
    slug: 'avengers-endgame',
    title: 'AVENGERS: ENDGAME',
    tagline: 'PART OF THE JOURNEY IS THE END',
    year: '2019',
    cert: 'UA',
    duration: '181m',
    grad1: '#1e1b4b',
    grad2: '#581c87',
    accent: '#eab308',
    icon: `<circle cx="200" cy="260" r="85" stroke="#eab308" stroke-width="6" fill="none"/>
           <polygon points="200,195 240,300 215,300 205,270 195,270 185,300 160,300" fill="#eab308"/>
           <rect x="188" y="255" width="24" height="6" fill="#1e1b4b"/>`
  },
  {
    slug: 'fallback',
    title: 'CINESEAT CINEMA',
    tagline: 'PREMIERE THEATER EXPERIENCE',
    year: '2026',
    cert: 'UA',
    duration: 'FEATURE',
    grad1: '#09090b',
    grad2: '#27272a',
    accent: '#f59e0b',
    icon: `<rect x="140" y="210" width="120" height="90" rx="8" fill="#f59e0b" opacity="0.9"/>
           <circle cx="200" cy="255" r="22" fill="#18181b"/>
           <polygon points="195,245 210,255 195,265" fill="#f59e0b"/>`
  }
];

function generateSvg(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.grad1}"/>
      <stop offset="100%" stop-color="${p.grad2}"/>
    </linearGradient>
    <radialGradient id="fireGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fdba74"/>
      <stop offset="70%" stop-color="#ea580c"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="400" height="600" fill="url(#bgGrad)"/>
  
  <!-- Subtle Grid texture -->
  <line x1="20" y1="20" x2="380" y2="20" stroke="${p.accent}" stroke-width="1" opacity="0.2"/>
  <line x1="20" y1="580" x2="380" y2="580" stroke="${p.accent}" stroke-width="1" opacity="0.2"/>
  <line x1="20" y1="20" x2="20" y2="580" stroke="${p.accent}" stroke-width="1" opacity="0.2"/>
  <line x1="380" y1="20" x2="380" y2="580" stroke="${p.accent}" stroke-width="1" opacity="0.2"/>

  <!-- Top Badges -->
  <rect x="35" y="35" width="42" height="22" rx="4" fill="#0f172a" stroke="${p.accent}" stroke-width="1"/>
  <text x="56" y="50" font-family="'Inter', sans-serif" font-size="11" font-weight="bold" fill="${p.accent}" text-anchor="middle">${p.cert}</text>

  <rect x="305" y="35" width="60" height="22" rx="4" fill="#0f172a" stroke="${p.accent}" stroke-width="1"/>
  <text x="335" y="50" font-family="'Inter', sans-serif" font-size="11" font-weight="bold" fill="#f8fafc" text-anchor="middle">${p.duration}</text>

  <!-- Central Artwork Icon -->
  <g>
    ${p.icon}
  </g>

  <!-- Cinema Brand Tag -->
  <text x="200" y="440" font-family="'Inter', sans-serif" font-size="11" font-weight="700" fill="${p.accent}" letter-spacing="4" text-anchor="middle">CINESEAT EXCLUSIVE</text>

  <!-- Title -->
  <text x="200" y="475" font-family="'Inter', sans-serif" font-size="24" font-weight="900" fill="#ffffff" letter-spacing="2" text-anchor="middle">${p.title}</text>

  <!-- Tagline -->
  <text x="200" y="505" font-family="'Inter', sans-serif" font-size="9" font-weight="600" fill="#94a3b8" letter-spacing="1.5" text-anchor="middle">${p.tagline}</text>

  <!-- Bottom Details -->
  <text x="200" y="555" font-family="'Inter', sans-serif" font-size="11" font-weight="bold" fill="${p.accent}" text-anchor="middle">IN THEATERS &bull; ${p.year}</text>
</svg>`;
}

async function run() {
  for (const p of posters) {
    const svgContent = generateSvg(p);
    const svgPath = path.join(postersDir, `${p.slug}.svg`);
    const jpgPath = path.join(postersDir, `${p.slug}.jpg`);

    fs.writeFileSync(svgPath, svgContent, 'utf8');
    // Also write .jpg file containing SVG so both URLs work seamlessly!
    fs.writeFileSync(jpgPath, svgContent, 'utf8');
  }

  console.log(`Generated ${posters.length} posters in ${postersDir}`);

  // Update movies table in DB to use .svg
  await pool.query(`UPDATE movies SET poster_path = CONCAT('/images/posters/', slug, '.svg')`);
  console.log('Updated movies.poster_path to .svg format');

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

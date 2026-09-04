export const PROFILE = {
  name: 'Ammar Mian',
  role: 'Associate professor (Maître de conférences)',
  affiliation: 'LISTIC, Polytech Annecy-Chambéry, Université Savoie Mont-Blanc',
  bio: 'In the world outside the tower: associate professor at LISTIC (Université Savoie Mont-Blanc), working on statistical signal processing and Riemannian-geometry methods for robust and remote-sensing problems.',
  positions: [
    { role: 'Maître de conférences', org: 'LISTIC, Polytech Annecy-Chambéry, Université Savoie Mont-Blanc', year: '2020—' },
    { role: 'Post-doctorant', org: 'Aalto University, Finland — Riemannian geometry for statistical learning, with Esa Ollila', year: '2019—2020' },
    { role: 'Doctorant', org: 'SONDRA, Université Paris-Saclay — SAR image time-series analysis', year: '2016—2019' },
  ],
  education: [
    { role: 'Doctorat', org: "Contributions à l'analyse de séries temporelles d'images SAR — SONDRA, Université Paris-Saclay", year: '2019' },
    { role: "Diplôme d'ingénieur", org: 'Grenoble INP – Phelma, Traitement du Signal', year: '2016' },
  ],
} as const;

export const CONTACT = {
  email: 'ammar.mian@univ-smb.fr',
  office: 'LISTIC, Polytech Annecy-Chambéry, Université Savoie Mont-Blanc, Annecy',
  hal: 'https://hal.science/search/index/?q=*&authIdHal_s=ammar-mian',
  github: 'https://github.com/ammarmian',
  website: 'https://ammarmian.github.io',
} as const;

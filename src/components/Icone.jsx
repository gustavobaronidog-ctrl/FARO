// Ícones de traço, desenhados à mão para o Faro
const caminhos = {
  hoje: <><path d="M12 3c2.5 3 4 5.2 4 7.5A4 4 0 0 1 8 10.5C8 9 8.7 7.8 9.5 7c.3 1.6 1.2 2.6 2.5 3 .2-2.6-.2-4.8 0-7z"/><path d="M6 15.5c0 3.6 2.7 5.5 6 5.5s6-1.9 6-5.5c0-1.3-.4-2.5-1-3.5"/></>,
  radar: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6-6"/><circle cx="12" cy="12" r="1" fill="currentColor"/></>,
  funil: <><path d="M3 5h18l-7 8v6l-4 2v-8z"/></>,
  scripts: <><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></>,
  cacada: <><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="2"/></>,
  aprendizado: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="M15 6l3-3 3 3M18 3v6"/></>,
  ajustes: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></>,
  telefone: <><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></>,
  whats: <><path d="M4 20l1.3-4A8 8 0 1 1 8 18.8z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z" fill="currentColor" stroke="none"/></>,
  fechar: <><path d="M6 6l12 12M18 6L6 18"/></>,
  busca: <><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></>,
  mais: <><path d="M12 5v14M5 12h14"/></>,
  raio: <><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></>,
  check: <><path d="M5 12l5 5 9-10"/></>,
  externo: <><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></>,
  girar: <><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/></>,
  copiar: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>,
  faisca: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/></>,
  pino: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></>,
  globo: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></>,
  insta: <><rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.5"/><circle cx="17" cy="7" r=".8" fill="currentColor"/></>,
  lixo: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></>,
  sair: <><path d="M10 4H5v16h5M15 8l4 4-4 4M9 12h10"/></>,
  equipe: <><circle cx="9" cy="8" r="3.5"/><path d="M2 20c.5-3.5 3.3-5.5 7-5.5s6.5 2 7 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2.2.6 3.6 2.4 4 5.4"/></>,
  seta: <><path d="M9 6l6 6-6 6"/></>,
  voltar: <><path d="M15 6l-6 6 6 6"/></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>,
  nota: <><path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/></>,
};

export default function Icone({ nome, tam = 18, ...resto }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...resto}>
      {caminhos[nome]}
    </svg>
  );
}

export function Marca({ tam = 30 }) {
  // um focinho estilizado sobre as ondas de calor: o "faro"
  return (
    <svg width={tam} height={tam} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="faro-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#3E7CB1" /><stop offset=".55" stopColor="#F0A13A" /><stop offset="1" stopColor="#E5484D" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#faro-g)" />
      <path d="M8 21c2.5-1.2 4-3.6 4-7M14 23c3-1.8 5-5.3 5-10M20 24c3.4-2.4 5-6 5-11" stroke="#0E1E22" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

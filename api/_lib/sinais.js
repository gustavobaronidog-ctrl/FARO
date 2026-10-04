// Leitor de sinais: abre o site / link da bio do negócio e descobre
// se ele agenda pelo WhatsApp, se já usa um sistema concorrente, Instagram, e-mail...

const REDES = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com)$/i;
const AGREGADORES = /(^|\.)(linktr\.ee|linktree\.com|bio\.link|beacons\.ai|taplink\.(cc|at)|linkbio\.co|campsite\.bio)$/i;
const WHATSAPP = /(wa\.me\/|api\.whatsapp\.com|web\.whatsapp\.com|whatsapp:\/\/|chat\.whatsapp\.com)/i;
const AGENDA_GENERICA = /(calendly\.com|agende\s+online|agendar\s+online|agendamento\s+online|marque\s+(seu|o)\s+hor[aá]rio\s+online|book\s+now|reservar?\s+online)/i;
const NAO_ABRIR = /(^|\.)(wa\.me|whatsapp\.com|instagram\.com|facebook\.com|fb\.com|tiktok\.com|google\.com|goo\.gl|g\.page)$/i;

export function hostDe(url) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase(); } catch { return ''; }
}

export function instagramDe(texto) {
  const m = String(texto || '').match(/instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/|stories\/)([A-Za-z0-9_.]{2,30})/i);
  return m ? m[1].replace(/\.$/, '') : null;
}

// Analisa o texto/HTML de uma página (função pura, fácil de testar)
export function analisarConteudo(html, concorrentes = []) {
  const texto = String(html || '');
  const baixo = texto.toLowerCase();
  const sinais = {};
  if (WHATSAPP.test(texto)) sinais.whatsapp = true;
  let concorrente = null;
  for (const c of concorrentes) {
    if ((c.padroes || []).some(p => p && baixo.includes(String(p).toLowerCase()))) { concorrente = c.nome; break; }
  }
  if (!concorrente && AGENDA_GENERICA.test(texto)) sinais.agenda_online = true;
  const instagram = instagramDe(texto);
  const email = (texto.match(/mailto:([^"'?\s>]+)/i)?.[1]
    || texto.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.(com|com\.br|net|br)\b/)?.[0] || null);
  return { sinais, concorrente, instagram, email: email && !/sentry|wixpress|example|exemplo/i.test(email) ? email.toLowerCase() : null };
}

// Analisa um lead a partir do site informado
export async function lerSinais(lead, concorrentes = [], { fetchImpl = fetch, timeoutMs = 7000 } = {}) {
  const site = lead.site;
  const resultado = { sinais: { ...(lead.sinais || {}) }, concorrente: null, instagram: null, email: null, erro: null };
  if (!site) return resultado;

  const host = hostDe(site);
  if (WHATSAPP.test(site)) resultado.sinais.whatsapp = true;
  if (REDES.test(host)) { resultado.sinais.redes = true; resultado.instagram = instagramDe(site); }
  if (AGREGADORES.test(host)) resultado.sinais.link_bio = true;
  // concorrente pode estar no próprio link (ex.: o site do Google aponta pro Trinks)
  const noLink = analisarConteudo(site, concorrentes);
  if (noLink.concorrente) resultado.concorrente = noLink.concorrente;
  if (NAO_ABRIR.test(host)) return resultado;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetchImpl(site.startsWith('http') ? site : `https://${site}`, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    });
    clearTimeout(t);
    const finalHost = hostDe(r.url || site);
    const destino = analisarConteudo(r.url || '', concorrentes);
    if (destino.concorrente) resultado.concorrente = destino.concorrente;
    if (AGREGADORES.test(finalHost)) resultado.sinais.link_bio = true;
    const html = (await r.text()).slice(0, 1_500_000);
    const a = analisarConteudo(html, concorrentes);
    Object.assign(resultado.sinais, a.sinais);
    resultado.concorrente = resultado.concorrente || a.concorrente;
    resultado.instagram = resultado.instagram || a.instagram;
    resultado.email = a.email;
    if (!r.ok) resultado.erro = `HTTP ${r.status}`;
  } catch (e) {
    resultado.erro = e.name === 'AbortError' ? 'site demorou demais' : 'site não abriu';
  }
  return resultado;
}

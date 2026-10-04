// Google Places API (New) · Text Search
// Cota grátis (2026): 1.000 chamadas/mês no nível Enterprise (que inclui telefone, site e nota).
// Cada chamada traz até 20 negócios → até ~20 mil negócios/mês sem custo.
import { normalizarTelefone, ehCelular } from './telefone.js';

const URL_BUSCA = 'https://places.googleapis.com/v1/places:searchText';
const CAMPOS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.addressComponents',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.websiteUri',
  'places.rating', 'places.userRatingCount', 'places.businessStatus', 'places.location',
  'places.googleMapsUri', 'nextPageToken',
].join(',');

export async function buscarPagina({ consulta, chave, pageToken, fetchImpl = fetch }) {
  const corpo = { textQuery: consulta, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 };
  if (pageToken) corpo.pageToken = pageToken;
  const r = await fetchImpl(URL_BUSCA, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': CAMPOS },
    body: JSON.stringify(corpo),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error?.message || `HTTP ${r.status}`;
    const e = new Error(`Google Places: ${msg}`);
    e.status = r.status;
    throw e;
  }
  return { places: json.places || [], proxima: json.nextPageToken || null };
}

function componente(place, tipo, curto = false) {
  const c = (place.addressComponents || []).find(x => (x.types || []).includes(tipo));
  return c ? (curto ? c.shortText : c.longText) : null;
}

export function placeParaLead(place, alvo) {
  const tel = normalizarTelefone(place.internationalPhoneNumber || place.nationalPhoneNumber);
  return {
    fonte: 'google',
    place_id: place.id,
    nome: place.displayName?.text || 'Sem nome',
    nicho: alvo?.nicho ?? null,
    telefone: tel,
    celular: ehCelular(tel),
    site: place.websiteUri || null,
    maps_url: place.googleMapsUri || null,
    endereco: place.formattedAddress || null,
    bairro: componente(place, 'sublocality_level_1') || componente(place, 'sublocality'),
    cidade: componente(place, 'administrative_area_level_2') || alvo?.cidade || null,
    uf: componente(place, 'administrative_area_level_1', true) || alvo?.uf || null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    nota: place.rating ?? null,
    avaliacoes: place.userRatingCount ?? null,
    status_google: place.businessStatus || null,
  };
}

export function montarConsulta(alvo) {
  return `${alvo.consulta} em ${alvo.cidade} ${alvo.uf}`.trim();
}

// Gravação e preparo do áudio das ligações, tudo no navegador (sem biblioteca externa).
// Qualquer áudio (gravado aqui ou enviado do celular) vira WAV mono de 8 kHz: qualidade de telefone,
// ~1 MB por minuto, toca em qualquer aparelho e a IA do Google entende direto.

export const TAXA = 8000;
export const LIMITE_MB = 30;                          // ~31 minutos
export const LIMITE_BYTES = LIMITE_MB * 1024 * 1024;

export function podeGravar() {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';
}
export function podeGravarComputador() {
  return podeGravar() && !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

// Converte qualquer áudio que o navegador saiba tocar em WAV 8 kHz mono
export async function prepararAudio(arquivo) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const bruto = await arquivo.arrayBuffer();
  let buf;
  try { buf = await new Offline(1, 1, TAXA).decodeAudioData(bruto); }
  catch { throw new Error('Não consegui abrir esse áudio. Exporte a gravação em MP3, M4A ou WAV e envie de novo.'); }
  if (buf.duration < 3) throw new Error('Esse áudio tem menos de 3 segundos.');
  // junta os canais (ligação gravada em estéreo costuma ter um lado em cada canal)
  const n = buf.length, mono = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels;
  }
  // nivela o volume (gravação pelo microfone costuma ficar baixa)
  let pico = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(mono[i]); if (a > pico) pico = a; }
  const ganho = pico > 0.01 ? Math.min(8, 0.95 / pico) : 1;
  const wav = codificarWav(mono, TAXA, ganho);
  if (wav.size > LIMITE_BYTES) throw new Error(`Ligação longa demais: o limite é perto de ${LIMITE_MB} minutos.`);
  return { wav, duracao: Math.round(buf.duration) };
}

function codificarWav(amostras, taxa, ganho = 1) {
  const dados = amostras.length * 2;
  const v = new DataView(new ArrayBuffer(44 + dados));
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + dados, true); txt(8, 'WAVE');
  txt(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  txt(36, 'data'); v.setUint32(40, dados, true);
  for (let i = 0, o = 44; i < amostras.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, amostras[i] * ganho));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([v], { type: 'audio/wav' });
}

// Gravador: 'microfone' (ligação no viva-voz) ou 'computador' (microfone + som do PC, para ligação pelo WhatsApp Web/Desktop)
export async function iniciarGravacao(modo, aoNivel) {
  const fechar = [];
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const destino = ctx.createMediaStreamDestination();
  const medidor = ctx.createAnalyser(); medidor.fftSize = 512;
  const juntar = (stream) => { const s = ctx.createMediaStreamSource(stream); s.connect(destino); s.connect(medidor); };

  try {
    // sem cancelamento de eco: no viva-voz, a voz do cliente sai pelo alto-falante e precisa entrar na gravação
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: modo === 'computador', noiseSuppression: false, autoGainControl: true },
    });
    fechar.push(mic); juntar(mic);
    if (modo === 'computador') {
      const tela = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false }, systemAudio: 'include' });
      fechar.push(tela);
      if (!tela.getAudioTracks().length) {
        throw new Error('O som do computador não veio junto. Compartilhe de novo escolhendo "Tela inteira" e marque "Compartilhar áudio do sistema".');
      }
      juntar(new MediaStream(tela.getAudioTracks()));
    }
  } catch (e) {
    fechar.forEach(s => s.getTracks().forEach(t => t.stop())); ctx.close();
    if (e.name === 'NotAllowedError') throw new Error(modo === 'computador' ? 'Você precisa permitir o compartilhamento da tela com áudio.' : 'Você precisa permitir o uso do microfone.');
    throw e;
  }

  const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  const gravador = new MediaRecorder(destino.stream, tipo ? { mimeType: tipo } : undefined);
  const pedacos = [];
  gravador.ondataavailable = e => { if (e.data.size) pedacos.push(e.data); };
  gravador.start(1000);

  const amostras = new Uint8Array(medidor.fftSize);
  let quadro;
  const medir = () => {
    medidor.getByteTimeDomainData(amostras);
    let s = 0; for (const x of amostras) s += ((x - 128) / 128) ** 2;
    aoNivel?.(Math.min(1, Math.sqrt(s / amostras.length) * 4));
    quadro = requestAnimationFrame(medir);
  };
  medir();

  const encerrar = () => { cancelAnimationFrame(quadro); fechar.forEach(s => s.getTracks().forEach(t => t.stop())); ctx.close(); };
  // se a pessoa parar o compartilhamento pela barra do navegador, para a gravação também
  let aoCairSozinho = null;
  fechar.forEach(s => s.getTracks().forEach(t => { t.onended = () => { if (gravador.state === 'recording') aoCairSozinho?.(); }; }));

  return {
    parar: () => new Promise(ok => {
      if (gravador.state === 'inactive') { encerrar(); ok(new Blob(pedacos, { type: gravador.mimeType || 'audio/webm' })); return; }
      gravador.onstop = () => { encerrar(); ok(new Blob(pedacos, { type: gravador.mimeType || 'audio/webm' })); };
      gravador.stop();
    }),
    cancelar: () => { try { gravador.stop(); } catch { /* já parado */ } encerrar(); },
    quandoCair: (fn) => { aoCairSozinho = fn; },
  };
}

export function duracaoTexto(seg) {
  if (seg == null) return '';
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
// "01:07" → 67
export function emSegundos(mmss) {
  const p = String(mmss || '').split(':').map(Number);
  if (p.some(isNaN) || !p.length) return null;
  return p.reduce((t, x) => t * 60 + x, 0);
}

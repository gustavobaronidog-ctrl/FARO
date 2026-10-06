import { useFaro } from '../Contexto.jsx';
import { scriptsParaLead, preencher, variaveisDoLead, linkWhatsApp } from './util.js';

// Ligar / chamar no WhatsApp e já abrir a ficha pronta para registrar o resultado
export function useContato() {
  const { scripts, produto, perfil, abrirLead, podeWhats, toast } = useFaro();
  return (lead, canal) => {
    if (canal === 'whatsapp' && !podeWhats(lead)) { toast('O WhatsApp libera depois que o cliente atender a sua ligação'); return; }
    if (canal === 'whatsapp') {
      const s = scriptsParaLead(scripts, lead, 'whatsapp')[0];
      const texto = s ? preencher(s.corpo, variaveisDoLead(lead, { produto, perfil })) : '';
      window.open(linkWhatsApp(lead.telefone, texto), '_blank', 'noopener');
      abrirLead({ id: lead.id, canal: 'whatsapp', scriptId: s?.id, registrar: true });
    } else {
      abrirLead({ id: lead.id, canal: 'ligacao', registrar: true });
    }
  };
}

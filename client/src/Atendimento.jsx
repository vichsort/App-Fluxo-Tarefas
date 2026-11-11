import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { Botao } from "./componentes/Botao.jsx";
import { Icone } from "./componentes/Icone.jsx";

const INTERVALO_MS = 4000;

/**
 * Estado do atendimento: lista de tickets, conversa aberta e envio de mensagens.
 * Só busca dados enquanto `ativo`; enquanto uma conversa está aberta, consulta a API
 * de tempos em tempos para mostrar respostas que chegarem de agentes.
 * `ticketId === null` significa "novo ticket" (tela de boas-vindas com o campo de mensagem).
 */
export function useAtendimento(ativo) {
  const [tickets, setTickets] = useState(null);
  const [ticketId, setTicketId] = useState(null);
  const [conversa, setConversa] = useState(null); // { ticket, messages } do ticket aberto
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const idAberto = useRef(null);
  idAberto.current = ticketId;

  const carregarLista = useCallback(async () => {
    const dados = await api.tickets.listar();
    setTickets(dados?.tickets ?? []);
    return dados?.tickets ?? [];
  }, []);

  const carregarConversa = useCallback(async (id) => {
    const dados = await api.tickets.detalhe(id);
    if (idAberto.current === id) setConversa(dados);
  }, []);

  const falhar = (e) => setErro(e.message);

  // Primeira carga ao entrar na tela: abre o ticket mais recente, como o ChatGPT reabre a última conversa.
  useEffect(() => {
    if (!ativo || tickets !== null) return;
    carregarLista()
      .then((lista) => { setTicketId((atual) => atual ?? lista[0]?.id ?? null); setErro(null); })
      .catch((e) => { falhar(e); setTickets([]); });
  }, [ativo, tickets, carregarLista]);

  // Conversa aberta: carrega ao trocar e atualiza em segundo plano.
  useEffect(() => {
    setConversa(null);
    if (!ativo || !ticketId) return undefined;
    let vivo = true;
    const buscar = () => carregarConversa(ticketId).then(() => vivo && setErro(null)).catch((e) => {
      if (!vivo) return;
      falhar(e);
      if (/não encontrado/i.test(e.message)) setTicketId(null);
    });
    buscar();
    const relogio = setInterval(() => {
      if (document.visibilityState === "visible") { buscar(); carregarLista().catch(() => {}); }
    }, INTERVALO_MS);
    return () => { vivo = false; clearInterval(relogio); };
  }, [ativo, ticketId, carregarConversa, carregarLista]);

  const executar = async (acao) => {
    try { setErro(null); return await acao(); } catch (e) { falhar(e); return undefined; }
  };

  const enviar = async (conteudo) => {
    setEnviando(true);
    try {
      return await executar(async () => {
        if (ticketId) {
          await api.tickets.enviar(ticketId, conteudo);
          await Promise.all([carregarConversa(ticketId), carregarLista()]);
        } else {
          const r = await api.tickets.abrir(conteudo);
          await carregarLista();
          idAberto.current = r.ticket.id;
          setConversa(r);
          setTicketId(r.ticket.id);
        }
        return true;
      });
    } finally { setEnviando(false); }
  };

  const mudarStatus = (status) => executar(async () => {
    await api.tickets.editar(ticketId, { status });
    await Promise.all([carregarConversa(ticketId), carregarLista()]);
  });

  const renomear = (title) => executar(async () => {
    await api.tickets.editar(ticketId, { title });
    await Promise.all([carregarConversa(ticketId), carregarLista()]);
    return true;
  });

  const excluir = () => executar(async () => {
    await api.tickets.excluir(ticketId);
    const lista = await carregarLista();
    setTicketId(lista[0]?.id ?? null);
    return true;
  });

  return {
    tickets, ticketId, conversa, enviando, erro,
    selecionar: setTicketId,
    novo: () => setTicketId(null),
    recarregar: () => { setTickets(null); setErro(null); },
    enviar, mudarStatus, renomear, excluir,
  };
}

const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dataCurta = (iso) => {
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString()
    ? hora(iso)
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
};

/** Lista de conversas que ocupa a barra lateral, no estilo do histórico do ChatGPT. */
export function ListaTickets({ tickets, ticketId, aoSelecionar, aoNovo }) {
  return (
    <>
      <Botao className="botao-bloco" icone="mais" onClick={aoNovo} data-ativo={ticketId === null ? "" : undefined}>
        Novo ticket
      </Botao>
      <h2 className="lateral-titulo">Seus tickets</h2>
      {tickets === null ? (
        <p className="lateral-vazio">Carregando tickets…</p>
      ) : tickets.length ? (
        <ul className="lateral-lista">
          {tickets.map((t) => (
            <li key={t.id}>
              <div className="lateral-item" data-ativo={t.id === ticketId ? "" : undefined}>
                <button type="button" className="lateral-escolha ticket-escolha" aria-current={t.id === ticketId ? "page" : undefined} onClick={() => aoSelecionar(t.id)}>
                  <span className="ticket-titulo">{t.title}</span>
                  <span className="ticket-meta">
                    <span className="ticket-estado" data-status={t.status}>{t.status === "closed" ? "Resolvido" : "Aberto"}</span>
                    <span>{dataCurta(t.updatedAt)}</span>
                  </span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lateral-vazio">Nenhum ticket ainda. Abra o primeiro para falar com o atendimento.</p>
      )}
    </>
  );
}

function Mensagem({ mensagem }) {
  const eu = mensagem.role === "user";
  return (
    <article className="msg" data-papel={mensagem.role}>
      {eu ? null : (
        <span className="msg-avatar" aria-hidden="true"><Icone nome="robo" tamanho={18} /></span>
      )}
      <div className="msg-corpo">
        <p className="msg-autor">
          {eu ? "Você" : mensagem.role === "agent" ? "Atendimento" : "Sistema"}
          <time dateTime={mensagem.createdAt}>{hora(mensagem.createdAt)}</time>
        </p>
        <p className="msg-texto">{mensagem.content}</p>
      </div>
    </article>
  );
}

/** Campo de mensagem fixo no rodapé: Enter envia, Shift+Enter quebra a linha. */
function Compositor({ aoEnviar, enviando, placeholder, autoFocus }) {
  const [valor, setValor] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [valor]);

  const enviar = async () => {
    const texto = valor.trim();
    if (!texto || enviando) return;
    const ok = await aoEnviar(texto);
    if (ok) setValor("");
    ref.current?.focus();
  };

  return (
    <form className="compositor" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
      <div className="compositor-caixa">
        <textarea
          ref={ref}
          className="compositor-entrada"
          rows={1}
          value={valor}
          maxLength={4000}
          autoFocus={autoFocus}
          aria-label="Mensagem"
          placeholder={placeholder}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); }
          }}
        />
        <button type="submit" className="compositor-enviar" aria-label="Enviar mensagem" disabled={!valor.trim() || enviando}>
          <Icone nome="enviar" tamanho={18} />
        </button>
      </div>
      <p className="compositor-dica">Enter envia · Shift+Enter quebra a linha</p>
    </form>
  );
}

const SUGESTOES = [
  "Não consigo mover um cartão entre listas",
  "Como compartilho um quadro com a equipe?",
  "Quero sugerir uma melhoria no Fluxo",
];

/** Área de atendimento: a conversa do ticket aberto, ou a tela de boas-vindas para abrir um novo. */
export function TelaAtendimento({ atendimento, aoRenomear, aoExcluir }) {
  const { ticketId, conversa, enviando, enviar, mudarStatus } = atendimento;
  const fim = useRef(null);
  const mensagens = conversa?.messages ?? [];
  const ticket = conversa?.ticket;
  const aguardando = mensagens.length > 0 && mensagens[mensagens.length - 1].role === "user";

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, ticketId]);

  if (!ticketId) {
    return (
      <section className="chat" aria-label="Novo ticket">
        <div className="chat-boasvindas">
          <span className="chat-boasvindas-icone" aria-hidden="true"><Icone nome="suporte" tamanho={28} /></span>
          <h1>Como podemos ajudar?</h1>
          <p>Descreva o que está acontecendo. Isso abre um ticket e a conversa continua aqui, com o atendimento.</p>
          <ul className="sugestoes">
            {SUGESTOES.map((s) => (
              <li key={s}>
                <button type="button" className="sugestao" disabled={enviando} onClick={() => void enviar(s)}>{s}</button>
              </li>
            ))}
          </ul>
        </div>
        <Compositor key="novo" aoEnviar={enviar} enviando={enviando} placeholder="Descreva o problema ou a dúvida…" autoFocus />
      </section>
    );
  }

  if (!ticket) {
    return (
      <section className="chat" aria-label="Conversa">
        <p className="carregando-line chat-carregando" role="status">Carregando conversa…</p>
      </section>
    );
  }

  const fechado = ticket.status === "closed";
  return (
    <section className="chat" aria-label={`Ticket: ${ticket.title}`}>
      <header className="chat-topo">
        <div className="chat-titulo">
          <h1>{ticket.title}</h1>
          <span className="ticket-estado" data-status={ticket.status}>{fechado ? "Resolvido" : "Aberto"}</span>
        </div>
        <div className="quadro-acoes">
          <Botao variante="fantasma" icone={fechado ? "atualizar" : "check"} onClick={() => void mudarStatus(fechado ? "open" : "closed")}>
            {fechado ? "Reabrir" : "Marcar como resolvido"}
          </Botao>
          <Botao variante="fantasma" icone="lapis" aria-label="Renomear ticket" onClick={() => aoRenomear(ticket)} />
          <Botao variante="fantasma" icone="lixeira" aria-label="Excluir ticket" onClick={() => aoExcluir(ticket)} />
        </div>
      </header>

      <div className="chat-rolagem">
        <div className="chat-fio" role="log" aria-live="polite" aria-label="Mensagens do ticket">
          {mensagens.map((m) => <Mensagem key={m.id} mensagem={m} />)}
          {aguardando && !fechado ? (
            <p className="chat-aguardando" role="status">
              <span className="chat-pontos" aria-hidden="true"><i /><i /><i /></span>
              Sua mensagem foi enviada. Um agente responde por aqui.
            </p>
          ) : null}
          {fechado ? <p className="chat-aviso-fechado">Ticket resolvido. Se escrever de novo, ele é reaberto.</p> : null}
          <div ref={fim} />
        </div>
      </div>

      <Compositor key={ticket.id} aoEnviar={enviar} enviando={enviando} placeholder="Escreva uma mensagem…" autoFocus />
    </section>
  );
}

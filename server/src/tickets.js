// Atendimento: tickets são conversas. Contrato JSON em inglês, sem exigir login (como os quadros).
// Agentes autônomos responderão pela mesma rota de mensagens, com `role: "agent"`.
import { randomUUID } from "node:crypto";
import { invalido, naoEncontrado, texto } from "./http.js";
import { transacao } from "./db.js";

const PAPEIS = ["user", "agent", "system"];
const STATUS = ["open", "closed"];

const saidaMensagem = (m) => ({ id: m.id, ticketId: m.ticket_id, role: m.role, content: m.content, createdAt: m.criado_em });
const saidaTicket = (t) => ({ id: t.id, title: t.title, status: t.status, createdAt: t.criado_em, updatedAt: t.atualizado_em });

/** Título provisório a partir da primeira mensagem: primeira linha, até 60 caracteres. */
const tituloDe = (conteudo) => {
  const linha = conteudo.split("\n")[0].trim();
  return linha.length > 60 ? `${linha.slice(0, 57).trimEnd()}…` : linha;
};

export function rotasDeTickets(app, db) {
  const buscar = (id) => {
    const t = db.prepare("SELECT * FROM ticket WHERE id = ?").get(id);
    if (!t) throw naoEncontrado("Ticket");
    return t;
  };
  const inserirMensagem = (ticketId, role, content) => {
    const agora = new Date().toISOString();
    const m = { id: randomUUID(), ticket_id: ticketId, role, content, criado_em: agora };
    db.prepare("INSERT INTO ticket_message (id, ticket_id, role, content, criado_em) VALUES (?, ?, ?, ?, ?)")
      .run(m.id, ticketId, role, content, agora);
    db.prepare("UPDATE ticket SET atualizado_em = ? WHERE id = ?").run(agora, ticketId);
    return m;
  };

  app.get("/api/tickets", () => {
    const linhas = db.prepare(
      `SELECT t.*, (SELECT content FROM ticket_message WHERE ticket_id = t.id ORDER BY criado_em DESC, rowid DESC LIMIT 1) AS ultima
       FROM ticket t ORDER BY t.atualizado_em DESC, t.rowid DESC`
    ).all();
    return { tickets: linhas.map((t) => ({ ...saidaTicket(t), lastMessage: t.ultima ?? "" })) };
  });

  app.post("/api/tickets", ({ corpo }) => {
    const mensagem = texto(corpo, "message", { max: 4000 });
    const title = texto(corpo, "title", { max: 120, opcional: true }) ?? tituloDe(mensagem);
    return transacao(db, () => {
      const agora = new Date().toISOString();
      const id = randomUUID();
      db.prepare("INSERT INTO ticket (id, title, status, criado_em, atualizado_em) VALUES (?, ?, 'open', ?, ?)").run(id, title, agora, agora);
      const m = inserirMensagem(id, "user", mensagem);
      return { ticket: saidaTicket(buscar(id)), messages: [saidaMensagem(m)] };
    });
  });

  app.get("/api/tickets/:id", ({ params }) => {
    const t = buscar(params.id);
    const mensagens = db.prepare("SELECT * FROM ticket_message WHERE ticket_id = ? ORDER BY criado_em, rowid").all(t.id);
    return { ticket: saidaTicket(t), messages: mensagens.map(saidaMensagem) };
  });

  app.post("/api/tickets/:id/messages", ({ params, corpo }) => {
    const t = buscar(params.id);
    const content = texto(corpo, "content", { max: 4000 });
    const role = corpo.role ?? "user";
    if (!PAPEIS.includes(role)) throw invalido(`role deve ser ${PAPEIS.join(", ")}.`);
    return transacao(db, () => {
      const m = inserirMensagem(t.id, role, content);
      // Quem escreve num ticket fechado o reabre: a conversa continua.
      if (t.status === "closed") db.prepare("UPDATE ticket SET status = 'open' WHERE id = ?").run(t.id);
      return { message: saidaMensagem(m), ticket: saidaTicket(buscar(t.id)) };
    });
  });

  app.patch("/api/tickets/:id", ({ params, corpo }) => {
    const t = buscar(params.id);
    const title = texto(corpo, "title", { max: 120, opcional: true }) ?? t.title;
    const status = corpo.status ?? t.status;
    if (!STATUS.includes(status)) throw invalido(`status deve ser ${STATUS.join(" ou ")}.`);
    db.prepare("UPDATE ticket SET title = ?, status = ? WHERE id = ?").run(title, status, t.id);
    return { ticket: saidaTicket(buscar(t.id)) };
  });

  app.delete("/api/tickets/:id", ({ params }) => {
    const t = buscar(params.id);
    db.prepare("DELETE FROM ticket WHERE id = ?").run(t.id); // mensagens caem em cascata
    return { ok: true };
  });
}

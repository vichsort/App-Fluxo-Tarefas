import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { criarApp } from "../src/app.js";

let base, servidor;
const chamar = async (metodo, caminho, corpo) => {
  const r = await fetch(base + caminho, { method: metodo, headers: { "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  return { status: r.status, dados: r.status === 204 ? null : await r.json() };
};

before(async () => {
  ({ servidor } = criarApp());
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(() => servidor.close());

test("tickets: o banco novo já traz uma conversa de exemplo", async () => {
  const { tickets } = (await chamar("GET", "/api/tickets")).dados;
  assert.equal(tickets.length, 1);
  const { messages } = (await chamar("GET", `/api/tickets/${tickets[0].id}`)).dados;
  assert.deepEqual(messages.map((m) => m.role), ["user", "agent"]);
});

test("tickets: abrir cria a conversa com a primeira mensagem e título derivado", async () => {
  const r = await chamar("POST", "/api/tickets", { message: "  Não consigo mover um cartão\nvejo um erro  " });
  assert.equal(r.status, 201);
  assert.equal(r.dados.ticket.title, "Não consigo mover um cartão");
  assert.equal(r.dados.ticket.status, "open");
  assert.equal(r.dados.messages[0].role, "user");
  assert.equal((await chamar("POST", "/api/tickets", { message: "   " })).status, 400);
  assert.equal((await chamar("POST", "/api/tickets", {})).status, 400);
});

test("tickets: mensagens (usuário e agente) entram em ordem e o ticket mais recente sobe na lista", async () => {
  const { ticket } = (await chamar("POST", "/api/tickets", { title: "Fatura", message: "Preciso da segunda via" })).dados;
  const a = await chamar("POST", `/api/tickets/${ticket.id}/messages`, { content: "Alguém aí?" });
  assert.equal(a.status, 201);
  assert.equal(a.dados.message.role, "user");
  assert.equal((await chamar("POST", `/api/tickets/${ticket.id}/messages`, { content: "Oi! Já envio.", role: "agent" })).dados.message.role, "agent");
  assert.equal((await chamar("POST", `/api/tickets/${ticket.id}/messages`, { content: "x", role: "admin" })).status, 400);
  const { messages } = (await chamar("GET", `/api/tickets/${ticket.id}`)).dados;
  assert.deepEqual(messages.map((m) => m.content), ["Preciso da segunda via", "Alguém aí?", "Oi! Já envio."]);
  const { tickets } = (await chamar("GET", "/api/tickets")).dados;
  assert.equal(tickets[0].id, ticket.id);
  assert.equal(tickets[0].lastMessage, "Oi! Já envio.");
});

test("tickets: fechar, reabrir ao receber mensagem, renomear e excluir", async () => {
  const { ticket } = (await chamar("POST", "/api/tickets", { message: "Dúvida" })).dados;
  assert.equal((await chamar("PATCH", `/api/tickets/${ticket.id}`, { status: "closed" })).dados.ticket.status, "closed");
  assert.equal((await chamar("PATCH", `/api/tickets/${ticket.id}`, { status: "x" })).status, 400);
  assert.equal((await chamar("PATCH", `/api/tickets/${ticket.id}`, { title: "Novo nome" })).dados.ticket.title, "Novo nome");
  assert.equal((await chamar("POST", `/api/tickets/${ticket.id}/messages`, { content: "Mais uma coisa" })).dados.ticket.status, "open");
  assert.equal((await chamar("DELETE", `/api/tickets/${ticket.id}`)).status, 200);
  assert.equal((await chamar("GET", `/api/tickets/${ticket.id}`)).status, 404);
  assert.equal((await chamar("POST", `/api/tickets/${ticket.id}/messages`, { content: "oi" })).status, 404);
});

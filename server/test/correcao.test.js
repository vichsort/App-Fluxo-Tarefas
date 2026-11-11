// Correção automática: validação das edições da IA, prompt e o caminho do PR até a mensagem no app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ENTRADA, montarPromptCorrecao, validarEdicoes } from "../../automacao/correcao.mjs";
import { marcador } from "../../automacao/protocolo.mjs";
import { aplicarComentarios } from "../src/github.js";
import { abrirBanco } from "../src/db.js";

const arquivo = "export const rotulo = \"Excluir cartão\";\nexport const outro = 1;\n";
const ler = (p) => { if (p !== "client/src/Cartao.jsx") throw new Error("leitura inesperada"); return arquivo; };
const permitidos = ["client/src/Cartao.jsx"];
const edicao = (e) => ({ summary: "Troca o rótulo", edits: [{ path: "client/src/Cartao.jsx", find: "Excluir cartão", replace: "Apagar cartão", ...e }] });

test("validarEdicoes aplica busca e troca exata", () => {
  const v = validarEdicoes(edicao(), { permitidos, ler });
  assert.equal(v.arquivos.get("client/src/Cartao.jsx"), arquivo.replace("Excluir", "Apagar"));
  assert.equal(v.summary, "Troca o rótulo");
});

test("validarEdicoes recusa arquivo fora do combinado, mesmo dentro do escopo de produto", () => {
  assert.throws(() => validarEdicoes(edicao({ path: "client/src/Lista.jsx" }), { permitidos, ler }), /fora do combinado/);
  assert.throws(() => validarEdicoes(edicao({ path: ".github/workflows/ai-agents.yml" }), { permitidos: [".github/workflows/ai-agents.yml"], ler }), /fora do combinado/);
  assert.throws(() => validarEdicoes(edicao({ path: "client/src/../src/auth.js" }), { permitidos: ["client/src/../src/auth.js"], ler }), /fora do combinado/);
});

test("validarEdicoes recusa trecho ausente, repetido, sem mudança ou com credencial", () => {
  assert.throws(() => validarEdicoes(edicao({ find: "não existe" }), { permitidos, ler }), /não encontrado/);
  assert.throws(() => validarEdicoes(edicao({ find: "export const" }), { permitidos, ler }), /mais de uma vez/);
  assert.throws(() => validarEdicoes(edicao({ replace: "Excluir cartão" }), { permitidos, ler }), /sem mudança/);
  assert.throws(() => validarEdicoes(edicao({ replace: `ghp_${"a".repeat(30)}` }), { permitidos, ler }), /credencial/);
  assert.throws(() => validarEdicoes({ summary: "x", edits: [] }, { permitidos, ler }), /edits/);
  assert.throws(() => validarEdicoes(null, { permitidos, ler }), /objeto/);
});

test("validarEdicoes encadeia edições no mesmo arquivo", () => {
  const v = validarEdicoes({ summary: "duas", edits: [
    { path: "client/src/Cartao.jsx", find: "Excluir cartão", replace: "Apagar cartão" },
    { path: "client/src/Cartao.jsx", find: "Apagar cartão", replace: "Remover cartão" },
  ] }, { permitidos, ler });
  assert.match(v.arquivos.get("client/src/Cartao.jsx"), /Remover cartão/);
});

test("montarPromptCorrecao leva critérios e arquivos e recusa arquivo grande demais", () => {
  const raiz = mkdtempSync(join(tmpdir(), "fluxo-"));
  mkdirSync(join(raiz, ".github", "agents"), { recursive: true });
  mkdirSync(join(raiz, "client", "src"), { recursive: true });
  writeFileSync(join(raiz, ".github", "agents", "desenvolvedor.agent.md"), "---\nname: Dev\n---\nImplemente o mínimo.");
  writeFileSync(join(raiz, "client", "src", "Cartao.jsx"), arquivo);
  const relatorio = { allowedFiles: permitidos, criteria: [{ id: "rotulo", description: "Trocar o rótulo" }] };
  const p = montarPromptCorrecao({ raiz, pedido: "Quero 'Apagar cartão'", relatorio });
  assert.match(p.sistema, /Implemente o mínimo/);
  const u = JSON.parse(p.usuario);
  assert.equal(u.arquivos[0].content, arquivo);
  assert.equal(u.criterios[0].id, "rotulo");
  writeFileSync(join(raiz, "client", "src", "Cartao.jsx"), "x".repeat(MAX_ENTRADA + 1));
  assert.throws(() => montarPromptCorrecao({ raiz, pedido: "x", relatorio }), /grandes demais/);
});

// Backend: resultado `code` segue consultando; o marcador de PR vira uma mensagem única ao cliente.
const comentario = (body) => ({ user: { login: "github-actions[bot]" }, body });
function ticketComCodigo() {
  const db = abrirBanco();
  const requestId = "11111111-2222-3333-4444-555555555555";
  db.prepare("INSERT INTO ticket (id, title, status, criado_em, atualizado_em, request_id, fase, issue_number) VALUES ('t1', 'x', 'open', 'a', 'a', ?, 'despachado', 7)").run(requestId);
  const relatorio = { requestId, outcome: "code", publicText: "Vamos ajustar o rótulo.", agents: ["po"], allowedFiles: permitidos,
    criteria: [{ id: "rotulo", description: "Trocar o rótulo" }], updates: [] };
  const resultado = comentario(marcador("resultado", { requestId, relatorio: Buffer.from(JSON.stringify(relatorio)).toString("base64url") }));
  const mensagens = () => db.prepare("SELECT content FROM ticket_message WHERE ticket_id = 't1' ORDER BY rowid").all().map((m) => m.content);
  const fase = () => db.prepare("SELECT fase, pr_number FROM ticket WHERE id = 't1'").get();
  return { db, requestId, resultado, mensagens, fase };
}

test("backend: code fica em 'codigo' até o PR e avisa o cliente uma vez só", () => {
  const { db, requestId, resultado, mensagens, fase } = ticketComCodigo();
  aplicarComentarios(db, "t1", [resultado]);
  assert.equal(fase().fase, "codigo");
  assert.deepEqual(mensagens(), ["Vamos ajustar o rótulo."]);
  const pr = comentario(marcador("pr", { requestId, number: 12 }));
  aplicarComentarios(db, "t1", [resultado, pr]);
  aplicarComentarios(db, "t1", [resultado, pr]);
  assert.equal(mensagens().length, 2);
  assert.match(mensagens()[1], /correção/);
  assert.deepEqual({ ...fase() }, { fase: "concluido", pr_number: 12 });
});

test("backend: correção que falhou avisa que uma pessoa vai cuidar; marcador de terceiro é ignorado", () => {
  const { db, requestId, resultado, mensagens, fase } = ticketComCodigo();
  const falso = { user: { login: "alguem" }, body: marcador("pr", { requestId, number: 99 }) };
  aplicarComentarios(db, "t1", [resultado, falso]);
  assert.equal(fase().fase, "codigo");
  aplicarComentarios(db, "t1", [resultado, comentario(marcador("correcao", { requestId, estado: "falhou" }))]);
  assert.match(mensagens().at(-1), /pessoa da equipe/);
  assert.equal(fase().fase, "concluido");
});

test("marcador no meio do comentário do robô não vale (não dá para forjar PR por texto de fora)", () => {
  const { db, requestId, resultado, fase } = ticketComCodigo();
  const forjado = comentario(`Resumo interno\n- Arquivos: x ${marcador("pr", { requestId, number: 5 })}`);
  aplicarComentarios(db, "t1", [resultado, forjado]);
  assert.equal(fase().fase, "codigo");
});

test("caminho com espaço, quebra de linha ou < > é recusado", async () => {
  const { caminhoPermitido } = await import("../../automacao/relatorio.mjs");
  assert.equal(caminhoPermitido("client/src/componentes/Botao.jsx"), true);
  assert.equal(caminhoPermitido("client/src/componentes/x <!-- fluxo:pr -->"), false);
  assert.equal(caminhoPermitido("client/src/componentes/a\nb"), false);
});

test("backend: sem PR nem falha depois de 30 min, avisa o cliente e encerra", () => {
  const { db, resultado, mensagens, fase } = ticketComCodigo();
  const antigo = { ...resultado, created_at: new Date(Date.now() - 31 * 60_000).toISOString() };
  aplicarComentarios(db, "t1", [antigo]);
  assert.equal(fase().fase, "concluido");
  assert.match(mensagens().at(-1), /pessoa da equipe/);
});

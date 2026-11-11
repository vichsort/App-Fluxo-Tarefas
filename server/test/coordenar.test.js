// Provedor github-models do coordenador das Actions, com a API simulada (nenhuma chamada de rede).
import { test } from "node:test";
import assert from "node:assert/strict";
import { coordenar, MODELO_PADRAO_GITHUB, semCercaDeCodigo } from "../../automacao/actions-coordenar.mjs";

const entrada = { requestId: "req-1", pedido: "Não consigo mover um cartão entre listas" };
const relatorio = { requestId: "req-1", outcome: "answered", publicText: "Arraste o cartão.", agents: ["n1"], allowedFiles: [], criteria: [], updates: [] };

test("github-models: uma chamada, com token e modelo padrão, devolve o relatório", async (t) => {
  const chamadas = [];
  t.mock.method(globalThis, "fetch", async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    return new Response(JSON.stringify({ choices: [{ message: { content: "```json\n" + JSON.stringify(relatorio) + "\n```" } }] }));
  });
  const env = { AGENT_DRY_RUN: "false", AI_PROVIDER: "github-models", AI_API_KEY: "token-de-teste" };
  assert.deepEqual(await coordenar({ env, entrada }), relatorio);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, "https://models.github.ai/inference/chat/completions");
  assert.equal(chamadas[0].opcoes.headers.authorization, "Bearer token-de-teste");
  const corpo = JSON.parse(chamadas[0].opcoes.body);
  assert.equal(corpo.model, MODELO_PADRAO_GITHUB);
  assert.deepEqual(corpo.messages.map((m) => m.role), ["system", "user"]);
});

test("github-models: erro HTTP vira falha sem ecoar a chave", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("limite", { status: 429 }));
  const env = { AGENT_DRY_RUN: "false", AI_PROVIDER: "github-models", AI_API_KEY: "token-secreto" };
  await assert.rejects(coordenar({ env, entrada }), (e) => /429/.test(e.message) && !e.message.includes("token-secreto"));
});

test("sem AGENT_DRY_RUN=false não chama a rede", async (t) => {
  const f = t.mock.method(globalThis, "fetch", async () => { throw new Error("não devia chamar"); });
  const r = await coordenar({ env: { AI_PROVIDER: "github-models" }, entrada });
  assert.equal(r.requestId, "req-1");
  assert.equal(f.mock.callCount(), 0);
});

test("semCercaDeCodigo tira só a cerca de código", () => {
  assert.equal(semCercaDeCodigo("```json\n{\"a\":1}\n```"), "{\"a\":1}");
  assert.equal(semCercaDeCodigo(" {\"a\":1} "), "{\"a\":1}");
});

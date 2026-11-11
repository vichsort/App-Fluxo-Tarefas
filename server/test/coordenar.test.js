// Provedor gemini do coordenador das Actions, com a API simulada (nenhuma chamada de rede).
import { test } from "node:test";
import assert from "node:assert/strict";
import { coordenar, MODELO_PADRAO_GEMINI, semCercaDeCodigo } from "../../automacao/actions-coordenar.mjs";

const entrada = { requestId: "req-1", pedido: "Não consigo mover um cartão entre listas" };
const relatorio = { requestId: "req-1", outcome: "answered", publicText: "Arraste o cartão.", agents: ["n1"], allowedFiles: [], criteria: [], updates: [] };
const env = { AGENT_DRY_RUN: "false", AI_PROVIDER: "gemini", AI_API_KEY: "chave-de-teste" };

test("gemini: uma chamada, com chave no cabeçalho e modelo padrão, devolve o relatório", async (t) => {
  const chamadas = [];
  t.mock.method(globalThis, "fetch", async (url, opcoes) => {
    chamadas.push({ url, opcoes });
    const texto = JSON.stringify(relatorio);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto.slice(0, 10) }, { text: texto.slice(10) }] } }] }));
  });
  assert.deepEqual(await coordenar({ env, entrada }), relatorio);
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].url, `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_PADRAO_GEMINI}:generateContent`);
  assert.equal(chamadas[0].opcoes.headers["x-goog-api-key"], "chave-de-teste");
  const corpo = JSON.parse(chamadas[0].opcoes.body);
  assert.match(corpo.systemInstruction.parts[0].text, /coordenador/);
  assert.equal(corpo.generationConfig.responseMimeType, "application/json");
});

test("gemini: erro HTTP vira falha sem ecoar a chave; modelo estranho é recusado", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("limite", { status: 429 }));
  await assert.rejects(coordenar({ env: { ...env, AI_API_KEY: "chave-secreta" }, entrada }), (e) => /429/.test(e.message) && !e.message.includes("chave-secreta"));
  await assert.rejects(coordenar({ env: { ...env, AI_MODEL: "../x" }, entrada }), /AI_MODEL/);
});

test("sem AGENT_DRY_RUN=false não chama a rede", async (t) => {
  const f = t.mock.method(globalThis, "fetch", async () => { throw new Error("não devia chamar"); });
  const r = await coordenar({ env: { AI_PROVIDER: "gemini" }, entrada });
  assert.equal(r.requestId, "req-1");
  assert.equal(f.mock.callCount(), 0);
});

test("semCercaDeCodigo tira só a cerca de código", () => {
  assert.equal(semCercaDeCodigo("```json\n{\"a\":1}\n```"), "{\"a\":1}");
  assert.equal(semCercaDeCodigo(" {\"a\":1} "), "{\"a\":1}");
});

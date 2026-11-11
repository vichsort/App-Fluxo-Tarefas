// Controlador do runtime github-actions (workflow ai-agents.yml). Sempre a partir da main. Três comandos:
//   preparar  - valida a issue, relê o estado, registra "iniciada" e entrega a entrada ao passo da IA;
//   publicar  - valida o relatório FORA do modelo e publica o resumo interno na issue;
//   falhou    - registra a incerteza quando o passo da IA não terminou (não há nova chamada paga às cegas).
// Estado recuperável = comentários do github-actions[bot] na própria issue (`fluxo:execucao`, `fluxo:resultado`).
// Este controlador nunca recebe AI_API_KEY. Título, corpo e comentários da issue são dados, nunca comandos.
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { estadosDoRobo, lerPedido, marcador, resultPathDe } from "./protocolo.mjs";
import { limpar, validarRelatorio } from "./relatorio.mjs";

const MAX_TENTATIVAS = 3;

async function gh(token, metodo, caminho, corpo) {
  const r = await fetch(`https://api.github.com${caminho}`, {
    method: metodo,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      authorization: `Bearer ${token}`,
      ...(corpo ? { "content-type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`GitHub ${metodo} ${caminho} respondeu ${r.status}`); // nunca ecoa token nem corpo
  return r.status === 204 ? null : r.json();
}

/** Texto de fora (modelo ou cliente) que vai aparecer na issue: sem menções, sem marcadores HTML. */
const seguro = (t) => limpar(t).replace(/@/g, "@​").replace(/<!--/g, "&lt;!--").replace(/-->/g, "--&gt;");

export const codificar = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
export const decodificar = (t) => JSON.parse(Buffer.from(t, "base64url").toString("utf8"));

/** Comentário de resultado: marcador (lido pelo backend) + resumo interno legível. */
export function montarComentarioResultado({ relatorio, resultPath, simulacao }) {
  return [
    marcador("resultado", { requestId: relatorio.requestId, relatorio: codificar(relatorio) }),
    `**Resumo interno**${simulacao ? " (ENSAIO: resultado simulado, sem chamar a IA)" : ""}`,
    `- Resultado: \`${relatorio.outcome}\``,
    `- Agentes (registro declarado): ${relatorio.agents.map((a) => `\`${seguro(a)}\``).join(", ") || "nenhum"}`,
    `- requestId: \`${relatorio.requestId}\``,
    `- resultPath: \`${resultPath}\` (artifact \`resultado-${relatorio.requestId}\`)`,
    relatorio.outcome === "code"
      ? `- Mudança proposta (nada foi aplicado; abrir o PR ainda não está implementado): ${relatorio.criteria.map((c) => seguro(c.description)).join("; ")}. Arquivos: ${relatorio.allowedFiles.map((f) => `\`${f}\``).join(", ")}`
      : null,
    `- Mensagem ao cliente: ${seguro(relatorio.publicText)}`,
    ...relatorio.updates.map((u) => `- ${seguro(u.agent)} (${u.id}): ${seguro(u.internalText)}`),
  ].filter(Boolean).join("\n");
}

const entrada = (env) => {
  const pasta = join(env.RUNNER_TEMP ?? ".", "fluxo");
  mkdirSync(pasta, { recursive: true });
  return pasta;
};
const sair = (env, chave, valor) => env.GITHUB_OUTPUT && appendFileSync(env.GITHUB_OUTPUT, `${chave}=${valor}\n`);

async function numeroDaIssue(env) {
  const n = env.GITHUB_EVENT_NAME === "workflow_dispatch" ? env.ISSUE_INPUT : JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")).issue?.number;
  if (!/^\d+$/.test(String(n))) throw new Error("Número da issue inválido.");
  return Number(n);
}

export async function preparar(env = process.env) {
  const { REPO: repo, GITHUB_TOKEN: token } = env;
  const numero = await numeroDaIssue(env);
  const issue = await gh(token, "GET", `/repos/${repo}/issues/${numero}`);
  const pedido = lerPedido(issue.body);
  // Origem = vínculo criado pelo backend: marcador com requestId + autor esperado. A label sozinha não prova nada.
  if (!pedido || issue.user.login !== env.AGENT_ISSUE_AUTHOR || !issue.labels.some((l) => l.name === "origin:app")) {
    console.log(`#${numero}: não é um ticket do app vinculado pelo backend, nada a fazer.`);
    return sair(env, "chamar", "false");
  }
  const comentarios = await gh(token, "GET", `/repos/${repo}/issues/${numero}/comments?per_page=100`);
  const meus = (tipo) => estadosDoRobo(comentarios, tipo).filter((e) => e.requestId === pedido.requestId);
  if (meus("resultado").length) { console.log(`#${numero}: resultado já publicado, não repito.`); return sair(env, "chamar", "false"); }

  const execucoes = meus("execucao");
  const retomar = env.RETOMAR_INPUT === "true";
  const ultima = execucoes.at(-1);
  if (ultima && !retomar) {
    // Com a fila por issue, uma execução "iniciada" sem resultado é de uma rodada que morreu no meio: estado incerto.
    if (ultima.estado === "iniciada") {
      await gh(token, "POST", `/repos/${repo}/issues/${numero}/comments`, { body: `${marcador("execucao", { requestId: pedido.requestId, estado: "incerta", run: env.GITHUB_RUN_ID })}\nA rodada anterior não terminou e não sei se a IA foi chamada. Para tentar de novo, rode o workflow com \`retomar\` = true.` });
    }
    console.log(`#${numero}: execução anterior (${ultima.estado}); use retomar para repetir.`);
    return sair(env, "chamar", "false");
  }
  if (execucoes.filter((e) => e.estado === "iniciada").length >= MAX_TENTATIVAS) {
    console.log(`#${numero}: limite de ${MAX_TENTATIVAS} tentativas atingido.`);
    return sair(env, "chamar", "false");
  }

  const tentativa = execucoes.filter((e) => e.estado === "iniciada").length + 1;
  await gh(token, "POST", `/repos/${repo}/issues/${numero}/comments`, {
    body: `${marcador("execucao", { requestId: pedido.requestId, estado: "iniciada", run: env.GITHUB_RUN_ID, tentativa })}\nExecução ${tentativa} iniciada (run ${env.GITHUB_RUN_ID}).`,
  });
  writeFileSync(join(entrada(env), "entrada.json"), JSON.stringify({ requestId: pedido.requestId, ticketId: pedido.ticketId, resultPath: pedido.resultPath, pedido: pedido.pedido, issue: numero }));
  sair(env, "chamar", "true");
  sair(env, "request_id", pedido.requestId);
}

export async function publicar(env = process.env) {
  const { REPO: repo, GITHUB_TOKEN: token } = env;
  const pasta = entrada(env);
  const dados = JSON.parse(readFileSync(join(pasta, "entrada.json"), "utf8"));
  let bruto = null;
  try { bruto = JSON.parse(readFileSync(join(pasta, "saida.json"), "utf8")).relatorio; } catch { /* vira human-review abaixo */ }
  const v = validarRelatorio(bruto, { requestId: dados.requestId, segredos: [token] });
  const relatorio = v.ok ? v.relatorio : {
    requestId: dados.requestId, outcome: "human-review",
    publicText: "Recebemos seu pedido e ele será analisado por uma pessoa da equipe.",
    agents: [], allowedFiles: [], criteria: [],
    updates: [{ id: "relatorio-invalido", agent: "controlador", internalText: `Relatório do modelo rejeitado na validação: ${v.motivo}.`, publicText: "Recebemos seu pedido e ele será analisado por uma pessoa da equipe." }],
  };
  const resultPath = resultPathDe(dados.requestId);
  await gh(token, "POST", `/repos/${repo}/issues/${dados.issue}/comments`, {
    body: montarComentarioResultado({ relatorio, resultPath, simulacao: env.AGENT_DRY_RUN !== "false" }),
  });
  writeFileSync(join(pasta, "resultado.json"), JSON.stringify(relatorio, null, 2)); // artifact; a fonte do estado é o comentário
  console.log(`#${dados.issue}: resultado ${relatorio.outcome}${v.ok ? "" : ` (relatório rejeitado: ${v.motivo})`}.`);
}

export async function falhou(env = process.env) {
  const dados = JSON.parse(readFileSync(join(entrada(env), "entrada.json"), "utf8"));
  await gh(env.GITHUB_TOKEN, "POST", `/repos/${env.REPO}/issues/${dados.issue}/comments`, {
    body: `${marcador("execucao", { requestId: dados.requestId, estado: "incerta", run: env.GITHUB_RUN_ID })}\nA chamada à IA não terminou (erro ou tempo esgotado). Não sei se ela foi consumida; nada foi repetido. Para tentar de novo, rode o workflow com \`retomar\` = true.`,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const comando = { preparar, publicar, falhou }[process.argv[2]];
  if (!comando || !process.env.REPO || !process.env.GITHUB_TOKEN) { console.error("Uso: actions-controlador.mjs preparar|publicar|falhou (REPO e GITHUB_TOKEN no ambiente)."); process.exit(1); }
  comando().catch((e) => { console.error(e.message); process.exit(1); });
}

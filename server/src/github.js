// Ponte do atendimento com o GitHub: ticket novo vira UMA issue `origin:app`.
// AGENT_RUNTIME escolhe o caminho depois da issue:
//   github-actions: o backend dispara o workflow ai-agents.yml; o resultado volta em comentários da issue.
//   github-native:  caminho antigo (Copilot), atribuído nas Actions por native-agents.yml. Não mexe em casos em andamento.
// AGENT_DRY_RUN fica ligado (só registra no log, sem chamar o GitHub) até `AGENT_DRY_RUN=false`.
// Credencial do backend: GITHUB_ISSUES_TOKEN (só do ambiente; precisa de Issues e Actions com escrita neste repositório).
import { randomUUID } from "node:crypto";
import { corpoDaIssue, estadosDoRobo } from "../../automacao/protocolo.mjs";
import { validarRelatorio } from "../../automacao/relatorio.mjs";
import { transacao } from "./db.js";

const WORKFLOW = "ai-agents.yml";

export const configGithub = () => {
  const runtime = process.env.AGENT_RUNTIME;
  return {
    ativo: runtime === "github-native" || runtime === "github-actions",
    actions: runtime === "github-actions",
    simulacao: process.env.AGENT_DRY_RUN !== "false",
    repo: process.env.GITHUB_REPO ?? "",
    token: process.env.GITHUB_ISSUES_TOKEN ?? "",
  };
};

const emAndamento = new Set();
const ultimaConsulta = new Map();

async function gh(cfg, metodo, caminho, corpo) {
  const r = await fetch(`https://api.github.com/repos/${cfg.repo}${caminho}`, {
    method: metodo,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      authorization: `Bearer ${cfg.token}`,
      ...(corpo ? { "content-type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`GitHub ${metodo} ${caminho} respondeu ${r.status}`); // sem token nem corpo na mensagem
  return r.status === 204 ? null : r.json();
}

/** Disparo explícito do workflow (o `issues: opened` pode não bastar; não dependemos dele). */
export const montarDisparo = (issueNumber) => ({
  caminho: `/actions/workflows/${WORKFLOW}/dispatches`,
  corpo: { ref: "main", inputs: { issue_number: String(issueNumber) } },
});

/** Grava uma mensagem do atendimento uma única vez: `chave` fica em `eventos`, então repetir não duplica. */
export function enviarUmaVez(db, ticketId, chave, conteudo) {
  transacao(db, () => {
    const t = db.prepare("SELECT eventos FROM ticket WHERE id = ?").get(ticketId);
    const eventos = JSON.parse(t.eventos);
    if (eventos.includes(chave)) return;
    const agora = new Date().toISOString();
    db.prepare("INSERT INTO ticket_message (id, ticket_id, role, content, criado_em) VALUES (?, ?, 'agent', ?, ?)")
      .run(randomUUID(), ticketId, conteudo, agora);
    db.prepare("UPDATE ticket SET eventos = ?, atualizado_em = ? WHERE id = ?").run(JSON.stringify([...eventos, chave]), agora, ticketId);
  });
}

/**
 * Leva o ticket adiante: (1) abre ou reencontra a issue (procura o requestId antes de criar, então uma falha no meio
 * não gera issue duplicada); (2) no runtime github-actions, dispara o workflow uma vez.
 */
export async function abrirNoGithub(db, ticketId) {
  const cfg = configGithub();
  const t = db.prepare("SELECT * FROM ticket WHERE id = ?").get(ticketId);
  if (!cfg.ativo || !t?.request_id || emAndamento.has(ticketId)) return;
  if (t.fase !== "pendente" && !(cfg.actions && t.fase === "issue")) return;
  if (cfg.simulacao) {
    console.log(`[github] SIMULAÇÃO: abriria a issue origin:app${cfg.actions ? " e dispararia ai-agents.yml" : ""} para o ticket ${ticketId} (requestId ${t.request_id}).`);
    db.prepare("UPDATE ticket SET fase = 'simulado' WHERE id = ?").run(ticketId);
    return;
  }
  if (!cfg.repo || !cfg.token) return console.error("[github] defina GITHUB_REPO e GITHUB_ISSUES_TOKEN; ticket fica pendente.");
  emAndamento.add(ticketId);
  try {
    let numero = t.issue_number;
    if (!numero) {
      const recentes = await gh(cfg, "GET", "/issues?labels=origin:app&state=all&per_page=100");
      let issue = recentes.find((i) => i.body?.includes(`requestId=${t.request_id}`));
      if (!issue) {
        const primeira = db.prepare("SELECT content FROM ticket_message WHERE ticket_id = ? ORDER BY criado_em, rowid LIMIT 1").get(ticketId);
        issue = await gh(cfg, "POST", "/issues", {
          title: `[app] ${t.title}`.slice(0, 120),
          body: corpoDaIssue({ requestId: t.request_id, ticketId, pedido: primeira.content }),
          labels: ["origin:app"],
        });
      }
      numero = issue.number;
      db.prepare("UPDATE ticket SET issue_number = ?, fase = 'issue' WHERE id = ?").run(numero, ticketId);
      enviarUmaVez(db, ticketId, "n1-recebido", "Recebemos seu pedido e ele já está com o atendimento automático. Assim que houver uma resposta, ela aparece aqui.");
    }
    if (cfg.actions) {
      const { caminho, corpo } = montarDisparo(numero);
      await gh(cfg, "POST", caminho, corpo);
      db.prepare("UPDATE ticket SET fase = 'despachado' WHERE id = ?").run(ticketId);
    }
  } catch (e) {
    console.error(`[github] ticket ${ticketId} segue pendente: ${e.message}`);
  } finally {
    emAndamento.delete(ticketId);
  }
}

/**
 * Reconciliação do runtime github-actions: lê os comentários do robô das Actions, valida de novo o relatório
 * publicado e leva as mensagens do N1 para o app (cada id de update e o resultado final saem uma vez só).
 */
export function aplicarComentarios(db, ticketId, comentarios) {
  const t = db.prepare("SELECT * FROM ticket WHERE id = ?").get(ticketId);
  const resultado = estadosDoRobo(comentarios, "resultado").find((e) => e.requestId === t.request_id);
  if (resultado) {
    let bruto = null;
    try { bruto = JSON.parse(Buffer.from(resultado.relatorio, "base64url").toString("utf8")); } catch { /* inválido: ignora */ }
    const v = validarRelatorio(bruto, { requestId: t.request_id });
    if (!v.ok) return console.error(`[github] resultado do ticket ${ticketId} rejeitado: ${v.motivo}`);
    const r = v.relatorio;
    for (const u of r.updates) enviarUmaVez(db, ticketId, `update:${u.id}`, u.publicText);
    if (r.outcome !== "working") {
      enviarUmaVez(db, ticketId, `final:${t.request_id}`, r.publicText);
      db.prepare("UPDATE ticket SET fase = 'concluido' WHERE id = ?").run(ticketId);
    }
    return;
  }
  const ultima = estadosDoRobo(comentarios, "execucao").filter((e) => e.requestId === t.request_id).at(-1);
  if (ultima?.estado === "incerta") db.prepare("UPDATE ticket SET fase = 'incerta' WHERE id = ?").run(ticketId);
}

/** Consulta simples ao GitHub (no máximo a cada 30 s por ticket) para trazer estado e resultado ao app. */
export async function sincronizar(db, ticketId) {
  const cfg = configGithub();
  const t = db.prepare("SELECT * FROM ticket WHERE id = ?").get(ticketId);
  if (!cfg.ativo || cfg.simulacao || !cfg.repo || !cfg.token || !t?.issue_number || t.fase === "concluido") return;
  if (Date.now() - (ultimaConsulta.get(ticketId) ?? 0) < 30_000) return;
  ultimaConsulta.set(ticketId, Date.now());
  try {
    const comentarios = await gh(cfg, "GET", `/issues/${t.issue_number}/comments?per_page=100`);
    if (cfg.actions) return aplicarComentarios(db, ticketId, comentarios);
    const pr = estadosDoRobo(comentarios, "pr").pop();
    if (pr) db.prepare("UPDATE ticket SET fase = 'pr', pr_number = ? WHERE id = ?").run(Number(pr.number), ticketId);
    else if (estadosDoRobo(comentarios, "atribuido").length) db.prepare("UPDATE ticket SET fase = 'atribuido' WHERE id = ?").run(ticketId);
  } catch (e) {
    console.error(`[github] não consegui sincronizar o ticket ${ticketId}: ${e.message}`);
  }
}

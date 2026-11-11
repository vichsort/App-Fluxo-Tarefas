// Validação do relatório do coordenador, feita FORA do modelo. A resposta da IA é dado não confiável:
// só o que passar aqui vira comentário na issue ou mensagem no app. Usado pelo controlador (Actions) e pelo backend.

export const OUTCOMES = ["working", "code", "answered", "waiting-customer", "commercial", "human-review"];

// Escopo de produto da política (quadro de tarefas). Workflows, login, credenciais, banco e atendimento ficam de fora.
const PERMITIDOS = [
  "client/src/TelaQuadro.jsx",
  "client/src/Lista.jsx",
  "client/src/Cartao.jsx",
  "client/src/ordem.js",
  "client/src/componentes/",
  "client/src/estilos.css",
  "server/src/quadros.js",
];

export function caminhoPermitido(p) {
  // Só letras, números, ponto, hífen, sublinhado e barra: nada de espaço, quebra de linha ou `<`/`>` (marcadores).
  if (typeof p !== "string" || !/^[A-Za-z0-9._/-]{1,200}$/.test(p) || p.startsWith("/")) return false;
  if (p.split("/").some((s) => s === "" || s === "." || s === "..")) return false;
  return PERMITIDOS.some((a) => (a.endsWith("/") ? p.startsWith(a) : p === a));
}

const PADROES_DE_SEGREDO = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/i,
];

export const contemSegredo = (t, segredos = []) =>
  PADROES_DE_SEGREDO.some((re) => re.test(t)) || segredos.some((s) => s && s.length >= 8 && t.includes(s));

/** Tira caracteres de controle; o resto do tratamento (menções, marcadores) fica para quem publica. */
export const limpar = (t) => String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

function texto(v, max, nome) {
  if (typeof v !== "string") throw new Error(`${nome} deve ser texto`);
  const t = limpar(v);
  if (t.length > max) throw new Error(`${nome} passa de ${max} caracteres`);
  return t;
}
function lista(v, max, nome) {
  if (!Array.isArray(v) || v.length > max) throw new Error(`${nome} deve ser uma lista com até ${max} itens`);
  return v;
}
function idEstavel(v) {
  if (typeof v !== "string" || !ID.test(v)) throw new Error("id inválido (use minúsculas, números e hífen)");
  return v;
}

/**
 * Confere o relatório e devolve `{ ok: true, relatorio }` (só os campos conhecidos, já normalizados)
 * ou `{ ok: false, motivo }`. Em `code`, os arquivos precisam estar no escopo de produto.
 */
export function validarRelatorio(bruto, { requestId, segredos = [] } = {}) {
  try {
    if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) throw new Error("o relatório não é um objeto");
    if (bruto.requestId !== requestId) throw new Error("requestId diferente do pedido");
    if (!OUTCOMES.includes(bruto.outcome)) throw new Error("outcome desconhecido");
    const publicText = texto(bruto.publicText, 600, "publicText");
    if (!publicText) throw new Error("publicText vazio");
    const agents = lista(bruto.agents, 10, "agents").map((a) => texto(a, 40, "agent"));
    const allowedFiles = lista(bruto.allowedFiles, 10, "allowedFiles").map((p) => texto(p, 200, "allowedFiles"));
    const criteria = lista(bruto.criteria, 5, "criteria").map((c) => ({ id: idEstavel(c?.id), description: texto(c?.description, 300, "description") }));
    const updates = lista(bruto.updates, 20, "updates").map((u) => ({
      id: idEstavel(u?.id), agent: texto(u?.agent, 40, "agent"),
      internalText: texto(u?.internalText, 1000, "internalText"), publicText: texto(u?.publicText, 600, "publicText"),
    }));
    if (new Set(updates.map((u) => u.id)).size !== updates.length) throw new Error("ids de updates repetidos");

    if (bruto.outcome === "code") {
      if (!allowedFiles.length || !criteria.length) throw new Error("code exige allowedFiles e criteria");
      const fora = allowedFiles.find((p) => !caminhoPermitido(p));
      if (fora) throw new Error(`arquivo fora do escopo de produto: ${fora}`);
    } else if (allowedFiles.length || criteria.length) {
      throw new Error("sem código, allowedFiles e criteria devem ficar vazios");
    }

    const relatorio = { requestId, outcome: bruto.outcome, publicText, agents, allowedFiles, criteria, updates };
    if (contemSegredo(JSON.stringify(relatorio), segredos)) throw new Error("o relatório parece conter uma credencial");
    return { ok: true, relatorio };
  } catch (e) {
    return { ok: false, motivo: limpar(e.message).slice(0, 200) };
  }
}

# Progresso: automação do atendimento

## Etapa 00: preparar o projeto e o acesso

- **Cópia (repositório novo, público):** https://github.com/vichsort/App-Fluxo-Tarefas
- **Origem do professor (não alterada):** https://github.com/bittencourtthulio/App-Fluxo-Tarefas-V1
- **Remote local:** `origin` aponta para a cópia acima.
- **Node:** v26.13.0 (o projeto pede `>=22.13.0`).
- **Abrir o app:** `npm run dev` (interface em http://127.0.0.1:5173, API em http://127.0.0.1:3001/api; as portas mudam se estiverem ocupadas).
- **Build:** `npm run build` terminou com sucesso (Vite, 45 módulos).
- **Dados locais:** `server/dados/` (SQLite) fica fora do Git e não foi tocado. Não existe `.env`.

### Acesso ao Copilot cloud agent

- **Pendente:** a conta `vichsort` tem Copilot no plano gratuito limitado (`free_limited_copilot`). O cloud agent exige plano pago (Pro, Pro+, Business ou Enterprise), então não está habilitado.
- Actions está habilitado no repositório (`allowed_actions: all`).
- Nenhum secret existe no repositório ainda. `COPILOT_AGENT_TOKEN` (usado só nas Actions) será criado numa etapa posterior e não deve ser confundido com a credencial local do backend.

### Fora desta etapa

Sem configuração remota, sem ticket de teste e sem `.github/agents/`.

## Etapa 03: app, issue e coordenador

- **Fluxo:** ticket novo no app → backend cria **uma** issue `origin:app` (marcador com `requestId` no corpo) → `native-agents.yml` roda o `automacao/controlador.mjs`, atribui a issue ao Copilot com `custom_agent=coordenador` e deixa um resumo interno na issue. O app mostra uma mensagem curta do N1 (uma vez só).
- **Estado no SQLite (tabela `ticket`):** `dono_id`, `issue_number`, `request_id`, `pr_number`, `fase` (`pendente`, `simulado`, `issue`, `atribuido`, `pr`) e `eventos` (mensagens já enviadas).
- **Ligar:** backend com `AGENT_RUNTIME=github-native`, `GITHUB_REPO=dono/repo`, `GITHUB_ISSUES_TOKEN` (só no ambiente). Repositório: variável `AGENT_RUNTIME=github-native`, segredo `COPILOT_AGENT_TOKEN`. `AGENT_DRY_RUN` fica `true` (padrão) até o ensaio; `false` liga de verdade.
- **Retomar:** Actions → native-agents → Run workflow com o número da issue. O controlador relê a issue e não repete atribuição nem comentário.
- **Motor antigo:** não existia nenhum, então nada foi suspenso.
- **Conferido localmente (dados fictícios, simulação):** dono lê o ticket e outros usuários não; marcador da issue vai e volta; atribuição montada no formato da doc; N1 não duplica.
- **Não conferido:** nenhuma chamada ao GitHub (criação de issue, atribuição, workflow). O cloud agent segue sem plano pago.

## Etapa 02: equipe de agents

- Perfis em `.github/agents/`: `coordenador`, `n1`, `comercial`, `po`, `desenvolvedor`, `revisor` (mais o `banco-de-dados` de antes). Todos com `target: github-copilot`, sem modelo fixo.
- O coordenador invoca os especialistas pela ferramenta `agent` e escreve o relatório JSON (`requestId`, `outcome`, `publicText`, `agents`, `allowedFiles`, `criteria`, `updates`) em `resultPath`, chamando `report_progress` a cada marco. Entrega PR, sem merge nem fechar a issue.
- O controlador (`automacao/controlador.mjs`) só repassa `requestId` e `resultPath` (agora `automacao/resultados/<requestId>.json`); ele não lê o relatório, então nenhum campo obrigatório foi removido.
- Não conferido: nenhuma sessão do Copilot rodou estes perfis (sem plano pago).

## Etapa 03 (GitHub Actions com chave de IA própria)

Substitui o caminho Copilot acima quando `AGENT_RUNTIME=github-actions`. O `native-agents.yml` só roda com `AGENT_RUNTIME=github-native`, então fica suspenso para tickets novos e não mexe em casos em andamento. Sem `COPILOT_AGENT_TOKEN`.

- **Fluxo:** ticket → backend cria a issue `origin:app` (marcador com `requestId`, autor = conta do backend) → backend dispara `ai-agents.yml` (`workflow_dispatch`; o `issues: opened` é só reforço) → job: `preparar` (valida, relê o estado, registra "iniciada") → `coordenar` (única chamada à IA, com `AI_API_KEY` e sem token do GitHub) → `publicar` (valida o relatório fora do modelo, comenta na issue) → o app lê o comentário (consulta a cada 30 s) e mostra a mensagem do N1.
- **Estado:** comentários do `github-actions[bot]` na issue (`fluxo:execucao`, `fluxo:resultado`) + colunas já existentes no SQLite (`issue_number`, `request_id`, `fase`, `eventos`). O artifact `resultado-<requestId>` é só cópia.
- **Segurança:** relatório da IA é validado (escopo de arquivos de produto, sem credenciais, tamanhos); comentário de quem não é o robô é ignorado; o pedido do cliente entra só como dado; nada é interpolado em shell; `main` confiável, sem executar código de PR.
- **Retomar:** Actions → ai-agents → Run workflow (`issue_number`, `retomar=true`). Sem `retomar`, uma execução incerta nunca chama a IA de novo. Máximo de 3 tentativas.
- **Código (`outcome: code`):** o coordenador só propõe (arquivos e critério); abrir o PR **não está implementado** (precisa de executor ou operações limitadas, etapa futura).
- **Conferido localmente (dados fictícios, simulação):** dono lê o ticket e outro usuário não; prompt montado com as instruções do coordenador/N1/Comercial/PO; disparo montado; resultado simulado vira comentário, é reconciliado e vira mensagem no app sem duplicar; comentário de terceiro é ignorado. `npm run build` e `npm test` ok.
- **Não feito:** nenhuma chamada ao GitHub nem à IA; o workflow não rodou.

### Configuração mínima para o ensaio real

1. **Provedor de IA (falta definir):** qual provedor/API você usa. Hoje `AI_PROVIDER` não tem chamada implementada (`PROVEDORES` em `automacao/actions-coordenar.mjs`); com o dado, implemento essa função.
2. **Repositório → Settings → Secrets and variables → Actions:** secret `AI_API_KEY`; variáveis `AGENT_RUNTIME=github-actions`, `AGENT_DRY_RUN=true`, `AI_PROVIDER`, `AI_MODEL` e (opcional, https) `AI_BASE_URL`. Opcional: `AGENT_ISSUE_AUTHOR` (padrão: dono do repositório).
3. **Backend local (ambiente, nunca no chat):** `AGENT_RUNTIME=github-actions`, `GITHUB_REPO=vichsort/App-Fluxo-Tarefas`, `GITHUB_ISSUES_TOKEN` (token fine-grained só deste repositório: Issues e Actions com leitura e escrita) e `AGENT_DRY_RUN=false`. No primeiro ensaio, deixe `AGENT_DRY_RUN=true` na variável do repositório: a issue e o disparo são reais, a IA é simulada.
4. **Label:** criar `origin:app` no repositório se ainda não existir (o GitHub cria ao usar em issue de quem tem permissão, mas confira).
5. **Ordem:** os arquivos novos precisam estar na `main` do GitHub (commit e push) antes do ensaio.
6. **Para abrir PR no futuro:** Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" (hoje as permissões padrão do repositório são só leitura e essa opção está desligada).

## Etapa 04: provedor GitHub Models (gratuito)

- **Provedor:** `AI_PROVIDER=github-models` implementado em `automacao/actions-coordenar.mjs` (API `https://models.github.ai/inference/chat/completions`, modelo padrão `openai/gpt-4o-mini`, trocável por `AI_MODEL`). Prompt atual: ~9 mil caracteres, dentro do limite do nível gratuito.
- **Sem segredo de IA:** o workflow `ai-agents.yml` agora tem jobs separados (`preparar` → `coordenar` → `publicar`, mais `registrar-incerteza`). Só o `coordenar` fala com a IA, e o token dele tem apenas `models: read` (não lê nem escreve issues). Os jobs com escrita na issue nunca recebem a chave. `entrada.json`/`saida.json` passam por artifacts da execução.
- **Backend:** lê `.env` na raiz se existir (modelo em `.env.example`; o ambiente tem prioridade).
- **Conferido localmente:** chamada simulada ao GitHub Models (`server/test/coordenar.test.js`), `npm test` e `npm run build`. **Não conferido:** o workflow ainda não rodou no GitHub.
- **Configurar no repositório:** variáveis `AGENT_RUNTIME=github-actions`, `AI_PROVIDER=github-models`, `AGENT_DRY_RUN=true` no ensaio e `false` depois. `AI_API_KEY` não é necessário.
- **Limite conhecido:** só a primeira mensagem do ticket vai para o atendimento; respostas seguintes no mesmo ticket ainda não disparam nova rodada.

## Etapa 05: correção automática com PR para a main

- **Quando:** o coordenador devolve `outcome: code` e a variável do repositório `AGENT_DRY_RUN` é `false`.
- **Jobs novos em `ai-agents.yml`:** `codificar` (token só com `contents: read` + `models: read`): segunda chamada à IA (`automacao/correcao.mjs`), que devolve edições de busca e troca; o script valida (só arquivos de `allowedFiles` dentro do escopo de produto, trecho exato e único, sem credencial) e aplica; depois `npm test` e `npm run build` rodam sem credencial. `abrir-pr` (escrita, sem IA e sem executar o projeto): valida de novo, faz commit em `fluxo/correcao-<requestId>`, abre PR para a `main` e comenta `fluxo:pr` na issue. **Nunca há merge automático.** Falhou em qualquer ponto → `correcao-falhou` comenta `fluxo:correcao estado=falhou`.
- **App:** com `code`, o ticket fica em `fase = 'codigo'` e o backend segue consultando; com o PR, avisa o cliente uma vez (e grava `pr_number`); com falha, avisa que uma pessoa vai cuidar.
- **Limites:** arquivos que a IA pode editar somam no máximo 16 mil caracteres (nível gratuito do GitHub Models); `estilos.css` sozinho passa disso e cai em falha → pessoa. Não cria arquivos novos.
- **Configuração:** Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests".
- **PRs abertos pelo `GITHUB_TOKEN` não disparam outros workflows** (regra do GitHub); os testes rodam no próprio job `codificar`.

## Etapa 06: troca do GitHub Models pelo Gemini

- **Motivo:** o GitHub Models foi desativado em 30/07/2026 (changelog do GitHub). O endereço ainda responde `200 OK` em texto puro, sem chamar modelo nenhum; o ensaio real falhou no `coordenar` com "OK is not valid JSON".
- **Agora:** `AI_PROVIDER=gemini` (API `generateContent`, modelo padrão `gemini-flash-lite-latest`, trocável por `AI_MODEL`). Chave do Google AI Studio no segredo `AI_API_KEY`, que só entra em `coordenar` e `codificar` (ambos só com `contents: read`). O provedor `github-models` foi removido.
- **Limite de arquivos da correção:** 60 mil caracteres (o `estilos.css` agora cabe).
- **Configurar:** secret `AI_API_KEY`; variável `AI_PROVIDER=gemini`.

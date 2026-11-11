import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { criarApp } from "./app.js";

// Configuração local opcional em .env na raiz (fora do Git; modelo em .env.example). O ambiente tem prioridade.
try { process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env")); } catch { /* sem .env: segue o ambiente */ }

const porta = Number(process.env.API_PORT ?? process.env.PORT ?? 3001);
const banco = process.env.BANCO ?? join(dirname(fileURLToPath(import.meta.url)), "..", "dados", "app.sqlite");
const { servidor } = criarApp({ banco });
servidor.listen(porta, "127.0.0.1", () => console.log(`API em http://127.0.0.1:${porta}/api`));

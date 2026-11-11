# Fluxo: o que o app faz e como usar

Fluxo é um quadro de tarefas no estilo Trello, mais uma área de atendimento. Roda local: interface React/Vite, API Node e SQLite.

## Quadros (tela principal, endereço `/quadro`)

- **Quadro:** um por projeto. Na barra lateral: criar (botão +), renomear (lápis) e excluir (lixeira). Excluir apaga listas e cartões e não dá para desfazer.
- **Lista:** coluna de etapas dentro do quadro. Criar ("Adicionar lista"), renomear (clique no nome) e excluir. Excluir apaga os cartões da lista.
- **Cartão:** título (até 200 caracteres) e descrição opcional (até 2000 na tela de edição). Criar com "Adicionar cartão" no rodapé da lista, editar (clique no título), excluir e mover.
- **Mover cartão:** arrastar para outra lista ou posição, ou menu do cartão → "Mover para" → escolher a lista (vai para o fim dela).
- Títulos de quadro e de lista têm até 120 caracteres.

## Atendimento (menu "Atendimento" na barra lateral)

- Cada ticket é uma conversa. "Novo ticket" abre a tela de mensagem; o título sai da primeira linha.
- Enter envia, Shift+Enter quebra a linha. O ticket pode ser marcado como resolvido, reaberto, renomeado ou excluído. Escrever num ticket resolvido o reabre.
- As respostas de agentes aparecem sozinhas (a tela consulta a cada 4 segundos).

## Como rodar

`npm install` uma vez, depois `npm run dev`. Interface em http://127.0.0.1:5173 e API em http://127.0.0.1:3001/api (as portas mudam se estiverem ocupadas). Exige Node 22.13 ou mais novo.

## O que o app não tem hoje

Tela de login ou contas na interface, compartilhamento de quadros, usuários diferentes por ticket, notificações, anexos e aplicativo de celular. Se o cliente pedir algo assim, diga que ainda não existe e pergunte o resultado que ele quer.

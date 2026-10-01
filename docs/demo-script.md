# Roteiro de demonstração (5–7 minutos)

Serve para gravar um vídeo/GIF ou para apresentar ao vivo. App: https://forge-ai-software-factory.vercel.app — login `tech-lead@acme-platform.example` / `demo1234` (demais contas na tela de login).

| Tempo | Cena | O que mostrar / dizer |
| --- | --- | --- |
| 0:00 | Login | Credenciais de demonstração na tela; tema claro/escuro. Mencione sessões revogáveis e 2FA opcional. |
| 0:30 | Projetos | Projeto de exemplo (protegido, com selo "Demo"). Crie um projeto novo; escolha o **provedor de IA** em *Editar projeto*. |
| 1:15 | Tarefas | Página **Tarefas**: alterne Lista/Kanban, arraste um cartão, veja a transição inválida bloqueada. Abra uma tarefa: responsável, etiquetas, dependências (sem ciclos), comentários e atividade. |
| 2:15 | Execução de IA | Dispare uma execução. Mostre a **saída do modelo ao vivo** (streaming), os 6 passos do pipeline e o estado **Aguardando aprovação**. |
| 3:00 | Aprovação | Mostre as tool calls pendentes (escrita/patch), aprove e veja o status mudar sem recarregar (SSE). Abra o diff, o resultado dos testes e os findings do revisor. |
| 4:00 | Código e conhecimento | Explorador de código (árvore, busca, diff) e a busca global (**Ctrl+K**). |
| 4:30 | Configurações (admin) | `admin@acme-platform.example`: **Usuários**, **Convites** (link de uso único), **Papéis** (matriz), **Políticas** (só dá para restringir), **Agentes** (instruções e ferramentas). |
| 5:30 | IA e custos | **Playground**: salve um dataset, crie uma nova versão, compare modelos. **Uso IA**: limites diários. |
| 6:15 | Governança | **Auditoria** (eventos de tudo o que foi feito), **Notificações** (sino), **Minha conta** (sessões, 2FA). |
| 6:45 | Fechamento | *Configurações → Demonstração → Resetar demonstração* devolve tudo ao estado inicial. Aponte `docs/architecture/c4.md` e os ADRs. |

## Gravação

- Ferramentas simples: gravação de tela do SO, ou `ffmpeg`/ScreenToGif para GIFs curtos de cada cena (largura 1280).
- Para o streaming ficar visível, suba a API com `AI_MOCK_STREAM_DELAY_MS=40`.
- Antes de gravar: *Configurações → Demonstração → Resetar demonstração*.

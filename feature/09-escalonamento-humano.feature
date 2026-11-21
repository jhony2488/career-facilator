# language: pt
Funcionalidade: Detecção de bloqueios e escalonamento para intervenção humana
  Como o mecanismo de segurança do CareerFacilator AI
  Eu quero escalar bloqueios que exigem ação humana em vez de falhar ou inventar dados
  Para que nenhuma candidatura saia com informação incorreta ou fique travada silenciosamente

  Contexto:
    Dado que uma candidatura está em execução automatizada no navegador

  Cenário: Escalonar ao detectar verificação anti-robô
    Dado que a página exibe um desafio de verificação anti-robô
    Quando o sistema detecta o desafio
    Então a candidatura muda para "NEEDS_HUMAN_INPUT"
    E o usuário é alertado para resolver o desafio manualmente

  Cenário: Escalonar ao detectar código de verificação por e-mail
    Dado que o fluxo exige um código de verificação enviado por e-mail
    Quando o sistema identifica a etapa de verificação
    Então a candidatura muda para "NEEDS_HUMAN_INPUT"
    E o estado atual da página é preservado para retomada após a verificação

  Cenário: Escalonar ao encontrar tela de login do portal
    Dado que a página da candidatura exige autenticação do usuário
    Quando o sistema identifica a tela de login
    Então a candidatura muda para "NEEDS_HUMAN_INPUT"
    E o formulário é reaberto em janela visível para o usuário se autenticar e retomar

  Cenário: Escalonar ao encontrar campo obrigatório desconhecido
    Dado que o formulário contém um campo obrigatório sem mapeamento nem resposta gerada
    Quando o sistema tenta completar a etapa
    Então nenhum dado é inventado para o campo
    E a candidatura muda para "NEEDS_HUMAN_INPUT" com o motivo registrado

  Cenário: Preservar o progresso ao escalonar
    Dado que a candidatura foi escalonada para "NEEDS_HUMAN_INPUT"
    Quando o escalonamento ocorre
    Então os campos já preenchidos e o estado da sessão são preservados
    E a candidatura entra na lista de pendências manuais do usuário

  Cenário: Retomar o fluxo após resolução humana
    Dado que uma candidatura escalonada teve o bloqueio resolvido pelo usuário
    Quando o usuário sinaliza a continuação
    Então o fluxo é retomado do ponto em que parou
    E a candidatura segue para revisão ou envio conforme o modo ativo

  Cenário: Notificar o usuário sobre candidaturas pendentes de ação
    Dado que uma ou mais candidaturas estão em "NEEDS_HUMAN_INPUT"
    Quando o ciclo de execução apresenta o resumo ao usuário
    Então as pendências são listadas com o motivo do escalonamento de cada uma

  Cenário: Timeout de espera humana serializa o estado para retomada
    Dado que uma candidatura está em "NEEDS_HUMAN_INPUT"
    Quando o tempo máximo de espera configurado é ultrapassado sem resolução
    Então o estado da página é serializado e a aba é fechada
    E a candidatura permanece na lista de pendências para retomada posterior

  Cenário: Circuit breaker pausa plataforma após escalonamentos repetidos
    Dado que a mesma plataforma acumulou o número máximo de escalonamentos do dia
    Quando uma nova candidatura para essa plataforma é avaliada
    Então a fonte é pausada até o dia seguinte
    E as demais plataformas continuam processando normalmente

# Decisão: a espera por intervenção humana tem timeout configurável
# (escalationTimeoutMinutes, default 15 min); a aba é fechada e o estado
# serializado para retomada posterior.
# Decisão: circuit breaker — após maxEscalationsPerPlatformPerDay (default 3)
# escalonamentos na mesma plataforma no dia, a fonte pausa até o dia seguinte.
# Decisão: muro de login — página com URL de auth ou campo de senha em formulário
# curto é escalonada; em headless o form reabre visível, o usuário loga e a
# candidatura é retomada com os campos refeitos (AUTOFILL_VISIBLE_ON_ESCALATION).

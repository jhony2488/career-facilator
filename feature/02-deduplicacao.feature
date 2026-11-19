# language: pt
Funcionalidade: Deduplicação de vagas em três níveis
  Como o sistema de controle de estado do CareerFacilator AI
  Eu quero bloquear vagas repetidas antes de qualquer chamada de IA
  Para não desperdiçar tokens nem me candidatar duas vezes à mesma oportunidade

  Contexto:
    Dado que o histórico local de vagas e candidaturas está disponível

  Cenário: Descartar vaga cuja URL canônica já existe no histórico
    Dado que uma vaga com a mesma URL base já foi registrada anteriormente
    Quando uma nova coleta traz a mesma URL com parâmetros de rastreamento diferentes
    Então a vaga é descartada imediatamente
    E nenhum token de IA é consumido

  Cenário: Normalizar parâmetros de rastreamento antes de comparar URLs
    Dado que uma vaga foi registrada a partir de um link limpo
    Quando a mesma vaga aparece com parâmetros de campanha na URL
    Então a comparação ignora os parâmetros de rastreamento
    E a vaga é tratada como duplicada

  Cenário: Descartar a mesma vaga publicada em plataformas diferentes
    Dado que já existe uma candidatura registrada para uma vaga da empresa "TechCorp" no LinkedIn
    Quando a mesma vaga da "TechCorp" é encontrada em outro portal com conteúdo equivalente
    Então a vaga é identificada como duplicada pelo conteúdo
    E não avança no funil

  Cenário: Permitir vaga com título igual mas conteúdo diferente na mesma empresa
    Dado que já existe registro de uma vaga de "Desenvolvedor Backend" na empresa "TechCorp"
    Quando a "TechCorp" publica outra vaga de "Desenvolvedor Backend" com descrição claramente diferente
    Então a nova vaga não é tratada como duplicada pelo conteúdo
    E segue para avaliação de cooldown por empresa

  Cenário: Bloquear nova candidatura dentro do cooldown por empresa
    Dado que já houve uma candidatura para a empresa "TechCorp" há menos dias que o período de cooldown configurado
    Quando uma vaga inédita da "TechCorp" é descoberta
    Então a vaga é bloqueada pela regra de cooldown
    E o motivo do bloqueio é registrado no histórico

  Cenário: Permitir nova candidatura após expirar o cooldown por empresa
    Dado que a última candidatura para a empresa "TechCorp" ocorreu há mais dias que o período de cooldown configurado
    Quando uma vaga inédita da "TechCorp" é descoberta
    Então a vaga segue normalmente para a triagem

  Cenário: Detectar candidatura já enviada sinalizada pela própria plataforma
    Dado que o sistema abre a página de uma vaga em um agregador autenticado
    Quando a página indica que a candidatura já foi enviada anteriormente
    Então o histórico local é atualizado para "APPLIED"
    E o fluxo daquela vaga é abortado sem consumir IA

  Cenário: Vaga totalmente inédita segue para a triagem sem custo extra
    Dado que a vaga não corresponde a nenhuma URL, conteúdo ou cooldown registrado
    Quando a verificação de duplicidade é executada
    Então a vaga é marcada como "DISCOVERED" e encaminhada à triagem

  Cenário: Detectar vaga equivalente mesmo com formatação diferente entre portais
    Dado que já existe uma candidatura registrada para uma vaga da "TechCorp"
    Quando a mesma vaga aparece em outro portal com o texto resumido e formatado de forma diferente
    Então a comparação de conteúdo ignora diferenças de formatação
    E a vaga é identificada como duplicada

  Cenário: Vaga descartada não inicia o cooldown por empresa
    Dado que uma vaga da "TechCorp" foi marcada como "SKIPPED" recentemente
    E que nenhuma candidatura foi enviada à "TechCorp" dentro do período de cooldown
    Quando uma vaga inédita da "TechCorp" é descoberta
    Então ela não é bloqueada pela regra de cooldown
    E segue normalmente para a triagem

# Decisão: "conteúdo equivalente" compara os 300 primeiros caracteres após
# normalização (minúsculas, sem pontuação, espaços extras e boilerplate).
# Decisão: o cooldown por empresa conta apenas candidaturas enviadas
# (APPLIED/APPLIED_VIA_EMAIL).

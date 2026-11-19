# language: pt
Funcionalidade: Seleção e injeção de skills dinâmicas
  Como o módulo de competências sob demanda do CareerFacilator AI
  Eu quero ativar apenas as skills relevantes para cada vaga aprovada
  Para calibrar o currículo e as respostas sem inflar o contexto de IA

  Contexto:
    Dado que existe uma biblioteca de skills com identificadores, gatilhos e prioridades
    E que a triagem de uma vaga retornou palavras-chave encontradas

  Cenário: Ativar skills cujos gatilhos coincidem com as palavras-chave da vaga
    Dado que a vaga retornou as palavras-chave "TypeScript", "Next.js" e "Remote USD"
    E que existem skills com gatilhos para essas palavras
    Quando a seleção de skills é executada
    Então as skills correspondentes são ativadas sem nenhuma chamada de IA

  Cenário: Limitar a quantidade de skills ativadas por vaga
    Dado que três ou mais skills possuem gatilhos compatíveis com a vaga
    Quando a seleção de skills é executada
    Então no máximo 2 skills são ativadas
    E as mais bem pontuadas são escolhidas

  Cenário: Prioridade da skill desempata pontuações iguais de gatilhos
    Dado que duas skills atingem o mesmo número de gatilhos coincidentes
    Quando a seleção de skills é executada
    Então a skill com maior prioridade configurada é ativada primeiro

  Cenário: Nenhuma skill ativada quando não há coincidência de gatilhos
    Dado que nenhuma skill possui gatilhos compatíveis com as palavras-chave da vaga
    Quando a seleção de skills é executada
    Então nenhum bloco de skills é injetado no contexto de geração

  Cenário: Injetar apenas o corpo das skills ativadas no contexto de geração
    Dado que as skills "fullstack-ts" e "international-remote" foram ativadas
    Quando o bloco de contexto de skills é montado
    Então apenas as instruções dessas duas skills são incluídas
    E metadados internos de configuração das skills não são enviados ao modelo

  Cenário: Registrar quais skills foram aplicadas em cada candidatura
    Dado que skills foram ativadas para uma vaga aprovada
    Quando a candidatura é preparada
    Então a combinação de skills aplicadas fica associada ao registro da candidatura
    E pode ser usada posteriormente na métrica de conversão

  Cenário: Vaga internacional ativa automaticamente a skill de mercado externo
    Dado que o escopo da vaga é internacional
    E que existe uma skill com gatilhos para vagas internacionais remotas
    Quando a seleção de skills é executada
    Então a skill de mercado internacional é ativada junto à skill técnica compatível

  Cenário: Vaga sem skill correspondente segue o funil e sugere criação
    Dado que a vaga retornou palavras-chave relevantes
    E que nenhuma skill da biblioteca possui gatilhos para elas
    Quando a seleção de skills é executada
    Então a vaga segue o funil sem bloco de skills
    E uma sugestão de nova skill é registrada para o usuário

# Decisão: sem skill correspondente, a vaga segue sem contexto extra e a criação
# de uma nova skill é sugerida ao usuário.
# Decisão: o limite de skills por vaga é configurável (maxSkillsPerJob, default 2).

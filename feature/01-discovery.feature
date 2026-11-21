# language: pt
Funcionalidade: Descoberta de vagas (Discovery Engine)
  Como o motor de prospecção do CareerFacilator AI
  Eu quero coletar vagas de múltiplas fontes (portais ATS, motores de busca e agregadores)
  Para alimentar o funil de triagem apenas com vagas inéditas e relevantes

  Contexto:
    Dado que o sistema está configurado com escopo de mercado válido
    E que a execução de descoberta é iniciada

  Cenário: Coletar vagas diretamente de portais ATS cadastrados
    Dado que existem portais ATS configurados na lista de fontes
    Quando a execução de descoberta consulta esses portais
    Então as vagas abertas são extraídas diretamente das listagens públicas
    E cada vaga é registrada com status "DISCOVERED" para verificação de duplicidade

  Cenário: Descobrir novas empresas via buscas estruturadas
    Dado que o escopo de mercado permite descoberta aberta
    Quando o sistema executa buscas estruturadas com termos e filtros do perfil
    Então apenas links diretos de vagas abertas são coletados
    E resultados que não são vagas (blogs, agregadores de spam) são ignorados

  Cenário: Varrer alertas salvos no LinkedIn com sessão autenticada
    Dado que existe uma sessão autenticada válida para o agregador
    Quando o sistema varre os alertas salvos com os filtros configurados
    Então apenas os cards de vagas dentro dos critérios são extraídos

  Cenário: Respeitar o filtro de recência configurado no agregador
    Dado que o filtro de alertas está configurado para "últimas 24 horas"
    Quando o sistema varre as vagas do agregador
    Então vagas publicadas fora da janela de recência não são coletadas

  Esquema do Cenário: Prioridade de fontes por escopo de mercado
    Dado que o escopo de mercado está configurado como "<escopo>"
    Quando a execução de descoberta monta o plano de busca
    Então as fontes utilizadas são "<fontes_esperadas>"

    Exemplos:
      | escopo         | fontes_esperadas                                        |
      | NATIONAL       | portais nacionais e ATS com filtro de região Brasil     |
      | INTERNATIONAL  | portais globais e ATS com filtro remoto internacional   |
      | BOTH           | ambos os conjuntos de fontes                            |

  Cenário: Parâmetros de busca da API são derivados da configuração vigente
    Dado que o escopo de região e os limites de coleta estão configurados
    Quando uma fonte de API suporta parâmetros de busca
    Então os parâmetros são montados a partir dessa configuração
    E nenhuma configuração adicional é exigida para ativar a busca

  Cenário: Link direto de candidatura é preferido quando a fonte o expõe
    Dado que uma fonte retorna um link de candidatura distinto da página da vaga
    Quando a vaga é registrada para o pipeline
    Então o link de candidatura é o endereço usado na etapa de aplicação

  Cenário: Fonte temporariamente indisponível não interrompe o ciclo
    Dado que uma das fontes de vagas está indisponível ou retorna erro
    Quando a execução de descoberta consulta as fontes
    Então as demais fontes continuam sendo processadas normalmente
    E a fonte com falha é registrada para nova tentativa na próxima execução

  Cenário: Vagas coletadas seguem imediatamente para deduplicação
    Dado que novas vagas foram extraídas de qualquer fonte
    Quando a etapa de descoberta conclui cada extração
    Então cada vaga é encaminhada à verificação de duplicidade antes de qualquer chamada de IA

  Cenário: Falha de todas as fontes aborta o ciclo com alerta
    Dado que nenhuma das fontes de vagas responde com sucesso
    Quando a execução de descoberta consulta as fontes
    Então o ciclo é abortado com um alerta ao usuário
    E nenhum modelo de IA é acionado

  Cenário: Respeitar o limite máximo de vagas coletadas por execução
    Dado que o limite de vagas coletadas por execução está configurado
    Quando as fontes retornam mais vagas que o limite configurado
    Então apenas até o limite configurado é coletado
    E as vagas excedentes ficam para a próxima execução

  Cenário: Extrair vagas de fonte sem listagem estruturada quando o fallback assistido está habilitado
    Dado que uma fonte cadastrada não possui listagem pública estruturada
    E que o fallback assistido de extração está habilitado
    Quando a execução de descoberta consulta essa fonte
    Então apenas vagas visíveis na página são extraídas, com dados realmente presentes
    E vagas sem link direto de candidatura são descartadas

  Cenário: Fonte sem listagem estruturada com fallback desabilitado é ignorada
    Dado que uma fonte cadastrada não possui listagem pública estruturada
    E que o fallback assistido de extração está desabilitado
    Quando a execução de descoberta consulta as fontes
    Então essa fonte é ignorada com aviso e as demais continuam sendo processadas

  Cenário: Extrator assistido herda a configuração geral de IA sem modelo dedicado
    Dado que o fallback assistido está habilitado sem modelo dedicado configurado
    Quando a extração assistida é acionada
    Então o modelo leve já configurado no sistema é utilizado

  Cenário: Coletar listagem que só existe após renderização da página
    Dado que a fonte habilitada é uma aplicação que monta vagas só via JavaScript
    Quando a coleta é executada
    Então a página é renderizada em navegador com perfil persistente
    E o login manual do usuário é reaproveitado para descobrir e preencher

# Decisão: fontes SPA (render) usam o navegador persistente do usuário — sem API.
# Decisão: falha de todas as fontes aborta o ciclo com alerta, sem consumir IA.
# Decisão: o volume máximo de vagas coletadas por execução é configurável
# (maxJobsPerRun, default 100).
# Decisão: fontes sem listagem estruturada usam o fallback assistido quando
# habilitado; desabilitado, são ignoradas com aviso — nunca quebram o ciclo.
# Decisão: o modelo do extrator é o dedicado configurado ou, vazio, o tier leve
# já configurado (AI_LOCAL_*); campos ausentes ficam vazios — nada é inventado.
# Decisão: buscas estruturadas rodam em motor de busca público configurável
# (DISCOVERY_SEARCH_ENGINE); desligado, a fonte de busca é ignorada com aviso.
# Decisão: resultados de buscador que o motor alarga além do domínio-alvo são
# descartados — só links do domínio declarado na busca entram.

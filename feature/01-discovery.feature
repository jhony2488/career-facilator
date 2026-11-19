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

  Cenário: Fonte temporariamente indisponível não interrompe o ciclo
    Dado que uma das fontes de vagas está indisponível ou retorna erro
    Quando a execução de descoberta consulta as fontes
    Então as demais fontes continuam sendo processadas normalmente
    E a fonte com falha é registrada para nova tentativa na próxima execução

  Cenário: Vagas coletadas seguem imediatamente para deduplicação
    Dado que novas vagas foram extraídas de qualquer fonte
    Quando a etapa de descoberta conclui cada extração
    Então cada vaga é encaminhada à verificação de duplicidade antes de qualquer chamada de IA

# Ambiguidade: a spec não define comportamento quando TODAS as fontes falham na
# mesma execução (abortar o ciclo com alerta? tentar novamente em N minutos?).
# Ambiguidade: não há regra para o volume máximo de vagas coletadas por execução
# (existe apenas limite diário de candidaturas, não de descobertas).

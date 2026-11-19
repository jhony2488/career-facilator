# language: pt
Funcionalidade: Triagem de vagas e cálculo de Fit Score
  Como o funil de otimização de inferência do CareerFacilator AI
  Eu quero avaliar cada vaga em camadas de custo crescente
  Para que apenas vagas realmente aderentes ao perfil consumam IA de alta precisão

  Contexto:
    Dado que o perfil profissional mestre do usuário está configurado
    E que existe uma vaga com status "DISCOVERED"

  Cenário: Descartar vaga por bloqueio determinístico antes de usar IA
    Dado que a vaga exige uma restrição eliminatória incompatível com o perfil
    Quando a filtragem determinística da camada inicial é executada
    Então a vaga é marcada como "SKIPPED"
    E nenhum modelo de IA é acionado

  Esquema do Cenário: Descartar por palavras-chave bloqueadas
    Dado que o perfil bloqueia vagas com a restrição "<restricao>"
    Quando a vaga descoberta contém essa restrição
    Então a vaga é marcada como "SKIPPED" sem custo de inferência

    Exemplos:
      | restricao                                  |
      | senioridade incompatível com o perfil      |
      | modelo 100% presencial fora da região      |
      | exigência de cidadania ou visto local      |

  Cenário: Calcular Fit Score estruturado para vaga que passou na camada zero
    Dado que a vaga não possui bloqueios determinísticos
    Quando a triagem com modelo leve é executada
    Então é produzida uma avaliação estruturada contendo Fit Score, indicativo de impedimento e palavras-chave encontradas
    E o consumo de tokens da avaliação é registrado

  Cenário: Aprovar vaga com Fit Score igual ou acima do mínimo de preparação
    Dado que o mínimo para preparar candidatura está configurado em 75
    Quando a triagem retorna Fit Score de 80 para a vaga
    Então a vaga avança no funil para seleção de skills

  Esquema do Cenário: Decisão binária na fronteira do score mínimo
    Dado que o mínimo para preparar candidatura está configurado em 75
    Quando a triagem retorna Fit Score de <score>
    Então a vaga é "<resultado>"

    Exemplos:
      | score | resultado |
      | 74    | SKIPPED   |
      | 75    | TRIAGED   |

  Cenário: Descartar vaga com impedimento declarado mesmo com score alto
    Dado que o mínimo para preparar candidatura está configurado em 75
    Quando a triagem retorna Fit Score de 90 mas sinaliza impedimento eliminatório
    Então a vaga é marcada como "SKIPPED"
    E o impedimento fica registrado como motivo do descarte

  Cenário: Pesos do Fit Score priorizam a stack principal do perfil
    Dado que o perfil tem como tecnologias centrais TypeScript e Node.js
    Quando a triagem avalia uma vaga em que essas tecnologias são apenas secundárias
    Então o eixo de stack técnica contribui com penalização no Fit Score final

  Cenário: Falha do modelo de triagem não aprova a vaga automaticamente
    Dado que a vaga passou pela filtragem determinística
    Quando o modelo leve de triagem falha ou excede o tempo limite
    Então a vaga não avança no funil
    E a falha é registrada para reprocessamento posterior

  Cenário: Vaga aprovada gera sugestão de título profissional para o currículo
    Dado que a triagem retornou Fit Score aprovado para a vaga
    Quando a avaliação estruturada é produzida
    Então ela contém uma sugestão de título profissional adequado para sistemas ATS

# Ambiguidade: a spec menciona fallback de modelos (Ollama → Groq/Flash-Lite) mas
# não define quantas tentativas ou se a vaga fica em fila de retry com status
# próprio quando todos os provedores falham.
# Ambiguidade: não está definido se o Fit Score é recalculado quando o perfil
# mestre é atualizado após a triagem.

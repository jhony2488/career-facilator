# language: pt
Funcionalidade: Escopo geográfico e filtro de elegibilidade de mercado
  Como o módulo de mercado do CareerFacilator AI
  Eu quero filtrar vagas por região, visto, modelo de contratação e moeda
  Para buscar e adaptar candidaturas ao mercado nacional, internacional ou ambos

  Contexto:
    Dado que o escopo de mercado e as restrições do usuário estão configurados

  Esquema do Cenário: Fontes de busca variam conforme o escopo ativo
    Dado que o escopo de mercado está configurado como "<escopo>"
    Quando o plano de descoberta é montado
    Então apenas vagas compatíveis com "<regiao>" são consideradas

    Exemplos:
      | escopo        | regiao                                      |
      | NATIONAL      | Brasil ou remoto nacional                   |
      | INTERNATIONAL | remoto global ou regiões internacionais     |
      | BOTH          | união dos dois conjuntos                    |

  Cenário: Bloquear vaga internacional que exige cidadania ou vínculo local
    Dado que o escopo internacional está ativo com bloqueio de exigência de visto
    Quando uma vaga exige cidadania, autorização de trabalho local ou vínculo presencial no país
    Então a vaga é descartada como inelegível antes da triagem por IA

  Esquema do Cenário: Restrições eliminatórias internacionais bloqueadas
    Dado que o escopo internacional está ativo
    Quando a vaga contém a exigência "<exigencia>"
    Então a vaga é descartada como inelegível

    Exemplos:
      | exigencia                                   |
      | US Citizens Only                            |
      | W2 only                                     |
      | Security Clearance obrigatório              |
      | patrocínio de visto indisponível            |

  Cenário: Priorizar vaga internacional compatível com fuso e contrato remoto
    Dado que o escopo internacional está ativo
    Quando uma vaga indica regime remoto compatível com o fuso das Américas ou contrato B2B
    Então a vaga segue para a triagem com prioridade de elegibilidade

  Cenário: Validar modelo de contratação no escopo nacional
    Dado que o escopo nacional está ativo com contratos aceitos "CLT" e "PJ"
    Quando uma vaga nacional indica um modelo de contratação não listado
    Então a vaga é descartada como inelegível

  Cenário: Validar cidade permitida para vaga híbrida nacional
    Dado que o escopo nacional aceita apenas modelos remotos e cidades configuradas
    Quando uma vaga é híbrida em uma cidade não permitida
    Então a vaga é descartada como inelegível

  Esquema do Cenário: Pretensão salarial preenchida conforme o mercado
    Dado que a vaga pertence ao escopo "<escopo>"
    Quando o campo de pretensão salarial é preenchido
    Então o valor utilizado é a faixa configurada em "<moeda>"

    Exemplos:
      | escopo        | moeda |
      | NATIONAL      | BRL   |
      | INTERNATIONAL | USD   |

  Cenário: Escopo internacional ativa a adaptação de idioma e contrato
    Dado que a vaga pertence ao escopo internacional
    Quando a preparação da candidatura é executada
    Então o currículo e as respostas são produzidos em inglês
    E a skill de mercado internacional é considerada na seleção

  Cenário: Vaga internacional sem região declarada é elegível com revisão obrigatória
    Dado que o escopo internacional está ativo
    Quando uma vaga não declara região nem modelo de trabalho
    Então a vaga é considerada elegível
    E é sinalizada para revisão humana, nunca enviada automaticamente

  Esquema do Cenário: Compatibilidade de fuso das Américas segue faixa fixa
    Dado que o escopo internacional prioriza o fuso das Américas
    Quando a vaga indica o fuso "<fuso>"
    Então a compatibilidade de fuso é "<resultado>"

    Exemplos:
      | fuso  | resultado   |
      | UTC-5 | compatível  |
      | UTC-3 | compatível  |
      | UTC-9 | incompatível |

# Decisão: vaga sem região nem modelo declarados é elegível com flag de revisão
# (nunca envio automático).
# Decisão: AMERICAS_TIMEZONE corresponde à faixa fixa UTC-8 a UTC-3.

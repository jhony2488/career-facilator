# language: pt
Funcionalidade: Geração de currículo adaptado e respostas dissertativas
  Como o gerador de ativos do CareerFacilator AI
  Eu quero produzir um currículo sob medida, legível por sistemas ATS, para cada vaga aprovada
  Para maximizar a aderência percebida sem reenviar o perfil completo a cada processamento

  Contexto:
    Dado que o perfil profissional mestre do usuário está configurado
    E que existe uma vaga aprovada com status "TRIAGED" e skills ativadas

  Cenário: Gerar currículo sob medida para a vaga aprovada
    Dado que a vaga possui requisitos estruturados pela triagem
    Quando a geração do currículo é executada
    Então um currículo adaptado àqueles requisitos é produzido
    E o arquivo gerado fica associado à candidatura com status "TAILORED"

  Cenário: Reutilizar o perfil mestre em cache ao processar vagas em lote
    Dado que múltiplas vagas aprovadas são processadas na mesma execução
    Quando a geração do currículo é executada para a segunda vaga em diante
    Então o perfil mestre não é reprocessado integralmente a cada vaga
    E o custo de tokens de entrada das vagas subsequentes é reduzido

  Cenário: Gerar PDF em formato compatível com leitores de ATS
    Dado que o currículo adaptado foi produzido
    Quando o documento final é compilado
    Então o PDF gerado usa layout de coluna única e texto legível por parsers de recrutamento

  Esquema do Cenário: Idioma do currículo segue o escopo da vaga
    Dado que a vaga pertence ao escopo "<escopo>"
    Quando o currículo adaptado é gerado
    Então o idioma do documento é "<idioma>"

    Exemplos:
      | escopo        | idioma                                           |
      | NATIONAL      | Português com termos técnicos mantidos em inglês |
      | INTERNATIONAL | Inglês                                           |

  Cenário: Destacar projetos conforme diretrizes da skill ativa
    Dado que a skill "fullstack-ts" está ativa para a vaga
    Quando o currículo adaptado é gerado
    Então a ordenação e o destaque de projetos seguem as diretrizes dessa skill

  Cenário: Responder pergunta dissertativa usando contexto da vaga e do perfil
    Dado que a vaga contém uma pergunta dissertativa inédita
    Quando a geração de respostas é executada
    Então uma resposta contextualizada é produzida respeitando o tamanho definido na skill ativa
    E a resposta fica pronta para preenchimento no formulário

  Cenário: Nunca inventar experiências inexistentes no perfil mestre
    Dado que a vaga exige uma competência ausente do perfil mestre
    Quando o currículo adaptado é gerado
    Então nenhuma experiência ou métrica inexistente é adicionada
    E a ausência é tratada apenas por ênfase e ordenação do que existe

  Cenário: Falha na geração mantém a candidatura aguardando reprocessamento
    Dado que o modelo de geração está indisponível
    Quando a geração do currículo é tentada
    Então a candidatura não avança para "TAILORED"
    E a falha é registrada para nova tentativa

# Ambiguidade: a spec não define o comportamento quando a resposta gerada para uma
# pergunta dissertativa tem confiança baixa — se marca a vaga para revisão humana
# ou se envia mesmo assim em modo FULL_AUTO.
# Ambiguidade: não está especificado se o currículo base (sem adaptação) pode ser
# usado como fallback quando a geração falha repetidamente.

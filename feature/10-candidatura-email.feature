# language: pt
Funcionalidade: Candidatura por e-mail quando não há formulário web
  Como o módulo de candidatura por e-mail do CareerFacilator AI
  Eu quero compor e enviar uma mensagem com o currículo adaptado para contatos de recrutamento
  Para cobrir vagas que só aceitam candidatura por e-mail

  Contexto:
    Dado que o módulo de candidatura por e-mail está ativado
    E que existe uma vaga aprovada sem formulário web de candidatura

  Cenário: Detectar canal de envio por e-mail na vaga sem formulário
    Dado que a vaga não possui campos interativos de candidatura
    Quando a inspeção da vaga encontra um endereço de contato de recrutamento
    Então o fluxo de candidatura por e-mail é iniciado

  Cenário: Priorizar endereço de recrutamento quando há múltiplos contatos
    Dado que a página da vaga contém mais de um endereço de e-mail
    Quando a resolução do destinatário é executada
    Então o endereço associado a vagas ou recrutamento é escolhido
    E endereços genéricos sem relação com contratação são descartados

  Cenário: Bloquear envio duplicado para o mesmo destinatário na janela de cooldown
    Dado que já houve envio de candidatura para o mesmo endereço dentro do período de cooldown
    Quando a resolução do destinatário é executada
    Então o envio é bloqueado
    E o motivo fica registrado no histórico

  Cenário: Compor mensagem contextualizada pela vaga e pela skill ativa
    Dado que o destinatário foi validado e a vaga possui skill ativa
    Quando a composição da mensagem é executada
    Então são gerados um assunto referente à vaga e um corpo curto com os pontos de maior aderência
    E o currículo adaptado daquela candidatura é vinculado como anexo

  Esquema do Cenário: Idioma da mensagem conforme escopo da vaga
    Dado que a vaga pertence ao escopo "<escopo>"
    Quando a composição da mensagem é executada
    Então o e-mail é redigido em "<idioma>"

    Exemplos:
      | escopo        | idioma        |
      | NATIONAL      | Português     |
      | INTERNATIONAL | Inglês        |

  Cenário: Usar currículo base como anexo quando não houver versão adaptada
    Dado que a vaga aprovada não possui currículo adaptado gerado
    Quando a composição da mensagem é executada
    Então o currículo base do perfil é anexado como alternativa

  Cenário: Exigir revisão antes do envio em modo de revisão
    Dado que a política de envio exige revisão prévia
    Quando a mensagem está composta
    Então destinatário, assunto, resumo do corpo e anexo são apresentados para aprovação
    E o envio só ocorre após confirmação do usuário

  Cenário: Enviar automaticamente quando acima do limiar de score
    Dado que a política de envio permite disparo automático acima do limiar
    E que a vaga possui Fit Score acima do limiar configurado
    Quando a mensagem está composta e as checagens de segurança passam
    Então o e-mail é enviado sem etapa de aprovação manual

  Cenário: Obter credenciais de envio apenas do cofre protegido
    Dado que o envio foi autorizado
    Quando o sistema prepara o disparo
    Então as credenciais de envio são recuperadas exclusivamente do cofre criptografado
    E nenhum dado sensível é exposto em configuração ou logs

  Cenário: Registrar a candidatura enviada por e-mail
    Dado que o e-mail foi enviado com sucesso
    Quando o envio é confirmado
    Então o histórico registra "APPLIED_VIA_EMAIL" com destinatário, assunto, anexo e data

  Cenário: Respeitar o limite diário de envios por e-mail
    Dado que o limite diário de candidaturas por e-mail foi atingido
    Quando uma nova mensagem fica pronta para envio
    Então o disparo é adiado para o próximo ciclo disponível

  Cenário: Tentar novamente após falha temporária de envio
    Dado que o envio do e-mail falhou por indisponibilidade temporária
    Quando a fila de envio processa a mensagem
    Então uma nova tentativa é agendada
    E a candidatura não é marcada como enviada até a confirmação

# Ambiguidade: a spec não define o número máximo de tentativas de reenvio nem o
# destino da candidatura se todas falharem (NEEDS_HUMAN_INPUT? FAILED?).
# Ambiguidade: não há regra para responder automaticamente a retornos do
# recrutador no mesmo thread — o módulo cobre apenas o envio inicial.

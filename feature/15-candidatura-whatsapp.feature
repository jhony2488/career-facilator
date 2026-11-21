# language: pt
Funcionalidade: Candidatura por WhatsApp quando não há formulário nem e-mail
  Como o módulo de candidatura por WhatsApp do CareerFacilator AI
  Eu quero preparar a mensagem e o currículo ou enviá-los via Evolution API
  Para cobrir vagas que só aceitam candidatura por número de WhatsApp

  Contexto:
    Dado que o módulo de candidatura por WhatsApp está ativado
    E que existe uma vaga aprovada sem formulário web de candidatura
    E que a vaga não contém e-mail de contato alcançável

  Cenário: Entrar na fila manual quando a vaga pede número de WhatsApp
    Dado que a vaga indica um número de WhatsApp para candidatura
    E que o modo de envio é a fila manual
    Quando a inspeção da vaga encontra o número
    Então a candidatura é registrada na fila de WhatsApp
    E a vaga fica como "NEEDS_HUMAN_INPUT"
    E a fila exibe o número, a mensagem pronta e o currículo a anexar

  Cenário: A mensagem da fila usa o modelo preferido do usuário
    Dado que a vaga indica um número de WhatsApp para candidatura
    Quando a mensagem é preparada para a fila manual
    Então o texto segue o modelo preferido do usuário com seus links
    E a pretensão salarial aparece quando configurada
    E dados ausentes no perfil não são inventados na mensagem

  Cenário: Enviar mensagem e currículo via Evolution API
    Dado que a vaga indica um número de WhatsApp para candidatura
    E que o modo de envio é a Evolution API configurada
    Quando a candidatura é processada
    Então a mensagem é enviada ao número pela Evolution API
    E o currículo PDF é enviado como documento anexo
    E a vaga é marcada como "APPLIED_VIA_WHATSAPP"

  Cenário: Número já contatado dentro do cooldown não recebe nova mensagem
    Dado que já existe candidatura enviada para o número dentro do período de cooldown
    Quando a inspeção da vaga encontra o mesmo número
    Então nenhuma mensagem é preparada
    E a vaga fica como "NEEDS_HUMAN_INPUT"

  Cenário: Falha transitória na Evolution API escala após as tentativas
    Dado que a vaga indica um número de WhatsApp para candidatura
    E que o modo de envio é a Evolution API configurada
    Quando a API falha por indisponibilidade temporária o número máximo de vezes
    Então a vaga fica como "NEEDS_HUMAN_INPUT"

  Cenário: E-mail vence o WhatsApp quando os dois canais existem
    Dado que a vaga indica e-mail de recrutamento e número de WhatsApp
    Quando a candidatura é processada
    Então o envio tenta o canal de e-mail primeiro
    E o WhatsApp só é usado se o e-mail não estiver alcançável

  Cenário: Confirmar o envio manual da fila de WhatsApp
    Dado que existe uma candidatura na fila manual de WhatsApp
    Quando o usuário confirma que enviou a mensagem pelo próprio WhatsApp
    Então a vaga é marcada como "APPLIED_VIA_WHATSAPP"
    E o número passa a contar no cooldown anti-duplicidade

# Decisão: modo padrão é MANUAL_QUEUE — EVOLUTION_API exige configuração explícita.
# Decisão: precedência de canal é web > e-mail > WhatsApp > NEEDS_HUMAN_INPUT.
# Decisão: o envio manual da fila é confirmado pelo usuário (revisão da fila ou
# marcação direta) — a confirmação grava o envio e ativa o cooldown por número.

# language: pt
Funcionalidade: Modos de candidatura e régua de autonomia
  Como o motor de decisão de autonomia do CareerFacilator AI
  Eu quero decidir entre envio automático e revisão humana conforme o Fit Score e o modo configurado
  Para enviar sozinho apenas candidaturas de altíssima aderência

  Contexto:
    Dado que o modo de execução e os limites de score estão configurados
    E que existe uma vaga pronta para envio com Fit Score calculado

  Esquema do Cenário: Roteamento por modo e score
    Dado que o modo de execução é "<modo>"
    E que o limite para envio automático está configurado em 88
    Quando a vaga possui Fit Score de <score>
    Então o destino da candidatura é "<destino>"

    Exemplos:
      | modo              | score | destino                                |
      | HYBRID_THRESHOLD  | 90    | envio automático                       |
      | HYBRID_THRESHOLD  | 80    | fila de revisão humana                 |
      | SEMI_AUTO         | 90    | fila de revisão humana                 |
      | FULL_AUTO         | 90    | envio automático                       |

  Cenário: Envio automático registra a candidatura completa
    Dado que a candidatura foi roteada para envio automático
    Quando o envio é concluído com sucesso
    Então o histórico registra status "APPLIED" com data, vaga e versão do currículo enviado
    E o usuário é notificado do envio

  Cenário: Candidatura na fila de revisão aguarda confirmação humana
    Dado que a candidatura foi roteada para a fila de revisão
    Quando o formulário está completamente preenchido
    Então o status muda para "READY_TO_REVIEW"
    E o envio só ocorre após aprovação explícita do usuário

  Cenário: CAPTCHA bloqueia o envio automático mesmo com score alto
    Dado que a candidatura está roteada para envio automático
    Quando a página exige resolução de verificação anti-robô
    Então o envio automático é bloqueado
    E a candidatura é escalonada para "NEEDS_HUMAN_INPUT"

  Cenário: Pergunta com confiança baixa bloqueia o envio automático
    Dado que a candidatura está roteada para envio automático
    E que uma pergunta dissertativa foi respondida com confiança insuficiente
    Quando a decisão de envio é avaliada
    Então o envio automático é bloqueado
    E a candidatura vai para revisão humana

  Cenário: Respeitar o limite diário de candidaturas
    Dado que o limite diário de candidaturas já foi atingido
    Quando uma nova vaga é aprovada para envio automático
    Então o envio é adiado para o próximo ciclo disponível
    E a candidatura permanece registrada aguardando liberação

  Cenário: Confirmação do usuário conclui candidatura em modo revisão
    Dado que uma candidatura está com status "READY_TO_REVIEW"
    Quando o usuário aprova o envio após revisar a página
    Então o envio é executado
    E o status é atualizado para "APPLIED"

  Cenário: Descarte pelo usuário encerra a candidatura sem envio
    Dado que uma candidatura está com status "READY_TO_REVIEW"
    Quando o usuário decide não enviar
    Então nenhum envio é realizado
    E a decisão fica registrada no histórico da vaga

# Ambiguidade: a spec cita travas "ex: ≥85%" no texto de FULL_AUTO mas o exemplo
# de configuração usa 88 — o valor default oficial do limiar está pendente.
# Ambiguidade: não está definido o que acontece quando o usuário abandona a
# revisão por tempo indeterminado (a candidatura expira? é reenfileirada?).

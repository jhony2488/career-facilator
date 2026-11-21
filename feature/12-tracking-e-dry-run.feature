# language: pt
Funcionalidade: Rastreamento pós-candidatura, feedback loop e modo de simulação
  Como a camada de aprendizado do CareerFacilator AI
  Eu quero acompanhar o desfecho das candidaturas e simular o funil sem enviar nada
  Para medir conversão por skill e calibrar a régua de autonomia com segurança

  Contexto:
    Dado que existem candidaturas registradas com status "APPLIED" ou "APPLIED_VIA_EMAIL"

  Cenário: Atualizar status ao receber resposta da empresa
    Dado que o monitoramento de retorno está habilitado
    Quando uma resposta identificável de uma empresa aplicada é recebida
    Então o status da candidatura correspondente é atualizado no histórico

  Esquema do Cenário: Classificação de respostas das empresas
    Dado que o monitoramento de retorno está habilitado
    Quando chega uma resposta classificada como "<tipo_resposta>"
    Então o status da candidatura muda para "<novo_status>"

    Exemplos:
      | tipo_resposta                    | novo_status        |
      | rejeição                         | REJECTED           |
      | convite para teste ou avaliação  | ASSESSMENT_INVITED |
      | convite para entrevista          | INTERVIEW          |

  Cenário: Ignorar mensagens que não pertencem a empresas aplicadas
    Dado que o monitoramento de retorno está habilitado
    Quando chega uma mensagem de remetente sem correspondência no histórico
    Então nenhum status é alterado

  Cenário: Medir conversão por combinação de skills aplicadas
    Dado que o histórico contém candidaturas com skills aplicadas e desfechos registrados
    Quando as métricas de conversão são consultadas
    Então a taxa de retorno é apresentada por combinação de skills
    E por faixa de Fit Score

  Cenário: Simular o funil completo sem enviar candidaturas
    Dado que o modo de simulação está ativado
    Quando uma execução completa é realizada
    Então busca, deduplicação, triagem, skills, geração de currículo e mapeamento de campos são executados
    Mas nenhuma ação de envio é realizada

  Cenário: Registrar o resultado simulado para calibração da régua
    Dado que uma execução em modo de simulação foi concluída
    Quando o resumo é apresentado
    Então os Fit Scores e destinos previstos de cada vaga ficam visíveis
    E nenhum status real de envio é gravado como "APPLIED"

  Cenário: Manter registros de desfecho para evoluir as skills
    Dado que candidaturas possuem desfechos registrados ao longo do tempo
    Quando o usuário revisa a biblioteca de skills
    Então é possível identificar quais skills contribuíram para entrevistas
    E ajustar suas regras com base nesse histórico

  Cenário: Monitoramento de retorno desligado por padrão até ativação do usuário
    Dado que o monitoramento de e-mail nunca foi habilitado pelo usuário
    Quando uma execução ocorre
    Então nenhuma leitura de caixa de entrada é realizada
    E o acesso solicitado é somente leitura quando o recurso é ativado

  Cenário: Resposta com classificação incerta não muda o status
    Dado que o monitoramento de retorno está habilitado
    Quando uma resposta é classificada abaixo da confiança mínima
    Então o status da candidatura não é alterado automaticamente
    E a mensagem é sinalizada para conferência do usuário

  Esquema do Cenário: Resolver manualmente uma pendência de ação humana
    Dado que existe uma candidatura pendente em "NEEDS_HUMAN_INPUT" ou "READY_TO_REVIEW"
    Quando o usuário informa o desfecho "<desfecho>" após agir por conta própria
    Então o status da candidatura muda para "<novo_status>"

    Exemplos:
      | desfecho                         | novo_status          |
      | candidatura concluída no site    | APPLIED              |
      | candidatura enviada por e-mail   | APPLIED_VIA_EMAIL    |
      | candidatura enviada por WhatsApp | APPLIED_VIA_WHATSAPP |
      | desistência da vaga              | SKIPPED              |
      | impossibilidade de se candidatar | FAILED               |

  Cenário: Registrar manualmente um desfecho recebido fora do monitoramento
    Dado que o monitoramento de retorno está desativado
    Quando o usuário registra um desfecho recebido por outro canal
    Então o status da candidatura é atualizado no histórico

  Cenário: Remover uma candidatura do histórico
    Dado que existe uma candidatura registrada que o usuário não quer mais acompanhar
    Quando o usuário remove a candidatura do histórico
    Então ela deixa de aparecer nas contagens e pendências
    E a mesma vaga pode ser descoberta novamente em uma execução futura

# Decisão: monitoramento de e-mail é opt-in com acesso somente leitura
# (IMAP/Gmail read-only).
# Decisão: classificação usa heurística primeiro e LLM leve para casos
# ambíguos; confiança mínima 0.8 para mudar status automaticamente.
# Decisão: marcação manual — o usuário resolve pendências, registra desfechos
# recebidos por fora e remove registros; envio por canal confirmado na mão
# ativa o mesmo cooldown do envio automático.

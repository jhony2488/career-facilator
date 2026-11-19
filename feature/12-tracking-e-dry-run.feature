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

# Ambiguidade: a leitura da caixa de entrada é "opcional" na spec — não está
# definido se o monitoramento é ativado por padrão nem quais permissões/escopos
# de acesso ao e-mail são exigidos.
# Ambiguidade: a classificação automática de respostas (rejeição vs. entrevista
# vs. teste) depende de IA ou heurística; o mecanismo e a confiança mínima para
# mudar status automaticamente não estão definidos.

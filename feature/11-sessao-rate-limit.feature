# language: pt
Funcionalidade: Gestão de sessão, autenticação e limitação de ritmo
  Como a camada de proteção anti-bloqueio do CareerFacilator AI
  Eu quero manter sessões autenticadas protegidas e espaçar ações de forma variável
  Para evitar bloqueios de conta por comportamento robótico

  Contexto:
    Dado que o sistema opera plataformas que exigem login

  Cenário: Reutilizar sessão autenticada persistida com segurança
    Dado que existe uma sessão válida salva para uma plataforma
    Quando o sistema acessa essa plataforma
    Então a sessão é restaurada a partir do armazenamento protegido
    E nenhum novo login é solicitado

  Cenário: Solicitar novo login quando a sessão expirou
    Dado que a sessão salva de uma plataforma está expirada ou inválida
    Quando o sistema acessa a plataforma
    Então a plataforma solicita autenticação
    E a candidatura dependente é escalonada para "NEEDS_HUMAN_INPUT"

  Cenário: Nunca persistir credenciais ou sessões sem criptografia
    Dado que uma nova sessão autenticada é criada
    Quando o estado da sessão é persistido
    Então os dados são armazenados exclusivamente em formato criptografado

  Cenário: Espaçar candidaturas com intervalo variável
    Dado que múltiplas candidaturas estão na fila de execução
    Quando uma candidatura é concluída
    Então a próxima só inicia após um intervalo aleatório dentro da faixa configurada
    E o intervalo não é uniforme entre execuções

  Cenário: Intervalo de fila simula comportamento humano
    Dado que a faixa de intervalo configurada é de 3 a 8 minutos
    Quando o sistema agenda duas candidaturas consecutivas
    Então o intervalo efetivo entre elas está dentro dessa faixa
    E nunca é inferior ao mínimo configurado

  Cenário: Manter o ritmo mesmo em modo totalmente automático
    Dado que o modo de execução é "FULL_AUTO"
    Quando várias candidaturas são aprovadas para envio automático
    Então cada envio respeita o mesmo espaçamento variável da fila

  Cenário: Rate-limit da plataforma pausa a fila daquela fonte
    Dado que a plataforma sinaliza limitação de ritmo durante o processamento da fila
    Quando o limite é detectado
    Então a fila daquela fonte é pausada com espera crescente
    E as demais fontes continuam processando normalmente

# Decisão: o cofre é um arquivo local criptografado AES-256-GCM com senha-mestra
# (sem dependência de sistema externo).
# Decisão: rate-limit aplicado pela plataforma (429, desafio de velocidade)
# pausa a fila daquela fonte com backoff exponencial; demais fontes seguem.

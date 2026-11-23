# language: pt
Funcionalidade: Preenchimento automático de formulários de candidatura
  Como o executor de candidaturas do CareerFacilator AI
  Eu quero preencher formulários web de forma determinística e assistida por IA
  Para completar a candidatura sem desperdiçar tokens em campos padronizados

  Contexto:
    Dado que existe uma vaga com status "TAILORED" e formulário web de candidatura disponível
    E que o perfil contém os dados cadastrais padrão do usuário

  Cenário: Preencher campos padronizados sem chamar IA
    Dado que o formulário contém campos reconhecidos como nome, e-mail, telefone e links profissionais
    Quando o preenchimento é executado
    Então esses campos são preenchidos com os dados do perfil sem nenhuma chamada de IA

  Cenário: Reconhecer campos padronizados por variações de rótulo
    Dado que o formulário usa rótulos diferentes para o mesmo dado do perfil
    Quando o mapeamento de campos é executado
    Então os campos são associados corretamente via sinônimos conhecidos

  Cenário: Acionar IA apenas para pergunta dissertativa inédita
    Dado que o formulário contém uma pergunta dissertativa não mapeada
    Quando o preenchimento é executado
    Então a IA é acionada somente para aquela pergunta
    E a resposta gerada na etapa de preparação é utilizada

  Cenário: Anexar o currículo adaptado gerado para a vaga
    Dado que o formulário possui um campo de envio de currículo
    Quando o preenchimento é executado
    Então o PDF adaptado gerado para aquela candidatura é anexado

  Cenário: Avançar etapas de um formulário multi-etapas
    Dado que o formulário é dividido em múltiplas telas sequenciais
    Quando uma etapa é preenchida por completo
    Então o sistema avança para a próxima etapa
    E o processo se repete até a tela final de revisão

  Cenário: Interromper o avanço quando uma etapa apresenta erro de validação
    Dado que uma etapa do formulário exibe erro de campo obrigatório após o preenchimento
    Quando o sistema tenta avançar
    Então o fluxo não prosegue para a próxima etapa
    E a candidatura é escalonada para "NEEDS_HUMAN_INPUT" com o motivo registrado

  Cenário: Preencher campos dentro de estruturas encapsuladas da página
    Dado que o formulário usa componentes encapsulados ou janelas internas
    Quando o mapeamento de campos é executado
    Então os campos internos também são identificados e preenchidos

  Cenário: Disparar eventos compatíveis com aplicações de página única
    Dado que o formulário pertence a uma aplicação que reage a eventos nativos
    Quando os campos são preenchidos
    Então os eventos esperados pela aplicação são disparados para validar os valores

  Cenário: Pausar antes do envio final conforme o modo de execução
    Dado que todos os campos foram preenchidos e a revisão está acessível
    Quando o modo de execução exige aprovação humana
    Então o fluxo pausa antes da ação de envio definitivo
    E o status muda para "READY_TO_REVIEW"

  Cenário: Campo padronizado ausente no perfil usa valor padrão configurado
    Dado que o formulário contém um campo padronizado sem dado correspondente no perfil
    E que existe um valor padrão configurado para aquele campo
    Quando o preenchimento é executado
    Então o campo é preenchido com o valor padrão configurado
    E nenhuma chamada de IA é feita para aquele campo

  Cenário: Pergunta similar a uma já respondida reusa a resposta em cache
    Dado que a pergunta dissertativa tem alta similaridade com uma pergunta já respondida
    Quando o preenchimento é executado
    Então a resposta em cache é utilizada
    E nenhuma nova geração é acionada para aquela pergunta

  Cenário: Seguir o link de candidatura quando a página da vaga não expõe formulário
    Dado que a página da vaga não contém campos de formulário
    E que existe um link ou botão de candidatura apontando para o formulário real
    Quando a inspeção da página é executada
    Então o sistema navega até o destino de candidatura
    E o formulário encontrado lá é preenchido normalmente

  Cenário: Reconhecer destino de candidatura pelo endereço do link
    Dado que a página da vaga não contém campos de formulário
    E que existe um link cujo endereço termina em "/apply" mesmo com texto genérico
    Quando a inspeção da página é executada
    Então o sistema navega até o destino de candidatura
    E o formulário encontrado lá é preenchido normalmente

  Cenário: Aguardar formulário embutido que carrega após o conteúdo da página
    Dado que a página da vaga embute o formulário em componente tardio
    Quando a inspeção da página é executada
    Então o sistema aguarda a rede estabilizar e reinspeciona
    E o formulário que apareceu é preenchido normalmente

  Cenário: Sem destino de candidatura alcançável, segue para os canais de mensagem
    Dado que a página da vaga não contém campos de formulário
    E que nenhum link de candidatura navegável é encontrado
    Quando a inspeção da página é executada
    Então a candidatura segue pelo canal de e-mail, WhatsApp ou revisão humana

  Cenário: Marcar a alternativa correspondente em pergunta de escolha única
    Dado que o formulário contém uma pergunta com alternativas de escolha única
    Quando o preenchimento é executado
    Então a alternativa correspondente à resposta resolvida é marcada
    E nenhuma outra alternativa do mesmo grupo é marcada

  Cenário: Responder ao vivo perguntas fora do escopo do perfil
    Dado que o formulário contém perguntas sem resposta por nenhuma fonte
    Quando o preenchimento é executado
    Então a IA é acionada uma única vez por etapa para todas essas perguntas
    E cada resposta gerada é registrada junto às demais respostas da candidatura

  Cenário: Pergunta obrigatória respondida só pela IA ao vivo pausa antes do envio
    Dado que uma pergunta obrigatória foi respondida apenas pela IA ao vivo
    Quando o modo de execução permite envio automático
    Então o fluxo pausa antes do envio definitivo para revisão humana

  Cenário: IA ao vivo que não sustenta resposta no perfil não inventa dados
    Dado que uma pergunta obrigatória não é coberta por nada no perfil do usuário
    Quando a IA ao vivo é consultada
    Então a pergunta segue sem resposta e a candidatura escala para "NEEDS_HUMAN_INPUT"

# Decisão: campo padronizado ausente no perfil usa o valor padrão configurável
# (fieldDefaults).
# Decisão: "pergunta conhecida" = similaridade de texto de pelo menos 90% com uma
# pergunta já respondida em cache.
# Decisão (#39): perguntas sem resposta por nenhuma fonte vão à IA uma vez por
# etapa — só o que o perfil sustenta é respondido; pergunta obrigatória
# respondida só por ela pausa antes do envio; sem resposta, escala.

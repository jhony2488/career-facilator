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

# Ambiguidade: a spec não define o comportamento quando um campo padronizado está
# ausente do perfil (ex: usuário sem pretensão salarial configurada) — se preenche
# vazio, escala para humano ou usa valor padrão.
# Ambiguidade: não há critério para distinguir "pergunta dissertativa conhecida"
# (respondida por respostas padrão em cache) de "inédita" (requer nova geração).

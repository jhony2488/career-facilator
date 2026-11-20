# language: pt
Funcionalidade: Ingestão de perfil a partir de currículos em PDF
  Como o módulo de intake do CareerFacilator AI
  Eu quero transformar os documentos enviados pelo usuário em um perfil-mestre editável e revisado
  Para que triagem e tailoring usem apenas as habilidades reais do usuário, sem inventar nada

  Contexto:
    Dado que existe uma área de entrada de documentos e um perfil-mestre editável

  Cenário: Extrair currículo depositado na área de entrada
    Dado que o usuário deposita um PDF de currículo na área de entrada
    Quando o documento é processado
    Então um rascunho do perfil é gerado com os dados extraídos do documento
    E o rascunho fica pendente de revisão pelo usuário

  Cenário: Importar currículo por comando explícito
    Dado que o usuário indica o caminho de um PDF de currículo
    Quando a importação é executada
    Então um rascunho do perfil é gerado a partir daquele documento
    E o rascunho fica pendente de revisão pelo usuário

  Cenário: Aprovação humana ativa o perfil-mestre
    Dado que existe um rascunho de perfil pendente de revisão
    Quando o usuário aprova o rascunho
    Então o rascunho se torna o perfil-mestre ativo
    E as próximas execuções passam a usar a nova versão

  Cenário: Perfil anterior permanece ativo enquanto o rascunho não é aprovado
    Dado que existe um rascunho pendente e um perfil-mestre já aprovado
    Quando o sistema executa triagem ou geração de ativos
    Então a versão aprovada anterior continua sendo usada como fonte

  Cenário: Nunca inferir dados ausentes no documento
    Dado que o PDF do usuário não informa pretensão salarial nem idiomas
    Quando o documento é processado
    Então esses campos ficam vazios no rascunho gerado
    E nenhum valor é inventado ou presumido

  Cenário: Documento sem texto legível não gera dados
    Dado que o usuário fornece um PDF digitalizado sem camada de texto
    Quando o documento é processado
    Então nenhum rascunho com dados inventados é criado
    E o usuário é alertado de que o documento não pôde ser lido

  Cenário: Mesclar novo documento com o perfil existente
    Dado que já existe um perfil-mestre ativo
    E que o usuário escolhe mesclar ao importar um novo PDF
    Quando o documento é processado
    Então os dados novos são somados ao rascunho sem apagar o que já existe
    E trechos conflitantes são sinalizados para decisão do usuário

  Cenário: Substituir o perfil preservando histórico
    Dado que já existe um perfil-mestre ativo
    E que o usuário escolhe substituir ao importar um novo PDF
    Quando o usuário aprova o novo rascunho
    Então o perfil-mestre é substituído pela nova versão
    E a versão anterior permanece disponível no histórico

  Cenário: Edição manual do perfil-mestre é adotada
    Dado que o usuário editou manualmente o perfil-mestre aprovado
    Quando uma nova execução do sistema ocorre
    Então o conteúdo editado passa a valer como fonte da verdade

  Cenário: Atualização do perfil invalida dados derivados
    Dado que o perfil-mestre ativo mudou após uma aprovação
    Quando a nova versão entra em vigor
    Então os dados derivados em cache da versão anterior são invalidados
    E os resultados que dependem do perfil ficam marcados para recálculo

  Cenário: Candidaturas usam apenas o perfil aprovado
    Dado que uma vaga aprovada exige uma competência ausente do perfil-mestre
    Quando os materiais de candidatura são gerados
    Então nenhuma habilidade ou experiência inexistente é adicionada
    E somente o conteúdo do perfil-mestre ativo é utilizado

  Cenário: Trecho extraído com baixa confiança entra marcado no rascunho
    Dado que um trecho do documento foi extraído com confiança insuficiente
    Quando o rascunho é gerado
    Então o trecho aparece marcado como de baixa confiança para revisão
    E o usuário decide mantê-lo ou removê-lo na aprovação

  Cenário: Aprovação gera snapshot da versão anterior no histórico
    Dado que existe um perfil-mestre ativo e um rascunho aprovado
    Quando a aprovação é executada
    Então um snapshot da versão anterior é gravado no histórico
    E cada aprovação gera um novo snapshot

  Cenário: Perfil atualizado regenera materiais de candidaturas pendentes
    Dado que existem candidaturas com status "TAILORED" ou "READY_TO_REVIEW"
    Quando um novo perfil-mestre é aprovado
    Então os materiais dessas candidaturas são regenerados com o perfil novo
    E os Fit Scores pendentes são recalculados

  Cenário: Documento já processado não é reimportado
    Dado que um PDF na área de entrada já foi processado numa varredura anterior
    Quando uma nova varredura da área de entrada ocorre
    Então o documento não é processado novamente
    E ele permanece arquivado na área de processados

# Decisão: trechos extraídos com baixa confiança entram no rascunho marcados
# para revisão — o usuário decide na aprovação.
# Decisão: o histórico guarda um snapshot por aprovação.
# Decisão: perfil atualizado regenera materiais de TAILORED/READY_TO_REVIEW e
# recalcula Fit Scores pendentes (alinhado a 03-triagem-fit-score).
# Decisão: todo arquivo varrido na área de entrada é arquivado em processados —
# legível ou não — para nunca ser reprocessado nem alertado duas vezes.

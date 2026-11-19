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

# Ambiguidade: a spec não define confiança mínima da extração — se trechos
# reconhecidos com baixa confiança entram no rascunho marcados ou são omitidos.
# Ambiguidade: não está definida a granularidade do histórico de versões
# (a cada aprovação? a cada importação? com limite de retenção?).
# Ambiguidade: não está definido o efeito da atualização do perfil sobre
# candidaturas já em "TAILORED" ou "READY_TO_REVIEW" geradas com a versão antiga.

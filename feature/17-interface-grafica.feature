# language: pt
Funcionalidade: Interface gráfica local (dashboard web + app desktop)
  Como usuário do CareerFacilator AI
  Quero configurar, monitorar e operar tudo por uma interface visual
  Sem precisar da linha de comando — e o CLI deve seguir funcionando igual

  Contexto:
    Dado que a interface gráfica é um servidor local embutido no próprio binário
    E ela responde apenas em loopback com um token de sessão por execução

  Cenário: Abrir a interface no navegador
    Quando executo o comando de interface
    Então um servidor local sobe em loopback com porta livre
    E o navegador padrão abre o dashboard já autenticado
    E encerrar o processo desliga o servidor

  Cenário: Modo headless para o app desktop
    Quando o app desktop inicia
    Então ele executa o modo somente-servidor do binário
    E conecta a janela nativa na URL autenticada
    E fechar o app encerra o processo da interface junto

  Cenário: API rejeita chamadas sem token
    Dado que o servidor da interface está no ar
    Quando uma requisição à API chega sem o token de sessão
    Então ela é rejeitada como não autorizada

  Cenário: Ler e editar configuração pela interface
    Dado que o servidor da interface está no ar
    Quando consulto a listagem de configuração
    Então cada chave aparece com sua fonte na cadeia de precedência
    E valores sensíveis (chaves, senhas, tokens) saem mascarados
    Quando salvo uma chave nova ou editada
    Então ela é gravada no arquivo de configuração do diretório de dados
    E passa a valer como no comando de configuração do CLI

  Cenário: Monitorar vagas e fila de revisão
    Quando consulto o painel de vagas
    Então vejo as contagens por status e a lista filtrável
    E a fila traz os itens que aguardam decisão humana
    Quando marco um item como aplicado, e-mail, whatsapp, pulado ou falhou
    Então o status persiste igual ao comando de marcação do CLI

  Cenário: Executar comandos com saída ao vivo
    Quando peço para rodar um comando de operação pela interface
    Então o próprio binário é executado como subprocesso com os mesmos argumentos
    E a saída é transmitida ao vivo para a tela
    E eu posso enviar respostas de entrada (perguntas interativas) e encerrar o processo

  Cenário: Cofre sem expor segredos
    Quando consulto o cofre pela interface
    Então vejo apenas as referências salvas, nunca os valores
    Quando salvo uma credencial nova
    Então ela é cifrada no mesmo cofre usado pelo CLI

  Cenário: Perfil-mestre pela interface
    Quando consulto o perfil pela interface
    Então vejo o perfil-mestre atual e o rascunho pendente, se houver
    Quando envio um PDF de currículo
    Então ele entra na inbox e a ingestão roda como no CLI
    E editar o mestre recompila o artefato derivado automaticamente

  Cenário: Seleção de idioma
    Quando alterno o idioma da interface
    Então todos os rótulos mudam entre português e inglês

  Cenário: Interface embutida no executável standalone
    Dado que o binário standalone foi gerado com os assets da interface
    Quando executo o comando de interface
    Então o dashboard funciona igual ao modo desenvolvimento
    E os comandos rodam subprocessos do próprio binário standalone

  Cenário: App desktop distribuído separadamente
    Quando instalo o pacote do app desktop
    Então ele já inclui o binário do CLI e o runtime como recursos internos
    E a instalação é independente do pacote de linha de comando

# Ambiguidade: formulários que exigem prompt em terminal herdam a mesma
# semântica via stdin da task — UI mostra a pergunta e encaminha a resposta.

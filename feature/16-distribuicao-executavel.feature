# language: pt
Funcionalidade: Distribuição e paridade do executável standalone
  Como o empacotamento do CareerFacilator AI
  Eu quero que o binário distribuído execute os mesmos comandos da instalação por código
  Para que o usuário final tenha o sistema completo sem precisar instalar Node.js

  Contexto:
    Dado que o usuário executa o sistema a partir do binário distribuído para seu sistema operacional

  Cenário: Executar os mesmos comandos da instalação por código
    Dado que o ambiente de recursos do executável está completo
    Quando o usuário executa qualquer comando disponível na CLI
    Então o comportamento observado é o mesmo da instalação por código
    E nenhum comando exige Node.js ou dependências do projeto no ambiente

  Cenário: Aplicar a configuração gravada ao lado do executável
    Dado que existe um arquivo de configuração na pasta do executável
    Quando um comando lê a configuração efetiva
    Então os valores do arquivo da pasta do executável prevalecem sobre o do diretório de trabalho
    E variáveis de ambiente definidas pelo usuário continuam acima de qualquer arquivo

  Cenário: Manter os dados do usuário ao lado do executável
    Dado que a pasta do executável declara o diretório de dados como relativo
    Quando o sistema resolve o local dos dados do usuário
    Então histórico, perfil, sessões e configurações ficam na pasta do próprio executável
    E independente do diretório de trabalho de onde o binário foi chamado

  Cenário: Recursos completos com o ambiente de recursos presente
    Dado que a pasta de recursos do executável está presente e completa
    Quando uma vaga exige formulário web, renderização autenticada, leitura de PDF ou OCR de imagem
    Então o recurso correspondente funciona da mesma forma que na instalação por código

  Cenário: Degradar com segurança sem o ambiente de recursos
    Dado que a pasta de recursos do executável está ausente
    Quando uma vaga exige formulário web
    Então a candidatura segue para os canais de mensagem ou para "NEEDS_HUMAN_INPUT" com aviso
    E os demais fluxos — busca, triagem, e-mail, WhatsApp e fila de revisão — seguem inalterados

  Cenário: Diagnosticar o estado do ambiente de recursos
    Dado que o usuário quer conferir o que está disponível ao lado do executável
    Quando o usuário solicita o diagnóstico do ambiente de recursos
    Então é apresentado o estado de cada componente — módulos, navegadores, dados de OCR e skills
    E é indicada a ação corretiva quando algo está ausente

  Cenário: Preparar o ambiente de recursos pelo próprio executável
    Dado que a pasta de recursos do executável está ausente e há acesso à internet
    Quando o usuário solicita a preparação do ambiente de recursos
    Então o pacote correspondente ao sistema operacional é obtido do release da versão em uso
    E os componentes ficam disponíveis para os próximos comandos

  Cenário: Falha na preparação não corrompe o estado existente
    Dado que a preparação do ambiente de recursos falha no meio
    Quando o comando é interrompido ou o download não conclui
    Então uma mensagem acionável é apresentada ao usuário
    E nenhum dado do usuário ou configuração é alterado

  Esquema do Cenário: Biblioteca de skills junto ao executável
    Dado que a pasta de skills está "<estado>" ao lado do executável
    Quando uma vaga passa pela seleção de skills
    Então a seleção "<resultado>"

    Exemplos:
      | estado    | resultado                                          |
      | presente  | injeta as skills relevantes da biblioteca distribuída |
      | ausente   | segue sem skills, como na instalação sem biblioteca   |

# Decisão: os recursos que não cabem no binário single-file (navegadores,
# leitores de PDF/OCR e módulos com arquivos internos) formam uma pasta de
# runtime ao lado do executável (`career-runtime/`) — nunca embutidos no
# binário; sem ela, o sistema degrada para os canais de mensagem e revisão.
# Decisão: a configuração na pasta do executável vale acima do arquivo de
# configuração do diretório de trabalho e abaixo das variáveis de ambiente;
# diretório de dados relativo ancora na pasta do executável (modo portátil).
# Decisão: a preparação do ambiente é um comando da própria CLI
# (`runtime setup|status`) que baixa o pacote publicado no release
# correspondente à versão em uso — o pacote completo (zip) continua sendo a
# forma recomendada de instalação.

# CareerFacilator AI — Documentação (PT-BR)

**Sistema Autônomo de Prospecção, Triagem Semântica, Adaptação de Currículos e Candidatura Assistida com Otimização de Inferência**

English version available in [`../en/`](../en/README.md).

## Índice

| # | Documento | Conteúdo |
|---|-----------|----------|
| 01 | [Visão Geral](01-visao-geral.md) | Filosofia do sistema e o Funil de Otimização de Inferência em 3 camadas |
| 02 | [Arquitetura](02-arquitetura.md) | Diagrama do pipeline, stack tecnológica e estrutura de diretórios |
| 03 | [Otimização de IA](03-otimizacao-de-ia.md) | Limpeza de DOM, schemas Zod, prompt caching e preenchimento híbrido |
| 04 | [Fluxo e Segurança](04-fluxo-e-seguranca.md) | Máquina de estados no SQLite e Human-in-the-Loop |
| 05 | [Skills Dinâmicas](05-skills-dinamicas.md) | Módulo `src/skills/`: registry, selector, injector e formato SKILL.md |
| 06 | [Discovery e Deduplicação](06-discovery-e-deduplicacao.md) | Fontes de vagas (APIs/RSS/fallback LLM), registry e deduplicação em 3 níveis |
| 07 | [Modos de Candidatura](07-modos-de-candidatura.md) | FULL_AUTO, SEMI_AUTO, HYBRID_THRESHOLD e régua de Fit Score |
| 08 | [Escopo Geográfico](08-escopo-geografico.md) | Módulo `src/geo/`: mercado nacional, internacional ou híbrido |
| 09 | [Configuração](09-configuracao.md) | `careerOps.config.ts` completo e fluxo de execução atualizado |
| 10 | [Confiabilidade](10-confiabilidade.md) | Sessões, wizards multi-etapas, escalonamento humano, tracking e dry-run |
| 11 | [Candidatura por E-mail](11-candidatura-por-email.md) | Fallback de envio de currículo via SMTP/API para vagas sem formulário |
| 12 | [Roadmap](12-roadmap.md) | Próximos passos de implementação |
| 13 | [Ingestão de Perfil](13-ingestao-de-perfil.md) | Módulo `src/intake/`: PDF → perfil-mestre em Markdown com revisão humana |
| 14 | [Configurar SMTP — Gmail/Outlook](14-configurar-smtp-gmail-outlook.md) | Guia de senha de app, cofre de credenciais e teto de 45 e-mails/dia |
| 15 | [Candidatura por WhatsApp](15-candidatura-por-whatsapp.md) | Fila manual ou Evolution API com texto em template + PDF do currículo |
| 16 | [Tutoriais](../../tutorials/pt-BR/README.md) | Guias passo a passo de instalação (repositório, npm global, binários de release), configuração de modelos de IA, descoberta de vagas e sequência sugerida de uso |

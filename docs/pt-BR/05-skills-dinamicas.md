# 8. Módulo de Skills Dinâmicas (`src/skills/`)

**Injeção Modular de Competências, Regras de Domínio e Estratégias de Candidatura Sob Demanda**

## 8.1. Visão Geral e Otimização de Contexto

Em vez de manter um System Prompt gigantesco com instruções para todos os tipos de vagas (Frontend, Backend, Mobile, IA, DevOps, Freelance, Gringa/Remote), o Módulo de Skills divide o conhecimento tático em arquivos isolados e leves (`SKILL.md` + `keywords.json`).

Para economizar tokens:

- **Descoberta em Dois Estágios (Progressive Disclosure):** Na triagem inicial, a IA recebe apenas o manifesto mínimo (`id`, `name`, `triggers`) de cada skill (~15 tokens por skill).
- **Carregamento Seletivo:** Apenas após o `triageAgent.ts` identificar a stack e o tipo da vaga, o Skill Loader injeta as instruções completas das 1 ou 2 skills estritamente necessárias no `tailorerAgent.ts`.
- **Skills Reutilizáveis e Criáveis:** O usuário pode criar novas skills em Markdown ou deixar que o sistema gere automaticamente uma nova skill a partir de feedbacks de entrevistas.

## 8.2. Estrutura de Diretórios do Módulo

```text
career-facilitator-ts/
└── src/
    └── skills/
        ├── core/
        │   ├── skillRegistry.ts     # Indexa skills disponíveis e extrai metadados leves
        │   ├── skillSelector.ts     # Seleciona quais skills ativar (RegEx + Score semântico)
        │   └── skillInjector.ts     # Compila as instruções ativas no prompt com cache
        └── library/
            ├── fullstack-ts/
            │   ├── SKILL.md         # Regras de destaque para Next.js, React, Node, Prisma/SQL
            │   └── keywords.json    # Sinônimos ATS e métricas de impacto sugeridas
            ├── ai-engineer/
            │   ├── SKILL.md         # Foco em RAG, LLMs locais, quantização, agentes e Python/TS
            │   └── keywords.json
            ├── international-remote/
            │   ├── SKILL.md         # Adaptação para vagas em inglês (B2B/Contractor, USD, timezone)
            │   └── keywords.json
            └── gupy-workday-ats/
                ├── SKILL.md         # Regras de formatação estrita para parsers ATS rígidos
                └── keywords.json
```

## 8.3. Formato Padrão de uma Skill (`SKILL.md`)

Cada skill é declarativa e legível tanto por humanos quanto pela LLM:

```markdown
---
id: fullstack-ts
name: Full-Stack TypeScript & SaaS Architect
triggers: [typescript, next.js, react, node, express, prisma, postgresql, full-stack, saas]
priority: 10
---

# Diretrizes de Adaptação de Currículo
- **Posicionamento:** Destaque experiência ponta a ponta (arquitetura de banco relacional até UI reativa).
- **Métricas Obrigatórias:** Priorize entregas com impacto mensurável (ex: redução de latência, deploy automatizado via Docker/CI, arquitetura multi-tenant).
- **Ordenação de Projetos:** Coloque no topo projetos SaaS completos com autenticação, pagamentos ou dashboards analíticos.

# Regras para Perguntas Dissertativas (Q&A)
- Ao responder sobre arquitetura, mencione explicitamente princípios SOLID, tipagem estrita end-to-end e testes automatizados.
- Mantenha respostas diretas entre 60 e 110 palavras.
```

## 8.4. Implementação Core em TypeScript

### `src/skills/core/skillSelector.ts` (Seleção Determinística — Custo Zero de IA)

Seleciona as skills relevantes cruzando as `matchedKeywords` retornadas pela triagem com os `triggers` das skills, evitando gastar tokens com um agente roteador extra:

```typescript
import { SkillMetadata, LoadedSkill } from './skillRegistry';

export function selectRelevantSkills(
  matchedKeywords: string[],
  availableSkills: SkillMetadata[],
  maxSkills = 2
): SkillMetadata[] {
  const normalizedKeywords = matchedKeywords.map((k) => k.toLowerCase().trim());

  const scored = availableSkills
    .map((skill) => {
      const hits = skill.triggers.filter((trigger) =>
        normalizedKeywords.some((kw) => kw.includes(trigger) || trigger.includes(kw))
      ).length;

      return {
        skill,
        score: hits * 10 + skill.priority,
        hits,
      };
    })
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSkills).map((item) => item.skill);
}
```

### `src/skills/core/skillInjector.ts` (Injeção Otimizada no Prompt)

Carrega o corpo do `SKILL.md` apenas das skills selecionadas e formata um bloco compacto para o `tailorerAgent.ts`:

```typescript
import fs from 'node:fs/promises';
import { SkillMetadata } from './skillRegistry';

export async function buildSkillsContextBlock(selectedSkills: SkillMetadata[]): Promise<string> {
  if (selectedSkills.length === 0) return '';

  const blocks = await Promise.all(
    selectedSkills.map(async (meta) => {
      const rawContent = await fs.readFile(meta.filePath, 'utf-8');
      // Remove o frontmatter YAML para não desperdiçar tokens
      const cleanInstructions = rawContent.replace(/^---[\s\S]*?---\n/, '').trim();
      return `### SKILL ATIVA: ${meta.name}\n${cleanInstructions}`;
    })
  );

  return `\n<active_skills>\n${blocks.join('\n\n')}\n</active_skills>\n`;
}
```

## 8.5. Integração no Fluxo do Pipeline

No arquivo `src/db/schema.ts`, adicionamos a coluna `appliedSkills` na tabela `applications` para rastrear quais skills geraram maior taxa de resposta/entrevista:

1. `triageAgent.ts` extrai `matchedKeywords`: `["TypeScript", "Next.js", "PostgreSQL", "Remote USD"]`.
2. `skillSelector.ts` ativa automaticamente `fullstack-ts` e `international-remote` (**0 tokens gastos na seleção**).
3. `skillInjector.ts` anexa apenas essas duas diretrizes ao prompt do `tailorerAgent.ts`, gerando um currículo e respostas perfeitamente calibrados para aquela vaga específica.
4. **Telemetria de Conversão:** O banco registra quais combinações de skills resultaram em entrevistas agendadas, permitindo refinar continuamente as regras em `src/skills/library/`.

---

« [Anterior: Fluxo e Segurança](04-fluxo-e-seguranca.md) | [Índice](README.md) | [Próximo: Discovery e Deduplicação →](06-discovery-e-deduplicacao.md)

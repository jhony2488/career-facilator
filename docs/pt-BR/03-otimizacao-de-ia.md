# 5. Estratégias de Otimização de Uso da IA (Core)

## 5.1. Limpeza Agressiva de Contexto (`domCleaner.ts`)

Antes de qualquer chamada de IA, o HTML da vaga passa por um pipeline de sanitização que remove tags `<script>`, `<style>`, `<svg>`, menus e rodapés, convertendo apenas o container principal da descrição em Markdown compacto. Isso reduz uma página média de **18.000 tokens para ~900 tokens**.

## 5.2. Schemas Estritos com Zod (`triageAgent.ts`)

Evita respostas longas e conversacionais da LLM na etapa de análise, forçando um JSON mínimo:

```typescript
import { z } from 'zod';

export const JobTriageSchema = z.object({
  fitScore: z.number().min(0).max(100).describe('Aderência técnica e de senioridade de 0 a 100'),
  isDealbreaker: z.boolean().describe('True se exigir idioma, localização ou stack impossível'),
  missingSkills: z.array(z.string()).max(5),
  matchedKeywords: z.array(z.string()).max(10),
  atsTitleSuggestion: z.string().describe('Título profissional ideal para o topo do currículo'),
});

export type JobTriageResult = z.infer<typeof JobTriageSchema>;
```

Fallback de provedores: a triagem tenta o modelo local primeiro e usa a nuvem como reserva; se **todos** os provedores falharem, a vaga vai para `NEEDS_HUMAN_INPUT` — nunca é aprovada por falta de avaliação.

## 5.3. Prompt Caching para o Currículo Mestre (`tailorerAgent.ts`)

O `profile.master.json` — artefato compilado a partir do `profile.master.md` aprovado pelo usuário (ver [Ingestão de Perfil](13-ingestao-de-perfil.md)), contendo todo o histórico profissional, projetos, métricas e respostas comportamentais — é enviado como bloco de sistema com **Cache Ephemeral / Prefix Caching**. Ao processar 30 vagas em lote, o sistema paga o processamento do perfil completo apenas na primeira vaga, obtendo desconto de **75% a 90% nos tokens de entrada** das 29 vagas seguintes.

## 5.4. Preenchimento Híbrido (`deterministicMatcher.ts`)

Campos comuns de formulários de candidatura (Nome, E-mail, Telefone, LinkedIn, GitHub, Portfólio, Pretensão Salarial, Disponibilidade) são resolvidos localmente via dicionário de sinônimos em TypeScript (**0 chamadas de IA**). A LLM só é invocada quando o inspetor detecta uma `<textarea>` com pergunta dissertativa inédita (ex: "Conte sobre um desafio técnico complexo que você resolveu").

---

« [Anterior: Arquitetura](02-arquitetura.md) | [Índice](README.md) | [Próximo: Fluxo e Segurança →](04-fluxo-e-seguranca.md)

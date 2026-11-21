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

## 5.5. Otimizações para modelos locais pequenos (3B)

O sistema suporta modelos locais pequenos (ex.: `hermes3:latest` via Ollama) com três otimizações combinadas:

**Filtro léxico pré-triagem (`lexicalMatch.ts`)** — antes de qualquer chamada à Camada 1, `computeLexicalFit` conta quantos termos do perfil (stack + títulos) aparecem na vaga. Abaixo de `LEXICAL_MIN_TERMS` (default 1) a vaga é descartada como `LOW_LEXICAL_FIT` — **zero inferência gasta** em vagas sem overlap.

**RAG do perfil (`rag/profileRetriever.ts`)** — o tailor deixa de receber o perfil inteiro em JSON (~2–4k tokens). `chunkProfile` divide o perfil em trechos rotulados (experiências, projetos, stack, respostas padrão) e `retrieveRelevant` devolve só os relevantes à vaga por ranking BM25-like + esqueleto sempre-incluso. `retrieveHybrid` funde o ranking léxico com embeddings Ollama (`AI_EMBEDDINGS_ENABLED` + `nomic-embed-text`) via Reciprocal Rank Fusion — léxico permanece o default de custo zero.

**Streaming + JSON garantido (`ollamaClient.ts`, `jsonRepair.ts`)** — o client real chama `/api/chat` com `format:'json'` (saída estruturada forçada, crítico para 3B), `keep_alive` (modelo quente), `options` via env e **streaming NDJSON** com `onToken` — o CLI exibe o progresso em tempo real (`--verbose`). Quando o modelo devolve prosa ao redor do JSON, `generateStructured` extrai o objeto balanceado e faz 1 retry corretivo com o erro de validação.

**Providers remotos (`openaiCompatibleClient.ts`)** — um único adapter cobre qualquer endpoint OpenAI-compatível (`POST /chat/completions`): deepseek, groq, openai, kimi/moonshot, openrouter, together, gemini-compat, ou outro via `<P>_BASE_URL`. Streaming **SSE** alimenta `onToken`/`onThought` (`delta.reasoning_content` p/ deepseek-reasoner), `stream_options.include_usage` reporta `usage` → métricas do run; `format` vira `response_format` `json_schema` com retry para `json_object` quando o provider rejeita (400); `num_predict`→`max_tokens`. Anthropic/Gemini nativos seguem sem adapter.

**Match de título em duas camadas (`titleMatcher.ts`)** — compara o título da vaga com `JOB_TITLES` antes da triagem. A camada **determinística** (custo zero, sempre ativa) resolve as variações comuns de escrita: normalização (acento/pontuação/case), *squashed* substring ("Fullstack" ↔ "Full Stack"), aliases PT↔EN (`dev`/`developer`/`desenvolvedor`/`engineer`/`engenheiro` → token canônico), *containment* de tokens distintivos (genéricos como `dev`/`senior` não contam — "Backend" ≠ "Frontend") e Levenshtein proporcional p/ typos (desligado em títulos <6 chars). Quando nada casa, a camada **probabilística** — com `AI_EMBEDDINGS_ENABLED` — calcula cosine similarity entre embeddings (`nomic-embed-text`): "JS Developer" ou "Programador React" casam com "Node.js Developer"/"Desenvolvedor Front End" sem nenhuma regra manual. Vetores dos alvos são cacheados por run (N vagas = N+1 embeds); match forte determinístico nem chama o embedder; falha dele degrada silenciosamente pro determinístico.

---

« [Anterior: Arquitetura](02-arquitetura.md) | [Índice](README.md) | [Próximo: Fluxo e Segurança →](04-fluxo-e-seguranca.md)

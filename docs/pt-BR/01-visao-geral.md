# 1. Visão Geral e Filosofia de Otimização de IA

O **CareerFacilator AI** automatiza o ciclo ponta a ponta de busca e candidatura a vagas de emprego (LinkedIn, Greenhouse, Lever, Gupy, Workday e portais próprios).

Diferente de abordagens ingênuas que enviam o HTML inteiro da página para uma LLM cara a cada vaga, o sistema opera sob um **Funil de Otimização de Inferência em 3 Camadas**:

## Camada 0 — Determinística (Custo Zero / 0ms)

- Extração limpa via seletores/Readability
- Deduplicação por hash
- Filtragem rígida por palavras-chave bloqueadas (ex: senioridade incompatível, presencial fora da região)
- Cálculo inicial de aderência léxica (TF-IDF / BM25)

## Camada 1 — Modelos Leves / Locais (Baixo Custo / Alta Velocidade)

- Uso de modelos quantizados locais (Ollama / ONNX) com fallbacks para APIs ultra-rápidas (ex: Groq / Llama-3-8B / Gemini Flash-Lite)
- Extrai requisitos estruturados em JSON (Structured Outputs) e calcula o **Fit Score**
- Apenas vagas com score ≥ 75% avançam

## Camada 2 — Modelos de Raciocínio + Prompt Caching (Alta Precisão)

- Acionada apenas para as vagas aprovadas na triagem
- Utiliza **Prompt Caching** para manter o Master CV e o portfólio do usuário em cache na memória da API (reduzindo em até 80% o custo de tokens de entrada)
- Gera o currículo adaptado (ATS-friendly) e responde perguntas dissertativas específicas da vaga

---

« [Índice](README.md) | [Próximo: Arquitetura →](02-arquitetura.md)

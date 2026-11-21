# 1. Overview and AI Optimization Philosophy

**CareerFacilator AI** automates the end-to-end cycle of searching for and applying to job openings (LinkedIn, Greenhouse, Lever, Gupy, Workday and proprietary portals).

Unlike naive approaches that send the entire page HTML to an expensive LLM for every job, the system operates under a **3-Layer Inference Optimization Funnel**:

## Layer 0 — Deterministic (Zero Cost / 0ms)

- Clean extraction via selectors/Readability
- Hash-based deduplication
- Strict filtering by blocked keywords (e.g.: incompatible seniority, on-site outside the region)
- Initial lexical match calculation (TF-IDF / BM25)

## Layer 1 — Lightweight / Local Models (Low Cost / High Speed)

- Uses local quantized models (Ollama / ONNX) with fallbacks to cheap OpenAI-compatible APIs (e.g.: DeepSeek / Groq / OpenRouter)
- Extracts structured requirements in JSON (Structured Outputs) and calculates the **Fit Score**
- Only jobs with score ≥ 75% advance

## Layer 2 — Reasoning Models + Prompt Caching (High Precision)

- Triggered only for jobs approved in triage
- Uses **Prompt Caching** to keep the Master CV and the user's portfolio cached in the API memory (reducing input token cost by up to 80%)
- Generates the tailored (ATS-friendly) resume and answers job-specific essay questions

---

« [Index](README.md) | [Next: Architecture →](02-architecture.md)

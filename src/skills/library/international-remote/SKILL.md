---
id: international-remote
name: International Remote
priority: 5
triggers: [remote, worldwide, usd, latam, contractor, anywhere, remote-first, international, async, fuso, timezone]
---

# International Remote — Instruções de Tailoring

Aplique estas regras quando a vaga for remota para mercado internacional (escopo `INTERNATIONAL`):

1. **Idioma do currículo:** gerar em `en-US` (o localeAdapter decide — esta skill garante que nenhum trecho em PT escape para o corpo, incluindo seções como "Experiências" → "Experience").
2. **Título ATS:** manter o título em inglês do perfil; não transliterar cargo PT ("Desenvolvedor" → "Software Engineer").
3. **Sinalizadores remotos:** se o perfil declara experiência com times distribuídos/async, elevar para o resumo. Fuso compatível com o time do contratante (BRT vs. AMERICAS/EU) é um ponto a mencionar no resumo quando a vaga citar timezone.
4. **Contratação:** se a vaga for contractor/C2C e o perfil tem CNPJ PJ, mencionar disponibilidade de contrato internacional PJ — apenas se constar nas respostas padrão; caso contrário, não inventar.
5. **Moeda:** pretensão salarial internacional usa `salaryExpectationUSD` — nunca converter o valor BRL por câmbio próprio.
6. **Respostas padrão:** usar as versões em inglês de `standardAnswers`; campo ausente permanece em branco/`NÃO_INFORMADO`, não é traduzido nem inventado.

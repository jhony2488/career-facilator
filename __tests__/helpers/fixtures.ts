/** Input fixtures — sample job HTML, SKILL.md, compiled master profile (profile.master.json). */

export const SAMPLE_JOB_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Senior Full-Stack Engineer at TechCorp</title>
  <style>.nav { color: red; }</style>
  <script>window.tracker = {};</script>
</head>
<body>
  <nav><a href="/">Home</a><a href="/jobs">Jobs</a></nav>
  <header><svg><path d="M0 0"/></svg> TechCorp</header>
  <main id="job-description">
    <h1>Senior Full-Stack Engineer</h1>
    <p>TechCorp is hiring a Senior Full-Stack Engineer.</p>
    <ul>
      <li>TypeScript, Next.js, Node.js</li>
      <li>PostgreSQL, Prisma</li>
      <li>Fully remote, worldwide, contractor (B2B)</li>
      <li>USD 4,000–6,000/month</li>
    </ul>
    <p>Describe a complex technical challenge you solved.</p>
  </main>
  <aside class="ads"><script>showAds();</script>Advertisement</aside>
  <footer>© 2026 TechCorp · Privacy · Cookies</footer>
  <script>analytics.track('pageview');</script>
</body>
</html>`;

export const SAMPLE_SKILL_MD = `---
id: fullstack-ts
name: Full-Stack TypeScript & SaaS Architect
triggers: [typescript, next.js, react, node, express, prisma, postgresql, full-stack, saas]
priority: 10
---

# Resume Tailoring Guidelines
- **Positioning:** Highlight end-to-end experience.
- **Mandatory Metrics:** Prioritize measurable impact.
- **Project Ordering:** SaaS projects with auth/payments first.

# Rules for Essay Questions (Q&A)
- Mention SOLID principles and end-to-end strict typing.
- Keep answers between 60 and 110 words.
`;

export const SAMPLE_SKILL_NO_FRONTMATTER = `# Plain Instructions
- No frontmatter in this skill.
`;

export const BLOCKING_TEXTS = {
  usCitizens: 'This position is open to US Citizens Only.',
  w2Only: 'W2 only. No C2C or contractors.',
  clearance: 'Active Security Clearance required.',
  visaUnavailable: 'We are unable to sponsor visas for this role.',
  onsite: 'This is a 100% onsite position in São Paulo.',
  latamFriendly: 'Fully remote — LATAM friendly, async-first, contractor B2B.',
};

export const NATIONAL_JOB_DESCRIPTION =
  'Desenvolvedor(a) Full-Stack Sênior. TypeScript, Node.js, React. Modelo remoto, contratação PJ. Pretensão salarial em R$.';

export const INTL_JOB_DESCRIPTION =
  'Senior Full-Stack Engineer. TypeScript, Node.js, React. Fully remote worldwide, contractor B2B, USD salary.';

export const EMAIL_ONLY_JOB_TEXT = `
Senior Backend Engineer — TechCorp
Apply by sending your resume to careers@techcorp.io.
For general questions contact info@techcorp.io.
Billing inquiries: finance@techcorp.io.
`;

/** Text extracted from the text layer of a resume PDF (input to src/intake/). */
export const SAMPLE_CV_TEXT = `
Dev Tester
dev@example.com · +55 81 99999-0000
linkedin.com/in/devtester · github.com/devtester · devtester.dev

Senior Full-Stack TypeScript Engineer

EXPERIÊNCIA
Senior Full-Stack Engineer — TechCorp (2021 — atual)
- Liderou migração multi-tenant
- -40% latency

PROJETOS
SaaS Analytics — Multi-tenant dashboard platform (-40% latency)

FORMAÇÃO
Ciência da Computação — UFPE (2014 — 2018)

IDIOMAS
Português, Inglês

STACK
TypeScript, Node.js, Next.js, PostgreSQL
`;

/** CV variant with no salary expectation or languages section — for the "never infer" scenario. */
export const SAMPLE_CV_TEXT_SPARSE = `
Dev Tester
dev@example.com

EXPERIÊNCIA
Senior Full-Stack Engineer — TechCorp (2021 — atual)
- Liderou migração multi-tenant

STACK
TypeScript, Node.js
`;

/** Approved master profile in Markdown — format compiled by profileCompiler. */
export const SAMPLE_MASTER_MD = `# Dev Tester

## Dados Pessoais
- E-mail: dev@example.com
- Telefone: +55 81 99999-0000
- LinkedIn: https://linkedin.com/in/devtester
- GitHub: https://github.com/devtester
- Portfólio: https://devtester.dev

## Resumo
Senior Full-Stack TypeScript Engineer

## Experiências
### Senior Full-Stack Engineer — TechCorp (2021 — atual)
- Liderou migração multi-tenant
- -40% latency

## Projetos
### SaaS Analytics
Multi-tenant dashboard platform
- -40% latency

## Habilidades
- Stacks: TypeScript, Node.js, Next.js, PostgreSQL
- Idiomas: Português, Inglês

## Formação
- Ciência da Computação — UFPE (2014 — 2018)

## Respostas Padrão
- Disponibilidade: Imediata
- Pretensão salarial: A combinar conforme faixa do mercado
`;

/** "Scanned" PDF — the reader returns pages but no extractable text. */
export const SCANNED_PDF_RESULT = { text: '', pages: 3 };

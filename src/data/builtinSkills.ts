import type { NovaSkill } from '../types/nova';

export const BUILTIN_NOVA_SKILLS: NovaSkill[] = [
  {
    id: 'skill-programming-expert',
    name: 'Programming Expert',
    description: 'Clean modular architecture, type-safe code, security hardening, and performance optimization.',
    instructions:
      'Analyze existing architecture before coding. Write clean, modular, type-safe implementations with explicit input validation, edge-case handling, and clear time/space complexity awareness.',
    triggers: ['code', 'typescript', 'javascript', 'python', 'bug', 'refactor', 'api', 'function', 'debug', 'react'],
    autoDetect: true,
    enabled: true,
    builtIn: true,
    category: 'Engineering',
  },
  {
    id: 'skill-academic-tutor',
    name: 'Academic Tutor',
    description: 'First-principles pedagogy, intuitive analogies, step-by-step mastery checks, and clear study plans.',
    instructions:
      'Teach from first principles before introducing jargon. Break complex theories into intuitive mental models, provide concrete worked examples, and conclude with a concise self-check question.',
    triggers: ['study', 'explain', 'learn', 'exam', 'concept', 'homework', 'tutor', 'quiz', 'course'],
    autoDetect: true,
    enabled: false,
    builtIn: true,
    category: 'Education',
  },
  {
    id: 'skill-research-analyst',
    name: 'Research Analyst',
    description: 'Multi-source verification, conflicting claims audit, citation rigor, and fact-vs-assumption separation.',
    instructions:
      'Cross-verify claims across independent sources, separate verified facts from assumptions, highlight contradictory evidence, and cite sources transparently.',
    triggers: ['research', 'compare', 'sources', 'citation', 'verify', 'report', 'market', 'evidence'],
    autoDetect: true,
    enabled: false,
    builtIn: true,
    category: 'Research',
  },
  {
    id: 'skill-pdf-specialist',
    name: 'PDF Specialist',
    description: 'Document structuring, executive PDF formatting, page hierarchy, and summarization workflows.',
    instructions:
      'Structure long-form material into clean executive headings, concise scannable paragraphs, crisp bullet checklists, and tabular takeaways ready for PDF/DOCX export.',
    triggers: ['pdf', 'document', 'summary', 'whitepaper', 'brief', 'export', 'manual'],
    autoDetect: true,
    enabled: false,
    builtIn: true,
    category: 'Documents',
  },
  {
    id: 'skill-ui-ux-designer',
    name: 'UI/UX Designer',
    description: 'Accessible WCAG AA contrast, responsive grids, typographic hierarchy, and zero-clutter interaction flows.',
    instructions:
      'Design accessible interfaces with clear visual hierarchy, responsive breakpoints, >=44px mobile touch targets, balanced whitespace, and functional interactive states.',
    triggers: ['ui', 'ux', 'design', 'layout', 'css', 'tailwind', 'component', 'prototype', 'dashboard'],
    autoDetect: true,
    enabled: false,
    builtIn: true,
    category: 'Design',
  },
  {
    id: 'skill-data-analyst',
    name: 'Data Analyst',
    description: 'Quantitative reasoning, anomaly detection, table normalization, SQL/spreadsheet formulas, and charts.',
    instructions:
      'Clean and normalize datasets explicitly, inspect distributions and outliers, surface actionable trends in tables, and note sample-size or measurement caveats.',
    triggers: ['data', 'csv', 'xlsx', 'spreadsheet', 'metrics', 'chart', 'sql', 'analytics', 'statistics'],
    autoDetect: true,
    enabled: false,
    builtIn: true,
    category: 'Data',
  },
  {
    id: 'skill-technical-writer',
    name: 'Technical Writer',
    description: 'Crisp API specs, onboarding READMEs, changelog clarity, and developer-first examples.',
    instructions:
      'Write unambiguous technical documentation anchored on exact request/response payloads, prerequisites, error codes, and copy-pasteable minimal examples.',
    triggers: ['docs', 'documentation', 'readme', 'spec', 'guide', 'changelog', 'endpoint'],
    autoDetect: true,
    enabled: false,
    builtIn: true,
    category: 'Writing',
  },
  {
    id: 'skill-math-assistant',
    name: 'Mathematics Assistant',
    description: 'Rigorous proofs, symbolic derivations, dimensional checks, and verified step-by-step solutions.',
    instructions:
      'State given equations and domain constraints clearly, verify each algebraic transformation line by line, double-check arithmetic/units, and clearly box the final result.',
    triggers: ['math', 'equation', 'integral', 'derivative', 'matrix', 'proof', 'probability', 'calculate', 'algebra'],
    autoDetect: true,
    enabled: false,
    builtIn: true,
    category: 'STEM',
  },
];

export function detectRelevantSkills(prompt: string, skills: NovaSkill[]): NovaSkill[] {
  const lower = String(prompt || '').toLowerCase();
  if (!lower.trim()) return [];
  return skills.filter(
    (s) =>
      s.autoDetect &&
      s.triggers.some((t) => {
        const kw = t.trim().toLowerCase();
        return kw.length > 0 && lower.includes(kw);
      })
  );
}

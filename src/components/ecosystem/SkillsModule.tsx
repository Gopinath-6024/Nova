import React, { useRef, useState } from 'react';
import {
  Check,
  Download,
  Edit3,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { detectRelevantSkills } from '../../data/builtinSkills';
import type { NovaSkill } from '../../types/nova';

interface SkillsModuleProps {
  skills: NovaSkill[];
  onSaveSkill: (skill: NovaSkill) => void;
  onDeleteSkill: (id: string) => void;
  onImportSkills: (imported: NovaSkill[]) => void;
}

export const SkillsModule: React.FC<SkillsModuleProps> = ({
  skills,
  onSaveSkill,
  onDeleteSkill,
  onImportSkills,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Custom');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [triggersText, setTriggersText] = useState('');
  const [autoDetect, setAutoDetect] = useState(true);
  const [testPrompt, setTestPrompt] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const startEdit = (s: NovaSkill) => {
    setEditingId(s.id);
    setName(s.name);
    setCategory(s.category);
    setDescription(s.description);
    setInstructions(s.instructions);
    setTriggersText(s.triggers.join(', '));
    setAutoDetect(s.autoDetect);
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setCategory('Custom');
    setDescription('');
    setInstructions('');
    setTriggersText('');
    setAutoDetect(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !instructions.trim()) return;
    const triggers = triggersText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 16);
    const existing = skills.find((s) => s.id === editingId);
    onSaveSkill({
      id: existing ? existing.id : `skill-custom-${Date.now()}`,
      name: name.trim(),
      category: category.trim() || 'Custom',
      description: description.trim() || 'Custom specialized skill',
      instructions: instructions.trim(),
      triggers,
      autoDetect,
      enabled: existing ? existing.enabled : true,
      builtIn: existing ? existing.builtIn : false,
    });
    resetForm();
  };

  const handleExport = () => {
    const json = JSON.stringify(skills, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nova-skills.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (Array.isArray(parsed)) {
        const cleaned: NovaSkill[] = parsed
          .filter((s) => s?.name && s?.instructions)
          .map((s, idx) => ({
            id: String(s.id || `skill-imp-${Date.now()}-${idx}`),
            name: String(s.name).slice(0, 100),
            description: String(s.description || 'Imported skill').slice(0, 300),
            instructions: String(s.instructions).slice(0, 4000),
            triggers: Array.isArray(s.triggers) ? s.triggers.map(String).slice(0, 16) : [],
            autoDetect: s.autoDetect !== false,
            enabled: Boolean(s.enabled),
            builtIn: false,
            category: String(s.category || 'Imported'),
          }));
        if (cleaned.length > 0) onImportSkills(cleaned);
      }
    } catch {
      // ignore invalid json
    }
  };

  const matchedPreview = testPrompt.trim() ? detectRelevantSkills(testPrompt, skills) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            NOVA Skills — Modular AI Capabilities
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Toggle multiple active skills simultaneously, auto-detect relevant domain expertise on prompts, or create/import custom skill definitions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImport(f);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 px-3 text-xs font-medium"
          >
            <Upload className="h-3.5 w-3.5" />
            <span>Import JSON</span>
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Skills</span>
          </button>
        </div>
      </div>

      {/* Auto-Detection Live Tester */}
      <div className="rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Zap className="h-4 w-4 text-violet-500" />
          <span>Auto-Detection Simulator</span>
        </div>
        <input
          type="text"
          value={testPrompt}
          onChange={(e) => setTestPrompt(e.target.value)}
          placeholder="Type a sample prompt (e.g. 'Optimize my TypeScript SQL query and export a PDF summary')..."
          className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3.5 text-xs focus:border-violet-400 focus:outline-none"
        />
        {testPrompt.trim() && (
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {matchedPreview.length > 0
              ? `Auto-activated for this prompt: ${matchedPreview.map((m) => m.name).join(' · ')}`
              : 'No keyword triggers matched; manual enabled skills still apply.'}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Create / Edit Skill */}
        <form
          onSubmit={handleSave}
          className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {editingId ? 'Edit Skill' : 'Create Custom Skill'}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-violet-600 dark:text-violet-300 hover:underline"
              >
                New Instead
              </button>
            )}
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Skill Name (e.g. Legal Contract Reviewer)"
            required
            className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category"
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs px-2">
              <input
                type="checkbox"
                checked={autoDetect}
                onChange={(e) => setAutoDetect(e.target.checked)}
                className="accent-violet-600"
              />
              <span>Auto-detect prompt</span>
            </label>
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short purpose description"
            className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
          />
          <input
            type="text"
            value={triggersText}
            onChange={(e) => setTriggersText(e.target.value)}
            placeholder="Trigger keywords comma-separated (contract, clause, nda)"
            className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs focus:border-violet-400 focus:outline-none"
          />
          <textarea
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Specialized system instructions applied whenever this skill is active..."
            required
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-xs focus:border-violet-400 focus:outline-none"
          />
          <button
            type="submit"
            className="flex w-full min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-violet-600 text-xs font-semibold text-white hover:bg-violet-500"
          >
            {editingId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            <span>{editingId ? 'Save Skill Changes' : 'Create Skill'}</span>
          </button>
        </form>

        {/* Right: Multi-Skill Workflow Stack */}
        <section className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className={`rounded-2xl border p-4 space-y-2.5 transition-colors ${
                skill.enabled
                  ? 'border-violet-500/50 bg-violet-600/8 dark:bg-violet-600/15'
                  : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#120D1F]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {skill.name}
                    </h3>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {skill.category} · {skill.builtIn ? 'Built-in' : 'Custom'} ·{' '}
                    {skill.autoDetect ? 'Auto-match' : 'Manual'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSaveSkill({ ...skill, enabled: !skill.enabled })}
                  className={`min-h-[30px] rounded-lg px-2.5 text-xs font-semibold shrink-0 ${
                    skill.enabled
                      ? 'bg-violet-600 text-white'
                      : 'border border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {skill.enabled ? 'Active' : 'Enable'}
                </button>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                {skill.description}
              </p>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Triggers: {skill.triggers.join(', ') || 'None'}
              </div>
              <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-slate-200 dark:border-white/8">
                <button
                  type="button"
                  onClick={() => startEdit(skill)}
                  className="flex min-h-[30px] items-center gap-1 rounded-lg px-2 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <Edit3 className="h-3 w-3" />
                  <span>Edit</span>
                </button>
                {!skill.builtIn && (
                  <button
                    type="button"
                    onClick={() => onDeleteSkill(skill.id)}
                    className="flex min-h-[30px] items-center gap-1 rounded-lg px-2 text-xs text-rose-600 dark:text-rose-300 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3 w-3" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

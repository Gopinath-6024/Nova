import React, { useMemo, useRef, useState } from 'react';
import {
  Archive,
  Check,
  Edit3,
  FileText,
  Folder,
  FolderPlus,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { ChatSession, NovaProject, ProjectDocument } from '../../types/nova';

interface ProjectsModuleProps {
  projects: NovaProject[];
  activeProjectId: string | null;
  sessions: ChatSession[];
  onSelectActiveProject: (projectId: string | null) => void;
  onCreateProject: (data: { name: string; description: string; instructions: string }) => void;
  onUpdateProject: (id: string, next: Partial<NovaProject>) => void;
  onDeleteProject: (id: string) => void;
  onOpenProjectChat: (projectId: string, existingSessionId?: string) => void;
}

export const ProjectsModule: React.FC<ProjectsModuleProps> = ({
  projects,
  activeProjectId,
  sessions,
  onSelectActiveProject,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onOpenProjectChat,
}) => {
  const [selectedId, setSelectedId] = useState<string>(activeProjectId || projects[0]?.id || '');
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newInstructions, setNewInstructions] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(projects.length === 0);

  const [editingName, setEditingName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [activeFolder, setActiveFolder] = useState<string>('All');
  const fileUploadRef = useRef<HTMLInputElement>(null);

  const visibleProjects = useMemo(
    () =>
      projects.filter((p) => {
        if (!showArchived && p.archived) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.instructions.toLowerCase().includes(q) ||
          p.documents.some(
            (d) =>
              d.name.toLowerCase().includes(q) ||
              d.excerpt.toLowerCase().includes(q)
          )
        );
      }),
    [projects, searchQuery, showArchived]
  );

  const currentProject =
    projects.find((p) => p.id === selectedId) ?? visibleProjects[0] ?? null;

  const projectSessions = useMemo(
    () =>
      currentProject
        ? sessions.filter((s) => s.projectId === currentProject.id)
        : [],
    [currentProject, sessions]
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateProject({
      name: newName.trim(),
      description: newDesc.trim(),
      instructions: newInstructions.trim(),
    });
    setNewName('');
    setNewDesc('');
    setNewInstructions('');
    setShowCreateForm(false);
  };

  const handleUploadDoc = async (files: FileList) => {
    if (!currentProject) return;
    const folder = activeFolder === 'All' ? 'General' : activeFolder;
    const docs: ProjectDocument[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      let text = '';
      if (f.type.startsWith('text/') || /\.(md|txt|json|csv|ts|tsx|js|py|html)$/i.test(f.name)) {
        text = (await f.text()).slice(0, 12000);
      } else {
        text = `Attached binary file (${f.type || 'document'}, ${Math.max(1, Math.round(f.size / 1024))} KB)`;
      }
      docs.push({
        id: `pdoc-${Date.now()}-${i}`,
        name: f.name,
        folder,
        sizeLabel: `${Math.max(1, Math.round(f.size / 1024))} KB`,
        mimeType: f.type || 'text/plain',
        excerpt: text.slice(0, 280),
        content: text,
        addedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
    }
    if (docs.length === 0) return;
    const nextFolders = currentProject.folders.includes(folder)
      ? currentProject.folders
      : [...currentProject.folders, folder];
    onUpdateProject(currentProject.id, {
      folders: nextFolders,
      documents: [...docs, ...currentProject.documents],
      activity: [
        {
          id: `act-${Date.now()}`,
          action: 'Uploaded Documents',
          detail: `Added ${docs.map((d) => d.name).join(', ')} to ${folder}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...currentProject.activity,
      ].slice(0, 30),
    });
  };

  const filteredDocs = useMemo(() => {
    if (!currentProject) return [];
    return currentProject.documents.filter((d) => {
      const folderOk = activeFolder === 'All' || d.folder === activeFolder;
      const qOk =
        !searchQuery.trim() ||
        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.content.toLowerCase().includes(searchQuery.toLowerCase());
      return folderOk && qOk;
    });
  }, [activeFolder, currentProject, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-5">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            NOVA Projects — Isolated Workspaces
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Maintain strict per-project context, dedicated instructions, folders, documents, and isolated chat histories.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeProjectId && (
            <button
              type="button"
              onClick={() => onSelectActiveProject(null)}
              className="min-h-[40px] rounded-xl border border-slate-200 dark:border-white/15 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
            >
              Exit Project Context
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-violet-400/25 bg-white dark:bg-[#120D1F] p-5 space-y-3"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Create New Isolated Project</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project Name (e.g. FinTech Risk API)"
              required
              className="min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3.5 text-sm text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Short project description"
              className="min-h-[42px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3.5 text-sm text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
            />
          </div>
          <textarea
            rows={3}
            value={newInstructions}
            onChange={(e) => setNewInstructions(e.target.value)}
            placeholder="Project-specific AI instructions (only applied when this project is active)..."
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-xs text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 px-3 text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[38px] rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500"
            >
              Create Project
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Project List & Search */}
        <section className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-4 space-y-3">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects & documents..."
              className="w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] pl-8 pr-3 text-xs text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span className="tabular-nums">{visibleProjects.length} projects</span>
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-violet-600 dark:text-violet-300 hover:underline"
            >
              {showArchived ? 'Hide Archived' : 'Show Archived'}
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-white/8">
            {visibleProjects.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                No projects match. Create a project above to organize isolated conversations &amp; knowledge files.
              </p>
            ) : (
              visibleProjects.map((p) => {
                const isSelected = currentProject?.id === p.id;
                const isActive = activeProjectId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(p.id);
                      setIsRenaming(false);
                      setActiveFolder('All');
                    }}
                    className={`w-full py-3 px-2.5 text-left rounded-xl transition-colors ${
                      isSelected ? 'bg-violet-600/12 dark:bg-violet-600/20' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {p.name}
                      </span>
                      {isActive && (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 shrink-0">
                          Active in Chat
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {p.description || 'Isolated context'} · {p.documents.length} docs
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Right Detail Workspace */}
        <section className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-violet-400/15 bg-white dark:bg-[#120D1F] p-5 space-y-5">
          {!currentProject ? (
            <p className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">
              Select or create a project to manage instructions, folders, documents, and isolated sessions.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-white/10 pb-4">
                <div className="min-w-0 flex-1">
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editingName.trim()) {
                          onUpdateProject(currentProject.id, { name: editingName.trim() });
                        }
                        setIsRenaming(false);
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        autoFocus
                        className="min-h-[38px] rounded-xl border border-violet-400 bg-slate-50 dark:bg-[#181228] px-3 text-sm font-semibold text-slate-900 dark:text-white"
                      />
                      <button
                        type="submit"
                        className="min-h-[38px] rounded-xl bg-violet-600 px-3 text-xs font-semibold text-white"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {currentProject.name}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingName(currentProject.name);
                          setIsRenaming(true);
                        }}
                        aria-label="Rename project"
                        className="p-1 text-slate-500 hover:text-violet-600 dark:hover:text-violet-300"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {currentProject.description || 'No description'} · Created {currentProject.createdAt}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectActiveProject(currentProject.id);
                      onOpenProjectChat(currentProject.id, projectSessions[0]?.id);
                    }}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500 whitespace-nowrap"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>{projectSessions.length > 0 ? 'Resume Session' : 'Start Project Chat'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateProject(currentProject.id, { archived: !currentProject.archived })
                    }
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 px-3 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    <span>{currentProject.archived ? 'Unarchive' : 'Archive'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteProject(currentProject.id)}
                    aria-label="Delete project"
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Project Instructions */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Project System Instructions (Isolated Context)
                </label>
                <textarea
                  rows={3}
                  value={currentProject.instructions}
                  onChange={(e) =>
                    onUpdateProject(currentProject.id, { instructions: e.target.value })
                  }
                  placeholder="Specify coding standards, persona, domain rules, or deliverables unique to this project..."
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] p-3 text-xs text-slate-900 dark:text-white focus:border-violet-400 focus:outline-none"
                />
              </div>

              {/* Folders & Uploaded Documents */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Knowledge Folders &amp; Documents
                  </h3>
                  <div className="flex items-center gap-2">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = newFolderName.trim();
                        if (!f || currentProject.folders.includes(f)) return;
                        onUpdateProject(currentProject.id, {
                          folders: [...currentProject.folders, f],
                        });
                        setActiveFolder(f);
                        setNewFolderName('');
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="New folder..."
                        className="w-28 min-h-[34px] rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs focus:outline-none"
                      />
                      <button
                        type="submit"
                        aria-label="Add folder"
                        className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                      </button>
                    </form>
                    <input
                      ref={fileUploadRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) void handleUploadDoc(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileUploadRef.current?.click()}
                      className="flex min-h-[34px] items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Doc</span>
                    </button>
                  </div>
                </div>

                {/* Folder Tabs */}
                <div className="flex flex-wrap gap-1.5">
                  {['All', ...currentProject.folders].map((fld) => (
                    <button
                      key={fld}
                      type="button"
                      onClick={() => setActiveFolder(fld)}
                      className={`flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium ${
                        activeFolder === fld
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-100 dark:bg-[#181228] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <Folder className="h-3 w-3" />
                      <span>{fld}</span>
                    </button>
                  ))}
                </div>

                {filteredDocs.length === 0 ? (
                  <p className="py-4 text-xs text-slate-500 dark:text-slate-400">
                    No documents in this folder yet. Upload specifications, notes, or source files for project-scoped context.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-white/8 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3">
                    {filteredDocs.map((docItem) => (
                      <div key={docItem.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-900 dark:text-white">
                            <FileText className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                            <span className="truncate">{docItem.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            Folder: {docItem.folder} · {docItem.sizeLabel} · Added {docItem.addedAt}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateProject(currentProject.id, {
                              documents: currentProject.documents.filter((d) => d.id !== docItem.id),
                            })
                          }
                          aria-label={`Remove ${docItem.name}`}
                          className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Project Conversations & Activity History */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    Project Sessions ({projectSessions.length})
                  </h3>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {projectSessions.length === 0 ? (
                      <p className="text-xs text-slate-500">No conversations started in this project yet.</p>
                    ) : (
                      projectSessions.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            onSelectActiveProject(currentProject.id);
                            onOpenProjectChat(currentProject.id, s.id);
                          }}
                          className="w-full flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 py-2 text-left text-xs hover:border-violet-400"
                        >
                          <span className="font-medium truncate">{s.title}</span>
                          <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
                            {s.messages.length} msgs
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    Project Activity Log
                  </h3>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {currentProject.activity.length === 0 ? (
                      <p className="text-xs text-slate-500">Created {currentProject.createdAt}.</p>
                    ) : (
                      currentProject.activity.slice(0, 10).map((act) => (
                        <div key={act.id} className="text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{act.action}</span> ·{' '}
                          {act.detail} ({act.timestamp})
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

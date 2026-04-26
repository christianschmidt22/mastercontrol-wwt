import { useState, useEffect, useCallback } from 'react';
import type { AgentConfig, AgentSection } from '../../types';
import { useAgentConfigs, useUpdateAgentConfig } from '../../api/useAgentConfigs';

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

interface ToolDef {
  key: string;
  label: string;
  phase2: boolean;
}

const TOOLS: ToolDef[] = [
  { key: 'web_search', label: 'web_search', phase2: false },
  { key: 'record_insight', label: 'record_insight', phase2: false },
  { key: 'search_notes', label: 'search_notes', phase2: true },
  { key: 'list_documents', label: 'list_documents', phase2: true },
  { key: 'read_document', label: 'read_document', phase2: true },
  { key: 'create_task', label: 'create_task', phase2: true },
];

const TEMPLATE_VARS = [
  '{{org_name}}',
  '{{org_type}}',
  '{{org_metadata}}',
  '{{contacts}}',
  '{{projects}}',
  '{{recent_notes}}',
  '{{document_list}}',
  '{{playbook}}',
];

// ---------------------------------------------------------------------------
// Variables reference panel
// ---------------------------------------------------------------------------

function VariablesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: '1px solid var(--rule)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          background: 'var(--bg-2)',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--body)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink-2)',
          textAlign: 'left',
          transition: 'color 200ms var(--ease)',
        }}
      >
        <span>Variables reference</span>
        <span
          aria-hidden="true"
          style={{
            fontSize: 11,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 200ms var(--ease)',
            display: 'inline-block',
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: '12px 14px',
            background: 'var(--bg)',
          }}
        >
          <p
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              marginBottom: 10,
              fontFamily: 'var(--body)',
            }}
          >
            These placeholders are hydrated by the backend before each request.
          </p>
          <ul
            role="list"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            {TEMPLATE_VARS.map((v) => (
              <li key={v}>
                <code
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    background: 'var(--bg-2)',
                    border: '1px solid var(--rule)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    color: 'var(--ink-1)',
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {v}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-section card
// ---------------------------------------------------------------------------

interface SectionCardProps {
  section: AgentSection;
  config: AgentConfig | undefined;
}

function parseToolsEnabled(raw: Record<string, unknown>): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const tool of TOOLS) {
    const val = raw[tool.key];
    // Support both boolean and object { enabled: true } shape
    if (typeof val === 'boolean') {
      result[tool.key] = val;
    } else if (val !== null && typeof val === 'object' && 'enabled' in val) {
      result[tool.key] = Boolean((val as Record<string, unknown>).enabled);
    } else {
      // Default: Phase 1 tools enabled, Phase 2 disabled
      result[tool.key] = !tool.phase2;
    }
  }
  return result;
}

function TemplateCard({ section, config }: SectionCardProps) {
  const updateMutation = useUpdateAgentConfig();

  const [prompt, setPrompt] = useState(config?.system_prompt_template ?? '');
  const [tools, setTools] = useState<Record<string, boolean>>(() =>
    parseToolsEnabled(config?.tools_enabled ?? {}),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Sync when config loads/changes
  useEffect(() => {
    if (config) {
      setPrompt(config.system_prompt_template);
      setTools(parseToolsEnabled(config.tools_enabled));
      setIsDirty(false);
    }
  }, [config]);

  // Unsaved-changes warning on navigate away
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setPrompt(e.target.value);
      setIsDirty(true);
    },
    [],
  );

  const handleToolToggle = useCallback((key: string) => {
    setTools((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      setIsDirty(true);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!config) return;
    const toolsEnabled: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tools)) {
      toolsEnabled[k] = v;
    }
    await updateMutation.mutateAsync({
      id: config.id,
      system_prompt_template: prompt,
      tools_enabled: toolsEnabled,
    });
    setIsDirty(false);
    setSavedAt(new Date());
  }, [config, updateMutation, prompt, tools]);

  const isSaving = updateMutation.isPending;
  const sectionLabel = section === 'customer' ? 'Customer' : 'OEM';
  const promptId = `prompt-${section}`;

  return (
    <article
      style={{
        flex: '1 1 460px',
        minWidth: 0,
        border: '1px solid var(--rule)',
        borderRadius: 8,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        padding: 32,
      }}
    >
      {/* Card heading */}
      <h2
        style={{
          fontFamily: 'var(--display)',
          fontSize: 24,
          fontWeight: 500,
          color: 'var(--ink-1)',
          margin: 0,
        }}
      >
        {sectionLabel} agent
      </h2>

      {/* System prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label
          htmlFor={promptId}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          System prompt template
        </label>
        <textarea
          id={promptId}
          name={`system_prompt_template_${section}`}
          value={prompt}
          onChange={handlePromptChange}
          rows={12}
          spellCheck={false}
          style={{
            width: '100%',
            resize: 'vertical',
            fontFamily: 'var(--mono)',
            fontSize: 13,
            lineHeight: 1.6,
            fontFeatureSettings: "'tnum' 1",
            color: 'var(--ink-1)',
            background: 'var(--bg-2)',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            padding: '12px 14px',
            transition: 'border-color 200ms var(--ease)',
          }}
          aria-describedby={`${promptId}-hint`}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--rule)';
          }}
        />
        <p
          id={`${promptId}-hint`}
          style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--body)' }}
        >
          Use <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{'{{variable}}'}</code>
          {' '}placeholders — see Variables reference below.
        </p>
      </div>

      {/* Tools toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-2)',
            fontFamily: 'var(--body)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: 0,
          }}
        >
          Tools
        </p>
        <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {TOOLS.map((tool) => {
            const checkId = `tool-${section}-${tool.key}`;
            return (
              <li key={tool.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id={checkId}
                  name={checkId}
                  checked={tools[tool.key] ?? false}
                  disabled={tool.phase2}
                  onChange={() => handleToolToggle(tool.key)}
                  style={{
                    width: 15,
                    height: 15,
                    accentColor: 'var(--accent)',
                    cursor: tool.phase2 ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                />
                <label
                  htmlFor={checkId}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 13,
                    color: tool.phase2 ? 'var(--ink-3)' : 'var(--ink-1)',
                    cursor: tool.phase2 ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  {tool.label}
                  {tool.phase2 && (
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--body)',
                        fontWeight: 600,
                        color: 'var(--ink-3)',
                        border: '1px solid var(--rule)',
                        borderRadius: 3,
                        padding: '1px 5px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Phase 2
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Variables panel */}
      <VariablesPanel />

      {/* Save row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!isDirty || isSaving}
          style={{
            padding: '9px 20px',
            fontFamily: 'var(--body)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink-1)',
            background: 'var(--bg-2)',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            cursor: isDirty && !isSaving ? 'pointer' : 'not-allowed',
            opacity: isDirty && !isSaving ? 1 : 0.45,
            transition: 'opacity 200ms var(--ease), border-color 200ms var(--ease)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {isSaving ? (
            <>
              {/* Spinner */}
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                className="animate-spin"
              >
                <circle
                  cx="6"
                  cy="6"
                  r="4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="14 8"
                />
              </svg>
              Saving…
            </>
          ) : (
            `Save Template`
          )}
        </button>

        {savedAt && !isDirty && !isSaving && (
          <span
            aria-live="polite"
            style={{
              fontSize: 12,
              color: 'var(--ink-3)',
              fontFamily: 'var(--body)',
            }}
          >
            Saved{' '}
            <span className="tnum">
              {savedAt.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </span>
        )}

        {updateMutation.isError && (
          <span
            role="alert"
            style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--body)' }}
          >
            {updateMutation.error?.message ?? 'Save failed'}
          </span>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Tab panel
// ---------------------------------------------------------------------------

export function TemplatesTab() {
  const { data: configs, isLoading, isError } = useAgentConfigs();

  const customerConfig = configs?.find(
    (c) => c.section === 'customer' && c.organization_id === null,
  );
  const oemConfig = configs?.find(
    (c) => c.section === 'oem' && c.organization_id === null,
  );

  if (isLoading) {
    return (
      <div
        role="status"
        aria-label="Loading agent templates"
        style={{ padding: '48px 0', color: 'var(--ink-3)', fontFamily: 'var(--body)', fontSize: 14 }}
      >
        Loading templates…
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        style={{ padding: '48px 0', color: 'var(--accent)', fontFamily: 'var(--body)', fontSize: 14 }}
      >
        Failed to load agent configurations.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 24,
        alignItems: 'flex-start',
      }}
    >
      <TemplateCard section="customer" config={customerConfig} />
      <TemplateCard section="oem" config={oemConfig} />
    </div>
  );
}

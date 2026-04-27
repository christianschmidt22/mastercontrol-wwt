/**
 * AgentSectionEditor.tsx
 *
 * Editor panel for a single agent config (section default or per-org override).
 * Renders:
 *  - Template textarea beside a variable-reference panel
 *  - Tool checkboxes (web_search + max_uses, record_insight)
 *  - Model picker
 *  - Save / Discard bar (Save disabled when clean)
 *
 * tools_enabled is serialized as an array:
 *   [{ name: 'web_search', max_uses: N }, { name: 'record_insight' }]
 */

import { useState, useEffect, useCallback } from 'react';
import type { AgentConfig } from '../../types';
import { useUpdateAgentConfig } from '../../api/useAgentConfigs';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATE_VARS = [
  'org_name', 'org_type', 'metadata', 'contacts',
  'projects', 'recent_notes', 'document_list', 'playbook',
];

const MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5',
];

// ---------------------------------------------------------------------------
// Tool-state helpers
// ---------------------------------------------------------------------------

interface ToolState {
  webSearch: boolean;
  maxUses: number;
  recordInsight: boolean;
}

type ToolEntry = { name: string; max_uses?: number };

function parseTools(raw: Record<string, unknown>): ToolState {
  if (Array.isArray(raw)) {
    const arr = raw as ToolEntry[];
    const ws = arr.find((t) => t.name === 'web_search');
    const ri = arr.find((t) => t.name === 'record_insight');
    return { webSearch: ws !== undefined, maxUses: ws?.max_uses ?? 5, recordInsight: ri !== undefined };
  }
  // Legacy boolean-dict format
  return {
    webSearch: Boolean(raw['web_search']),
    maxUses: 5,
    recordInsight: Boolean(raw['record_insight']),
  };
}

function serializeTools(s: ToolState): Record<string, unknown> {
  const arr: ToolEntry[] = [];
  if (s.webSearch) arr.push({ name: 'web_search', max_uses: s.maxUses });
  if (s.recordInsight) arr.push({ name: 'record_insight' });
  // Cast array → Record for the generic AgentConfigUpdate type
  return arr as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Shared style objects (kept inline per DESIGN.md — no external CSS)
// ---------------------------------------------------------------------------

const LABEL_STYLE = {
  fontFamily: 'var(--body)',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-2)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
};

const TOOL_CODE_STYLE = {
  fontFamily: 'var(--mono)',
  fontSize: 13,
  color: 'var(--ink-1)',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentSectionEditorProps {
  config: AgentConfig | undefined;
  /** Unique prefix for IDs — prevents duplicate id attributes when two editors are on screen */
  idPrefix: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AgentSectionEditor({ config, idPrefix }: AgentSectionEditorProps) {
  const updateMutation = useUpdateAgentConfig();

  const [prompt, setPrompt] = useState(config?.system_prompt_template ?? '');
  const [tools, setTools] = useState<ToolState>(() => parseTools(config?.tools_enabled ?? {}));
  const [model, setModel] = useState(config?.model ?? 'claude-sonnet-4-6');
  const [isDirty, setIsDirty] = useState(false);

  // Sync state when the config prop changes (tab switch or fresh data)
  useEffect(() => {
    if (config) {
      setPrompt(config.system_prompt_template);
      setTools(parseTools(config.tools_enabled));
      setModel(config.model);
      setIsDirty(false);
    }
  }, [config]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleDiscard = useCallback(() => {
    if (config) {
      setPrompt(config.system_prompt_template);
      setTools(parseTools(config.tools_enabled));
      setModel(config.model);
    }
    setIsDirty(false);
  }, [config]);

  const handleSave = useCallback(async () => {
    if (!config) return;
    await updateMutation.mutateAsync({
      id: config.id,
      system_prompt_template: prompt,
      tools_enabled: serializeTools(tools),
      model,
    });
    setIsDirty(false);
  }, [config, updateMutation, prompt, tools, model]);

  const textareaId = `${idPrefix}-prompt`;
  const modelId = `${idPrefix}-model`;
  const isSaving = updateMutation.isPending;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Textarea + variable reference panel */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Textarea column */}
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor={textareaId} style={LABEL_STYLE}>
            System prompt template
          </label>
          <textarea
            id={textareaId}
            name="system_prompt_template"
            value={prompt}
            rows={12}
            spellCheck={false}
            onChange={(e) => { setPrompt(e.target.value); setIsDirty(true); }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--rule)'; }}
            style={{
              width: '100%',
              resize: 'vertical',
              fontFamily: 'var(--mono)',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--ink-1)',
              background: 'var(--bg-2)',
              border: '1px solid var(--rule)',
              borderRadius: 6,
              padding: '12px 14px',
              boxSizing: 'border-box',
              outline: 'none',
              transition: 'border-color 200ms var(--ease)',
            }}
          />
        </div>

        {/* Variable reference panel */}
        <aside
          aria-label="Template variable reference"
          style={{ width: 180, flexShrink: 0, paddingTop: 28 }}
        >
          <p style={{
            fontFamily: 'var(--body)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--ink-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            margin: '0 0 8px',
          }}>
            Variables
          </p>
          <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {TEMPLATE_VARS.map((v) => (
              <li key={v}>
                <code style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--rule)',
                  borderRadius: 3,
                  padding: '2px 5px',
                  display: 'inline-block',
                }}>
                  {`{{${v}}}`}
                </code>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* Tools */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ ...LABEL_STYLE, margin: 0 }}>Tools</p>

        {/* web_search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              aria-label="web_search"
              checked={tools.webSearch}
              onChange={() => { setTools((p) => ({ ...p, webSearch: !p.webSearch })); setIsDirty(true); }}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
            />
            <code style={TOOL_CODE_STYLE}>web_search</code>
          </label>

          {tools.webSearch && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--body)', fontSize: 13, color: 'var(--ink-2)', cursor: 'default' }}>
              Max searches per turn (1–10)
              <input
                type="number"
                min={1}
                max={10}
                value={tools.maxUses}
                aria-label="Max searches per turn"
                onChange={(e) => {
                  const v = Math.min(10, Math.max(1, Number(e.target.value)));
                  setTools((p) => ({ ...p, maxUses: v }));
                  setIsDirty(true);
                }}
                style={{
                  width: 56,
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  padding: '3px 6px',
                  background: 'var(--bg)',
                  color: 'var(--ink-1)',
                  outline: 'none',
                }}
              />
            </label>
          )}
        </div>

        {/* record_insight */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            aria-label="record_insight"
            checked={tools.recordInsight}
            onChange={() => { setTools((p) => ({ ...p, recordInsight: !p.recordInsight })); setIsDirty(true); }}
            style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }}
          />
          <code style={TOOL_CODE_STYLE}>record_insight</code>
        </label>
      </div>

      {/* Model picker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={modelId} style={LABEL_STYLE}>Model</label>
        <select
          id={modelId}
          value={model}
          onChange={(e) => { setModel(e.target.value); setIsDirty(true); }}
          style={{
            width: 240,
            fontFamily: 'var(--body)',
            fontSize: 13,
            color: 'var(--ink-1)',
            background: 'var(--bg)',
            border: '1px solid var(--rule)',
            borderRadius: 6,
            padding: '7px 10px',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Save / Discard bar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          paddingTop: 16,
          borderTop: '1px solid var(--rule)',
        }}
      >
        <button
          type="button"
          aria-label="Save agent config"
          disabled={!isDirty || isSaving}
          onClick={() => void handleSave()}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 13,
            fontWeight: 600,
            padding: '8px 18px',
            borderRadius: 6,
            cursor: isDirty && !isSaving ? 'pointer' : 'not-allowed',
            border: isDirty ? '1px solid var(--accent)' : '1px solid var(--rule)',
            background: 'var(--bg)',
            color: isDirty ? 'var(--accent)' : 'var(--ink-3)',
            opacity: isDirty && !isSaving ? 1 : 0.5,
            transition: 'opacity 200ms var(--ease), border-color 200ms var(--ease), color 200ms var(--ease)',
          }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>

        <button
          type="button"
          aria-label="Discard changes"
          disabled={!isDirty}
          onClick={handleDiscard}
          style={{
            fontFamily: 'var(--body)',
            fontSize: 13,
            fontWeight: 400,
            padding: '8px 18px',
            borderRadius: 6,
            cursor: isDirty ? 'pointer' : 'default',
            border: '1px solid var(--rule)',
            background: 'none',
            color: isDirty ? 'var(--ink-2)' : 'var(--ink-3)',
            opacity: isDirty ? 1 : 0.5,
            transition: 'opacity 200ms var(--ease)',
          }}
        >
          Discard
        </button>

        {updateMutation.isError && (
          <span
            role="alert"
            style={{ fontFamily: 'var(--body)', fontSize: 12, color: 'var(--accent)', alignSelf: 'center' }}
          >
            {updateMutation.error?.message ?? 'Save failed'}
          </span>
        )}
      </div>
    </div>
  );
}

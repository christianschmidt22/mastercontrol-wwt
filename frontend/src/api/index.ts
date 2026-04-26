export { request } from './http';
export { queryClient } from './queryClient';
export { streamChat } from './streamChat';
export type { StreamChatArgs } from './streamChat';

export {
  orgKeys,
  useOrganizations,
  useOrganization,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
} from './useOrganizations';

export {
  contactKeys,
  useContacts,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
} from './useContacts';

export {
  projectKeys,
  useProjects,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from './useProjects';

export {
  documentKeys,
  useDocuments,
  useCreateDocument,
  useDeleteDocument,
} from './useDocuments';

export {
  noteKeys,
  useNotes,
  useCreateNote,
  useDeleteNote,
  useConfirmInsight,
  useRejectInsight,
} from './useNotes';

export {
  taskKeys,
  useTasks,
  useCreateTask,
  useUpdateTask,
  useCompleteTask,
  useDeleteTask,
} from './useTasks';
export type { TaskFilters } from './useTasks';

export {
  agentConfigKeys,
  useAgentConfigs,
  useUpdateAgentConfig,
} from './useAgentConfigs';

export {
  threadKeys,
  useAgentThreads,
  useCreateAgentThread,
  useAgentMessages,
  useAgentAudit,
} from './useAgentThreads';
export type {
  AgentThread,
  AgentThreadCreate,
  AgentMessageRole,
  AgentMessage,
  AgentAuditEntry,
} from './useAgentThreads';

export {
  settingKeys,
  useSetting,
  useSetSetting,
} from './useSettings';

export { useStreamChat } from './useStreamChat';
export type { UseStreamChat, StreamChatMessage } from './useStreamChat';

export {
  subagentKeys,
  useUsage,
  useRecentUsage,
  useDelegate,
} from './useSubagent';

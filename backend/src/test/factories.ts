import { organizationModel } from '../models/organization.model.js';
import type { Organization, OrganizationInput } from '../models/organization.model.js';
import { contactModel } from '../models/contact.model.js';
import type { Contact, ContactInput } from '../models/contact.model.js';
import { projectModel } from '../models/project.model.js';
import type { Project, ProjectInput } from '../models/project.model.js';
import { documentModel } from '../models/document.model.js';
import type { Document, DocumentInput } from '../models/document.model.js';
import { noteModel } from '../models/note.model.js';
import type { Note, NoteInput } from '../models/note.model.js';
import { taskModel } from '../models/task.model.js';
import type { Task, TaskInput } from '../models/task.model.js';
import { agentThreadModel } from '../models/agentThread.model.js';
import type { AgentThread } from '../models/agentThread.model.js';
import { agentMessageModel } from '../models/agentMessage.model.js';
import type { AgentMessage } from '../models/agentMessage.model.js';

let seq = 0;

/**
 * Build and persist an Organization row with sensible defaults.
 * Pass `overrides` to control any field. Each call gets a unique name
 * so tests that insert multiple orgs don't collide on uniqueness constraints.
 */
export function makeOrg(overrides: Partial<OrganizationInput> = {}): Organization {
  seq += 1;
  const input: OrganizationInput = {
    type: 'customer',
    name: `Test Org ${seq}`,
    metadata: {},
    ...overrides,
  };
  return organizationModel.create(input);
}

/** Build and persist a Contact row for the given org. */
export function makeContact(
  orgId: number,
  overrides: Partial<Omit<ContactInput, 'organization_id'>> = {},
): Contact {
  seq += 1;
  return contactModel.create({
    organization_id: orgId,
    name: `Test Contact ${seq}`,
    ...overrides,
  });
}

/** Build and persist a Project row for the given org. */
export function makeProject(
  orgId: number,
  overrides: Partial<Omit<ProjectInput, 'organization_id'>> = {},
): Project {
  seq += 1;
  return projectModel.create({
    organization_id: orgId,
    name: `Test Project ${seq}`,
    ...overrides,
  });
}

/** Build and persist a Document row for the given org. */
export function makeDocument(
  orgId: number,
  overrides: Partial<Omit<DocumentInput, 'organization_id'>> = {},
): Document {
  seq += 1;
  return documentModel.create({
    organization_id: orgId,
    kind: 'link',
    label: `Test Doc ${seq}`,
    url_or_path: `https://example.com/doc-${seq}`,
    ...overrides,
  });
}

/** Build and persist a Note row for the given org. */
export function makeNote(
  orgId: number,
  overrides: Partial<Omit<NoteInput, 'organization_id'>> = {},
): Note {
  seq += 1;
  return noteModel.create({
    organization_id: orgId,
    content: `Test note content ${seq}`,
    ...overrides,
  });
}

/** Build and persist a Task row. */
export function makeTask(overrides: Partial<TaskInput> = {}): Task {
  seq += 1;
  return taskModel.create({
    title: `Test Task ${seq}`,
    ...overrides,
  });
}

/** Build and persist an AgentThread for the given org. */
export function makeThread(orgId: number, title?: string): AgentThread {
  return agentThreadModel.create({ organization_id: orgId, title: title ?? null });
}

/** Build and persist an AgentMessage in the given thread. */
export function makeMessage(
  threadId: number,
  role: 'user' | 'assistant' | 'tool' = 'user',
  content = 'test message',
): AgentMessage {
  return agentMessageModel.append({ threadId, role, content });
}

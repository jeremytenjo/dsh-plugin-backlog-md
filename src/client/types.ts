export interface AcceptanceCriterion {
  text: string;
  checked: boolean;
  index?: number;
}

export interface TaskComment {
  id?: string;
  author?: string;
  body?: string;
  createdDate?: string;
}

export interface BacklogTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assignee: string[];
  labels: string[];
  milestone?: string;
  parentTaskId?: string;
  parentTaskTitle?: string;
  dependencies: string[];
  description?: string;
  acceptanceCriteriaItems?: AcceptanceCriterion[];
  definitionOfDoneItems?: AcceptanceCriterion[];
  comments?: TaskComment[];
  createdDate: string;
  updatedDate?: string;
  dueDate?: string;
  ordinal?: number;
  type?: string;
  project?: string;
  references?: string[];
  documentation?: string[];
  modifiedFiles?: string[];
  subtasks?: string[];
  subtaskSummaries?: Array<{ id: string; title: string }>;
  dependencyGraph?: unknown;
  readiness?: unknown;
  [key: string]: unknown;
}

export interface BacklogMilestone {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  [key: string]: unknown;
}

export interface BacklogConfig {
  projectName?: string;
  statuses?: string[];
  labels?: string[];
  priorities?: string[];
  types?: string[];
  projects?: string[];
  definitionOfDone?: string[];
  defaultStatus?: string;
  dateFormat?: string;
  defaultPort?: number;
  [key: string]: unknown;
}

export interface WorkspaceInfo {
  key: string;
  name: string;
  folder: string;
  initialized: boolean;
}

export interface BacklogCompatibility {
  minimum: string;
  tested: string;
}

export interface BacklogReadyStatus {
  state: 'ready';
  workspace: WorkspaceInfo;
  compatibility: BacklogCompatibility;
  backlogVersion: string;
  executable: { source: 'workspace' | 'path' };
  server: {
    version: string;
    managed: boolean;
    connected: string;
  };
  config: BacklogConfig;
  statuses: string[];
}

export interface BacklogSetupStatus {
  state: 'not-installed' | 'not-initialized' | 'incompatible' | 'error';
  workspace: WorkspaceInfo;
  compatibility: BacklogCompatibility;
  hint?: string;
  code?: string;
  error?: string;
  details?: Record<string, unknown>;
  detectedVersion?: string;
  backlogVersion?: string;
  installCommands?: string[];
  initCommands?: string[];
}

export type BacklogStatus = BacklogReadyStatus | BacklogSetupStatus;

export interface BacklogFilters {
  query: string;
  status: string;
  excludeStatus: string;
  priority: string;
  milestone: string;
  label: string;
  assignee: string;
}

export const EMPTY_FILTERS: BacklogFilters = {
  query: '',
  status: '',
  excludeStatus: '',
  priority: '',
  milestone: '',
  label: '',
  assignee: '',
};

export interface TaskNode extends BacklogTask {
  subRows?: TaskNode[];
  depth?: number;
}

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'disconnected';

export interface BridgeEvent {
  seq: number;
  type: string;
  at?: string;
  scope?: string;
  state?: string;
  reason?: string;
}

export interface EventsResult {
  events: BridgeEvent[];
  seq: number;
  resync?: boolean;
  aborted?: boolean;
  closed?: boolean;
  connection?: {
    state: ConnectionState;
    seq: number;
  };
}

export interface BridgeFailure {
  code: string;
  error: string;
  hint?: string;
  details?: Record<string, unknown>;
}

export class BridgeRequestError extends Error {
  code: string;
  hint?: string;
  details?: Record<string, unknown>;

  constructor(failure: BridgeFailure) {
    super(failure.error);
    this.name = 'BridgeRequestError';
    this.code = failure.code;
    this.hint = failure.hint;
    this.details = failure.details;
  }
}

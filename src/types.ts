export type Severity = 'error' | 'warning' | 'info';
export interface Finding {
  id: string; code: string; severity: Severity; title: string; suggestion: string;
  fileId: string | null; serverId: string | null; server: string; client: string;
  file: string; evidence: string; source: string; repairable: boolean; repairLabel: string | null;
}
export interface Runtime {
  id: string; name: string; command: string; required: boolean; description: string;
  status: 'ok' | 'warning' | 'error' | 'optional'; paths: string[]; version: string | null; detail: string;
}
export interface Summary { errors: number; warnings: number; info: number; repairable: number; files: number; servers: number; runtimes: number }
export interface Config { id: string; path: string; client: string; format: string; serverCount: number; status: string }
export interface Server { id: string; fileId: string; name: string; client: string; command: string; args: string[]; cwd: string; transport: string; enabled: boolean; probeAllowed: boolean; probeDescription: string }
export interface Report {
  id: string; workspace: string; includeUser: boolean; demo: boolean; startedAt: string;
  durationMs: number; platform: string; engine: Session['engine']; environment: Runtime[];
  configs: Config[]; servers: Server[]; findings: Finding[]; summary: Summary;
  coverage: { staticOnly: boolean; remoteRequests: boolean; message: string };
}
export interface History { id: string; startedAt: string; workspace: string; demo: boolean; summary: Summary }
export interface Backup { id: string; file: string; server: string; description: string; createdAt: string; status: string; restoredAt?: string }
export interface Credit { name: string; role: string; version: string; license: string; url: string }
export interface Session {
  token: string; version: string; defaultWorkspace: string; platform: string; os: string;
  engine: { name: string; version: string; ready: boolean; source: string };
  credits: Credit[]; history: History[]; backups: Backup[];
}
export interface Plan { id: string; expiresAt: number; description: string; file: string; server: string; before: string; after: string; diff: string }
export interface ProbeResult { status: string; durationMs: number; server?: string; message: string; stderr?: string; tools: string[] }

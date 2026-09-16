export interface TeamMemberView { readonly id: string; readonly name: string; readonly role: 'lead' | 'teammate'; readonly status: 'running' | 'idle' | 'inactive' | 'provisioning' | 'failed'; readonly description?: string; readonly diagnostics: readonly string[]; }
export interface TeamTaskView { readonly id: string; readonly revision: number; readonly subject: string; readonly description: string; readonly status: 'pending' | 'in_progress' | 'completed' | 'deleted'; readonly ownerName?: string; readonly blockedBy: readonly string[]; readonly writeScopes: readonly string[]; readonly ready: boolean; readonly writeScopeWarnings: readonly string[]; }
export interface TeamView { readonly members: readonly TeamMemberView[]; readonly tasks: readonly TeamTaskView[]; }

export interface TeamActivitySummary {
  readonly member?: TeamMemberView;
  readonly task?: TeamTaskView;
  readonly focus?: string;
  readonly message: string;
  readonly runningCount: number;
}

/** Project only official Team view facts; never infer work from model prose. */
export function summarizeTeamActivity(view: TeamView | undefined, currentSessionId: string, fallback: string): TeamActivitySummary {
  const members = view?.members ?? [], tasks = view?.tasks ?? [];
  const ownedTasks = (member: TeamMemberView) => tasks.filter(task => task.ownerName === member.name && task.status !== 'deleted');
  // Official member Sessions can remain `running` briefly after their shared
  // task completed. Once a teammate has task history, the task state is the
  // stronger signal; otherwise a finished teammate would mask the active lead.
  const running = members.filter(member => member.status === 'running' && (member.role === 'lead' || ownedTasks(member).length === 0 || ownedTasks(member).some(task => task.status === 'in_progress')));
  const activeTasks = tasks.filter(task => task.status === 'in_progress' && running.some(member => member.name === task.ownerName));
  const task = activeTasks.reduce<TeamTaskView | undefined>((latest, row) => !latest || row.revision >= latest.revision ? row : latest, undefined);
  const selected = (task ? running.find(member => member.name === task.ownerName) : undefined)
    ?? running.find(member => String(member.id) === currentSessionId)
    ?? running.find(member => member.role === 'lead')
    ?? running[0];
  const selectedTask = selected && tasks.find(row => row.ownerName === selected.name && row.status === 'in_progress');
  const focus = selectedTask?.subject || selected?.description || (selected ? '正在处理' : undefined);
  const extra = selected && running.length > 1 ? ` · 另 ${running.length - 1} 位专家处理中` : '';
  return { member: selected, task: selectedTask, focus, runningCount: running.length, message: selected ? `${selected.name} · ${focus}${extra}` : fallback };
}

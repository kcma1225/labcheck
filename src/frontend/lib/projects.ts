import type { Group, Project } from "../../shared/types";

export interface ProjectSection {
  group: Group | null;
  projects: Project[];
}

/** Groups already-sorted projects under already-sorted groups; ungrouped tabs come last. */
export function groupProjects(projects: Project[], groups: Group[]): ProjectSection[] {
  const byGroup = new Map<string, Project[]>();
  const ungrouped: Project[] = [];
  for (const p of projects) {
    if (p.group_id) {
      const list = byGroup.get(p.group_id) ?? [];
      list.push(p);
      byGroup.set(p.group_id, list);
    } else {
      ungrouped.push(p);
    }
  }
  const sections: ProjectSection[] = groups.map((g) => ({ group: g, projects: byGroup.get(g.id) ?? [] }));
  if (ungrouped.length > 0) sections.push({ group: null, projects: ungrouped });
  return sections;
}

/**
 * Workspace-wide enumerable objects that tasks/subtasks can reference.
 * Type ids are configured in settings (`entityTypes`); default person, company, project.
 */
export type EntityTypeId = string;

export type EntityTypeDef = {
  id: EntityTypeId;
  label: string;
};

export type WorkspaceEntity = {
  id: string;
  type: EntityTypeId;
  /** Display name (unique per type, case-insensitive). */
  label: string;
};

export type EntityCatalog = {
  version: 1;
  entities: WorkspaceEntity[];
};

export const DEFAULT_ENTITY_TYPES: EntityTypeDef[] = [
  { id: 'person', label: 'People' },
  { id: 'company', label: 'Company' },
  { id: 'project', label: 'Project' },
];

export const DEFAULT_ENTITY_CATALOG: EntityCatalog = {
  version: 1,
  entities: [],
};

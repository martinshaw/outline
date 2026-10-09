import { getSettings } from '../settings/settingsStore';
import { createId } from '../utils/id';
import {
  DEFAULT_ENTITY_CATALOG,
  type EntityCatalog,
  type EntityTypeDef,
  type EntityTypeId,
  type WorkspaceEntity,
} from './types';

type Listener = (catalog: EntityCatalog) => void;
type PersistFn = (catalog: EntityCatalog) => Promise<void>;

let current: EntityCatalog = {
  version: 1,
  entities: [],
};
const listeners = new Set<Listener>();
let persistFn: PersistFn | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

function knownTypeIds(): Set<string> {
  return new Set(getSettings().entityTypes.map((t) => t.id));
}

export function getEntityTypes(): EntityTypeDef[] {
  return getSettings().entityTypes.map((t) => ({ ...t }));
}

export function getEntityTypeDef(typeId: string): EntityTypeDef | undefined {
  return getSettings().entityTypes.find((t) => t.id === typeId);
}

export function normalizeEntityCatalog(
  partial: Partial<EntityCatalog> | null | undefined,
): EntityCatalog {
  const entities: WorkspaceEntity[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const types = knownTypeIds();

  const list = Array.isArray(partial?.entities) ? partial.entities : [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' && raw.id ? raw.id : createId();
    if (seenIds.has(id)) continue;
    const type =
      typeof raw.type === 'string' ? raw.type.trim().slice(0, 40) : '';
    if (!type) continue;
    // Keep entities even if their type was removed from settings, so links survive.
    void types;
    const label = normalizeLabel(String(raw.label ?? ''));
    if (!label) continue;
    const key = `${type}:${label.toLowerCase()}`;
    if (seenKeys.has(key)) continue;
    seenIds.add(id);
    seenKeys.add(key);
    entities.push({ id, type, label });
  }

  entities.sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  );

  return { version: 1, entities };
}

function schedulePersist(catalog: EntityCatalog): void {
  if (!persistFn) return;
  if (persistTimer) clearTimeout(persistTimer);
  const snapshot = catalog;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistFn?.(snapshot).catch((err) => {
      console.error('Failed to save entities.json', err);
    });
  }, 200);
}

function publish(catalog: EntityCatalog, writeDisk: boolean): void {
  current = catalog;
  for (const listener of listeners) listener(current);
  if (writeDisk) schedulePersist(current);
}

export function getEntityCatalog(): EntityCatalog {
  return current;
}

export function subscribeEntities(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function configureEntityPersistence(fn: PersistFn | null): void {
  persistFn = fn;
}

export function hydrateEntities(
  partial: Partial<EntityCatalog> | null | undefined,
): EntityCatalog {
  publish(normalizeEntityCatalog(partial), false);
  return current;
}

export function getEntityById(id: string): WorkspaceEntity | undefined {
  return current.entities.find((e) => e.id === id);
}

export function listEntities(type?: EntityTypeId): WorkspaceEntity[] {
  if (!type) return [...current.entities];
  return current.entities.filter((e) => e.type === type);
}

export function getEntityLabel(id: string): string {
  return getEntityById(id)?.label ?? id;
}

/** Resolve labels for a list of entity ids (skips unknown ids). */
export function resolveEntityLabels(ids: string[] | null | undefined): string[] {
  if (!ids?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const entity = getEntityById(id);
    if (!entity || seen.has(entity.id)) continue;
    seen.add(entity.id);
    out.push(entity.label);
  }
  return out;
}

/**
 * Find or create an entity by type + display name.
 * Creates and persists when the label is new for that type.
 */
export function ensureEntity(
  type: EntityTypeId,
  label: string,
): WorkspaceEntity {
  const normalized = normalizeLabel(label);
  if (!normalized) {
    throw new Error('Entity label is empty');
  }
  const typeId = type.trim();
  if (!typeId) {
    throw new Error('Entity type is empty');
  }
  const existing = current.entities.find(
    (e) =>
      e.type === typeId &&
      e.label.toLowerCase() === normalized.toLowerCase(),
  );
  if (existing) return existing;

  const entity: WorkspaceEntity = {
    id: createId(),
    type: typeId,
    label: normalized,
  };
  publish(
    normalizeEntityCatalog({
      version: 1,
      entities: [...current.entities, entity],
    }),
    true,
  );
  return entity;
}

/**
 * Map mixed ids / labels to entity ids for a specific type.
 * Unknown labels create a new entity of that type.
 */
export function resolveEntityIdsForType(
  type: EntityTypeId,
  values: string[] | null | undefined,
): string[] {
  if (!values?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const token = normalizeLabel(raw);
    if (!token) continue;

    const byId = getEntityById(token);
    if (byId && byId.type === type) {
      if (!seen.has(byId.id)) {
        seen.add(byId.id);
        out.push(byId.id);
      }
      continue;
    }

    const byLabel = current.entities.find(
      (e) =>
        e.type === type && e.label.toLowerCase() === token.toLowerCase(),
    );
    if (byLabel) {
      if (!seen.has(byLabel.id)) {
        seen.add(byLabel.id);
        out.push(byLabel.id);
      }
      continue;
    }

    // Token matched a different type's id — skip rather than retype.
    if (byId) continue;

    const created = ensureEntity(type, token);
    if (!seen.has(created.id)) {
      seen.add(created.id);
      out.push(created.id);
    }
  }
  return out;
}

/**
 * Normalize a flat id list (any types). Keeps known ids; drops unknowns.
 * Does not create entities from bare labels (use per-type resolvers in the UI).
 */
export function normalizeEntityIdList(
  values: string[] | null | undefined,
): string[] {
  if (!values?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id)) continue;
    if (!getEntityById(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Legacy helper: resolve mixed ids/labels across types.
 * Bare labels create `person` entities when that type exists, else the first configured type.
 */
export function resolveEntityIds(
  values: string[] | null | undefined,
): string[] {
  if (!values?.length) return [];
  const types = getEntityTypes();
  const fallbackType = types.some((t) => t.id === 'person')
    ? 'person'
    : (types[0]?.id ?? 'person');

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const token = normalizeLabel(raw);
    if (!token) continue;

    const byId = getEntityById(token);
    if (byId) {
      if (!seen.has(byId.id)) {
        seen.add(byId.id);
        out.push(byId.id);
      }
      continue;
    }

    const byLabel = current.entities.find(
      (e) => e.label.toLowerCase() === token.toLowerCase(),
    );
    if (byLabel) {
      if (!seen.has(byLabel.id)) {
        seen.add(byLabel.id);
        out.push(byLabel.id);
      }
      continue;
    }

    const created = ensureEntity(fallbackType, token);
    if (!seen.has(created.id)) {
      seen.add(created.id);
      out.push(created.id);
    }
  }
  return out;
}

export function resetEntitiesForTests(): void {
  current = { ...DEFAULT_ENTITY_CATALOG, entities: [] };
  persistFn = null;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
}

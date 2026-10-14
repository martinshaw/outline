import { memo, type CSSProperties } from 'react';
import { getStatusDef } from '../settings/settingsStore';
import type { SidebarDay } from '../types';
import { isCompleteStatus } from '../utils/itemMeta';

type Props = {
  days: SidebarDay[];
  activeDate: string;
  collapsed: boolean;
  onSelectDay: (date: string) => void | Promise<void>;
  onSelectItem: (date: string, itemId: string) => void | Promise<void>;
};

function statusStyle(status: string | null | undefined): {
  color: string;
  done: boolean;
} {
  const def = getStatusDef(status);
  return {
    color: def.color,
    done: isCompleteStatus(def.id),
  };
}

export const Sidebar = memo(function Sidebar({
  days,
  activeDate,
  collapsed,
  onSelectDay,
  onSelectItem,
}: Props) {
  if (collapsed) return null;

  return (
    <aside className="sidebar" aria-label="Notes navigation">
      {days.length === 0 ? (
        <p className="sidebar__empty">No notes yet</p>
      ) : (
        <nav className="sidebar__nav">
          <ul className="sidebar__days">
            {days.map((day) => (
              <li key={day.date} className="sidebar__day">
                <button
                  type="button"
                  className={
                    day.date === activeDate
                      ? 'sidebar__day-btn sidebar__day-btn--active'
                      : 'sidebar__day-btn'
                  }
                  onClick={() => onSelectDay(day.date)}
                >
                  {day.label}
                </button>
                {day.tasks.length > 0 && (
                  <ul className="sidebar__tasks">
                    {day.tasks.map((task) => {
                      const taskStatus = statusStyle(task.status);
                      return (
                        <li key={task.id}>
                          <button
                            type="button"
                            className={
                              taskStatus.done
                                ? 'sidebar__task-btn sidebar__task-btn--done'
                                : 'sidebar__task-btn'
                            }
                            onClick={() => onSelectItem(day.date, task.id)}
                          >
                            <span
                              className="sidebar__marker sidebar__marker--task"
                              style={
                                {
                                  '--status-color': taskStatus.color,
                                } as CSSProperties
                              }
                            />
                            {task.title}
                          </button>
                          {task.subtasks.length > 0 && (
                            <ul className="sidebar__subtasks">
                              {task.subtasks.map((subtask) => {
                                const subStatus = statusStyle(subtask.status);
                                return (
                                  <li key={subtask.id}>
                                    <button
                                      type="button"
                                      className={
                                        subStatus.done
                                          ? 'sidebar__subtask-btn sidebar__subtask-btn--done'
                                          : 'sidebar__subtask-btn'
                                      }
                                      onClick={() =>
                                        onSelectItem(day.date, subtask.id)
                                      }
                                    >
                                      <span
                                        className="sidebar__marker sidebar__marker--subtask"
                                        style={
                                          {
                                            '--status-color': subStatus.color,
                                          } as CSSProperties
                                        }
                                      />
                                      {subtask.title}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
      )}
    </aside>
  );
});

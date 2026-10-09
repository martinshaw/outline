import { memo } from 'react';
import type { SidebarDay } from '../types';

type Props = {
  days: SidebarDay[];
  activeDate: string;
  collapsed: boolean;
  onSelectDay: (date: string) => void | Promise<void>;
  onSelectItem: (date: string, itemId: string) => void | Promise<void>;
};

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
                    {day.tasks.map((task) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          className="sidebar__task-btn"
                          onClick={() => onSelectItem(day.date, task.id)}
                        >
                          <span className="sidebar__marker sidebar__marker--task" />
                          {task.title}
                        </button>
                        {task.subtasks.length > 0 && (
                          <ul className="sidebar__subtasks">
                            {task.subtasks.map((subtask) => (
                              <li key={subtask.id}>
                                <button
                                  type="button"
                                  className="sidebar__subtask-btn"
                                  onClick={() =>
                                    onSelectItem(day.date, subtask.id)
                                  }
                                >
                                  <span className="sidebar__marker sidebar__marker--subtask" />
                                  {subtask.title}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
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

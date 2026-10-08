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
      <div className="sidebar__header">Notes</div>
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
                {day.projects.length > 0 && (
                  <ul className="sidebar__projects">
                    {day.projects.map((project) => (
                      <li key={project.id}>
                        <button
                          type="button"
                          className="sidebar__project-btn"
                          onClick={() => onSelectItem(day.date, project.id)}
                        >
                          <span className="sidebar__marker sidebar__marker--project" />
                          {project.title}
                        </button>
                        {project.tasks.length > 0 && (
                          <ul className="sidebar__tasks">
                            {project.tasks.map((task) => (
                              <li key={task.id}>
                                <button
                                  type="button"
                                  className="sidebar__task-btn"
                                  onClick={() =>
                                    onSelectItem(day.date, task.id)
                                  }
                                >
                                  <span className="sidebar__marker sidebar__marker--task" />
                                  {task.title}
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

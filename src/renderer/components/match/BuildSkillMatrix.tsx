import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AssistChampionGuide, MatchTimelineEvent } from '../../../shared/api';
import { buildSkillMatrix } from './buildSkillMatrixModel';
import { GameIcon } from './GameIcon';

function timeLabel(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(timestamp / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function BuildSkillMatrix({ events, spells }: {
  events: MatchTimelineEvent[];
  spells: AssistChampionGuide['spells'];
}) {
  const root = useRef<HTMLDivElement>(null);
  const [columnsPerTable, setColumnsPerTable] = useState(18);
  const matrix = useMemo(() => buildSkillMatrix(events), [events]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => setColumnsPerTable(element.clientWidth < 540 ? 9 : 18);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const pages = Array.from({ length: Math.ceil(matrix.columnCount / columnsPerTable) }, (_, page) => {
    const start = page * columnsPerTable;
    return Array.from({ length: Math.min(columnsPerTable, matrix.columnCount - start) }, (_, index) => start + index);
  });

  return (
    <div ref={root} className="lol-build-matrix">
      {pages.map(columns => (
        <table key={columns[0]} className="lol-build-matrix__table" aria-label={`技能加点，第 ${columns[0] + 1} 至 ${columns[columns.length - 1] + 1} 次`}>
          <colgroup><col className="lol-build-matrix__label-col" /><col span={columns.length} /></colgroup>
          <thead>
            <tr>
              <th scope="col" title="按实际升级事件排序，不将加点序号推断为英雄等级">序号</th>
              {columns.map(index => <th key={index} scope="col" className={matrix.steps[index] ? '' : 'is-pending'}>{index + 1}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.keys.map(key => {
              const spell = spells.find(item => item.key === key);
              return (
                <tr key={key} className={key === 'R' ? 'is-ultimate' : ''}>
                  <th scope="row">
                    <span className="lol-build-matrix__skill" title={spell?.name || key}>
                      {spell?.icon ? <GameIcon src={spell.icon} alt="" size={34} /> : <span className="lol-build-matrix__art-empty" aria-hidden="true" />}
                      <b>{key}</b>
                    </span>
                  </th>
                  {columns.map(index => {
                    const step = matrix.steps[index];
                    const active = step?.key === key;
                    const label = active
                      ? `第 ${index + 1} 次加点 · ${key}${spell?.name ? ` ${spell.name}` : ''} · 技能 ${step.rank} 级 · ${timeLabel(step.timestamp)}`
                      : step ? `第 ${index + 1} 次未升级 ${key}` : `第 ${index + 1} 次无升级记录`;
                    return (
                      <td key={index} className={['lol-build-matrix__cell', active ? 'is-active' : '', !step ? 'is-pending' : ''].filter(Boolean).join(' ')} data-sequence={index + 1} data-skill={key}>
                        <span tabIndex={active ? 0 : undefined} title={label} aria-label={label}>
                          {active ? <b>{step.rank}</b> : <i aria-hidden="true" />}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
      {matrix.steps.length === 0 && <p className="lol-build-empty">无技能升级记录</p>}
    </div>
  );
}

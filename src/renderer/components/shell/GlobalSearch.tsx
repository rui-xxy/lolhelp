import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Search } from 'lucide-react';
import { MatchRegionPicker, type MatchRegionOption } from '../match/MatchRegionPicker';

export interface GlobalSearchHandle {
  setValue: (value: string) => void;
  focus: () => void;
}

interface GlobalSearchProps {
  defaultValue: string;
  region: string;
  regions: MatchRegionOption[];
  onRegionChange: (region: string) => void;
  onSubmit: (name: string) => void;
  onValueCommit?: (name: string) => void;
}

// 顶栏全局查人：每一页都在，Ctrl+K 聚焦；提交后在战绩页打开。
export const GlobalSearch = forwardRef<GlobalSearchHandle, GlobalSearchProps>(function GlobalSearch(
  { defaultValue, region, regions, onRegionChange, onSubmit, onValueCommit },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    setValue: (value: string) => {
      if (inputRef.current) inputRef.current.value = value;
    },
    focus: () => inputRef.current?.focus(),
  }), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <form
      className="shell-search"
      onSubmit={(event) => {
        event.preventDefault();
        const value = inputRef.current?.value.trim() ?? '';
        onSubmit(value);
      }}
    >
      <MatchRegionPicker value={region} options={regions} onChange={onRegionChange} />
      <label className="shell-search__field">
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          defaultValue={defaultValue}
          onBlur={(event) => onValueCommit?.(event.currentTarget.value)}
          placeholder="查召唤师：名字#编号"
          aria-label="查召唤师，留空查自己"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <span className="shell-search__kbd" aria-hidden="true">Ctrl K</span>
      <button type="submit" className="shell-search__submit">查询</button>
    </form>
  );
});

import { ChevronDown, Download, Save, Trash2 } from 'lucide-react';
import type {
  LolConfigProfileSummary,
  LolConfigState,
} from '../../../shared/api';
import { Button } from '../ui/button';
import { Panel } from './SettingsControls';

function formatTime(timestamp: number | null): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
}

function profileLabel(profile: LolConfigProfileSummary): string {
  return `${profile.name} · ${profile.gameResolution}`;
}

export function ProfileSettings({
  state,
  profileName,
  setProfileName,
  profiles,
  selectedProfileId,
  setSelectedProfileId,
  onSaveProfile,
  onApplyProfile,
  onDeleteProfile,
  busy,
}: {
  state: LolConfigState | null;
  profileName: string;
  setProfileName: (value: string) => void;
  profiles: LolConfigProfileSummary[];
  selectedProfileId: string;
  setSelectedProfileId: (value: string) => void;
  onSaveProfile: () => void;
  onApplyProfile: () => void;
  onDeleteProfile: () => void;
  busy: string | null;
}) {
  return (
    <div className="mx-auto grid w-full max-w-[760px] gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Panel title="方案">
        <div className="space-y-2">
          <input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            className="h-9 w-full rounded-sm border border-app-border bg-app-surface px-3 text-sm outline-none transition focus:border-app-primary/55 focus:ring-2 focus:ring-app-primary/10"
          />
          <Button className="w-full" onClick={onSaveProfile} disabled={Boolean(busy)}>
            <Save className="size-4" />
            保存为方案
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="relative">
            <select
              value={selectedProfileId}
              onChange={(event) => setSelectedProfileId(event.target.value)}
              className="h-9 w-full appearance-none rounded-sm border border-app-border bg-app-surface px-3 pr-8 text-sm outline-none transition focus:border-app-primary/55 focus:ring-2 focus:ring-app-primary/10"
            >
              {profiles.length === 0 ? (
                <option value="">暂无方案</option>
              ) : (
                profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profileLabel(profile)}
                  </option>
                ))
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-app-muted" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={onApplyProfile} disabled={!selectedProfileId || Boolean(busy)}>
              <Download className="size-4" />
              一键应用
            </Button>
            <Button
              variant="outline"
              onClick={onDeleteProfile}
              disabled={!selectedProfileId || Boolean(busy)}
            >
              <Trash2 className="size-4" />
              删除
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="文件">
        <div className="space-y-2">
          <div className="overflow-hidden rounded-sm border border-app-border bg-app-surface divide-y divide-app-border/70">
          {(state?.files ?? []).map((file) => (
            <div
              key={file.key}
              className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 transition-colors hover:bg-app-bg-soft/55"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${
                      file.exists ? 'bg-app-success' : 'bg-app-danger'
                    }`}
                  />
                  <span className="text-sm font-medium text-app-text">{file.label}</span>
                </div>
                <p className="mt-1 break-all text-xs text-app-muted">{file.path}</p>
              </div>
              <div className="text-right text-xs text-app-muted">
                <div>{file.exists ? `${Math.round(file.size / 1024)} KB` : '缺失'}</div>
                <div className="mt-1">{formatTime(file.updatedAt)}</div>
              </div>
            </div>
          ))}
          </div>
        </div>
        {state?.warnings.length ? (
          <div className="mt-3 rounded-sm border border-app-danger/25 bg-app-danger/5 px-3 py-2 text-xs text-app-danger">
            {state.warnings.slice(0, 3).map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

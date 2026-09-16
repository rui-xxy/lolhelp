import { LcuConnectionCard } from './LcuConnectionCard';

export function HomePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">主页</h1>
      <LcuConnectionCard />
    </div>
  );
}

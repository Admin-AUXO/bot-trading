export default function GlobalLoading() {
  return (
    <div className="space-y-5 p-6">
      <div className="skeleton skeleton-h-10 skeleton-w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-h-24 skeleton-w-full rounded-[16px]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="skeleton skeleton-h-56 skeleton-w-full rounded-[16px]" />
        <div className="skeleton skeleton-h-56 skeleton-w-full rounded-[16px]" />
      </div>
    </div>
  );
}

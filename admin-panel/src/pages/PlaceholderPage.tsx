export function PlaceholderPage({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
      {subtitle ? <p className="mt-2 text-neutral-500">{subtitle}</p> : null}
      <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-white p-12 text-center text-neutral-400">
        Static placeholder — connect APIs when you are ready.
      </div>
    </div>
  );
}

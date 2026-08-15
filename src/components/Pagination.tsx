export const PAGE_SIZE = 10;

export function paginate<T>(items: T[], page: number, pageSize = PAGE_SIZE) {
  const safePage = Math.max(1, Math.floor(page || 1));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

type PaginationProps = {
  page: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  className?: string;
};

function getVisiblePages(page: number, totalPages: number) {
  const pages: Array<number | "dots-start" | "dots-end"> = [];
  for (let p = 1; p <= totalPages; p++) {
    const isEdge = p === 1 || p === totalPages;
    const isNear = Math.abs(p - page) <= 1;
    if (isEdge || isNear) {
      pages.push(p);
    } else if (p < page && !pages.includes("dots-start")) {
      pages.push("dots-start");
    } else if (p > page && !pages.includes("dots-end")) {
      pages.push("dots-end");
    }
  }
  return pages;
}

export function Pagination({
  page,
  totalItems,
  onPageChange,
  pageSize = PAGE_SIZE,
  className = "",
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;

  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);

  return (
    <div
      className={`flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <span className="text-xs">
        {start}-{end} de {totalItems}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="min-h-9 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:border-neon/50 hover:text-foreground disabled:opacity-30"
        >
          Anterior
        </button>
        {getVisiblePages(safePage, totalPages).map((p) =>
          typeof p === "number" ? (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`min-h-9 min-w-9 rounded-lg border px-2.5 text-xs font-semibold ${
                p === safePage
                  ? "border-neon bg-neon text-neon-foreground"
                  : "border-border bg-surface hover:border-neon hover:text-neon"
              }`}
            >
              {p}
            </button>
          ) : (
            <span key={p} className="px-2 text-xs">
              ...
            </span>
          ),
        )}
        <button
          type="button"
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="min-h-9 rounded-lg border border-border bg-surface px-3 text-xs font-medium hover:border-neon/50 hover:text-foreground disabled:opacity-30"
        >
          Próxima
        </button>
      </div>
    </div>
  );
}

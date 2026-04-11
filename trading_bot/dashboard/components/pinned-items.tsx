"use client";

import clsx from "clsx";
import { Pin, PinOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "graduation-control:pins";
const PIN_EVENT = "graduation-control:pins-changed";
const MAX_PINS = 8;

export type PinnedItem = {
  id: string;
  kind: "candidate" | "position";
  label: string;
  href: string;
  secondary?: string;
  meta?: string;
  createdAt: string;
};

export function usePinnedItems() {
  const [items, setItems] = useState<PinnedItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readPinnedItems());
    sync();

    const onPinsChanged = () => sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        sync();
      }
    };

    window.addEventListener(PIN_EVENT, onPinsChanged);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(PIN_EVENT, onPinsChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const ids = useMemo(() => new Set(items.map((item) => pinKey(item.kind, item.id))), [items]);

  const toggle = (item: Omit<PinnedItem, "createdAt">) => {
    const next = readPinnedItems();
    const key = pinKey(item.kind, item.id);
    const existing = next.findIndex((entry) => pinKey(entry.kind, entry.id) === key);

    if (existing >= 0) {
      next.splice(existing, 1);
    } else {
      next.unshift({ ...item, createdAt: new Date().toISOString() });
      next.splice(MAX_PINS);
    }

    writePinnedItems(next);
  };

  const remove = (item: Pick<PinnedItem, "kind" | "id">) => {
    const next = readPinnedItems().filter((entry) => pinKey(entry.kind, entry.id) !== pinKey(item.kind, item.id));
    writePinnedItems(next);
  };

  return {
    items,
    isPinned: (item: Pick<PinnedItem, "kind" | "id">) => ids.has(pinKey(item.kind, item.id)),
    toggle,
    remove,
  };
}

export function PinToggleButton(props: {
  item: Omit<PinnedItem, "createdAt">;
  compact?: boolean;
  className?: string;
}) {
  const { isPinned, toggle } = usePinnedItems();
  const pinned = isPinned(props.item);

  return (
    <button
      type="button"
      onClick={() => toggle(props.item)}
      className={clsx(
        "btn-ghost inline-flex items-center gap-2 border border-bg-border px-3 py-2 text-xs",
        pinned && "border-[rgba(163,230,53,0.28)] bg-[#121511] text-text-primary",
        props.compact && "px-2.5 py-1.5",
        props.className,
      )}
      title={pinned ? `Remove ${props.item.label} from pinned items` : `Pin ${props.item.label}`}
      aria-label={pinned ? `Remove ${props.item.label} from pinned items` : `Pin ${props.item.label}`}
    >
      {pinned ? <PinOff className="h-3.5 w-3.5 text-accent" /> : <Pin className="h-3.5 w-3.5" />}
      {pinned ? "Pinned" : "Pin"}
    </button>
  );
}

export function PinnedItemsSidebar() {
  const { items, remove } = usePinnedItems();

  return (
    <div className="mt-4 rounded-[18px] border border-bg-border bg-[#121214] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="section-kicker">Pinned</div>
        <span className="meta-chip">{items.length}/{MAX_PINS}</span>
      </div>

      {items.length === 0 ? (
        <div className="mt-3 rounded-[12px] border border-dashed border-bg-border bg-bg-primary/45 px-3 py-3 text-xs leading-5 text-text-muted">
          Pin candidates or positions from the workbenches.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => (
            <div key={pinKey(item.kind, item.id)} className="rounded-[12px] border border-bg-border bg-bg-primary/55 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <a href={item.href} className="min-w-0 flex-1" title={`Open ${item.label}`}>
                  <div className="truncate text-sm font-semibold text-text-primary">{item.label}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                    <span className="uppercase tracking-[0.18em]">{item.kind}</span>
                    {item.secondary ? <span className="truncate">{item.secondary}</span> : null}
                    {item.meta ? <span className="truncate">{item.meta}</span> : null}
                  </div>
                </a>
                <button
                  type="button"
                  onClick={() => remove(item)}
                  className="text-xs font-semibold text-text-muted transition hover:text-text-primary"
                  title={`Remove ${item.label}`}
                >
                  <PinOff className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PinnedItemsStrip(props: { className?: string }) {
  const { items } = usePinnedItems();

  return (
    <section className={clsx("rounded-[18px] border border-bg-border bg-bg-hover/35 px-4 py-4", props.className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="section-kicker">Pinned watchlist</div>
          <div className="mt-1 text-sm text-text-secondary">
            {items.length > 0 ? "Fast jumps back into the records that still matter." : "Pin workbench rows to keep the desk anchored on live problems."}
          </div>
        </div>
        <span className="meta-chip">{items.length} tracked</span>
      </div>

      {items.length === 0 ? null : (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {items.map((item) => (
            <a
              key={pinKey(item.kind, item.id)}
              href={item.href}
              title={`Open ${item.label}`}
              className="min-w-[14rem] rounded-[14px] border border-bg-border bg-[#121214] px-3 py-3 transition hover:border-[rgba(255,255,255,0.12)] hover:bg-[#151517]"
            >
              <div className="section-kicker">{item.kind}</div>
              <div className="mt-2 truncate text-sm font-semibold text-text-primary">{item.label}</div>
              <div className="mt-1 truncate text-xs text-text-muted">
                {[item.secondary, item.meta].filter(Boolean).join(" · ") || item.href}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function pinKey(kind: PinnedItem["kind"], id: string) {
  return `${kind}:${id}`;
}

function readPinnedItems(): PinnedItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isPinnedItem)
      .slice(0, MAX_PINS);
  } catch {
    return [];
  }
}

function writePinnedItems(items: PinnedItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(PIN_EVENT));
}

function isPinnedItem(value: unknown): value is PinnedItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PinnedItem>;
  return Boolean(
    item.id
    && (item.kind === "candidate" || item.kind === "position")
    && item.label
    && item.href
    && item.createdAt,
  );
}

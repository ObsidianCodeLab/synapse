import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "./types";

const MAX_SUGGESTIONS = 8;

type NameSuggestion = {
  product: Product;
  name: string;
  score: number;
  highlightRanges: Array<[number, number]>;
};

/** 产品名称模糊评分；null 表示不匹配 */
export function scoreProductNameMatch(name: string, query: string): number | null {
  const n = name.trim();
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  if (!n) return null;

  const nameLower = n.toLowerCase();
  if (nameLower.startsWith(q)) return 1000 + Math.max(0, 80 - n.length);
  const idx = nameLower.indexOf(q);
  if (idx >= 0) return 850 - idx + Math.max(0, 40 - n.length);

  let qi = 0;
  let consecutiveBonus = 0;
  let lastMatchIdx = -1;
  for (let ni = 0; ni < nameLower.length && qi < q.length; ni++) {
    if (nameLower[ni] === q[qi]) {
      if (lastMatchIdx === ni - 1) consecutiveBonus += 8;
      lastMatchIdx = ni;
      qi++;
    }
  }
  if (qi === q.length) return 500 + consecutiveBonus - n.length;
  return null;
}

export function productMatchesNameFilter(product: Product, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  return scoreProductNameMatch(product.name, q) != null;
}

function buildHighlightRanges(name: string, query: string): Array<[number, number]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const nameLower = name.toLowerCase();
  const idx = nameLower.indexOf(q);
  if (idx >= 0) return [[idx, idx + q.length]];

  const ranges: Array<[number, number]> = [];
  let qi = 0;
  for (let ni = 0; ni < name.length && qi < q.length; ni++) {
    if (nameLower[ni] === q[qi]) {
      ranges.push([ni, ni + 1]);
      qi++;
    }
  }
  if (qi < q.length) return [];
  return mergeAdjacentRanges(ranges);
}

function mergeAdjacentRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    if (cur[0] <= prev[1]) {
      prev[1] = Math.max(prev[1], cur[1]);
    } else {
      out.push(cur);
    }
  }
  return out;
}

function buildNameSuggestions(products: Product[], query: string): NameSuggestion[] {
  const q = query.trim();
  if (!q) return [];
  const scored: NameSuggestion[] = [];
  for (const product of products) {
    const name = product.name.trim();
    const score = scoreProductNameMatch(name, q);
    if (score == null) continue;
    scored.push({
      product,
      name,
      score,
      highlightRanges: buildHighlightRanges(name, q),
    });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"));
  return scored.slice(0, MAX_SUGGESTIONS);
}

function HighlightedName({ name, ranges }: { name: string; ranges: Array<[number, number]> }) {
  if (ranges.length === 0) return <>{name}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (cursor < start) parts.push(<span key={`t-${i}`}>{name.slice(cursor, start)}</span>);
    parts.push(
      <mark
        key={`m-${i}`}
        className="rounded-sm bg-primary/20 px-0.5 font-semibold text-primary not-italic"
      >
        {name.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < name.length) parts.push(<span key="tail">{name.slice(cursor)}</span>);
  return <>{parts}</>;
}

type ProductNameSearchProps = {
  products: Product[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  filteredCount: number;
  totalCount: number;
  clearLabel: string;
  resultCountLabel: (filtered: number, total: number) => string;
};

export function ProductNameSearch({
  products,
  value,
  onChange,
  placeholder,
  filteredCount,
  totalCount,
  clearLabel,
  resultCountLabel,
}: ProductNameSearchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(() => buildNameSuggestions(products, value), [products, value]);
  const showSuggestions = focused && value.trim().length > 0 && suggestions.length > 0;

  const completionSuffix = useMemo(() => {
    const q = value.trim();
    if (!q || !showSuggestions) return "";
    const pick = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
    if (!pick) return "";
    const nameLower = pick.name.toLowerCase();
    const qLower = q.toLowerCase();
    if (!nameLower.startsWith(qLower)) return "";
    return pick.name.slice(q.length);
  }, [value, showSuggestions, suggestions, activeIndex]);

  useEffect(() => {
    setActiveIndex(suggestions.length > 0 ? 0 : -1);
  }, [value, suggestions.length]);

  useEffect(() => {
    if (!showSuggestions) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showSuggestions]);

  const applySuggestion = (suggestion: NameSuggestion) => {
    onChange(suggestion.name);
    setFocused(false);
    inputRef.current?.blur();
  };

  const completeActiveSuggestion = () => {
    const pick = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
    if (pick) applySuggestion(pick);
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        className={cn(
          "group relative flex items-center gap-3 pb-3 transition-all duration-300",
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-border/35 to-transparent transition-all duration-300",
            focused && "via-primary/70 shadow-[0_1px_8px_0_hsl(var(--primary)/0.35)]",
          )}
        />
        <Search
          size={18}
          className={cn(
            "shrink-0 transition-colors duration-300",
            focused ? "text-primary" : "text-muted-foreground/55 group-hover:text-muted-foreground/80",
          )}
        />

        <div className="relative min-w-0 flex-1">
          {completionSuffix ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 flex min-w-0 items-center truncate text-base font-medium tracking-tight md:text-sm"
            >
              <span className="invisible whitespace-pre">{value}</span>
              <span className="text-muted-foreground/25">{completionSuffix}</span>
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              window.setTimeout(() => setFocused(false), 120);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                if (!showSuggestions) return;
                e.preventDefault();
                setActiveIndex((i) => (i + 1) % suggestions.length);
              } else if (e.key === "ArrowUp") {
                if (!showSuggestions) return;
                e.preventDefault();
                setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
              } else if (e.key === "Tab") {
                if (showSuggestions && suggestions.length > 0) {
                  e.preventDefault();
                  completeActiveSuggestion();
                }
              } else if (e.key === "ArrowRight") {
                if (completionSuffix) {
                  e.preventDefault();
                  completeActiveSuggestion();
                }
              } else if (e.key === "Enter") {
                if (showSuggestions && activeIndex >= 0) {
                  e.preventDefault();
                  applySuggestion(suggestions[activeIndex]);
                }
              } else if (e.key === "Escape") {
                if (value) {
                  e.preventDefault();
                  onChange("");
                } else {
                  setFocused(false);
                  inputRef.current?.blur();
                }
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            aria-expanded={showSuggestions}
            aria-autocomplete="list"
            role="combobox"
            className="relative z-10 w-full bg-transparent text-base font-medium tracking-tight text-foreground placeholder:text-muted-foreground/45 focus:outline-none md:text-sm"
          />
        </div>

        {value.trim() ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="shrink-0 rounded-full p-1 text-muted-foreground/50 transition-colors hover:bg-muted/40 hover:text-foreground"
            aria-label={clearLabel}
          >
            <X size={14} />
          </button>
        ) : null}

        <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
          {resultCountLabel(filteredCount, totalCount)}
        </span>
      </div>

      {showSuggestions ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-border/40 bg-popover/95 shadow-2xl shadow-primary/5 backdrop-blur-xl animate-in fade-in-0 slide-in-from-top-1 duration-200"
        >
          {suggestions.map((item, index) => (
            <li key={item.product.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm transition-colors",
                  index === activeIndex
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground/90 hover:bg-muted/50",
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => applySuggestion(item)}
              >
                <PackageGlyph active={index === activeIndex} />
                <span className="min-w-0 truncate font-medium">
                  <HighlightedName name={item.name} ranges={item.highlightRanges} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PackageGlyph({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors",
        active ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground",
      )}
    >
      <Package size={12} strokeWidth={2.2} />
    </span>
  );
}

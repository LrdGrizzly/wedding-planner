import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { Ban, Check, CircleHelp, Coins, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { syncAtBoundary } from '@/lib/drive';
import { parseAmount, currencySymbol, LOCALE } from '@/lib/format';
import type { ItemStatus } from '@/lib/types';

// ── Buttons ────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-[background,color,transform,box-shadow] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 select-none',
        size === 'md' ? 'h-10 px-4 text-sm' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-accent text-accent-ink shadow-card hover:brightness-110',
        variant === 'secondary' && 'bg-surface text-ink border border-line hover:border-line-strong',
        variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        variant === 'danger' && 'text-na hover:bg-na-bg',
        className,
      )}
    />
  );
}

export function IconButton({ label, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition hover:bg-surface-2 hover:text-ink active:scale-95',
        className,
      )}
    />
  );
}

// ── Card & section ─────────────────────────
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('rounded-2xl border border-line bg-surface shadow-card', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="font-display text-xl font-medium tracking-tight text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 md:mb-7">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] leading-tight font-medium tracking-tight text-ink md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">{icon}</div>
      <p className="font-display text-lg text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ── Inputs ─────────────────────────────────
const inputCls =
  'h-10 w-full rounded-xl border border-line bg-surface px-3 text-ink placeholder:text-muted/70 transition focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/15';

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Text input that only commits on blur/enter, so typing doesn't spam syncs. */
export function TextInput({
  value,
  onCommit,
  className,
  multiline,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  if (multiline) {
    return (
      <textarea
        value={draft}
        placeholder={rest.placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        rows={3}
        className={cn(inputCls, 'h-auto min-h-20 py-2.5 leading-relaxed', className)}
      />
    );
  }
  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(inputCls, className)}
    />
  );
}

/** Amount input. Blank = unknown (never a guessed zero). */
export function AmountInput({
  value,
  onCommit,
  currency,
  suffix,
  placeholder = '—',
  className,
  ariaLabel,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  currency?: string;
  suffix?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  // Shown the Italian way (comma decimals, no grouping while editing)
  const show = (v: number | null) => (v == null ? '' : v.toLocaleString(LOCALE, { useGrouping: false, maximumFractionDigits: 2 }));
  const [draft, setDraft] = useState(show(value));
  useEffect(() => setDraft(show(value)), [value]);
  const commit = () => {
    const n = parseAmount(draft);
    if (n !== value) onCommit(n);
    setDraft(show(n));
  };
  return (
    <div className={cn('relative', className)}>
      {currency && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted">{currencySymbol(currency)}</span>}
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={cn(inputCls, 'tabular-nums', currency && 'pl-7', suffix && 'pr-8')}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(inputCls, 'cursor-pointer appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a8174' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Segmented control (sliding highlight) ──
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; activeClass?: string; title?: string }[];
  className?: string;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-full bg-surface-2 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative flex-1 rounded-full font-medium whitespace-nowrap transition-colors',
              size === 'md' ? 'h-9 px-3.5 text-[13px]' : 'h-8 px-2 text-xs sm:px-2.5',
              active ? 'text-ink' : 'text-muted hover:text-ink-2',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className={cn('absolute inset-0 rounded-full bg-surface shadow-card', o.activeClass)}
                transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Item status ────────────────────────────
export const STATUS_STYLE: Record<ItemStatus, { fg: string; bg: string; icon: typeof Check; label: string; short: string }> = {
  included: { fg: 'text-inc', bg: 'bg-inc-bg', icon: Check, label: 'Incluso', short: 'Incluso' },
  extra: { fg: 'text-ext', bg: 'bg-ext-bg', icon: Coins, label: 'A pagamento', short: 'Extra' },
  unavailable: { fg: 'text-na', bg: 'bg-na-bg', icon: Ban, label: 'Non previsto', short: "Non c'è" },
  unknown: { fg: 'text-unk', bg: 'bg-unk-bg', icon: CircleHelp, label: 'Da chiedere', short: '?' },
};

export function StatusPill({ status, className, compact }: { status: ItemStatus; className?: string; compact?: boolean }) {
  const s = STATUS_STYLE[status];
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', s.fg, s.bg, className)}>
      <Icon className="size-3.5" strokeWidth={2.25} />
      {!compact && s.label}
    </span>
  );
}

export function StatusPicker({ value, onChange }: { value: ItemStatus; onChange: (s: ItemStatus) => void }) {
  const order: ItemStatus[] = ['included', 'extra', 'unavailable', 'unknown'];
  return (
    <Segmented
      size="sm"
      ariaLabel="Cosa offre la location"
      value={value}
      onChange={onChange}
      className="min-w-0 flex-1 sm:flex-none"
      options={order.map((st) => {
        const s = STATUS_STYLE[st];
        const Icon = s.icon;
        return {
          value: st,
          title: s.label,
          activeClass: cn(s.bg, 'shadow-none'),
          label: (
            <span className={cn('inline-flex items-center gap-1', value === st && s.fg)}>
              <Icon className="size-3.5 shrink-0" strokeWidth={2.25} />
              {st === 'unknown' ? (
                <span className="hidden sm:inline">{s.label}</span>
              ) : (
                <>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </>
              )}
            </span>
          ),
        };
      })}
    />
  );
}

// ── Sheet: bottom sheet on phones, side panel on desktop ──
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useDragControls();
  // Closing a panel is a natural pause: renew Google access inside this gesture and sync
  const close = () => {
    syncAtBoundary();
    onClose();
  };
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setDesktop(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Portal to <body>: page transitions apply transforms, which would trap a fixed panel
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-[#1b150c]/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className={cn(
              'absolute flex flex-col bg-bg shadow-pop outline-none',
              desktop
                ? cn('top-0 right-0 h-full w-full border-l border-line', wide ? 'max-w-2xl' : 'max-w-lg')
                : 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl border-t border-line',
            )}
            initial={desktop ? { x: '100%' } : { y: '100%' }}
            animate={desktop ? { x: 0 } : { y: 0 }}
            exit={desktop ? { x: '100%' } : { y: '100%' }}
            transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
            drag={desktop ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragListener={false}
            dragControls={drag}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) close();
            }}
          >
            {!desktop && (
              <div className="flex cursor-grab touch-none justify-center pt-2.5 pb-1" onPointerDown={(e) => drag.start(e)}>
                <span className="h-1 w-10 rounded-full bg-line-strong" />
              </div>
            )}
            <div className="flex items-start gap-3 border-b border-line px-5 pt-3 pb-4 md:px-6 md:pt-6">
              <div className="min-w-0 flex-1">
                <div className="font-display text-2xl leading-tight font-medium tracking-tight">{title}</div>
                {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
              </div>
              <IconButton label="Chiudi" onClick={close} className="-mt-1 -mr-2">
                <X className="size-5" />
              </IconButton>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 md:px-6">{children}</div>
            {footer && <div className="pb-safe border-t border-line bg-bg px-5 py-3 md:px-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── Confirm (tiny, inline) ─────────────────
export function useConfirm() {
  return (message: string) => window.confirm(message);
}

export function Stars({ value, onChange, size = 'md' }: { value: number | null; onChange?: (v: number | null) => void; size?: 'sm' | 'md' }) {
  const n = value ?? 0;
  return (
    <div className="inline-flex items-center" role={onChange ? 'radiogroup' : undefined} aria-label="Valutazione">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          aria-label={`${i} stell${i > 1 ? 'e' : 'a'}`}
          onClick={() => onChange?.(value === i ? null : i)}
          className={cn('disabled:cursor-default', size === 'md' ? 'p-1' : 'p-0')}
        >
          <svg viewBox="0 0 24 24" className={cn(size === 'md' ? 'size-6' : 'size-3.5', i <= n ? 'fill-gold text-gold' : 'fill-transparent text-line-strong')} stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinejoin="round" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

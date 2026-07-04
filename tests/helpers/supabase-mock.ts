import { vi } from "vitest";

/**
 * Minimal fake of the supabase-js/postgrest-js fluent query builder.
 *
 * Real usage in the route handlers looks like:
 *   admin.from("table").select("*").eq("a", 1).maybeSingle()
 *   await admin.from("table").update({...}).eq("a", 1)          // no terminal call — builder itself is thenable
 *
 * This fake resolves a canned { data, error } response keyed by TABLE + the
 * *first* chained call after `.from()` (which is always the operation verb:
 * select/insert/update/upsert/delete in supabase-js). That keeps test setup
 * decoupled from the exact call order across different tables, while still
 * letting a test provide a queue of responses for repeated calls to the same
 * operation (e.g. two `.select()` calls against the same table in one request).
 *
 * Every chain call (`.eq`, `.order`, `.limit`, the operation call itself,
 * etc.) is recorded on `chain.__calls` so tests can assert exactly what
 * filters/payloads reached the "database" — e.g. that an update carries a
 * `.eq("status", "absent")` guard.
 */

export interface ChainResult {
  data: unknown;
  error: unknown;
}

export interface ChainCall {
  method: string;
  args: unknown[];
}

type ResponseSpec = ChainResult | ChainResult[];

type OperationName = "select" | "insert" | "update" | "upsert" | "delete";

const OPERATION_NAMES: readonly OperationName[] = [
  "select",
  "insert",
  "update",
  "upsert",
  "delete",
];

const MODIFIER_METHODS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "in",
  "is",
  "not",
  "order",
  "limit",
  "single",
  "maybeSingle",
] as const;

export type TableOperations = Partial<Record<OperationName, ResponseSpec>>;

export interface FakeChain {
  __calls: ChainCall[];
  [key: string]: unknown;
}

function toQueue(spec: ResponseSpec): ChainResult[] {
  return Array.isArray(spec) ? spec : [spec];
}

function createChain(ops: TableOperations, table: string): FakeChain {
  const calls: ChainCall[] = [];
  const chain: FakeChain = { __calls: calls };

  // Per-operation call counters live on the table-level state, not per chain
  // instance, so a queue provided for e.g. `select` is consumed across the
  // multiple `.from(table).select()` calls a single request may make.
  const consumed = tableOperationCounters(table, ops);

  const record = (method: string, args: unknown[]) => {
    calls.push({ method, args });
  };

  const bumpAndResolve = (): ChainResult => {
    const opCall = calls.find((c) =>
      OPERATION_NAMES.includes(c.method as OperationName),
    );
    const opName = (opCall?.method as OperationName | undefined) ?? "select";
    const entry = ops[opName];
    if (!entry) {
      throw new Error(
        `supabase-mock: no response registered for ${table}.${opName}()`,
      );
    }
    const queue = toQueue(entry);
    const current = consumed[opName] ?? 0;
    const idx = Math.min(current, queue.length - 1);
    consumed[opName] = current + 1;
    return queue[idx] as ChainResult;
  };

  for (const op of OPERATION_NAMES) {
    chain[op] = (...args: unknown[]) => {
      record(op, args);
      return chain;
    };
  }
  for (const method of MODIFIER_METHODS) {
    if (method === "single" || method === "maybeSingle") {
      chain[method] = (...args: unknown[]) => {
        record(method, args);
        return Promise.resolve(bumpAndResolve());
      };
    } else {
      chain[method] = (...args: unknown[]) => {
        record(method, args);
        return chain;
      };
    }
  }

  chain.then = (onFulfilled?: (v: ChainResult) => unknown, onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(bumpAndResolve()).then(onFulfilled, onRejected);
  chain.catch = (onRejected?: (e: unknown) => unknown) =>
    Promise.resolve(bumpAndResolve()).catch(onRejected);

  return chain;
}

// Table-scoped per-operation call counters, keyed by table name so repeated
// `.from(table)` calls within one test share the same queue position.
const counterRegistry = new WeakMap<TableOperations, Record<string, number>>();
function tableOperationCounters(_table: string, ops: TableOperations) {
  let counters = counterRegistry.get(ops);
  if (!counters) {
    counters = {};
    counterRegistry.set(ops, counters);
  }
  return counters;
}

export interface SupabaseMock {
  from: ReturnType<typeof vi.fn>;
  /** All chain instances created per table, in call order — for call assertions. */
  chainsByTable: Record<string, FakeChain[]>;
}

export function createSupabaseMock(
  tables: Record<string, TableOperations>,
): SupabaseMock {
  const chainsByTable: Record<string, FakeChain[]> = {};

  const from = vi.fn((table: string) => {
    const ops = tables[table];
    if (!ops) {
      throw new Error(`supabase-mock: no mock registered for table "${table}"`);
    }
    const chain = createChain(ops, table);
    (chainsByTable[table] ??= []).push(chain);
    return chain;
  });

  return { from, chainsByTable };
}

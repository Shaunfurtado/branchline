declare module 'node:test' {
  type TestBody = () => void | Promise<void>;
  const test: (name: string, body: TestBody) => void;
  export default test;
}

declare module 'node:assert/strict' {
  interface StrictAssert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    match(value: string, regexp: RegExp, message?: string): void;
    doesNotThrow(fn: () => unknown, message?: string): void;
    throws(fn: () => unknown, expected?: unknown, message?: string): void;
    rejects(promise: Promise<unknown>, expected?: unknown, message?: string): Promise<void>;
  }
  const assert: StrictAssert;
  export default assert;
}

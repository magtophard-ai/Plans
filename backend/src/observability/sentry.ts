import * as Sentry from '@sentry/node';

let initialized = false;

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      // Keep tracesSampleRate conservative — beta-diagnostic use only.
      tracesSampleRate: 0.1,
    });
    initialized = true;
  } catch {
    // Fail silently — observability must never crash the server on startup.
  }
}

export function captureError(err: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  try {
    if (context) Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
      Sentry.captureException(err);
    });
    else Sentry.captureException(err);
  } catch {
    // ignore — a throw here would propagate out of the global Fastify error
    // handler and prevent the 500 response from being sent.
  }
}

// captureException is async — it queues the event and sends it on a background
// timer. Before process.exit() or during a graceful shutdown we need to flush
// the queue or the event is silently dropped.
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // ignore — flush errors must not block shutdown
  }
}

export { Sentry };

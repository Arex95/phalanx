# Realtime connections

A long-lived stream has to survive three things a normal request does not: the
access token expiring, the network disappearing, and a server that stops
answering. `RealtimeConnection` handles the three and leaves the transport to
you.

```ts
import { RealtimeConnection } from '@arex95/phalanx';
import { fetchEventSource } from '@microsoft/fetch-event-source';

const connection = new RealtimeConnection({
    open: ({ token, signal, onOpen, onAuthError, onConnectError, onStreamError }) =>
        fetchEventSource('/api/events', {
            signal,
            headers: { Authorization: `Bearer ${token}` },
            openWhenHidden: true,
            onopen: async (res) => {
                if (res.ok) return onOpen();
                if (res.status === 401 || res.status === 403) return onAuthError();
                onConnectError();
            },
            onmessage: (event) => handle(JSON.parse(event.data)),
            onerror: onStreamError
        })
});

connection.start();
onUnmounted(() => connection.stop());
```

The library ships no transport. `fetch-event-source` above is one choice; a
`WebSocket` or a plain `EventSource` works the same way — report progress
through the callbacks and stop when `signal` fires.

## What it does for you

- **Waits for a token** and opens as soon as one exists; closes when it is
  cleared.
- **Refreshes on rejection.** A 401 or 403 from the stream triggers a token
  refresh and reopens with the new one, instead of reconnecting in a loop
  against an expired token.
- **Backs off.** Retries with exponential delay, capped, and randomised so a
  fleet of tabs recovering from one outage does not return in lockstep.
- **Gives up.** After `maxAttempts` it enters `circuitOpen` and stops, until
  `retryNow()`.
- **Follows the network.** `offline` closes the stream, `online` reopens it.

## Status

```vue
<script setup lang="ts">
const status = connection.status;   // Readonly<Ref<ConnectionState>>
</script>

<template>
  <StatusBadge v-if="status.kind === 'reconnecting'" :retry-in="status.delayMs" />
  <button v-else-if="status.kind === 'circuitOpen'" @click="connection.retryNow()">
    Reconnect
  </button>
</template>
```

States: `idle`, `unauthenticated`, `offline`, `connecting`, `open`,
`reconnecting`, `circuitOpen`, `closed`.

## Tuning the backoff

```ts
new RealtimeConnection({
    open,
    backoff: { baseMs: 1_000, factor: 2, capMs: 30_000, maxAttempts: 3 }
});
```

## Backend health

Connection failures feed a shared health signal, so a banner can say the API is
unreachable without every component tracking it.

```ts
import { useBackendHealth, onBackendRecovered } from '@arex95/phalanx';

const { isDown, isRetrying, retry } = useBackendHealth();

onBackendRecovered(() => queryClient.refetchQueries());
```

`isDown` turns true after two failures within eight seconds, configurable with
`configBackendHealth({ threshold, windowMs })`. `retry()` runs the registered
recovery handlers and holds `isRetrying` until they settle.

What "recover" means belongs to the application, so the library holds handlers
rather than importing a query client. `reportBackendFailure()` and
`reportBackendSuccess()` are exported for code that wants to feed the signal
from its own requests.

Pass `reportHealth: false` to keep a connection out of it.

## The state machine on its own

`nextConnectionState(state, event, ctx, backoff)` is a pure function: it owns no
socket, timer or clock, and returns the next state plus the effects a driver
must perform. `RealtimeConnection` is that driver; import the machine directly
only to write a different one.

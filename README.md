# @w6w/ui

React components for [w6w](https://github.com/w6w-io), a workflow platform. Ships components used by the reference studio and available for any partner app that talks to a w6w server.

## Install

```sh
npm install @w6w/ui
```

## Usage

The components are **pure presentation** — you pass in data and handlers, so you can wire them to whatever API client and state management you already use.

```tsx
import { AddConnectionModal } from "@w6w/ui";
import "@w6w/ui/styles.css";

<AddConnectionModal
  apps={apps}
  getAppAuth={(appId) => api.getAppAuth(appId)}
  createConnection={(appId, body) => api.createConnection(appId, body)}
  startOAuthFlow={(appId, authKey, body) => api.startAppOAuthFlow(appId, authKey, body)}
  onClose={() => setModalOpen(false)}
  onCreated={() => refetch()}
/>
```

## Theming

`styles.css` defines defaults for CSS custom properties under the `--w6w-*` namespace (`--w6w-panel`, `--w6w-border`, `--w6w-text`, `--w6w-muted`, `--w6w-accent`, `--w6w-danger`, `--w6w-radius`). Override them at `:root` (or any parent) to theme the components.

```css
:root {
  --w6w-panel: #ffffff;
  --w6w-accent: #6b46c1;
}
```

## License

MIT

<<<<<<< HEAD
# Simple Crypto Wallet

A zero-knowledge cryptocurrency wallet dApp built on **Midnight Network** — a data-protection blockchain that uses the **Compact** smart contract language. The wallet lets users register a wallet identity on-chain, record deposits, authorize transfers with ZK-proved credentials, and maintain an auditable transaction history — all while keeping ownership secrets and PINs completely private.

## Project Vision

Traditional blockchain wallets expose every transaction detail — sender, receiver, and amounts — to any on-chain observer. **Simple Crypto Wallet** uses Midnight Network's zero-knowledge proof system to give users meaningful privacy: deposits and transfer counts are auditable (public), but the secrets that prove ownership and authorize actions are **never revealed on-chain**. Instead, the contract verifies ZK proofs that the user *knows* the correct credentials without those credentials ever leaving the user's device or appearing in any transaction. This makes the wallet suitable for real-world use where financial privacy is a right, not an afterthought.

**Privacy story in plain English:**
- 🔓 **Public (visible to anyone):** your wallet label, total deposited amount, number of authorized transfers, last transaction reference.
- 🔒 **Private (ZK-proved, never on-chain):** your owner secret (proves you own the wallet), your authorization PIN (proves you approved a transfer). An observer sees *that* a transfer was authorized, but **cannot learn the credentials used to authorize it**.

## Smart Contract Deployment

- **Network:** Preview
- **Deployed contract ID:** `[PENDING — fund wallet then run: npm run deploy -- --network preview]`

> **Your wallet address:** `mn_addr_preview1zvm5p3sam5tuskamm0txr9vue4hkal85jwhfxt4h27aljdu9kr8sry7zun`
>
> **Fund at:** https://midnight-tmnight-preview.nethermind.dev
>
> After funding, re-run `npm run deploy -- --network preview`. The contract address will be printed and saved to `.midnight-state.json`. Then update `VITE_CONTRACT_ADDRESS` in `frontend/.env.local`.

## Key Features

- **ZK Wallet Registration** — Register a wallet on-chain with a public label. Your owner secret is used as a ZK witness to set the on-chain commitment — the raw secret is *never stored or emitted*.
- **Deposit Recording** — Record incoming deposits with amount + transaction reference. Both are intentionally public for auditability.
- **Zero-Knowledge Transfer Authorization** — Authorize a transfer by proving you know your owner secret AND a distinct PIN. The chain verifies both proofs without seeing either value. Displayed in the UI as: `"Proved without revealing your input"`.
- **Transaction Audit Trail** — Append transaction records (hash + direction) to the public on-chain log.
- **Privacy-First Frontend** — Private fields use `type="password"`, are never assigned to React state, and are dropped immediately after proof generation. No secret ever appears in console logs, network requests, or the indexer.
- **Preview Network live** — Connects to Midnight Preview via the DApp Connector wallet adapter. Network badge and mismatch detection built in.

## Future Scope

- **Multi-wallet support** — Allow one user to register and switch between multiple named wallets in a single session.
- **Shielded transfers** — Integrate Midnight's shielded UTXO model to hide transfer amounts in addition to credentials.
- **ERC-20 / token tracking** — Extend deposit recording to support named token types alongside tNight.
- **Mainnet deployment** — Move from Preview to Midnight Mainnet once the network launches.
- **Mobile PWA** — Package the frontend as a Progressive Web App for mobile wallet management.
- **Multi-sig authorization** — Require M-of-N owner secrets for high-value transfers using Compact's multi-witness circuit patterns.

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Compact 0.31.0 (Midnight Network) |
| ZK Proofs | Midnight proof-server 8.1.0 |
| Deploy / CLI | Node.js 24, TypeScript, tsx |
| Wallet SDK | `@midnight-ntwrk/wallet-sdk` 1.2.0 |
| Indexer Client | `@midnight-ntwrk/midnight-js-indexer-public-data-provider` 4.1.1 |
| Frontend | React 19, Vite 8, TypeScript |
| Hosting | Vercel / Netlify (SPA config included) |
| Tests | Vitest 3.2.4 (15 passing) |
| Container | Docker Desktop (proof-server + devnet) |

## Local Development

### Prerequisites

- Node.js ≥ 22
- Docker Desktop running
- WSL2 with Ubuntu (for `compact compile`)
- Compact 0.31.0 installed in WSL at `~/.local/bin/compact`

### Step 1 — Install dependencies

```bash
# From the project root
npm.cmd install

# Frontend
cd frontend && npm.cmd install && cd ..
```

### Step 2 — Compile the contract

```bash
npm.cmd run compile
```

This runs `compact compile +0.31.0` via WSL and generates `contracts/managed/wallet/` with prover/verifier keys.

### Step 3 — Run tests

```bash
npm.cmd run test
```

Expected output: **15 tests passing** (circuit logic + privacy guarantee test).

### Step 4a — Deploy to local devnet

```bash
# Starts node + indexer + proof-server, compiles, and deploys
npm.cmd run setup
```

### Step 4b — Deploy to Preview Network

```bash
# Start proof server only
docker compose up -d proof-server

# Deploy (wallet address printed if unfunded)
npm.cmd run deploy -- --network preview
```

Fund your wallet at https://midnight-tmnight-preview.nethermind.dev if prompted, then re-run.

### Step 5 — Set contract address in frontend

After deploy, copy the printed contract address and create `frontend/.env.local`:

```env
VITE_NETWORK=preview
VITE_CONTRACT_ADDRESS=<paste contract address here>
VITE_INDEXER_URL=https://indexer.preview.midnight.network/api/v4/graphql
VITE_INDEXER_WS_URL=wss://indexer.preview.midnight.network/api/v4/graphql/ws
```

### Step 6 — Run the frontend

```bash
# Dev server
npm.cmd run frontend:dev

# Production build (0 errors expected)
npm.cmd run frontend:build
```

### Step 7 — Interactive CLI

```bash
npm.cmd run cli
```

The CLI supports all 4 circuits interactively. Private inputs (owner secret, PIN) are collected at runtime, used for ZK proof generation, and immediately dropped — they are never logged.

### Available scripts

| Script | Description |
|---|---|
| `npm run compile` | Compile the Compact contract via WSL |
| `npm run test` | Run all 15 vitest tests |
| `npm run deploy` | Deploy contract (add `-- --network preview` for Preview) |
| `npm run cli` | Interactive CLI for all circuits |
| `npm run frontend:dev` | Start React dev server |
| `npm run frontend:build` | Production build (0 errors) |
| `npm run setup` | One-shot: start devnet + compile + deploy |
| `docker compose up -d` | Start local devnet containers |

### Project Structure

```
simple-crypto-wallet/
├── contracts/
│   └── wallet.compact          # ZK smart contract (4 circuits)
├── contracts/managed/wallet/   # Generated by compact compile (gitignored)
│   ├── contract/index.js       # JS bindings
│   └── keys/                   # Prover/verifier keys
├── src/
│   ├── network.ts              # Network config + state helpers
│   ├── wallet.ts               # Wallet SDK integration
│   ├── wallet-state.ts         # Sync-state persistence
│   ├── setup.ts                # One-shot setup script
│   ├── deploy.ts               # Deploy script
│   └── cli.ts                  # Interactive CLI
├── tests/
│   └── wallet.test.ts          # 15 passing tests
├── frontend/
│   ├── src/
│   │   ├── hooks/
│   │   │   ├── useMidnight.ts       # DApp Connector hook
│   │   │   └── useWalletContract.ts # Contract interaction hook
│   │   └── components/
│   │       ├── WalletConnect.tsx    # Connect/disconnect UI
│   │       ├── WalletDashboard.tsx  # On-chain state display
│   │       └── WalletActions.tsx    # Circuit interaction panels
│   ├── .env.example            # Environment variable template
│   ├── vercel.json             # Vercel SPA config
│   └── netlify.toml            # Netlify SPA config
├── compose.yml                 # Local devnet (node + indexer + proof-server)
├── package.json
└── README.md
```
=======
# Simple-Crypto-Wallet-
>>>>>>> da05636a66ab1fc77702e8e3882c0de85c4370ca

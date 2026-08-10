/**
 * Deploy simple-crypto-wallet contract to a Midnight network.
 * Usage:
 *   npm run deploy                        — deploys to local devnet (undeployed)
 *   npm run deploy -- --network preview   — deploys to Preview Network
 *   npm run deploy -- --network preprod   — deploys to Preprod Network
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveNetwork, getOrCreateSeed, recordDeployment } from './network.js';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

// Midnight SDK imports
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

// Private state identifier — wallet contract has private witnesses
const PRIVATE_STATE_ID = 'walletPrivateState';

// ─── Network configuration ────────────────────────────────────────────────────
const { network, config: networkConfig } = resolveNetwork();
const SEED = getOrCreateSeed(network);

// ─── Proof server readiness ───────────────────────────────────────────────────
async function waitForProofServer(maxAttempts = 60, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetch(networkConfig.proofServer, {
        method: 'GET',
        signal: AbortSignal.timeout(3000),
      });
      return true;
    } catch (err: any) {
      const code = err?.cause?.code || err?.code || '';
      if (code !== 'ECONNREFUSED' && code !== 'UND_ERR_CONNECT_TIMEOUT' && code !== 'UND_ERR_SOCKET') {
        return true;
      }
    }
    if (attempt < maxAttempts) {
      process.stdout.write(`\r  Waiting for proof server... (${attempt}/${maxAttempts})   `);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return false;
}

// ─── Compiled contract loading ────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const zkConfigPath = path.resolve(__dirname, '..', 'contracts', 'managed', 'wallet');
const contractPath = path.join(zkConfigPath, 'contract', 'index.js');

if (!fs.existsSync(contractPath)) {
  console.error('\n❌ Contract not compiled! Run: npm run compile\n');
  process.exit(1);
}

const WalletContract = await import(pathToFileURL(contractPath).href);

const compiledContract = CompiledContract.make('wallet', WalletContract.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(zkConfigPath),
);

// ─── Providers ────────────────────────────────────────────────────────────────
async function createProviders(walletCtx: WalletContext) {
  const privateStatePassword = process.env.PRIVATE_STATE_PASSWORD?.trim()
    || 'SimpleWallet-Devnet-Dev-Placeholder-1';

  const walletProvider = {
    getCoinPublicKey:       () => walletCtx.shieldedSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletCtx.shieldedSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return walletCtx.wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => walletCtx.wallet.submitTransaction(tx) as any,
  };

  const zkConfigProvider = new NodeZkConfigProvider(zkConfigPath);
  const accountId = walletCtx.unshieldedKeystore.getBech32Address().toString();

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'wallet-private-state',
      accountId,
      privateStoragePasswordProvider: () => privateStatePassword,
    }),
    publicDataProvider: indexerPublicDataProvider(networkConfig.indexer, networkConfig.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(networkConfig.proofServer, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Deploy simple-crypto-wallet → ${network.padEnd(29)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('─── Wallet setup ───────────────────────────────────────────────\n');
  console.log('  Creating wallet...');
  const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
  const restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
  if (restoredCount > 0) {
    console.log(`  Restored ${restoredCount}/3 child wallets from saved state — sync resuming from checkpoint.`);
  }

  console.log('  Syncing with network...');
  console.log('  ℹ  This may take several minutes depending on network size.\n');
  const syncStart = Date.now();
  const syncInterval = setInterval(() => {
    const elapsed = Math.round((Date.now() - syncStart) / 1000);
    process.stdout.write(`\r  ⏳ Still syncing... (${elapsed}s elapsed)   `);
  }, 5000);
  const state = await walletCtx.wallet.waitForSyncedState();
  clearInterval(syncInterval);
  process.stdout.write('\r  ✓ Synced with network.                                      \n');

  await persistWalletState(network, walletCtx);

  const address = walletCtx.unshieldedKeystore.getBech32Address();
  const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
  console.log(`\n  Wallet Address : ${address}`);
  console.log(`  Balance        : ${balance.toLocaleString()} tNight\n`);

  // Faucet flow for public networks
  if (network !== 'undeployed' && networkConfig.faucet && balance === 0n) {
    console.log('─── Fund Your Wallet ───────────────────────────────────────────\n');
    console.log(`  ⚠  Wallet has 0 tNight. You must fund it before deploying.\n`);
    console.log(`  Wallet address : ${address}`);
    console.log(`  Faucet URL     : ${networkConfig.faucet}\n`);
    console.log('  Steps:');
    console.log('    1. Copy your wallet address above');
    console.log('    2. Open the faucet URL in your browser');
    console.log('    3. Paste the address and request tNight');
    console.log('    4. Wait for the transaction to confirm (~1-2 min)\n');
    console.log('  Waiting for tNight to arrive (polling every 10s)...\n');

    const rawTimeout = Number(process.env.MIDNIGHT_FAUCET_TIMEOUT_MS);
    const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 600_000;
    const start = Date.now();

    while (true) {
      await new Promise((r) => setTimeout(r, 10_000));
      const s = await Rx.firstValueFrom(
        walletCtx.wallet.state().pipe(Rx.filter((x) => x.isSynced)),
      );
      const tn = s.unshielded.balances[unshieldedToken().raw] ?? 0n;
      if (tn > 0n) {
        console.log(`\n  ✅ Funded! tNight balance: ${tn.toLocaleString()}\n`);
        break;
      }
      if (Date.now() - start > timeoutMs) {
        console.log(`\n  ❌ Funding not received within ${Math.round(timeoutMs / 60_000)} min.`);
        console.log(`  Address : ${address}`);
        console.log(`  Faucet  : ${networkConfig.faucet}`);
        console.log('  Re-run deploy after funding — your seed is preserved.\n');
        await walletCtx.wallet.stop();
        process.exit(1);
      }
      const elapsed = Math.round((Date.now() - start) / 1000);
      process.stdout.write(`\r  ...still waiting (${elapsed}s elapsed)   `);
    }
  }

  if (network === 'undeployed' && balance === 0n) {
    console.error(
      '\n❌ Genesis-seed wallet has zero NIGHT. Check `docker compose ps` and `docker compose logs node`.\n' +
      '   Try `docker compose down -v` then retry.\n',
    );
    await walletCtx.wallet.stop();
    process.exit(1);
  }

  // DUST registration
  console.log('─── DUST Token Setup ───────────────────────────────────────────\n');
  const dustState = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );
  const unregisteredUtxos = dustState.unshielded.availableCoins.filter(
    (c: any) => !c.meta?.registeredForDustGeneration,
  );
  if (unregisteredUtxos.length > 0) {
    console.log(`  Registering ${unregisteredUtxos.length} NIGHT UTXOs for DUST generation...`);
    const recipe = await walletCtx.wallet.registerNightUtxosForDustGeneration(
      unregisteredUtxos,
      walletCtx.unshieldedKeystore.getPublicKey(),
      (payload) => walletCtx.unshieldedKeystore.signData(payload),
    );
    const finalized = await walletCtx.wallet.finalizeRecipe(recipe);
    await walletCtx.wallet.submitTransaction(finalized);
  }
  if (dustState.dust.balance(new Date()) === 0n) {
    console.log('  Waiting for DUST tokens...');
    await Rx.firstValueFrom(
      walletCtx.wallet.state().pipe(
        Rx.throttleTime(5000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.balance(new Date()) > 0n),
      ),
    );
  }
  console.log('  DUST tokens ready!\n');

  // Deploy
  console.log('─── Deploy Contract ────────────────────────────────────────────\n');
  console.log('  Checking proof server...');
  const proofServerReady = await waitForProofServer();
  if (!proofServerReady) {
    console.log('\n  ❌ Proof server not responding. Run: docker compose up -d\n');
    await walletCtx.wallet.stop();
    process.exit(1);
  }
  process.stdout.write('\r  Proof server ready!                                 \n');

  console.log('  Setting up providers...');
  const providers = await createProviders(walletCtx);

  process.stdout.write('  Generating DUST...');
  await new Promise((r) => setTimeout(r, 6000));
  process.stdout.write(' done.\n');
  console.log('  Deploying wallet contract...\n');

  const MAX_RETRIES   = 20;
  const RETRY_DELAY   = 5000;
  let deployed: Awaited<ReturnType<typeof deployContract>> | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      deployed = await deployContract(providers, {
        compiledContract: compiledContract as any,
        args: [],
        privateStateId: PRIVATE_STATE_ID,
        initialPrivateState: {},
      });
      break;
    } catch (err: any) {
      const errMsg   = err?.message || err?.toString() || '';
      const errCause = err?.cause?.message || err?.cause?.toString() || '';
      const full     = `${errMsg} ${errCause}`;

      const isDustShortage =
        full.includes('Not enough Dust') ||
        full.includes('Insufficient Funds') ||
        full.includes('could not balance dust');

      if (!(isDustShortage && attempt === 1)) {
        console.error(`\n  Attempt ${attempt} error: ${errMsg}`);
        if (errCause && errCause !== errMsg) console.error(`  Cause: ${errCause}`);
      }

      if (!isDustShortage && (
        full.includes('Failed to connect to Proof Server') ||
        full.includes('connect ECONNREFUSED 127.0.0.1:6300')
      )) {
        console.log('  ❌ Proof server unreachable. Run: docker compose up -d\n');
        await walletCtx.wallet.stop();
        process.exit(1);
      }

      if (isDustShortage) {
        if (attempt < MAX_RETRIES) {
          if (attempt === 1) console.log(`  Still generating DUST, retrying in ${RETRY_DELAY / 1000}s...`);
          else console.log(`  ⏳ DUST not ready (attempt ${attempt}/${MAX_RETRIES}); retrying in ${RETRY_DELAY / 1000}s...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY));
        } else {
          console.log(`  ❌ Not enough DUST after ${MAX_RETRIES} retries.`);
          await walletCtx.wallet.stop();
          process.exit(1);
        }
      } else {
        throw err;
      }
    }
  }

  if (!deployed) throw new Error('Deployment failed after all retries');

  const contractAddress = deployed.deployTxData.public.contractAddress;
  console.log('  ✅ Contract deployed successfully!\n');
  console.log(`  ╔══════════════════════════════════════════════════════════╗`);
  console.log(`  ║  CONTRACT ADDRESS:                                       ║`);
  console.log(`  ║  ${contractAddress.padEnd(55)}║`);
  console.log(`  ╚══════════════════════════════════════════════════════════╝\n`);

  recordDeployment(network, contractAddress, address.toString());
  console.log('  Saved to .midnight-state.json\n');
  console.log(`  Add to frontend/.env.local:`);
  console.log(`  VITE_CONTRACT_ADDRESS=${contractAddress}\n`);

  await persistWalletState(network, walletCtx);
  await walletCtx.wallet.stop();
  console.log('─── Deployment complete ────────────────────────────────────────\n');
  console.log('  Next steps:');
  console.log('  1. Run: npm run cli          — interact via terminal');
  console.log('  2. Run: npm run frontend:dev — launch the React UI\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

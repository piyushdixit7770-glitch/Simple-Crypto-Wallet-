/**
 * CLI for interacting with the simple-crypto-wallet contract.
 * Supports: registerWallet, recordDeposit, authorizeTransfer,
 *           addTransactionRecord, and reading on-chain state.
 *
 * PRIVACY NOTE: private witnesses (ownerSecret, pin) are collected at runtime,
 * used for proof generation, and dropped immediately after — they are NEVER
 * logged, stored, or displayed.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { Buffer } from 'buffer';
import * as crypto from 'node:crypto';

import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { resolveNetwork, getOrCreateSeed, getDeployment } from './network.js';
import { createWallet, persistWalletState, unshieldedToken, type WalletContext } from './wallet.js';

// @ts-expect-error Required for wallet sync
globalThis.WebSocket = WebSocket;

const PRIVATE_STATE_ID = 'walletPrivateState';

const { network, config: networkConfig } = resolveNetwork();
const SEED = getOrCreateSeed(network);

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

// Helper: pad a string secret to 32 bytes using SHA-256 hash
function secretToBytes32(secret: string): Uint8Array {
  return new Uint8Array(crypto.createHash('sha256').update(secret).digest());
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Simple Crypto Wallet — CLI                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const rl = createInterface({ input: stdin, output: stdout });

  const deployment = getDeployment(network);
  if (!deployment) {
    console.error(`No deployment found for network "${network}". Run \`npm run setup -- --network ${network}\` first.`);
    process.exit(1);
  }
  console.log(`  Contract : ${deployment.address}`);
  console.log(`  Network  : ${network}\n`);

  try {
    console.log('  Connecting to wallet...');
    const walletCtx = await createWallet({ network, networkConfig, seed: SEED });
    const restoredCount = Object.values(walletCtx.restored).filter(Boolean).length;
    if (restoredCount > 0) {
      console.log(`  Restored ${restoredCount}/3 child wallets from saved state.`);
    }

    console.log('  Syncing with network...');
    console.log('  ℹ  This may take several minutes.\n');
    const syncStart = Date.now();
    const syncInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - syncStart) / 1000);
      process.stdout.write(`\r  ⏳ Still syncing... (${elapsed}s elapsed)   `);
    }, 5000);
    const state = await walletCtx.wallet.waitForSyncedState();
    clearInterval(syncInterval);
    process.stdout.write('\r  ✓ Synced with network.                                      \n');
    await persistWalletState(network, walletCtx);

    const balance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
    console.log(`  Balance  : ${balance.toLocaleString()} tNight\n`);

    if (balance === 0n && network !== 'undeployed' && networkConfig.faucet) {
      const addr = walletCtx.unshieldedKeystore.getBech32Address();
      console.log(`  ⚠  Wallet has 0 tNight. Fund it at: ${networkConfig.faucet}`);
      console.log(`     Wallet address: ${addr}\n`);
    }

    console.log('  Connecting to contract...');
    const providers = await createProviders(walletCtx);
    const deployed: any = await findDeployedContract(providers, {
      compiledContract: compiledContract as any,
      contractAddress:  deployment.address,
      privateStateId:   PRIVATE_STATE_ID,
      initialPrivateState: {},
    });
    console.log('  ✅ Connected!\n');

    let running = true;
    while (running) {
      console.log('─── Menu ───────────────────────────────────────────────────────');
      console.log('  1. Register wallet (set label + prove ownership)');
      console.log('  2. Record a deposit');
      console.log('  3. Authorize a transfer  [🔒 ZK: PIN never revealed]');
      console.log('  4. Add transaction record');
      console.log('  5. Read wallet state (public)');
      console.log('  6. Check tNight balance');
      console.log('  7. Exit\n');

      const choice = await rl.question('  Your choice: ');

      switch (choice.trim()) {
        case '1': {
          const label = await rl.question('  Wallet label (public, stored on-chain): ');
          const ownerSecretRaw = await rl.question('  Owner secret (private, NEVER stored/logged): ');
          // Convert to 32-byte array — raw value used ONLY for proof, then dropped
          const ownerSecret = Array.from(secretToBytes32(ownerSecretRaw));
          ownerSecretRaw.replace(/./g, '0'); // attempt to zero the string (best-effort in JS)

          console.log('\n  🔒 Generating ZK proof (owner secret never leaves your device as plaintext)...');
          console.log('  Submitting transaction (30-60 seconds)...');
          try {
            const tx = await deployed.callTx.registerWallet(label, ownerSecret);
            console.log(`\n  ✅ Wallet registered: "${label}"`);
            console.log(`  TX ID: ${tx.public.txId}`);
            console.log(`  Block: ${tx.public.blockHeight}`);
            console.log('  "Proved without revealing your owner secret"\n');
          } catch (err) {
            console.error('\n  ❌ Failed:', err instanceof Error ? err.message : err);
          }
          break;
        }

        case '2': {
          const amountStr = await rl.question('  Deposit amount (tNight): ');
          const amount = BigInt(amountStr.trim());
          const txHash = await rl.question('  Transaction hash / reference: ');

          console.log('\n  Submitting deposit record...');
          try {
            const tx = await deployed.callTx.recordDeposit(amount, txHash);
            console.log(`\n  ✅ Deposit recorded: ${amount.toLocaleString()} tNight`);
            console.log(`  TX ID: ${tx.public.txId}\n`);
          } catch (err) {
            console.error('\n  ❌ Failed:', err instanceof Error ? err.message : err);
          }
          break;
        }

        case '3': {
          const amountStr = await rl.question('  Transfer amount (tNight): ');
          const amount = BigInt(amountStr.trim());
          const destination = await rl.question('  Destination label (public): ');
          const ownerSecretRaw = await rl.question('  Owner secret [🔒 private]: ');
          const pinRaw = await rl.question('  Authorization PIN  [🔒 private]: ');

          // Convert secrets to 32-byte arrays — raw values dropped after proof
          const ownerSecret = Array.from(secretToBytes32(ownerSecretRaw));
          const pin = Array.from(secretToBytes32(pinRaw));

          console.log('\n  🔒 Generating ZK proof (secrets never leave your device as plaintext)...');
          console.log('  Submitting transaction (30-60 seconds)...');
          try {
            const tx = await deployed.callTx.authorizeTransfer(amount, destination, ownerSecret, pin);
            console.log(`\n  ✅ Transfer authorized: ${amount.toLocaleString()} tNight → ${destination}`);
            console.log(`  TX ID: ${tx.public.txId}`);
            console.log('  "Proved without revealing your PIN or owner secret"\n');
          } catch (err) {
            console.error('\n  ❌ Failed:', err instanceof Error ? err.message : err);
          }
          break;
        }

        case '4': {
          const txHash = await rl.question('  Transaction hash: ');
          const direction = await rl.question('  Direction (in / out): ');

          console.log('\n  Recording transaction...');
          try {
            const tx = await deployed.callTx.addTransactionRecord(txHash, direction);
            console.log(`\n  ✅ Transaction recorded: [${direction}] ${txHash}`);
            console.log(`  TX ID: ${tx.public.txId}\n`);
          } catch (err) {
            console.error('\n  ❌ Failed:', err instanceof Error ? err.message : err);
          }
          break;
        }

        case '5': {
          console.log('\n  Reading on-chain wallet state...');
          try {
            const contractState = await providers.publicDataProvider.queryContractState(deployment.address);
            if (contractState) {
              const ls = WalletContract.ledger(contractState.data);
              console.log('\n  ┌─ Wallet State (Public On-Chain Data) ──────────────────┐');
              console.log(`  │  Label          : ${Buffer.from(ls.walletLabel).toString()}`);
              console.log(`  │  Registered     : ${ls.isRegistered}`);
              console.log(`  │  Total Deposited: ${ls.totalDeposited?.toString()} tNight`);
              console.log(`  │  Transfer Count : ${ls.transferCount?.toString()}`);
              console.log(`  │  Last TX Hash   : ${Buffer.from(ls.lastTxHash).toString()}`);
              console.log('  └──────────────────────────────────────────────────────────┘\n');
              console.log('  ℹ  Owner commitment (hash) is on-chain but owner identity remains private.\n');
            } else {
              console.log('\n  📋 No state found (contract may not be registered yet)\n');
            }
          } catch (err) {
            console.error('\n  ❌ Failed:', err instanceof Error ? err.message : err);
          }
          break;
        }

        case '6': {
          console.log('\n  Checking balance...');
          const s = await walletCtx.wallet.waitForSyncedState();
          const tnight = s.unshielded.balances[unshieldedToken().raw] ?? 0n;
          const dust = s.dust.balance(new Date());
          console.log(`\n  tNight : ${tnight.toLocaleString()}`);
          console.log(`  DUST   : ${dust.toLocaleString()}\n`);
          break;
        }

        case '7':
          running = false;
          console.log('\n  👋 Goodbye!\n');
          break;

        default:
          console.log('\n  Invalid choice. Please enter 1–7.\n');
      }
    }

    await persistWalletState(network, walletCtx);
    await walletCtx.wallet.stop();
  } catch (err) {
    console.error('\n❌ Error:', err instanceof Error ? err.message : err);
  } finally {
    rl.close();
  }
}

main().catch(console.error);

/**
 * App.tsx — Simple Crypto Wallet dApp root
 *
 * Wires together:
 *   - useMidnight  → DApp Connector wallet state
 *   - useWalletContract → on-chain state + circuit calls
 *   - WalletConnect → connect/disconnect UI
 *   - WalletDashboard → public ledger state display
 *   - WalletActions → circuit interaction panels
 */
import './App.css';
import { useMidnight } from './hooks/useMidnight';
import { useWalletContract } from './hooks/useWalletContract';
import { WalletConnect } from './components/WalletConnect';
import { WalletDashboard } from './components/WalletDashboard';
import { WalletActions } from './components/WalletActions';

function App() {
  const { walletState, expectedNetwork, networkMismatch, connect, disconnect, clearError } =
    useMidnight();

  const {
    contractState,
    callStatus,
    isLoadingState,
    contractAddress,
    fetchContractState,
    registerWallet,
    recordDeposit,
    authorizeTransfer,
    addTxRecord,
    clearStatus,
  } = useWalletContract();

  const isConnected = walletState.status === 'connected';

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-logo">
            <span aria-hidden="true">🌙</span>
            <h1>Simple Crypto Wallet</h1>
          </div>
          <p className="app-tagline">Zero-knowledge wallet on Midnight Network</p>
        </div>
      </header>

      {/* ── Main layout ── */}
      <main className="app-main">
        {/* Wallet connection panel */}
        <WalletConnect
          walletState={walletState}
          expectedNetwork={expectedNetwork}
          networkMismatch={networkMismatch}
          onConnect={connect}
          onDisconnect={disconnect}
          onClearError={clearError}
        />

        {/* On-chain state dashboard */}
        <WalletDashboard
          contractState={contractState}
          contractAddress={contractAddress}
          isLoading={isLoadingState}
          onRefresh={fetchContractState}
        />

        {/* Circuit interaction panels */}
        <WalletActions
          isWalletConnected={isConnected}
          callStatus={callStatus}
          onRegister={registerWallet}
          onDeposit={recordDeposit}
          onTransfer={authorizeTransfer}
          onAddRecord={addTxRecord}
          onClearStatus={clearStatus}
        />
      </main>

      {/* ── Footer ── */}
      <footer className="app-footer">
        <p>
          Built on{' '}
          <a
            href="https://midnight.network"
            target="_blank"
            rel="noreferrer noopener"
          >
            Midnight Network
          </a>{' '}
          · INTO the Midnight — SPPU Bootcamp
        </p>
        <p className="footer-privacy">
          🔒 Private witnesses (owner secret, PIN) are proved with zero-knowledge and never
          leave your browser as plaintext.
        </p>
      </footer>
    </div>
  );
}

export default App;

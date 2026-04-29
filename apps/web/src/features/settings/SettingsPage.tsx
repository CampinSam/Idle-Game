import { useState, useCallback, useEffect } from 'react';
import { useAppSelector } from '../../store';
import { audioEngine, AudioBusName } from '../../services/AudioEngine';
import { useWalletConnect } from '../../hooks/useWalletConnect';
import { api } from '../../services/api';
import '../profile/Profile.css';
import './SettingsPage.css';

type Tab = 'audio' | 'wallet';

interface LinkedWallet {
  id: string;
  chain: string;
  address: string;
  isPrimary: boolean;
}

const BUS_LABELS: Record<AudioBusName, string> = {
  music: 'Music',
  sfx: 'SFX',
  ui: 'UI',
  ambient: 'Ambient',
};

const BUS_ICONS: Record<AudioBusName, string> = {
  music: '🎵',
  sfx: '💥',
  ui: '🔔',
  ambient: '🌿',
};

const BUSES: AudioBusName[] = ['music', 'sfx', 'ui', 'ambient'];

const CHAIN_LABELS: Record<string, string> = {
  ETH: 'Ethereum',
  BASE: 'Base',
  MATIC: 'Polygon',
  CARDANO: 'Cardano',
};

const CHAIN_COLORS: Record<string, string> = {
  ETH: '#627EEA',
  BASE: '#0052FF',
  MATIC: '#8247E5',
  CARDANO: '#0033AD',
};

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('audio');
  const token = useAppSelector((s) => s.auth.token);

  const [volumes, setVolumes] = useState<Record<AudioBusName, number>>(() => ({
    music: audioEngine.getVolume('music'),
    sfx: audioEngine.getVolume('sfx'),
    ui: audioEngine.getVolume('ui'),
    ambient: audioEngine.getVolume('ambient'),
  }));

  const handleVolumeChange = useCallback((bus: AudioBusName, value: number) => {
    audioEngine.setVolume(bus, value);
    setVolumes(prev => ({ ...prev, [bus]: value }));
  }, []);

  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [walletOpError, setWalletOpError] = useState<string | null>(null);
  const [manualChain, setManualChain] = useState<string>('ETH');
  const [manualAddress, setManualAddress] = useState<string>('');
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState<{
    claimed: number;
    alreadyClaimed: number;
    notImported: number;
    unclaimed: number;
    reconciliationSkippedCollections: string[];
  } | null>(null);

  const {
    connecting,
    error: connectError,
    detectedCardanoWallets,
    hasEvm,
    linkEvm,
    linkCardano,
    clearError: clearConnectError,
  } = useWalletConnect();

  const loadWallets = useCallback(async () => {
    setWalletsLoading(true);
    try {
      const list = await api.getLinkedWallets();
      setWallets(list as LinkedWallet[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load wallets';
      setWalletOpError(message);
    } finally {
      setWalletsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'wallet') loadWallets();
  }, [tab, loadWallets]);

  const handleRemove = async (id: string) => {
    setWalletOpError(null);
    try {
      await api.removeLinkedWallet(id);
      await loadWallets();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove wallet';
      setWalletOpError(message);
    }
  };

  const handleSetPrimary = async (id: string) => {
    setWalletOpError(null);
    try {
      await api.setWalletPrimary(id);
      await loadWallets();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update wallet';
      setWalletOpError(message);
    }
  };

  const handleLinkEvm = async () => {
    clearConnectError();
    setWalletOpError(null);
    if (!token) return;
    const ok = await linkEvm(token);
    if (ok) await loadWallets();
  };

  const handleLinkCardano = async (walletKey: string) => {
    clearConnectError();
    setWalletOpError(null);
    if (!token) return;
    const ok = await linkCardano(walletKey, token);
    if (ok) await loadWallets();
  };

  const handleResync = async () => {
    setWalletOpError(null);
    setResyncResult(null);
    setResyncing(true);
    try {
      const result = await api.syncNftCollections();
      setResyncResult({
        claimed: result.claimed,
        alreadyClaimed: result.alreadyClaimed,
        notImported: result.notImported,
        unclaimed: result.unclaimed,
        reconciliationSkippedCollections: result.reconciliationSkippedCollections ?? [],
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resync NFTs';
      setWalletOpError(message);
    } finally {
      setResyncing(false);
    }
  };

  const handleAddManualWallet = async () => {
    clearConnectError();
    setWalletOpError(null);
    const trimmed = manualAddress.trim();
    if (!trimmed) {
      setWalletOpError('Address is required');
      return;
    }
    setManualSubmitting(true);
    try {
      await api.addManualWallet(manualChain, trimmed);
      setManualAddress('');
      await loadWallets();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add wallet';
      setWalletOpError(message);
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <div className="settings-page page-transition-wrapper">
      <div className="settings-wrapper-card">

        <div className="settings-header">
          <h1 className="settings-title">Settings</h1>
        </div>

        <div className="settings-tab-strip">
          <button
            className={`settings-tab ${tab === 'audio' ? 'active' : ''}`}
            onClick={() => setTab('audio')}
          >
            🎵 Audio
          </button>
          <button
            className={`settings-tab ${tab === 'wallet' ? 'active' : ''}`}
            onClick={() => setTab('wallet')}
          >
            🔗 Wallet
          </button>
        </div>

        <div className="settings-tab-content">

          {tab === 'audio' && (
            <div className="settings-section">
              <div className="settings-section-label">Volume Controls</div>
              <div className="settings-volume-sliders">
                {BUSES.map(bus => (
                  <div key={bus} className="settings-volume-row">
                    <span className="settings-volume-icon">{BUS_ICONS[bus]}</span>
                    <label className="settings-volume-label">{BUS_LABELS[bus]}</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volumes[bus]}
                      onChange={e => handleVolumeChange(bus, Number(e.target.value))}
                      className="settings-volume-slider"
                    />
                    <span className="settings-volume-value">{volumes[bus]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'wallet' && (
            <div className="settings-section">
              {(walletOpError || connectError) && (
                <div className="settings-error">{walletOpError || connectError}</div>
              )}
              {walletsLoading ? (
                <div className="settings-loading">Loading wallets...</div>
              ) : (
                <>
                  {wallets.length > 0 && (
                    <div className="wallet-resync-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, opacity: 0.8 }}>
                        Reconcile NFTs across all linked wallets — claims new NFTs and removes ones you no longer hold.
                      </div>
                      <button
                        className="wallet-action-btn wallet-action-primary"
                        onClick={handleResync}
                        disabled={resyncing}
                      >
                        {resyncing ? 'Resyncing...' : '🔄 Resync NFTs'}
                      </button>
                    </div>
                  )}
                  {resyncResult && (
                    <div className="wallet-resync-result" style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(0,180,80,0.08)', border: '1px solid rgba(0,180,80,0.25)', borderRadius: 6, fontSize: 13 }}>
                      <strong>Sync complete.</strong>{' '}
                      Claimed {resyncResult.claimed}, unclaimed {resyncResult.unclaimed}
                      {resyncResult.alreadyClaimed > 0 && `, already owned ${resyncResult.alreadyClaimed}`}
                      {resyncResult.notImported > 0 && `, ${resyncResult.notImported} not imported yet`}.
                      {resyncResult.reconciliationSkippedCollections.length > 0 && (
                        <div style={{ marginTop: 4, color: '#c97a00' }}>
                          Note: {resyncResult.reconciliationSkippedCollections.length} collection
                          {resyncResult.reconciliationSkippedCollections.length === 1 ? ' was' : 's were'} skipped from removal due to a chain query failure. Try again in a moment.
                        </div>
                      )}
                    </div>
                  )}
                  {wallets.length === 0 ? (
                    <div className="settings-empty">No wallets linked to this account.</div>
                  ) : (
                    <div className="wallet-list">
                      {wallets.map((w) => (
                        <div key={w.id} className="wallet-item">
                          <div className="wallet-item-left">
                            <span className="wallet-chain-badge" style={{ background: CHAIN_COLORS[w.chain] ?? '#555' }}>
                              {CHAIN_LABELS[w.chain] ?? w.chain}
                            </span>
                            <span className="wallet-address" title={w.address}>
                              {truncateAddress(w.address)}
                            </span>
                            {w.isPrimary && <span className="wallet-primary-badge">Primary</span>}
                          </div>
                          <div className="wallet-item-actions">
                            {!w.isPrimary && (
                              <button className="wallet-action-btn wallet-action-primary" onClick={() => handleSetPrimary(w.id)}>
                                Set Primary
                              </button>
                            )}
                            <button className="wallet-action-btn wallet-action-remove" onClick={() => handleRemove(w.id)}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(hasEvm || detectedCardanoWallets.length > 0) && (
                    <div className="wallet-add-section">
                      <h3 className="wallet-add-title">Add a wallet</h3>
                      <div className="wallet-btn-group">
                        {hasEvm && (
                          <button className="wallet-btn wallet-btn-evm" onClick={handleLinkEvm} disabled={connecting}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="4" width="22" height="16" rx="2"/>
                              <line x1="1" y1="10" x2="23" y2="10"/>
                            </svg>
                            {connecting ? 'Connecting...' : 'Add EVM Wallet'}
                          </button>
                        )}
                        {detectedCardanoWallets.map((cw) => (
                          <button key={cw.key} className="wallet-btn wallet-btn-cardano" onClick={() => handleLinkCardano(cw.key)} disabled={connecting}>
                            {cw.icon ? (
                              <img src={cw.icon} alt={cw.name} width="16" height="16" style={{ borderRadius: 3 }} />
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                              </svg>
                            )}
                            {connecting ? 'Connecting...' : `Add ${cw.name}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="wallet-add-section wallet-manual-section">
                    <h3 className="wallet-add-title">Add wallet (no verification — dev only)</h3>
                    <div className="wallet-manual-row">
                      <select
                        className="wallet-manual-chain"
                        value={manualChain}
                        onChange={(e) => setManualChain(e.target.value)}
                        disabled={manualSubmitting}
                      >
                        <option value="ETH">Ethereum</option>
                        <option value="BASE">Base</option>
                        <option value="MATIC">Polygon</option>
                        <option value="CARDANO">Cardano</option>
                      </select>
                      <input
                        className="wallet-manual-address"
                        type="text"
                        placeholder="Wallet address"
                        value={manualAddress}
                        onChange={(e) => setManualAddress(e.target.value)}
                        disabled={manualSubmitting}
                      />
                    </div>
                    <button
                      className="wallet-btn wallet-btn-evm"
                      onClick={handleAddManualWallet}
                      disabled={manualSubmitting}
                      style={{ marginTop: 8 }}
                    >
                      {manualSubmitting ? 'Adding...' : 'Add Wallet'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

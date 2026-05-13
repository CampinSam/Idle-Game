import { useState, useCallback, useEffect } from 'react';
import { useAppSelector } from '../../store';
import { audioEngine, AudioBusName } from '../../services/AudioEngine';
import { useWalletConnect } from '../../hooks/useWalletConnect';
import { api } from '../../services/api';

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

const WRAPPER_CARD =
  'flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto ' +
  '[-webkit-overflow-scrolling:touch] overscroll-contain';

const TAB_BASE =
  "flex-1 py-[11px] px-1.5 text-[11px] font-bold tracking-[0.6px] uppercase " +
  "bg-transparent border-0 border-b-2 cursor-pointer " +
  "transition-[color,border-color] duration-150 font-['Exo_2',system-ui,sans-serif]";

const SECTION_LABEL =
  'text-[11px] font-bold tracking-[0.6px] uppercase text-text-secondary mb-3.5 block';

const ACTION_BTN_BASE =
  "text-xs font-medium px-2.5 py-[5px] rounded-[7px] border cursor-pointer " +
  "transition-[opacity,background] duration-150 whitespace-nowrap font-['Exo_2',system-ui,sans-serif] " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const ACTION_BTN_PRIMARY =
  ACTION_BTN_BASE +
  ' bg-[rgba(139,92,246,0.12)] border-[rgba(139,92,246,0.35)] text-[#c4b5fd]' +
  ' hover:not(:disabled):bg-[rgba(139,92,246,0.22)]';

const ACTION_BTN_REMOVE =
  ACTION_BTN_BASE +
  ' bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.28)] text-[#f87171]' +
  ' hover:not(:disabled):bg-[rgba(239,68,68,0.18)]';

const WALLET_BTN_BASE =
  "flex items-center gap-2.5 w-full px-4 py-3 rounded-[11px] border text-sm font-medium " +
  "cursor-pointer transition-[transform,box-shadow,opacity] duration-150 text-left " +
  "font-['Exo_2',system-ui,sans-serif] disabled:opacity-60 disabled:cursor-not-allowed " +
  "enabled:hover:-translate-y-px";

const WALLET_BTN_EVM =
  WALLET_BTN_BASE +
  ' bg-[rgba(99,102,241,0.08)] border-[rgba(99,102,241,0.28)] text-[#a5b4fc]' +
  ' enabled:hover:shadow-[0_4px_12px_rgba(99,102,241,0.18)]';

const WALLET_BTN_CARDANO =
  WALLET_BTN_BASE +
  ' bg-[rgba(0,51,173,0.1)] border-[rgba(0,102,255,0.28)] text-[#93c5fd]' +
  ' enabled:hover:shadow-[0_4px_12px_rgba(0,100,255,0.14)]';

const INPUT_CLASS =
  "bg-black/25 border border-[rgba(139,92,246,0.25)] rounded-[10px] px-3 py-2.5 " +
  "text-[#e2d9ff] text-[13px] font-['Exo_2',system-ui,sans-serif] outline-none " +
  "focus:border-[rgba(139,92,246,0.5)]";

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
    <div className="flex flex-col flex-1 min-h-0">
      <div className={WRAPPER_CARD}>

        <div className="px-5 pt-5 pb-[18px] bg-gradient-to-b from-[rgba(139,92,246,0.1)] to-transparent border-b border-[rgba(139,92,246,0.15)]">
          <h1 className="font-['Cinzel',serif] text-xl font-bold text-[#e2d9ff] tracking-[0.05em] m-0">
            Settings
          </h1>
        </div>

        <div className="flex bg-black/25 border-b border-[rgba(139,92,246,0.12)]">
          <button
            className={`${TAB_BASE} ${tab === 'audio' ? 'text-[#c4b5fd] border-b-[var(--derp-purple)]' : 'text-text-secondary hover:text-[#c4b5fd] border-b-transparent'}`}
            onClick={() => setTab('audio')}
          >
            🎵 Audio
          </button>
          <button
            className={`${TAB_BASE} ${tab === 'wallet' ? 'text-[#c4b5fd] border-b-[var(--derp-purple)]' : 'text-text-secondary hover:text-[#c4b5fd] border-b-transparent'}`}
            onClick={() => setTab('wallet')}
          >
            🔗 Wallet
          </button>
        </div>

        <div className="px-5 pb-5 pt-1">

          {tab === 'audio' && (
            <div className="pt-4">
              <span className={SECTION_LABEL}>Volume Controls</span>
              <div className="flex flex-col gap-4">
                {BUSES.map(bus => (
                  <div key={bus} className="grid grid-cols-[1.5rem_5rem_1fr_2.5rem] items-center gap-2">
                    <span className="text-base text-center">{BUS_ICONS[bus]}</span>
                    <label className="text-[0.85rem] text-[#b8b8ff] font-semibold">{BUS_LABELS[bus]}</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={volumes[bus]}
                      onChange={e => handleVolumeChange(bus, Number(e.target.value))}
                      className="settings-volume-slider"
                    />
                    <span className="text-xs text-[#888] text-right min-w-[2rem]">{volumes[bus]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'wallet' && (
            <div className="pt-4">
              {(walletOpError || connectError) && (
                <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[#f87171] px-3.5 py-2.5 rounded-[10px] mb-3.5 text-[13px]">
                  {walletOpError || connectError}
                </div>
              )}
              {walletsLoading ? (
                <div className="text-center text-text-secondary py-8 text-sm">Loading wallets...</div>
              ) : (
                <>
                  {wallets.length > 0 && (
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <div className="text-[13px] opacity-80">
                        Reconcile NFTs across all linked wallets — claims new NFTs and removes ones you no longer hold.
                      </div>
                      <button
                        className={ACTION_BTN_PRIMARY}
                        onClick={handleResync}
                        disabled={resyncing}
                      >
                        {resyncing ? 'Resyncing...' : '🔄 Resync NFTs'}
                      </button>
                    </div>
                  )}
                  {resyncResult && (
                    <div className="mb-3 px-3 py-2 bg-[rgba(0,180,80,0.08)] border border-[rgba(0,180,80,0.25)] rounded-[6px] text-[13px]">
                      <strong>Sync complete.</strong>{' '}
                      Claimed {resyncResult.claimed}, unclaimed {resyncResult.unclaimed}
                      {resyncResult.alreadyClaimed > 0 && `, already owned ${resyncResult.alreadyClaimed}`}
                      {resyncResult.notImported > 0 && `, ${resyncResult.notImported} not imported yet`}.
                      {resyncResult.reconciliationSkippedCollections.length > 0 && (
                        <div className="mt-1 text-[#c97a00]">
                          Note: {resyncResult.reconciliationSkippedCollections.length} collection
                          {resyncResult.reconciliationSkippedCollections.length === 1 ? ' was' : 's were'} skipped from removal due to a chain query failure. Try again in a moment.
                        </div>
                      )}
                    </div>
                  )}
                  {wallets.length === 0 ? (
                    <div className="text-center text-text-secondary py-7 px-4 text-sm">
                      No wallets linked to this account.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 mb-5">
                      {wallets.map((w) => (
                        <div key={w.id} className="flex items-center justify-between gap-3 bg-black/20 border border-[rgba(139,92,246,0.14)] rounded-[11px] px-3.5 py-[11px]">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span
                              className="text-[10px] font-bold text-white px-[7px] py-[3px] rounded-[5px] whitespace-nowrap flex-shrink-0 tracking-[0.3px]"
                              style={{ background: CHAIN_COLORS[w.chain] ?? '#555' }}
                            >
                              {CHAIN_LABELS[w.chain] ?? w.chain}
                            </span>
                            <span
                              className="text-[13px] text-text-primary font-['Fira_Code',monospace] overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
                              title={w.address}
                            >
                              {truncateAddress(w.address)}
                            </span>
                            {w.isPrimary && (
                              <span className="text-[10px] font-semibold text-[#a78bfa] bg-[rgba(139,92,246,0.14)] border border-[rgba(139,92,246,0.3)] px-[7px] py-[2px] rounded-[5px] whitespace-nowrap flex-shrink-0">
                                Primary
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {!w.isPrimary && (
                              <button className={ACTION_BTN_PRIMARY} onClick={() => handleSetPrimary(w.id)}>
                                Set Primary
                              </button>
                            )}
                            <button className={ACTION_BTN_REMOVE} onClick={() => handleRemove(w.id)}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(hasEvm || detectedCardanoWallets.length > 0) && (
                    <div className="pt-1.5">
                      <h3 className="text-[11px] font-bold text-text-secondary m-0 mb-2.5 uppercase tracking-[0.6px]">
                        Add a wallet
                      </h3>
                      <div className="flex flex-col gap-2">
                        {hasEvm && (
                          <button className={WALLET_BTN_EVM} onClick={handleLinkEvm} disabled={connecting}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="1" y="4" width="22" height="16" rx="2"/>
                              <line x1="1" y1="10" x2="23" y2="10"/>
                            </svg>
                            {connecting ? 'Connecting...' : 'Add EVM Wallet'}
                          </button>
                        )}
                        {detectedCardanoWallets.map((cw) => (
                          <button key={cw.key} className={WALLET_BTN_CARDANO} onClick={() => handleLinkCardano(cw.key)} disabled={connecting}>
                            {cw.icon ? (
                              <img src={cw.icon} alt={cw.name} width="16" height="16" className="rounded-[3px]" />
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
                  <div className="pt-1.5 mt-3.5 border-t border-dashed border-[rgba(139,92,246,0.18)]">
                    <h3 className="text-[11px] font-bold text-text-secondary m-0 mb-2.5 uppercase tracking-[0.6px]">
                      Add wallet (no verification — dev only)
                    </h3>
                    <div className="flex gap-2">
                      <select
                        className={`${INPUT_CLASS} flex-[0_0_120px] cursor-pointer`}
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
                        className={`${INPUT_CLASS} flex-1 min-w-0`}
                        type="text"
                        placeholder="Wallet address"
                        value={manualAddress}
                        onChange={(e) => setManualAddress(e.target.value)}
                        disabled={manualSubmitting}
                      />
                    </div>
                    <button
                      className={`${WALLET_BTN_EVM} mt-2`}
                      onClick={handleAddManualWallet}
                      disabled={manualSubmitting}
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

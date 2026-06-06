import { useState, useEffect, useCallback } from 'react';
import { useAppSelector } from '../../store';
import { api } from '../../services/api';
import { useSyncCurrencyBalances } from '../../hooks/useSyncSelectors';

interface LinkedWallet {
  id: string;
  chain: string;
  address: string;
  isPrimary: boolean;
}

interface CntCurrency {
  id: string;
  label: string;
  policyId: string;
  assetName: string;
}

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

const INPUT_CLASS =
  "bg-black/25 border border-[rgba(139,92,246,0.25)] rounded-[10px] px-3 py-2.5 " +
  "text-[#e2d9ff] text-[13px] font-['Exo_2',system-ui,sans-serif] outline-none " +
  "focus:border-[rgba(139,92,246,0.5)]";

const INNER_TAB_BASE =
  "flex-1 py-2 px-1 text-[11px] font-bold tracking-[0.5px] uppercase " +
  "bg-transparent border-0 border-b-2 cursor-pointer " +
  "transition-[color,border-color] duration-150 font-['Exo_2',system-ui,sans-serif]";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: 'bg-[rgba(251,191,36,0.15)] text-[#fbbf24]',
    APPROVED: 'bg-[rgba(59,130,246,0.15)] text-[#60a5fa]',
    REJECTED: 'bg-[rgba(239,68,68,0.15)] text-[#f87171]',
    SENT: 'bg-[rgba(76,175,80,0.15)] text-[#4caf50]',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${map[status] ?? 'bg-white/10 text-[#aaa]'}`}>
      {status}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={ACTION_BTN_PRIMARY}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

type DepositStep = 'idle' | 'fetching-utxos' | 'building' | 'signing' | 'submitting' | 'done' | 'error';

function DepositTab({ depositInfo, linkedWallets }: { depositInfo: any; linkedWallets: LinkedWallet[] }) {
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<DepositStep>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState('');
  const [selectedCurrencyId, setSelectedCurrencyId] = useState<string>('');

  const cntCurrencies: CntCurrency[] = depositInfo?.cntCurrencies ?? [];
  const effectiveId = selectedCurrencyId || cntCurrencies[0]?.id || '';
  const selectedCurrency = cntCurrencies.find((c) => c.id === effectiveId) ?? cntCurrencies[0];

  const cardanoLinked = linkedWallets.filter((w) => w.chain === 'CARDANO');
  const hasLinkedWallet = cardanoLinked.length > 0;

  const [injectedWalletKey, setInjectedWalletKey] = useState<string | null>(null);
  useEffect(() => {
    const KNOWN = ['nami', 'eternl', 'vespr', 'begin', 'flint', 'nufi', 'lace', 'yoroi'];
    const w = (window as any).cardano ?? {};
    const found = KNOWN.find((k) => w[k]?.enable);
    setInjectedWalletKey(found ?? null);
  }, []);

  const canUseGuidedDeposit = hasLinkedWallet && !!injectedWalletKey && !!depositInfo?.hotWalletAddress;

  const handleGuidedDeposit = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) { setErrorMsg('Enter a valid amount'); return; }
    setErrorMsg('');
    setTxHash('');

    try {
      setStep('fetching-utxos');
      const walletApi = await (window as any).cardano[injectedWalletKey!].enable();
      const rawUtxos: string[] = await walletApi.getUtxos();
      if (!rawUtxos?.length) throw new Error('No UTXOs found in your wallet');

      setStep('building');
      const buildBody: Parameters<typeof api.buildDepositTx>[0] = { amount: amt, utxosCborHex: rawUtxos };
      if (selectedCurrency && selectedCurrency.id !== cntCurrencies[0]?.id) {
        buildBody.policyId = selectedCurrency.policyId;
        buildBody.assetName = selectedCurrency.assetName;
      }
      const { unsignedTxCborHex } = await api.buildDepositTx(buildBody);

      setStep('signing');
      const signedTxCborHex: string = await walletApi.signTx(unsignedTxCborHex, true);

      setStep('submitting');
      const { txHash: hash } = await api.submitDepositTx(signedTxCborHex);
      setTxHash(hash);
      setStep('done');
      setAmount('');
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Something went wrong');
      setStep('error');
    }
  };

  if (!depositInfo?.hotWalletAddress) {
    return (
      <div className="text-center py-8 text-text-secondary text-sm">
        Deposit address not configured yet. Please check back later.
      </div>
    );
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(depositInfo.hotWalletAddress)}&bgcolor=1a1640&color=c4b5fd&margin=8`;

  const stepLabel: Record<DepositStep, string> = {
    idle: 'Deposit',
    'fetching-utxos': 'Reading wallet…',
    building: 'Building transaction…',
    signing: 'Waiting for signature…',
    submitting: 'Submitting…',
    done: '✓ Submitted',
    error: 'Deposit',
  };
  const isBusy = ['fetching-utxos', 'building', 'signing', 'submitting'].includes(step);

  return (
    <div className="flex flex-col gap-4">
      {canUseGuidedDeposit && (
        <div className="bg-gradient-to-br from-[rgba(99,102,241,0.14)] to-[rgba(139,92,246,0.09)] border border-[rgba(167,139,250,0.3)] rounded-[11px] p-4">
          <div className="text-[11px] text-[#a78bfa] uppercase tracking-[0.08em] font-bold mb-3">
            Quick Deposit — Sign with Wallet
          </div>

          {cntCurrencies.length > 1 && (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {cntCurrencies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCurrencyId(c.id)}
                  disabled={isBusy}
                  className={`px-2.5 py-1 rounded-[6px] text-[12px] font-semibold border transition-colors ${
                    effectiveId === c.id
                      ? 'border-[rgba(167,139,250,0.6)] bg-[rgba(167,139,250,0.18)] text-[#c4b5fd]'
                      : 'border-white/15 bg-transparent text-[#888]'
                  } disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2 mb-3">
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => { setAmount(e.target.value); if (step === 'error') setStep('idle'); }}
              placeholder={`Amount (${selectedCurrency?.label ?? 'tokens'})`}
              disabled={isBusy}
              className={INPUT_CLASS + ' flex-1'}
            />
            <button
              onClick={handleGuidedDeposit}
              disabled={isBusy || !amount || step === 'done'}
              className={`px-4 py-2 rounded-[9px] border-0 font-bold text-sm cursor-pointer whitespace-nowrap text-white transition-colors ${
                step === 'done'
                  ? 'bg-[rgba(76,175,80,0.35)]'
                  : isBusy
                    ? 'bg-[rgba(99,102,241,0.35)] cursor-not-allowed'
                    : 'bg-[rgba(99,102,241,0.75)] hover:bg-[rgba(99,102,241,0.9)]'
              } disabled:opacity-60`}
            >
              {stepLabel[step]}
            </button>
          </div>

          {isBusy && (
            <div className="flex items-center gap-2 text-[12px] text-[#a78bfa]">
              <span className="inline-block w-2 h-2 rounded-full bg-[#a78bfa] animate-pulse" />
              {stepLabel[step]}
            </div>
          )}

          {step === 'done' && txHash && (
            <div className="mt-2 px-3 py-2.5 rounded-[8px] bg-[rgba(76,175,80,0.12)] border border-[rgba(76,175,80,0.3)] text-[13px] text-[#4caf50]">
              Transaction submitted!{' '}
              <a
                href={`https://cardanoscan.io/transaction/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#60a5fa] no-underline hover:underline"
              >
                View on Cardanoscan ↗
              </a>
              <br />
              <span className="text-[#888] text-[11px]">Balance updates in ~20 seconds.</span>
            </div>
          )}

          {step === 'error' && errorMsg && (
            <div className="mt-2 px-3 py-2.5 rounded-[8px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[13px] text-[#f87171]">
              {errorMsg}
            </div>
          )}
        </div>
      )}

      <div className={`border border-[rgba(167,139,250,0.15)] rounded-[11px] p-4 ${canUseGuidedDeposit ? 'bg-white/[0.02]' : 'bg-gradient-to-br from-[rgba(99,102,241,0.12)] to-[rgba(139,92,246,0.08)]'}`}>
        <div className="text-[11px] text-[#888] uppercase tracking-[0.08em] mb-2">
          {canUseGuidedDeposit ? 'Or send manually' : 'Deposit Address'}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <code className="flex-1 text-[12px] text-[#c4b5fd] break-all bg-black/20 px-3 py-2 rounded-[6px]">
            {depositInfo.hotWalletAddress}
          </code>
          <CopyButton text={depositInfo.hotWalletAddress} />
        </div>
      </div>

      {!canUseGuidedDeposit && (
        <div className="flex gap-5 flex-wrap items-start">
          <img
            src={qrUrl}
            alt="Deposit address QR code"
            className="w-[140px] h-[140px] rounded-[8px] border-2 border-[rgba(167,139,250,0.3)] flex-shrink-0"
          />
          <div className="flex-1 min-w-[200px]">
            <h4 className="m-0 mb-3 text-[#b8b8ff] text-[14px] font-semibold">How to Deposit</h4>
            <ol className="m-0 pl-5 text-text-secondary text-[13px] leading-relaxed">
              {!hasLinkedWallet && (
                <li>Connect your Cardano wallet above in Linked Wallets</li>
              )}
              <li>Send {selectedCurrency?.label ?? 'tokens'} (CNT) to the deposit address above</li>
              <li>Your in-game balance updates automatically (up to ~20 sec)</li>
            </ol>
            {!hasLinkedWallet && (
              <div className="mt-3 px-3 py-2.5 rounded-[8px] bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.25)] text-[12px] text-[#fbbf24]">
                ⚠️ Only send from your <strong>linked</strong> Cardano wallet. Deposits from unlinked wallets cannot be credited.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type WithdrawStatus =
  | { state: 'idle' }
  | { state: 'pending'; withdrawalId: string }
  | { state: 'sent'; txHash: string; cardanoscanUrl: string }
  | { state: 'failed' };

function WithdrawTab({
  linkedWallets,
  depositInfo,
}: {
  linkedWallets: LinkedWallet[];
  depositInfo: any;
}) {
  const currencyBalances = useSyncCurrencyBalances();
  const cntCurrencies: CntCurrency[] = depositInfo?.cntCurrencies ?? [];
  const adaConfig = depositInfo?.ada;
  const primaryCurrency = cntCurrencies[0];

  // Currency selector: first option is always CNT (primary), optionally ADA
  const withdrawCurrencies = [
    ...(primaryCurrency ? [{ id: primaryCurrency.id, label: primaryCurrency.label ?? 'Tokens', isAda: false }] : []),
    ...(adaConfig?.enabled ? [{ id: 'ada', label: 'ADA (lovelace)', isAda: true }] : []),
  ];
  const [selectedCurrencyId, setSelectedCurrencyId] = useState<string>(withdrawCurrencies[0]?.id ?? '');
  const isAda = selectedCurrencyId === 'ada';

  const cntBalance = primaryCurrency ? (currencyBalances[primaryCurrency.id] ?? 0) : 0;
  const adaLovelaceBalance = currencyBalances['ada'] ?? 0;
  const balance = isAda ? adaLovelaceBalance : cntBalance;
  const currencyLabel = isAda ? 'lovelace (1 ADA = 1,000,000)' : (primaryCurrency?.label ?? 'tokens');

  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState<WithdrawStatus>({ state: 'idle' });

  const cardanoWallets = linkedWallets.filter((w) => w.chain === 'CARDANO');
  const primaryCardano = cardanoWallets.find((w) => w.isPrimary) ?? cardanoWallets[0];

  const notifications = useAppSelector((s: any) => s.sync?.notifications ?? {});
  useEffect(() => {
    if (withdrawStatus.state !== 'pending') return;
    const { withdrawalId } = withdrawStatus;
    const notifList: any[] = Object.values(notifications);
    const match = notifList.find(
      (n: any) =>
        (n.type === 'withdrawal_sent' || n.type === 'withdrawal_failed') &&
        n.sourceId === withdrawalId,
    );
    if (!match) return;
    if (match.type === 'withdrawal_sent') {
      const cardanoscanUrl = match.meta?.cardanoscanUrl ?? `https://cardanoscan.io/transaction/${match.meta?.txHash}`;
      setWithdrawStatus({ state: 'sent', txHash: match.meta?.txHash ?? '', cardanoscanUrl });
      loadHistory();
    } else {
      setWithdrawStatus({ state: 'failed' });
      loadHistory();
    }
  }, [notifications, withdrawStatus]);

  useEffect(() => {
    let cancelled = false;
    const KNOWN = ['nami', 'eternl', 'vespr', 'begin', 'flint', 'nufi', 'lace', 'yoroi'];
    const cardano = (window as any).cardano ?? {};

    (async () => {
      for (const key of KNOWN) {
        if (!cardano[key]?.enable) continue;
        try {
          const walletApi = await cardano[key].enable();
          const hexAddr: string = await walletApi.getChangeAddress();
          if (cancelled || !hexAddr) break;

          if (hexAddr.startsWith('addr')) {
            setAddress(hexAddr);
          } else {
            try {
              const { bech32 } = await api.decodeAddress(hexAddr);
              if (!cancelled && bech32) setAddress(bech32);
            } catch {
              /* decode failed — fall through */
            }
          }
          return;
        } catch {
          /* wallet.enable() denied — try next */
        }
      }
      if (!cancelled && primaryCardano) {
        setAddress(primaryCardano.address);
      }
    })();

    return () => { cancelled = true; };
  }, [primaryCardano?.address]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const rows = await api.getWithdrawals(10);
      setWithdrawals(rows);
    } catch {
      /* ignore */
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const submit = async () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) {
      setMsg({ text: 'Enter a valid amount', type: 'error' });
      return;
    }
    if (!address.trim()) {
      setMsg({ text: 'Enter or select a destination address', type: 'error' });
      return;
    }
    setSubmitting(true);
    setMsg(null);
    setWithdrawStatus({ state: 'idle' });
    try {
      const result = await api.requestWithdrawal(amt, address, selectedCurrencyId || undefined);
      const withdrawalId: string = result.id ?? '';
      setAmount('');
      if (withdrawalId) {
        setMsg({ text: 'Withdrawal submitted — waiting for on-chain send…', type: 'success' });
        setWithdrawStatus({ state: 'pending', withdrawalId });
      } else {
        setMsg({ text: 'Withdrawal request submitted! It will be processed shortly.', type: 'success' });
      }
      loadHistory();
    } catch (e: any) {
      setMsg({ text: e.message, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-black/20 border border-[rgba(139,92,246,0.14)] rounded-[11px] p-4">
        {withdrawCurrencies.length > 1 && (
          <div className="mb-3">
            <label className="block text-[12px] text-text-secondary mb-1.5">Currency</label>
            <div className="flex gap-2 flex-wrap">
              {withdrawCurrencies.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedCurrencyId(c.id); setAmount(''); }}
                  className={`px-3 py-1.5 rounded-[7px] border text-[12px] font-semibold cursor-pointer transition-colors ${
                    selectedCurrencyId === c.id
                      ? 'border-[rgba(167,139,250,0.6)] bg-[rgba(167,139,250,0.15)] text-[#c4b5fd]'
                      : 'border-white/15 bg-transparent text-[#888] hover:text-[#c4b5fd]'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {isAda && (
          <div className="mb-3 px-3 py-2 bg-[rgba(96,165,250,0.07)] border border-[rgba(96,165,250,0.2)] rounded-[8px] text-[12px] text-text-secondary">
            ADA balance:{' '}
            <span className="text-[#93c5fd] font-bold">
              {(adaLovelaceBalance / 1_000_000).toFixed(6)} ₳
            </span>{' '}
            ({adaLovelaceBalance.toLocaleString()} lovelace)
            {adaConfig?.withdrawalFeeLovelace && Number(adaConfig.withdrawalFeeLovelace) > 0 && (
              <span className="ml-2 text-[#888]">
                · Fee: {Number(adaConfig.withdrawalFeeLovelace).toLocaleString()} lovelace
              </span>
            )}
          </div>
        )}
        <div className="mb-3">
          <label className="block text-[12px] text-text-secondary mb-1.5">
            Amount ({currencyLabel}) — Available:{' '}
            <span className="text-[#c4b5fd] font-bold">{balance.toLocaleString()}</span>
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={balance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className={INPUT_CLASS + ' flex-1'}
            />
            <button
              onClick={() => setAmount(String(balance))}
              className={ACTION_BTN_PRIMARY}
              style={{ padding: '0.5rem 0.9rem' }}
            >
              MAX
            </button>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-[12px] text-text-secondary mb-1.5">
            Destination Cardano Address
          </label>
          {cardanoWallets.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-1.5">
              {cardanoWallets.map((w) => (
                <button
                  key={w.id}
                  onClick={() => setAddress(w.address)}
                  className={`px-2 py-1 rounded text-[11px] border cursor-pointer transition-colors ${
                    address === w.address
                      ? 'border-[rgba(167,139,250,0.6)] bg-[rgba(167,139,250,0.15)] text-[#c4b5fd]'
                      : 'border-white/15 bg-transparent text-[#888]'
                  }`}
                >
                  {w.isPrimary ? '★ ' : ''}{w.address.slice(0, 12)}…{w.address.slice(-6)}
                </button>
              ))}
            </div>
          )}
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="addr1..."
            className={INPUT_CLASS + " w-full font-['Fira_Code',monospace] text-[12px]"}
          />
        </div>

        {depositInfo && (depositInfo.minWithdrawalAmount > 1 || Number(depositInfo.withdrawalFee) > 0) && (
          <div className="mb-3 px-3 py-2 bg-[rgba(139,92,246,0.07)] border border-[rgba(139,92,246,0.2)] rounded-[8px] text-[12px] text-text-secondary leading-relaxed">
            {Number(depositInfo.withdrawalFee) > 0 && (
              <div>
                Fee:{' '}
                <span className="text-[#c4b5fd] font-semibold">
                  {Number(depositInfo.withdrawalFee).toLocaleString()} {currencyLabel}
                </span>{' '}
                deducted from withdrawal
              </div>
            )}
            {depositInfo.minWithdrawalAmount > 1 && (
              <div>
                Minimum:{' '}
                <span className="text-[#c4b5fd] font-semibold">
                  {depositInfo.minWithdrawalType === 'ADA_VALUE'
                    ? `${depositInfo.minWithdrawalAmount} ADA`
                    : depositInfo.minWithdrawalType === 'USD_VALUE'
                      ? `$${depositInfo.minWithdrawalAmount} USD`
                      : `${Number(depositInfo.minWithdrawalAmount).toLocaleString()} ${currencyLabel}`}
                </span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || !amount || !address || withdrawStatus.state === 'pending'}
          className="w-full py-2.5 rounded-[9px] border-0 font-bold text-[14px] text-white cursor-pointer transition-colors bg-[rgba(99,102,241,0.7)] hover:not(:disabled):bg-[rgba(99,102,241,0.85)] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Request Withdrawal'}
        </button>

        {msg && withdrawStatus.state !== 'sent' && withdrawStatus.state !== 'failed' && (
          <div className={`mt-3 px-3 py-2.5 rounded-[8px] text-[13px] border ${
            msg.type === 'success'
              ? 'bg-[rgba(76,175,80,0.12)] border-[rgba(76,175,80,0.3)] text-[#4caf50]'
              : 'bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.3)] text-[#f87171]'
          }`}>
            {msg.text}
            {withdrawStatus.state === 'pending' && (
              <span className="ml-2 inline-flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#4caf50] animate-pulse" />
                <span className="text-[11px] text-[#888]">Awaiting confirmation…</span>
              </span>
            )}
          </div>
        )}

        {withdrawStatus.state === 'sent' && (
          <div className="mt-3 px-3 py-2.5 rounded-[8px] bg-[rgba(76,175,80,0.12)] border border-[rgba(76,175,80,0.3)] text-[13px] text-[#4caf50]">
            ✓ Withdrawal sent on-chain!{' '}
            <a
              href={withdrawStatus.cardanoscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#60a5fa] no-underline hover:underline"
            >
              View on Cardanoscan ↗
            </a>
          </div>
        )}

        {withdrawStatus.state === 'failed' && (
          <div className="mt-3 px-3 py-2.5 rounded-[8px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[13px] text-[#f87171]">
            Withdrawal could not be sent automatically. Please contact support.
          </div>
        )}
      </div>

      <div>
        <span className={SECTION_LABEL}>Withdrawal History</span>
        {loadingHistory ? (
          <div className="text-text-secondary text-[13px] py-2">Loading…</div>
        ) : withdrawals.length === 0 ? (
          <div className="text-text-secondary text-[13px] py-4">No withdrawals yet</div>
        ) : (
          <div className="flex flex-col gap-2">
            {withdrawals.map((w) => (
              <div
                key={w.id}
                className="flex justify-between items-center flex-wrap gap-2 px-3 py-2.5 bg-black/10 border border-[rgba(139,92,246,0.1)] rounded-[9px] text-[13px]"
              >
                <div>
                  <span className="font-bold text-[#e0e0ff]">
                    {Number(w.amount).toLocaleString()} {currencyLabel}
                  </span>
                  {Number(w.fee) > 0 && (
                    <span className="text-text-secondary ml-1.5 text-[11px]">
                      (-{Number(w.fee)} fee)
                    </span>
                  )}
                </div>
                <StatusBadge status={w.status} />
                {w.status === 'SENT' && w.txHash && (
                  <a
                    href={`https://cardanoscan.io/transaction/${w.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-[#60a5fa] no-underline hover:underline whitespace-nowrap"
                  >
                    View on Cardanoscan ↗
                  </a>
                )}
                <div className="text-text-secondary text-[11px]">
                  {new Date(w.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DepositHistoryTab({ currencyLabel }: { currencyLabel: string }) {
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDeposits(20)
      .then(setDeposits)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-text-secondary text-[13px] py-4">Loading…</div>;
  if (deposits.length === 0) return <div className="text-text-secondary text-[13px] py-4">No deposits yet</div>;

  return (
    <div className="flex flex-col gap-2">
      {deposits.map((d) => (
        <div
          key={d.id}
          className="flex justify-between items-center flex-wrap gap-2 px-3 py-2.5 bg-black/10 border border-[rgba(139,92,246,0.1)] rounded-[9px] text-[13px]"
        >
          <div>
            <span className="font-bold text-[#4caf50]">
              +{Number(d.delta).toLocaleString()} {currencyLabel}
            </span>
          </div>
          {d.sourceId && (
            <a
              href={`https://cardanoscan.io/transaction/${d.sourceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-['Fira_Code',monospace] text-[11px] text-[#60a5fa] no-underline hover:underline"
            >
              {d.sourceId.slice(0, 16)}…
            </a>
          )}
          <div className="text-text-secondary text-[11px]">
            {new Date(d.createdAt).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}

type CryptoSubTab = 'deposit' | 'withdraw' | 'history';

const SUB_TABS: { key: CryptoSubTab; label: string }[] = [
  { key: 'deposit', label: 'Deposit' },
  { key: 'withdraw', label: 'Withdraw' },
  { key: 'history', label: 'History' },
];

export function OnChainWallet({ linkedWallets }: { linkedWallets: LinkedWallet[] }) {
  const [subTab, setSubTab] = useState<CryptoSubTab>('deposit');
  const [depositInfo, setDepositInfo] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const currencyBalances = useSyncCurrencyBalances();

  useEffect(() => {
    setLoadingInfo(true);
    api.getDepositInfo()
      .then(setDepositInfo)
      .catch(() => {})
      .finally(() => setLoadingInfo(false));
  }, []);

  const cntCurrencies: CntCurrency[] = depositInfo?.cntCurrencies ?? [];
  const primaryLabel = cntCurrencies[0]?.label ?? 'tokens';

  return (
    <div>
      <div className="my-5 border-t border-[rgba(139,92,246,0.12)]" />
      <span className={SECTION_LABEL}>On-Chain Wallet</span>

      {loadingInfo ? (
        <div className="text-center text-text-secondary py-6 text-sm">Loading wallet info…</div>
      ) : (
        <>
          {cntCurrencies.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {cntCurrencies.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-black/20 border border-[rgba(139,92,246,0.14)] rounded-[11px] px-3.5 py-[11px]"
                >
                  <span className="text-[13px] text-text-secondary">{c.label}</span>
                  <span className="text-[15px] font-bold text-[#c4b5fd] font-['Fira_Code',monospace]">
                    {(currencyBalances[c.id] ?? 0).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex border-b border-[rgba(139,92,246,0.12)] mb-4">
            {SUB_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setSubTab(t.key)}
                className={`${INNER_TAB_BASE} ${
                  subTab === t.key
                    ? 'text-[#c4b5fd] border-b-[var(--derp-purple)]'
                    : 'text-text-secondary hover:text-[#c4b5fd] border-b-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {subTab === 'deposit' && (
            <DepositTab depositInfo={depositInfo} linkedWallets={linkedWallets} />
          )}
          {subTab === 'withdraw' && (
            <WithdrawTab linkedWallets={linkedWallets} depositInfo={depositInfo} />
          )}
          {subTab === 'history' && (
            <DepositHistoryTab currencyLabel={primaryLabel} />
          )}
        </>
      )}
    </div>
  );
}

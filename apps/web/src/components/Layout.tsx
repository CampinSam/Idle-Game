import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAppDispatch } from "../store";
import { useEffect, useState, Suspense } from "react";
import { fetchCurrencyDefs } from "../store/gameSlice";
import { logout } from "../store/authSlice";
import { useNotifications } from "../context/NotificationContext";
import { useGlobalPowers } from "../hooks/useSyncSelectors";
import { useJobReadinessTimers } from "../hooks/useJobReadinessTimers";
import {
  useSyncPlayer,
  useSyncCurrencyBalances,
  useAllActiveJobs,
  useSyncGifts,
  useSyncQuests,
} from "../hooks/useSyncSelectors";
import { useAppSelector } from "../store";
import ToastOverlay from "./ToastOverlay";
import ConnectionStatusBanner from "./ConnectionStatusBanner";
import NotificationCenter from "../features/notifications/NotificationCenter";
import { resolveIcon } from "../utils/iconResolver";
import ItemQty from "./ItemQty";
import { audioEngine } from "../services/AudioEngine";
import { useBodyCardVariant } from "../context/BodyCardVariantContext";
import { installButtonSfx } from "../services/buttonSfx";
import { useAudioNavigation } from "../hooks/useAudioNavigation";
import { useLevelUpAudio } from "../hooks/useLevelUpAudio";
import { useSeasonStartAudio } from "../hooks/useSeasonStartAudio";
import { useEntityProgressionAudio } from "../hooks/useEntityProgressionAudio";

export default function Layout() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const profile = useSyncPlayer();
  const { variantClass } = useBodyCardVariant();
  const currencyBalances = useSyncCurrencyBalances();
  const currencyDefs = useAppSelector((s) => s.game.currencyDefs);
  const { unreadCount } = useNotifications();
  const globalPowers = useGlobalPowers();

  const allActiveJobs = useAllActiveJobs();
  const gifts = useSyncGifts();
  const quests = useSyncQuests();

  useJobReadinessTimers(allActiveJobs);
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifCenter, setShowNotifCenter] = useState(false);

  useEffect(() => {
    audioEngine.init();
    installButtonSfx();
  }, []);
  useAudioNavigation();
  useLevelUpAudio();
  useSeasonStartAudio();
  useEntityProgressionAudio();

  const hasClaimableRewards =
    gifts.some((g: any) => g.status === "UNCLAIMED") ||
    quests.some((q: any) => q.status === "completed");

  useEffect(() => {
    if (currencyDefs.length === 0) dispatch(fetchCurrencyDefs());
  }, [dispatch, currencyDefs.length]);

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
    setShowMenu(false);
  };

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden">
      <ConnectionStatusBanner />
      {profile && (
        <div className="fixed top-0 left-0 right-0 z-[90] flex justify-center px-4 py-2 pointer-events-none">
          <div className="flex flex-row items-center gap-1.5 p-2 max-w-[520px] w-full bg-[#1a1640] border border-[rgba(139,92,246,0.3)] rounded-[14px] backdrop-blur-xl pointer-events-auto overflow-visible">
            <div className="relative flex-shrink-0 w-[84px] h-[84px] self-center -my-5">
                <button
                  className="relative w-[84px] h-[84px] rounded-full p-0 bg-transparent border-0 cursor-pointer"
                  data-sfx="ui.icon_button"
                  onClick={() => setShowMenu(!showMenu)}
                >
                  <svg className="absolute top-0 left-0 w-[84px] h-[84px] -rotate-90 overflow-visible" viewBox="0 0 48 48">
                    <circle className="progress-ring-bg" cx="24" cy="24" r="21" />
                    <circle
                      className="progress-ring-fill"
                      cx="24"
                      cy="24"
                      r="21"
                      strokeDasharray={`${2 * Math.PI * 21}`}
                      strokeDashoffset={`${2 * Math.PI * 21 * (1 - Math.min(1, Math.max(0, profile.keeperXp / (profile.xpToNextLevel || 100))))}`}
                    />
                  </svg>
                  <img
                    className="absolute top-[5px] left-[5px] w-[74px] h-[74px] rounded-full object-cover"
                    src="/media/images/icon-entities.png"
                    alt=""
                  />
                  <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white text-base font-black pointer-events-none leading-none [text-shadow:0_0_6px_rgba(0,0,0,0.9),0_1px_3px_rgba(0,0,0,0.8)]">
                    {profile.keeperLevel}
                  </span>
                </button>
                {showMenu && (
                  <div className="absolute top-[60px] left-0 bg-[#1e1b3a] border border-[rgba(139,92,246,0.35)] rounded-[10px] p-3 min-w-[150px] z-[100] shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
                    <div className="text-sm font-bold text-[#e2d9ff] mb-0.5">{profile.username}</div>
                    <div className="text-xs text-text-secondary mb-2.5">
                      Keeper Lvl {profile.keeperLevel}
                    </div>
                    <button
                      className="w-full py-[7px] px-[7px] bg-transparent border border-[rgba(139,92,246,0.3)] text-[#c4b5fd] text-xs font-semibold rounded-[6px] cursor-pointer transition-all duration-200 mb-1.5 hover:bg-[rgba(139,92,246,0.1)] hover:border-[rgba(139,92,246,0.5)]"
                      onClick={() => { navigate("/profile"); setShowMenu(false); }}
                    >
                      Profile
                    </button>
                    <button
                      className="w-full py-[7px] px-[7px] bg-transparent border border-[rgba(139,92,246,0.3)] text-[#c4b5fd] text-xs font-semibold rounded-[6px] cursor-pointer transition-all duration-200 mb-1.5 hover:bg-[rgba(139,92,246,0.1)] hover:border-[rgba(139,92,246,0.5)]"
                      onClick={() => { navigate("/settings"); setShowMenu(false); }}
                    >
                      Settings
                    </button>
                    <button
                      className="w-full py-[7px] px-[7px] bg-transparent border border-[rgba(139,92,246,0.3)] text-[#c4b5fd] text-xs font-semibold rounded-[6px] cursor-pointer transition-all duration-200 mb-1.5 hover:bg-[rgba(139,92,246,0.1)] hover:border-[rgba(139,92,246,0.5)]"
                      onClick={() => { navigate("/rewards"); setShowMenu(false); }}
                    >
                      Rewards
                    </button>
                    <button
                      className="w-full py-[7px] px-[7px] bg-transparent border border-[rgba(139,92,246,0.3)] text-[#c4b5fd] text-xs font-semibold rounded-[6px] cursor-pointer transition-all duration-200 mb-1.5 hover:bg-[rgba(139,92,246,0.1)] hover:border-[rgba(139,92,246,0.5)]"
                      onClick={() => { navigate("/achievements"); setShowMenu(false); }}
                    >
                      Achievements
                    </button>
                    <button
                      className="w-full py-[7px] px-[7px] bg-transparent border border-[rgba(139,92,246,0.3)] text-[#c4b5fd] text-xs font-semibold rounded-[6px] cursor-pointer transition-all duration-200 mb-1.5 hover:bg-[rgba(139,92,246,0.1)] hover:border-[rgba(139,92,246,0.5)]"
                      onClick={() => { navigate("/jobs"); setShowMenu(false); }}
                    >
                      Active Jobs
                    </button>
                    <button
                      className="w-full py-[7px] px-[7px] bg-transparent border border-[rgba(139,92,246,0.3)] text-[#c4b5fd] text-xs font-semibold rounded-[6px] cursor-pointer transition-all duration-200 mb-1.5 hover:bg-[rgba(139,92,246,0.1)] hover:border-[rgba(139,92,246,0.5)]"
                      onClick={() => { navigate("/settings"); setShowMenu(false); }}
                    >
                      Wallet
                    </button>
                    <button
                      className="w-full py-[7px] px-[7px] bg-transparent border border-[rgba(239,68,68,0.3)] text-[#f87171] text-xs font-semibold rounded-[6px] cursor-pointer transition-all duration-200 hover:bg-[rgba(239,68,68,0.1)] hover:border-[rgba(239,68,68,0.5)]"
                      onClick={handleLogout}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-2 w-full pb-1 border-b border-[rgba(139,92,246,0.25)]">
              <span className="font-bold text-[20px] leading-none text-[#e2d9ff] whitespace-nowrap flex-shrink-0">{profile.username}</span>
              <div style={{ flex: 1 }} />
              {hasClaimableRewards && (
                <button
                  className="top-bar-gift"
                  onClick={() => navigate("/rewards")}
                  aria-label="Claimable rewards"
                >
                  🎁
                </button>
              )}
              <button
                className="relative bg-transparent border-0 text-white/60 cursor-pointer p-0 ml-0 flex-shrink-0 transition-colors duration-150 flex items-center hover:text-[#c4b5fd]"
                data-sfx="ui.icon_button"
                onClick={() => setShowNotifCenter(true)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  width="20"
                  height="20"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#ef4444] text-white text-[10px] font-extrabold flex items-center justify-center leading-none shadow-[0_0_6px_rgba(239,68,68,0.5)]">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                {globalPowers.length > 0 && (
                  <span
                    className="bell-boost-indicator"
                    title={globalPowers.map((p) => p.label).join(', ')}
                  >
                    ⚡
                  </span>
                )}
              </button>
              </div>
            <div className="flex items-center justify-end gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden max-[520px]:gap-1.5">
              {(() => {
                const FALLBACK = [
                  "soft_arcanium",
                  "hard_essence",
                  "premium_gems",
                  "crypto_derp",
                ];
                const defsLoaded = currencyDefs.length > 0;
                const visible = currencyDefs
                  .filter((d: any) => d?.showInTopBar === true)
                  .slice()
                  .sort(
                    (a: any, b: any) =>
                      (a?.sortOrder ?? 0) - (b?.sortOrder ?? 0) ||
                      String(a?.id ?? "").localeCompare(String(b?.id ?? "")),
                  )
                  .slice(0, 6);
                const ids = defsLoaded ? visible.map((d: any) => d.id) : FALLBACK;
                return ids.map((id: string) => (
                  <div key={id} className="flex items-center gap-0.5 leading-none">
                    <ItemQty
                      src={resolveIcon("CURRENCY", id, currencyDefs, [])}
                      amount={currencyBalances[id] ?? 0}
                      size={16}
                      format="compact"
                    />
                  </div>
                ));
              })()}
            </div>
            </div>
          </div>
        </div>
      )}

      <ToastOverlay />

      {showNotifCenter && (
        <NotificationCenter
          onClose={() => setShowNotifCenter(false)}
        />
      )}

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden pt-[92px] px-2 pb-[calc(64px+env(safe-area-inset-bottom,0px)+8px)] max-w-[520px] mx-auto w-full">
        <div
          className="relative flex-1 min-h-0 flex flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1640] to-[#221a50] border border-[rgba(139,92,246,0.25)] [scrollbar-width:thin] [scrollbar-color:rgba(139,92,246,0.3)_transparent]"
          data-body-variant={variantClass || undefined}
        >
          <div key={location.key} className="page-transition-wrapper flex-1 min-h-0 flex flex-col">
            <Suspense
              fallback={
                <div className="flex-1 flex items-center justify-center">
                  <div className="page-content-spinner" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex justify-around items-start h-[calc(64px+env(safe-area-inset-bottom,0px))] bg-gradient-to-b from-[rgba(15,10,35,0.95)] to-[rgba(10,8,25,0.98)] backdrop-blur-xl border-t border-[rgba(139,92,246,0.2)] pt-2 px-2 pb-[env(safe-area-inset-bottom,0px)] z-[100] shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center gap-[3px] py-2 px-3 no-underline [transition:color_0.2s,transform_0.1s_ease] rounded-[10px] min-w-[56px] relative active:scale-[0.88] hover:text-[rgba(196,181,253,0.8)]${isActive ? ' text-derp-purple bnav-active-bar' : ' text-[rgba(148,163,184,0.6)]'}`
          }
        >
          <svg
            className="w-[22px] h-[22px] transition-all duration-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="text-[10px] font-semibold tracking-[0.3px] font-exo">Home</span>
        </NavLink>
        <NavLink
          to="/missions"
          className={({ isActive }) =>
            `flex flex-col items-center gap-[3px] py-2 px-3 no-underline [transition:color_0.2s,transform_0.1s_ease] rounded-[10px] min-w-[56px] relative active:scale-[0.88] hover:text-[rgba(196,181,253,0.8)]${isActive ? ' text-derp-purple bnav-active-bar' : ' text-[rgba(148,163,184,0.6)]'}`
          }
        >
          <svg
            className="w-[22px] h-[22px] transition-all duration-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="3 11 22 2 13 21 11 13 3 11" />
          </svg>
          <span className="text-[10px] font-semibold tracking-[0.3px] font-exo">Missions</span>
        </NavLink>
        <NavLink
          to="/entities"
          className={({ isActive }) =>
            `flex flex-col items-center gap-[3px] py-2 px-3 no-underline [transition:color_0.2s,transform_0.1s_ease] rounded-[10px] min-w-[56px] relative active:scale-[0.88] hover:text-[rgba(196,181,253,0.8)]${isActive ? ' text-derp-purple bnav-active-bar' : ' text-[rgba(148,163,184,0.6)]'}`
          }
        >
          <svg
            className="w-[22px] h-[22px] transition-all duration-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8c0-3.3-2.7-6-6-6S6 4.7 6 8c0 2.5 1.5 4.6 3.7 5.5L8 22h8l-1.7-8.5C16.5 12.6 18 10.5 18 8z" />
            <circle cx="9" cy="8" r="1" />
            <circle cx="15" cy="8" r="1" />
          </svg>
          <span className="text-[10px] font-semibold tracking-[0.3px] font-exo">Entities</span>
        </NavLink>
        <NavLink
          to="/inventory"
          className={({ isActive }) =>
            `flex flex-col items-center gap-[3px] py-2 px-3 no-underline [transition:color_0.2s,transform_0.1s_ease] rounded-[10px] min-w-[56px] relative active:scale-[0.88] hover:text-[rgba(196,181,253,0.8)]${isActive ? ' text-derp-purple bnav-active-bar' : ' text-[rgba(148,163,184,0.6)]'}`
          }
        >
          <svg
            className="w-[22px] h-[22px] transition-all duration-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            <path d="M12 12v3" />
            <path d="M2 12h20" />
          </svg>
          <span className="text-[10px] font-semibold tracking-[0.3px] font-exo">Items</span>
        </NavLink>
        <NavLink
          to="/locations"
          className={({ isActive }) =>
            `flex flex-col items-center gap-[3px] py-2 px-3 no-underline [transition:color_0.2s,transform_0.1s_ease] rounded-[10px] min-w-[56px] relative active:scale-[0.88] hover:text-[rgba(196,181,253,0.8)]${isActive ? ' text-derp-purple bnav-active-bar' : ' text-[rgba(148,163,184,0.6)]'}`
          }
        >
          <svg
            className="w-[22px] h-[22px] transition-all duration-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="10" width="16" height="12" rx="1" />
            <path d="M12 2l8 8H4z" />
            <rect x="9" y="15" width="6" height="7" />
          </svg>
          <span className="text-[10px] font-semibold tracking-[0.3px] font-exo">Outpost</span>
        </NavLink>
        <NavLink
          to="/store"
          className={({ isActive }) =>
            `flex flex-col items-center gap-[3px] py-2 px-3 no-underline [transition:color_0.2s,transform_0.1s_ease] rounded-[10px] min-w-[56px] relative active:scale-[0.88] hover:text-[rgba(196,181,253,0.8)]${isActive ? ' text-derp-purple bnav-active-bar' : ' text-[rgba(148,163,184,0.6)]'}`
          }
        >
          <svg
            className="w-[22px] h-[22px] transition-all duration-200"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
          <span className="text-[10px] font-semibold tracking-[0.3px] font-exo">Store</span>
        </NavLink>
      </nav>
    </div>
  );
}

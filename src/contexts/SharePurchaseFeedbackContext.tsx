/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, ExternalLink, X } from '../components/ui-simple/Icons';
import { getTxUrl } from '../lib/config';
import { MAX_SUPPLY } from '../lib/graduation';

export interface SharePurchaseSuccessPayload {
  targetUsername: string;
  targetAvatarUrl?: string | null;
  paidPriceSui: string;
  txDigest?: string;
  holdersAfterPurchase: number;
  hitGraduationThreshold: boolean;
  source: 'hover-card' | 'profile' | 'user-profile';
}

interface SharePurchaseFeedbackContextValue {
  showSuccessReceipt: (payload: SharePurchaseSuccessPayload) => void;
  dismissSuccessReceipt: () => void;
}

const SharePurchaseFeedbackContext = createContext<SharePurchaseFeedbackContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 9000;
const STORAGE_KEY = 'cord.share-purchase-receipt';

function SharePurchaseSuccessOverlay({
  payload,
  onDismiss,
}: {
  payload: SharePurchaseSuccessPayload;
  onDismiss: () => void;
}) {
  const explorerUrl = payload.txDigest ? getTxUrl(payload.txDigest) : null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[120] sm:inset-x-auto sm:right-5 sm:w-[380px]">
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 px-4 py-3 text-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-white/20 p-1.5">
                <CheckCircle className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">Share purchased</div>
                <div className="text-xs text-emerald-50">On-chain confirmation received</div>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="rounded-full p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Dismiss share purchase receipt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            {payload.targetAvatarUrl ? (
              <img
                src={payload.targetAvatarUrl}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-sm font-semibold text-white">
                {payload.targetUsername.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-gray-900">
                @{payload.targetUsername}
              </div>
              <div className="text-sm text-gray-500">
                1 share added to your wallet
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-emerald-700">Amount paid</div>
              <div className="mt-1 font-mono text-sm font-semibold text-emerald-900">
                {payload.paidPriceSui} SUI
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">Holders now</div>
              <div className="mt-1 font-mono text-sm font-semibold text-gray-900">
                {payload.holdersAfterPurchase}/{MAX_SUPPLY}
              </div>
            </div>
          </div>

          {payload.hitGraduationThreshold ? (
            <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 px-3 py-3">
              <div className="text-sm font-semibold text-purple-900">Graduation threshold reached</div>
              <div className="mt-1 text-xs text-purple-700">
                This purchase filled the final Phase 1 slot. Token launch can now proceed.
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-600">
              Your purchase was confirmed regardless of where you started the flow. This receipt stays visible even if the originating card or page rerenders.
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            {explorerUrl && (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                View transaction
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              onClick={onDismiss}
              className="inline-flex min-w-[96px] items-center justify-center rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const SharePurchaseFeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeReceipt, setActiveReceipt] = useState<SharePurchaseSuccessPayload | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);

  const dismissSuccessReceipt = useCallback(() => {
    setActiveReceipt(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const showSuccessReceipt = useCallback((payload: SharePurchaseSuccessPayload) => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
    setActiveReceipt(payload);
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      setActiveReceipt(null);
    }, AUTO_DISMISS_MS);
  }, []);

  useEffect(() => {
    setPortalReady(true);
    if (typeof window === 'undefined') return;
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as SharePurchaseSuccessPayload;
      setActiveReceipt(parsed);
      dismissTimerRef.current = window.setTimeout(() => {
        dismissTimerRef.current = null;
        setActiveReceipt(null);
        window.sessionStorage.removeItem(STORAGE_KEY);
      }, AUTO_DISMISS_MS);
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => () => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
    }
  }, []);

  const value = useMemo(
    () => ({
      showSuccessReceipt,
      dismissSuccessReceipt,
    }),
    [dismissSuccessReceipt, showSuccessReceipt],
  );

  return (
    <SharePurchaseFeedbackContext.Provider value={value}>
      {children}
      {portalReady && activeReceipt
        ? createPortal(
            <SharePurchaseSuccessOverlay payload={activeReceipt} onDismiss={dismissSuccessReceipt} />,
            document.body,
          )
        : null}
    </SharePurchaseFeedbackContext.Provider>
  );
};

export function useSharePurchaseFeedback() {
  const context = useContext(SharePurchaseFeedbackContext);
  if (!context) {
    throw new Error('useSharePurchaseFeedback must be used within SharePurchaseFeedbackProvider');
  }
  return context;
}

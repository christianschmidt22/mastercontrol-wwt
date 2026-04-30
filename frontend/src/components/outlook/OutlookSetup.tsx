/**
 * OutlookSetup — modal dialog for the Microsoft Graph device-code auth flow.
 *
 * 1. On mount: calls POST /api/outlook/auth-start and displays the user_code
 *    in large monospace type, with a verification_uri link.
 * 2. Polls GET /api/outlook/auth-poll every 5 s while open.
 * 3. On success: calls onSuccess() to close and refresh status.
 * 4. On error/expiry: shows error message with a Retry button.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useOutlookAuthStart, fetchAuthPoll } from '../../api/useOutlook';
import type { DeviceCodeResponse } from '../../types/outlook';

interface OutlookSetupProps {
  onSuccess: () => void;
  onClose: () => void;
}

export function OutlookSetup({ onSuccess, onClose }: OutlookSetupProps) {
  const { mutate: startAuth, isPending: isStarting } = useOutlookAuthStart();

  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<'idle' | 'polling' | 'success' | 'error'>('idle');
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }

  function startPolling() {
    setPollStatus('polling');
    pollIntervalRef.current = setInterval(() => {
      fetchAuthPoll()
        .then((res) => {
          if (res.status === 'success') {
            stopPolling();
            setPollStatus('success');
            onSuccess();
          } else if (res.status === 'error') {
            stopPolling();
            setPollStatus('error');
            setError(res.message ?? 'Authentication failed.');
          }
          // 'pending' → keep polling
        })
        .catch(() => {
          stopPolling();
          setPollStatus('error');
          setError('Lost connection while checking auth status.');
        });
    }, 5000);
  }

  const initiateFlow = useCallback(() => {
    setError(null);
    setDeviceCode(null);
    setPollStatus('idle');
    startAuth(undefined, {
      onSuccess: (data) => {
        setDeviceCode(data);
        startPolling();
      },
      onError: (err) => {
        setError(err.message);
        setPollStatus('error');
      },
    });
  // startPolling is defined in the same closure scope and is stable w.r.t.
  // startAuth (a TanStack Query mutation ref). startAuth identity is stable
  // across renders per TanStack Query guarantees.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAuth]);

  // Start the flow immediately on mount.
  useEffect(() => {
    initiateFlow();
    return () => stopPolling();
  }, [initiateFlow]);

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect Outlook mailbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--rule)',
          borderRadius: 10,
          padding: 32,
          width: 420,
          maxWidth: '90vw',
          boxSizing: 'border-box',
        }}
      >
        <h2
          style={{
            margin: '0 0 8px',
            fontSize: 16,
            fontFamily: 'var(--display)',
            color: 'var(--ink-1)',
          }}
        >
          Connect Your Mailbox
        </h2>

        {isStarting && (
          <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Starting auth flow…</p>
        )}

        {deviceCode && pollStatus !== 'error' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '0 0 16px' }}>
              Visit the link below and enter the code to sign in. This tab will
              update automatically once you complete sign-in.
            </p>

            <a
              href={deviceCode.verification_uri}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                marginBottom: 16,
                fontSize: 13,
                color: 'var(--accent)',
                wordBreak: 'break-all',
              }}
            >
              {deviceCode.verification_uri}
            </a>

            <div
              aria-label="Your sign-in code"
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                padding: '12px 16px',
                textAlign: 'center',
                fontFamily: 'monospace',
                fontSize: 28,
                letterSpacing: '0.2em',
                color: 'var(--ink-1)',
                marginBottom: 16,
              }}
            >
              {deviceCode.user_code}
            </div>

            <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '0 0 20px' }}>
              {pollStatus === 'polling'
                ? 'Waiting for sign-in…'
                : 'Ready to sign in.'}
            </p>
          </>
        )}

        {error && (
          <p
            role="alert"
            style={{ fontSize: 13, color: 'var(--accent)', margin: '0 0 16px' }}
          >
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              border: '1px solid var(--rule)',
              borderRadius: 5,
              background: 'transparent',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              fontFamily: 'var(--body)',
            }}
          >
            Cancel
          </button>
          {(pollStatus === 'error' || pollStatus === 'idle') && !isStarting && (
            <button
              type="button"
              onClick={initiateFlow}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                border: 'none',
                borderRadius: 5,
                background: 'var(--accent)',
                color: '#fff',
                cursor: 'pointer',
                fontFamily: 'var(--body)',
              }}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

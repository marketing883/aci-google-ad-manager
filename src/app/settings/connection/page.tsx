'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Shield, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function ConnectionPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [accountInfo, setAccountInfo] = useState<{ customer_id: string; account_name: string } | null>(null);

  // Check URL params for OAuth callback result
  useEffect(() => {
    const success = searchParams.get('success');
    const err = searchParams.get('error');

    if (success === 'true') {
      setConnected(true);
      checkConnectionStatus();
    }
    if (err) {
      setError(decodeURIComponent(err));
    }
  }, [searchParams]);

  // Check current connection status on load
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  async function checkConnectionStatus() {
    try {
      const res = await fetch('/api/google-ads/auth/status');
      const data = await res.json();
      if (data.connected) {
        setConnected(true);
        setAccountInfo(data.account);
      }
    } catch {
      // Not connected
    }
  }

  async function handleConnect() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/google-ads/auth/connect', { method: 'POST' });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setLoading(false);
        return;
      }

      // Redirect to Google OAuth
      window.location.href = data.auth_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await fetch('/api/google-ads/auth/disconnect', { method: 'POST' });
      setConnected(false);
      setAccountInfo(null);
    } catch {
      setError('Failed to disconnect');
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/settings" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <h1 className="text-2xl font-bold">Connect Google Ads</h1>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-red-300 font-medium">Connection Error</p>
              <p className="text-red-400 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Connected State */}
        {connected && accountInfo && (
          <div className="bg-green-900/30 border border-green-800 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-6 h-6 text-green-400" />
              <h2 className="text-lg font-semibold text-green-300">Connected</h2>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Account</span>
                <span>{accountInfo.account_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Customer ID</span>
                <span className="font-mono">{accountInfo.customer_id}</span>
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="mt-4 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}

        {/* Setup Steps */}
        {!connected && (
          <>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Setup Steps</h2>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                    1
                  </div>
                  <div>
                    <p className="font-medium">Set up environment variables</p>
                    <p className="text-sm text-gray-400 mt-1">
                      Add your Google Ads API credentials to <code className="text-xs bg-gray-800 px-1.5 py-0.5 rounded">.env.local</code>:
                      Client ID, Client Secret, Developer Token, and Redirect URI.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-gray-800 text-gray-400 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                    2
                  </div>
                  <div>
                    <p className="font-medium text-gray-400">Authorize with Google</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Click the button below to start the OAuth2 flow. You will be redirected to Google to grant access.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-gray-800 text-gray-400 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                    3
                  </div>
                  <div>
                    <p className="font-medium text-gray-400">Select your account</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Choose which Google Ads account (customer ID) to manage.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection Button */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
              <Shield className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm mb-4">
                Your credentials are stored securely and only used to manage your Google Ads account.
              </p>
              <button
                onClick={handleConnect}
                disabled={loading}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2 mx-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect Google Ads Account'
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

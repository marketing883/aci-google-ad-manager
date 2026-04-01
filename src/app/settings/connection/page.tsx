import Link from 'next/link';
import { ArrowLeft, Link2, Shield, CheckCircle } from 'lucide-react';

export default function ConnectionPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/settings" className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <h1 className="text-2xl font-bold">Connect Google Ads</h1>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Steps */}
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
          <button className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
            Connect Google Ads Account
          </button>
        </div>
      </div>
    </div>
  );
}

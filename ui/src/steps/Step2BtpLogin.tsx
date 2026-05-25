import { useState } from 'react';
import { useStore } from '../store';
import { ManualGuide } from '../components/ManualGuide';
import { StatusBadge } from '../components/StatusBadge';
import { StepResetButton } from '../components/StepResetButton';
import { COCKPIT_TRIAL } from '../types';
import * as api from '../api';

export function Step2BtpLogin() {
  const { btpLoggedIn, btpInfo, checkLoginStatus, setStepStatus, wizard, config, workspace } = useStore();
  const [polling, setPolling] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const stepStatus = wizard?.steps.find((s) => s.id === 2)?.status ?? 'pending';
  // No auto-completing via useEffect — user must click "Verify & Complete"
  const subdomain = config?.globalAccountSubdomain;

  const handleCheckStatus = async () => {
    setPolling(true);
    setVerifyError(null);
    await checkLoginStatus();
    setPollCount((n) => n + 1);
    setPolling(false);
  };

  const handleVerifyAndComplete = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await api.verifyStep(workspace, 2);
      if (result.ok) {
        await setStepStatus(2, 'completed');
      } else {
        setVerifyError(result.details || 'BTP session not found. Run btp login first.');
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 mb-1">BTP Login</h2>
          <p className="text-gray-400 text-sm">
            Log in to the SAP BTP CLI to authenticate with your global account.
          </p>
        </div>
        <StepResetButton
          stepId={2}
          confirmLabel="⚠ Run btp logout?"
          disabled={stepStatus === 'running'}
        />
      </div>

      {/* Current status */}
      <div className="card flex items-start gap-4">
        <div className="text-3xl mt-1">🔑</div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <StatusBadge status={btpLoggedIn === null ? 'pending' : btpLoggedIn ? 'completed' : 'error'} />
            <span className="text-sm text-gray-400">
              {btpLoggedIn === null ? 'Not checked yet' : btpLoggedIn ? 'Logged in' : 'Not logged in'}
            </span>
          </div>
          {btpInfo && (
            <p className="text-sm text-gray-300 font-mono bg-surface-3 px-3 py-1.5 rounded-lg inline-block">
              {btpInfo}
            </p>
          )}
        </div>
      </div>

      {/* Not logged in — show instructions */}
      {!btpLoggedIn && (
        <>
          <div className="card space-y-4">
            <h3 className="font-semibold text-gray-200">How to log in</h3>
            <p className="text-sm text-gray-400">Open a terminal and run:</p>

            <div className="bg-black rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Run in terminal</div>
              <code className="text-sm text-green-400 font-mono">
                {subdomain ? `btp login --subdomain ${subdomain}` : 'btp login'}
              </code>
            </div>

            <ol className="space-y-2 text-sm text-gray-300">
              {[
                'Open a new terminal window',
                'Run the command above — a browser window will open for OIDC authentication',
                'Log in with your SAP BTP credentials',
                'Once the terminal shows success, click Check Status below',
                'Then click Verify & Complete to unlock Step 3',
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-gray-500 font-mono w-4 text-right flex-shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <ManualGuide
            title="Don't have a BTP Trial account?"
            description="Create a free SAP BTP Trial account — no credit card required."
            steps={[
              'Open the BTP Trial registration page',
              'Click "Start your free trial"',
              'Fill in your details and verify your email',
              'Come back and run the login command above',
            ]}
            link="https://www.sap.com/products/technology-platform/trial.html"
            linkLabel="Create Free Trial Account"
            variant="info"
          />
        </>
      )}

      {/* Logged in — show verify button */}
      {btpLoggedIn && stepStatus !== 'completed' && (
        <div className="p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-sm text-blue-300">
          BTP session detected. Click <strong>Verify &amp; Complete</strong> to confirm and proceed.
        </div>
      )}

      {stepStatus === 'completed' && (
        <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-700/40 rounded-lg">
          <span className="text-green-400 text-lg">✓</span>
          <span className="text-sm text-green-300">BTP login verified. Proceed to CF Login.</span>
        </div>
      )}

      {verifyError && (
        <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">
          {verifyError}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void handleCheckStatus()}
          disabled={polling}
          className="btn-secondary text-sm"
        >
          {polling ? (
            <span className="flex items-center gap-2">
              <span className="spinner" style={{ width: 12, height: 12 }} /> Checking...
            </span>
          ) : '↺ Check Status'}
        </button>

        {btpLoggedIn && stepStatus !== 'completed' && (
          <button
            onClick={() => void handleVerifyAndComplete()}
            disabled={verifying}
            className="btn-primary"
          >
            {verifying ? (
              <span className="flex items-center gap-2">
                <span className="spinner" style={{ width: 14, height: 14 }} /> Verifying...
              </span>
            ) : '✓ Verify & Complete Step'}
          </button>
        )}

        {pollCount > 0 && !btpLoggedIn && (
          <span className="text-sm text-gray-500">
            Not logged in yet. Complete the login in your terminal first.
          </span>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useStore } from '../store';
import { ManualGuide } from '../components/ManualGuide';
import { StatusBadge } from '../components/StatusBadge';
import { StepResetButton } from '../components/StepResetButton';
import { cockpitCfEnableUrl, COCKPIT_TRIAL } from '../types';
import * as api from '../api';

export function Step3CfLogin() {
  const { cfLoggedIn, cfTarget, checkLoginStatus, setStepStatus, wizard, config, workspace } = useStore();

  // Whether the user has explicitly clicked "Check Status" at least once.
  // The store may already have cfLoggedIn populated from detectAndSync() on boot —
  // we intentionally hide that until the user explicitly checks, so the step
  // never shows an error badge on first render without any user action.
  const [userHasChecked, setUserHasChecked] = useState(false);

  const [polling, setPolling] = useState(false);
  const [targeting, setTargeting] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [targetOutput, setTargetOutput] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Editable org / space — pre-filled from config but user can correct them.
  // These are what gets sent to `cf target -o ORG -s SPACE`.
  const [orgInput, setOrgInput] = useState(config?.cfOrg ?? '');
  const [spaceInput, setSpaceInput] = useState(config?.cfSpace ?? 'dev');

  const stepStatus = wizard?.steps.find((s) => s.id === 3)?.status ?? 'pending';

  // Derive display values — only trust them after an explicit check.
  const showStatus = userHasChecked || stepStatus === 'completed' || stepStatus === 'error';
  const hasOrg = !!(cfTarget?.org && cfTarget.org.trim() !== '');
  const hasSpace = !!(cfTarget?.space && cfTarget.space.trim() !== '');

  const handleCheck = async () => {
    setPolling(true);
    setVerifyError(null);
    try {
      await checkLoginStatus();
    } finally {
      setUserHasChecked(true);
      setPolling(false);
    }
  };

  const handleAutoTarget = async () => {
    const org   = orgInput.trim();
    const space = spaceInput.trim() || 'dev';
    if (!org) {
      setTargetError('Please enter your CF org name before targeting.');
      return;
    }
    setTargeting(true);
    setTargetError(null);
    setTargetOutput(null);
    try {
      const { ok, output } = await api.cfTargetOrg(org, space);
      setTargetOutput(output || null);
      if (ok) {
        // Re-check so the status card reflects the new target
        await handleCheck();
      } else {
        setTargetError(
          `cf target failed.\n\n${output || 'No output from CF CLI.'}\n\nMake sure the org name matches exactly what appears in BTP Cockpit.`
        );
      }
    } catch (err) {
      setTargetError(err instanceof Error ? err.message : 'cf target failed');
    } finally {
      setTargeting(false);
    }
  };

  const handleVerifyAndComplete = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await api.verifyStep(workspace, 3);
      if (result.ok) {
        await setStepStatus(3, 'completed');
      } else {
        setVerifyError(result.details || 'CF login or org/space targeting incomplete.');
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setVerifying(false);
    }
  };

  const cfEndpoint = config?.cfApiEndpoint ?? 'https://api.cf.us10-001.hana.ondemand.com';
  const subaccountId = config?.subaccountId;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 mb-1">CF Login</h2>
          <p className="text-gray-400 text-sm">
            Log in to Cloud Foundry and target your org and space.
          </p>
        </div>
        <StepResetButton
          stepId={3}
          confirmLabel="⚠ Run cf logout?"
          disabled={stepStatus === 'running'}
        />
      </div>

      {/* Status card — only shown after explicit check or if previously completed/error */}
      {showStatus && cfLoggedIn !== null && (
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <StatusBadge
              status={
                cfLoggedIn && hasOrg && hasSpace
                  ? 'completed'
                  : cfLoggedIn
                  ? 'error'
                  : 'error'
              }
            />
            <span className="text-sm text-gray-400">
              {!cfLoggedIn
                ? 'Not logged in to CF'
                : !hasOrg
                ? 'Logged in — no CF org targeted'
                : !hasSpace
                ? 'Logged in — no CF space targeted'
                : 'CF session active with org and space'}
            </span>
          </div>

          {cfLoggedIn && cfTarget && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: 'API Endpoint', value: cfTarget.apiEndpoint },
                { label: 'User',         value: cfTarget.user },
                { label: 'Org',          value: cfTarget.org   || '(none)' },
                { label: 'Space',        value: cfTarget.space || '(none)' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-surface-3 rounded-lg px-3 py-2">
                  <div className="text-xs text-gray-500">{label}</div>
                  <div className={`font-mono text-xs truncate ${
                    (label === 'Org' || label === 'Space') && value === '(none)'
                      ? 'text-red-400'
                      : 'text-gray-200'
                  }`}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Before first check — neutral prompt */}
      {!showStatus && (
        <div className="card text-sm text-gray-400 space-y-1">
          <p>Click <strong className="text-gray-200">Check Status</strong> to see your current CF login state.</p>
          <p className="text-xs text-gray-500">No automatic checks are run — all actions require your confirmation.</p>
        </div>
      )}

      {/* Not logged in — show login instructions */}
      {showStatus && !cfLoggedIn && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-200">How to log in to CF</h3>
          <p className="text-sm text-gray-400">CF login uses a one-time passcode from your browser:</p>
          <div className="bg-black rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Run in terminal</div>
            <code className="text-sm text-green-400 font-mono">
              cf login -a {cfEndpoint} --sso
            </code>
          </div>
          <ol className="space-y-2 text-sm text-gray-300">
            {[
              'Run the command above in a terminal',
              'A URL will appear — open it in your browser',
              'Log in with your SAP credentials and copy the one-time passcode',
              'Paste the passcode in the terminal when prompted',
              'Select your org and space when asked',
              'Click Check Status below once the terminal shows success',
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-gray-500 font-mono w-4 text-right flex-shrink-0">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Logged in but no org/space — show target options */}
      {showStatus && cfLoggedIn && (!hasOrg || !hasSpace) && (
        <div className="space-y-3">
          <div className="card space-y-4">
            <h3 className="font-semibold text-gray-200 text-sm">Option A — Target org and space</h3>
            <p className="text-sm text-gray-400">
              Enter your CF org and space, then click the button to run{' '}
              <code className="text-gray-300 font-mono">cf target</code> automatically.
            </p>

            {/* Org and space inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  CF Org name
                  <span className="text-gray-600 ml-1 font-normal">
                    (find it in BTP Cockpit → Cloud Foundry Environment)
                  </span>
                </label>
                <input
                  type="text"
                  className="input-field text-sm"
                  value={orgInput}
                  onChange={(e) => { setOrgInput(e.target.value); setTargetError(null); }}
                  placeholder="e.g. 4bd5c287trial"
                  disabled={targeting || polling}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">CF Space</label>
                <input
                  type="text"
                  className="input-field text-sm"
                  value={spaceInput}
                  onChange={(e) => { setSpaceInput(e.target.value); setTargetError(null); }}
                  placeholder="dev"
                  disabled={targeting || polling}
                />
              </div>
            </div>

            {/* Preview of command that will run */}
            <div className="bg-black rounded-lg px-3 py-2 text-xs font-mono">
              <span className="text-gray-500">$ </span>
              <span className={orgInput.trim() ? 'text-green-400' : 'text-gray-600'}>
                cf target -o {orgInput.trim() || '<org>'} -s {spaceInput.trim() || 'dev'}
              </span>
            </div>

            <button
              onClick={() => void handleAutoTarget()}
              disabled={targeting || polling || !orgInput.trim()}
              className="btn-primary text-sm"
            >
              {targeting ? (
                <span className="flex items-center gap-2">
                  <span className="spinner" style={{ width: 12, height: 12 }} /> Targeting...
                </span>
              ) : '▶ Run cf target'}
            </button>

            {targetOutput && (
              <pre className="text-xs font-mono bg-black rounded-lg p-3 text-gray-300 overflow-auto max-h-28 whitespace-pre-wrap">
                {targetOutput}
              </pre>
            )}
            {targetError && (
              <div className="text-xs text-red-400 p-3 bg-red-900/20 rounded-lg whitespace-pre-wrap">
                {targetError}
              </div>
            )}
          </div>

          <ManualGuide
            title={hasOrg ? 'Option B — Enable CF environment (if space missing)' : 'Option B — Enable Cloud Foundry Environment'}
            description="If Option A failed, the CF environment may not be enabled yet — or the org name may differ from your subdomain."
            steps={[
              { text: 'Open BTP Cockpit → your Trial subaccount', bold: true },
              'Click "Cloud Foundry Environment" in the left sidebar',
              'The org name is shown there — copy it exactly',
              'If CF is not yet enabled: click "Enable Cloud Foundry" and confirm',
              'Wait 1–2 minutes, then paste the org name in Option A above',
            ]}
            link={cockpitCfEnableUrl(subaccountId)}
            linkLabel="Open CF Environment in Cockpit"
            defaultOpen={!orgInput.trim()}
            onVerify={() => void handleCheck()}
            verifyLabel="↺ Check for CF Org"
          />
        </div>
      )}

      {/* Logged in + org + space + not yet completed */}
      {showStatus && cfLoggedIn && hasOrg && hasSpace && stepStatus !== 'completed' && (
        <div className="p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-sm text-blue-300">
          CF session active — org <strong>{cfTarget?.org}</strong>, space <strong>{cfTarget?.space}</strong>.
          Click <strong>Verify &amp; Complete</strong> to confirm.
        </div>
      )}

      {stepStatus === 'completed' && (
        <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-700/40 rounded-lg">
          <span className="text-green-400 text-lg">✓</span>
          <span className="text-sm text-green-300">CF login verified. Proceed to Service Setup.</span>
        </div>
      )}

      {verifyError && (
        <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">
          {verifyError}
        </div>
      )}

      {/* Where to find CF endpoint */}
      {showStatus && !cfLoggedIn && (
        <ManualGuide
          title="How to find your CF API Endpoint"
          steps={[
            'Open BTP Cockpit → your Trial subaccount',
            'Click "Cloud Foundry Environment" in the sidebar',
            'Find the "API Endpoint" value',
          ]}
          link={COCKPIT_TRIAL}
          linkLabel="Open BTP Cockpit"
          variant="info"
        />
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void handleCheck()}
          disabled={polling}
          className="btn-secondary text-sm"
        >
          {polling ? (
            <span className="flex items-center gap-2">
              <span className="spinner" style={{ width: 12, height: 12 }} /> Checking...
            </span>
          ) : '↺ Check Status'}
        </button>

        {showStatus && cfLoggedIn && hasOrg && hasSpace && stepStatus !== 'completed' && (
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

        {userHasChecked && !cfLoggedIn && (
          <span className="text-sm text-gray-500">
            Not logged in yet — complete the CF login in your terminal first, then click Check Status.
          </span>
        )}
      </div>
    </div>
  );
}

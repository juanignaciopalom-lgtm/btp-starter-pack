import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { Terminal } from '../components/Terminal';
import { ManualGuide } from '../components/ManualGuide';
import { StatusBadge } from '../components/StatusBadge';
import { StepResetButton } from '../components/StepResetButton';
import { cockpitServiceMarketplaceUrl, cockpitSubaccountUrl } from '../types';
import * as api from '../api';
import type { PreflightResult, PreflightCheck } from '../api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CfApp {
  name: string;
  state: string;
  instances: string;
  memoryUsage: string;
  urls: string;
}

// ── Preflight check row ───────────────────────────────────────────────────────

function CheckRow({ check, onAutofix }: { check: PreflightCheck; onAutofix?: () => void }) {
  const icon =
    check.status === 'ok'      ? <span className="text-green-400 flex-shrink-0 text-base">✓</span>
    : check.status === 'error' ? <span className="text-red-400 flex-shrink-0 text-base">✗</span>
    :                            <span className="text-yellow-400 flex-shrink-0 text-base">⚠</span>;

  return (
    <div className="flex items-start gap-3 py-2 border-b border-surface-3 last:border-0">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-medium ${
          check.status === 'ok' ? 'text-gray-300'
          : check.status === 'error' ? 'text-red-300'
          : 'text-yellow-300'
        }`}>
          {check.label}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{check.message}</div>
        {check.fix && check.status !== 'ok' && !check.autofix && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-xs text-gray-600">Fix:</span>
            <code className="text-xs bg-black/40 text-yellow-300 px-1.5 py-0.5 rounded">{check.fix}</code>
          </div>
        )}
      </div>
      {check.autofix && check.status !== 'ok' && onAutofix && (
        <button
          onClick={onAutofix}
          className="text-xs px-2.5 py-1 rounded border border-sap-blue/50 bg-sap-blue/10 text-sap-blue hover:bg-sap-blue/20 transition-all flex-shrink-0 mt-0.5"
        >
          Install automatically
        </button>
      )}
    </div>
  );
}

// ── App state badge ───────────────────────────────────────────────────────────

function AppStateBadge({ state }: { state: string }) {
  const s = state.toLowerCase();
  if (s.includes('start'))
    return <span className="text-xs px-1.5 py-0.5 rounded bg-green-900/40 border border-green-700/40 text-green-300">● started</span>;
  if (s.includes('stop'))
    return <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700/40 border border-gray-600/40 text-gray-400">● stopped</span>;
  if (s.includes('crash'))
    return <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/40 border border-red-700/40 text-red-300">● crashed</span>;
  return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/40 border border-yellow-700/40 text-yellow-300">● {s}</span>;
}

// ── Main step component ───────────────────────────────────────────────────────

export function Step6Deploy() {
  const {
    workspace,
    config,
    wizard,
    detectedState,
    terminalLines,
    stepRunning,
    setStepStatus,
    setStepRunning,
    appendTerminalLine,
    clearTerminal,
    setActiveJob,
  } = useStore();

  const [projectDir, setProjectDir] = useState('');
  const [error, setError]           = useState<string | null>(null);
  const [verifying, setVerifying]   = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [jobDone, setJobDone]       = useState(false);
  const [showDeploy, setShowDeploy] = useState(false); // expand deploy panel

  // Detected apps (CF)
  const [deployedApps, setDeployedApps]   = useState<CfApp[]>([]);
  const [appsLoading, setAppsLoading]     = useState(false);
  const [appsLoadError, setAppsLoadError] = useState<string | null>(null);

  // Per-app logs
  const [appLogs, setAppLogs]           = useState<Record<string, string[]>>({});
  const [logsLoading, setLogsLoading]   = useState<Record<string, boolean>>({});
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  // Pre-flight state
  const [preflight, setPreflight]               = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [installingMbt, setInstallingMbt]       = useState(false);
  const [installingCfPlugin, setInstallingCfPlugin] = useState(false);

  const stepStatus       = wizard?.steps.find((s) => s.id === 6)?.status ?? 'pending';
  const isRunning        = stepRunning[6] ?? false;
  const lines            = terminalLines[6] ?? [];
  const subaccountId     = config?.subaccountId;
  const detectedProjects = detectedState?.projectDirs ?? [];

  // Project name derived from directory (used for app matching)
  const projectName = projectDir
    ? projectDir.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ''
    : '';

  // Apps matching this project (name starts with projectName)
  const matchingApps = projectName
    ? deployedApps.filter((a) => a.name.startsWith(projectName))
    : deployedApps;

  // ── Load deployed CF apps ───────────────────────────────────────────────────
  const loadDeployedApps = useCallback(async () => {
    setAppsLoading(true);
    setAppsLoadError(null);
    try {
      const result = await api.getCfApps();
      setDeployedApps(result.apps ?? []);
    } catch {
      setAppsLoadError('Could not query CF apps — check your CF session (Step 3).');
      setDeployedApps([]);
    } finally {
      setAppsLoading(false);
    }
  }, []);

  // Load apps on mount
  useEffect(() => {
    void loadDeployedApps();
  }, [loadDeployedApps]);

  // ── Toggle app logs (fetch on first expand) ─────────────────────────────────
  const toggleLogs = useCallback(async (appName: string) => {
    const next = new Set(expandedLogs);
    if (next.has(appName)) {
      next.delete(appName);
      setExpandedLogs(next);
      return;
    }
    next.add(appName);
    setExpandedLogs(next);

    // Fetch only if not already loaded
    if (appLogs[appName]) return;

    setLogsLoading((prev) => ({ ...prev, [appName]: true }));
    try {
      const result = await api.getCfAppLogs(appName);
      setAppLogs((prev) => ({ ...prev, [appName]: result.lines }));
    } catch {
      setAppLogs((prev) => ({ ...prev, [appName]: ['Could not retrieve logs — check your CF session.'] }));
    } finally {
      setLogsLoading((prev) => ({ ...prev, [appName]: false }));
    }
  }, [expandedLogs, appLogs]);

  // ── Preflight runner ────────────────────────────────────────────────────────
  const runPreflight = useCallback(async (dir: string) => {
    if (!workspace) return;
    setPreflightLoading(true);
    try {
      const result = await api.getDeployPreflight(workspace, dir);
      setPreflight(result);
    } catch {
      setPreflight(null);
    } finally {
      setPreflightLoading(false);
    }
  }, [workspace]);

  // Auto-select single project
  useEffect(() => {
    if (!projectDir && detectedProjects.length === 1) {
      const dir = detectedProjects[0];
      const full = dir.startsWith('/') ? dir : `${workspace}/${dir}`;
      setProjectDir(full);
    }
  }, [detectedProjects, projectDir, workspace]);

  // Run preflight only when a directory is selected
  useEffect(() => {
    if (projectDir.trim()) {
      void runPreflight(projectDir);
    } else {
      setPreflight(null);
    }
  }, [projectDir, runPreflight]);

  // ── Project selection ───────────────────────────────────────────────────────
  const handleSelectProject = (dir: string) => {
    const full = dir.startsWith('/') ? dir : `${workspace}/${dir}`;
    setProjectDir(full);
    setError(null);
  };

  // ── Install mbt (auto-fix) ──────────────────────────────────────────────────
  const handleInstallMbt = async () => {
    setInstallingMbt(true);
    clearTerminal(6);
    try {
      const { jobId } = await api.startInstallMbtJob();
      setActiveJob(6, jobId);
      api.openJobStream(
        jobId,
        (line) => appendTerminalLine(6, line),
        async (exitCode) => {
          setInstallingMbt(false);
          if (exitCode === 0) {
            appendTerminalLine(6, '✓ mbt installed successfully');
            await runPreflight(projectDir);
          } else {
            appendTerminalLine(6, '✗ mbt installation failed — try: npm install -g mbt');
          }
        },
        (msg) => { setInstallingMbt(false); appendTerminalLine(6, `✗ ${msg}`); }
      );
    } catch {
      setInstallingMbt(false);
      appendTerminalLine(6, '✗ Could not start install job');
    }
  };

  // ── Install CF multiapps plugin (auto-fix) ─────────────────────────────────
  const handleInstallCfPlugin = async () => {
    setInstallingCfPlugin(true);
    clearTerminal(6);
    try {
      const { jobId } = await api.startInstallCfPluginJob();
      setActiveJob(6, jobId);
      api.openJobStream(
        jobId,
        (line) => appendTerminalLine(6, line),
        async (exitCode) => {
          setInstallingCfPlugin(false);
          if (exitCode === 0) {
            appendTerminalLine(6, '✓ CF multiapps plugin installed successfully');
            await runPreflight(projectDir);
          } else {
            appendTerminalLine(6, '✗ Plugin installation failed — see output above');
          }
        },
        (msg) => { setInstallingCfPlugin(false); appendTerminalLine(6, `✗ ${msg}`); }
      );
    } catch {
      setInstallingCfPlugin(false);
      appendTerminalLine(6, '✗ Could not start CF plugin install job');
    }
  };

  // ── Deploy ──────────────────────────────────────────────────────────────────
  const handleDeploy = async () => {
    const target = projectDir.trim();
    if (!target) { setError('Select a project directory first.'); return; }
    if (preflight && !preflight.ready) { setError('Fix all pre-deploy checks before deploying.'); return; }

    setError(null);
    setVerifyError(null);
    setJobDone(false);
    clearTerminal(6);
    setStepRunning(6, true);
    void setStepStatus(6, 'running');

    try {
      const { jobId } = await api.startDeployJob(workspace, target);
      setActiveJob(6, jobId);

      api.openJobStream(
        jobId,
        (line) => appendTerminalLine(6, line),
        async (exitCode) => {
          setStepRunning(6, false);
          if (exitCode === 0) {
            setJobDone(true);
            void setStepStatus(6, 'pending');
            // Refresh app list after successful deploy
            await loadDeployedApps();
          } else {
            setError('Deploy failed. Check the output above for details.');
            void setStepStatus(6, 'error');
          }
        },
        (msg) => {
          setStepRunning(6, false);
          setError(msg);
          void setStepStatus(6, 'error', { errorMessage: msg });
        }
      );
    } catch (err) {
      setStepRunning(6, false);
      const msg = err instanceof Error ? err.message : 'Failed to start deploy';
      setError(msg);
      void setStepStatus(6, 'error', { errorMessage: msg });
    }
  };

  // ── Verify & Complete ───────────────────────────────────────────────────────
  const handleVerifyAndComplete = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await api.verifyStep(workspace, 6);
      if (result.ok) {
        await setStepStatus(6, 'completed');
      } else {
        setVerifyError(result.details || 'Verification failed — check CF session and deployed apps.');
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Verify failed');
    } finally {
      setVerifying(false);
    }
  };

  // ── Derived state ───────────────────────────────────────────────────────────
  const effectiveTarget   = projectDir.trim() || null;
  const checksReady       = preflight?.ready ?? false;
  const hasDeployedApps   = matchingApps.length > 0 || (projectName === '' && deployedApps.length > 0);
  const appsToShow        = projectName ? matchingApps : deployedApps;

  const hasMbtAutofix = preflight?.checks.some(
    (c) => c.id === 'mbt' && c.autofix && c.status !== 'ok'
  ) ?? false;

  const hasCfPluginAutofix = preflight?.checks.some(
    (c) => c.id === 'cf-plugin' && c.autofix && c.status !== 'ok'
  ) ?? false;

  const deployBlocked =
    !effectiveTarget || !checksReady || isRunning ||
    installingMbt || installingCfPlugin || stepStatus === 'completed';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 mb-1">Deploy to Cloud Foundry</h2>
          <p className="text-gray-400 text-sm">
            Deploy your MTA project to SAP BTP Cloud Foundry. If you already deployed, you can complete this step directly.
          </p>
        </div>
        <StepResetButton
          stepId={6}
          confirmLabel="⚠ Reset deploy status (app remains in CF)?"
          disabled={isRunning}
        />
      </div>

      {/* ── Completed state ── */}
      {stepStatus === 'completed' && (
        <div className="p-4 bg-green-900/20 border border-green-700/40 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-green-400 text-xl">🎉</span>
            <span className="text-green-300 font-semibold">Deployment verified!</span>
          </div>
          <p className="text-sm text-gray-300">
            Your app is live on SAP BTP Cloud Foundry.
          </p>
          <a
            href={subaccountId
              ? `${cockpitSubaccountUrl(subaccountId)}/applications`
              : 'https://account.hanatrial.ondemand.com'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-sap-blue hover:underline"
          >
            ↗ View deployed apps in BTP Cockpit
          </a>
        </div>
      )}

      {stepStatus !== 'completed' && (
        <>
          {/* ── Detected apps panel ── */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">
                Apps currently in Cloud Foundry
              </h3>
              <button
                onClick={() => void loadDeployedApps()}
                disabled={appsLoading}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                {appsLoading ? (
                  <span className="flex items-center gap-1">
                    <span className="spinner" style={{ width: 10, height: 10 }} /> Checking...
                  </span>
                ) : '↺ Refresh'}
              </button>
            </div>

            {appsLoadError && (
              <p className="text-xs text-yellow-500/80">{appsLoadError}</p>
            )}

            {!appsLoading && !appsLoadError && deployedApps.length === 0 && (
              <p className="text-xs text-gray-500">
                No apps found in your CF space. Deploy below to create them.
              </p>
            )}

            {deployedApps.length > 0 && (
              <div className="space-y-2">
                {deployedApps.map((app) => {
                  const isProjectApp = projectName && app.name.startsWith(projectName);
                  const appUrl = app.urls ? `https://${app.urls.split(',')[0]?.trim()}` : null;
                  const isExpanded = expandedLogs.has(app.name);
                  const isLoadingLogs = logsLoading[app.name] ?? false;
                  const logs = appLogs[app.name] ?? [];

                  return (
                    <div
                      key={app.name}
                      className={`rounded border ${
                        isProjectApp ? 'border-sap-blue/25 bg-sap-blue/5' : 'border-surface-3 bg-surface-2/40'
                      }`}
                    >
                      {/* App row */}
                      <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                        <span className={`font-mono text-xs flex-1 min-w-0 truncate ${isProjectApp ? 'text-sap-blue' : 'text-gray-400'}`}>
                          {isProjectApp && <span className="text-sap-blue mr-1">★</span>}
                          {app.name}
                        </span>

                        <AppStateBadge state={app.state} />

                        {app.instances && (
                          <span className="text-xs text-gray-600">{app.instances}</span>
                        )}

                        {/* Open App button */}
                        {appUrl && (
                          <a
                            href={appUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-2 py-0.5 rounded border border-sap-blue/40 bg-sap-blue/10 text-sap-blue hover:bg-sap-blue/20 transition-all flex-shrink-0"
                          >
                            ↗ Open App
                          </a>
                        )}

                        {/* View logs toggle */}
                        <button
                          onClick={() => void toggleLogs(app.name)}
                          className="text-xs px-2 py-0.5 rounded border border-surface-4 bg-surface-3 text-gray-400 hover:text-gray-200 transition-all flex-shrink-0"
                        >
                          {isLoadingLogs ? (
                            <span className="flex items-center gap-1">
                              <span className="spinner" style={{ width: 8, height: 8 }} /> Loading...
                            </span>
                          ) : isExpanded ? '▲ Hide logs' : '📋 Logs'}
                        </button>
                      </div>

                      {/* URL sub-row */}
                      {appUrl && (
                        <div className="px-3 pb-1.5">
                          <span className="text-xs text-gray-600 truncate block">{appUrl}</span>
                        </div>
                      )}

                      {/* Logs panel */}
                      {isExpanded && (
                        <div className="border-t border-surface-3 bg-black/60 rounded-b max-h-64 overflow-y-auto p-3">
                          {isLoadingLogs ? (
                            <p className="text-xs text-gray-500">Fetching logs...</p>
                          ) : logs.length === 0 ? (
                            <p className="text-xs text-gray-500">No log output.</p>
                          ) : (
                            <pre className="text-xs text-gray-400 whitespace-pre-wrap font-mono leading-relaxed">
                              {logs.join('\n')}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {projectName && matchingApps.length === 0 && (
                  <p className="text-xs text-gray-500 pt-1">
                    No apps matching "{projectName}" — other CF apps shown above.
                  </p>
                )}
              </div>
            )}

            {/* Complete with existing deployment */}
            {hasDeployedApps && (
              <div className="pt-2 border-t border-surface-3 flex items-center gap-3">
                <button
                  onClick={() => void handleVerifyAndComplete()}
                  disabled={verifying}
                  className="btn-primary text-sm"
                >
                  {verifying ? (
                    <span className="flex items-center gap-2">
                      <span className="spinner" style={{ width: 12, height: 12 }} /> Completing...
                    </span>
                  ) : '✓ Complete Step with existing deployment'}
                </button>
                <button
                  onClick={() => setShowDeploy((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showDeploy ? '▲ Hide deploy options' : '▼ Re-deploy / deploy new project'}
                </button>
              </div>
            )}

            {!hasDeployedApps && !appsLoading && (
              <div className="pt-2 border-t border-surface-3">
                <button
                  onClick={() => setShowDeploy(true)}
                  className="text-xs text-sap-blue hover:underline"
                >
                  ▼ Show deploy options
                </button>
              </div>
            )}
          </div>

          {/* ── Deploy panel (collapsible) ── */}
          {(showDeploy || !hasDeployedApps) && (
            <>
              {/* Project directory selector */}
              <div className="card space-y-3">
                <label className="block text-sm font-medium text-gray-300">
                  Project directory <span className="text-red-400">*</span>
                  <span className="text-xs font-normal text-gray-500 ml-1">(must contain mta.yaml)</span>
                </label>

                {detectedProjects.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Detected projects:</p>
                    <div className="flex flex-wrap gap-2">
                      {detectedProjects.map((dir) => {
                        const full = dir.startsWith('/') ? dir : `${workspace}/${dir}`;
                        const isSelected = projectDir === full;
                        return (
                          <button
                            key={dir}
                            onClick={() => handleSelectProject(dir)}
                            disabled={isRunning}
                            className={`text-xs px-2 py-1 rounded border transition-all
                              ${isSelected
                                ? 'border-sap-blue bg-sap-blue/10 text-gray-100'
                                : 'border-surface-4 bg-surface-3 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                              }`}
                          >
                            📁 {dir}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {detectedProjects.length === 0 && (
                  <p className="text-xs text-yellow-500/80">
                    No projects detected. Complete Step 5 first, or enter a path manually.
                  </p>
                )}

                <input
                  type="text"
                  className={`input-field ${!projectDir.trim() ? 'border-yellow-600/50 focus:border-yellow-500' : ''}`}
                  value={projectDir}
                  onChange={(e) => { setProjectDir(e.target.value); setError(null); }}
                  placeholder={`${workspace}/my-btp-app`}
                  disabled={isRunning}
                />
              </div>

              {/* Pre-flight checks */}
              <div className="card space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-gray-300">Pre-deploy checks</h3>
                  <div className="flex items-center gap-2">
                    {preflightLoading && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <span className="spinner" style={{ width: 10, height: 10 }} /> Checking...
                      </span>
                    )}
                    {!preflightLoading && preflight && (
                      <button
                        onClick={() => void runPreflight(projectDir)}
                        className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        disabled={isRunning}
                      >
                        ↺ Re-check
                      </button>
                    )}
                  </div>
                </div>

                {!preflight && !preflightLoading && (
                  <p className="text-xs text-gray-500">Select a project directory to run pre-deploy checks.</p>
                )}

                {preflight && (
                  <div>
                    {preflight.checks.map((check) => (
                      <CheckRow
                        key={check.id}
                        check={check}
                        onAutofix={
                          check.id === 'mbt' && hasMbtAutofix && !installingMbt && !installingCfPlugin
                            ? () => void handleInstallMbt()
                          : check.id === 'cf-plugin' && hasCfPluginAutofix && !installingCfPlugin && !installingMbt
                            ? () => void handleInstallCfPlugin()
                          : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                {preflight && !preflight.ready && (
                  <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/30 rounded text-xs text-yellow-300">
                    Resolve all ✗ errors above. The Deploy button will unlock automatically.
                  </div>
                )}

                {preflight?.ready && (
                  <div className="mt-2 p-2 bg-green-900/20 border border-green-700/30 rounded text-xs text-green-300">
                    All checks passed — ready to deploy.
                  </div>
                )}
              </div>

              {/* Terminal output */}
              {lines.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                    {installingMbt ? 'Installing mbt...'
                     : installingCfPlugin ? 'Installing CF multiapps plugin...'
                     : 'Output'}
                  </div>
                  <Terminal lines={lines} minHeight="160px" />
                </div>
              )}

              {/* Deploy command preview */}
              {effectiveTarget && checksReady && (
                <div className="bg-black rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Will run</div>
                  <div className="space-y-1 font-mono text-sm">
                    <div className="text-blue-400"># Step 0 — install npm dependencies</div>
                    <div className="text-green-400">npm install <span className="text-gray-500">(all modules)</span></div>
                    <div className="text-blue-400 mt-2 block"># Step 1 — build MTA archive</div>
                    <div className="text-green-400">cd {effectiveTarget}</div>
                    <div className="text-green-400">mbt build</div>
                    <div className="text-blue-400 mt-2 block"># Step 2 — deploy to Cloud Foundry</div>
                    <div className="text-green-400">cf deploy mta_archives/*.mtar</div>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => void handleDeploy()}
                  disabled={deployBlocked}
                  className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    !effectiveTarget ? 'Select a project directory first'
                    : preflight && !preflight.ready ? 'Fix pre-deploy checks first'
                    : ''
                  }
                >
                  {isRunning ? (
                    <span className="flex items-center gap-2">
                      <span className="spinner" style={{ width: 14, height: 14 }} /> Deploying...
                    </span>
                  ) : hasDeployedApps ? '🔄 Re-deploy to CF' : '🚀 Deploy to CF'}
                </button>

                {jobDone && (
                  <button
                    onClick={() => void handleVerifyAndComplete()}
                    disabled={verifying || isRunning}
                    className="btn-secondary text-sm"
                  >
                    {verifying ? (
                      <span className="flex items-center gap-2">
                        <span className="spinner" style={{ width: 12, height: 12 }} /> Verifying...
                      </span>
                    ) : '✓ Verify & Complete Step'}
                  </button>
                )}

                {stepStatus !== 'pending' && stepStatus !== 'running' && (
                  <StatusBadge status={stepStatus} small />
                )}
              </div>

              {/* Job done notification */}
              {jobDone && (
                <div className="p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-sm text-blue-300">
                  Deploy finished. Click <strong>Verify &amp; Complete Step</strong> to confirm your apps are running.
                </div>
              )}
            </>
          )}

          {/* Errors */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">
              {error}
            </div>
          )}
          {verifyError && (
            <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">
              {verifyError}
            </div>
          )}
        </>
      )}

      {/* Manual guides (only shown when relevant) */}
      {hasMbtAutofix && (
        <ManualGuide
          title="mbt not installed"
          steps={[
            { text: 'Click "Install automatically" in the pre-deploy checks above — mbt will be installed automatically.', bold: true },
            'Alternatively, open a terminal and run: npm install -g mbt',
            'After the install finishes, click "↺ Re-check"',
          ]}
          link="https://sap.github.io/cloud-mta-build-tool/"
          linkLabel="MBT Documentation"
          variant="warning"
        />
      )}

      <div className="space-y-3">
        <ManualGuide
          title="Deploy failed: service binding errors"
          description="If cf deploy fails with service errors, verify all required services exist in your CF space."
          steps={[
            'Run: cf services — check all required services exist',
            'If missing, go back to Step 4 and run setup again',
            'Verify mta.yaml uses the correct service instance names',
            'Click "↺ Re-check" above, then retry deployment',
          ]}
          link={cockpitServiceMarketplaceUrl(subaccountId)}
          linkLabel="Service Marketplace"
          variant="warning"
        />

        <ManualGuide
          title="Deploy failed: CF session expired"
          description="CF sessions expire after a few hours. If cf deploy fails with an auth error, re-authenticate."
          steps={[
            'Go back to Step 3',
            'Click "Check Status" — it will detect the expired session',
            'Follow the CF login steps again',
            'Return here and retry deployment',
          ]}
          link={cockpitServiceMarketplaceUrl(subaccountId)}
          linkLabel="BTP Cockpit"
          variant="warning"
        />
      </div>
    </div>
  );
}

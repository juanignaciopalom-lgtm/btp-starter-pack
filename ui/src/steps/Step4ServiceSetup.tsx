import { useState } from 'react';
import { useStore } from '../store';
import { Terminal } from '../components/Terminal';
import { ManualGuide } from '../components/ManualGuide';
import { StatusBadge } from '../components/StatusBadge';
import { StepResetButton } from '../components/StepResetButton';
import { cockpitEntitlementsUrl, cockpitServiceMarketplaceUrl, COCKPIT_TRIAL } from '../types';
import * as api from '../api';

interface ServiceCheck {
  name: string;
  instanceName: string;
  exists: boolean | null;
}

const EXPECTED_SERVICES: ServiceCheck[] = [
  { name: 'XSUAA (Authorization)',    instanceName: 'xsuaa-instance',            exists: null },
  { name: 'Destination Service',       instanceName: 'destination-instance',      exists: null },
  { name: 'HTML5 Apps Repository',     instanceName: 'html5-apps-repo-instance',  exists: null },
  { name: 'Application Logging',       instanceName: 'application-logs-instance', exists: null },
];

export function Step4ServiceSetup() {
  const {
    workspace, config, wizard, detectedState,
    terminalLines, stepRunning,
    setStepStatus, setStepRunning, appendTerminalLine, clearTerminal, setActiveJob,
  } = useStore();

  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceCheck[]>(
    // Pre-populate from detectedState for display only — NOT for auto-completion
    EXPECTED_SERVICES.map((svc) => ({
      ...svc,
      exists: detectedState?.serviceInstances
        ? detectedState.serviceInstances.includes(svc.instanceName)
        : null,
    }))
  );

  const stepStatus = wizard?.steps.find((s) => s.id === 4)?.status ?? 'pending';
  const isRunning = stepRunning[4] ?? false;
  const lines = terminalLines[4] ?? [];
  const subaccountId = config?.subaccountId;

  // No auto-completion useEffect — user must click Verify & Complete

  const handleVerifyServices = async (): Promise<boolean> => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await api.verifyStep(workspace, 4);
      const verifyData = result as { existingNames?: string[] };
      if (verifyData.existingNames) {
        setServices(EXPECTED_SERVICES.map((svc) => ({
          ...svc,
          exists: (verifyData.existingNames ?? []).includes(svc.instanceName),
        })));
      }
      if (!result.ok) {
        setVerifyError(result.details || 'Some required service instances are missing.');
      }
      return result.ok;
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Verify failed');
      return false;
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyAndComplete = async () => {
    const ok = await handleVerifyServices();
    if (ok) {
      await setStepStatus(4, 'completed');
    }
  };

  const handleRun = async () => {
    setError(null);
    setVerifyError(null);
    clearTerminal(4);
    setStepRunning(4, true);
    void setStepStatus(4, 'running');

    try {
      const { jobId } = await api.startSetupJob(workspace);
      setActiveJob(4, jobId);

      api.openJobStream(
        jobId,
        (line) => appendTerminalLine(4, line),
        async (exitCode) => {
          setStepRunning(4, false);
          if (exitCode === 0) {
            // Refresh service list after run — but user must still click Verify & Complete
            await handleVerifyServices();
          } else {
            setError('Setup completed with errors. Check output above.');
            void setStepStatus(4, 'error', { errorMessage: 'Exit code ' + exitCode });
          }
        },
        (msg) => {
          setStepRunning(4, false);
          setError(msg);
          void setStepStatus(4, 'error', { errorMessage: msg });
        }
      );
    } catch (err) {
      setStepRunning(4, false);
      const msg = err instanceof Error ? err.message : 'Failed to start setup';
      setError(msg);
      void setStepStatus(4, 'error', { errorMessage: msg });
    }
  };

  const checkedCount  = services.filter((s) => s.exists !== null).length;
  const existingCount = services.filter((s) => s.exists === true).length;
  const allExist      = checkedCount > 0 && existingCount === services.length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-100 mb-1">Service Setup</h2>
          <p className="text-gray-400 text-sm">
            Creates CF service instances needed for your BTP app. Existing instances are skipped automatically.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StepResetButton
            stepId={4}
            confirmLabel="⚠ Reset wizard status only?"
            disabled={isRunning}
          />
          {stepStatus !== 'pending' && (
            <div className="text-right text-xs text-gray-600 max-w-xs leading-relaxed">
              Reset sólo borra el estado del wizard.{' '}
              <span className="text-yellow-600 font-semibold">No elimina los servicios en CF.</span>
            </div>
          )}
        </div>
      </div>

      {/* Note: reset does NOT delete CF services */}
      {stepStatus !== 'pending' && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1 select-none w-fit">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            ¿Cómo eliminar los servicios de CF manualmente?
          </summary>
          <div className="mt-2 p-3 bg-yellow-900/10 border border-yellow-700/20 rounded-lg text-xs text-gray-400 space-y-1.5">
            <p className="text-yellow-400 font-semibold text-xs mb-2">
              ⚠ Eliminar servicios de CF es irreversible. Hacelo solo si estás seguro.
            </p>
            <p className="text-gray-500 mb-2">Comandos para eliminar cada instancia desde tu terminal:</p>
            {EXPECTED_SERVICES.map((svc) => (
              <div key={svc.instanceName} className="font-mono bg-surface-3 rounded px-2 py-1 text-gray-400 select-all">
                cf delete-service {svc.instanceName} -f
              </div>
            ))}
            <p className="text-gray-600 mt-2">
              Después de eliminarlos, hacé click en "↺ Reset step" para limpiar el estado y volver a crear los servicios.
            </p>
          </div>
        </details>
      )}


      {/* Service status table */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-300 text-sm">CF Service Instances</h3>
          <button
            onClick={() => void handleVerifyServices()}
            disabled={verifying || isRunning}
            className="btn-ghost text-xs py-1 px-2 flex items-center gap-1"
          >
            {verifying
              ? <><span className="spinner" style={{ width: 10, height: 10 }} /> Checking...</>
              : '↺ Verify services'}
          </button>
        </div>

        {services.map((svc) => (
          <div key={svc.instanceName} className="flex items-center gap-3 text-sm">
            <span className={`text-base flex-shrink-0 ${
              svc.exists === null ? 'text-gray-600' :
              svc.exists ? 'text-green-400' : 'text-red-400'
            }`}>
              {svc.exists === null ? '○' : svc.exists ? '✓' : '✗'}
            </span>
            <span className="text-gray-300 font-medium flex-1">{svc.name}</span>
            <span className="text-xs font-mono text-gray-600">{svc.instanceName}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              svc.exists === null ? 'bg-surface-3 text-gray-500' :
              svc.exists ? 'bg-green-900/30 text-green-400' : 'bg-red-900/20 text-red-400'
            }`}>
              {svc.exists === null ? 'not checked' : svc.exists ? 'exists' : 'missing'}
            </span>
          </div>
        ))}

        {allExist && (
          <div className="mt-2 flex items-center gap-2 p-2 bg-green-900/20 border border-green-700/30 rounded-lg">
            <span className="text-green-400">✓</span>
            <span className="text-sm text-green-300">All service instances exist.</span>
          </div>
        )}
      </div>

      {/* Run + Verify buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void handleRun()}
          disabled={isRunning || stepStatus === 'completed'}
          className="btn-primary"
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <span className="spinner" style={{ width: 14, height: 14 }} /> Running setup...
            </span>
          ) : '▶ Run Service Setup'}
        </button>

        {checkedCount > 0 && stepStatus !== 'completed' && (
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

      {lines.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Output</div>
          <Terminal lines={lines} />
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">{error}</div>
      )}
      {verifyError && (
        <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">{verifyError}</div>
      )}

      {stepStatus === 'completed' && (
        <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-700/40 rounded-lg">
          <span className="text-green-400 text-lg">✓</span>
          <span className="text-sm text-green-300">Services verified. Proceed to Generate Project.</span>
        </div>
      )}

      <div className="space-y-3">
        <ManualGuide
          title="Service not in marketplace — Missing Entitlement"
          steps={[
            { text: 'Open BTP Cockpit → your subaccount', bold: true },
            'Click "Entitlements" → "Configure Entitlements" → "Add Service Plans"',
            'Search for the missing service and add it',
            'Click "Save", then re-run setup',
          ]}
          link={cockpitEntitlementsUrl(subaccountId)}
          linkLabel="Open Entitlements"
          variant="warning"
        />
        <ManualGuide
          title="CF org/space not found"
          steps={[
            'Go back to Step 3 (CF Login) and verify org + space are set',
            'If org is empty, enable CF from BTP Cockpit first',
          ]}
          link={COCKPIT_TRIAL}
          linkLabel="Open BTP Cockpit"
          variant="warning"
        />
        <ManualGuide
          title="Subscribe to Business Application Studio"
          steps={[
            { text: 'Open BTP Cockpit → Service Marketplace', bold: true },
            'Search "SAP Business Application Studio" → Create (free plan)',
            'Security → Users → your email → assign "Business_Application_Studio_Developer"',
          ]}
          link={cockpitServiceMarketplaceUrl(subaccountId, 'business-application-studio')}
          linkLabel="Open Service Marketplace"
          variant="info"
        />
      </div>
    </div>
  );
}

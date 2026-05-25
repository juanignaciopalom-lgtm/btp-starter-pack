import { useState } from 'react';
import { useStore } from '../store';
import { Terminal } from '../components/Terminal';
import { StatusBadge } from '../components/StatusBadge';
import { StepResetButton } from '../components/StepResetButton';
import * as api from '../api';

const PROJECT_TYPES = [
  {
    value: 'cap-ui5-approuter',
    label: 'CAP + UI5 + AppRouter',
    desc: 'Full stack: CAP backend, SAPUI5 frontend, AppRouter with XSUAA auth. Best for production.',
  },
  {
    value: 'cap-ui5',
    label: 'CAP + UI5',
    desc: 'Backend + frontend without AppRouter. Simpler, no XSUAA in local dev.',
  },
  {
    value: 'cap-only',
    label: 'CAP only',
    desc: 'Pure backend: OData service with CDS schema. No UI.',
  },
  {
    value: 'ui5-only',
    label: 'UI5 only',
    desc: 'Pure frontend: SAPUI5 app. No CAP backend.',
  },
] as const;

type ProjectType = (typeof PROJECT_TYPES)[number]['value'];

function sanitizeName(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
}

function inferNamespace(name: string) {
  return `com.example.${name.replace(/-/g, '')}`;
}

export function Step5GenerateProject() {
  const {
    workspace,
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

  const [name, setName] = useState('my-btp-app');
  const [type, setType] = useState<ProjectType>('cap-ui5-approuter');
  const [namespace, setNamespace] = useState('com.example.mybtpapp');
  const [nameError, setNameError] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [jobDone, setJobDone] = useState(false);

  const stepStatus = wizard?.steps.find((s) => s.id === 5)?.status ?? 'pending';
  const isRunning = stepRunning[5] ?? false;
  const lines = terminalLines[5] ?? [];

  const detectedProjects = detectedState?.projectDirs ?? [];

  const handleNameChange = (v: string) => {
    const clean = sanitizeName(v);
    setName(clean);
    setNamespace(inferNamespace(clean));
    if (!/^[a-z][a-z0-9-]{1,49}$/.test(clean)) {
      setNameError('Must start with a letter, only lowercase letters, numbers and hyphens, 2–50 chars');
    } else {
      setNameError('');
    }
  };

  const handleGenerate = async () => {
    if (nameError || !name) return;

    setError(null);
    setVerifyError(null);
    setJobDone(false);
    clearTerminal(5);
    setStepRunning(5, true);
    void setStepStatus(5, 'running');

    try {
      const { jobId } = await api.startGenerateJob(
        workspace,
        name,
        type,
        type !== 'cap-only' ? namespace : undefined
      );
      setActiveJob(5, jobId);

      api.openJobStream(
        jobId,
        (line) => appendTerminalLine(5, line),
        (exitCode) => {
          setStepRunning(5, false);
          if (exitCode === 0) {
            setJobDone(true);
            // Do NOT auto-complete — user must click Verify & Complete
            void setStepStatus(5, 'pending');
          } else {
            setError('Generation failed. Check the output above for details.');
            void setStepStatus(5, 'error');
          }
        },
        (msg) => {
          setStepRunning(5, false);
          setError(msg);
          void setStepStatus(5, 'error', { errorMessage: msg });
        }
      );
    } catch (err) {
      setStepRunning(5, false);
      const msg = err instanceof Error ? err.message : 'Failed to start generation';
      setError(msg);
      void setStepStatus(5, 'error', { errorMessage: msg });
    }
  };

  const handleVerifyAndComplete = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await api.verifyStep(workspace, 5);
      if (result.ok) {
        await setStepStatus(5, 'completed');
      } else {
        setVerifyError(result.details || 'No project with mta.yaml found in the workspace.');
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
          <h2 className="text-2xl font-bold text-gray-100 mb-1">Generate Project</h2>
          <p className="text-gray-400 text-sm">
            Scaffold a complete SAP BTP project ready for development in Business Application Studio.
          </p>
        </div>
        <StepResetButton
          stepId={5}
          confirmLabel="⚠ Delete generated project folder?"
          disabled={isRunning}
        />
      </div>

      {/* Detected projects (for reference / reset target) */}
      {detectedProjects.length > 0 && (
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold text-gray-300">Detected projects in workspace</h3>
          <div className="flex flex-wrap gap-2">
            {detectedProjects.map((dir) => (
              <span
                key={dir}
                className="text-xs px-2 py-1 rounded border border-surface-4 bg-surface-3 text-gray-400"
              >
                📁 {dir}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            These folders contain a <code>mta.yaml</code>. Use the Reset button to remove one before regenerating.
          </p>
        </div>
      )}

      {/* Form */}
      <div className="card space-y-5">
        {/* Project name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1.5">
            Project name
          </label>
          <input
            type="text"
            className="input-field"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="my-btp-app"
            disabled={isRunning}
          />
          {nameError ? (
            <p className="text-xs text-red-400 mt-1">{nameError}</p>
          ) : (
            <p className="text-xs text-gray-500 mt-1">
              Lowercase letters, numbers and hyphens. Will be used as the CF app name.
            </p>
          )}
        </div>

        {/* Project type */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Project type
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {PROJECT_TYPES.map((pt) => (
              <button
                key={pt.value}
                onClick={() => setType(pt.value)}
                disabled={isRunning}
                className={`
                  text-left p-3 rounded-lg border transition-all duration-150
                  ${type === pt.value
                    ? 'border-sap-blue bg-sap-blue/10 text-gray-100'
                    : 'border-surface-4 bg-surface-3 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                  }
                `}
              >
                <div className="font-semibold text-sm mb-1">{pt.label}</div>
                <div className="text-xs leading-relaxed opacity-80">{pt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* UI5 Namespace (only for types with UI) */}
        {type !== 'cap-only' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              UI5 namespace
            </label>
            <input
              type="text"
              className="input-field"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder="com.example.myapp"
              disabled={isRunning}
            />
            <p className="text-xs text-gray-500 mt-1">
              Used in SAPUI5 manifest and component. E.g. <code className="text-gray-400">com.yourcompany.appname</code>
            </p>
          </div>
        )}

        {/* Preview */}
        <div className="bg-surface-3 rounded-lg p-3 text-xs font-mono text-gray-400">
          <div className="text-gray-500 mb-1">Will generate:</div>
          <div className="text-gray-200">{workspace}/{name}/</div>
          {(type === 'cap-only' || type.startsWith('cap')) && (
            <>
              <div className="pl-4 text-gray-400">├── db/schema.cds</div>
              <div className="pl-4 text-gray-400">├── srv/cat-service.cds</div>
              <div className="pl-4 text-gray-400">├── srv/server.js</div>
            </>
          )}
          {type !== 'cap-only' && (
            <div className="pl-4 text-gray-400">├── app/{name}/  (SAPUI5)</div>
          )}
          {type === 'cap-ui5-approuter' && (
            <div className="pl-4 text-gray-400">├── approuter/</div>
          )}
          <div className="pl-4 text-gray-400">├── mta.yaml</div>
          <div className="pl-4 text-gray-400">└── README.md</div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void handleGenerate()}
          disabled={isRunning || !!nameError || !name || stepStatus === 'completed'}
          className="btn-primary"
        >
          {isRunning ? (
            <span className="flex items-center gap-2">
              <span className="spinner" style={{ width: 14, height: 14 }} /> Generating...
            </span>
          ) : '▶ Generate Project'}
        </button>

        {(jobDone || detectedProjects.length > 0) && stepStatus !== 'completed' && (
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

      {/* Terminal */}
      {lines.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Output</div>
          <Terminal lines={lines} />
        </div>
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

      {/* Job completed but not yet verified */}
      {jobDone && stepStatus !== 'completed' && (
        <div className="p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-sm text-blue-300">
          Project generated at <code className="font-mono">{workspace}/{name}/</code>.
          Click <strong>Verify &amp; Complete Step</strong> to confirm and unlock Deploy.
        </div>
      )}

      {/* Completed */}
      {stepStatus === 'completed' && (
        <div className="p-4 bg-green-900/20 border border-green-700/40 rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-green-400 text-xl">✓</span>
            <span className="text-green-300 font-semibold">Project verified. Proceed to Deploy.</span>
          </div>
          <div className="text-sm text-gray-300 space-y-1">
            <p className="font-semibold text-gray-200">Next steps:</p>
            <ol className="space-y-1 text-gray-400">
              <li>1. Open Business Application Studio (BAS)</li>
              <li>2. Import or upload the project folder</li>
              <li>3. Run <code className="text-gray-300 font-mono">npm install</code> in the root and <code className="text-gray-300 font-mono">srv/</code> folders</li>
              <li>4. Run <code className="text-gray-300 font-mono">cds watch</code> for local development</li>
              <li>5. Continue to Step 6 to deploy to CF</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

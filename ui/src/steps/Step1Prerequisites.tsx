import { useState } from 'react';
import { useStore } from '../store';
import { StatusBadge } from '../components/StatusBadge';
import { StepResetButton } from '../components/StepResetButton';
import { ManualGuide } from '../components/ManualGuide';
import type { DoctorCheck, BTPRegion } from '../types';
import { BTP_REGIONS, REGION_LABELS, COCKPIT_TRIAL } from '../types';
import * as api from '../api';

// ── Phase A: Workspace Init Form ──────────────────────────────────────────────

interface InitFormData {
  email: string;
  region: BTPRegion;
  globalAccountSubdomain: string;
  cfSpace: string;
}

function WorkspaceInitForm({ onDone }: { onDone: () => void }) {
  const { workspace, refreshConfig } = useStore();

  const [form, setForm] = useState<InitFormData>({
    email: '',
    region: 'eu10',
    globalAccountSubdomain: '',
    cfSpace: 'dev',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (field: keyof InitFormData, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      await api.initWorkspace({
        workspace,
        email: form.email.trim(),
        region: form.region,
        globalAccountSubdomain: form.globalAccountSubdomain.trim(),
        cfSpace: form.cfSpace.trim() || 'dev',
      });
      await refreshConfig();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize workspace');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-100 mb-1">Workspace Setup</h2>
        <p className="text-gray-400 text-sm">
          No config found. Fill in your BTP Trial details to get started.
          This creates a local <code className="text-sap-blue bg-surface-3 px-1 rounded">.btp-starter.json</code> — no data leaves your machine.
        </p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-200 text-sm">Your SAP BTP Account</h3>

          <div className="space-y-1">
            <label className="text-xs text-gray-400 uppercase tracking-wider">SAP BTP Email</label>
            <input
              type="email" required
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-sap-blue focus:ring-1 focus:ring-sap-blue"
            />
            <p className="text-xs text-gray-500">The email you used to register for SAP BTP Trial.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400 uppercase tracking-wider">Region</label>
            <select
              required value={form.region}
              onChange={(e) => setField('region', e.target.value)}
              className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-gray-100
                         focus:outline-none focus:border-sap-blue focus:ring-1 focus:ring-sap-blue"
            >
              {BTP_REGIONS.map((r) => (
                <option key={r} value={r}>{REGION_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="card space-y-4">
          <h3 className="font-semibold text-gray-200 text-sm">Global Account Details</h3>

          <div className="space-y-1">
            <label className="text-xs text-gray-400 uppercase tracking-wider">Global Account Subdomain</label>
            <input
              type="text" required
              value={form.globalAccountSubdomain}
              onChange={(e) => setField('globalAccountSubdomain', e.target.value.trim())}
              placeholder="e.g. 4bd5c287trial"
              className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-sap-blue focus:ring-1 focus:ring-sap-blue"
            />
            <p className="text-xs text-gray-500">
              Found in BTP Cockpit → Global Account → Details → "Subdomain". This is also used as the CF org name.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-400 uppercase tracking-wider">CF Space Name</label>
            <input
              type="text"
              value={form.cfSpace}
              onChange={(e) => setField('cfSpace', e.target.value)}
              placeholder="dev"
              className="w-full bg-surface-3 border border-surface-4 rounded-lg px-3 py-2 text-sm text-gray-100
                         placeholder-gray-600 focus:outline-none focus:border-sap-blue focus:ring-1 focus:ring-sap-blue"
            />
            <p className="text-xs text-gray-500">CF space where services will be created. Default: <code>dev</code>.</p>
          </div>
        </div>

        <ManualGuide
          title="Where do I find my Global Account Subdomain?"
          steps={[
            { text: 'Open SAP BTP Cockpit', bold: true },
            'Click your global account name in the top header (usually "Trial")',
            'Look at the details panel on the right side',
            'Copy the value under "Subdomain" (e.g. 4bd5c287trial)',
            'Paste it in the field above — this is also used as the CF org name',
          ]}
          link={COCKPIT_TRIAL}
          linkLabel="Open BTP Cockpit"
          variant="info"
        />

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !form.email || !form.globalAccountSubdomain}
          className="btn-primary w-full py-3"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="spinner" style={{ width: 14, height: 14 }} /> Initializing workspace...
            </span>
          ) : '✓ Initialize Workspace'}
        </button>
      </form>
    </div>
  );
}

// ── Phase B: Prerequisites check + verify ────────────────────────────────────

function PrerequisitesCheck() {
  const { doctor, doctorLoading, refreshDoctor, setStepStatus, wizard, workspace } = useStore();
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const stepStatus = wizard?.steps.find((s) => s.id === 1)?.status ?? 'pending';
  const allOk = doctor?.allOk ?? false;

  const handleVerifyAndComplete = async () => {
    setVerifying(true);
    setVerifyError(null);
    try {
      // Re-run doctor checks
      await refreshDoctor();
      const result = await api.verifyStep(workspace, 1);
      if (result.ok && allOk) {
        await setStepStatus(1, 'completed');
      } else {
        setVerifyError(result.details || 'Verification failed — check the tool list above.');
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
          <h2 className="text-2xl font-bold text-gray-100 mb-1">Prerequisites</h2>
          <p className="text-gray-400 text-sm">
            Verify that all required CLI tools are installed and accessible in your PATH.
          </p>
        </div>
        <StepResetButton
          stepId={1}
          confirmLabel="⚠ Delete config & reset?"
          disabled={stepStatus === 'running'}
        />
      </div>

      <div className="card space-y-3">
        {doctorLoading && !doctor && (
          <div className="flex items-center gap-3 text-gray-400">
            <span className="spinner" style={{ width: 16, height: 16 }} />
            <span className="text-sm">Checking tools...</span>
          </div>
        )}

        {doctor?.checks.map((check: DoctorCheck) => (
          <div
            key={check.name}
            className={`flex items-start gap-3 p-3 rounded-lg border
              ${check.ok
                ? 'bg-green-900/10 border-green-800/40'
                : 'bg-red-900/10 border-red-800/40'
              }`}
          >
            <span className={`mt-0.5 text-lg flex-shrink-0 ${check.ok ? 'text-green-400' : 'text-red-400'}`}>
              {check.ok ? '✓' : '✗'}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`font-semibold text-sm ${check.ok ? 'text-gray-100' : 'text-red-300'}`}>
                  {check.name}
                </span>
                {check.version && (
                  <span className="text-xs text-gray-500 font-mono">{check.version}</span>
                )}
              </div>
              {!check.ok && check.hint && (
                <p className="text-xs text-gray-400 mt-1">{check.hint}</p>
              )}
              {!check.ok && check.link && (
                <a href={check.link} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-sap-blue hover:underline mt-1 inline-block">
                  ↗ Download / Install
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => void refreshDoctor()}
          disabled={doctorLoading}
          className="btn-secondary text-sm"
        >
          {doctorLoading ? (
            <span className="flex items-center gap-2">
              <span className="spinner" style={{ width: 12, height: 12 }} /> Checking...
            </span>
          ) : '↺ Re-check tools'}
        </button>

        {allOk && stepStatus !== 'completed' && (
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

        {stepStatus === 'completed' && (
          <div className="flex items-center gap-2">
            <StatusBadge status="completed" small />
            <span className="text-sm text-green-300">All tools ready. Proceed to BTP Login.</span>
          </div>
        )}
      </div>

      {verifyError && (
        <div className="p-3 bg-red-900/20 border border-red-700/40 rounded-lg text-sm text-red-300">
          {verifyError}
        </div>
      )}
    </div>
  );
}

// ── Step 1 — entry point ──────────────────────────────────────────────────────

export function Step1Prerequisites() {
  const { config, configLoading } = useStore();
  const [initDone, setInitDone] = useState(false);

  if (configLoading && config === null) {
    return (
      <div className="flex items-center gap-3 text-gray-400">
        <span className="spinner" style={{ width: 20, height: 20 }} />
        <span>Loading workspace...</span>
      </div>
    );
  }

  if (!config && !initDone) {
    return <WorkspaceInitForm onDone={() => setInitDone(true)} />;
  }

  return <PrerequisitesCheck />;
}

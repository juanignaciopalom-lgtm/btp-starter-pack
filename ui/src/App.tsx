import React, { useEffect } from 'react';
import { useStore } from './store';
import { ProgressSidebar } from './components/ProgressSidebar';
import { Step1Prerequisites } from './steps/Step1Prerequisites';
import { Step2BtpLogin } from './steps/Step2BtpLogin';
import { Step3CfLogin } from './steps/Step3CfLogin';
import { Step4ServiceSetup } from './steps/Step4ServiceSetup';
import { Step5GenerateProject } from './steps/Step5GenerateProject';
import { Step6Deploy } from './steps/Step6Deploy';

const STEPS: Record<number, React.ComponentType> = {
  1: Step1Prerequisites,
  2: Step2BtpLogin,
  3: Step3CfLogin,
  4: Step4ServiceSetup,
  5: Step5GenerateProject,
  6: Step6Deploy,
};

export function App() {
  const { wizard, wizardLoading, init, goToStep } = useStore();

  useEffect(() => {
    void init();
  }, [init]);

  const currentStep = wizard?.currentStep ?? 1;
  const steps = wizard?.steps ?? [];
  const totalSteps = wizard?.totalSteps ?? 6;

  const StepComponent = STEPS[currentStep];

  const currentStepState = steps.find((s) => s.id === currentStep);
  const currentStatus = currentStepState?.status ?? 'pending';

  // "Next →" only enabled when the current step is explicitly completed.
  // No skip — every step must be verified before proceeding.
  const stepIsDone = currentStatus === 'completed';
  const canGoNext = currentStep < totalSteps && stepIsDone;

  return (
    <div className="flex h-full min-h-screen bg-surface-1">
      {/* Sidebar */}
      <ProgressSidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top bar */}
        <header className="flex-shrink-0 h-14 bg-surface-2 border-b border-surface-3 flex items-center px-6 gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>Step {currentStep} of {totalSteps}</span>
            <span className="text-surface-4">•</span>
            <span className="text-gray-300 font-medium">
              {wizard?.stepNames?.[currentStep] ?? ''}
            </span>
          </div>
          <div className="flex-1" />
          <span className="text-xs text-gray-600 font-mono truncate max-w-xs">
            {useStore.getState().workspace}
          </span>
        </header>

        {/* Step content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {wizardLoading && !wizard ? (
              <div className="flex items-center gap-3 text-gray-400">
                <span className="spinner" style={{ width: 20, height: 20 }} />
                <span>Loading wizard...</span>
              </div>
            ) : !StepComponent ? (
              <div className="text-gray-400">Unknown step</div>
            ) : (
              <StepComponent />
            )}
          </div>
        </main>

        {/* Bottom navigation */}
        <footer className="flex-shrink-0 bg-surface-2 border-t border-surface-3 px-6 py-3 flex items-center justify-between">
          <button
            onClick={() => currentStep > 1 && goToStep(currentStep - 1)}
            disabled={currentStep <= 1}
            className="btn-secondary text-sm py-2 px-4 disabled:opacity-30"
          >
            ← Back
          </button>

          {/* Progress bar */}
          <div className="flex-1 mx-6">
            <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-sap-blue rounded-full transition-all duration-500"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => canGoNext && goToStep(currentStep + 1)}
              disabled={!canGoNext}
              className="btn-primary text-sm py-2 px-5 disabled:opacity-30"
              title={!canGoNext ? 'Complete this step first to continue' : ''}
            >
              {currentStep === totalSteps ? 'Finish 🎉' : 'Next →'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

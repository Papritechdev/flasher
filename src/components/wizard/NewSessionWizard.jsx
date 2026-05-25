import { useSessionStore } from '../../store/sessionStore';
import { STEPS, STEP_LABELS } from '../../config';
import SetupStep  from './SetupStep';
import FlashStep  from './FlashStep';
import BleStep    from './BleStep';
import RunStep    from './RunStep';
import ResultStep from './ResultStep';

const STEP_COMPONENTS = {
  setup:  SetupStep,
  flash:  FlashStep,
  ble:    BleStep,
  run:    RunStep,
  result: ResultStep,
};

export default function NewSessionWizard({ sessionId, onClose }) {
  const session = useSessionStore((s) => s.sessions[sessionId]);
  if (!session) return null;

  const currentStep = session.step;
  const currentIdx  = STEPS.indexOf(currentStep);

  const StepComponent = STEP_COMPONENTS[currentStep] ?? SetupStep;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">New Test Session</p>
            {session.batch && (
              <p className="text-sm text-slate-300 mt-0.5">
                {session.batch}
              </p>
            )}
          </div>
          <button
            className="text-slate-400 hover:text-slate-100 text-xl leading-none focus:outline-none"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Step progress */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-0">
            {STEPS.map((step, idx) => {
              const done    = idx < currentIdx;
              const active  = idx === currentIdx;
              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border ${
                        done   ? 'bg-green-700 border-green-600 text-green-200'
                        : active ? 'bg-blue-700 border-blue-500 text-blue-100'
                        : 'bg-slate-800 border-slate-600 text-slate-500'
                      }`}
                    >
                      {done ? '✓' : idx + 1}
                    </div>
                    <span className={`text-[10px] mt-0.5 ${active ? 'text-blue-400' : done ? 'text-green-500' : 'text-slate-600'}`}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={`flex-1 h-px mx-1 mb-4 ${done ? 'bg-green-700' : 'bg-slate-700'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <StepComponent sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}

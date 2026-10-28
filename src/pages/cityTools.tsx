export type CityTool = 'place' | 'select' | 'paste' | 'delete' | 'eyedropper' | 'pass' | 'zoom';

interface ToolButton {
  id: CityTool | 'copy' | 'cut' | 'undo';
  label: string;
  action?: boolean;
}

const TOOLS: ToolButton[] = [
  { id: 'place', label: 'Place' },
  { id: 'select', label: 'Select' },
  { id: 'copy', label: 'Copy', action: true },
  { id: 'cut', label: 'Cut', action: true },
  { id: 'paste', label: 'Paste' },
  { id: 'delete', label: 'Delete' },
  { id: 'eyedropper', label: 'Eyedropper' },
  { id: 'pass', label: 'Passability' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'undo', label: 'Undo', action: true },
];

function ToolIcon({ id }: { id: ToolButton['id'] }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (id === 'place') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <path {...common} d="M3 13l3.2-.8L13 5.4 10.6 3 3.8 9.8 3 13z" />
        <path {...common} d="M9.4 4.2l2.4 2.4" />
      </svg>
    );
  }
  if (id === 'select') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <path {...common} strokeDasharray="2 1.5" d="M3 3h10v10H3z" />
      </svg>
    );
  }
  if (id === 'copy') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <rect {...common} x="5" y="5" width="8" height="8" />
        <path {...common} d="M3 11V3h8" />
      </svg>
    );
  }
  if (id === 'cut') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <circle {...common} cx="4" cy="5" r="1.6" />
        <circle {...common} cx="4" cy="11" r="1.6" />
        <path {...common} d="M5.4 6.2L13 12M5.4 9.8L13 4" />
      </svg>
    );
  }
  if (id === 'paste') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <rect {...common} x="4" y="3" width="8" height="11" />
        <path {...common} d="M6 3V2h4v1" />
      </svg>
    );
  }
  if (id === 'delete') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <path {...common} d="M4 12l8-8M3 8l5 5 6-8" />
      </svg>
    );
  }
  if (id === 'eyedropper') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <path {...common} d="M10 2l4 4-6 6H4V8l6-6z" />
        <path {...common} d="M3 13l2-2" />
      </svg>
    );
  }
  if (id === 'pass') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <rect {...common} x="3" y="3" width="10" height="10" />
        <path {...common} d="M5 11L11 5" />
      </svg>
    );
  }
  if (id === 'zoom') {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
        <circle {...common} cx="7" cy="7" r="3.5" />
        <path {...common} d="M9.6 9.6L13 13" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-4 w-4">
      <path {...common} d="M4 8h8M8 4l-4 4 4 4" />
    </svg>
  );
}

export function CityToolPalette({
  tool,
  canCopy,
  canPaste,
  canUndo,
  onTool,
  onCopy,
  onCut,
  onUndo,
}: {
  tool: CityTool;
  canCopy: boolean;
  canPaste: boolean;
  canUndo: boolean;
  onTool: (tool: CityTool) => void;
  onCopy: () => void;
  onCut: () => void;
  onUndo: () => void;
}) {
  return (
    <div data-testid="city-tools" className="paint-box grid grid-cols-8 gap-1 p-1 lg:grid-cols-2" aria-label="City tools">
      {TOOLS.map(entry => {
        const pressed = !entry.action && tool === entry.id;
        const disabled = (entry.id === 'copy' || entry.id === 'cut') ? !canCopy
          : entry.id === 'paste' ? !canPaste
            : entry.id === 'undo' ? !canUndo
              : false;
        const onClick = () => {
          if (entry.id === 'copy') onCopy();
          else if (entry.id === 'cut') onCut();
          else if (entry.id === 'undo') onUndo();
          else onTool(entry.id);
        };
        return (
          <button
            key={entry.id}
            type="button"
            className="paint-btn flex h-11 w-full items-center justify-center lg:h-9"
            data-testid={`city-tool-${entry.id}`}
            aria-label={entry.label}
            aria-pressed={entry.action ? undefined : pressed}
            title={entry.label}
            disabled={disabled}
            onClick={onClick}
          >
            <ToolIcon id={entry.id} />
          </button>
        );
      })}
    </div>
  );
}

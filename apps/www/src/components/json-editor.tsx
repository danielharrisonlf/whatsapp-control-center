import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import CodeMirror from '@uiw/react-codemirror';
import { useTheme } from '@/lib/theme';

/** JSON editor with syntax highlighting and parse-error linting. */
export function JsonEditor({
  value,
  onChange,
  height = '420px',
  readOnly,
  ariaLabel = 'JSON editor',
}: {
  value: string;
  onChange?: (value: string) => void;
  height?: string;
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  const { resolved } = useTheme();
  return (
    <div className="overflow-hidden rounded-md border border-border-strong focus-within:border-accent focus-within:ring-3 focus-within:ring-ring/25">
      <CodeMirror
        value={value}
        height={height}
        theme={resolved}
        readOnly={readOnly}
        editable={!readOnly}
        onChange={onChange}
        extensions={[json(), linter(jsonParseLinter()), lintGutter()]}
        basicSetup={{ foldGutter: true, highlightActiveLine: !readOnly, autocompletion: false }}
        aria-label={ariaLabel}
      />
    </div>
  );
}
